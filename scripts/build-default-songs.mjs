/**
 * Jamshelf — Build Default Songs
 * Reads all .cho files from the /chords directory and generates
 * lib/data/default-songs.ts with ChordProEntry[] inline.
 *
 * Usage (run from project root):
 *   node scripts/build-default-songs.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHORDS_DIR = process.env.CHORDS_DIR || join(ROOT, '..', '..', '..', '..', 'chords');
const OUT_FILE = join(ROOT, 'lib', 'data', 'default-songs.ts');

function fileNameToId(filename) {
  return basename(filename, '.cho')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const files = readdirSync(CHORDS_DIR)
  .filter(f => f.endsWith('.cho'))
  .sort();

console.log(`Found ${files.length} .cho files`);

const entries = files.map(file => {
  const id = fileNameToId(file);
  const text = readFileSync(join(CHORDS_DIR, file), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  return { id, text };
});

const lines = [
  `import type { ChordProEntry } from '@/lib/types/song';`,
  ``,
  `export const DEFAULT_CHORDPRO: ChordProEntry[] = [`,
];

for (const { id, text } of entries) {
  // Escape backticks and ${} in the .cho text for template literals
  const escaped = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  lines.push(`  {`);
  lines.push(`    id: ${JSON.stringify(id)},`);
  lines.push(`    text: \`${escaped}\`,`);
  lines.push(`  },`);
}

lines.push(`];`);
lines.push(``);

writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(`Written ${entries.length} songs to ${OUT_FILE}`);
