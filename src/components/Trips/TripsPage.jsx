import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useUsers, useUserFilter, getScopeLabel } from '../../App.jsx'
import { useNavigate, useSearchParams } from 'react-router-dom'

const emptyForm = {
  title: '',
  trip_date: '',
  start_time: '',
  end_time: '',
  target_species: '',
  target_area: '',
  notes: '',
  status: 'draft'
}

export default function TripsPage() {
  const { user } = useAuth()
  const users = useUsers()
  const { filter } = useUserFilter()
  const [plans, setPlans] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [customStopForm, setCustomStopForm] = useState({ name: '', area: '', notes: '', latitude: '', longitude: '' })
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [suggestionTargetId, setSuggestionTargetId] = useState('')
  const [itinerary, setItinerary] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const customStopMapRef = useRef(null)
  const customStopMapInstanceRef = useRef(null)
  const customStopMarkerRef = useRef(null)
  const scopeLabel = getScopeLabel(filter, user, users)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editablePlans = plans.filter(plan => !['done', 'archived'].includes(plan.status))
  const currentPlan = plans.find(plan => plan.id === selectedPlanId) ?? null
  const currentPlanLabel = currentPlan ? `${currentPlan.title} · ${currentPlan.status}` : 'New draft plan'

  useEffect(() => {
    const selectedIsEditable = selectedPlanId && plans.some(plan => plan.id === selectedPlanId && plan.status !== 'done')
    setSuggestionTargetId(selectedIsEditable ? String(selectedPlanId) : '')
  }, [plans, selectedPlanId])

  async function loadPlans() {
    setLoadingPlans(true)
    try {
      const res = await fetch('/api/trips', { credentials: 'include' })
      const data = await res.json()
      setPlans(Array.isArray(data) ? data : [])
    } finally {
      setLoadingPlans(false)
    }
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true)
    try {
      const params = new URLSearchParams({ user: filter })
      if (search.trim()) params.set('species', search.trim())
      const res = await fetch(`/api/trips/suggestions?${params}`, { credentials: 'include' })
      const data = await res.json()
      setSuggestions(Array.isArray(data) ? data : [])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  useEffect(() => {
    loadPlans()
  }, [])

  useEffect(() => {
    const requestedId = searchParams.get('plan')
    const requestedPlan = plans.find(plan => String(plan.id) === String(requestedId))
    if (requestedPlan && selectedPlanId === null) startEditing(requestedPlan)
  }, [plans, searchParams, selectedPlanId])

  useEffect(() => {
    loadSuggestions()
  }, [filter, search])

  useEffect(() => {
    if (!window.L || !customStopMapRef.current) return

    if (customStopMapInstanceRef.current) {
      customStopMapInstanceRef.current.remove()
      customStopMapInstanceRef.current = null
      customStopMarkerRef.current = null
    }

    const map = window.L.map(customStopMapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false
    }).setView([38.5, -77.5], 6)

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    map.on('click', event => {
      setCustomStopForm(prev => ({
        ...prev,
        latitude: Number(event.latlng.lat).toFixed(6),
        longitude: Number(event.latlng.lng).toFixed(6)
      }))
    })

    customStopMapInstanceRef.current = map
    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      if (customStopMapInstanceRef.current) {
        customStopMapInstanceRef.current.remove()
        customStopMapInstanceRef.current = null
        customStopMarkerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const map = customStopMapInstanceRef.current
    if (!map || !window.L) return

    const lat = Number(customStopForm.latitude)
    const lng = Number(customStopForm.longitude)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

    if (!hasCoords) {
      if (customStopMarkerRef.current) {
        map.removeLayer(customStopMarkerRef.current)
        customStopMarkerRef.current = null
      }
      return
    }

    const latLng = [lat, lng]
    if (!customStopMarkerRef.current) {
      customStopMarkerRef.current = window.L.marker(latLng, { draggable: true }).addTo(map)
      customStopMarkerRef.current.on('dragend', event => {
        const position = event.target.getLatLng()
        setCustomStopForm(prev => ({
          ...prev,
          latitude: Number(position.lat).toFixed(6),
          longitude: Number(position.lng).toFixed(6)
        }))
      })
    } else {
      customStopMarkerRef.current.setLatLng(latLng)
    }

    map.setView(latLng, Math.max(map.getZoom(), 11))
  }, [customStopForm.latitude, customStopForm.longitude])

  const itineraryKeys = useMemo(
    () => new Set(itinerary.map(item => item.loc_key)),
    [itinerary]
  )

  function resetForm() {
    setSelectedPlanId(null)
    setForm(emptyForm)
    setCustomStopForm({ name: '', area: '', notes: '', latitude: '', longitude: '' })
    setItinerary([])
    setMessage('')
    setError('')
  }

  function startEditing(plan) {
    setSelectedPlanId(plan.id)
    setForm({
      title: plan.title || '',
      trip_date: plan.trip_date || '',
      start_time: plan.start_time || '',
      end_time: plan.end_time || '',
      target_species: plan.target_species || '',
      target_area: plan.target_area || '',
      notes: plan.notes || '',
      status: plan.status || 'draft'
    })
    setItinerary(Array.isArray(plan.itinerary) ? plan.itinerary : [])
    setMessage('')
    setError('')
  }

  function getNextItinerary(plan, suggestion) {
    const currentItinerary = Array.isArray(plan?.itinerary) ? plan.itinerary : []
    if (currentItinerary.some(item => item.loc_key === suggestion.loc_key)) return currentItinerary
    return [...currentItinerary, suggestion]
  }

  function addSuggestion(suggestion) {
    if (itineraryKeys.has(suggestion.loc_key)) return
    setItinerary(prev => [...prev, suggestion])
  }

  function createCustomStop() {
    const name = customStopForm.name.trim()
    if (!name) {
      setError('Custom stop name is required.')
      return null
    }

    const hasLat = customStopForm.latitude.trim() !== ''
    const hasLng = customStopForm.longitude.trim() !== ''
    if (hasLat !== hasLng) {
      setError('Enter both latitude and longitude, or leave both blank.')
      return null
    }

    const latitude = hasLat ? Number(customStopForm.latitude) : null
    const longitude = hasLng ? Number(customStopForm.longitude) : null
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
      setError('Latitude and longitude must be valid numbers.')
      return null
    }

    return {
      loc_key: `custom:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      location_name: name,
      state_province: customStopForm.area.trim() || '',
      notes: customStopForm.notes.trim() || '',
      latitude,
      longitude,
      species_count: 0,
      visit_count: 0,
      last_visit: '',
      custom: true
    }
  }

  function removeSuggestion(locKey) {
    setItinerary(prev => prev.filter(item => item.loc_key !== locKey))
  }

  async function addSuggestionToPlan(suggestion) {
    await addStopToTarget(suggestion, 'Added stop.')
  }

  async function addStopToTarget(stop, successMessage) {
    const targetId = suggestionTargetId

    if (!targetId) {
      if (itineraryKeys.has(stop.loc_key)) {
        setMessage('That stop is already on this draft.')
        return false
      }
      setItinerary(prev => [...prev, stop])
      setMessage(successMessage || 'Added to the current draft.')
      return true
    }

    const targetPlan = plans.find(plan => String(plan.id) === String(targetId))
    if (!targetPlan) {
      setError('Select a valid plan first.')
      return false
    }

    const nextItinerary = getNextItinerary({ itinerary: targetPlan.itinerary }, stop)
    if (nextItinerary.length === (targetPlan.itinerary?.length ?? 0)) {
      setMessage('That stop is already on this plan.')
      return false
    }

    if (selectedPlanId && String(selectedPlanId) === String(targetPlan.id)) {
      setItinerary(nextItinerary)
      setPlans(prev => prev.map(plan => (
        String(plan.id) === String(targetPlan.id)
          ? { ...plan, itinerary: nextItinerary }
          : plan
      )))
      setMessage(successMessage || 'Added to the current plan.')
      return true
    }

    const res = await fetch(`/api/trips/${targetPlan.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itinerary: nextItinerary })
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not update plan stops')
      return false
    }

    setPlans(prev => prev.map(plan => (
      String(plan.id) === String(targetPlan.id) ? data : plan
    )))
    setMessage(`Added stop to ${data.title}.`)
    return true
  }

  async function addCustomStop() {
    setMessage('')
    setError('')
    const stop = createCustomStop()
    if (!stop) return

    const added = await addStopToTarget(stop, 'Added custom stop.')
    if (added) setCustomStopForm({ name: '', area: '', notes: '', latitude: '', longitude: '' })
  }

  async function savePlan(e) {
    e.preventDefault()
    setMessage('')
    setError('')

    const body = {
      ...form,
      itinerary
    }

    const res = await fetch(selectedPlanId ? `/api/trips/${selectedPlanId}` : '/api/trips', {
      method: selectedPlanId ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not save trip plan')
      return
    }

    setMessage(selectedPlanId ? 'Trip plan updated.' : 'Trip plan created.')
    await loadPlans()
    startEditing(data)
  }

  async function deletePlan(id) {
    setMessage('')
    setError('')
    const res = await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Could not delete trip plan')
      return
    }
    if (selectedPlanId === id) resetForm()
    await loadPlans()
    setMessage('Trip plan deleted.')
  }

  async function startPlan(plan) {
    setError('')
    const res = await fetch(`/api/trips/${plan.id}/start`, { method: 'POST', credentials: 'include' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not start outing')
      return
    }
    navigate(`/outing/${data.outing_id}`)
  }

  async function duplicatePlan(plan) {
    const response = await fetch(`/api/trips/${plan.id}/duplicate`, { method: 'POST', credentials: 'include' })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Could not duplicate plan')
    await loadPlans()
    startEditing(data)
    setMessage('Plan duplicated. Update the date or stops as needed.')
  }

  async function archivePlan(plan) {
    if (!window.confirm(`Archive “${plan.title}”? You can no longer add it to new outings.`)) return
    const response = await fetch(`/api/trips/${plan.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) })
    if (!response.ok) return setError('Could not archive plan')
    await loadPlans()
    if (selectedPlanId === plan.id) resetForm()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Day Trips</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Build a day-trip from {scopeLabel.toLowerCase()} and save it as a reusable plan.
          </div>
        </div>
        <button className="secondary" onClick={resetForm}>New Plan</button>
      </div>

      <div className="trip-workspace">
        <div className="card trip-current-card">
          <div className="trip-card-header">
            <div>
              <div className="trip-section-kicker">Current plan</div>
              <h2>{selectedPlanId ? 'Edit plan' : 'Create a new plan'}</h2>
              <div className="trip-card-subtitle">{currentPlanLabel}</div>
            </div>
            <button className="secondary" onClick={resetForm}>New Plan</button>
          </div>

          <form onSubmit={savePlan}>
            <div className="form-group">
              <label>Trip Title</label>
              <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Saturday morning loop" required />
            </div>
            <div className="trip-form-row">
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.trip_date} onChange={e => setForm(prev => ({ ...prev, trip_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                  <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="planned">Planned</option>
                  <option value="done">Done</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="trip-form-row">
              <div className="form-group">
                <label>Start Time</label>
                <input type="time" value={form.start_time} onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>End Time</label>
                <input type="time" value={form.end_time} onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Target Species</label>
              <input value={form.target_species} onChange={e => setForm(prev => ({ ...prev, target_species: e.target.value }))} placeholder="e.g. prothonotary warbler" />
            </div>
            <div className="form-group">
              <label>Target Area</label>
              <input value={form.target_area} onChange={e => setForm(prev => ({ ...prev, target_area: e.target.value }))} placeholder="e.g. Shenandoah Valley" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea rows="4" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Route ideas, parking, tide timing, backup spots..." />
            </div>
            {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            {message && <div style={{ color: 'var(--green)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{message}</div>}
            <button type="submit">{selectedPlanId ? 'Update Plan' : 'Save Plan'}</button>
          </form>

          <div className="trip-stops-panel">
            <div className="trip-panel-title">Chosen stops</div>
            {itinerary.length === 0 ? (
              <div className="trip-panel-empty">Pick stops from the suggestions below to build this route.</div>
            ) : (
              <div className="trip-stop-list">
                {itinerary.map(stop => (
                  <div key={stop.loc_key} className="trip-stop">
                    <div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600 }}>{stop.location_name}</div>
                        {stop.custom && <span className="trip-plan-badge">Custom</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {stop.custom
                          ? [stop.state_province, stop.notes].filter(Boolean).join(' · ') || 'Custom stop'
                          : `${stop.species_count} species · ${stop.visit_count} visits · last ${stop.last_visit}`}
                      </div>
                      {stop.custom && stop.latitude != null && stop.longitude != null && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Pin: {Number(stop.latitude).toFixed(4)}, {Number(stop.longitude).toFixed(4)}
                        </div>
                      )}
                    </div>
                    <button className="secondary" onClick={() => removeSuggestion(stop.loc_key)} type="button">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="trip-stops-panel">
            <div className="trip-panel-title">Add custom stop</div>
            <div className="trip-custom-grid">
              <div className="form-group">
                <label>Stop name</label>
                <input
                  value={customStopForm.name}
                  onChange={e => setCustomStopForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Trail, park, yard, lake..."
                />
              </div>
              <div className="form-group">
                <label>Area</label>
                <input
                  value={customStopForm.area}
                  onChange={e => setCustomStopForm(prev => ({ ...prev, area: e.target.value }))}
                  placeholder="Town, county, or state"
                />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={customStopForm.latitude}
                  onChange={e => setCustomStopForm(prev => ({ ...prev, latitude: e.target.value }))}
                  placeholder="38.1234"
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={customStopForm.longitude}
                  onChange={e => setCustomStopForm(prev => ({ ...prev, longitude: e.target.value }))}
                  placeholder="-77.1234"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Notes</label>
              <textarea
                rows="3"
                value={customStopForm.notes}
                onChange={e => setCustomStopForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Parking, access, timing, backup plan..."
              />
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Drop pin on map</label>
              <div className="trip-mini-map" ref={customStopMapRef} />
              <div className="trip-panel-empty" style={{ marginTop: '0.4rem' }}>
                Tap the map to set coordinates, or drag the pin to fine-tune it.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Added to the selected plan, or the current draft if none is selected. Coordinates are optional.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCustomStopForm(prev => ({ ...prev, latitude: '', longitude: '' }))}
                  disabled={!customStopForm.latitude && !customStopForm.longitude}
                >
                  Clear pin
                </button>
                <button type="button" onClick={addCustomStop}>Add custom stop</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card trip-drafts-card">
          <div className="trip-card-header">
            <div>
              <div className="trip-section-kicker">Draft plans</div>
              <h2>Saved plans</h2>
              <div className="trip-card-subtitle">Open one to make it the current plan.</div>
            </div>
          </div>

          {loadingPlans ? (
            <div className="loading">Loading...</div>
          ) : plans.length === 0 ? (
            <div className="trip-panel-empty">No day-trip plans yet.</div>
          ) : (
            <div className="trip-plan-list">
              {plans.map(plan => (
                <div key={plan.id} className={`trip-plan-card ${String(plan.id) === String(selectedPlanId) ? 'trip-plan-card-active' : ''}`}>
                  <div className="trip-plan-card-main">
                    <div className="trip-plan-title-row">
                      <div className="trip-plan-title">{plan.title}</div>
                      <span className={`trip-plan-badge trip-plan-badge-${plan.status}`}>{plan.status}</span>
                    </div>
                    <div className="trip-plan-meta">
                      {plan.trip_date}{plan.start_time ? ` · ${plan.start_time}` : ''}{plan.end_time ? ` to ${plan.end_time}` : ''}
                    </div>
                    {plan.target_area && <div className="trip-plan-meta">{plan.target_area}</div>}
                    {plan.target_species && <div className="trip-plan-meta">Target: {plan.target_species}</div>}
                    <div className="trip-plan-meta">{Array.isArray(plan.itinerary) ? plan.itinerary.length : 0} stops</div>
                  </div>
                  <div className="trip-plan-card-actions">
                    <button type="button" onClick={() => startPlan(plan)} disabled={['done', 'archived'].includes(plan.status)}>Start outing</button>
                    <button type="button" className="secondary" onClick={() => duplicatePlan(plan)}>Duplicate</button>
                    <button type="button" className="secondary" onClick={() => startEditing(plan)}>Current</button>
                    <button type="button" className="danger-button" onClick={() => archivePlan(plan)}>Archive</button>
                    <button type="button" className="secondary" onClick={() => deletePlan(plan.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card trip-suggestions-card">
        <div className="trip-card-header">
          <div>
            <div className="trip-section-kicker">Suggested stops</div>
            <h2>Ranked from {scopeLabel.toLowerCase()}</h2>
            <div className="trip-card-subtitle">Choose a target plan, then add stops directly into it.</div>
          </div>
          <div className="trip-suggestion-target">
            <label>Adding to</label>
            <select value={suggestionTargetId} onChange={e => setSuggestionTargetId(e.target.value)}>
              <option value="">Current draft</option>
              {editablePlans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.title} · {plan.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="trip-suggestion-search">
          <input
            placeholder="Search species..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loadingSuggestions ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="suggestion-list">
            {suggestions.map(suggestion => (
              <div key={suggestion.loc_key} className="suggestion-card">
                <div>
                  <div style={{ fontWeight: 600 }}>{suggestion.location_name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {suggestion.state_province || 'Unknown state'} · {suggestion.species_count} species · {suggestion.visit_count} visits
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Recent visit: {suggestion.last_visit}
                  </div>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addSuggestionToPlan(suggestion)}
                  disabled={suggestionTargetId && !plans.some(plan => String(plan.id) === String(suggestionTargetId))}
                >
                  Add stop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
