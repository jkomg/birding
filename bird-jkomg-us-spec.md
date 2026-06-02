# bird.jkomg.us — Project Specification

**Birding tracker for two users (you + Mia), hosted at bird.jkomg.us**

---

## Tech Stack

Matches your existing jkomg.us infrastructure exactly.

| Layer | Tech | Notes |
|---|---|---|
| Backend | Node.js / Express | Same as job-hunt-dashboard |
| Frontend | React + Vite | Same as job-hunt-dashboard |
| Database | Turso (libSQL) via `@libsql/client` | Fourth DB alongside gaming-portal, job-hunt-dashboard, mcbn-xp-tracker |
| Auth | Username + bcrypt + cookie sessions | `bcryptjs` + `cookie-parser` already in your stack |
| Map | Leaflet.js + OpenStreetMap | Free, no key; or swap to Mapbox later |
| External APIs | eBird API v2 (Cornell Lab) | Per-user API key, stored in Turso |
| Species Info | eBird API v2 — taxonomy + checklist endpoints | See eBird section below |
| Species Photos | Wikimedia Commons API | Free, no key; credit required |
| Photo Uploads | Google Cloud Storage | `@google-cloud/storage` already in your stack |
| Hosting | Google Cloud Run | Same as job-hunt-dashboard; scales to zero |
| Secrets | GCP Secret Manager | Same pattern |
| Container | Docker | Same Dockerfile pattern |

---

## eBird Data Strategy

### The core limitation

eBird's public API v2 does **not** expose a personal checklist history endpoint — it's region-focused, not user-focused. You cannot ask "give me all of Jason's sightings."

### The solution: hybrid sync

**Seed (one-time, historical):** Each user exports `MyEBirdData.csv` from eBird (My eBird → Download My Data) and uploads it in the app. This seeds all historical data into Turso.

**Automated ongoing sync (no manual export needed after setup):**

eBird API v2 has two useful endpoints for automation:

1. `GET /v2/product/lists/{regionCode}` — returns recent checklists submitted in a region, including the submitter's `userDisplayName` and the `subId` (e.g. `S12345678`).
2. `GET /v2/product/checklist/view/{subId}` — returns the full species list for any checklist by ID.

**Sync flow:**

```
Every 6 hours (node-cron inside Express):
  For each user:
    1. Query /v2/product/lists/{user's home region(s)} for recent checklists
    2. Filter results by userDisplayName matching the user's eBird display name
    3. For each new subId not already in our DB:
       a. Fetch full checklist via /v2/product/checklist/view/{subId}
       b. Store all observations in Turso
    4. Update last_synced_at
```

**What this means in practice:**
- After setup + initial CSV seed, syncing is fully automatic
- New sightings appear on bird.jkomg.us within ~6 hours of submitting to eBird
- Users store their eBird `displayName` and home region(s) in settings (e.g. `US-VA,US-MD`)
- A "Sync Now" button in Settings triggers an immediate manual sync

**Important caveats:**
- The region checklist list only goes back ~30 days by default — historical data must come from the one-time CSV import
- Users must set their eBird display name in Settings to match exactly what appears on their eBird checklists
- eBird asks for respectful API usage — 6-hour cadence is appropriate for personal use

---

## Turso Database

Create a fourth Turso database: `bird-tracker`

### Schema

