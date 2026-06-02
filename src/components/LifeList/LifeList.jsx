import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserFilter } from '../../App.jsx'

export default function LifeList() {
  const navigate = useNavigate()
  const { filter } = useUserFilter()
  const [species, setSpecies] = useState([])
  const [sort, setSort] = useState('taxonomic')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lifelist?user=${filter}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setSpecies(d); setLoading(false) })
  }, [filter])

  const filtered = species
    .filter(s => !search || s.common_name.toLowerCase().includes(search.toLowerCase()) || s.scientific_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'taxonomic'
      ? (a.taxonomic_order ?? 9999) - (b.taxonomic_order ?? 9999)
      : a.common_name.localeCompare(b.common_name))

  function exportCSV() {
    const rows = [['Common Name', 'Scientific Name', 'First Seen', 'Total Sightings']]
    filtered.forEach(s => rows.push([s.common_name, s.scientific_name, s.first_seen, s.total_sightings]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'lifelist.csv'
    a.click()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Life List <span style={{ color: '#5a7a5a', fontWeight: 400, fontSize: '1.1rem' }}>({filtered.length} species)</span></h1>
        <button className="secondary" onClick={exportCSV}>Export CSV</button>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input placeholder="Search species..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="taxonomic">Taxonomic Order</option>
          <option value="alpha">Alphabetical</option>
        </select>
      </div>
      {loading ? <div className="loading">Loading...</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Common Name</th>
                <th>Scientific Name</th>
                <th>First Seen</th>
                <th>Sightings</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.species_code || s.common_name}
                  onClick={() => navigate(`/species/${encodeURIComponent(s.species_code || s.common_name)}`)}
                  style={{ cursor: 'pointer' }}>
                  <td><strong>{s.common_name}</strong></td>
                  <td style={{ fontStyle: 'italic', color: '#5a7a5a', fontSize: '0.85rem' }}>{s.scientific_name}</td>
                  <td>{s.first_seen}</td>
                  <td>{s.total_sightings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
