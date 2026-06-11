# Gemini Integration

## Overview

Jamshelf uses Google's **Gemini 2.5 Flash** (or Gemini 2.0 Flash) model to convert raw chord sheets (pasted text) into structured ChordPro format. The integration is server-side via a Next.js API Route Handler (`/api/process`) using the unified `@google/genai` SDK.

This architecture supports:
1. **Application Default Credentials (ADC)** via Vertex AI (recommended for production).
2. **Developer API Key** via Google AI Studio.

The client browser no longer requires or collects the user's API key.

## Setup & Configuration

The backend client automatically selects the authentication mode based on the environment variables defined on the server:

### Option A: Application Default Credentials (ADC) / Vertex AI (Enterprise)

Configure the following environment variables:
```bash
GOOGLE_GENAI_USE_ENTERPRISE=true
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="us-central1" # optional, defaults to us-central1
```

To authenticate locally for development:
```bash
gcloud auth application-default login
```

### Option B: Gemini Developer API Key

Configure either of the following environment variables:
```bash
GEMINI_API_KEY="your-api-key"
# or
GOOGLE_API_KEY="your-api-key"
```

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
