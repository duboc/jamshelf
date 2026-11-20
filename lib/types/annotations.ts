export type NoteTone = 'amber' | 'primary' | 'tune' | 'rec';

export type StrokeTool = 'pen' | 'highlighter';

export type AnnotateTool = 'pen' | 'highlighter' | 'text' | 'eraser';

export type NoteShape = 'circle' | 'diamond' | 'square' | 'triangle';

/**
 * Anchors a handwritten stroke or text note directly to a musical line/header
 * inside a song section (so it tracks cleanly across iPad portrait/landscape
 * rotations, auto-fit zoom, and section splits), or falls back to the open
 * slide canvas (`kind: 'page'`) when placed in a margin outside any card.
 */
export type AnnotationAnchor =
  | {
      kind: 'section';
      sectionIdx: number;
      /** -1 attaches to the section header pill; >= 0 attaches to original line index in ParsedSong.sections[sectionIdx].lines */
      origLineIdx: number;
    }
  | {
      kind: 'page';
      pageIdx: number;
    };

export interface InkStroke {
  id: string;
  tool: StrokeTool;
  tone: NoteTone;
  anchor: AnnotationAnchor;
  /**
   * For `section` anchors: X offset in `em` from the anchor's left edge.
   * For `page` anchors: normalized fraction [0..1] of stage width.
   */
  originX: number;
  /**
   * For `section` anchors: Y offset in `em` from the anchor's top edge.
   * For `page` anchors: normalized fraction [0..1] of stage height.
   */
  originY: number;
  /**
   * Relative stroke points from (originX, originY) in `em` units: [dxEm, dyEm, pressure].
   * Rounded to 3 decimal places for compact JSON persistence.
   */
  points: [number, number, number][];
  createdAt: number;
}

export interface TextNote {
  id: string;
  text: string;
  tone: NoteTone;
  anchor: AnnotationAnchor;
  /**
   * For `section` anchors with `align !== 'right'`: X offset in `em` from anchor's left edge.
   * For `section` anchors with `align === 'right'`: X offset in `em` from anchor's right edge.
   * For `page` anchors: normalized fraction [0..1] of stage width.
   */
  x: number;
  /**
   * For `section` anchors: Y offset in `em` from the anchor's top edge.
   * For `page` anchors: normalized fraction [0..1] of stage height.
   */
  y: number;
  /** Right-anchoring keeps notes placed on the right half crisp and single-line without squishing. */
  align?: 'left' | 'right';
  createdAt: number;
}

export interface SongAnnotations {
  songId: string;
  strokes: InkStroke[];
  notes: TextNote[];
  updatedAt: number;
}

export interface NoteToneStyle {
  id: NoteTone;
  label: string;
  shape: NoteShape;
  inkVar: string;
  hiVar: string;
  chipBg: string;
  chipFg: string;
  dotColor: string;
}

export const NOTE_TONES: NoteToneStyle[] = [
  {
    id: 'amber',
    label: 'Âmbar de palco',
    shape: 'circle',
    inkVar: 'var(--note-ink-amber)',
    hiVar: 'var(--note-hi-amber)',
    chipBg: 'var(--warn-dim)',
    chipFg: 'var(--warn-ink)',
    dotColor: 'var(--note-ink-amber)',
  },
  {
    id: 'primary',
    label: 'Cor do tema',
    shape: 'diamond',
    inkVar: 'var(--note-ink-primary)',
    hiVar: 'var(--note-hi-primary)',
    chipBg: 'var(--note-chip-primary-bg)',
    chipFg: 'var(--note-chip-primary-fg)',
    dotColor: 'var(--note-ink-primary)',
  },
  {
    id: 'tune',
    label: 'Verde ritmo',
    shape: 'square',
    inkVar: 'var(--note-ink-tune)',
    hiVar: 'var(--note-hi-tune)',
    chipBg: 'var(--tune-dim)',
    chipFg: 'var(--tune)',
    dotColor: 'var(--tune)',
  },
  {
    id: 'rec',
    label: 'Vermelho alerta',
    shape: 'triangle',
    inkVar: 'var(--note-ink-rec)',
    hiVar: 'var(--note-hi-rec)',
    chipBg: 'var(--rec-dim)',
    chipFg: 'var(--on-rec-container)',
    dotColor: 'var(--note-ink-rec)',
  },
];

export const NOTE_TONE_MAP: Record<NoteTone, NoteToneStyle> = {
  amber: NOTE_TONES[0],
  primary: NOTE_TONES[1],
  tune: NOTE_TONES[2],
  rec: NOTE_TONES[3],
};

/** 1-tap musical stage cues inside the text note composer (zero onscreen keyboard needed on iPad). */
export const QUICK_NOTE_CUES = [
  '2x',
  'Só violão',
  'Entra bateria',
  'Parada',
  'Cresce',
  'Baixa',
];

const VALID_TONES = new Set<NoteTone>(['amber', 'primary', 'tune', 'rec']);
const VALID_TOOLS = new Set<StrokeTool>(['pen', 'highlighter']);

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Filters raw pointer points by minimum pixel distance so handwriting feels smooth
 * and stored payloads stay compact.
 */
