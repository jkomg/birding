import cron from 'node-cron'
import { db, getAllUsers } from './db.js'
import { ebirdGet } from './ebird.js'

export async function storeSightings(userId, checklist, source = 'api') {
  const obs = checklist.obs ?? []
  let inserted = 0

  for (const o of obs) {
    try {
      const speciesCode = o.speciesCode ?? null
      const dedupKey = speciesCode ?? (o.comName ?? '')
      await db.execute({
        sql: `INSERT OR IGNORE INTO sightings
          (user_id, submission_id, common_name, scientific_name, species_code, dedup_key,
           taxonomic_order, count, location_name, location_id, latitude, longitude,
           state_province, observed_date, observed_time, protocol, duration_min,
           observation_details, source)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          userId,
          checklist.subId,
          o.comName ?? '',
          o.sciName ?? '',
          speciesCode,
          dedupKey,
          o.taxonOrder ?? null,
          o.howManyStr ?? o.howMany?.toString() ?? 'X',
          checklist.loc?.name ?? null,
          checklist.loc?.locId ?? null,
          checklist.loc?.lat ?? null,
          checklist.loc?.lng ?? null,
          checklist.loc?.subnational1Code ?? null,
          checklist.obsDt?.slice(0, 10) ?? null,
          checklist.obsDt?.slice(11, 16) ?? null,
          checklist.protocolId ?? null,
          checklist.durationHrs ? Math.round(checklist.durationHrs * 60) : null,
          o.comments ?? null,
          source
        ]
      })
      inserted++
    } catch (err) {
      // UNIQUE constraint violation = already exists, skip
      if (!err.message?.includes('UNIQUE')) console.error('Insert error:', err.message)
    }
  }

  return inserted
}

export async function syncUser(user) {
  if (!user.ebird_api_key || !user.ebird_display_name || !user.ebird_regions) {
    return { newCount: 0, status: 'skipped', message: 'Missing eBird config' }
  }

  const regions = user.ebird_regions.split(',').map(r => r.trim()).filter(Boolean)
  let newCount = 0

  try {
    for (const region of regions) {
      const lists = await ebirdGet(
        `/v2/product/lists/${region}?maxResults=200`,
        user.ebird_api_key
      )

      const mine = lists.filter(l => l.userDisplayName === user.ebird_display_name)

      for (const checklist of mine) {
        const exists = await db.execute({
          sql: 'SELECT id FROM sightings WHERE user_id=? AND submission_id=? LIMIT 1',
          args: [user.id, checklist.subId]
        })
        if (!exists.rows.length) {
          const full = await ebirdGet(
            `/v2/product/checklist/view/${checklist.subId}`,
            user.ebird_api_key
          )
          const n = await storeSightings(user.id, full, 'api')
          newCount += n
        }
      }
    }

    await db.execute({
      sql: 'UPDATE users SET last_synced_at=? WHERE id=?',
      args: [new Date().toISOString(), user.id]
    })

    await db.execute({
      sql: `INSERT INTO sync_log (user_id, new_sightings, regions_checked, status)
            VALUES (?, ?, ?, 'success')`,
      args: [user.id, newCount, regions.join(',')]
    })

    return { newCount, status: 'success' }
  } catch (err) {
    await db.execute({
      sql: `INSERT INTO sync_log (user_id, new_sightings, regions_checked, status, message)
            VALUES (?, 0, ?, 'error', ?)`,
      args: [user.id, regions.join(','), err.message]
    })
    return { newCount: 0, status: 'error', message: err.message }
  }
}

export async function syncAllUsers() {
  const users = await getAllUsers()
  const usersWithKeys = await Promise.all(
    users.map(u => db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [u.id] }).then(r => r.rows[0]))
  )
  for (const user of usersWithKeys) {
    if (user?.ebird_api_key) {
      console.log(`Syncing ${user.username}...`)
      const result = await syncUser(user)
      console.log(`  -> ${result.status}: ${result.newCount} new sightings`)
    }
  }
}

export function startCron() {
  // Every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('Running scheduled eBird sync...')
    syncAllUsers().catch(err => console.error('Cron sync error:', err))
  })
  console.log('eBird sync cron scheduled (every 6 hours)')
}
