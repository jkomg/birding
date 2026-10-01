import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { getWikimediaPhotos, getMacaulayPhotos } from '../wikimedia.js'
import { ebirdGet } from '../ebird.js'

const router = Router()
let taxonomyCache = { key: '', expires: 0, rows: [] }

router.get('/search', requireAuth, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase()
    if (query.length < 2) return res.json([])
    const user = await db.execute({ sql: 'SELECT ebird_api_key FROM users WHERE id=?', args: [req.user.id] })
    const apiKey = user.rows[0]?.ebird_api_key
    let rows = []
    if (apiKey) {
      if (taxonomyCache.key !== apiKey || taxonomyCache.expires < Date.now()) {
        taxonomyCache = { key: apiKey, expires: Date.now() + 6 * 60 * 60 * 1000, rows: await ebirdGet('/v2/ref/taxonomy/ebird', apiKey) }
      }
      rows = taxonomyCache.rows
        .filter(item => [item.comName, item.sciName, item.speciesCode].some(value => String(value || '').toLowerCase().includes(query)))
        .slice(0, 12)
        .map(item => ({ common_name: item.comName, scientific_name: item.sciName, species_code: item.speciesCode }))
    } else {
      const result = await db.execute({
        sql: `SELECT common_name, scientific_name, species_code FROM sightings
              WHERE lower(common_name) LIKE ? OR lower(scientific_name) LIKE ? OR lower(species_code) LIKE ?
              GROUP BY common_name, scientific_name, species_code ORDER BY common_name LIMIT 12`,
        args: [`%${query}%`, `%${query}%`, `%${query}%`]
      })
      rows = result.rows
    }
    res.json(rows)
  } catch {
    res.status(502).json({ error: 'Species search is unavailable right now' })
  }
})

router.get('/:identifier', requireAuth, async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier)

    // Try species_code first, then common_name
    const [sightings, cached] = await Promise.all([
      db.execute({
        sql: `SELECT s.*, u.username, u.display_name FROM sightings s
              JOIN users u ON s.user_id = u.id
              WHERE s.species_code = ? OR s.common_name = ?
              ORDER BY s.observed_date DESC`,
        args: [identifier, identifier]
      }),
      db.execute({
        sql: 'SELECT * FROM species_cache WHERE species_code = ?',
        args: [identifier]
      })
    ])

    const scientificName = sightings.rows[0]?.scientific_name ?? cached.rows[0]?.scientific_name ?? ''
    const speciesCode = sightings.rows[0]?.species_code ?? identifier

    const userPhotos = await db.execute({
      sql: 'SELECT * FROM photos WHERE species_code = ? ORDER BY uploaded_at DESC',
      args: [speciesCode]
    })

    const [wikimediaPhotos, macaulayPhotos] = await Promise.all([
      getWikimediaPhotos(scientificName, 6),
      getMacaulayPhotos(speciesCode !== identifier ? speciesCode : null, 6)
    ])

    res.json({
      species: cached.rows[0] ?? null,
      sightings: sightings.rows,
      user_photos: userPhotos.rows,
      macaulay_photos: macaulayPhotos,
      wikimedia_photos: wikimediaPhotos
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
