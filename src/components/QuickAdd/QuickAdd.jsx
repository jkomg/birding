import { useEffect, useState } from 'react'

const today = () => new Date().toISOString().slice(0, 10)

export default function QuickAdd({ onSaved, compact = false }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [form, setForm] = useState({
    common_name: '',
    location_name: '',
    count: 'X',
    observed_date: today(),
    observed_time: new Date().toTimeString().slice(0, 5),
    observation_details: ''
  })

  useEffect(() => {
    if (!open) return
    const handleKey = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function start() {
    setError('')
    setSaved('')
    setOpen(true)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/sightings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save sighting')
      setSaved(`${data.common_name} added to your sightings`)
      setForm(current => ({ ...current, common_name: '', count: 'X', observation_details: '' }))
      onSaved?.(data)
      window.setTimeout(() => setOpen(false), 900)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className={compact ? 'quick-add-trigger compact' : 'quick-add-trigger'} onClick={start}>
        <span className="quick-add-icon">＋</span>
        <span>{compact ? 'Log a bird' : 'Log a sighting'}</span>
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
            <div className="modal-header">
              <div>
                <div className="eyebrow">Quick capture</div>
                <h2 id="quick-add-title">What did you see?</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label htmlFor="quick-common-name">Species</label>
                <input id="quick-common-name" autoFocus required placeholder="e.g. Carolina Wren" value={form.common_name} onChange={event => update('common_name', event.target.value)} />
              </div>
              <div className="form-grid two-up">
                <div className="form-group">
                  <label htmlFor="quick-location">Where</label>
                  <input id="quick-location" placeholder="Backyard, park, trail..." value={form.location_name} onChange={event => update('location_name', event.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="quick-count">Count</label>
                  <input id="quick-count" inputMode="numeric" placeholder="X" value={form.count} onChange={event => update('count', event.target.value)} />
                </div>
              </div>
              <div className="form-grid two-up">
                <div className="form-group">
                  <label htmlFor="quick-date">Date</label>
                  <input id="quick-date" type="date" required value={form.observed_date} onChange={event => update('observed_date', event.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="quick-time">Time</label>
                  <input id="quick-time" type="time" value={form.observed_time} onChange={event => update('observed_time', event.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="quick-notes">Notes <span className="optional">optional</span></label>
                <textarea id="quick-notes" rows="3" placeholder="Song, behavior, field marks..." value={form.observation_details} onChange={event => update('observation_details', event.target.value)} />
              </div>
              {error && <div className="notice error">{error}</div>}
              {saved && <div className="notice success">{saved}</div>}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save sighting'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
