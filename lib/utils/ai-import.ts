import type { ChordProEntry } from '@/lib/types/song';

const GEMINI_PROMPT = `You are a music transcription assistant. Convert the raw chord sheet / lyrics text into a ChordPro format (.cho file).

RULES:
- Output ONLY the ChordPro file content, no markdown, no backticks, no explanation
- First lines must be metadata directives in this exact format:
  {title: Song Title}
  {artist: Artist Name}
  {key: Am}
  {capo: 0}
  {tempo: 120}
- Omit {capo:} if capo is 0
- Section headers use bracket syntax on their own line: [Intro], [Verse 1], [Chorus], [Pre-Chorus], [Bridge], [Outro]
- Number duplicate sections: [Verse 1], [Verse 2], [Chorus 1], [Chorus 2]
- Inline chords use [ChordName] notation placed immediately before the syllable they land on
- Detect and label all sections: Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro, Solo
- Preserve all lyrics exactly
- Brazilian Portuguese section labels if applicable: use English equivalents in output

EXAMPLE OUTPUT:
{title: Before You Go}
{artist: Lewis Capaldi}
{key: Eb}
{capo: 3}
{tempo: 76}

[Intro]
[C]

[Verse 1]
[C]I fell by the wayside like everyone else
[Am]I hate you, I hate you, I hate you but I was just kidding myself

[Chorus]
[C]So, [G]before you [Am]go

Convert this raw chord sheet:`;

export async function processWithGemini(apiKey: string, rawText: string): Promise<ChordProEntry> {
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

  // Strip any accidental markdown fences
  const clean = text.replace(/^```[a-z]*\n?/gm, '').replace(/^```$/gm, '').trim();

  // Derive a stable-ish ID from the title directive
  const titleMatch = clean.match(/^\{title:\s*(.+)\}$/im);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const id = title
    ? 'song-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'song-' + Date.now();

  return { id, text: clean };
}
