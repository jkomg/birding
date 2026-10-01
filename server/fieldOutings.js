export const fieldOutingSchema = [
  `CREATE TABLE IF NOT EXISTS field_outings (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    plan_id       INTEGER,
    title         TEXT NOT NULL,
    location_name TEXT,
    latitude      REAL,
    longitude     REAL,
    started_at    TEXT NOT NULL,
    ended_at      TEXT,
    notes         TEXT,
    planned_species_json TEXT,
    planned_stops_json TEXT,
    status        TEXT DEFAULT 'active',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_field_outings_user_status ON field_outings(user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_field_outings_started ON field_outings(started_at)`
]

export async function ensureFieldOutingSchema(db) {
  for (const sql of fieldOutingSchema) await db.execute(sql)

  const columns = await db.execute('PRAGMA table_info(field_outings)')
  if (!columns.rows.some(column => column.name === 'planned_species_json')) {
    await db.execute('ALTER TABLE field_outings ADD COLUMN planned_species_json TEXT')
  }
  if (!columns.rows.some(column => column.name === 'plan_id')) {
    await db.execute('ALTER TABLE field_outings ADD COLUMN plan_id INTEGER')
  }
  if (!columns.rows.some(column => column.name === 'planned_stops_json')) {
    await db.execute('ALTER TABLE field_outings ADD COLUMN planned_stops_json TEXT')
  }

  const sightingColumns = await db.execute('PRAGMA table_info(sightings)')
  if (!sightingColumns.rows.some(column => column.name === 'outing_id')) {
    await db.execute('ALTER TABLE sightings ADD COLUMN outing_id INTEGER REFERENCES field_outings(id)')
  }
  await db.execute('CREATE INDEX IF NOT EXISTS idx_sightings_outing ON sightings(outing_id)')
}
