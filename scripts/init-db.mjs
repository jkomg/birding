import 'dotenv/config'
import { createClient } from '@libsql/client'
import { tripPlanSchema } from '../server/trips.js'
import { fieldOutingSchema } from '../server/fieldOutings.js'

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id                 INTEGER PRIMARY KEY,
    username           TEXT UNIQUE NOT NULL,
    display_name       TEXT NOT NULL,
    password_hash      TEXT NOT NULL,
    ebird_api_key      TEXT,
    ebird_display_name TEXT,
    ebird_regions      TEXT,
    last_synced_at     TEXT,
    created_at         TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sightings (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    submission_id       TEXT NOT NULL,
    common_name         TEXT NOT NULL,
    scientific_name     TEXT NOT NULL,
    species_code        TEXT,
    dedup_key           TEXT NOT NULL,
    taxonomic_order     REAL,
    count               TEXT,
    location_name       TEXT,
    location_id         TEXT,
    latitude            REAL,
    longitude           REAL,
    state_province      TEXT,
    county              TEXT,
    observed_date       TEXT NOT NULL,
    observed_time       TEXT,
    protocol            TEXT,
    duration_min        INTEGER,
    observation_details TEXT,
    checklist_comments  TEXT,
    ml_catalog_numbers  TEXT,
    outing_id           INTEGER REFERENCES field_outings(id),
    source              TEXT DEFAULT 'csv',
    imported_at         TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, submission_id, dedup_key)
  )`,

  `CREATE TABLE IF NOT EXISTS photos (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    sighting_id  INTEGER REFERENCES sightings(id),
    species_code TEXT,
    gcs_path     TEXT NOT NULL,
    public_url   TEXT NOT NULL,
    caption      TEXT,
    taken_at     TEXT,
    uploaded_at  TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS species_cache (
    species_code      TEXT PRIMARY KEY,
    common_name       TEXT NOT NULL,
    scientific_name   TEXT NOT NULL,
    taxonomic_order   REAL,
    family_code       TEXT,
    family_common     TEXT,
    family_scientific TEXT,
    order_name        TEXT,
    category          TEXT,
    cached_at         TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sync_log (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id),
    synced_at        TEXT DEFAULT (datetime('now')),
    new_sightings    INTEGER DEFAULT 0,
    regions_checked  TEXT,
    status           TEXT,
    message          TEXT
  )`,

  ...tripPlanSchema,
  ...fieldOutingSchema,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_sightings_user ON sightings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sightings_species ON sightings(species_code)`,
  `CREATE INDEX IF NOT EXISTS idx_sightings_date ON sightings(observed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sightings_submission ON sightings(submission_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sightings_outing ON sightings(outing_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`
]

console.log('Initializing bird-tracker database...')
for (const sql of schema) {
  await db.execute(sql)
  console.log('  OK:', sql.slice(0, 60).replace(/\s+/g, ' ').trim() + '...')
}
console.log('Done.')
