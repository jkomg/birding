import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, hashPassword, verifyPassword } from '../auth.js'

const router = Router()

router.put('/', requireAuth, async (req, res) => {
  try {
    const { display_name, ebird_api_key, ebird_display_name, ebird_regions, current_password, new_password } = req.body

    if (new_password) {
      const fullUser = await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [req.user.id] })
      const valid = await verifyPassword(current_password ?? '', fullUser.rows[0].password_hash)
      if (!valid) return res.status(400).json({ error: 'Current password incorrect' })
    }

    const updates = []
    const args = []

    if (display_name !== undefined) { updates.push('display_name=?'); args.push(display_name) }
    if (ebird_api_key !== undefined) { updates.push('ebird_api_key=?'); args.push(ebird_api_key) }
    if (ebird_display_name !== undefined) { updates.push('ebird_display_name=?'); args.push(ebird_display_name) }
    if (ebird_regions !== undefined) { updates.push('ebird_regions=?'); args.push(ebird_regions) }
    if (new_password) {
      updates.push('password_hash=?')
      args.push(await hashPassword(new_password))
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })

    args.push(req.user.id)
    await db.execute({ sql: `UPDATE users SET ${updates.join(',')} WHERE id=?`, args })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
