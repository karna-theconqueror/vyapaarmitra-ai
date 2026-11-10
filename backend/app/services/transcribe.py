"""VoiceDukaan transcription: recorded audio -> text via the Gemini API.

The browser records the merchant's speech (MediaRecorder) and uploads it
here; this service asks Gemini to transcribe it. The transcript is then
interpreted by the same parser as typed input, and nothing is saved without
confirmation.

Configuration is read from the environment at call time:

    TRANSCRIBE_API_KEY  (falls back to GEMINI_API_KEY, then ADVISOR_LLM_KEY)
    TRANSCRIBE_MODEL    (default: gemini-3.5-transcribe)

Without a key the endpoint fails with a clear message and the typed
fallback keeps working.
"""

import base64
import json
import os
import urllib.error
import urllib.request

# Dedicated speech-to-text model; falls back to a general flash model that
# also accepts audio if the primary is unavailable (quota, deprecation).
DEFAULT_MODEL = "gemini-3.5-transcribe"
FALLBACK_MODELS = ("gemini-3.8-flash",)

GOOGLE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

PROMPT = (
    "Transcribe this speech exactly as spoken, preserving numbers and product "
    "names. Output only the transcription."
)


class TranscribeError(Exception):
    """Raised with a user-facing message when transcription fails."""


def _config() -> tuple[str, list[str]]:
    key = (
        os.getenv("TRANSCRIBE_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("ADVISOR_LLM_KEY", "").strip()
    )
    primary = os.getenv("TRANSCRIBE_MODEL", "").strip() or DEFAULT_MODEL
    models = [primary] + [m for m in FALLBACK_MODELS if m != primary]
    return key, models


def _extract_text(body: object) -> str | None:
    """Pull the transcript out of either response shape:

    - gemini-3.5-transcribe -> {"audioTranscription": {"text": ...}}
    - general models        -> {"text": ...}
    """
    try:
        parts = body["candidates"][0]["content"]["parts"]  # type: ignore[index]
    except (KeyError, IndexError, TypeError):
        return None
    chunks: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        audio = part.get("audioTranscription")
        if isinstance(audio, dict) and audio.get("text"):
            chunks.append(str(audio["text"]))
        elif part.get("text"):
            chunks.append(str(part["text"]))
    return "".join(chunks).strip() or None


def transcribe_audio(audio: bytes, mime_type: str) -> str:
    """Return the transcription of `audio` (bytes in `mime_type`).

    Raises TranscribeError with a message safe to show the merchant.
    """
    key, models = _config()
    if not key:
        raise TranscribeError(
            "Voice transcription is not configured on this server "
            "(set TRANSCRIBE_API_KEY or GEMINI_API_KEY). Type the command instead."
        )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(audio).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {"max_output_tokens": 1000},
    }
    encoded = json.dumps(payload).encode("utf-8")

    last_error = "no model tried"
    for model in models:
        for attempt in (1, 2):
            url = GOOGLE_URL.format(model=model, key=key)
            request = urllib.request.Request(
                url,
                data=encoded,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    body = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8", "replace")[:200]
                except Exception:  # noqa: BLE001 - best-effort detail only
                    pass
                last_error = f"{model}: HTTP {exc.code} {detail}"
                # 400/404 mean the model itself is unusable — don't retry it.
                if exc.code in (400, 404):
                    break
                # 429/5xx: one retry, then fall through to the next model.
                if attempt == 2:
                    break
                continue
            except Exception as exc:  # noqa: BLE001 - any network failure
                last_error = f"{model}: {type(exc).__name__}"
                if attempt == 2:
                    break
                continue

            text = _extract_text(body)
            if text:
                return text
            # Successful call but no words (e.g. silence) — no point retrying.
            raise TranscribeError(
                "No speech was detected in the recording. Try again and speak "
                "clearly, or type the command instead."
            )
        # fall through to the next model

    raise TranscribeError(
        f"Could not transcribe the recording ({last_error}). "
        "Type the command instead."
    )
