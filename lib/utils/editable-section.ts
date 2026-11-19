import { parseLine, transposeChord } from './music';

export const CHORD_WIDGET_CLASS =
  'inline-block rounded-lg px-1.5 py-0.5 text-[0.85em] font-bold text-[var(--accent-ink)] font-mono relative -top-[1.35em] select-none';

export const LINE_CLASS = 'whitespace-pre-wrap leading-relaxed pt-[1.4em] min-h-[2.8em]';

/** Rebuilds a contentEditable section root from scratch. Only call this when
 * the editor is not the source of the change (see lastSerializedRef guard in
 * SectionEditor) — React/manual DOM writes must never race the user's own
 * in-progress edit or IME composition. */
export function linesToDom(
  root: HTMLElement,
  lines: string[],
  transpose: number,
  capo: number,
  useFlats: boolean
): void {
  root.textContent = '';
  const effectiveLines = lines.length ? lines : [''];

  for (const line of effectiveLines) {
    const lineEl = document.createElement('div');
    lineEl.dataset.line = '';
    lineEl.className = LINE_CLASS;

    if (line === '') {
      lineEl.appendChild(document.createElement('br'));
      root.appendChild(lineEl);
      continue;
    }

    for (const seg of parseLine(line)) {
      if (seg.chord) {
        const widget = document.createElement('span');
        widget.contentEditable = 'false';
        widget.dataset.chord = seg.chord;
        widget.className = CHORD_WIDGET_CLASS;
        widget.textContent = transposeChord(seg.chord, transpose + capo, useFlats);
        // Group the chord with its lyric so a line-wrap on narrow viewports
        // can never split a chord from the syllable it sits above.
        const group = document.createElement('span');
        group.className = 'inline-block whitespace-nowrap';
        group.appendChild(widget);
        if (seg.text) group.appendChild(document.createTextNode(seg.text));
        lineEl.appendChild(group);
      } else if (seg.text) {
        lineEl.appendChild(document.createTextNode(seg.text));
      }
    }
    root.appendChild(lineEl);
  }
}

function isChordWidget(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.chord !== undefined;
}

/** Serializes a single line node's children back to a raw ChordPro string. */
function serializeLine(lineEl: Element): string {
  let text = '';
  lineEl.childNodes.forEach((node) => {
    text += serializeNode(node);
  });
  return text;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.tagName === 'BR') return '';
  if (isChordWidget(el)) return `[${el.dataset.chord}]`;
  let out = '';
  el.childNodes.forEach((child) => {
    out += serializeNode(child);
  });
  return out;
}

export function domToLines(root: HTMLElement): string[] {
  return Array.from(root.children)
    .filter((el) => el.hasAttribute('data-line'))
    .map(serializeLine);
}

/** Lyric-only text length, matching insertChord's charPos semantics. */
function textLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  const el = node as HTMLElement;
  if (el.tagName === 'BR' || isChordWidget(el)) return 0;
  let total = 0;
  el.childNodes.forEach((child) => {
    total += textLength(child);
  });
  return total;
}

function findCaretOffset(
  node: Node,
  container: Node,
  offset: number
): { chars: number; found: boolean } {
  if (node === container) {
    if (node.nodeType === Node.TEXT_NODE) return { chars: offset, found: true };
    let chars = 0;
    Array.from(node.childNodes)
      .slice(0, offset)
      .forEach((c) => {
        chars += textLength(c);
      });
    return { chars, found: true };
  }
  if (isChordWidget(node)) return { chars: 0, found: false };

  let chars = 0;
  for (const child of Array.from(node.childNodes)) {
    const res = findCaretOffset(child, container, offset);
    chars += res.chars;
    if (res.found) return { chars, found: true };
  }
  return { chars, found: false };
}

/** Maps the current DOM selection to { lineIdx, charPos } within a section. */
export function selectionToLinePos(
  root: HTMLElement,
  selection: Selection | null
): { lineIdx: number; charPos: number } | null {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const container = range.startContainer;

  let lineEl: Node | null = container;
  while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
  if (!lineEl || lineEl.nodeType !== Node.ELEMENT_NODE) return null;

  const lineIdx = Array.from(root.children).indexOf(lineEl as Element);
  if (lineIdx === -1) return null;

  const result = findCaretOffset(lineEl, container, range.startOffset);
  const charPos = result.found ? result.chars : textLength(lineEl);
  return { lineIdx, charPos };
}
