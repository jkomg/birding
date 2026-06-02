import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function ImportPage() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/import', { method: 'POST', credentials: 'include', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed'); return }
      setResult(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="page-header"><h1>Import eBird CSV</h1></div>
      <div className="card">
        <p style={{ marginBottom: '1rem', color: '#5a7a5a', fontSize: '0.875rem' }}>
          This is the one-time historical seed. Export from eBird: My eBird → Download My Data, upload the CSV once, then use Settings for automatic sync going forward.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>MyEBirdData.csv</label>
            <input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} />
          </div>
          {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          <button type="submit" disabled={!file || loading}>
            {loading ? 'Importing...' : 'Import'}
          </button>
        </form>
        {result && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0faf0', borderRadius: '6px', fontSize: '0.875rem' }}>
            <strong>Done!</strong> {result.added} sightings added, {result.skipped} skipped (already existed).
          </div>
        )}
        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Need to wire up the API side next? Go to <Link to="/settings">Settings</Link> to add your eBird key, display name, and home regions.
        </div>
      </div>
    </div>
  )
}
