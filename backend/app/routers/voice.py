"""VoiceDukaan: accept a recorded audio file and return its transcription."""

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services import transcribe as transcribe_service

router = APIRouter(prefix="/api/voice", tags=["voice"])

# ~1 minute of 16-bit mono audio is well under this; keeps uploads sane.
MAX_AUDIO_BYTES = 5 * 1024 * 1024


@router.post("/transcribe")
def transcribe(file: UploadFile = File(...)):
    """Transcribe a recorded speech clip (multipart field name: `file`).

    Returns {"text": "..."} — the merchant still reviews the transcript and
    confirms before anything is saved (same flow as typed input).
    """
    content_type = (file.content_type or "").strip()
    if not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=422,
            detail="Please upload an audio recording (audio/*).",
        )

    audio = file.file.read(MAX_AUDIO_BYTES + 1)
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Recording is too large — keep it under ~5 MB (about a minute).",
        )
    if not audio:
        raise HTTPException(
            status_code=422,
            detail="The recording is empty.",
        )

    try:
        text = transcribe_service.transcribe_audio(audio, content_type.split(";")[0])
    except transcribe_service.TranscribeError as exc:
        # 502: the audio reached us but transcription failed upstream.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"text": text}
