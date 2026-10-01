import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { ebirdGet } from '../ebird.js'

const router = Router()

function normalize(row) {
  if (!row) return null
  let plannedSpecies = []
  try { plannedSpecies = row.planned_species_json ? JSON.parse(row.planned_species_json) : [] } catch { plannedSpecies = [] }
  return {
    ...row,
    planned_species: plannedSpecies,
    observation_count: Number(row.observation_count || 0),
    species_count: Number(row.species_count || 0),
    observations: row.observations || []
  }
}

async function geocodePlace(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  const response = await fetch(url, { headers: { 'User-Agent': 'FieldNotes birding app contact@jkomg.us' } })
  if (!response.ok) throw new Error('Place search is temporarily unavailable')
  const results = await response.json()
  if (!results.length) return null
  const place = results[0]
  return { display_name: place.display_name, latitude: Number(place.lat), longitude: Number(place.lon) }
}

function likelySpecies(observations) {
  const byCode = new Map()
  for (const item of observations) {
    const key = item.speciesCode || item.comName
    if (!key) continue
    const current = byCode.get(key) || {
      species_code: item.speciesCode,
      common_name: item.comName,
      scientific_name: item.sciName,
      sightings: 0,
      latest: item.obsDt,
      how_many: 0
    }
    current.sightings += 1
    current.how_many += Number(item.howMany || 0)
    if (item.obsDt && (!current.latest || item.obsDt > current.latest)) current.latest = item.obsDt
    byCode.set(key, current)
  }
  return [...byCode.values()].sort((a, b) => b.sightings - a.sightings || b.how_many - a.how_many).slice(0, 30)
}

const weatherDescriptions = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Foggy', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers', 95: 'Thunderstorms', 96: 'Storms', 99: 'Storms'
}

async function getFieldForecast(place) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', place.latitude)
  url.searchParams.set('longitude', place.longitude)
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset')
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('timezone', 'auto')
  const response = await fetch(url)
  if (!response.ok) throw new Error('Weather unavailable')
  const data = await response.json()
  const day = data.daily?.time?.[1] ? 1 : 0
  return {
    date: data.daily.time[day],
    description: weatherDescriptions[data.daily.weather_code[day]] || 'Mixed conditions',
    high: Math.round(data.daily.temperature_2m_max[day]),
    low: Math.round(data.daily.temperature_2m_min[day]),
    rain_probability: data.daily.precipitation_probability_max[day],
    sunrise: data.daily.sunrise[day],
    sunset: data.daily.sunset[day],
    timezone: data.timezone
  }
}

router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim()
    if (query.length < 3) return res.status(400).json({ error: 'Enter a park, preserve, town, or address.' })
    const place = await geocodePlace(query)
    if (!place) return res.status(404).json({ error: 'No place found. Try a nearby town or park name.' })

    const [user, householdSpecies, weatherResult] = await Promise.all([
      db.execute({ sql: 'SELECT ebird_api_key FROM users WHERE id=?', args: [req.user.id] }),
      db.execute('SELECT DISTINCT species_code, common_name FROM sightings WHERE species_code IS NOT NULL OR common_name IS NOT NULL'),
      getFieldForecast(place).catch(() => null)
    ])
    const apiKey = user.rows[0]?.ebird_api_key
    const seenAtHome = new Set(householdSpecies.rows.map(item => item.species_code || item.common_name?.toLowerCase()).filter(Boolean))
    if (!apiKey) return res.json({ place, species: [], hotspots: [], weather: weatherResult, needs_ebird: true })

    const [observationsResult, hotspotsResult] = await Promise.allSettled([
      ebirdGet(`/v2/data/obs/geo/recent?lat=${place.latitude}&lng=${place.longitude}&dist=25&back=14&maxResults=200`, apiKey),
      ebirdGet(`/v2/ref/hotspot/geo?lat=${place.latitude}&lng=${place.longitude}&dist=25`, apiKey)
    ])
    const observations = observationsResult.status === 'fulfilled' ? observationsResult.value : []
    const hotspots = hotspotsResult.status === 'fulfilled' ? hotspotsResult.value : []
    const species = likelySpecies(observations).map(item => ({
      ...item,
      seen_by_us: seenAtHome.has(item.species_code || item.common_name?.toLowerCase()),
      priority: seenAtHome.has(item.species_code || item.common_name?.toLowerCase()) ? 'familiar' : 'new'
    })).sort((a, b) => Number(b.priority === 'new') - Number(a.priority === 'new') || b.sightings - a.sightings)
    res.json({
      place,
      species,
      weather: weatherResult,
      hotspots: hotspots.slice(0, 8).map(item => ({ loc_id: item.locId, name: item.locName, latitude: item.lat, longitude: item.lng, distance: item.distance }))
    })
  } catch (err) {
    console.error('Outing suggestions error:', err)
    res.status(502).json({ error: 'Could not load birding suggestions right now. You can still start the outing.' })
  }
})

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
    const { title, location_name, latitude, longitude, started_at, notes, planned_species } = req.body || {}
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Outing name is required' })

    const result = await db.execute({
      sql: `INSERT INTO field_outings
            (user_id, title, location_name, latitude, longitude, started_at, notes, planned_species_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      args: [
        req.user.id,
        String(title).trim(),
        location_name ? String(location_name).trim() : null,
        latitude === '' || latitude == null ? null : Number(latitude),
        longitude === '' || longitude == null ? null : Number(longitude),
        started_at || new Date().toISOString(),
        notes ? String(notes).trim() : null,
        JSON.stringify(Array.isArray(planned_species) ? planned_species.slice(0, 50) : [])
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
