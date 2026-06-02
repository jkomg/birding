import { useState, useEffect } from 'react'
import { useUserFilter } from '../../App.jsx'

export default function Timeline() {
  const { filter } = useUserFilter()
  const [outings, setOutings] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/outings?user=${filter}&limit=50`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setOutings(d); setLoading(false) })
  }, [filter])

  async function toggleOuting(subId) {
    if (expanded === subId) { setExpanded(null); return }
    setExpanded(subId)
    if (!detail[subId]) {
      const r = await fetch(`/api/outings/${subId}`, { credentials: 'include' })
      const d = await r.json()
      setDetail(prev => ({ ...prev, [subId]: d }))
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Timeline</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Checklist-style outings, grouped by trip.</div>
        </div>
      </div>
      {outings.map(o => (
        <div className="card timeline-card" key={`${o.submission_id}-${o.username}`} style={{ cursor: 'pointer' }}>
          <div onClick={() => toggleOuting(o.submission_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{o.observed_date}{o.observed_time ? ` at ${o.observed_time}` : ''}</div>
              <div style={{ color: '#5a7a5a', fontSize: '0.875rem' }}>{o.location_name}</div>
              {o.state_province && <div style={{ color: '#5a7a5a', fontSize: '0.8rem' }}>{o.state_province}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, color: '#2d6a4f' }}>{o.species_count} species</div>
              <div style={{ fontSize: '0.8rem', color: '#5a7a5a' }}>{o.display_name}</div>
              {o.duration_min && <div style={{ fontSize: '0.8rem', color: '#5a7a5a' }}>{o.duration_min} min</div>}
            </div>
          </div>
          {expanded === o.submission_id && detail[o.submission_id] && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid #d8e8d8', paddingTop: '0.75rem' }}>
              {detail[o.submission_id].map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', fontSize: '0.875rem' }}>
                  <span>{s.common_name}</span>
                  <span style={{ color: '#5a7a5a' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
