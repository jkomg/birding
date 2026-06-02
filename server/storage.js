import { Storage } from '@google-cloud/storage'

const GCS_BUCKET = process.env.GCS_BUCKET || 'bird-tracker-photos'

let storage, bucket

function getStorage() {
  if (!storage) {
    storage = new Storage()
    bucket = storage.bucket(GCS_BUCKET)
  }
  return { storage, bucket }
}

export async function uploadPhoto(buffer, filename, mimetype) {
  const { bucket } = getStorage()
  const file = bucket.file(filename)
  await file.save(buffer, {
    contentType: mimetype,
    metadata: { cacheControl: 'public, max-age=31536000' }
  })
  return {
    gcs_path: filename,
    public_url: `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`
  }
}

export async function deletePhoto(gcsPath) {
  const { bucket } = getStorage()
  await bucket.file(gcsPath).delete()
}
