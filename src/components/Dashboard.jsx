import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUserFilter } from '../App.jsx'

export default function Dashboard() {
  const { user } = useAuth()
  const { filter } = useUserFilter()
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`/api/dashboard?user=${filter}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData)
  }, [filter])

  if (!data) return <div className="loading">Loading...</div>

  const me = data.per_user.find(u => u.username === user?.username)
  const other = data.per_user.find(u => u.username !== user?.username)

  return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderColor: 'var(--green)', borderWidth: 2 }}>
          <div className="value">{me?.species_count ?? 0}</div>
          <div className="label">Your Species</div>
        </div>
        {other && (
          <div className="stat-card">
            <div className="value">{other.species_count}</div>
            <div className="label">{other.display_name}'s Species</div>
          </div>
        )}
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--green-light)' }}>{data.shared_species}</div>
          <div className="label">Seen Together</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Recent Sightings</h2>
        {data.recent_sightings.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No sightings yet. <span style={{ color: 'var(--green)', cursor: 'pointer' }} onClick={() => navigate('/import')}>Import your eBird CSV</span> to get started.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Species</th><th>Location</th><th>Who</th></tr>
            </thead>
            <tbody>
              {data.recent_sightings.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/species/${encodeURIComponent(s.species_code || s.common_name)}`)}>
                  <td>{s.observed_date}</td>
                  <td>{s.common_name}</td>
                  <td>{s.location_name}</td>
                  <td style={{ color: s.username === user?.username ? 'var(--green)' : 'var(--text-muted)' }}>
                    {s.display_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
