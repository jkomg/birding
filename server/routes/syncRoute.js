import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { syncUser } from '../sync.js'

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  try {
    const fullUser = await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [req.user.id] })
    const user = fullUser.rows[0]
    if (!user?.ebird_api_key) return res.status(400).json({ error: 'eBird API key not configured' })

    const result = await syncUser(user)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Debug: see what display names eBird returns for your regions
router.get('/debug', requireAuth, async (req, res) => {
  try {
    const fullUser = await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [req.user.id] })
    const user = fullUser.rows[0]
    if (!user?.ebird_api_key || !user?.ebird_regions) return res.status(400).json({ error: 'eBird not configured' })

    const { ebirdGet } = await import('../ebird.js')
    const regions = user.ebird_regions.split(',').map(r => r.trim()).filter(Boolean)
    const results = {}

    for (const region of regions) {
      const lists = await ebirdGet(`/v2/product/lists/${region}?maxResults=200`, user.ebird_api_key)
      const names = [...new Set(lists.map(l => l.userDisplayName))].sort()
      results[region] = { total: lists.length, unique_names: names }
    }

    res.json({ configured_display_name: user.ebird_display_name, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/log', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({
      sql: 'SELECT * FROM sync_log WHERE user_id=? ORDER BY synced_at DESC LIMIT 10',
      args: [req.user.id]
    })
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
