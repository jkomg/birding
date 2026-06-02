#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-birding-496701}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-bird-tracker}"
REPO_NAME="${REPO_NAME:-bird-tracker-repo}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project "$PROJECT_ID" >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project "$PROJECT_ID"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null

docker build --platform linux/amd64 -t "$IMAGE" "$ROOT_DIR"
docker push "$IMAGE"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets TURSO_URL=bird-turso-url:latest \
  --set-secrets TURSO_AUTH_TOKEN=bird-turso-auth-token:latest \
  --set-secrets SESSION_SECRET=bird-session-secret:latest \
  --set-secrets GCS_BUCKET=bird-gcs-bucket:latest \
  --set-secrets GCS_PROJECT_ID=bird-gcs-project-id:latest \
  --cpu 1 \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 80 \
  --timeout 120 \
  --cpu-throttling

echo
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)'
