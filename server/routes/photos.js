import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { uploadPhoto, deletePhoto } from '../storage.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    cb(ok ? null : new Error('Only JPEG, PNG, WEBP allowed'), ok)
  }
})

router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' })

    const { sighting_id, species_code, caption, taken_at } = req.body
    const ext = path.extname(req.file.originalname) || '.jpg'
    const filename = `${req.user.id}/${crypto.randomUUID()}${ext}`

    const { gcs_path, public_url } = await uploadPhoto(req.file.buffer, filename, req.file.mimetype)

    const inserted = await db.execute({
      sql: `INSERT INTO photos (user_id, sighting_id, species_code, gcs_path, public_url, caption, taken_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [req.user.id, sighting_id || null, species_code || null, gcs_path, public_url, caption || null, taken_at || null]
    })

    res.json({ id: Number(inserted.lastInsertRowid), sighting_id: sighting_id || null, species_code: species_code || null, gcs_path, public_url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/outing/:outingId', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.*, s.common_name, s.observed_date FROM photos p
            JOIN sightings s ON s.id=p.sighting_id
            WHERE s.outing_id=? AND s.user_id=? ORDER BY p.uploaded_at DESC`,
      args: [req.params.outingId, req.user.id]
    })
    res.json(result.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/species/:code', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({
      sql: 'SELECT * FROM photos WHERE species_code=? ORDER BY uploaded_at DESC',
      args: [req.params.code]
    })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM photos WHERE id=? AND user_id=?', args: [req.params.id, req.user.id] })
    const photo = r.rows[0]
    if (!photo) return res.status(404).json({ error: 'Not found' })

    await deletePhoto(photo.gcs_path)
    await db.execute({ sql: 'DELETE FROM photos WHERE id=?', args: [req.params.id] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
