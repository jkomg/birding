import { useEffect, useMemo, useState } from 'react'
import { useAuth, useUsers, useUserFilter, getScopeLabel } from '../../App.jsx'

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
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [itinerary, setItinerary] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const scopeLabel = getScopeLabel(filter, user, users)

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
    loadSuggestions()
  }, [filter, search])

  const itineraryKeys = useMemo(
    () => new Set(itinerary.map(item => item.loc_key)),
    [itinerary]
  )

  function resetForm() {
    setSelectedPlanId(null)
    setForm(emptyForm)
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

  function addSuggestion(suggestion) {
    if (itineraryKeys.has(suggestion.loc_key)) return
    setItinerary(prev => [...prev, suggestion])
  }

  function removeSuggestion(locKey) {
    setItinerary(prev => prev.filter(item => item.loc_key !== locKey))
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

      <div className="trip-grid">
        <div className="card">
          <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>{selectedPlanId ? 'Edit Plan' : 'Create Plan'}</h2>
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
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Chosen stops</div>
            {itinerary.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Add suggested hotspots below to build your route.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {itinerary.map(stop => (
                  <div key={stop.loc_key} className="trip-stop">
                    <div>
                      <div style={{ fontWeight: 600 }}>{stop.location_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {stop.species_count} species · {stop.visit_count} visits · last {stop.last_visit}
                      </div>
                    </div>
                    <button className="secondary" onClick={() => removeSuggestion(stop.loc_key)} type="button">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem' }}>Suggested Stops</h2>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Ranked from {scopeLabel.toLowerCase()}; add stops to build a route.
              </div>
            </div>
            <input
              placeholder="Search species..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 240 }}
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
                    onClick={() => addSuggestion(suggestion)}
                    disabled={itineraryKeys.has(suggestion.loc_key)}
                  >
                    {itineraryKeys.has(suggestion.loc_key) ? 'Added' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Saved Plans</h2>
        {loadingPlans ? (
          <div className="loading">Loading...</div>
        ) : plans.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No day-trip plans yet.</div>
        ) : (
          <div className="trip-plan-list">
            {plans.map(plan => (
              <div key={plan.id} className="trip-plan-card">
                <div>
                  <div style={{ fontWeight: 700 }}>{plan.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {plan.trip_date}{plan.start_time ? ` · ${plan.start_time}` : ''}{plan.end_time ? ` to ${plan.end_time}` : ''} · {plan.status}
                  </div>
                  {plan.target_area && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{plan.target_area}</div>}
                  {plan.target_species && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Target: {plan.target_species}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={() => startEditing(plan)}>Edit</button>
                  <button type="button" className="secondary" onClick={() => deletePlan(plan.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
