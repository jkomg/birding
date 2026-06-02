import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUsers, useUserFilter, getScopeLabel } from '../../App.jsx'

export default function BirdMap() {
  const { user } = useAuth()
  const users = useUsers()
  const { filter } = useUserFilter()
  const scopeLabel = getScopeLabel(filter, user, users)
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const customMarkersRef = useRef([])
  const boundsRef = useRef(null)
  const refreshToken = useRef(0)
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [hotspots, setHotspots] = useState([])
  const [hotspotsLoading, setHotspotsLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState('')
  const [panel, setPanel] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelError, setPanelError] = useState('')
  const [panelMessage, setPanelMessage] = useState('')
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const [tripTargetId, setTripTargetId] = useState('')
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches
  ))
  const [mobileDrawer, setMobileDrawer] = useState(null)

  const editableTrips = useMemo(
    () => trips.filter(plan => plan.status !== 'done'),
    [trips]
  )

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 780px)')
    const update = () => setIsMobile(media.matches)
    update()

    if (media.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    if (!window.L || !mapRef.current) return

    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    mapInstance.current = window.L.map(mapRef.current).setView([38.5, -77.5], 7)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapInstance.current)

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
        markersRef.current = []
        customMarkersRef.current = []
        boundsRef.current = null
      }
    }
  }, [isMobile])

  useEffect(() => {
    let isCurrent = true

    async function loadTrips() {
      setTripsLoading(true)
      try {
        const response = await fetch('/api/trips', { credentials: 'include' })
        if (!response.ok) return
        const tripPlans = await response.json()
        if (!isCurrent) return
        setTrips(Array.isArray(tripPlans) ? tripPlans : [])
      } catch {
        if (!isCurrent) return
        setTrips([])
      } finally {
        if (isCurrent) setTripsLoading(false)
      }
    }

    loadTrips()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    setTripTargetId(prev => {
      if (prev && editableTrips.some(plan => String(plan.id) === String(prev))) {
        return prev
      }

      const fallback = editableTrips[0] || trips[0] || null
      return fallback ? String(fallback.id) : ''
    })
  }, [editableTrips, trips])

  useEffect(() => {
    if (!mapInstance.current || !window.L) return

    const token = ++refreshToken.current
    const params = new URLSearchParams({ user: filter, limit: '10' })
    if (speciesSearch.trim()) params.set('species', speciesSearch.trim())

    async function refresh() {
      setMapLoading(true)
      setHotspotsLoading(true)
      setMapError('')

      try {
        const [mapResponse, hotspotResponse] = await Promise.all([
          fetch(`/api/map/locations?${params}`, { credentials: 'include' }),
          fetch(`/api/trips/suggestions?${params}`, { credentials: 'include' })
        ])

        if (!mapResponse.ok) throw new Error('Could not load map markers')
        if (!hotspotResponse.ok) throw new Error('Could not load hotspot list')

        const geojson = await mapResponse.json()
        const hotspotData = await hotspotResponse.json()
        if (token !== refreshToken.current) return

        markersRef.current.forEach(marker => mapInstance.current.removeLayer(marker))
        markersRef.current = []
        customMarkersRef.current.forEach(marker => mapInstance.current.removeLayer(marker))
        customMarkersRef.current = []

        const features = geojson.features ?? []
        const maxCount = Math.max(1, ...features.map(feature => feature.properties.species_count ?? 1))
        const bounds = window.L.latLngBounds([])

        features.forEach(feature => {
          const p = feature.properties
          const [lng, lat] = feature.geometry.coordinates
          const radius = 8 + Math.round((p.species_count / maxCount) * 18)
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
            direction: 'top',
            offset: [0, -radius]
          })

          marker.on('click', () => openPanel(p))
          marker.addTo(mapInstance.current)
          markersRef.current.push(marker)
          bounds.extend([lat, lng])
        })

        try {
          const customStops = editableTrips
            .flatMap(plan => (Array.isArray(plan.itinerary) ? plan.itinerary.map(stop => ({ ...stop, plan_title: plan.title })) : []))
            .filter(stop => stop.custom && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)))

          customStops.forEach(stop => {
            const lat = Number(stop.latitude)
            const lng = Number(stop.longitude)
            const marker = window.L.circleMarker([lat, lng], {
              radius: 7,
              fillColor: '#d97706',
              color: '#fff',
              weight: 2,
              fillOpacity: 0.95
            })

            marker.bindTooltip(`<strong>${stop.location_name}</strong><br/>Custom stop`, {
              direction: 'top',
              offset: [0, -8]
            })

            marker.bindPopup(`
              <div style="min-width: 180px">
                <div style="font-weight: 700; margin-bottom: 0.25rem">${escapeHtml(stop.location_name)}</div>
                <div style="font-size: 0.8rem; color: #5a7a5a; margin-bottom: 0.35rem">${escapeHtml(stop.plan_title || 'Trip plan')}</div>
                <div style="font-size: 0.8rem; color: #5a7a5a">${escapeHtml(stop.state_province || '')}</div>
                ${stop.notes ? `<div style="font-size: 0.8rem; margin-top: 0.35rem">${escapeHtml(stop.notes)}</div>` : ''}
                <div style="font-size: 0.75rem; color: #5a7a5a; margin-top: 0.35rem">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
              </div>
            `)

            marker.addTo(mapInstance.current)
            customMarkersRef.current.push(marker)
            bounds.extend([lat, lng])
          })
        } catch {
          // Optional pins; keep the core map working if trip loading fails.
        }

        boundsRef.current = bounds.isValid() ? bounds : null
        if (boundsRef.current) {
          mapInstance.current.fitBounds(boundsRef.current.pad(0.15))
        }

        setHotspots(Array.isArray(hotspotData) ? hotspotData : [])
      } catch (err) {
        if (token !== refreshToken.current) return
        setMapError(err.message || 'Could not load map data')
        setHotspots([])
      } finally {
        if (token === refreshToken.current) {
          setMapLoading(false)
          setHotspotsLoading(false)
        }
      }
    }

    refresh()
  }, [filter, speciesSearch, isMobile, editableTrips])

  async function openPanel(location) {
    setPanel({
      location_name: location.location_name,
      loc_key: location.loc_key,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      state_province: location.state_province ?? '',
      species: []
    })
    setPanelLoading(true)
    setPanelError('')
    setPanelMessage('')

    const params = new URLSearchParams({ user: filter })
    if (speciesSearch.trim()) params.set('species', speciesSearch.trim())

    try {
      const res = await fetch(`/api/map/location/${encodeURIComponent(location.loc_key)}?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load species for this location')
      const species = await res.json()
      setPanel(prev => ({
        ...(prev || {}),
        location_name: location.location_name,
        loc_key: location.loc_key,
        latitude: location.latitude ?? prev?.latitude ?? null,
        longitude: location.longitude ?? prev?.longitude ?? null,
        state_province: location.state_province ?? prev?.state_province ?? '',
        species
      }))
      setMobileDrawer(null)
    } catch (err) {
      setPanelError(err.message || 'Could not load location details')
    } finally {
      setPanelLoading(false)
    }
  }

  function focusHotspot(location) {
    if (mapInstance.current && location.latitude && location.longitude) {
      mapInstance.current.setView([location.latitude, location.longitude], 10)
    }
    openPanel(location)
  }

  function fitToMarkers() {
    if (mapInstance.current && boundsRef.current) {
      mapInstance.current.fitBounds(boundsRef.current.pad(0.15))
    }
  }

  async function addPanelLocationToPlan() {
    if (!panel?.loc_key) return
    if (!tripTargetId) {
      setPanelError('Select a plan before adding this location.')
      return
    }

    const targetPlan = trips.find(plan => String(plan.id) === String(tripTargetId))
    if (!targetPlan) {
      setPanelError('Select a valid plan.')
      return
    }

    const latitude = Number(panel.latitude)
    const longitude = Number(panel.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setPanelError('This location does not have coordinates to add to a plan.')
      return
    }

    const stop = {
      loc_key: `map:${panel.loc_key}`,
      location_name: panel.location_name,
      state_province: panel.state_province || '',
      notes: 'Added from map',
      latitude,
      longitude,
      species_count: 0,
      visit_count: 0,
      last_visit: '',
      custom: true,
      source: 'map'
    }

    const itinerary = Array.isArray(targetPlan.itinerary) ? targetPlan.itinerary : []
    if (itinerary.some(item => item.loc_key === stop.loc_key)) {
      setPanelMessage('That location is already on this plan.')
      return
    }

    const nextItinerary = [...itinerary, stop]
    const response = await fetch(`/api/trips/${targetPlan.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itinerary: nextItinerary })
    })
    const data = await response.json()
    if (!response.ok) {
      setPanelError(data.error || 'Could not add location to plan')
      return
    }

    setTrips(prev => prev.map(plan => (String(plan.id) === String(targetPlan.id) ? data : plan)))
    setPanelMessage(`Added to ${data.title}.`)
  }

  const hotspotList = (
    <div className="map-hotspot-list">
      {hotspots.map(location => (
        <button
          key={location.loc_key}
          type="button"
          className="map-hotspot"
          onClick={() => focusHotspot(location)}
        >
          <div>
            <div className="map-hotspot-title">{location.location_name}</div>
            <div className="map-hotspot-meta">
              {location.species_count} species · {location.visit_count} visits
            </div>
          </div>
          <div className="map-hotspot-action">Open</div>
        </button>
      ))}
    </div>
  )

  const panelView = panel && (
    <aside className={isMobile ? 'card map-panel map-panel-mobile' : 'card map-panel'}>
      <div className="map-panel-header">
        <div>
          <div className="map-panel-title">{panel.location_name}</div>
          {!panelLoading && !panelError && (
            <div className="map-panel-meta">
              {panel.species.length} species
              {panel.state_province ? ` · ${panel.state_province}` : ''}
              {Number.isFinite(Number(panel.latitude)) && Number.isFinite(Number(panel.longitude))
                ? ` · ${Number(panel.latitude).toFixed(4)}, ${Number(panel.longitude).toFixed(4)}`
                : ''}
            </div>
          )}
        </div>
        <button className="secondary" onClick={() => setPanel(null)} type="button">Close</button>
      </div>
      <div className="map-panel-body">
        <div className="map-panel-actions">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Add to plan</label>
            <select
              value={tripTargetId}
              onChange={e => setTripTargetId(e.target.value)}
              disabled={tripsLoading || editableTrips.length === 0}
            >
              <option value="">{tripsLoading ? 'Loading plans...' : editableTrips.length ? 'Select a plan...' : 'No active plans'}</option>
              {editableTrips.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.title} · {plan.status}
                </option>
              ))}
            </select>
          </div>
          <div className="map-panel-action-row">
            <button
              type="button"
              onClick={addPanelLocationToPlan}
              disabled={tripsLoading || editableTrips.length === 0 || !tripTargetId || !Number.isFinite(Number(panel.latitude)) || !Number.isFinite(Number(panel.longitude))}
            >
              Add location to plan
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/trips')}>
              Open trips
            </button>
          </div>
          {panelMessage && <div className="map-panel-message">{panelMessage}</div>}
        </div>
        {panelLoading ? (
          <div className="loading">Loading...</div>
        ) : panelError ? (
          <div className="error">{panelError}</div>
        ) : panel.species.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No species loaded for this location.</div>
        ) : panel.species.map(s => (
          <button
            key={s.species_code || s.common_name}
            type="button"
            onClick={() => navigate(`/species/${encodeURIComponent(s.species_code || s.common_name)}`)}
            className="map-species-row"
          >
            <div>
              <div className="map-species-name">{s.common_name}</div>
              <div className="map-species-meta">{s.scientific_name}</div>
              <div className="map-species-meta">{s.observers} · {s.last_seen}</div>
            </div>
            {s.times_seen > 1 && <div className="map-species-count">×{s.times_seen}</div>}
          </button>
        ))}
      </div>
    </aside>
  )

  if (isMobile) {
    return (
      <div className="map-mobile-shell">
        <div className="map-mobile-topbar">
          <div>
            <div className="map-scope-pill">{scopeLabel}</div>
            <h1 style={{ fontSize: '1.35rem', marginTop: '0.35rem' }}>Map</h1>
          </div>
          <button className="secondary" type="button" onClick={fitToMarkers} disabled={!boundsRef.current}>
            Fit
          </button>
        </div>

        <div className="map-mobile-actions">
          <button type="button" className="secondary" onClick={() => setMobileDrawer(mobileDrawer === 'filters' ? null : 'filters')}>
            Filters
          </button>
          <button type="button" className="secondary" onClick={() => setMobileDrawer(mobileDrawer === 'hotspots' ? null : 'hotspots')}>
            Hotspots ({hotspots.length})
          </button>
          <button type="button" className="secondary" onClick={fitToMarkers} disabled={!boundsRef.current}>
            Recenter
          </button>
        </div>

        {mapError && <div className="error" style={{ marginBottom: '0.75rem' }}>{mapError}</div>}

        <div id="bird-map" ref={mapRef} className="map-canvas map-canvas-mobile" />

        <div className="map-mobile-hint">
          Tap a hotspot or marker to open the species sheet.
        </div>

        {mobileDrawer === 'filters' && (
          <div className="map-mobile-sheet">
            <div className="map-panel-header">
              <div>
                <div className="map-panel-title">Map Filters</div>
                <div className="map-panel-meta">Search and legend</div>
              </div>
              <button className="secondary" onClick={() => setMobileDrawer(null)} type="button">Close</button>
            </div>
            <div className="map-panel-body">
              <div className="form-group">
                <label>Search species</label>
                <input
                  placeholder="Filter map and hotspots..."
                  value={speciesSearch}
                  onChange={e => setSpeciesSearch(e.target.value)}
                />
              </div>
              <div className="map-sidebar-actions">
                <button type="button" className="secondary" onClick={fitToMarkers} disabled={!boundsRef.current}>
                  Fit map
                </button>
                <button type="button" className="secondary" onClick={() => setSpeciesSearch('')} disabled={!speciesSearch}>
                  Clear search
                </button>
              </div>
              <div className="map-legend">
                <div className="map-legend-row">
                  <span className="map-legend-dot map-legend-dot-solo" />
                  <span>Single observer</span>
                </div>
                <div className="map-legend-row">
                  <span className="map-legend-dot map-legend-dot-shared" />
                  <span>Shared spot</span>
                </div>
                <div className="map-legend-row">
                  <span className="map-legend-dot map-legend-dot-custom" />
                  <span>Custom stop</span>
                </div>
                <div className="map-legend-note">Bigger circles mean more species recorded at that location.</div>
              </div>
            </div>
          </div>
        )}

        {mobileDrawer === 'hotspots' && (
          <div className="map-mobile-sheet">
            <div className="map-panel-header">
              <div>
                <div className="map-panel-title">Top Hotspots</div>
                <div className="map-panel-meta">{hotspots.length} locations</div>
              </div>
              <button className="secondary" onClick={() => setMobileDrawer(null)} type="button">Close</button>
            </div>
            <div className="map-panel-body">
              {hotspotsLoading ? (
                <div className="loading">Loading...</div>
              ) : hotspots.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No hotspots match this search yet.</div>
              ) : hotspotList}
            </div>
          </div>
        )}

        {panelView}
      </div>
    )
  }

  return (
    <div className="map-layout">
      <aside className="card map-sidebar">
        <div className="map-sidebar-header">
          <div className="map-scope-pill">Viewing {scopeLabel.toLowerCase()}</div>
          <h1 style={{ fontSize: '1.5rem', marginTop: '0.35rem' }}>Map</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Use the map to jump between hotspots, species, and future day trips.
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>Search species</label>
          <input
            placeholder="Filter map and hotspots..."
            value={speciesSearch}
            onChange={e => setSpeciesSearch(e.target.value)}
          />
        </div>

        <div className="map-sidebar-actions">
          <button type="button" className="secondary" onClick={fitToMarkers} disabled={!boundsRef.current}>
            Fit map
          </button>
          <button type="button" className="secondary" onClick={() => setSpeciesSearch('')} disabled={!speciesSearch}>
            Clear search
          </button>
        </div>

        <div className="map-legend">
          <div className="map-legend-row">
            <span className="map-legend-dot map-legend-dot-solo" />
            <span>Single observer</span>
          </div>
          <div className="map-legend-row">
            <span className="map-legend-dot map-legend-dot-shared" />
            <span>Shared spot</span>
          </div>
          <div className="map-legend-row">
            <span className="map-legend-dot map-legend-dot-custom" />
            <span>Custom stop</span>
          </div>
          <div className="map-legend-note">Bigger circles mean more species recorded at that location.</div>
        </div>

        <div className="map-hotspots">
          <div className="map-section-title">
            <h2>Top hotspots</h2>
            <span>{hotspots.length}</span>
          </div>
          {hotspotsLoading ? (
            <div className="loading" style={{ padding: '1.5rem 0' }}>Loading...</div>
          ) : hotspots.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No hotspots match this search yet.
            </div>
          ) : hotspotList}
        </div>
      </aside>

      <section className="map-main">
        <div className="page-header">
          <div>
            <h1>Map</h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {mapLoading ? 'Loading locations...' : `${hotspots.length} hotspots ready to explore.`}
            </div>
          </div>
          <button className="secondary" type="button" onClick={fitToMarkers}>
            Recenter
          </button>
        </div>

        {mapError && <div className="error" style={{ marginBottom: '0.75rem' }}>{mapError}</div>}

        <div className="map-toolbar">
          <span>Markers show the hottest locations; click a circle or hotspot to see species.</span>
          <span>Search narrows both the map and the hotspot list.</span>
        </div>

        <div id="bird-map" ref={mapRef} className="map-canvas" />
      </section>

      {panelView}
    </div>
  )
}
