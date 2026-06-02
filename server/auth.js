import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getUserById, getSession, createSession, deleteSession, getUserByUsername } from './db.js'

export function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

// Middleware: attach req.user from session cookie
export async function requireAuth(req, res, next) {
  const token = req.cookies?.session
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const session = await getSession(token)
  if (!session) return res.status(401).json({ error: 'Invalid session' })

  const user = await getUserById(session.user_id)
  if (!user) return res.status(401).json({ error: 'User not found' })

  req.user = user
  next()
}

export function authRouter(app) {
  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

      const user = await getUserByUsername(username.trim().toLowerCase())
      if (!user) return res.status(401).json({ error: 'Invalid credentials' })

      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

      const token = generateToken()
      await createSession(user.id, token)

      res.cookie('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      })

      res.json({
        id: user.id,
        username: user.username,
        display_name: user.display_name
      })
    } catch (err) {
      console.error('Login error:', err)
      res.status(500).json({ error: 'Login failed' })
    }
  })

  app.post('/api/logout', async (req, res) => {
    const token = req.cookies?.session
    if (token) await deleteSession(token)
    res.clearCookie('session')
    res.json({ ok: true })
  })

  app.get('/api/me', requireAuth, (req, res) => {
    const u = req.user
    res.json({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      has_ebird_api_key: Boolean(u.ebird_api_key),
      ebird_display_name: u.ebird_display_name,
      ebird_regions: u.ebird_regions,
      last_synced_at: u.last_synced_at
    })
  })
}
