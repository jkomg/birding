import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function SpeciesDetail() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [photoTab, setPhotoTab] = useState('macaulay')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    fetch(`/api/species/${code}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData)
  }, [code])

  if (!data) return <div className="loading">Loading...</div>

  const { species, sightings, user_photos, macaulay_photos, wikimedia_photos } = data
  const name = species?.common_name ?? sightings[0]?.common_name ?? code
  const sciName = species?.scientific_name ?? sightings[0]?.scientific_name ?? ''

  const allPhotos = {
    yours: user_photos,
    macaulay: macaulay_photos,
    wikimedia: wikimedia_photos
  }

  const currentPhotos = allPhotos[photoTab] ?? []

  const stats = {
    jason: sightings.filter(s => s.username === 'jason'),
    mia: sightings.filter(s => s.username === 'mia')
  }

  return (
    <div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer'
        }}>
          <img src={lightbox} style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: 8 }} />
        </div>
      )}

      <div className="page-header">
        <div>
          <button className="secondary" onClick={() => navigate(-1)} style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>← Back</button>
          <h1>{name}</h1>
          <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>{sciName}</div>
          {species?.family_common && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{species.family_common} · {species.order_name}</div>}
        </div>
        <a href={`https://ebird.org/species/${code}`} target="_blank" rel="noreferrer"
          style={{ fontSize: '0.85rem', color: 'var(--green)' }}>View on eBird ↗</a>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="value">{sightings.length}</div>
          <div className="label">Total Sightings</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.jason.length}</div>
          <div className="label">Jason's Sightings</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.mia.length}</div>
          <div className="label">Mia's Sightings</div>
        </div>
        {stats.jason[0] && <div className="stat-card">
          <div className="value" style={{ fontSize: '1.1rem' }}>{stats.jason[stats.jason.length - 1]?.observed_date}</div>
          <div className="label">Jason First Saw</div>
        </div>}
        {stats.mia[0] && <div className="stat-card">
          <div className="value" style={{ fontSize: '1.1rem' }}>{stats.mia[stats.mia.length - 1]?.observed_date}</div>
          <div className="label">Mia First Saw</div>
        </div>}
      </div>

      {/* Photos */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          {[
            { key: 'macaulay', label: `Macaulay Library (${macaulay_photos.length})` },
            { key: 'wikimedia', label: `Wikimedia (${wikimedia_photos.length})` },
            { key: 'yours', label: `Your Photos (${user_photos.length})` }
          ].map(tab => (
            <button key={tab.key} onClick={() => setPhotoTab(tab.key)}
              className={photoTab === tab.key ? '' : 'secondary'}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {currentPhotos.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No photos available.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {currentPhotos.map((p, i) => (
              <div key={i} style={{ cursor: 'pointer' }} onClick={() => setLightbox(p.url)}>
                <img
                  src={p.thumb || p.url}
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6, background: '#eee' }}
                  loading="lazy"
                  onError={e => { e.target.style.display = 'none' }}
                />
                {(p.author || p.location) && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.author}{p.location ? ` · ${p.location}` : ''}
                  </div>
                )}
                {p.license && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.license}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Range Map */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Range Map</h2>
        <iframe
          src={`https://ebird.org/map/${code}?neg=true&env.minX=-170&env.minY=15&env.maxX=-50&env.maxY=75`}
          style={{ width: '100%', height: 400, border: 'none', borderRadius: 6 }}
          title={`${name} range map`}
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Range map via <a href={`https://ebird.org/species/${code}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>eBird</a>
        </div>
      </div>

      {/* Sightings table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem 0.5rem', fontWeight: 600 }}>Sightings</div>
        <table>
          <thead>
            <tr><th>Date</th><th>Who</th><th>Location</th><th>Count</th></tr>
          </thead>
          <tbody>
            {sightings.map(s => (
              <tr key={s.id}>
                <td>{s.observed_date}</td>
                <td>{s.display_name}</td>
                <td>{s.location_name}</td>
                <td>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
