#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-birding-496701}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-bird-tracker}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example and fill in values"
  exit 1
fi

get_env() { grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2-; }

upsert_secret() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then echo "Skipping empty: $name"; return; fi
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID" >/dev/null
  else
    gcloud secrets create "$name" --replication-policy="automatic" --project "$PROJECT_ID" >/dev/null
    printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID" >/dev/null
  fi
  echo "Synced: $name"
}

gcloud config set project "$PROJECT_ID" >/dev/null

# Enable APIs — this also triggers creation of the default compute SA
echo "Enabling APIs..."
gcloud services enable secretmanager.googleapis.com run.googleapis.com compute.googleapis.com --project "$PROJECT_ID" >/dev/null

# Wait for default compute SA to be created (can take a few seconds after API enable)
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Waiting for service account $SA_EMAIL..."
for i in {1..10}; do
  if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Service account ready."
    break
  fi
  sleep 3
done

# Also create the GCS bucket if it doesn't exist
GCS_BUCKET="$(get_env GCS_BUCKET)"
if [[ -n "$GCS_BUCKET" ]]; then
  if ! gcloud storage buckets describe "gs://${GCS_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud storage buckets create "gs://${GCS_BUCKET}" --project "$PROJECT_ID" --location "$REGION"
    echo "Created GCS bucket: $GCS_BUCKET"
  fi
fi

upsert_secret "bird-turso-url"       "$(get_env TURSO_URL)"
upsert_secret "bird-turso-auth-token" "$(get_env TURSO_AUTH_TOKEN)"
upsert_secret "bird-session-secret"  "$(get_env SESSION_SECRET)"
upsert_secret "bird-gcs-bucket"      "$(get_env GCS_BUCKET)"
upsert_secret "bird-gcs-project-id"  "$(get_env GCS_PROJECT_ID)"

# Grant Cloud Run SA access to secrets

for s in bird-turso-url bird-turso-auth-token bird-session-secret bird-gcs-bucket bird-gcs-project-id; do
  if gcloud secrets describe "$s" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$s" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --project "$PROJECT_ID" >/dev/null
  fi
done

# Grant SA access to GCS bucket
if [[ -n "$GCS_BUCKET" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --project "$PROJECT_ID" >/dev/null
  echo "Granted GCS access to $SA_EMAIL"
fi

echo "Done. Secrets synced and access granted to $SA_EMAIL"
