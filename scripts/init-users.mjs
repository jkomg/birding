import 'dotenv/config'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

const JASON_PASSWORD = process.env.JASON_PASSWORD
const MIA_PASSWORD = process.env.MIA_PASSWORD

if (!JASON_PASSWORD) {
  console.error('Set JASON_PASSWORD in .env')
  process.exit(1)
}

const users = [
  { username: 'jason', display_name: 'Jason', password: JASON_PASSWORD },
  ...(MIA_PASSWORD ? [{ username: 'mia', display_name: 'Mia', password: MIA_PASSWORD }] : [])
]

for (const u of users) {
  const hash = await bcrypt.hash(u.password, 12)
  await db.execute({
    sql: `INSERT OR IGNORE INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`,
    args: [u.username, u.display_name, hash]
  })
  console.log(`Seeded user: ${u.username}`)
}

console.log('Done.')
