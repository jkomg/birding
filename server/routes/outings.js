import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const { user: userFilter, limit = 50, offset = 0 } = req.query
    let sql = `SELECT
                 s.submission_id, s.observed_date, s.observed_time, s.location_name,
                 s.location_id, s.latitude, s.longitude, s.state_province, s.protocol,
                 s.duration_min, s.checklist_comments,
                 u.username, u.display_name,
                 COUNT(*) as species_count
               FROM sightings s
               JOIN users u ON s.user_id = u.id
               WHERE 1=1`
    const args = []

    if (userFilter && userFilter !== 'both') {
      sql += ' AND u.username = ?'
      args.push(userFilter)
    }

    sql += ` GROUP BY s.submission_id, u.id
             ORDER BY s.observed_date DESC, s.observed_time DESC
             LIMIT ? OFFSET ?`
    args.push(Number(limit), Number(offset))

    const r = await db.execute({ sql, args })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:submissionId', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({
      sql: `SELECT s.*, u.username, u.display_name FROM sightings s
            JOIN users u ON s.user_id = u.id
            WHERE s.submission_id = ?
            ORDER BY s.taxonomic_order ASC NULLS LAST`,
      args: [req.params.submissionId]
    })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
