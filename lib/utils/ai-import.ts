import type { Song } from '@/lib/types/song';

const GEMINI_PROMPT = `You are a music transcription assistant. Convert the raw chord sheet / lyrics text into a structured JSON object.

RULES:
- Output ONLY valid JSON, no markdown, no backticks, no explanation
- Inline chords with [ChordName] notation right before the syllable/word they land on
- Detect sections: intro, verse, pre-chorus, chorus, bridge, outro, solo, interlude
- Number duplicate sections (Verse 1, Verse 2, etc.)
- Preserve all lyrics exactly
- Extract metadata: title, artist, capo, tempo (estimate if not given), key, time signature

OUTPUT FORMAT:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "originalKey": "Am",
  "capo": 0,
  "displayKey": "Am",
  "tempo": 120,
  "timeSignature": "4/4",
  "sections": [
    {
      "type": "verse",
      "label": "Verse 1",
      "lines": ["[Am]Lyrics with [C]inline chords [G]here"]
    }
  ]
}

Section types must be one of: intro, verse, pre-chorus, chorus, bridge, outro, solo, interlude

Convert this raw chord sheet:`;

export async function processWithGemini(apiKey: string, rawText: string): Promise<Song> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: GEMINI_PROMPT + '\n\n' + rawText }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');
  const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const song: Song = JSON.parse(clean);
  song.id = 'song-' + Date.now();
  return song;
}
