# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal birding tracker at `bird.jkomg.us` for two users (Jason + Mia). Full spec is in `bird-jkomg-us-spec.md`.

## Commands

```bash
# Local dev (port 5003)
./dev.sh

# Initialize Turso DB tables
node scripts/init-db.mjs

# Seed user accounts
node scripts/init-users.mjs

# Deploy to Cloud Run
./deploy.sh

# One-time GCP Secret Manager setup
./setup-secrets.sh
```

## Architecture

**Monorepo** — Express backend + React/Vite frontend served from the same process in production (Express serves Vite build as static files). In dev, Vite runs separately with proxy to Express.

**Backend** (`server/`):
- `server.js` — Express entry point; mounts all routes; serves built React app
- `db.js` — Turso (`@libsql/client`) singleton
- `auth.js` — bcrypt session middleware (cookie-parser sessions; no JWT)
- `ebird.js` — eBird API v2 client (per-user API key passed in each request)
- `sync.js` — eBird sync logic + `node-cron` job (runs every 6 hours); filters region checklists by `userDisplayName` to find each user's submissions
- `wikimedia.js` — Wikimedia Commons photo fetch (no API key needed)
- `storage.js` — GCS helpers for photo uploads to `bird-tracker-photos` bucket

**Frontend** (`src/`):
- React + Vite
- Key shared components: `UserToggle` (You/Mia/Both — persists across views), `Nav`
- Map: Leaflet.js + OpenStreetMap + marker clustering (`leaflet.markercluster`)

**Database**: Turso DB named `bird-tracker` (fourth DB alongside gaming-portal, job-hunt-dashboard, mcbn-xp-tracker). Schema tables: `users`, `sightings`, `photos`, `species_cache`, `sync_log`. The `sightings` table has a `UNIQUE(user_id, submission_id, species_code)` constraint for deduplication.

## eBird Data Flow

Two-path data ingestion:
1. **CSV import** (one-time seed): User uploads `MyEBirdData.csv` from eBird → parsed server-side → inserted with `source='csv'`
2. **API sync** (automated): `node-cron` every 6 hours → hits `/v2/product/lists/{region}` → filters by `userDisplayName` → fetches new checklists via `/v2/product/checklist/view/{subId}` → inserts with `source='api'`

eBird's public API does not expose personal checklist history directly — the sync works by scanning region-level checklist lists and matching on the user's display name. Users must configure their eBird display name in Settings to match exactly what appears on their eBird profile.

## Secrets (GCP Secret Manager)

- `TURSO_URL` — `libsql://bird-tracker-[org].turso.io`
- `TURSO_AUTH_TOKEN`
- `SESSION_SECRET`
- `GCS_BUCKET` — `bird-tracker-photos`
- `GCS_PROJECT_ID`

eBird API keys are stored per-user in the Turso `users` table, not as GCP secrets.

## Deployment

Cloud Run: 256MB RAM, scale 0–2, port 8080. Match the `Dockerfile` and `deploy.sh` pattern from job-hunt-dashboard exactly. DNS: `bird` CNAME → Cloud Run URL.

## Build Phases

Defined in spec: Foundation → Data In → Sync → Map → Views → Photos → Polish. Don't skip phases — each builds on the previous.
