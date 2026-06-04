import { Router } from 'express'
import multer from 'multer'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  return lines.slice(1).map(line => {
    const values = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = '' }
      else cur += ch
    }
    values.push(cur.trim())
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const text = req.file.buffer.toString('utf-8')
    const rows = parseCSV(text)

    let added = 0, skipped = 0

    for (const row of rows) {
      if (!row['Submission ID'] || !row['Common Name']) { skipped++; continue }

      try {
        const speciesCode = row['Species Code'] || null
        const dedupKey = speciesCode ?? row['Common Name']
        const result = await db.execute({
          sql: `INSERT OR IGNORE INTO sightings
            (user_id, submission_id, common_name, scientific_name, species_code, dedup_key,
             taxonomic_order, count, location_name, location_id, latitude, longitude,
             state_province, county, observed_date, observed_time, protocol,
             duration_min, observation_details, checklist_comments, ml_catalog_numbers, source)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'csv')`,
          args: [
            req.user.id,
            row['Submission ID'],
            row['Common Name'],
            row['Scientific Name'] ?? '',
            speciesCode,
            dedupKey,
            row['Taxonomic Order'] ? parseFloat(row['Taxonomic Order']) : null,
            row['Count'] ?? 'X',
            row['Location'] ?? null,
            row['Location ID'] ?? null,
            row['Latitude'] ? parseFloat(row['Latitude']) : null,
            row['Longitude'] ? parseFloat(row['Longitude']) : null,
            row['State/Province'] ?? null,
            row['County'] ?? null,
            row['Date'] ?? null,
            row['Time'] ?? null,
            row['Protocol'] ?? null,
            row['Duration (Min)'] ? parseInt(row['Duration (Min)']) : null,
            row['Species Comments'] ?? null,
            row['Checklist Comments'] ?? null,
            row['ML Catalog Numbers'] ?? null
          ]
        })
        if (result.rowsAffected > 0) added++
        else skipped++
      } catch (err) {
        if (!err.message?.includes('UNIQUE')) throw err
        skipped++
      }
    }

    const suggestedRegionsResult = await db.execute({
      sql: `SELECT state_province as region, COUNT(*) as sighting_count
            FROM sightings
            WHERE user_id=? AND state_province IS NOT NULL AND TRIM(state_province) != ''
            GROUP BY state_province
            ORDER BY sighting_count DESC, region ASC`,
      args: [req.user.id]
    })

    const suggestedRegions = suggestedRegionsResult.rows.map(row => row.region).filter(Boolean)
    let autoFilledRegions = false

    if (added > 0 && suggestedRegions.length) {
      const currentUser = await db.execute({
        sql: 'SELECT ebird_regions FROM users WHERE id=?',
        args: [req.user.id]
      })

      if (!currentUser.rows[0]?.ebird_regions) {
        await db.execute({
          sql: 'UPDATE users SET ebird_regions=? WHERE id=?',
          args: [suggestedRegions.join(','), req.user.id]
        })
        autoFilledRegions = true
      }
    }

    res.json({
      added,
      skipped,
      total: rows.length,
      suggested_regions: suggestedRegions,
      auto_filled_regions: autoFilledRegions ? suggestedRegions : []
    })
  } catch (err) {
    console.error('Import error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