```sql
-- Users (seeded manually, no registration)
CREATE TABLE users (
  id                 INTEGER PRIMARY KEY,
  username           TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  ebird_api_key      TEXT,
  ebird_display_name TEXT,      -- must match eBird profile name exactly
  ebird_regions      TEXT,      -- comma-separated: "US-VA,US-MD"
  last_synced_at     TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

-- Sightings (from CSV import or automated API sync)
CREATE TABLE sightings (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  submission_id       TEXT NOT NULL,    -- eBird subId e.g. "S12345678"
  common_name         TEXT NOT NULL,
  scientific_name     TEXT NOT NULL,
  species_code        TEXT,             -- eBird code e.g. "norcar"
  taxonomic_order     REAL,
  count               TEXT,             -- integer or 'X' for present
  location_name       TEXT,
  location_id         TEXT,             -- eBird locId e.g. "L99381"
  latitude            REAL,
  longitude           REAL,
  state_province      TEXT,
  county              TEXT,
  observed_date       TEXT NOT NULL,    -- YYYY-MM-DD
  observed_time       TEXT,             -- HH:MM
  protocol            TEXT,
  duration_min        INTEGER,
  observation_details TEXT,
  checklist_comments  TEXT,
  ml_catalog_numbers  TEXT,
  source              TEXT DEFAULT 'csv',  -- 'csv' or 'api'
  imported_at         TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, submission_id, species_code)
);

-- User-uploaded photos
CREATE TABLE photos (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  sighting_id  INTEGER REFERENCES sightings(id),
  species_code TEXT,
  gcs_path     TEXT NOT NULL,
  public_url   TEXT NOT NULL,
  caption      TEXT,
  taken_at     TEXT,
  uploaded_at  TEXT DEFAULT (datetime('now'))
);

-- Species metadata cache (from eBird taxonomy API)
CREATE TABLE species_cache (
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
);

-- Sync log
CREATE TABLE sync_log (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id),
  synced_at        TEXT DEFAULT (datetime('now')),
  new_sightings    INTEGER DEFAULT 0,
  regions_checked  TEXT,
  status           TEXT,   -- 'success' | 'error'
  message          TEXT
);
```

---

## Project Structure

```
bird-tracker/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .dockerignore
├── package.json
├── vite.config.js
├── index.html
├── dev.sh                        # Start local dev (port 5003)
├── deploy.sh                     # Build + push + Cloud Run deploy
├── setup-secrets.sh              # One-time GCP Secret Manager setup
├── scripts/
│   ├── init-db.mjs               # Create Turso tables
│   ├── init-users.mjs            # Seed user accounts
│   └── smoke-test.mjs
├── server/
│   ├── server.js                 # Express entry point
│   ├── db.js                     # Turso client
│   ├── auth.js                   # bcrypt + session middleware
│   ├── ebird.js                  # eBird API client
│   ├── wikimedia.js              # Wikimedia Commons photos
│   ├── sync.js                   # eBird sync logic + cron
│   ├── storage.js                # GCS helpers
│   └── routes/
│       ├── auth.js
│       ├── sightings.js          # GeoJSON + list endpoints
│       ├── lifelist.js
│       ├── outings.js
│       ├── species.js
│       ├── photos.js
│       ├── import.js             # CSV upload + parse
│       └── sync.js               # Manual sync trigger
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/
    │   ├── Map/
    │   │   ├── BirdMap.jsx
    │   │   └── SightingPopup.jsx
    │   ├── LifeList/
    │   ├── Timeline/
    │   ├── Species/
    │   ├── Photos/
    │   ├── Settings/
    │   └── shared/
    │       ├── UserToggle.jsx    -- You / Mia / Both; persists across views
    │       └── Nav.jsx
    └── styles/
        └── main.css
```

---

## Views & Features

### 1. Map (`/map`)

- Leaflet.js + OpenStreetMap tiles
- Marker clustering (Leaflet.markercluster)
- **Filters:** user toggle (You/Mia/Both), date range, species search, state
- Popup on click: species, date, location, who, count, thumbnail, "View species" link
- Map state in URL params for shareability
- Data: `GET /api/sightings/geojson?user=both&from=&to=&species=`

### 2. Life List (`/lifelist`)

- Unique species seen, sorted by taxonomic order (default) or alpha
- User toggle: Your list / Mia's / Combined unique
- Columns: common name, scientific name, family, first seen, location, total sightings, thumbnail
- "Only I've seen this" badge for species unique to one observer
- Export as CSV
- Total count at top

### 3. Timeline / Outings (`/timeline`)

- Outings grouped by eBird checklist (one submission ID = one outing)
- Card: date, location, duration, species count, thumbnails, who birded
- Same-day outings within ~1km flagged as joint
- Expand: full species list, photos, mini map pin

### 4. Species Detail (`/species/:code`)

- Header: common name, scientific name, family, order
- Your uploaded photos first, then Wikimedia Commons (with credit + license)
- Sightings table: who saw it, where, when, count
- Mini Leaflet map of all sighting locations
- Link to eBird species page (range maps, sounds)
- Stats: first seen (you), first seen (Mia), totals per person, states

### 5. Photo Upload (`/photos/upload`)

