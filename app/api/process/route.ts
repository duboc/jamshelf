import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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
- For sections without lyrics (like Intro, Solo, Instrumental, Outro), preserve the horizontal chord progression and grid format on the same lines (e.g., | [C] | [Am] | or [C] [Am] [F] [G]) instead of splitting them onto separate lines.
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
| [C] | [Am] | [F] | [G] |

[Verse 1]
[C]I fell by the wayside like everyone else
[Am]I hate you, I hate you, I hate you but I was just kidding myself

[Chorus]
[C]So, [G]before you [Am]go

Convert this raw chord sheet:`;

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (aiClient) return aiClient;

  const isEnterprise = process.env.GOOGLE_GENAI_USE_ENTERPRISE === 'true';
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  aiClient = isEnterprise
    ? new GoogleGenAI({
        enterprise: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      })
    : new GoogleGenAI({ apiKey });

  return aiClient;
}

const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export async function POST(request: Request) {
  try {
    const { rawText } = await request.json();

    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid rawText' },
        { status: 400 }
      );
    }

    const ai = getAiClient();

    // Call 1: Search and retrieve raw chords and lyrics using Google Search grounding
    const searchResponse = await ai.models.generateContent({
      model: modelName,
      contents: `Search the web to find the complete chords and lyrics for the following song or query: ${rawText}. Output only the raw chords and lyrics sheet.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawChords = searchResponse?.text;
    if (!rawChords) {
      return NextResponse.json(
        { error: 'Failed to retrieve chords via Google Search grounding' },
        { status: 500 }
      );
    }

    // Call 2: Format the raw chords into structured ChordPro (No grounding to avoid API constraints)
    const formatResponse = await ai.models.generateContent({
      model: modelName,
      contents: GEMINI_PROMPT + '\n\n' + rawChords,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    });

    const text = formatResponse?.text;
    if (!text) {
      return NextResponse.json(
        { error: 'Failed to format ChordPro from retrieved chords' },
        { status: 500 }
      );
    }

    // Strip any accidental markdown fences
    const clean = text.replace(/^```[a-z]*\n?/gm, '').replace(/^```$/gm, '').trim();

    // Derive a stable-ish ID from the title directive
    const titleMatch = clean.match(/^\{title:\s*(.+)\}$/im);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const id = title
      ? 'song-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'song-' + Date.now();

    return NextResponse.json({ id, text: clean });
  } catch (error: unknown) {
    console.error('Detailed API Error:', error);
    return NextResponse.json(
      { error: 'AI processing failed. Please verify raw input or check service configuration.' },
      { status: 500 }
    );
  }
}
