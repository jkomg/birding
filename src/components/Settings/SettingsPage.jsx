import { useState, useEffect } from 'react'
import { useAuth } from '../../App.jsx'

export default function SettingsPage() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ display_name: '', ebird_api_key: '', ebird_display_name: '', ebird_regions: '', current_password: '', new_password: '' })
  const [syncLog, setSyncLog] = useState([])
  const [syncDetails, setSyncDetails] = useState(null)
  const [regionSuggestions, setRegionSuggestions] = useState([])
  const [regionCounts, setRegionCounts] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [loadingRegions, setLoadingRegions] = useState(false)
  const [loadingDebug, setLoadingDebug] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const automationReady = Boolean(user?.has_ebird_api_key && user?.ebird_display_name && user?.ebird_regions)

  useEffect(() => {
    if (user) setForm(f => ({ ...f, display_name: user.display_name || '', ebird_display_name: user.ebird_display_name || '', ebird_regions: user.ebird_regions || '' }))
    fetch('/api/sync/log', { credentials: 'include' }).then(r => r.json()).then(setSyncLog)
  }, [user])

  async function save(e) {
    e.preventDefault()
    setSaving(true); setMsg(''); setError('')
    const body = { display_name: form.display_name, ebird_api_key: form.ebird_api_key || undefined, ebird_display_name: form.ebird_display_name, ebird_regions: form.ebird_regions }
    if (form.new_password) { body.current_password = form.current_password; body.new_password = form.new_password }
    const res = await fetch('/api/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setMsg('Saved!')
    // Refresh user
    const me = await fetch('/api/me', { credentials: 'include' }).then(r => r.json())
    setUser(me)
    setSaving(false)
  }

  async function syncNow() {
    setSyncing(true); setMsg(''); setError('')
    const res = await fetch('/api/sync', { method: 'POST', credentials: 'include' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSyncing(false); return }
    setSyncDetails(data)
    setMsg(data.message || `Sync complete: ${data.newCount} new sightings`)
    const log = await fetch('/api/sync/log', { credentials: 'include' }).then(r => r.json())
    setSyncLog(log)
    setSyncing(false)
  }

  async function loadRegionSuggestions() {
    setLoadingRegions(true)
    setError('')
    try {
      const res = await fetch('/api/sync/regions', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not load region suggestions')
        return
      }
      setRegionSuggestions(Array.isArray(data.regions) ? data.regions : [])
      setRegionCounts(Array.isArray(data.counts) ? data.counts : [])
      if (Array.isArray(data.regions) && data.regions.length) {
        setForm(prev => ({ ...prev, ebird_regions: data.regions.join(',') }))
        setMsg('Filled regions from your existing sightings.')
      } else {
        setMsg('No regions found yet. Import or sync some sightings first.')
      }
    } finally {
      setLoadingRegions(false)
    }
  }

  async function runSyncDebug() {
    setLoadingDebug(true)
    setError('')
    try {
      const res = await fetch('/api/sync/debug', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not run sync debug')
        return
      }
      setSyncDetails(prev => ({ ...(prev || {}), debug: data }))
    } finally {
      setLoadingDebug(false)
    }
  }

  function field(key, label, opts = {}) {
    return (
      <div className="form-group">
        <label>{label}</label>
        <input {...opts} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="page-header"><h1>Settings</h1></div>
      <div className="card">
        <form onSubmit={save}>
          {field('display_name', 'Display Name')}
          {field('ebird_api_key', 'eBird API Key (leave blank to keep current)', { placeholder: 'Enter to update...' })}
          {field('ebird_display_name', 'eBird Display Name (must match profile exactly)')}
          {field('ebird_regions', 'Home Regions (comma-separated, e.g. US-VA,US-MD)')}
          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #d8e8d8' }} />
          {field('current_password', 'Current Password (only needed to change password)', { type: 'password' })}
          {field('new_password', 'New Password (leave blank to keep current)', { type: 'password' })}
          {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          {msg && <div style={{ color: '#2d6a4f', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{msg}</div>}
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>eBird Automation</h2>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Once your API key, display name, and home regions are set, the app checks eBird every 6 hours and imports new checklists automatically.
        </div>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', background: 'var(--bg)', fontSize: '0.875rem' }}>
            1. Add your eBird API key so the app can poll your regions.
          </div>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', background: 'var(--bg)', fontSize: '0.875rem' }}>
            2. Match your eBird display name exactly so the sync can find your checklist author name.
          </div>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', background: 'var(--bg)', fontSize: '0.875rem' }}>
            3. Add one or more home regions, then use Sync Now once to confirm it works.
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          {[
            { label: 'API key configured', ok: Boolean(user?.has_ebird_api_key) },
            { label: 'eBird display name matches', ok: Boolean(user?.ebird_display_name) },
            { label: 'Home regions configured', ok: Boolean(user?.ebird_regions) }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.45rem 0.65rem', background: 'var(--bg)', borderRadius: '6px' }}>
              <span>{item.label}</span>
              <span style={{ color: item.ok ? 'var(--green)' : 'var(--danger)' }}>
                {item.ok ? 'Ready' : 'Missing'}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {automationReady
            ? 'Automation is ready. Use Sync Now to test the connection, then let the cron job pull new sightings in the background.'
            : 'Finish the missing fields above before automation can run.'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          <button type="button" className="secondary" onClick={loadRegionSuggestions} disabled={loadingRegions}>
            {loadingRegions ? 'Finding regions...' : 'Auto-fill regions'}
          </button>
          <button type="button" className="secondary" onClick={runSyncDebug} disabled={loadingDebug}>
            {loadingDebug ? 'Checking...' : 'Run sync debug'}
          </button>
        </div>
        {(regionSuggestions.length > 0 || regionCounts.length > 0) && (
          <div style={{ marginTop: '0.9rem', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Suggested regions</div>
            {regionSuggestions.length > 0 ? (
              <div style={{ marginBottom: '0.55rem' }}>{regionSuggestions.join(', ')}</div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>No regions found yet.</div>
            )}
            {regionCounts.length > 0 && (
              <div style={{ color: 'var(--text-muted)' }}>
                {regionCounts.slice(0, 6).map(item => (
                  <div key={item.region}>
                    {item.region}: {item.sighting_count}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem' }}>eBird Sync</h2>
          <button onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#5a7a5a', marginBottom: '0.75rem' }}>
          Last synced: {user?.last_synced_at ? new Date(user.last_synced_at).toLocaleString() : 'Never'}
        </div>
        {syncLog.map(l => (
          <div key={l.id} style={{ fontSize: '0.8rem', borderTop: '1px solid #d8e8d8', padding: '0.4rem 0', display: 'flex', justifyContent: 'space-between' }}>
            <span>{new Date(l.synced_at).toLocaleString()}</span>
            <span style={{ color: l.status === 'success' ? '#2d6a4f' : '#c0392b' }}>
              {l.status === 'success' ? `+${l.new_sightings} sightings` : l.message}
            </span>
          </div>
        ))}
        {syncDetails && (
          <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Latest sync details</div>
            <div>Regions checked: {syncDetails.regionsChecked ?? 0}</div>
            <div>Checklist candidates: {syncDetails.candidateChecklistCount ?? 0}</div>
            <div>Matched your eBird display name: {syncDetails.matchedChecklistCount ?? 0}</div>
            {syncDetails.message && <div style={{ marginTop: '0.35rem' }}>{syncDetails.message}</div>}
            {syncDetails.newCount === 0 && syncDetails.uniqueNamesByRegion && (
              <div style={{ marginTop: '0.6rem', color: 'var(--text-muted)' }}>
                {Object.entries(syncDetails.uniqueNamesByRegion).map(([region, names]) => (
                  <div key={region} style={{ marginBottom: '0.35rem' }}>
                    <div style={{ fontWeight: 600 }}>{region}</div>
                    <div>{Array.isArray(names) && names.length ? names.join(', ') : 'No names returned'}</div>
                  </div>
                ))}
              </div>
            )}
            {syncDetails.debug && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.65rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Debug names from eBird</div>
                {Object.entries(syncDetails.debug.results || {}).map(([region, data]) => (
                  <div key={region} style={{ marginBottom: '0.4rem' }}>
                    <div style={{ fontWeight: 600 }}>{region} ({data.total})</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {Array.isArray(data.unique_names) && data.unique_names.length ? data.unique_names.join(', ') : 'No names returned'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
