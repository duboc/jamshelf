import { NextResponse } from 'next/server';
import { getAiClient, GEMINI_MODEL } from '@/lib/gemini';

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

/**
 * Heuristic: returns true when the user pasted an actual chord sheet or full
 * lyrics instead of a short search query or URL. Avoids wasting a web-search
 * round-trip (and risking overwriting the user's pasted version).
 */
function looksLikePastedSheet(text: string): boolean {
  const trimmed = text.trim();
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return false;
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length >= 4) return true;
  if (trimmed.length >= 160 && lines.length >= 2) return true;
  if (/^\{title:/im.test(trimmed)) return true;
  return false;
}

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
    const trimmed = rawText.trim();
    let sourceForFormatting = trimmed;

    if (!looksLikePastedSheet(trimmed)) {
      const isUrl = /^https?:\/\/[^\s]+$/i.test(trimmed);
      const searchPrompt = isUrl
        ? `Extract and transcribe the song from this URL: "${trimmed}".
Find:
1. The official key of the song.
2. The tempo (BPM) of the song.
3. The capo position (if any).
4. The complete chords and lyrics sheet.

Output the key, tempo, and capo clearly at the top, followed by the raw chords and lyrics sheet.`
        : `Search the web to find the following information for "${trimmed}":
1. The official key of the song.
2. The tempo (BPM) of the song.
3. The capo position (if any).
4. The complete chords and lyrics sheet.

Output the key, tempo, and capo clearly at the top, followed by the raw chords and lyrics sheet.`;

      // Call 1: Search and retrieve raw chords, lyrics, and metadata using Google Search grounding
      const searchResponse = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawChords = searchResponse?.text;
      if (!rawChords) {
        return NextResponse.json(
          { error: 'Não foi possível buscar a cifra na web. Tente colar a cifra diretamente.' },
          { status: 500 }
        );
      }
      sourceForFormatting = rawChords;
    }

    // Call 2 (or sole call for pasted sheets): Format into structured ChordPro
    const formatResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: GEMINI_PROMPT + '\n\n' + sourceForFormatting,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    });

    const text = formatResponse?.text;
    if (!text) {
      return NextResponse.json(
        { error: 'Não foi possível formatar o arquivo ChordPro.' },
        { status: 500 }
      );
    }

    // Strip any accidental markdown fences
    const clean = text.replace(/^```[a-z]*\n?/gm, '').replace(/^```$/gm, '').trim();

    // Derive a clean slug ID from the title directive
    const titleMatch = clean.match(/^\{title:\s*(.+)\}$/im);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const slug = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = slug ? `song-${slug}` : `song-${Date.now()}`;

    return NextResponse.json({ id, text: clean });
  } catch (error: unknown) {
    console.error('Detailed API Error:', error);
    return NextResponse.json(
      { error: 'Falha ao processar com IA. Verifique o texto ou a configuração do serviço.' },
      { status: 500 }
    );
  }
}
