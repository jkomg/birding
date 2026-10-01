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
  const [observation, setObservation] = useState({ common_name: '', count: 'X', evidence: 'seen', notes: '' })

  useEffect(() => {
    if (isNew) return
    fetch(`/api/field-outings/${id}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Outing not found')))
      .then(setOuting)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
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
    try {
      const notes = [observation.evidence === 'heard' ? 'Heard only.' : '', observation.notes.trim()].filter(Boolean).join(' ')
      const response = await fetch('/api/sightings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outing_id: outing.id, common_name: observation.common_name, count: observation.count || 'X', location_name: outing.location_name, latitude: outing.latitude, longitude: outing.longitude, observed_date: today(), observed_time: now(), observation_details: notes })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save observation')
      setOuting(current => ({ ...current, observations: [data, ...(current.observations || [])], observation_count: Number(current.observation_count || 0) + 1, species_count: new Set([...(current.observations || []).map(item => item.species_code || item.common_name), data.species_code || data.common_name]).size }))
      setObservation({ common_name: '', count: 'X', evidence: 'seen', notes: '' })
    } catch (err) { setError(err.message) } finally { setSaving(false) }
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
          {suggestions.species.length > 0 && <><div className="plan-result-heading"><span>Likely to see</span><small>Tap birds you want to look for</small></div><div className="likely-species-grid">{suggestions.species.slice(0, 18).map(species => <button type="button" key={species.species_code || species.common_name} className={`likely-species ${startForm.planned_species.some(item => item.species_code === species.species_code) ? 'selected' : ''}`} onClick={() => toggleTarget(species)}><strong>{species.common_name}</strong><span>{species.sightings} recent reports</span></button>)}</div></>}
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
  return (
    <div className="capture-page">
      <div className="capture-header"><div><Link className="back-link" to="/">← Today</Link><div className="eyebrow">{complete ? 'Outing complete' : 'Field mode'}</div><h1>{outing.title}</h1><p>{outing.location_name || 'Location not recorded'} · Started {formatDate(outing.started_at)}</p></div>{!complete && <button type="button" className="secondary" onClick={finishOuting} disabled={saving}>Finish outing</button>}</div>
      <div className="capture-stats"><div><strong>{outing.species_count}</strong><span>species</span></div><div><strong>{outing.observation_count}</strong><span>records</span></div><div><strong>{complete ? 'Done' : 'Active'}</strong><span>status</span></div></div>
      {outing.planned_species?.length > 0 && <section className="card target-card"><div className="section-heading"><div><div className="eyebrow">Your field list</div><h2>Look for these</h2></div><span className="target-count">{outing.planned_species.filter(target => outing.observations?.some(item => (item.species_code && item.species_code === target.species_code) || item.common_name?.toLowerCase() === target.common_name?.toLowerCase())).length}/{outing.planned_species.length}</span></div><div className="target-list">{outing.planned_species.map(target => { const logged = outing.observations?.some(item => (item.species_code && item.species_code === target.species_code) || item.common_name?.toLowerCase() === target.common_name?.toLowerCase()); return <button type="button" className={`target-row ${logged ? 'logged' : ''}`} key={target.species_code || target.common_name} onClick={() => !complete && setObservation(current => ({ ...current, common_name: target.common_name }))}><span>{logged ? '✓' : '○'}</span><strong>{target.common_name}</strong><small>{logged ? 'logged' : 'tap to log'}</small></button> })}</div></section>}
      {!complete && <form className="card observation-card" onSubmit={addObservation}><div className="eyebrow">Quick log</div><h2>What did you notice?</h2><div className="capture-species-row"><input autoFocus placeholder="Species name" value={observation.common_name} onChange={event => setObservation({ ...observation, common_name: event.target.value })} /><input className="count-input" inputMode="numeric" aria-label="Count" value={observation.count} onChange={event => setObservation({ ...observation, count: event.target.value })} /></div><div className="segmented-control"><button type="button" className={observation.evidence === 'seen' ? 'selected' : ''} onClick={() => setObservation({ ...observation, evidence: 'seen' })}>Seen</button><button type="button" className={observation.evidence === 'heard' ? 'selected' : ''} onClick={() => setObservation({ ...observation, evidence: 'heard' })}>Heard</button></div><input placeholder="Optional note" value={observation.notes} onChange={event => setObservation({ ...observation, notes: event.target.value })} /><button type="submit" disabled={saving || !observation.common_name.trim()}>{saving ? 'Saving...' : 'Add bird'}</button>{error && <div className="notice error">{error}</div>}</form>}
      <section className="card capture-list"><div className="section-heading"><div><div className="eyebrow">Field notes</div><h2>{complete ? 'Outing review' : 'Logged so far'}</h2></div>{complete && <Link className="text-link" to="/timeline">All outings <span>→</span></Link>}</div>{outing.observations?.length ? <div className="sighting-list">{outing.observations.map(item => <div className="sighting-row capture-observation" key={item.id}><span className="sighting-mark">{item.observation_details?.includes('Heard only') ? '◌' : '✦'}</span><span className="sighting-main"><strong>{item.common_name}</strong><span>{item.observation_details || 'Seen'} · {item.count}</span></span><span className="sighting-meta"><strong>{item.observed_time || ''}</strong></span></div>)}</div> : <div className="empty-inline"><span className="empty-inline-icon">◌</span><div><strong>No birds logged yet.</strong><p>Start with the first thing you notice.</p></div></div>}</section>
    </div>
  )
}
