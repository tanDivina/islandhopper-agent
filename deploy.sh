#!/bin/bash

# Island Hopper: Automated Deployment Script
# This script automates the build and deployment of the multimodal concierge to Google Cloud Run.

PROJECT_ID="islandhopper-agent-2026"
REGION="us-central1"
SERVICE_NAME="islandhopper-agent-2026"
IMAGE_TAG="gcr.io/$PROJECT_ID/islandhopper-app"

echo "🏝️ Starting Island Hopper Deployment..."

# 1. Build the container image using Cloud Build
echo "📦 Building container image..."
gcloud builds submit --tag $IMAGE_TAG --project $PROJECT_ID

# 2. Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_TAG \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION \
  --project $PROJECT_ID

echo "✅ Deployment Complete!"
echo "📍 Service URL: https://islandhopper-agent-2026-305893181793.us-central1.run.app"
