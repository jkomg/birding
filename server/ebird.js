const EBIRD_BASE = 'https://api.ebird.org'

export async function ebirdGet(path, apiKey) {
  const url = `${EBIRD_BASE}${path}`
  const res = await fetch(url, {
    headers: { 'X-eBirdApiToken': apiKey }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBird API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getTaxonomy(apiKey, { species } = {}) {
  const qs = species ? `?species=${species}` : ''
  return ebirdGet(`/v2/ref/taxonomy/ebird${qs}`, apiKey)
}