- Upload JPEG/PNG/WEBP, max 10MB per photo
- Attach to: a specific sighting OR just a species
- Caption + date taken
- Stored in GCS bucket `bird-tracker-photos`

### 6. CSV Import (`/import`)

- Upload `MyEBirdData.csv` exported from eBird
- Preview first 10 rows, confirm before importing
- Duplicate detection via UNIQUE constraint
- Summary: X added, Y skipped
- **One-time operation per user to seed historical data**

### 7. Settings (`/settings`)

- Change display name + password
- Set eBird API key
- Set eBird display name (must match eBird profile exactly)
- Set home region(s) for sync (e.g. `US-VA,US-MD`)
- "Sync Now" button + last synced timestamp + last 10 sync log entries

### 8. Dashboard (`/`)

- Combined life list count (unique species, both users)
- Your count vs. Mia's count
- Recent sightings feed (last 10, both users)
- Last sync status per user

---

## eBird Sync Implementation

```javascript
// server/sync.js
import cron from 'node-cron';

async function syncUser(user) {
  const regions = user.ebird_regions.split(',').map(r => r.trim());
  let newCount = 0;

  for (const region of regions) {
    const lists = await ebirdGet(
      `/v2/product/lists/${region}?maxResults=200`,
      user.ebird_api_key
    );

    // Filter to this user's checklists by display name
    const mine = lists.filter(l => l.userDisplayName === user.ebird_display_name);

    for (const checklist of mine) {
      const exists = await db.execute({
        sql: 'SELECT id FROM sightings WHERE user_id=? AND submission_id=? LIMIT 1',
        args: [user.id, checklist.subId]
      });
      if (!exists.rows.length) {
        const full = await ebirdGet(
          `/v2/product/checklist/view/${checklist.subId}`,
          user.ebird_api_key
        );
        await storeSightings(user.id, full, 'api');
        newCount += full.obs?.length ?? 0;
      }
    }
  }

  await db.execute({
    sql: 'UPDATE users SET last_synced_at=? WHERE id=?',
    args: [new Date().toISOString(), user.id]
  });
  return newCount;
}

// Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  const users = await db.execute('SELECT * FROM users WHERE ebird_api_key IS NOT NULL');
  for (const user of users.rows) {
    await syncUser(user);
  }
});
```

---

## Deployment

```bash
# GCP Secret Manager secrets
TURSO_URL              # libsql://bird-tracker-[org].turso.io
TURSO_AUTH_TOKEN
SESSION_SECRET
GCS_BUCKET             # bird-tracker-photos
GCS_PROJECT_ID
```

Cloud Run: 256MB RAM, scale 0–2, port 8080. Same `deploy.sh` as job-hunt-dashboard.

DNS: Add `bird` CNAME → Cloud Run URL, add custom domain in Cloud Run console.

---

## Milestones for Claude Code

| Phase | Work |
|---|---|
| 1 — Foundation | Repo scaffold, Turso schema, Express + auth, React shell, Docker/deploy |
| 2 — Data In | CSV import UI + endpoint, species taxonomy cache, basic sightings list |
| 3 — Sync | eBird sync logic, node-cron schedule, Settings page |
| 4 — Map | Leaflet map, GeoJSON endpoint, filters, User toggle, popups |
| 5 — Views | Life list, Timeline/outings, Species detail |
| 6 — Photos | GCS upload, photo display on species + map |
| 7 — Polish | Dashboard home, CSV export, mobile responsive, DNS |

---

## Prompt for Claude Code

```
Build bird.jkomg.us — a personal birding tracker for two users (me and my partner Mia).

Full spec: [attach bird-jkomg-us-spec.md]

Reference repo for infrastructure patterns:
https://github.com/jkomg/job-hunt-dashboard

Match exactly:
- package.json dependencies (@libsql/client, express, bcryptjs, cookie-parser, vite, react, @google-cloud/storage)
- Docker + Cloud Run deployment pattern (Dockerfile, deploy.sh, setup-secrets.sh)
- GCP Secret Manager secrets pattern
- Create a new Turso DB named "bird-tracker"

Start with Phase 1: Express scaffold, Turso schema init script, bcrypt auth,
React + Vite shell with login page, Dockerfile, dev.sh, deploy.sh.
```
