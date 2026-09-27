import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

// Fast manual capture for the mobile/PWA workflow. These records intentionally
// live in the same sightings table as eBird imports so the rest of the app can
// immediately use them in the life list, map, outings, and dashboard.
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      common_name,
      scientific_name = '',
      species_code = null,
      count = 'X',
      location_name = null,
      latitude = null,
      longitude = null,
      observed_date,
      observed_time = null,
      observation_details = null,
      outing_id = null
    } = req.body || {}

    if (!String(common_name || '').trim()) {
      return res.status(400).json({ error: 'Species name is required' })
    }
    if (!observed_date) {
      return res.status(400).json({ error: 'Observation date is required' })
    }

    if (outing_id !== null && outing_id !== '') {
      const outing = await db.execute({
        sql: "SELECT id FROM field_outings WHERE id=? AND user_id=? AND status='active'",
        args: [outing_id, req.user.id]
      })
      if (!outing.rows.length) return res.status(400).json({ error: 'Active outing not found' })
    }

    const cleanName = String(common_name).trim()
    const dedupKey = species_code || cleanName
    const submissionId = `manual-${randomUUID()}`
    await db.execute({
      sql: `INSERT INTO sightings
        (user_id, submission_id, common_name, scientific_name, species_code, dedup_key,
         count, location_name, latitude, longitude, observed_date, observed_time,
         observation_details, source, outing_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        req.user.id,
        submissionId,
        cleanName,
        String(scientific_name || '').trim(),
        species_code || null,
        dedupKey,
        String(count || 'X'),
        location_name ? String(location_name).trim() : null,
        latitude === '' || latitude == null ? null : Number(latitude),
        longitude === '' || longitude == null ? null : Number(longitude),
        observed_date,
        observed_time || null,
        observation_details ? String(observation_details).trim() : null,
        'manual',
        outing_id === '' ? null : outing_id
      ]
    })

    const sighting = await db.execute({
      sql: `SELECT s.*, u.display_name, u.username
            FROM sightings s JOIN users u ON u.id = s.user_id
            WHERE s.user_id=? AND s.submission_id=?`,
      args: [req.user.id, submissionId]
    })
    res.status(201).json(sighting.rows[0])
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

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
