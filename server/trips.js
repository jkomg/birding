export const tripPlanSchema = [
  `CREATE TABLE IF NOT EXISTS trip_plans (
    id             INTEGER PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    title          TEXT NOT NULL,
    trip_date      TEXT NOT NULL,
    start_time     TEXT,
    end_time       TEXT,
    target_species TEXT,
    target_area    TEXT,
    notes          TEXT,
    itinerary_json TEXT DEFAULT '[]',
    status         TEXT DEFAULT 'draft',
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trip_plans_user_date ON trip_plans(user_id, trip_date)`,
  `CREATE INDEX IF NOT EXISTS idx_trip_plans_status ON trip_plans(status)`
]

export async function ensureTripPlanSchema(db) {
  for (const sql of tripPlanSchema) {
    await db.execute(sql)
  }
}
