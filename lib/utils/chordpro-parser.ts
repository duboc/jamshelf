import type { ParsedSong, Section, SectionType, ChordProEntry } from '@/lib/types/song';

// ─── Section type inference ──────────────────────────────────────────────────

function inferSectionType(label: string): SectionType {
  const l = label.toLowerCase();
  if (l.includes('pre') || l.includes('pré'))          return 'pre-chorus';
  if (l.includes('chorus') || l.includes('refr') || l.includes('refrão')) return 'chorus';
  if (l.includes('verse') || l.includes('verso'))       return 'verse';
  if (l.includes('bridge') || l.includes('pont'))       return 'bridge';
  if (l.includes('intro'))                              return 'intro';
  if (l.includes('outro'))                              return 'outro';
  if (l.includes('solo'))                               return 'solo';
  if (l.includes('interlude') || l.includes('instrumental') || l.includes('grid')) return 'interlude';
  return 'verse';
}

// A string looks like a section header (not a chord name)
function looksLikeSection(s: string): boolean {
  if (!s) return false;
  // Has a space (e.g. "Verse 1", "Pre-Chorus") → section
  if (/\s/.test(s)) return true;
  // Matches known section keywords
  if (/^(intro|verse|chorus|pre.?chorus|bridge|outro|solo|interlude|instrumental|grid|refr|verso)/i.test(s)) return true;
  // Pure chord name like "Am", "F#m7", "D/A" → not a section
  if (/^[A-G][#b]?[a-z0-9/()#]*$/.test(s)) return false;
  return false;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseChordPro(id: string, text: string): ParsedSong {
  const lines = text.split('\n');

  const meta: {
    title: string;
    artist: string;
    originalKey: string;
    capo: number;
    displayKey: string;
    tempo: number;
    timeSignature: string;
  } = {
    title: '',
    artist: '',
    originalKey: '',
    capo: 0,
    displayKey: '',
    tempo: 120,
    timeSignature: '4/4',
  };

  const sections: Section[] = [];
  let current: Section | null = null;

  function pushCurrent() {
    if (current) {
      // Trim trailing empty lines from the section
      while (current.lines.length && !current.lines[current.lines.length - 1].trim()) {
        current.lines.pop();
      }
      if (current.lines.length > 0) sections.push(current);
    }
  }

  function startSection(label: string) {
    pushCurrent();
    current = { type: inferSectionType(label), label, lines: [] };
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // ── Metadata directives ────────────────────────────────────────────────
    const titleM = line.match(/^\{title:\s*(.+)\}$/i);
    if (titleM) { meta.title = titleM[1].trim(); continue; }

    const artistM = line.match(/^\{artist:\s*(.+)\}$/i);
    if (artistM) { meta.artist = artistM[1].trim(); continue; }

    const keyM = line.match(/^\{key:\s*(.+)\}$/i);
    if (keyM) { meta.originalKey = keyM[1].trim(); meta.displayKey = meta.originalKey; continue; }

    const capoM = line.match(/^\{capo:\s*(\d+)\}$/i);
    if (capoM) { meta.capo = parseInt(capoM[1]); continue; }

    const tempoM = line.match(/^\{tempo:\s*(\d+)\}$/i);
    if (tempoM) { meta.tempo = parseInt(tempoM[1]); continue; }

    const timeM = line.match(/^\{time:\s*(.+)\}$/i);
    if (timeM) { meta.timeSignature = timeM[1].trim(); continue; }

    // ── Ignored directives ─────────────────────────────────────────────────
    if (/^\{define:/i.test(line)) continue;
    if (/^\{end_of_/i.test(line)) continue;
    if (/^\{x_/i.test(line)) continue;

    // ── {section: Name} ────────────────────────────────────────────────────
    const sectionM = line.match(/^\{section:\s*(.+)\}$/i);
    if (sectionM) {
      const label = sectionM[1].trim();
      if (!label.toLowerCase().includes('main chord') && !label.toLowerCase().includes('chord used')) {
        startSection(label);
      }
      continue;
    }

    // ── {start_of_TYPE} / {start_of_TYPE: Label} ──────────────────────────
    const startOfM = line.match(/^\{start_of_(\w+)(?::\s*(.+))?\}$/i);
    if (startOfM) {
      const typeWord = startOfM[1];
      const labelOverride = startOfM[2]?.trim();
      const label = labelOverride || (typeWord.charAt(0).toUpperCase() + typeWord.slice(1));
      startSection(label);
      continue;
    }

    // ── {comment: ...} ────────────────────────────────────────────────────
    const commentM = line.match(/^\{comment:\s*(.+)\}$/i);
    if (commentM) {
      const val = commentM[1].trim();
      if (looksLikeSection(val)) {
        startSection(val);
      }
      // otherwise skip (it's an annotation like "Main Chords: C Am F G")
      continue;
    }

    // ── Any remaining directive → skip ────────────────────────────────────
    if (/^\{[^}]+\}$/.test(line)) continue;

    // ── Standalone bracket section header, e.g. [Verse 1], [Intro] ────────
    // A line that is ONLY a bracket group (no surrounding text) and the content looks like a section
    const standaloneM = line.match(/^\[([^\]]+)\]$/);
    if (standaloneM && looksLikeSection(standaloneM[1])) {
      startSection(standaloneM[1]);
      continue;
    }

    // ── Content line (chords + lyrics) ────────────────────────────────────
    if (!current && line.trim()) {
      // Content before any section header — create implicit first section
      current = { type: 'verse', label: 'Song', lines: [] };
    }
    if (current) {
      current.lines.push(line);
    }
  }

  pushCurrent();

  // Fallback: if no sections at all, wrap everything into one
  if (sections.length === 0) {
    const contentLines = lines.filter(l => {
      if (!l.trim()) return false;
      if (/^\{[^}]+\}$/.test(l)) return false;
      return true;
    });
    if (contentLines.length) {
      sections.push({ type: 'verse', label: 'Song', lines: contentLines });
    }
  }

  return {
    id,
    title: meta.title || id,
    artist: meta.artist || '',
    originalKey: meta.originalKey || '',
    capo: meta.capo,
    displayKey: meta.displayKey || meta.originalKey || '',
    tempo: meta.tempo,
    timeSignature: meta.timeSignature,
    sections,
  };
}

// ─── Serializer: ParsedSong → ChordPro text ──────────────────────────────────

export function songToChordPro(song: ParsedSong): string {
  const lines: string[] = [];
  lines.push(`{title: ${song.title}}`);
  lines.push(`{artist: ${song.artist}}`);
  if (song.originalKey) lines.push(`{key: ${song.originalKey}}`);
  if (song.capo > 0)    lines.push(`{capo: ${song.capo}}`);
  if (song.tempo !== 120) lines.push(`{tempo: ${song.tempo}}`);
  if (song.timeSignature !== '4/4') lines.push(`{time: ${song.timeSignature}}`);
  lines.push('');

  for (const section of song.sections) {
    lines.push(`[${section.label}]`);
    for (const line of section.lines) lines.push(line);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ─── Metadata patch helper ───────────────────────────────────────────────────
// Updates or inserts a single directive in the raw .cho text without full parse+serialize.

export function patchChordProMeta(text: string, key: string, value: string | number): string {
  const directive = `{${key}: ${value}}`;
  const pattern = new RegExp(`\\{${key}:[^}]*\\}`, 'i');
  if (pattern.test(text)) {
    return text.replace(pattern, directive);
  }
  // Insert after any existing directives at the top
  const firstNonDirective = text.split('\n').findIndex(l => l.trim() && !/^\{[^}]+\}$/.test(l.trim()));
  const insertAt = firstNonDirective < 0 ? 0 : firstNonDirective;
  const lines = text.split('\n');
  lines.splice(insertAt, 0, directive);
  return lines.join('\n');
}

// ─── Parse an entry (convenience wrapper) ────────────────────────────────────

export function parseEntry(entry: ChordProEntry): ParsedSong {
  return parseChordPro(entry.id, entry.text);
}
