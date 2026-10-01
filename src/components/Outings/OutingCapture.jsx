import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toTimeString().slice(0, 5)

function formatDate(value) {
  return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

export default function OutingCapture() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [outing, setOuting] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locationStatus, setLocationStatus] = useState('')
  const [startForm, setStartForm] = useState({ title: '', location_name: '', latitude: '', longitude: '', planned_species: [] })
  const [placeSearch, setPlaceSearch] = useState('')
  const [suggestions, setSuggestions] = useState(null)
  const [searching, setSearching] = useState(false)
  const [observation, setObservation] = useState({ common_name: '', scientific_name: '', species_code: '', count: 'X', evidence: 'seen', notes: '' })
  const [speciesMatches, setSpeciesMatches] = useState([])
  const [photoFile, setPhotoFile] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [offlineStatus, setOfflineStatus] = useState('')
  const [stopSuggestions, setStopSuggestions] = useState({})

  useEffect(() => {
    if (isNew) return
    fetch(`/api/field-outings/${id}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Outing not found')))
      .then(setOuting)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id, isNew])

  useEffect(() => {
    const query = observation.common_name.trim()
    if (query.length < 2) { setSpeciesMatches([]); return undefined }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/species/search?q=${encodeURIComponent(query)}`, { credentials: 'include' })
        setSpeciesMatches(response.ok ? await response.json() : [])
      } catch { setSpeciesMatches([]) }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [observation.common_name])

  useEffect(() => {
    if (isNew) return
    const storageKey = `field-notes-pending-${id}`
    async function syncPending() {
      let queue = []
      try { queue = JSON.parse(window.localStorage.getItem(storageKey) || '[]') } catch { queue = [] }
      if (!queue.length) return
      const remaining = []
      for (const item of queue) {
        try {
          const response = await fetch('/api/sightings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) })
          if (!response.ok) throw new Error('Sync failed')
          const data = await response.json()
          setOuting(current => ({ ...current, observations: (current.observations || []).map(observation => observation.client_id === item.client_id ? data : observation) }))
        } catch { remaining.push(item) }
      }
      window.localStorage.setItem(storageKey, JSON.stringify(remaining))
      setPendingCount(remaining.length)
      setOfflineStatus(remaining.length ? `${remaining.length} sighting${remaining.length === 1 ? '' : 's'} waiting to sync` : 'Offline sightings synced')
    }
    syncPending()
    window.addEventListener('online', syncPending)
    return () => window.removeEventListener('online', syncPending)
  }, [id, isNew])

  function locate() {
    setError('')
    setLocationStatus('Finding your location...')
    if (!navigator.geolocation) {
      setLocationStatus('')
      return setError('Location is not available in this browser.')
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setStartForm(current => ({
          ...current,
          location_name: current.location_name || 'Current location',
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        }))
        setLocationStatus(`Location captured · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`)
      },
      error => {
        setLocationStatus('')
        setError(error.code === 1 ? 'Location permission was denied. You can still enter the place name.' : 'Could not get your location. You can still enter the place name.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  async function searchPlace(event) {
    event?.preventDefault()
    if (placeSearch.trim().length < 3) return setError('Enter a park, preserve, town, or address first.')
    setSearching(true); setError(''); setSuggestions(null)
    try {
      const response = await fetch(`/api/field-outings/suggestions?q=${encodeURIComponent(placeSearch.trim())}`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not search for that place')
      setSuggestions(data)
      setStartForm(current => ({ ...current, location_name: data.place.display_name, latitude: data.place.latitude, longitude: data.place.longitude }))
    } catch (err) { setError(err.message) } finally { setSearching(false) }
  }

  function toggleTarget(species) {
    setStartForm(current => {
      const exists = current.planned_species.some(item => item.species_code === species.species_code)
      return { ...current, planned_species: exists ? current.planned_species.filter(item => item.species_code !== species.species_code) : [...current.planned_species, species] }
    })
  }

  function choosePlace(place) {
    setStartForm(current => ({ ...current, location_name: place.name, latitude: place.latitude, longitude: place.longitude }))
    setPlaceSearch(place.name)
  }

  async function startOuting(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/field-outings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...startForm, title: startForm.title || startForm.location_name || 'Birding outing', started_at: new Date().toISOString() })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not start outing')
      navigate(`/outing/${data.id}`, { replace: true })
      setOuting(data)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  async function addObservation(event) {
    event.preventDefault()
    if (!observation.common_name.trim() || !outing) return
    setSaving(true); setError('')
    const notes = [observation.evidence === 'heard' ? 'Heard only.' : '', observation.notes.trim()].filter(Boolean).join(' ')
    const payload = { outing_id: outing.id, common_name: observation.common_name, scientific_name: observation.scientific_name, species_code: observation.species_code || null, count: observation.count || 'X', location_name: outing.location_name, latitude: outing.latitude, longitude: outing.longitude, observed_date: today(), observed_time: now(), observation_details: notes }
    const clientId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const response = await fetch('/api/sightings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save observation')
      setOuting(current => ({ ...current, observations: [data, ...(current.observations || [])], observation_count: Number(current.observation_count || 0) + 1, species_count: new Set([...(current.observations || []).map(item => item.species_code || item.common_name), data.species_code || data.common_name]).size }))
      if (photoFile) {
        try {
          const photoData = new FormData()
          photoData.append('photo', photoFile)
          photoData.append('sighting_id', data.id)
          photoData.append('species_code', data.species_code || '')
          const photoResponse = await fetch('/api/photos', { method: 'POST', credentials: 'include', body: photoData })
          if (!photoResponse.ok) setOfflineStatus('Sighting saved, but the photo could not be uploaded')
        } catch { setOfflineStatus('Sighting saved; photo will need to be added when online') }
      }
      setObservation({ common_name: '', scientific_name: '', species_code: '', count: 'X', evidence: 'seen', notes: '' })
      setPhotoFile(null)
    } catch {
      const storageKey = `field-notes-pending-${outing.id}`
      let queue = []
      try { queue = JSON.parse(window.localStorage.getItem(storageKey) || '[]') } catch { queue = [] }
      queue.push({ client_id: clientId, payload })
      window.localStorage.setItem(storageKey, JSON.stringify(queue))
      const localObservation = { ...payload, id: clientId, client_id: clientId, pending: true }
      setOuting(current => ({ ...current, observations: [localObservation, ...(current.observations || [])], observation_count: Number(current.observation_count || 0) + 1, species_count: new Set([...(current.observations || []).map(item => item.species_code || item.common_name), payload.common_name]).size }))
      setPendingCount(queue.length)
      setOfflineStatus('Saved on this phone — will sync when you’re back online')
      setObservation({ common_name: '', scientific_name: '', species_code: '', count: 'X', evidence: 'seen', notes: '' })
      setPhotoFile(null)
    } finally { setSaving(false) }
  }

  function refreshLocation() {
    if (!navigator.geolocation) return setOfflineStatus('Location is not available in this browser')
    setOfflineStatus('Refreshing your position…')
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = Number(position.coords.latitude.toFixed(6))
      const longitude = Number(position.coords.longitude.toFixed(6))
      setOuting(current => ({ ...current, latitude, longitude }))
      try {
        const response = await fetch(`/api/field-outings/${outing.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude, longitude }) })
        if (!response.ok) throw new Error('Could not save location')
        setOfflineStatus('Position updated')
      } catch { setOfflineStatus('Position updated on this phone') }
    }, () => setOfflineStatus('Could not get your position'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  }

  function chooseSpecies(species) {
    setObservation(current => ({ ...current, common_name: species.common_name, scientific_name: species.scientific_name || '', species_code: species.species_code || '' }))
    setSpeciesMatches([])
  }

  async function toggleStop(stop) {
    if (complete) return
    const plannedStops = (outing.planned_stops || []).map(item => item.loc_key === stop.loc_key ? { ...item, visited: !item.visited } : item)
    setOuting(current => ({ ...current, planned_stops: plannedStops }))
    try {
      await fetch(`/api/field-outings/${outing.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planned_stops: plannedStops }) })
    } catch { setOfflineStatus('Stop updated on this phone; it will save when online') }
  }

  function openNavigation(stop) {
    const latitude = Number(stop.latitude)
    const longitude = Number(stop.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank', 'noopener,noreferrer')
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.location_name)}`, '_blank', 'noopener,noreferrer')
    }
  }

  async function loadStopSuggestions(stop) {
    if (stopSuggestions[stop.loc_key]) {
      setStopSuggestions(current => ({ ...current, [stop.loc_key]: null }))
      return
    }
    setStopSuggestions(current => ({ ...current, [stop.loc_key]: { loading: true } }))
    try {
      const response = await fetch(`/api/field-outings/stop-suggestions?lat=${encodeURIComponent(stop.latitude)}&lng=${encodeURIComponent(stop.longitude)}`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load birds')
      setStopSuggestions(current => ({ ...current, [stop.loc_key]: data }))
    } catch (err) { setStopSuggestions(current => ({ ...current, [stop.loc_key]: { error: err.message } })) }
  }

  async function addStopTarget(species) {
    if (outing.planned_species?.some(item => item.species_code === species.species_code)) return
    const plannedSpecies = [...(outing.planned_species || []), species]
    setOuting(current => ({ ...current, planned_species: plannedSpecies }))
    await fetch(`/api/field-outings/${outing.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planned_species: plannedSpecies }) })
  }

  async function finishOuting() {
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/field-outings/${outing.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not finish outing')
      setOuting(data)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="loading">Loading outing...</div>
  if (error && !outing && !isNew) return <div className="empty-state"><div className="empty-icon">!</div><h2>Could not open outing</h2><p>{error}</p><Link className="text-link" to="/">Back to Today</Link></div>

  if (isNew || !outing) return (
    <div className="capture-page narrow-page">
      <Link className="back-link" to="/">← Today</Link>
      <div className="capture-intro"><div className="eyebrow">Field mode</div><h1>Start an outing</h1><p>Keep the phone simple. We’ll remember the place and time while you focus on the birds.</p></div>
      <form className="card capture-start-card" onSubmit={startOuting}>
        <div className="form-group"><label htmlFor="outing-title">Name this outing</label><input id="outing-title" autoFocus placeholder="Morning at the marsh" value={startForm.title} onChange={event => setStartForm({ ...startForm, title: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="outing-location">Where are you birding?</label><div className="input-with-action"><input id="outing-location" required placeholder="Park, preserve, or backyard" value={placeSearch || startForm.location_name} onChange={event => { setPlaceSearch(event.target.value); setStartForm({ ...startForm, location_name: event.target.value }) }} /><button type="button" className="secondary locate-button" onClick={locate}>{locationStatus === 'Finding your location...' ? 'Finding...' : 'Use GPS'}</button></div><div className="place-search-row"><button type="button" className="secondary" onClick={searchPlace} disabled={searching}>{searching ? 'Looking up place…' : 'Find birds here'}</button><span>Search the place before you start</span></div>{locationStatus && locationStatus !== 'Finding your location...' && <div className="location-status" aria-live="polite">✓ {locationStatus}</div>}</div>
        {suggestions && <section className="outing-plan-results" aria-live="polite">
          <div className="place-result"><div><div className="eyebrow">Plan this place</div><strong>{suggestions.place.display_name}</strong><small>{suggestions.species.length ? `${suggestions.species.length} recent species nearby` : suggestions.needs_ebird ? 'Connect eBird to see local species' : 'No recent sightings returned'}</small></div><button type="button" className="text-button" onClick={() => setSuggestions(null)}>Clear</button></div>
          {suggestions.weather && <div className="field-forecast"><div><span>Tomorrow</span><strong>{suggestions.weather.description}</strong></div><div><span>Temperature</span><strong>{suggestions.weather.low}–{suggestions.weather.high}°</strong></div><div><span>Rain chance</span><strong>{suggestions.weather.rain_probability}%</strong></div><div><span>Best window</span><strong>{new Date(suggestions.weather.sunrise).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–{new Date(suggestions.weather.sunset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div></div>}
          {suggestions.species.length > 0 && <><div className="plan-result-heading"><span>Likely to see</span><small>New-for-us birds are first · tap to target</small></div><div className="likely-species-grid">{suggestions.species.slice(0, 18).map(species => <button type="button" key={species.species_code || species.common_name} className={`likely-species ${startForm.planned_species.some(item => item.species_code === species.species_code) ? 'selected' : ''}`} onClick={() => toggleTarget(species)}><div className="likely-species-name"><strong>{species.common_name}</strong>{species.priority === 'new' && <span className="new-bird-badge">New for us</span>}</div><span>{species.sightings} recent reports</span></button>)}</div></>}
          {suggestions.needs_ebird && <div className="notice">Add your eBird API key in Settings to get location-specific species and hotspots.</div>}
          {suggestions.hotspots?.length > 0 && <div className="hotspot-list"><div className="plan-result-heading"><span>Nearby birding spots</span><small>Use one as your exact destination</small></div>{suggestions.hotspots.slice(0, 4).map(spot => <button type="button" className="hotspot-row" key={spot.loc_id} onClick={() => choosePlace(spot)}><span>◎</span><strong>{spot.name}</strong><small>{spot.distance ? `${Number(spot.distance).toFixed(1)} km` : 'Nearby'}</small></button>)}</div>}
        </section>}
        {startForm.planned_species.length > 0 && <div className="selected-targets"><strong>{startForm.planned_species.length} target{startForm.planned_species.length === 1 ? '' : 's'} selected</strong><span>{startForm.planned_species.map(item => item.common_name).join(' · ')}</span></div>}
        <button type="submit" disabled={saving}>{saving ? 'Starting...' : 'Start outing'}</button>
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )

  const complete = outing.status === 'completed'
  const loggedSpecies = new Set((outing.observations || []).map(item => item.species_code || item.common_name?.toLowerCase()).filter(Boolean))
  const targetsFound = (outing.planned_species || []).filter(target => loggedSpecies.has(target.species_code || target.common_name?.toLowerCase()))
  const durationMinutes = outing.ended_at ? Math.max(0, Math.round((new Date(outing.ended_at) - new Date(outing.started_at)) / 60000)) : null
  return (
    <div className="capture-page">
      <div className="capture-header"><div><Link className="back-link" to="/">← Today</Link><div className="eyebrow">{complete ? 'Outing complete' : 'Field mode'}</div><h1>{outing.title}</h1><p>{outing.location_name || 'Location not recorded'} · Started {formatDate(outing.started_at)}</p></div>{!complete && <div className="capture-header-actions"><button type="button" className="secondary" onClick={refreshLocation}>Update GPS</button><button type="button" className="secondary" onClick={finishOuting} disabled={saving}>Finish outing</button></div>}</div>
      <div className="capture-stats"><div><strong>{outing.species_count}</strong><span>species</span></div><div><strong>{outing.observation_count}</strong><span>records</span></div><div><strong>{complete ? 'Done' : 'Active'}</strong><span>status</span></div></div>
      {outing.planned_stops?.length > 0 && <section className="card route-card"><div className="section-heading"><div><div className="eyebrow">Day route</div><h2>Stops</h2></div><span className="target-count">{outing.planned_stops.filter(stop => stop.visited).length}/{outing.planned_stops.length}</span></div><div className="route-stop-list">{outing.planned_stops.map((stop, index) => { const result = stopSuggestions[stop.loc_key]; return <div className={`route-stop ${stop.visited ? 'visited' : ''}`} key={stop.loc_key || `${stop.location_name}-${index}`}><div className="route-stop-main"><button type="button" className="route-stop-toggle" onClick={() => toggleStop(stop)}><span>{stop.visited ? '✓' : index + 1}</span><strong>{stop.location_name}</strong><small>{stop.visited ? 'Visited' : index === 0 ? 'First stop' : 'Up next'}</small></button><div className="route-stop-actions"><button type="button" className="secondary route-birds-button" onClick={() => loadStopSuggestions(stop)} disabled={!stop.latitude || !stop.longitude}>{result?.loading ? 'Loading…' : result ? 'Hide birds' : 'Birds here'}</button><button type="button" className="secondary route-nav-button" onClick={() => openNavigation(stop)}>Navigate ↗</button></div></div>{result?.error && <div className="route-stop-error">{result.error}</div>}{result?.species?.length > 0 && <div className="stop-species-list"><div className="stop-species-heading">Recent here <small>Tap + to add a target</small></div>{result.species.map(species => <div className="stop-species-row" key={species.species_code || species.common_name}><div><strong>{species.common_name}</strong>{species.priority === 'new' && <span className="new-bird-badge">New for us</span>}<small>{species.sightings} reports</small></div><button type="button" onClick={() => addStopTarget(species)} disabled={outing.planned_species?.some(item => item.species_code === species.species_code)}>+</button></div>)}</div>}</div> })}</div></section>}
      {outing.planned_species?.length > 0 && <section className="card target-card"><div className="section-heading"><div><div className="eyebrow">Your field list</div><h2>Look for these</h2></div><span className="target-count">{outing.planned_species.filter(target => outing.observations?.some(item => (item.species_code && item.species_code === target.species_code) || item.common_name?.toLowerCase() === target.common_name?.toLowerCase())).length}/{outing.planned_species.length}</span></div><div className="target-list">{outing.planned_species.map(target => { const logged = outing.observations?.some(item => (item.species_code && item.species_code === target.species_code) || item.common_name?.toLowerCase() === target.common_name?.toLowerCase()); return <button type="button" className={`target-row ${logged ? 'logged' : ''}`} key={target.species_code || target.common_name} onClick={() => !complete && setObservation(current => ({ ...current, common_name: target.common_name }))}><span>{logged ? '✓' : '○'}</span><strong>{target.common_name}</strong><small>{logged ? 'logged' : 'tap to log'}</small></button> })}</div></section>}
      {complete && <section className="card outing-recap"><div className="eyebrow">Outing recap</div><h2>A good day in the field.</h2><div className="recap-stats"><div><strong>{outing.species_count}</strong><span>species</span></div><div><strong>{outing.observation_count}</strong><span>records</span></div><div><strong>{targetsFound.length}/{outing.planned_species?.length || 0}</strong><span>targets</span></div>{durationMinutes !== null && <div><strong>{durationMinutes >= 60 ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` : `${durationMinutes}m`}</strong><span>in the field</span></div>}</div>{outing.planned_species?.length > 0 && <p className="recap-message">{targetsFound.length === outing.planned_species.length ? 'You found every target on the list.' : `${outing.planned_species.length - targetsFound.length} target${outing.planned_species.length - targetsFound.length === 1 ? '' : 's'} left for next time.`}</p>}</section>}
      {!complete && <form className="card observation-card" onSubmit={addObservation}>
        <div className="eyebrow">Quick log</div><h2>What did you notice?</h2>
        <div className="capture-species-row"><div className="species-entry"><input autoFocus placeholder="Species name" value={observation.common_name} onChange={event => setObservation({ ...observation, common_name: event.target.value, species_code: '', scientific_name: '' })} />{speciesMatches.length > 0 && <div className="species-autocomplete">{speciesMatches.map(species => <button type="button" key={species.species_code || species.common_name} onClick={() => chooseSpecies(species)}><strong>{species.common_name}</strong><small>{species.scientific_name}</small></button>)}</div>}</div><input className="count-input" inputMode="numeric" aria-label="Count" value={observation.count} onChange={event => setObservation({ ...observation, count: event.target.value })} /></div>
        <div className="segmented-control"><button type="button" className={observation.evidence === 'seen' ? 'selected' : ''} onClick={() => setObservation({ ...observation, evidence: 'seen' })}>Seen</button><button type="button" className={observation.evidence === 'heard' ? 'selected' : ''} onClick={() => setObservation({ ...observation, evidence: 'heard' })}>Heard</button></div>
        <input placeholder="Optional note" value={observation.notes} onChange={event => setObservation({ ...observation, notes: event.target.value })} /><label className="photo-capture"><span>▧ {photoFile ? photoFile.name : 'Add a photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => setPhotoFile(event.target.files?.[0] || null)} /></label><button type="submit" disabled={saving || !observation.common_name.trim()}>{saving ? 'Saving...' : 'Add bird'}</button>{offlineStatus && <div className="field-status" aria-live="polite">{pendingCount > 0 ? `◌ ${pendingCount} pending · ` : '✓ '}{offlineStatus}</div>}{error && <div className="notice error">{error}</div>}
      </form>}
      <section className="card capture-list"><div className="section-heading"><div><div className="eyebrow">Field notes</div><h2>{complete ? 'Outing review' : 'Logged so far'}</h2></div>{complete && <Link className="text-link" to="/timeline">All outings <span>→</span></Link>}</div>{outing.observations?.length ? <div className="sighting-list">{outing.observations.map(item => <div className="sighting-row capture-observation" key={item.id}><span className="sighting-mark">{item.observation_details?.includes('Heard only') ? '◌' : '✦'}</span><span className="sighting-main"><strong>{item.common_name}</strong><span>{item.observation_details || 'Seen'} · {item.count}</span></span><span className="sighting-meta"><strong>{item.observed_time || ''}</strong></span></div>)}</div> : <div className="empty-inline"><span className="empty-inline-icon">◌</span><div><strong>No birds logged yet.</strong><p>Start with the first thing you notice.</p></div></div>}</section>
    </div>
  )
}
