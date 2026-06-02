import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const { user: userFilter } = req.query
    let sql, args = []

    if (!userFilter || userFilter === 'both') {
      sql = `SELECT
               s.species_code, s.common_name, s.scientific_name, s.taxonomic_order,
               COUNT(*) as total_sightings,
               MIN(s.observed_date) as first_seen,
               COUNT(DISTINCT s.user_id) as observer_count
             FROM sightings s
             GROUP BY COALESCE(s.species_code, s.common_name), s.common_name, s.scientific_name, s.taxonomic_order
             ORDER BY s.taxonomic_order ASC NULLS LAST, s.common_name ASC`
    } else {
      sql = `SELECT
               s.species_code, s.common_name, s.scientific_name, s.taxonomic_order,
               COUNT(*) as total_sightings,
               MIN(s.observed_date) as first_seen,
               1 as observer_count
             FROM sightings s
             JOIN users u ON s.user_id = u.id
             WHERE u.username = ?
             GROUP BY COALESCE(s.species_code, s.common_name), s.common_name, s.scientific_name, s.taxonomic_order
             ORDER BY s.taxonomic_order ASC NULLS LAST, s.common_name ASC`
      args.push(userFilter)
    }

    const r = await db.execute({ sql, args })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
