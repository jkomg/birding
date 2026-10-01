import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function formatDate(value) {
  return value ? new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'
}

export default function OutingsPage() {
  const [outings, setOutings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/field-outings', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load outings')
      setOutings(data)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function removeOuting(outing) {
    if (!window.confirm(`Delete “${outing.title}” and all of its sightings? This cannot be undone.`)) return
    const response = await fetch(`/api/field-outings/${outing.id}`, { method: 'DELETE', credentials: 'include' })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Could not delete outing')
    setOutings(current => current.filter(item => item.id !== outing.id))
  }

  return (
    <div className="outings-page">
      <div className="page-header">
        <div><div className="eyebrow">Field notes</div><h1>Outings</h1><p className="page-subtitle">Your planned, active, and completed field sessions.</p></div>
        <Link className="hero-secondary-action" to="/outing/new">Start an outing <span>→</span></Link>
      </div>
      {error && <div className="notice error">{error}</div>}
      {loading ? <div className="loading">Loading outings...</div> : outings.length === 0 ? <div className="card empty-state"><div className="empty-icon">◌</div><h2>No field outings yet</h2><p>Start one when you are ready to go birding.</p><Link className="text-link" to="/outing/new">Start an outing <span>→</span></Link></div> : (
        <div className="outing-history-list">{outings.map(outing => <article className="card outing-history-card" key={outing.id}><div className="outing-history-main"><div className="outing-history-title"><h2>{outing.title}</h2><span className={`trip-plan-badge trip-plan-badge-${outing.status}`}>{outing.status}</span></div><div className="outing-history-meta">{formatDate(outing.started_at)} · {outing.location_name || 'Location not recorded'}</div><div className="outing-history-stats">{outing.species_count} species · {outing.observation_count} records{outing.planned_species?.length ? ` · ${outing.planned_species.length} targets` : ''}</div></div><div className="outing-history-actions"><Link className="secondary" to={`/outing/${outing.id}`}>{outing.status === 'active' ? 'Continue' : 'Open'}</Link><button className="danger-button" type="button" onClick={() => removeOuting(outing)}>Delete</button></div></article>)}</div>
      )}
    </div>
  )
}
