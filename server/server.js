import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

import { authRouter, requireAuth } from './auth.js'
import { db } from './db.js'
import { startCron } from './sync.js'
import { ensureTripPlanSchema } from './trips.js'

import sightingsRouter from './routes/sightings.js'
import mapRouter from './routes/map.js'
import lifelistRouter from './routes/lifelist.js'
import outingsRouter from './routes/outings.js'
import speciesRouter from './routes/species.js'
import photosRouter from './routes/photos.js'
import importRouter from './routes/import.js'
import syncRouter from './routes/syncRoute.js'
import settingsRouter from './routes/settings.js'
import dashboardRouter from './routes/dashboard.js'
import tripsRouter from './routes/trips.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5004
const isProd = existsSync(path.join(__dirname, '../dist'))

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
app.use(express.json())

// Auth routes
authRouter(app)

// Public user list (usernames + display names only)
app.get('/api/users', requireAuth, async (req, res) => {
  const { db } = await import('./db.js')
  const r = await db.execute('SELECT username, display_name FROM users ORDER BY id')
  res.json(r.rows)
})

// API routes
app.use('/api/sightings', sightingsRouter)
app.use('/api/map', mapRouter)
app.use('/api/lifelist', lifelistRouter)
app.use('/api/outings', outingsRouter)
app.use('/api/species', speciesRouter)
app.use('/api/photos', photosRouter)
app.use('/api/import', importRouter)
app.use('/api/sync', syncRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/trips', tripsRouter)

// Serve React app in production
if (isProd) {
  const dist = path.join(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

await ensureTripPlanSchema(db)

app.listen(PORT, () => {
  console.log(`Bird tracker server running on port ${PORT}`)
  startCron()
})
