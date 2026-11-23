import type { ParsedSong, Section, SectionType, ChordProEntry } from '@/lib/types/song';
import { formatSectionLabel } from '@/lib/utils/music';

// ─── Section type inference ──────────────────────────────────────────────────

export function inferSectionType(label: string): SectionType {
  const l = label.toLowerCase();
  if (l.includes('pre') || l.includes('pré')) return 'pre-chorus';
  if (l.includes('chorus') || l.includes('refr') || l.includes('refrão')) return 'chorus';
  if (l.includes('verse') || l.includes('verso') || l.includes('estrofe')) return 'verse';
  if (l.includes('bridge') || l.includes('pont')) return 'bridge';
  if (l.includes('intro')) return 'intro';
  if (l.includes('solo')) return 'solo';
  if (l.includes('outro') || l.includes('final')) return 'outro';
  if (l.includes('interlud') || l.includes('instrumental') || l.includes('grid')) return 'interlude';
  return 'verse';
}

// Musical chord symbol check (case-sensitive root A-G so words like "Coda", "Riff", "Tag", "Pré-refrão" are never mistaken for chords)
const CHORD_TOKEN_RE =
  /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|alt|°|ø|Δ|\+|-)?[0-9]*(?:(?:add|sus|maj|min|dim|aug|b|#|[0-9()+-])*)(?:\/[A-G][#b]?)?$/;

// A string looks like a section header (not a chord name)
export function looksLikeSection(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return true;
  if (
    /^(intro|verse|chorus|pre.?chorus|pr[eé].?refr|p[oó]s.?refr|bridge|outro|solo|interlud|instrumental|grid|refr|verso|ponte|estrofe|final|coda|tag|riff|break|ending|turnaround|tema|parte|coro|m[uú]sica)/i.test(
      trimmed
    )
  ) {
    return true;
  }
  // Any standalone bracketed label that is NOT a valid chord symbol is a section header
  return !CHORD_TOKEN_RE.test(trimmed);
}

// ─── Duration & marks helpers ────────────────────────────────────────────────

export function parseDurationValue(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const mmss = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (secs < 60) {
      const total = mins * 60 + secs;
      return total >= 15 && total <= 1800 ? total : null;
    }
    return null;
  }
  const num = parseInt(s, 10);
  if (!isNaN(num) && num >= 15 && num <= 1800) return num;
  return null;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseMarksValue(raw: string): number[] | null {
  const parts = raw
    .split(',')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length >= 2 ? parts : null;
}

export function serializeMarks(marks: number[]): string {
  return marks.map((n) => Number(n.toFixed(1))).join(',');
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export interface ParseChordProOptions {
  /** When true (visual edit mode), keep newly added empty sections and user-typed trailing blank lines intact. */
  preserveEmptySections?: boolean;
}

export function parseChordPro(
  id: string,
  text: string,
  options?: ParseChordProOptions
): ParsedSong {
  const preserveEmpty = Boolean(options?.preserveEmptySections);
  const lines = text.split('\n');

  const meta = {
    title: '',
    artist: '',
    originalKey: '',
    capo: 0,
    displayKey: '',
    tempo: 120,
    tempoConfirmed: false,
    timeSignature: '4/4',
    spotifyTrackId: null as string | null,
    duration: null as number | null,
    scrollSpeed: null as number | null,
    sectionMarks: null as number[] | null,
    notes: '',
  };

  const sections: Section[] = [];
  let current: Section | null = null;

  function pushCurrent(hasFollowingSection: boolean) {
    if (!current) return;
    if (preserveEmpty) {
      // songToChordPro inserts a single structural blank line between sections; pop only that one separator
      if (hasFollowingSection && current.lines.length > 0 && !current.lines[current.lines.length - 1].trim()) {
        current.lines.pop();
      }
      if (current.lines.length === 0) {
        current.lines.push('');
      }
      sections.push(current);
    } else {
      while (current.lines.length && !current.lines[current.lines.length - 1].trim()) {
        current.lines.pop();
      }
      if (current.lines.length > 0) sections.push(current);
    }
  }

  function startSection(label: string) {
    pushCurrent(true);
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
    if (capoM) { meta.capo = parseInt(capoM[1], 10); continue; }

    const tempoM = line.match(/^\{tempo:\s*(\d+)\}$/i);
    if (tempoM) {
      meta.tempo = Math.max(30, Math.min(260, parseInt(tempoM[1], 10)));
      meta.tempoConfirmed = true;
      continue;
    }

    const timeM = line.match(/^\{time:\s*(.+)\}$/i);
    if (timeM) { meta.timeSignature = timeM[1].trim(); continue; }

    const spotifyM = line.match(/^\{spotify:\s*(.+)\}$/i);
    if (spotifyM) { meta.spotifyTrackId = spotifyM[1].trim(); continue; }

    const durationM = line.match(/^\{duration:\s*(.+)\}$/i);
    if (durationM) { meta.duration = parseDurationValue(durationM[1]); continue; }

    const scrollM = line.match(/^\{scroll:\s*([0-9.]+)\}$/i);
    if (scrollM) {
      const val = parseFloat(scrollM[1]);
      if (Number.isFinite(val) && val >= 0.1 && val <= 3) {
        meta.scrollSpeed = val;
      }
      continue;
    }

    const marksM = line.match(/^\{marks:\s*(.+)\}$/i);
    if (marksM) { meta.sectionMarks = parseMarksValue(marksM[1]); continue; }

    const notesM = line.match(/^\{notes:\s*(.*)\}$/i);
    if (notesM) { meta.notes = notesM[1].trim(); continue; }

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
      const label = labelOverride || formatSectionLabel(typeWord.charAt(0).toUpperCase() + typeWord.slice(1));
      startSection(label);
      continue;
    }

    // ── {comment: ...} ────────────────────────────────────────────────────
    const commentM = line.match(/^\{comment:\s*(.+)\}$/i);
    if (commentM) {
      const val = commentM[1].trim();
      // Fallback: extract capo from legacy comments like "{comment: Capo 3rd fret}" when {capo:} is absent
      if (meta.capo === 0) {
        const capoCommentM = val.match(/^capo(?:traste)?\s*(?:on\s+|na\s+casa\s+|casa\s+)?(\d{1,2})\b/i);
        if (capoCommentM) {
          const parsedCapo = parseInt(capoCommentM[1], 10);
          if (parsedCapo >= 1 && parsedCapo <= 12) {
            meta.capo = parsedCapo;
            continue;
          }
        }
      }
      if (looksLikeSection(val)) startSection(val);
      continue;
    }

    // ── Any remaining directive → skip ────────────────────────────────────
    if (/^\{[^}]+\}$/.test(line)) continue;

    // ── Standalone bracket section header ─────────────────────────────────
    const standaloneM = line.match(/^\[([^\]]+)\]$/);
    if (standaloneM && looksLikeSection(standaloneM[1])) {
      startSection(standaloneM[1]);
      continue;
    }

    // ── Content line ──────────────────────────────────────────────────────
    if (!current && line.trim()) {
      current = { type: 'verse', label: 'Música', lines: [] };
    }
    if (current) current.lines.push(line);
  }

  pushCurrent(false);

  if (sections.length === 0) {
    const contentLines = lines.filter((l) => l.trim() && !/^\{[^}]+\}$/.test(l));
    if (contentLines.length) {
      sections.push({ type: 'verse', label: 'Música', lines: contentLines });
    } else if (preserveEmpty) {
      sections.push({ type: 'verse', label: 'Verso', lines: [''] });
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
    tempoConfirmed: meta.tempoConfirmed,
    timeSignature: meta.timeSignature,
    spotifyTrackId: meta.spotifyTrackId,
    duration: meta.duration,
    scrollSpeed: meta.scrollSpeed,
    sectionMarks: meta.sectionMarks,
    notes: meta.notes,
    sections,
  };
}

