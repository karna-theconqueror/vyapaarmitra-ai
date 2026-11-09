import { useState } from 'react'
import { api } from '../api.js'
import { Empty, Field, Modal, Notice, Spinner } from '../components/ui.jsx'
import { dateLabel, todayISO } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

export default function Customers() {
  const due = useAsync(() => api.followups('due'))
  const done = useAsync(() => api.followups('done'))
  const all = useAsync(() => api.followups('all'))
  const customers = useAsync(() => api.customers())

  const [tab, setTab] = useState('due')
  const [notice, setNotice] = useState(null)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showSchedule, setShowSchedule] = useState(null)
  const [busy, setBusy] = useState(false)

  const [customerForm, setCustomerForm] = useState({ name: '', contact: '', purchase_note: '' })
  const [scheduleForm, setScheduleForm] = useState({
    due_date: todayISO(),
    message: '',
  })
  const [completion, setCompletion] = useState(null) // { id, note }

  function flash(kind, text) {
    setNotice({ kind, text })
    if (kind === 'ok') setTimeout(() => setNotice(null), 4500)
  }

  async function submitCustomer(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createCustomer({
        name: customerForm.name.trim(),
        contact: customerForm.contact.trim() || null,
        purchase_note: customerForm.purchase_note.trim() || null,
      })
      flash('ok', `${customerForm.name.trim()} added.`)
      setCustomerForm({ name: '', contact: '', purchase_note: '' })
      setShowCustomer(false)
      customers.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitSchedule(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createFollowup({
        customer_id: showSchedule.id,
        due_date: scheduleForm.due_date,
        message: scheduleForm.message.trim() || null,
      })
      flash('ok', `Follow-up scheduled for ${showSchedule.name}.`)
      setShowSchedule(null)
      setScheduleForm({ due_date: todayISO(), message: '' })
      due.reload()
      all.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveMessage(followUp, message) {
    try {
      await api.updateFollowup(followUp.id, { message })
      flash('ok', 'Message template updated.')
      due.reload()
      all.reload()
    } catch (err) {
      flash('err', err.message)
    }
  }

  async function complete() {
    setBusy(true)
    try {
      await api.completeFollowup(completion.id, { outcome_note: completion.note || null })
      flash('ok', 'Follow-up marked complete.')
      setCompletion(null)
      due.reload()
      done.reload()
      all.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function copyMessage(text) {
    try {
      await navigator.clipboard.writeText(text)
      flash('ok', 'Message copied — paste it into your usual app to send manually.')
    } catch {
      flash('err', 'Could not copy automatically — select the text and copy it.')
    }
  }

  const dueList = due.data ?? []
  const doneList = done.data ?? []
  const customerList = customers.data ?? []

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
          <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>Customer Comeback</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4, maxWidth: 640 }}>
            A due list and editable messages — you send them yourself. No bulk messaging, no
            customer profiling.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowCustomer(true)}>
            + Add customer
          </button>
          <button
            className="btn btn-primary"
            onClick={() => customerList[0] && setShowSchedule(customerList[0])}
            disabled={!customerList.length}
            title={customerList.length ? '' : 'Add a customer first'}
          >
            + Schedule follow-up
          </button>
        </div>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {due.error ? <Notice kind="err">{due.error}</Notice> : null}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
        {[
          ['due', `Due queue (${dueList.length})`],
          ['all', `All follow-ups (${(all.data ?? []).length})`],
          ['customers', `Customers (${customerList.length})`],
          ['done', `Completed (${doneList.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            className="btn"
            onClick={() => setTab(key)}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: tab === key ? 'var(--brand-soft)' : 'transparent',
              color: tab === key ? 'var(--brand-dark)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'due' &&
        (due.loading && !due.data ? (
          <Spinner label="Loading due queue…" />
        ) : dueList.length === 0 ? (
          <div className="card">
            <Empty title="No follow-ups due">
              Schedule one from the Customers tab when a regular needs a nudge.
            </Empty>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
            {dueList.map((f) => (
              <FollowUpCard
                key={f.id}
                followUp={f}
                onCopy={copyMessage}
                onEdit={(text) => saveMessage(f, text)}
                onComplete={() => setCompletion({ id: f.id, note: '' })}
              />
            ))}
          </div>
        ))}

      {tab === 'all' && (
        <div className="card">
          <Table
            headers={['Customer', 'Due', 'Status', 'Message']}
            rows={(all.data ?? []).map((f) => [
              f.customer_name,
              dateLabel(f.due_date),
              f.status === 'done' ? (
                <span className="badge badge-ok">done</span>
              ) : f.overdue ? (
                <span className="badge badge-crit">overdue</span>
              ) : (
                <span className="badge badge-warn">due</span>
              ),
              <span className="muted" style={{ fontSize: '0.84rem' }}>{f.message || '—'}</span>,
            ])}
            empty="No follow-ups yet."
            loading={all.loading && !all.data}
          />
        </div>
      )}

      {tab === 'customers' && (
        <div className="card">
          <Table
            headers={['Customer', 'Contact', 'Purchase note', '']}
            rows={customerList.map((c) => [
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                <strong>{c.name}</strong>
              </div>,
              <span className="muted">{c.contact || '—'}</span>,
              <span className="muted" style={{ fontSize: '0.85rem' }}>{c.purchase_note || '—'}</span>,
              <button
                className="btn btn-ghost"
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                onClick={() => {
                  setShowSchedule(c)
                  setScheduleForm({ due_date: todayISO(), message: '' })
                }}
              >
                Schedule
              </button>,
            ])}
            empty="No customers yet — keep notes minimal: name, optional contact, purchase note."
            loading={customers.loading && !customers.data}
          />
        </div>
      )}

      {tab === 'done' && (
        <div className="card">
          <Table
            headers={['Customer', 'Due date', 'Completed', 'Outcome']}
            rows={doneList.map((f) => [
              f.customer_name,
              dateLabel(f.due_date),
              f.completed_at
                ? new Date(f.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '—',
              <span className="muted">{f.outcome_note || 'No note recorded'}</span>,
            ])}
            empty="Nothing completed yet."
            loading={done.loading && !done.data}
          />
        </div>
      )}

      {/* Add customer */}
      {showCustomer ? (
        <Modal title="Add customer (minimal details)" onClose={() => setShowCustomer(false)}>
          <form onSubmit={submitCustomer} style={{ display: 'grid', gap: 10 }}>
            <Field label="Name or nickname *">
              <input
                className="input"
                required
                value={customerForm.name}
                onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Lakshmi"
                maxLength={120}
              />
            </Field>
            <Field label="Contact (optional)" hint="Only store what you need, with permission">
              <input
                className="input"
                value={customerForm.contact}
                onChange={(e) => setCustomerForm((f) => ({ ...f, contact: e.target.value }))}
                placeholder="phone or none"
                maxLength={60}
              />
            </Field>
            <Field label="Purchase note (optional)">
              <textarea
                className="textarea"
                value={customerForm.purchase_note}
                onChange={(e) => setCustomerForm((f) => ({ ...f, purchase_note: e.target.value }))}
                placeholder="e.g. buys milk most mornings"
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Add customer'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowCustomer(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Schedule follow-up */}
      {showSchedule ? (
        <Modal title={`Schedule follow-up — ${showSchedule.name}`} onClose={() => setShowSchedule(null)}>
          <form onSubmit={submitSchedule} style={{ display: 'grid', gap: 10 }}>
            <Field label="Due date *">
              <input
                className="input"
                type="date"
                required
                value={scheduleForm.due_date}
                onChange={(e) => setScheduleForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </Field>
            <Field label="Message template" hint="Editable — you copy and send it yourself">
              <textarea
                className="textarea"
                value={scheduleForm.message}
                onChange={(e) => setScheduleForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Namaste! A gentle reminder — your usual order is in stock."
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Scheduling…' : 'Schedule follow-up'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowSchedule(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Complete follow-up */}
      {completion ? (
        <Modal title="Mark follow-up complete" onClose={() => setCompletion(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Outcome note (optional)" hint="What happened? Shown in the Completed tab">
              <textarea
                className="textarea"
                value={completion.note}
                onChange={(e) => setCompletion((c) => ({ ...c, note: e.target.value }))}
                placeholder="e.g. Confirmed weekly milk order"
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={complete} disabled={busy}>
                {busy ? 'Saving…' : 'Mark complete'}
              </button>
              <button className="btn btn-ghost" onClick={() => setCompletion(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function FollowUpCard({ followUp, onCopy, onEdit, onComplete }) {
  const [text, setText] = useState(followUp.message || '')
  const [editing, setEditing] = useState(false)

  return (
    <article className="card" style={{ borderColor: followUp.overdue ? '#f6d4d4' : 'var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="avatar">{followUp.customer_name?.slice(0, 1).toUpperCase()}</span>
        <strong>{followUp.customer_name}</strong>
        <span className={`badge ${followUp.overdue ? 'badge-crit' : 'badge-warn'}`}>
          {followUp.overdue ? 'overdue' : 'due'}
        </span>
        <span className="hint" style={{ marginLeft: 'auto' }}>{dateLabel(followUp.due_date)}</span>
      </div>

      {followUp.customer_contact ? (
        <p className="hint" style={{ marginTop: 6 }}>Contact: {followUp.customer_contact}</p>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <div className="label">Message template</div>
        {editing ? (
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        ) : (
          <p style={{ fontSize: '0.88rem', background: '#fdfbf7', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.7rem' }}>
            {text || 'No message yet.'}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }} onClick={() => onComplete()}>
          Mark complete
        </button>
        <button className="btn btn-ghost" style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }} onClick={() => onCopy(text)}>
          Copy message
        </button>
        {editing ? (
          <button
            className="btn btn-ghost"
            style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }}
            onClick={() => {
              onEdit(text)
              setEditing(false)
            }}
          >
            Save template
          </button>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Sending is manual by design — no automatic or bulk messaging.
      </p>
    </article>
  )
}

function Table({ headers, rows, empty, loading }) {
  if (loading) return <Spinner label="Loading…" />
  if (!rows.length) return <Empty title="Nothing here yet">{empty}</Empty>
  return (
    <div style={{ overflowX: 'auto', marginTop: 6 }}>
      <table className="table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
