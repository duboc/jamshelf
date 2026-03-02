# Gemini Integration

## Overview

Jamshelf uses Google's **Gemini 2.0 Flash** model to convert raw chord sheets (pasted text) into structured ChordPro format. The integration is fully client-side — the API call goes directly from the browser to Google's API. No server-side proxy is involved.

**Source file**: `lib/utils/ai-import.ts`

## Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click "Create API Key"
4. Copy the key — it starts with `AIza...`
5. Paste it into Jamshelf's Add Song page when prompted

The key is used for the current session only and is never persisted to localStorage or sent anywhere other than Google's API.

## User Flow

1. Navigate to `/add-song`
2. Select the "AI Import" tab
3. Enter a Gemini API key
4. Paste raw chord sheet text (from any format — tabs, chord-over-lyrics, etc.)
5. Click "Import"
6. Jamshelf sends the text to Gemini with a conversion prompt
7. Gemini returns structured ChordPro
8. The response is cleaned and saved as a new `ChordProEntry`
9. User is redirected to the new song's viewer page

## API Request Format

**Endpoint**:
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}
```

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "<GEMINI_PROMPT>\n\n<raw chord sheet text>"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.1,
    "maxOutputTokens": 8192
  }
}
```

- **Temperature 0.1**: Near-deterministic output for consistent formatting
- **Max tokens 8192**: Sufficient for long songs with multiple sections

## Prompt Engineering

The full prompt sent to Gemini:

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

### Prompt Design Decisions

| Rule | Why |
| ---- | --- |
| "Output ONLY the ChordPro file content" | Prevents Gemini from wrapping output in markdown code fences or adding explanations |
| Exact metadata format | Ensures the parser can extract `{title:}`, `{key:}`, etc. reliably |
| "Omit {capo:} if capo is 0" | Keeps output clean; parser defaults capo to 0 |
| Bracket section headers | Matches the format the parser expects (`[Verse 1]`, not `{start_of_verse}`) |
| "Number duplicate sections" | Prevents label collisions in the parsed output |
| "Immediately before the syllable" | Ensures chords align visually with the correct lyrics position |
| Portuguese section labels | The app originated for Brazilian music — Gemini normalizes "Refrão" → "Chorus" |

## Response Processing

```typescript
// 1. Extract text from Gemini response
const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

// 2. Strip accidental markdown fences
const clean = text
  .replace(/^```[a-z]*\n?/gm, '')
  .replace(/^```$/gm, '')
  .trim();

// 3. Derive song ID from title directive
const titleMatch = clean.match(/^\{title:\s*(.+)\}$/im);
const title = titleMatch ? titleMatch[1].trim() : '';
const id = title
  ? 'song-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  : 'song-' + Date.now();

// 4. Return as ChordProEntry
return { id, text: clean };
```

The markdown stripping handles cases where Gemini wraps output in `` ```chordpro `` fences despite the prompt instruction.

## Error Handling

| Error | Cause | Handling |
| ----- | ----- | -------- |
| `Gemini API error: 400` | Invalid API key or malformed request | Thrown as `Error`, caught by UI |
| `Gemini API error: 403` | API key lacks permissions or quota exceeded | Thrown as `Error` |
| `Gemini API error: 429` | Rate limit exceeded | Thrown as `Error` |
| `No response from Gemini` | Response JSON has no `candidates[0].content.parts[0].text` | Thrown as `Error` |
| Network error | No internet connection | Standard `fetch` rejection |

All errors are thrown and expected to be caught by the calling component for user-facing display.

## Security Considerations

- **Client-side API key**: The key is passed directly to Google's API from the browser. It is never stored in localStorage, cookies, or any persistent storage.
- **No server proxy**: There is no backend to leak keys through logs or error reports.
- **User responsibility**: Users should use API keys with appropriate restrictions (e.g., HTTP referrer restrictions in Google Cloud Console).
- **No key validation**: The app does not pre-validate keys — invalid keys produce a 400/403 error from Google's API.
