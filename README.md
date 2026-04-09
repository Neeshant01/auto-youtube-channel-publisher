# Auto YouTube Channel Publisher

AI-assisted YouTube publishing workspace for trend discovery, script generation, metadata planning, and upload workflow experiments.

## What This Project Does

This project combines a React dashboard with an Express backend to help manage a YouTube content pipeline. It focuses on assisted workflows, not blind automation, so creators can review ideas, scripts, thumbnails, and metadata before publishing.

## Key Features

- Google sign-in and YouTube OAuth connection flow
- Trend discovery helpers
- Script generation with Gemini models
- Metadata and thumbnail ideation workflow
- Upload flow for YouTube publishing experiments
- Firebase-backed auth and data layer using environment-based configuration

## Tech Stack

- React
- TypeScript
- Vite
- Express
- Firebase Auth and Firestore
- Google Gemini API
- YouTube Data API

## Configuration

Create a local `.env` file using `.env.example`.

Required variables:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `SESSION_SECRET`
- `GEMINI_API_KEY`
- `APP_URL`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Optional:

- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_DATABASE_ID`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- This repository no longer includes project-specific Firebase JSON config files
- Use your own Firebase project and YouTube API credentials
- Review all generated output before publishing

Built by Nishant Kumar