export function simplifyRawPoints(
  pts: Array<{ x: number; y: number; pressure: number }>,
  minDistPx = 2.4
): Array<{ x: number; y: number; pressure: number }> {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  const minDistSq = minDistPx * minDistPx;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (dx * dx + dy * dy >= minDistSq) {
      out.push(cur);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Converts a sequence of `[x, y, pressure]` points into a smooth SVG quadratic
 * Bezier path using midpoint interpolation. Handles single-tap dots cleanly.
 */
export function buildSmoothSvgPath(points: [number, number, number][]): string {
  if (points.length === 0) return '';
  const [x0, y0] = points[0];
  if (points.length === 1) {
    return `M ${x0} ${y0} L ${round3(x0 + 0.01)} ${round3(y0 + 0.01)}`;
  }
  if (points.length === 2) {
    const [x1, y1] = points[1];
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }

  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const mx = round3((cx + nx) / 2);
    const my = round3((cy + ny) / 2);
    d += ` Q ${cx} ${cy} ${mx} ${my}`;
  }
  const [lx, ly] = points[points.length - 1];
  d += ` L ${lx} ${ly}`;
  return d;
}

/**
 * Computes average stroke width multiplier from recorded Apple Pencil pressure
 * (kept subtle and harmonious between 0.82x and 1.38x).
 */
export function computeStrokeWidthEm(tool: StrokeTool, points: [number, number, number][]): number {
  const base = tool === 'highlighter' ? 0.9 : 0.155;
  if (points.length === 0) return base;
  let sum = 0;
  let count = 0;
  for (const pt of points) {
    if (Number.isFinite(pt[2]) && pt[2] > 0) {
      sum += pt[2];
      count++;
    }
  }
  if (count === 0) return base;
  const avgP = sum / count;
  const mult = Math.max(0.82, Math.min(1.38, 0.72 + avgP * 0.56));
  return round3(base * mult);
}

function sanitizeAnchor(raw: unknown): AnnotationAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'section') {
    const sectionIdx = Number(obj.sectionIdx);
    const origLineIdx = Number(obj.origLineIdx);
    if (!Number.isInteger(sectionIdx) || sectionIdx < 0 || sectionIdx > 500) return null;
    if (!Number.isInteger(origLineIdx) || origLineIdx < -1 || origLineIdx > 2000) return null;
    return { kind: 'section', sectionIdx, origLineIdx };
  }
  if (obj.kind === 'page') {
    const pageIdx = Number(obj.pageIdx);
    if (!Number.isInteger(pageIdx) || pageIdx < 0 || pageIdx > 200) return null;
    return { kind: 'page', pageIdx };
  }
  return null;
}

/**
 * Validates and bounds an incoming annotations payload for safe Firestore and localStorage persistence.
 */
export function sanitizeSongAnnotations(songId: string, raw: unknown): SongAnnotations {
  const empty: SongAnnotations = { songId, strokes: [], notes: [], updatedAt: 0 };
  if (!raw || typeof raw !== 'object') return empty;
  const data = raw as Record<string, unknown>;

  const rawStrokes = Array.isArray(data.strokes) ? data.strokes.slice(0, 400) : [];
  const strokes: InkStroke[] = [];
  for (const s of rawStrokes) {
    if (!s || typeof s !== 'object') continue;
    const obj = s as Record<string, unknown>;
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 80) : null;
    const tool = VALID_TOOLS.has(obj.tool as StrokeTool) ? (obj.tool as StrokeTool) : null;
    const tone = VALID_TONES.has(obj.tone as NoteTone) ? (obj.tone as NoteTone) : 'amber';
    const anchor = sanitizeAnchor(obj.anchor);
    const originX = Number(obj.originX);
    const originY = Number(obj.originY);
    if (!id || !tool || !anchor || !Number.isFinite(originX) || !Number.isFinite(originY)) {
      continue;
    }
    const rawPts = Array.isArray(obj.points) ? obj.points.slice(0, 600) : [];
    const points: [number, number, number][] = [];
    for (const pt of rawPts) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const dx = Number(pt[0]);
      const dy = Number(pt[1]);
      const p = pt.length >= 3 && Number.isFinite(Number(pt[2])) ? Number(pt[2]) : 0.5;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      points.push([round3(dx), round3(dy), round3(Math.max(0.05, Math.min(1, p)))]);
    }
    if (points.length === 0) continue;
    strokes.push({
      id,
      tool,
      tone,
      anchor,
      originX: round3(originX),
      originY: round3(originY),
      points,
      createdAt: Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : Date.now(),
    });
  }

  const rawNotes = Array.isArray(data.notes) ? data.notes.slice(0, 120) : [];
  const notes: TextNote[] = [];
  for (const n of rawNotes) {
    if (!n || typeof n !== 'object') continue;
    const obj = n as Record<string, unknown>;
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 80) : null;
    const text = typeof obj.text === 'string' ? obj.text.trim().slice(0, 200) : '';
    const tone = VALID_TONES.has(obj.tone as NoteTone) ? (obj.tone as NoteTone) : 'amber';
    const anchor = sanitizeAnchor(obj.anchor);
    const x = Number(obj.x);
    const y = Number(obj.y);
    if (!id || !text || !anchor || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const align: 'left' | 'right' | undefined =
      obj.align === 'right' ? 'right' : obj.align === 'left' ? 'left' : undefined;
    notes.push({
      id,
      text,
      tone,
      anchor,
      x: round3(x),
      y: round3(y),
      ...(align ? { align } : {}),
      createdAt: Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : Date.now(),
    });
  }

  const rawUpdatedAt = Number(data.updatedAt);
  const updatedAt = Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0 ? rawUpdatedAt : 0;
  return { songId, strokes, notes, updatedAt };
}
