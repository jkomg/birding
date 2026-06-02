import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

// GeoJSON endpoint for the map
router.get('/geojson', requireAuth, async (req, res) => {
  try {
    const { user: userFilter, from, to, species, state } = req.query

    let sql = `SELECT s.*, u.display_name, u.username FROM sightings s
               JOIN users u ON s.user_id = u.id
               WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL`
    const args = []

    if (userFilter && userFilter !== 'both') {
      sql += ' AND u.username = ?'
      args.push(userFilter)
    }
    if (from) { sql += ' AND s.observed_date >= ?'; args.push(from) }
    if (to) { sql += ' AND s.observed_date <= ?'; args.push(to) }
    if (species) { sql += ' AND (s.common_name LIKE ? OR s.scientific_name LIKE ?)'; args.push(`%${species}%`, `%${species}%`) }
    if (state) { sql += ' AND s.state_province = ?'; args.push(state) }

    sql += ' ORDER BY s.observed_date DESC LIMIT 5000'

    const r = await db.execute({ sql, args })

    const geojson = {
      type: 'FeatureCollection',
      features: r.rows.map(row => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
        properties: {
          id: row.id,
          common_name: row.common_name,
          scientific_name: row.scientific_name,
          species_code: row.species_code,
          observed_date: row.observed_date,
          location_name: row.location_name,
          count: row.count,
          username: row.username,
          display_name: row.display_name,
          submission_id: row.submission_id
        }
      }))
    }

    res.json(geojson)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// List sightings
router.get('/', requireAuth, async (req, res) => {
  try {
    const { user: userFilter, limit = 50, offset = 0 } = req.query
    let sql = `SELECT s.*, u.display_name, u.username FROM sightings s
               JOIN users u ON s.user_id = u.id WHERE 1=1`
    const args = []

    if (userFilter && userFilter !== 'both') {
      sql += ' AND u.username = ?'
      args.push(userFilter)
    }

    sql += ' ORDER BY s.observed_date DESC LIMIT ? OFFSET ?'
    args.push(Number(limit), Number(offset))

    const r = await db.execute({ sql, args })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
