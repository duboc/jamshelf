/**
 * Jamshelf Song Seed Script
 * Generates chord sheet JSON for a batch of songs using Gemini API.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/seed-songs-batch.mjs <batch-name>
 *
 * batch-name: "english-pop" | "english-rock" | "portuguese"
 *
 * Outputs: scripts/staging/songs-<batch-name>.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('ERROR: Set GEMINI_API_KEY environment variable');
  process.exit(1);
}

const batchName = process.argv[2];
if (!['english-pop', 'english-rock', 'portuguese'].includes(batchName)) {
  console.error('Usage: node seed-songs-batch.mjs <english-pop|english-rock|portuguese>');
  process.exit(1);
}

// ─── Song lists per batch ────────────────────────────────────────────────────

const BATCHES = {
  'english-pop': [
    { id: 'before-you-go',          title: 'Before You Go',                  artist: 'Lewis Capaldi' },
    { id: 'wish-you-the-best',      title: 'Wish You The Best',              artist: 'Lewis Capaldi' },
    { id: 'heal-me',                title: 'Heal Me',                        artist: 'FARR' },
    { id: 'asking-for-a-friend',    title: 'Asking For a Friend',            artist: 'Foo Fighters' },
    { id: 'stranger-things',        title: 'Stranger Things Have Happened',  artist: 'Foo Fighters' },
    { id: 'seaside',                title: 'Seaside',                        artist: 'The Kooks' },
    { id: 'drive',                  title: 'Drive',                          artist: 'Incubus' },
    { id: 'adventure-of-a-lifetime',title: 'Adventure of a Lifetime',        artist: 'Coldplay' },
    { id: 'wildflower',             title: 'Wildflower',                     artist: 'Billie Eilish' },
    { id: 'fix-you',                title: 'Fix You',                        artist: 'Coldplay' },
  ],

  'english-rock': [
    { id: 'do-i-wanna-know',        title: 'Do I Wanna Know?',               artist: 'Arctic Monkeys' },
    { id: 'knee-socks',             title: 'Knee Socks',                     artist: 'Arctic Monkeys' },
    { id: 'r-u-mine',               title: 'R U Mine?',                      artist: 'Arctic Monkeys' },
    { id: 'come-together',          title: 'Come Together',                  artist: 'The Beatles' },
    { id: 'let-it-be',              title: 'Let It Be',                      artist: 'The Beatles' },
    { id: 'i-miss-you',             title: 'I Miss You',                     artist: 'Blink-182' },
    { id: 'whats-my-age-again',     title: "What's My Age Again?",           artist: 'Blink-182' },
    { id: 'clocks',                 title: 'Clocks',                         artist: 'Coldplay' },
    { id: 'god-put-a-smile',        title: 'God Put a Smile upon Your Face', artist: 'Coldplay' },
    { id: 'basket-case',            title: 'Basket Case',                    artist: 'Green Day' },
    { id: 'sweet-home-alabama',     title: 'Sweet Home Alabama',             artist: 'Lynyrd Skynyrd' },
    { id: 'stop-crying',            title: 'Stop Crying Your Heart Out',     artist: 'Oasis' },
    { id: 'live-forever',           title: 'Live Forever',                   artist: 'Oasis' },
    { id: 'crazy-little-thing',     title: 'Crazy Little Thing Called Love', artist: 'Queen' },
    { id: 'make-it-wit-chu',        title: 'Make It Wit Chu',               artist: 'Queens of the Stone Age' },
    { id: 'snow-rhcp',              title: 'Snow (Hey Oh)',                  artist: 'Red Hot Chili Peppers' },
    { id: 'dani-california',        title: 'Dani California',                artist: 'Red Hot Chili Peppers' },
    { id: 'wild-child',             title: 'Wild Child',                     artist: 'The Black Keys' },
    { id: 'mr-brightside',          title: 'Mr. Brightside',                 artist: 'The Killers' },
    { id: 'last-nite',              title: 'Last Nite',                      artist: 'The Strokes' },
    { id: 'i-will-survive',         title: 'I Will Survive',                 artist: 'Gloria Gaynor' },
    { id: 'learn-to-fly',           title: 'Learn to Fly',                   artist: 'Foo Fighters' },
    { id: 'use-somebody',           title: 'Use Somebody',                   artist: 'Kings of Leon' },
    { id: 'start-me-up',            title: 'Start Me Up',                    artist: 'Rolling Stones' },
    { id: 'psycho-killer',          title: 'Psycho Killer',                  artist: 'Talking Heads' },
    { id: 'jump',                   title: 'Jump',                           artist: 'Van Halen' },
    { id: 'never-again',            title: 'Never Again',                    artist: 'Nickelback' },
    { id: 'spiders',                title: 'Spiders',                        artist: 'System of a Down' },
  ],

  'portuguese': [
    { id: 'razoes-e-emocoes',       title: 'Razões e Emoções',               artist: 'NX Zero' },
    { id: 'quando-crescer',         title: 'Quando Crescer',                 artist: 'Fresno' },
    { id: 'biografia-re-menor',     title: 'Biografia em Ré Menor',          artist: 'Fresno' },
    { id: 'love-love',              title: 'Love Love',                      artist: 'Gilsons' },
    { id: 'mutante',                title: 'Mutante',                        artist: 'Liniker e os Caramelows' },
    { id: 'idiota-raiz',            title: 'Idiota Raiz',                    artist: 'João Gomes' },
    { id: 'senhor-do-tempo',        title: 'Senhor do Tempo',                artist: 'Charlie Brown Jr.' },
    { id: 'pontes-indestrutíveis',  title: 'Pontes Indestrutíveis',          artist: 'João Gomes' },
    { id: 'meu-pedaco-de-pecado',   title: 'Meu Pedaço de Pecado',           artist: 'João Gomes' },
    { id: 'nocaute',                title: 'Nocaute',                        artist: 'João Gomes' },
    { id: 'apesar-de-querer',       title: 'Apesar de Querer',               artist: 'Rodrigo Alarcon' },
    { id: 'ventos-de-netuno',       title: 'Ventos de Netuno',               artist: '5 a Seco' },
    { id: 'subirusdoistiozin',      title: 'Subirusdoistiozin',              artist: 'Criolo' },
    { id: 'sina',                   title: 'Sina',                           artist: 'Djavan' },
    { id: 'foda-que-ela-e-linda',   title: 'Foda que Ela é Linda',           artist: '3030' },
  ],
};

// ─── Gemini prompt ───────────────────────────────────────────────────────────

function buildPrompt(songs, isPortuguese) {
  const langHint = isPortuguese
    ? `LANGUAGE NOTE: Songs may have Brazilian Portuguese lyrics. Preserve all accents (ã, ç, é, á, etc.) exactly. Portuguese section labels map to: Verso=verse, Refrão=chorus, Pré-Refrão=pre-chorus, Ponte=bridge, Solo=solo, Intro=intro, Outro=outro.\n\n`
    : '';

  const songList = songs
    .map((s, i) => `${i + 1}. "${s.title}" by ${s.artist} (id: "${s.id}")`)
    .join('\n');

  return `You are a music expert and chord sheet transcription assistant.

Generate accurate chord sheets for the following songs from memory. You know these songs well — produce realistic, correct chord progressions, accurate keys, real BPM values, and complete lyrics with inline chord notation.

${langHint}RULES:
- Output ONLY a valid JSON array, no markdown, no backticks, no explanation
- Use [ChordName] inline notation placed immediately before the syllable the chord lands on
- Include ALL sections with real lyrics (not placeholder text)
- Section type must be one of: intro, verse, pre-chorus, chorus, bridge, outro, solo, interlude
- Number repeated sections: "Verse 1", "Verse 2", "Chorus 1", etc.
- Use accurate original keys and real BPM values
- Include capo if the song is commonly played with one

OUTPUT FORMAT — a JSON array of song objects:
[
  {
    "id": "song-id-here",
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
        "lines": ["[Am]Walk in your [G]rainbow [C]paradise"]
      }
    ]
  }
]

Generate chord sheets for these songs:
${songList}`;
}

// ─── Gemini API call ─────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 65536,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');
  return text;
}

// ─── Parse and validate response ─────────────────────────────────────────────

function parseResponse(text, expectedSongs) {
  const clean = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  let songs;
  try {
    songs = JSON.parse(clean);
  } catch (e) {
    // Try to extract just the array
    const match = clean.match(/\[[\s\S]+\]/);
    if (!match) throw new Error('Could not parse JSON array from response');
    songs = JSON.parse(match[0]);
  }

  if (!Array.isArray(songs)) throw new Error('Response is not a JSON array');

  const VALID_TYPES = new Set(['intro','verse','pre-chorus','chorus','bridge','outro','solo','interlude']);

  return songs.map((song, i) => {
    // Ensure stable ID from our list
    const expected = expectedSongs[i];
    if (expected) song.id = expected.id;

    // Fix section types
    if (song.sections) {
      song.sections = song.sections.map(sec => {
        if (!VALID_TYPES.has(sec.type)) {
          // Map common mis-labellings
          const t = sec.type?.toLowerCase() || '';
          if (t.includes('refr') || t.includes('chorus')) sec.type = 'chorus';
          else if (t.includes('verse') || t.includes('verso')) sec.type = 'verse';
          else if (t.includes('pre') || t.includes('pré')) sec.type = 'pre-chorus';
          else if (t.includes('bridge') || t.includes('pont')) sec.type = 'bridge';
          else if (t.includes('intro')) sec.type = 'intro';
          else if (t.includes('outro')) sec.type = 'outro';
          else if (t.includes('solo')) sec.type = 'solo';
          else sec.type = 'verse'; // fallback
        }
        return sec;
      });
    }

    // Ensure required fields
    if (!song.capo) song.capo = 0;
    if (!song.timeSignature) song.timeSignature = '4/4';
    if (!song.displayKey) song.displayKey = song.originalKey;

    return song;
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const songs = BATCHES[batchName];
  const isPortuguese = batchName === 'portuguese';

  console.log(`\n🎸 Jamshelf Song Seeder`);
  console.log(`Batch: ${batchName} (${songs.length} songs)`);
  console.log(`Calling Gemini 2.0 Flash...\n`);

  // Split into chunks of 8 to avoid token limits
  const CHUNK_SIZE = 8;
  const allResults = [];

  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    const chunk = songs.slice(i, i + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE)+1}/${Math.ceil(songs.length/CHUNK_SIZE)}: ${chunk.map(s => s.title).join(', ')}`);

    const prompt = buildPrompt(chunk, isPortuguese);
    const raw = await callGemini(prompt);
    const parsed = parseResponse(raw, chunk);
    allResults.push(...parsed);
    console.log(`  ✓ Got ${parsed.length} songs\n`);

    // Small delay between chunks
    if (i + CHUNK_SIZE < songs.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Write output
  mkdirSync(join(__dirname, 'staging'), { recursive: true });
  const outPath = join(__dirname, 'staging', `songs-${batchName}.json`);
  writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n✅ Written ${allResults.length} songs to ${outPath}`);
  console.log(`\nNext step: run scripts/build-ts-files.mjs to generate TypeScript data files.`);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
