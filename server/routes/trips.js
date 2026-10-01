import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

function parseItinerary(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizePlan(row) {
  return {
    ...row,
    itinerary: parseItinerary(row.itinerary_json)
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({
      sql: `SELECT *
            FROM trip_plans
            WHERE user_id = ?
            ORDER BY trip_date DESC, updated_at DESC, id DESC`,
      args: [req.user.id]
    })

    res.json(r.rows.map(normalizePlan))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const { user: userFilter, species = '', state = '', limit = 12 } = req.query
    const args = []
    let where = 'WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL'

    if (userFilter && userFilter !== 'both') {
      where += ' AND u.username = ?'
      args.push(userFilter)
    }

    if (state) {
      where += ' AND s.state_province = ?'
      args.push(state)
    }

    if (species) {
      where += ' AND (s.common_name LIKE ? OR s.scientific_name LIKE ? OR s.species_code LIKE ?)'
      const term = `%${species}%`
      args.push(term, term, term)
    }

    args.push(Number(limit))

    const r = await db.execute({
      sql: `SELECT
              COALESCE(s.location_id, s.location_name) as loc_key,
              s.location_name,
              s.location_id,
              s.latitude,
              s.longitude,
              s.state_province,
              COUNT(DISTINCT COALESCE(s.species_code, s.common_name)) as species_count,
              COUNT(DISTINCT s.submission_id) as visit_count,
              MAX(s.observed_date) as last_visit,
              MIN(s.observed_date) as first_visit
            FROM sightings s
            JOIN users u ON s.user_id = u.id
            ${where}
            GROUP BY COALESCE(s.location_id, s.location_name), s.location_name, s.location_id, s.latitude, s.longitude, s.state_province
            ORDER BY species_count DESC, visit_count DESC, last_visit DESC
            LIMIT ?`,
      args
    })

    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      title,
      trip_date,
      start_time,
      end_time,
      target_species,
      target_area,
      notes,
      itinerary = [],
      status = 'draft'
    } = req.body

    if (!title?.trim() || !trip_date) {
      return res.status(400).json({ error: 'Title and trip date are required' })
    }

    const r = await db.execute({
      sql: `INSERT INTO trip_plans
            (user_id, title, trip_date, start_time, end_time, target_species, target_area, notes, itinerary_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        req.user.id,
        title.trim(),
        trip_date,
        start_time || null,
        end_time || null,
        target_species || null,
        target_area || null,
        notes || null,
        JSON.stringify(parseItinerary(itinerary)),
        status
      ]
    })

    const created = await db.execute({
      sql: 'SELECT * FROM trip_plans WHERE id = ?',
      args: [r.lastInsertRowid]
    })

    res.status(201).json(normalizePlan(created.rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const planResult = await db.execute({ sql: 'SELECT * FROM trip_plans WHERE id=? AND user_id=?', args: [req.params.id, req.user.id] })
    const plan = planResult.rows[0]
    if (!plan) return res.status(404).json({ error: 'Trip plan not found' })

    const active = await db.execute({ sql: "SELECT id FROM field_outings WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1", args: [req.user.id] })
    if (active.rows[0]) return res.json({ outing_id: Number(active.rows[0].id), already_active: true })

    const itinerary = parseItinerary(plan.itinerary_json)
    const firstStop = itinerary.find(stop => stop.location_name) || {}
    const plannedSpecies = String(plan.target_species || '')
      .split(',').map(name => name.trim()).filter(Boolean)
      .map(common_name => ({ common_name, sightings: 0, priority: 'target' }))

    const result = await db.execute({
      sql: `INSERT INTO field_outings
            (user_id, title, location_name, latitude, longitude, started_at, notes, planned_species_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      args: [
        req.user.id,
        plan.title,
        firstStop.location_name || plan.target_area || null,
        firstStop.latitude ?? null,
        firstStop.longitude ?? null,
        new Date().toISOString(),
        plan.notes || null,
        JSON.stringify(plannedSpecies),
        JSON.stringify(itinerary)
      ]
    })

    await db.execute({ sql: "UPDATE trip_plans SET status='planned', updated_at=datetime('now') WHERE id=? AND user_id=?", args: [req.params.id, req.user.id] })
    res.status(201).json({ outing_id: Number(result.lastInsertRowid) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM trip_plans WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    })

    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Trip plan not found' })
    }

    const fields = []
    const args = []

    for (const [column, value] of [
      ['title', req.body.title],
      ['trip_date', req.body.trip_date],
      ['start_time', req.body.start_time],
      ['end_time', req.body.end_time],
      ['target_species', req.body.target_species],
      ['target_area', req.body.target_area],
      ['notes', req.body.notes],
      ['status', req.body.status]
    ]) {
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        args.push(value || null)
      }
    }

    if (req.body.itinerary !== undefined) {
      fields.push('itinerary_json = ?')
      args.push(JSON.stringify(parseItinerary(req.body.itinerary)))
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'Nothing to update' })
    }

    fields.push("updated_at = datetime('now')")
    args.push(req.params.id, req.user.id)

    await db.execute({
      sql: `UPDATE trip_plans SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args
    })

    const updated = await db.execute({
      sql: 'SELECT * FROM trip_plans WHERE id = ?',
      args: [req.params.id]
    })

    res.json(normalizePlan(updated.rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM trip_plans WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
