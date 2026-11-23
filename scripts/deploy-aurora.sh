#!/usr/bin/env bash
set -euo pipefail

# Deploy the GM3 Aurora UI as a separate Cloud Run service ("jamshelf-aurora")
# sharing the same Jamshelf backend (/api/*, Firestore, GCS, Gemini, Spotify).
# Does NOT touch the production "jamshelf" service.

SERVICE_NAME="${JAMSHELF_AURORA_SERVICE:-jamshelf-aurora}"
REGION="${JAMSHELF_REGION:-us-central1}"
PROJECT="${JAMSHELF_PROJECT:-riojucu}"

echo "Deploying separate Cloud Run service: ${SERVICE_NAME} (${PROJECT}/${REGION})"
echo "Production 'jamshelf' service will not be modified."

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --allow-unauthenticated \
  --quiet

URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --format='value(status.url)')

echo "Deployed ${SERVICE_NAME} -> ${URL}"
echo "Reminder: ensure runtime env vars (GOOGLE_CLOUD_PROJECT, JAMSHELF_STORAGE_BUCKET, GEMINI_MODEL, SPOTIFY_*) are set on ${SERVICE_NAME}:"
echo "  gcloud run services update ${SERVICE_NAME} --region ${REGION} --project ${PROJECT} --set-env-vars GOOGLE_CLOUD_PROJECT=${PROJECT},JAMSHELF_STORAGE_BUCKET=<bucket>"
