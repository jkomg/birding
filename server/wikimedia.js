const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php'

export async function getWikimediaPhotos(scientificName, limit = 6) {
  const query = encodeURIComponent(scientificName)
  const url = `${WIKIMEDIA_API}?action=query&list=search&srsearch=${query}&srnamespace=6&srlimit=${limit}&format=json&origin=*`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  const results = data?.query?.search ?? []

  const photos = await Promise.all(results.map(async item => {
    const title = item.title
    const infoUrl = `${WIKIMEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`
    try {
      const r = await fetch(infoUrl)
      const d = await r.json()
      const pages = Object.values(d?.query?.pages ?? {})
      const info = pages[0]?.imageinfo?.[0]
      if (!info?.url) return null
      return {
        url: info.url,
        license: info.extmetadata?.LicenseShortName?.value ?? '',
        author: info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') ?? '',
        source: 'wikimedia'
      }
    } catch {
      return null
    }
  }))

  return photos.filter(Boolean)
}

export async function getMacaulayPhotos(speciesCode, limit = 6) {
  if (!speciesCode) return []
  const url = `https://search.macaulaylibrary.org/api/v1/search?taxonCode=${speciesCode}&mediaType=p&count=${limit}&sort=rating_rank_desc`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'bird-tracker/1.0' } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results?.content ?? []).map(r => ({
      url: `https://cdn.download.ams.cornell.edu/api/v2/asset/${r.assetId}/1800`,
      thumb: `https://cdn.download.ams.cornell.edu/api/v2/asset/${r.assetId}/320`,
      author: r.userDisplayName ?? '',
      location: r.location ?? '',
      source: 'macaulay',
      asset_id: r.assetId
    }))
  } catch {
    return []
  }
}
