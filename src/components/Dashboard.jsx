import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useUsers, useUserFilter, getScopeLabel } from '../App.jsx'
import QuickAdd from './QuickAdd/QuickAdd.jsx'

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Dashboard() {
  const { user } = useAuth()
  const users = useUsers()
  const { filter } = useUserFilter()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [activeOuting, setActiveOuting] = useState(null)
  const [plannedTrips, setPlannedTrips] = useState([])

  useEffect(() => {
    let active = true
    setError('')
    fetch(`/api/dashboard?user=${filter}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Could not load today')))
      .then(next => active && setData(next))
      .catch(err => active && setError(err.message))
    return () => { active = false }
  }, [filter, refresh])

  useEffect(() => {
    fetch('/api/field-outings/current', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(setActiveOuting)
      .catch(() => setActiveOuting(null))
  }, [refresh])

  useEffect(() => {
    fetch('/api/trips', { credentials: 'include' })
      .then(response => response.ok ? response.json() : [])
      .then(plans => setPlannedTrips((Array.isArray(plans) ? plans : []).filter(plan => plan.status !== 'done').slice(0, 3)))
      .catch(() => setPlannedTrips([]))
  }, [refresh])

  if (error) return <div className="empty-state"><div className="empty-icon">!</div><h2>Today is unavailable</h2><p>{error}</p><button onClick={() => setRefresh(value => value + 1)}>Try again</button></div>
  if (!data) return <div className="loading"><div className="loading-pulse" />Loading your birding day...</div>

  const me = data.per_user.find(item => item.username === user?.username)
  const other = data.per_user.find(item => item.username !== user?.username)
  const scopeLabel = getScopeLabel(filter, user, users)
  const latest = data.recent_sightings.slice(0, 5)
  const todayCount = data.recent_sightings.filter(item => item.observed_date === new Date().toISOString().slice(0, 10)).length

  return (
    <div className="today-page">
      <section className="today-hero">
        <div className="hero-copy">
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1>Good birding, {user?.display_name?.split(' ')[0] || 'friend'}.</h1>
          <p>{scopeLabel}. Keep the day moving by logging what you notice as it happens.</p>
          <div className="hero-actions">
            <QuickAdd onSaved={() => setRefresh(value => value + 1)} />
            <Link className="hero-secondary-action" to="/outing/new">Start an outing <span>→</span></Link>
            <Link className="hero-secondary-action" to="/trips">Plan an outing <span>→</span></Link>
          </div>
        </div>
        <div className="hero-bird" aria-hidden="true">✦</div>
      </section>

      {activeOuting && <Link className="active-outing-banner" to={`/outing/${activeOuting.id}`}><span className="active-pulse" /><span><strong>Outing in progress: {activeOuting.title}</strong><small>{activeOuting.location_name || 'Location not set'} · {activeOuting.observation_count} records</small></span><span className="active-arrow">Continue →</span></Link>}

      {plannedTrips.length > 0 && <section className="card planned-trips-card"><div className="section-heading"><div><div className="eyebrow">Ready when you are</div><h2>Planned outings</h2></div><Link to="/trips">Manage all <span>→</span></Link></div><div className="planned-trips-list">{plannedTrips.map(plan => <div className="planned-trip-row" key={plan.id}><div><strong>{plan.title}</strong><small>{plan.trip_date}{plan.target_area ? ` · ${plan.target_area}` : ''}</small></div><Link className="text-link" to={`/trips?plan=${plan.id}`}>Open plan <span>→</span></Link></div>)}</div></section>}

      <section className="stats-grid today-stats">
        <div className="stat-card stat-card-featured"><div className="stat-label">Your species</div><div className="stat-value">{me?.species_count ?? 0}</div><div className="stat-caption">life list</div></div>
        <div className="stat-card"><div className="stat-label">This view</div><div className="stat-value">{data.shared_species}</div><div className="stat-caption">shared species</div></div>
        <div className="stat-card"><div className="stat-label">Today</div><div className="stat-value">{todayCount}</div><div className="stat-caption">recent records</div></div>
        {other && <div className="stat-card stat-card-muted"><div className="stat-label">{other.display_name}</div><div className="stat-value">{other.species_count}</div><div className="stat-caption">species seen</div></div>}
      </section>

      <div className="today-columns">
        <section className="card recent-card">
          <div className="section-heading"><div><div className="eyebrow">Your field notes</div><h2>Recent sightings</h2></div><Link to="/timeline">See all <span>→</span></Link></div>
          {latest.length === 0 ? (
            <div className="empty-inline"><span className="empty-inline-icon">◌</span><div><strong>Your list starts here.</strong><p>Log your first bird or import your eBird history.</p></div></div>
          ) : (
            <div className="sighting-list">
              {latest.map(sighting => (
                <button key={sighting.id} className="sighting-row" type="button" onClick={() => navigate(`/species/${encodeURIComponent(sighting.species_code || sighting.common_name)}`)}>
                  <span className="sighting-mark">{sighting.source === 'manual' ? '✦' : '↗'}</span>
                  <span className="sighting-main"><strong>{sighting.common_name}</strong><span>{sighting.location_name || 'Location not recorded'}</span></span>
                  <span className="sighting-meta"><strong>{formatDate(sighting.observed_date)}</strong><span>{sighting.display_name}</span></span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="today-side-column">
          <section className="card next-card"><div className="eyebrow">Keep exploring</div><h2>Make the next outing count.</h2><p>Use your past sightings to choose a place, set targets, and keep a simple field plan.</p><Link className="text-link" to="/trips">Open trip planner <span>→</span></Link></section>
          <section className="card source-card"><div className="source-icon">↗</div><div><strong>eBird connection</strong><p>{user?.last_synced_at ? `Last checked ${new Date(user.last_synced_at).toLocaleDateString()}.` : 'Connect eBird to bring in your history.'}</p></div><Link to={user?.last_synced_at ? '/settings' : '/import'}>{user?.last_synced_at ? 'Manage' : 'Get started'} <span>→</span></Link></section>
        </aside>
      </div>
    </div>
  )
}
