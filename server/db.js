import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_URL
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

if (!TURSO_URL) throw new Error('TURSO_URL is required')
if (!TURSO_AUTH_TOKEN) throw new Error('TURSO_AUTH_TOKEN is required')

export const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN
})

export async function getUserById(id) {
  const r = await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [id] })
  return r.rows[0] ?? null
}

export async function getUserByUsername(username) {
  const r = await db.execute({ sql: 'SELECT * FROM users WHERE username=?', args: [username] })
  return r.rows[0] ?? null
}

export async function getAllUsers() {
  const r = await db.execute('SELECT id, username, display_name, ebird_display_name, ebird_regions, last_synced_at FROM users')
  return r.rows
}

export async function createSession(userId, token) {
  await db.execute({
    sql: 'INSERT INTO sessions (user_id, token, created_at) VALUES (?, ?, datetime(\'now\'))',
    args: [userId, token]
  })
}

export async function getSession(token) {
  const r = await db.execute({ sql: 'SELECT * FROM sessions WHERE token=?', args: [token] })
  return r.rows[0] ?? null
}

export async function deleteSession(token) {
  await db.execute({ sql: 'DELETE FROM sessions WHERE token=?', args: [token] })
}
