import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserFilter } from '../../App.jsx'

export default function BirdMap() {
  const { filter } = useUserFilter()
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [panel, setPanel] = useState(null) // { location_name, loc_key, species: [] }
  const [panelLoading, setPanelLoading] = useState(false)

  const loadMap = useCallback(async () => {
    if (!window.L || !mapInstance.current) return
    const params = new URLSearchParams({ user: filter })
    if (speciesSearch.trim()) params.set('species', speciesSearch.trim())

    const res = await fetch(`/api/map/locations?${params}`, { credentials: 'include' })
    const geojson = await res.json()

    // Clear old markers
    markersRef.current.forEach(m => mapInstance.current.removeLayer(m))
    markersRef.current = []

    const maxCount = Math.max(1, ...geojson.features.map(f => f.properties.species_count))

    geojson.features.forEach(feature => {
      const p = feature.properties
      const [lng, lat] = feature.geometry.coordinates
      const radius = 8 + Math.round((p.species_count / maxCount) * 18)

      // Fade older visits: days since last visit → opacity
      const daysSince = (Date.now() - new Date(p.last_visit)) / 86400000
      const opacity = Math.max(0.35, 1 - daysSince / 365)

      const marker = window.L.circleMarker([lat, lng], {
        radius,
        fillColor: p.observer_count > 1 ? '#52b788' : '#2d6a4f',
        color: '#fff',
        weight: 2,
        fillOpacity: opacity
      })

      marker.bindTooltip(`<strong>${p.location_name}</strong><br/>${p.species_count} species · ${p.last_visit}`, {
        direction: 'top', offset: [0, -radius]
      })

      marker.on('click', () => openPanel(p))
      marker.addTo(mapInstance.current)
      markersRef.current.push(marker)
    })
  }, [filter, speciesSearch])

  useEffect(() => {
    if (!window.L) return
    if (!mapInstance.current) {
      mapInstance.current = window.L.map('bird-map').setView([38.5, -77.5], 7)
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapInstance.current)
    }
    loadMap()
  }, [loadMap])

  async function openPanel(p) {
    setPanel({ location_name: p.location_name, loc_key: p.loc_key, species: [] })
    setPanelLoading(true)
    const params = new URLSearchParams({ user: filter })
    const res = await fetch(`/api/map/location/${encodeURIComponent(p.loc_key)}?${params}`, { credentials: 'include' })
    const species = await res.json()
    setPanel({ location_name: p.location_name, loc_key: p.loc_key, species })
    setPanelLoading(false)
  }

  return (
    <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 120px)' }}>
      {/* Map */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            placeholder="Filter by species..."
            value={speciesSearch}
            onChange={e => setSpeciesSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          {speciesSearch && (
            <button className="secondary" onClick={() => setSpeciesSearch('')} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
              Clear
            </button>
          )}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Marker size = species count · Faded = older visit
          </span>
        </div>
        <div id="bird-map" ref={mapRef} style={{ flex: 1, borderRadius: 8 }} />
      </div>

      {/* Side panel */}
      <div style={{
        width: panel ? 320 : 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        flexShrink: 0
      }}>
        {panel && (
          <div style={{ width: 320, height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>{panel.location_name}</div>
                {!panelLoading && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{panel.species.length} species</div>}
              </div>
              <button className="secondary" onClick={() => setPanel(null)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
              {panelLoading ? (
                <div className="loading">Loading...</div>
              ) : panel.species.map(s => (
                <div
                  key={s.species_code || s.common_name}
                  onClick={() => navigate(`/species/${encodeURIComponent(s.species_code || s.common_name)}`)}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={e => { if (s.species_code) e.currentTarget.style.background = 'var(--bg)' }}
                  onMouseLeave={e => e.currentTarget.style.background = '' }
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.common_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.scientific_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.observers} · {s.last_seen}</div>
                  </div>
                  {s.times_seen > 1 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600, marginLeft: '0.5rem' }}>×{s.times_seen}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
