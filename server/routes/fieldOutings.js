import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

function normalize(row) {
  if (!row) return null
  return {
    ...row,
    observation_count: Number(row.observation_count || 0),
    species_count: Number(row.species_count || 0),
    observations: row.observations || []
  }
}

async function getOuting(id, userId) {
  const outing = await db.execute({
    sql: `SELECT o.*,
                 COUNT(s.id) as observation_count,
                 COUNT(DISTINCT COALESCE(s.species_code, s.common_name)) as species_count
          FROM field_outings o
          LEFT JOIN sightings s ON s.outing_id = o.id
          WHERE o.id=? AND o.user_id=?
          GROUP BY o.id`,
    args: [id, userId]
  })
  if (!outing.rows.length) return null

  const observations = await db.execute({
    sql: `SELECT s.id, s.common_name, s.scientific_name, s.species_code, s.count,
                 s.observed_date, s.observed_time, s.observation_details,
                 s.source, s.imported_at
          FROM sightings s WHERE s.outing_id=? ORDER BY s.id DESC`,
    args: [id]
  })
  return normalize({ ...outing.rows[0], observations: observations.rows })
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT o.*,
                   COUNT(s.id) as observation_count,
                   COUNT(DISTINCT COALESCE(s.species_code, s.common_name)) as species_count
            FROM field_outings o
            LEFT JOIN sightings s ON s.outing_id = o.id
            WHERE o.user_id=?
            GROUP BY o.id
            ORDER BY o.started_at DESC LIMIT 50`,
      args: [req.user.id]
    })
    res.json(result.rows.map(normalize))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/current', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id FROM field_outings WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1`,
      args: [req.user.id]
    })
    res.json(result.rows[0] ? await getOuting(result.rows[0].id, req.user.id) : null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const outing = await getOuting(req.params.id, req.user.id)
    if (!outing) return res.status(404).json({ error: 'Outing not found' })
    res.json(outing)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, location_name, latitude, longitude, started_at, notes } = req.body || {}
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Outing name is required' })

    const result = await db.execute({
      sql: `INSERT INTO field_outings
            (user_id, title, location_name, latitude, longitude, started_at, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      args: [
        req.user.id,
        String(title).trim(),
        location_name ? String(location_name).trim() : null,
        latitude === '' || latitude == null ? null : Number(latitude),
        longitude === '' || longitude == null ? null : Number(longitude),
        started_at || new Date().toISOString(),
        notes ? String(notes).trim() : null
      ]
    })
    res.status(201).json(await getOuting(result.lastInsertRowid, req.user.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const current = await getOuting(req.params.id, req.user.id)
    if (!current) return res.status(404).json({ error: 'Outing not found' })

    const fields = []
    const args = []
    for (const [column, value] of [
      ['title', req.body.title],
      ['location_name', req.body.location_name],
      ['notes', req.body.notes],
      ['status', req.body.status],
      ['ended_at', req.body.ended_at]
    ]) {
      if (value !== undefined) {
        fields.push(`${column}=?`)
        args.push(value || null)
      }
    }
    if (req.body.status === 'completed' && req.body.ended_at === undefined) {
      fields.push('ended_at=?')
      args.push(new Date().toISOString())
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })
    fields.push("updated_at=datetime('now')")
    args.push(req.params.id, req.user.id)
    await db.execute({ sql: `UPDATE field_outings SET ${fields.join(', ')} WHERE id=? AND user_id=?`, args })
    res.json(await getOuting(req.params.id, req.user.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
