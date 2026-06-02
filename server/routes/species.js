import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { getWikimediaPhotos, getMacaulayPhotos } from '../wikimedia.js'

const router = Router()

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
