import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

// Location-grouped markers
router.get('/locations', requireAuth, async (req, res) => {
  try {
    const { user: userFilter, species } = req.query
    const args = []
    let where = 'WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL'

    if (userFilter && userFilter !== 'both') {
      where += ' AND u.username = ?'
      args.push(userFilter)
    }
    if (species) {
      where += ' AND (s.common_name LIKE ? OR s.scientific_name LIKE ?)'
      args.push(`%${species}%`, `%${species}%`)
    }

    const r = await db.execute({
      sql: `SELECT
              COALESCE(s.location_id, s.location_name) as loc_key,
              s.location_name, s.latitude, s.longitude, s.state_province,
              COUNT(DISTINCT COALESCE(s.species_code, s.common_name)) as species_count,
              COUNT(DISTINCT s.submission_id) as visit_count,
              MAX(s.observed_date) as last_visit,
              COUNT(DISTINCT s.user_id) as observer_count
            FROM sightings s
            JOIN users u ON s.user_id = u.id
            ${where}
            GROUP BY COALESCE(s.location_id, s.location_name)
            ORDER BY last_visit DESC`,
      args
    })

    const features = r.rows.map(row => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      properties: {
        loc_key: row.loc_key,
        location_name: row.location_name,
        state_province: row.state_province,
        species_count: row.species_count,
        visit_count: row.visit_count,
        last_visit: row.last_visit,
        observer_count: row.observer_count
      }
    }))

    res.json({ type: 'FeatureCollection', features })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Species at a location
router.get('/location/:locKey', requireAuth, async (req, res) => {
  try {
    const { user: userFilter } = req.query
    const locKey = req.params.locKey
    const args = [locKey, locKey]
    let userWhere = ''
    if (userFilter && userFilter !== 'both') {
      userWhere = 'AND u.username = ?'
      args.push(userFilter)
    }

    const r = await db.execute({
      sql: `SELECT
              s.common_name, s.scientific_name, s.species_code, s.taxonomic_order,
              COUNT(*) as times_seen,
              MAX(s.observed_date) as last_seen,
              MIN(s.observed_date) as first_seen,
              GROUP_CONCAT(DISTINCT u.display_name) as observers
            FROM sightings s
            JOIN users u ON s.user_id = u.id
            WHERE COALESCE(s.location_id, s.location_name) = ? OR s.location_name = ?
            ${userWhere}
            GROUP BY COALESCE(s.species_code, s.common_name)
            ORDER BY s.taxonomic_order ASC NULLS LAST, s.common_name ASC`,
      args
    })

    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