// ─── Serializer ───────────────────────────────────────────────────────────────

export function songToChordPro(song: ParsedSong): string {
  const lines: string[] = [];
  lines.push(`{title: ${song.title}}`);
  lines.push(`{artist: ${song.artist}}`);
  if (song.originalKey) lines.push(`{key: ${song.originalKey}}`);
  if (song.capo > 0) lines.push(`{capo: ${song.capo}}`);
  if (song.tempoConfirmed || song.tempo !== 120) lines.push(`{tempo: ${song.tempo}}`);
  if (song.timeSignature !== '4/4') lines.push(`{time: ${song.timeSignature}}`);
  if (song.spotifyTrackId) lines.push(`{spotify: ${song.spotifyTrackId}}`);
  if (song.duration && song.duration > 0) lines.push(`{duration: ${Math.round(song.duration)}}`);
  if (song.scrollSpeed && song.scrollSpeed > 0) lines.push(`{scroll: ${Number(song.scrollSpeed.toFixed(2))}}`);
  if (song.sectionMarks && song.sectionMarks.length >= 2) {
    lines.push(`{marks: ${serializeMarks(song.sectionMarks)}}`);
  }
  if (song.notes && song.notes.trim()) {
    lines.push(`{notes: ${song.notes.replace(/[\r\n]+/g, ' · ').trim()}}`);
  }
  lines.push('');

  for (let si = 0; si < song.sections.length; si++) {
    const section = song.sections[si];
    const cleanLabel = section.label.trim() || 'Verso';
    // Use {section: ...} when a custom section name would look like a chord symbol (e.g. "A", "B", "Dm")
    lines.push(looksLikeSection(cleanLabel) ? `[${cleanLabel}]` : `{section: ${cleanLabel}}`);
    for (const l of section.lines) lines.push(l);
    if (si < song.sections.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Metadata patch helper ────────────────────────────────────────────────────

export function patchChordProMeta(text: string, key: string, value: string | number): string {
  const directive = `{${key}: ${value}}`;
  const pattern = new RegExp(`\\{${key}:[^}]*\\}`, 'i');
  if (pattern.test(text)) {
    return text.replace(pattern, directive);
  }
  const firstNonDirective = text.split('\n').findIndex((l) => l.trim() && !/^\{[^}]+\}$/.test(l.trim()));
  const insertAt = firstNonDirective < 0 ? 0 : firstNonDirective;
  const ls = text.split('\n');
  ls.splice(insertAt, 0, directive);
  return ls.join('\n');
}

// ─── Remove a directive ───────────────────────────────────────────────────────

export function removeChordProMeta(text: string, key: string): string {
  const pattern = new RegExp(`^\\{${key}:[^}]*\\}\\n?`, 'im');
  return text.replace(pattern, '');
}

// ─── Convenience wrapper ──────────────────────────────────────────────────────

export function parseEntry(entry: ChordProEntry): ParsedSong {
  return parseChordPro(entry.id, entry.text);
}
