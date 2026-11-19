import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';
import { getAiClient, GEMINI_MODEL } from '@/lib/gemini';

const ENHANCE_PROMPT = `You are a music-transcription fact-checker. You will be given an existing ChordPro chord sheet. Use web search to verify its lyrics and chords against real, reliable sources for this exact song (official releases, well-established chord/lyric sites, etc.).

RULES:
- Output ONLY the corrected ChordPro file content, no markdown, no backticks, no explanation, no commentary about what you changed
- Keep the exact same ChordPro format already used in the input (same metadata directive style, same section header style)
- Fix lyrics that are clearly wrong or misheard
- Fix or add chords that are clearly wrong or missing, keeping them placed on the correct syllable
- Do NOT change the song's structure/section order unless it's clearly incorrect
- If you cannot find reliable information to confidently verify or correct something, leave it exactly as it is — never guess or invent a "fix" you're not confident about
- Preserve any metadata you cannot verify (tempo, capo, key) unless you find clear evidence it's wrong

Here is the existing chord sheet to check and correct:`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const doc = await getDb().collection('songs').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Música não encontrada no servidor.' }, { status: 404 });
    }
    const originalText: string = doc.data()?.text || '';
    if (!originalText) {
      return NextResponse.json({ error: 'A música não possui conteúdo para revisar.' }, { status: 400 });
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: ENHANCE_PROMPT + '\n\n' + originalText,
      config: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response?.text;
    if (!text) {
      return NextResponse.json({ error: 'A IA não retornou resposta. Tente novamente.' }, { status: 500 });
    }

    // Strip any accidental markdown fences
    const enhancedText = text.replace(/^```[a-z]*\n?/gm, '').replace(/^```$/gm, '').trim();

    return NextResponse.json({ originalText, enhancedText });
  } catch (error: unknown) {
    console.error('Enhance API Error:', error);
    return NextResponse.json(
      { error: 'Não foi possível revisar a cifra com IA agora. Tente novamente.' },
      { status: 500 }
    );
  }
}
