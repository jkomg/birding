import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const { user: userFilter } = req.query
    const filterClause = userFilter && userFilter !== 'both' ? 'AND u.username = ?' : ''
    const filterArg = userFilter && userFilter !== 'both' ? [userFilter] : []

    const [perUser, recent, shared] = await Promise.all([
      db.execute(`
        SELECT u.username, u.display_name,
               COUNT(DISTINCT COALESCE(s.species_code, s.common_name)) as species_count
        FROM users u LEFT JOIN sightings s ON s.user_id = u.id
        GROUP BY u.id
      `),
      db.execute({
        sql: `SELECT s.*, u.username, u.display_name FROM sightings s
              JOIN users u ON s.user_id = u.id WHERE 1=1 ${filterClause}
              ORDER BY s.observed_date DESC, s.imported_at DESC LIMIT 10`,
        args: filterArg
      }),
      // Species seen by BOTH users (intersection)
      db.execute(`
        SELECT COUNT(DISTINCT a.key) as shared_count FROM (
          SELECT COALESCE(s.species_code, s.common_name) as key, s.user_id
          FROM sightings s GROUP BY COALESCE(s.species_code, s.common_name), s.user_id
        ) a
        JOIN (
          SELECT COALESCE(s.species_code, s.common_name) as key, s.user_id
          FROM sightings s GROUP BY COALESCE(s.species_code, s.common_name), s.user_id
        ) b ON a.key = b.key AND a.user_id != b.user_id
      `)
    ])

    // Put logged-in user first
    const me = req.user.username
    const sorted = [...perUser.rows].sort((a, b) =>
      a.username === me ? -1 : b.username === me ? 1 : 0
    )

    res.json({
      shared_species: shared.rows[0]?.shared_count ?? 0,
      per_user: sorted,
      recent_sightings: recent.rows
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
