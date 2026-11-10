import { useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { Empty, Field, Notice, SeverityDot, Spinner } from '../components/ui.jsx'
import { inr, todayISO } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

/**
 * Intent parsing for the small supported command set.
 * Anything unmatched is reported honestly instead of being guessed at.
 */
export function parseCommand(raw, products = []) {
  const text = (raw || '').trim()
  const t = text.toLowerCase()
  if (!t) return null

  const addMatch = t.match(
    /(?:add|got|received|restock|deliver(?:y)?|stock\s+(?:in|up))\s+(\d+)\s*(?:no\.?|units?|packets?|pcs?|pieces?|bottles?|jars?|kg|kilos?|grams?|litres?|liters?|ml)?\s*(?:of|for)?\s*([a-z0-9 ()&-]+?)[.!?]*$/,
  )
  if (addMatch) {
    const qty = Number(addMatch[1])
    const query = addMatch[2].trim()
    const product = resolveProduct(query, products)
    return {
      intent: 'add_stock',
      qty,
      query,
      product,
      label: product
        ? `Add ${qty} ${product.unit}(s) to ${product.name}`
        : `Add ${qty} of “${query}” — product not matched`,
      ready: Boolean(product) && qty > 0,
    }
  }

  if (/(low\s*stock|out\s*of\s*stock|reorder|what\s*(?:do|i)\s*(?:need|to buy)|stock\s*status)/.test(t)) {
    return { intent: 'stock_alerts', label: 'Show low-stock alerts', ready: true }
  }
  if (/(follow.?ups?|customers?\s*(?:due|today)|due\s*(?:list|customers?))/.test(t)) {
    return { intent: 'followups', label: 'Show due follow-ups', ready: true }
  }
  // Read-only: today's recorded sales. Checked before the lookup pattern so
  // "how many did I sell today" is not mistaken for a product query.
  if (
    /(?:what\s+did\s+i\s+sell|sell\s+today|sold\s+today|today'?s?\s+sales?|sales?\s+(?:today|so\s+far)|how\s+much\s+(?:did\s+i\s+)?sell)/.test(
      t,
    )
  ) {
    return { intent: 'sales_today', label: "Show today's recorded sales", ready: true }
  }
  // Read-only: price / stock of one product ("price of tea", "how many packets of tea do I have").
  const lookupMatch = t.match(
    /^(?:what(?:'s| is| are)?\s+(?:the\s+)?(?:price|cost|stock|quantity|qty)\s+(?:of|for)\s+|(?:price|cost|stock|quantity|qty)\s+(?:of|for)\s+|how\s+(?:much|many)\s+(?:is|are|do\s+i\s+have|of)\s+|how\s+many\s+)(.+?)[.?]*$/,
  )
  if (lookupMatch) {
    const query = lookupMatch[1].trim()
    const product = resolveProduct(query, products)
    return {
      intent: 'product_lookup',
      query,
      product,
      label: product
        ? `Show price & stock for ${product.name}`
        : `Look up “${query}” — product not matched`,
      ready: Boolean(product),
    }
  }
  if (/(summaries|summary|brief|report|how\s*(?:am|i|my shop)|today.*sales|business.*today)/.test(t)) {
    return { intent: 'daily_brief', label: 'Show daily advisor brief', ready: true }
  }

  return { intent: 'unknown', label: 'Command not recognised', ready: false, query: text }
}

function resolveProduct(query, products) {
  let q = (query || '').trim().toLowerCase()
  if (!q) return null
  // Strip filler so "packets of tea do I have" still finds "Tea 500g".
  q = q
    .replace(/\b(do i have|have i got|is there|are there|today|now)\b/g, ' ')
    .replace(
      /\b(packets?|units?|pcs|pieces?|bottles?|jars?|kilos?|kg|grams?|litres?|liters?|ml|nos?|numbers?)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (!q) return null
  return (
    products.find((p) => p.name.toLowerCase() === q) ||
    products.find((p) => p.name.toLowerCase().startsWith(q)) ||
    products.find((p) => p.name.toLowerCase().includes(q)) ||
    products.find((p) => q.includes(p.name.toLowerCase())) ||
    null
  )
}

const SAMPLES = [
  'Add 6 packets of tea',
  'Show my daily summary',
  'What is low in stock?',
  'Show follow-ups due',
  'Price of tea',
  'What did I sell today',
]

// Safety cap so a forgotten recording cannot run forever.
const MAX_RECORD_MS = 20000

/**
 * Convert a recorded clip to 16 kHz mono 16-bit PCM WAV — a container every
 * speech API accepts, regardless of what the browser's MediaRecorder emits
 * (webm/opus in Chrome, mp4/aac in Safari).
 */
async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer)
    const rate = 16000
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
    const source = off.createBufferSource()
    source.buffer = decoded
    source.connect(off.destination)
    source.start()
    const rendered = await off.startRendering()
    const samples = rendered.getChannelData(0)

    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, rate, true) // sample rate
    view.setUint32(28, rate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample
    writeStr(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    let offset = 44
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    return new Blob([buffer], { type: 'audio/wav' })
  } finally {
    ctx.close?.()
  }
}

export default function VoiceDukaan() {
  const products = useAsync(() => api.products())
  const alerts = useAsync(() => api.stockAlerts())

  const [supported] = useState(
    () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder),
  )
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recUrl, setRecUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState(null)
  const [speak, setSpeak] = useState(false)
  const [busy, setBusy] = useState(false)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const recUrlRef = useRef('')
  const noticeTimerRef = useRef(null)

  const productList = useMemo(() => products.data ?? [], [products.data])

  function flash(kind, text) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice({ kind, text })
    if (kind === 'ok') {
      noticeTimerRef.current = setTimeout(() => setNotice(null), 5000)
    }
  }

  function interpret(text) {
    const interpretation = parseCommand(text, productList)
    setParsed(interpretation)
    setResult(null)
    if (!interpretation) setNotice(null)
    if (interpretation && !interpretation.ready) {
      flash('err', 'That command needs a matching product — try the typed box with the exact product name.')
    }
    return interpretation
  }

  function startRecording() {
    if (!supported) {
      flash('err', 'Audio recording is not available in this browser — type your command below instead.')
      return
    }
    setNotice({ kind: 'info', text: 'Recording… speak one short command, then press Stop.' })
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream
        const mime = ['audio/webm', 'audio/mp4'].find(
          (m) => window.MediaRecorder.isTypeSupported?.(m),
        )
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        chunksRef.current = []
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size) chunksRef.current.push(e.data)
        }
        rec.onstop = () => handleRecordingStop(rec)
        recorderRef.current = rec
        rec.start()
        setRecording(true)
        noticeTimerRef.current = setTimeout(() => {
          if (recorderRef.current && recorderRef.current.state === 'recording') stopRecording()
        }, MAX_RECORD_MS)
      })
      .catch(() => {
        setRecording(false)
        flash('err', 'Microphone permission is needed to record — you can type the command instead.')
      })
  }

  function stopRecording() {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else setRecording(false)
  }

  async function handleRecordingStop(rec) {
    setRecording(false)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const raw = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (!raw.size) {
      flash('err', 'No audio was captured — please try again.')
      return
    }

    // Upload WAV (universally accepted); fall back to the raw clip.
    let uploadBlob = raw
    let filename = 'recording.wav'
    try {
      uploadBlob = await blobToWav(raw)
    } catch {
      const ext = (rec.mimeType || 'audio/webm').split('/')[1]?.split(';')[0] || 'webm'
      filename = `recording.${ext.replace(/[^a-z0-9]/gi, '')}`
    }
    if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current)
    recUrlRef.current = URL.createObjectURL(uploadBlob)
    setRecUrl(recUrlRef.current)

    setTranscribing(true)
    setNotice({ kind: 'info', text: 'Transcribing your recording…' })
    try {
      const { text } = await api.transcribe(uploadBlob, filename)
      const clean = (text || '').trim()
      if (!clean) {
        flash('err', 'No speech was detected in the recording — please try again or type below.')
        return
      }
      setTranscript(clean)
      flash('ok', `Transcribed: “${clean}”`)
      interpret(clean)
    } catch (err) {
      flash('err', err.message)
    } finally {
      setTranscribing(false)
    }
  }

  function speakText(text) {
    if (!speak || !('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-IN'
    utterance.rate = 1.02
    window.speechSynthesis.speak(utterance)
  }

  async function confirmAction() {
    if (!parsed || !parsed.ready) return
    setBusy(true)
    try {
      if (parsed.intent === 'add_stock') {
        const res = await api.adjustStock({
          product_id: parsed.product.id,
          quantity_change: parsed.qty,
          reason: 'Voice entry (confirmed)',
        })
        setResult({ kind: 'ok', title: 'Stock updated', lines: [res.message] })
        flash('ok', res.message)
        speakText(res.message)
        alerts.reload()
        products.reload()
      } else if (parsed.intent === 'daily_brief') {
        const brief = await api.dailyBrief()
        setResult({
          kind: 'info',
          title: brief.headline,
          lines: [brief.summary, ...brief.signals.map((s) => `• ${s.title} — ${s.action}`)],
        })
        speakText(brief.summary)
      } else if (parsed.intent === 'stock_alerts') {
        const data = await api.stockAlerts()
        setResult({
          kind: data.count ? 'warn' : 'ok',
          title: data.count ? `${data.count} item(s) below your alert level` : 'No low stock',
          lines: data.count
            ? data.alerts.map((a) => `• ${a.name}: ${a.quantity} left (alert at ${a.min_threshold})`)
            : ['Everything is above your alert level.'],
        })
        speakText(data.count ? `${data.count} items need attention` : 'No low stock right now')
      } else if (parsed.intent === 'followups') {
        const list = await api.followups('due')
        setResult({
          kind: list.length ? 'warn' : 'ok',
          title: list.length ? `${list.length} follow-up(s) due` : 'No follow-ups due',
          lines: list.length
            ? list.map(
                (f) =>
                  `• ${f.customer_name} — due ${f.due_date}${f.overdue ? ' (overdue)' : ''}`,
              )
            : ['Your due queue is clear.'],
        })
        speakText(list.length ? `${list.length} follow-ups are due` : 'No follow-ups due')
      } else if (parsed.intent === 'sales_today') {
        const list = await api.sales(todayISO())
        const revenue = list.reduce((sum, s) => sum + s.unit_price * s.quantity, 0)
        setResult({
          kind: list.length ? 'info' : 'ok',
          title: list.length
            ? `${list.length} sale(s) today · ${inr(revenue)} revenue`
            : 'No sales recorded today',
          lines: list.length
            ? list.map(
                (s) =>
                  `• ${s.quantity} × ${s.product_name || `#${s.product_id}`} @ ${inr(s.unit_price)} = ${inr(s.unit_price * s.quantity)}`,
              )
            : ['Record a sale in ProfitGuard to see it here.'],
        })
        speakText(
          list.length
            ? `You recorded ${list.length} sales today, total ${inr(revenue)}`
            : 'No sales recorded today',
        )
      } else if (parsed.intent === 'product_lookup') {
        const p = parsed.product
        const margin =
          p.purchase_cost != null && p.selling_price != null && p.selling_price > 0
            ? Math.round(((p.selling_price - p.purchase_cost) / p.selling_price) * 1000) / 10
            : null
        const low = p.quantity <= p.min_threshold
        setResult({
          kind: low ? 'warn' : 'ok',
          title: p.name,
          lines: [
            `• Selling price: ${p.selling_price != null ? inr(p.selling_price, { decimals: 2 }) : 'not set'} per ${p.unit}`,
            `• Purchase cost: ${p.purchase_cost != null ? inr(p.purchase_cost, { decimals: 2 }) : 'not set'}`,
            `• In stock: ${p.quantity} ${p.unit}(s) · alert level ${p.min_threshold}`,
            `• Estimated gross margin: ${margin != null ? `${margin}%` : 'not enough data'}`,
            low ? '⚠ At or below your alert level — consider restocking.' : 'Above your alert level.',
          ],
        })
        speakText(`${p.name}: ${p.quantity} in stock`)
      }
      setParsed(null)
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="panel-title">Module</div>
          <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>VoiceDukaan</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4, maxWidth: 660 }}>
            A simpler way to use the dashboard: press Speak and say a short command — the
            audio is recorded and transcribed for you. Check the transcript, correct it if
            needed — nothing is saved until you confirm.
          </p>
        </div>
        <span className={`badge ${supported ? 'badge-ok' : 'badge-mute'}`}>
          {supported ? 'record + transcribe ready' : 'typed input only'}
        </span>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {products.error ? <Notice kind="err">{products.error}</Notice> : null}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        {/* Voice capture */}
        <section className="card">
          <div className="panel-title">Voice capture</div>

          <div style={{ display: 'grid', placeItems: 'center', padding: '1.4rem 0 0.6rem' }}>
            <button
              className="btn"
              onClick={recording || transcribing ? stopRecording : startRecording}
              disabled={!supported || busy || transcribing}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              style={{
                width: 108,
                height: 108,
                borderRadius: '50%',
                flexDirection: 'column',
                gap: 4,
                fontSize: '0.82rem',
                fontWeight: 700,
                background: recording ? 'var(--danger)' : 'var(--brand)',
                color: '#fff',
                opacity: !supported || transcribing ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                {transcribing ? '…' : recording ? '■' : '🎤'}
              </span>
              {transcribing ? 'Working' : recording ? 'Stop' : 'Speak'}
            </button>
            <p className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
              {supported
                ? 'Press Speak, say one short command, then Stop — the audio is transcribed for you.'
                : 'This browser cannot record audio — type your command below instead.'}
            </p>
          </div>

          {recUrl ? (
            <div style={{ marginBottom: 10 }}>
              <div className="label">Your recording</div>
              <audio controls src={recUrl} style={{ width: '100%', marginTop: 4 }} />
            </div>
          ) : null}

          <Field label="Transcript (editable before saving)">
            <textarea
              className="textarea"
              value={transcript}
              placeholder="e.g. Add 6 packets of tea"
              onChange={(e) => {
                setTranscript(e.target.value)
                setParsed(null)
              }}
              style={{ minHeight: 64 }}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => interpret(transcript)} disabled={!transcript.trim()}>
              Interpret command
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setTranscript('')
                setParsed(null)
                setResult(null)
                setNotice(null)
                if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current)
                recUrlRef.current = ''
                setRecUrl('')
              }}
            >
              Clear
            </button>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
              <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
              Read replies aloud
            </label>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
            <div className="label">Try one of these</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => {
                    setTranscript(s)
                    interpret(s)
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Interpretation + confirm */}
        <section className="card">
          <div className="panel-title">Interpreted command</div>
          {!parsed ? (
            <Empty icon="◉" title="Nothing to confirm yet">
              Speak or type a command — the interpretation appears here before any change is made.
            </Empty>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${parsed.ready ? 'badge-info' : 'badge-crit'}`}>
                  {parsed.intent.replace('_', ' ')}
                </span>
                <strong style={{ fontSize: '0.95rem' }}>{parsed.label}</strong>
              </div>

              {parsed.intent === 'add_stock' && parsed.product ? (
                <div className="card card-tight" style={{ marginTop: 10, background: '#fdfbf7' }}>
                  <div style={{ fontSize: '0.9rem' }}>
                    <strong>{parsed.product.name}</strong>
                    <div className="hint" style={{ marginTop: 4 }}>
                      Current stock: {parsed.product.quantity} {parsed.product.unit}(s) → after
                      confirm: {parsed.product.quantity + parsed.qty} {parsed.product.unit}(s)
                    </div>
                    <div className="hint">
                      Reason recorded: “Voice entry (confirmed)”
                    </div>
                  </div>
                </div>
              ) : null}

              {parsed.intent === 'product_lookup' && parsed.product ? (
                <div className="card card-tight" style={{ marginTop: 10, background: '#fdfbf7' }}>
                  <div style={{ fontSize: '0.9rem' }}>
                    <strong>{parsed.product.name}</strong>
                    <div className="hint" style={{ marginTop: 4 }}>
                      Read-only lookup — nothing will be changed or saved.
                    </div>
                  </div>
                </div>
              ) : null}

              {parsed.intent === 'unknown' ? (
                <p className="hint" style={{ marginTop: 8 }}>
                  Supported: add stock (“Add 6 packets of tea”), daily summary, low-stock
                  check, follow-up list, product lookup (“Price of tea”), today's sales
                  (“What did I sell today”).
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={confirmAction} disabled={!parsed.ready || busy}>
                  {busy
                    ? 'Working…'
                    : parsed.intent === 'add_stock'
                      ? 'Confirm & save'
                      : 'Show result'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setParsed(null)
                    setResult(null)
                  }}
                >
                  Cancel
                </button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Financial or stock changes are never saved silently — confirmation is required.
              </p>
            </div>
          )}
        </section>

        {/* Result */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-title">Response</div>
          {!result ? (
            <Empty icon="→" title="No response yet">
              Confirmed actions and advisor answers will be shown here.
            </Empty>
          ) : (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              <strong>{result.title}</strong>
              {result.lines.map((line, i) => (
                <p key={i} style={{ fontSize: '0.9rem' }} className={line.startsWith('•') ? 'muted' : ''}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Typed fallback */}
      <section className="card">
        <div className="panel-title">Typed fallback</div>
        <p className="hint" style={{ marginTop: 4 }}>
          Available when microphone access, language support or recognition is unavailable —
          the same parser, the same confirmation step.
        </p>
        <form
          style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault()
            interpret(transcript)
          }}
        >
          <input
            className="input"
            style={{ flex: '1 1 260px' }}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type a command, e.g. Add 4 packets of tea"
          />
          <button className="btn btn-primary" disabled={!transcript.trim()}>
            Interpret
          </button>
        </form>
      </section>

      {alerts.loading && !alerts.data ? <Spinner label="Loading stock…" /> : null}
    </div>
  )
}
