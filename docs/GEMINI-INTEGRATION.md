# Gemini Integration

## Overview

Jamshelf uses Google's **Gemini 3.5 Flash** model (via the Vertex AI **global** endpoint) to convert raw chord sheets (pasted text) into structured ChordPro format. The integration is server-side via a Next.js API Route Handler (`/api/process`) using the unified `@google/genai` SDK. Override the model or location with `GEMINI_MODEL`/`GOOGLE_CLOUD_LOCATION` in `.env` if needed — see `.env.example`.

Authentication is **Application Default Credentials (ADC) via Vertex AI only** — no API keys are supported. The client browser never requires or collects any credential.

## Setup & Configuration

Set `GOOGLE_CLOUD_PROJECT` (and optionally `GOOGLE_CLOUD_LOCATION`) in your `.env` file — see `.env.example` at the repo root and `docs/RUNBOOK.md`'s Environment Variables section.

To authenticate locally for development:
```bash
gcloud auth application-default login
```

In deployed environments (Cloud Run, GCE, GKE, etc.), ADC is picked up automatically from the attached service account — no credentials file or key ever needs to be configured.

## User Flow

1. Navigate to `/add-song`
2. Paste raw chord sheet text (from any format — tabs, chord-over-lyrics, etc.)
3. Click "Process with AI"
4. The frontend calls `/api/process` POST endpoint with `{ rawText }`
5. The backend initializes `GoogleGenAI` and calls Gemini
6. The backend cleans the response and returns a structured `ChordProEntry`
7. User previews the formatted song and clicks "Add to Library"

## API Endpoint Reference

**Endpoint**:
```
POST /api/process
```

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "rawText": "pasted chord sheet contents..."
}
```

**Response Body (Success)**:
```json
{
  "id": "song-song-title",
  "text": "{title: Song Title}\n{artist: Artist Name}\n..."
}
```

## Prompt Engineering

The backend sends the following prompt to Gemini:

```
You are a music transcription assistant. Convert the raw chord sheet / lyrics text
into a ChordPro format (.cho file).

RULES:
- Output ONLY the ChordPro file content, no markdown, no backticks, no explanation
- First lines must be metadata directives in this exact format:
  {title: Song Title}
  {artist: Artist Name}
  {key: Am}
  {capo: 0}
  {tempo: 120}
- Omit {capo:} if capo is 0
- Section headers use bracket syntax on their own line:
  [Intro], [Verse 1], [Chorus], [Pre-Chorus], [Bridge], [Outro]
- Number duplicate sections: [Verse 1], [Verse 2], [Chorus 1], [Chorus 2]
- Inline chords use [ChordName] notation placed immediately before the syllable they land on
- Detect and label all sections: Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro, Solo
- Preserve all lyrics exactly
- Brazilian Portuguese section labels if applicable: use English equivalents in output
```

## Security Considerations

- **Server-side Credentials**: All API keys and GCP service account credentials remain securely on the server environment.
- **Access Control**: You can restrict access or add authentication middleware to `/api/process` to limit consumption.
