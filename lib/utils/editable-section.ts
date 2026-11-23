import { lineHasLyrics, parseLine, transposeChord } from './music';

const CHORD_CHIP_BASE =
  'rounded-lg px-2 py-0.5 text-[0.82em] font-bold leading-snug bg-[var(--primary-container)] text-[var(--on-primary-container)] font-mono select-none cursor-pointer hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors';

/** Stacked chord chip sitting directly above its first syllable/word (zero horizontal lyric gap!). */
export const CHORD_STACKED_WIDGET_CLASS = `block w-fit mb-0.5 ${CHORD_CHIP_BASE}`;

/** Compact horizontal chord chip for chord-only / instrumental lines. */
export const CHORD_INLINE_WIDGET_CLASS = `inline-block min-w-[30px] text-center mr-1.5 my-0.5 ${CHORD_CHIP_BASE}`;

export const LINE_CLASS = 'whitespace-pre-wrap break-words leading-relaxed py-1 min-h-[2.35em]';

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

    const hasLyrics = lineHasLyrics(line);

    for (const seg of parseLine(line)) {
      if (seg.chord) {
        const displayed = transposeChord(seg.chord, transpose + capo, useFlats);
        const widget = document.createElement('span');
        widget.contentEditable = 'false';
        widget.tabIndex = 0;
        widget.setAttribute('role', 'button');
        widget.setAttribute('aria-label', `Editar acorde ${displayed}`);
        widget.dataset.chord = seg.chord;
        widget.textContent = displayed;

        if (!hasLyrics) {
          // Compact inline chord-only row (e.g. Intro: [Dmaj7] [Bsus2] [Gsus2] [Bsus2])
          widget.className = CHORD_INLINE_WIDGET_CLASS;
          lineEl.appendChild(widget);
          if (seg.text) {
            lineEl.appendChild(document.createTextNode(seg.text));
          }
          continue;
        }

        // Lyric line: stack the chord directly above its first word via CSS baseline alignment
        // so words stay unbroken and left margins align cleanly (matching Reading Mode!).
        const group = document.createElement('span');
        group.className = 'inline-block align-baseline whitespace-nowrap';

        if (seg.text) {
          widget.className = CHORD_STACKED_WIDGET_CLASS;
          group.appendChild(widget);
          const wordMatch = seg.text.match(/^(\s*\S+)(.*)$/);
          if (wordMatch && wordMatch[2]) {
            group.appendChild(document.createTextNode(wordMatch[1]));
            lineEl.appendChild(group);
            lineEl.appendChild(document.createTextNode(wordMatch[2]));
          } else {
            group.appendChild(document.createTextNode(seg.text));
            lineEl.appendChild(group);
          }
        } else {
          // Trailing or adjacent chord without lyric text stays elevated on the chord row
          widget.className = `${CHORD_STACKED_WIDGET_CLASS} mr-1.5 mb-[1.35em]`;
          group.appendChild(widget);
          lineEl.appendChild(group);
        }
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
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200B/g, '');
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

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'PRE', 'BLOCKQUOTE']);

/**
 * Serializes all lines in a contentEditable section root back to ChordPro lines.
 * Safely handles browser-generated bare `<div>`, `<p>`, `<br>`, or direct text nodes
 * (e.g. after Ctrl+A -> Backspace -> type) so user typing is never silently dropped.
 */
export function domToLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  let inlineBuf = '';
  let hasInlineBuf = false;

  const flushInline = () => {
    if (hasInlineBuf) {
      lines.push(inlineBuf);
      inlineBuf = '';
      hasInlineBuf = false;
    }
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.hasAttribute('data-line') || BLOCK_TAGS.has(el.tagName)) {
        flushInline();
        lines.push(serializeLine(el));
        continue;
      }
      if (el.tagName === 'BR') {
        lines.push(inlineBuf);
        inlineBuf = '';
        hasInlineBuf = false;
        continue;
      }
    }
    inlineBuf += serializeNode(child);
    hasInlineBuf = true;
  }

  flushInline();
  return lines.length > 0 ? lines : [''];
}

/** Lyric-only text length, matching insertChord's charPos semantics (ignoring zero-width caret anchors). */
function textLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200B/g, '').length;
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
    if (node.nodeType === Node.TEXT_NODE) {
      const before = (node.textContent ?? '').slice(0, offset).replace(/\u200B/g, '');
      return { chars: before.length, found: true };
    }
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

  if (container === root) {
    const lineCount = Math.max(1, root.children.length);
    const idx = Math.min(range.startOffset, lineCount - 1);
    const targetLine = root.children[idx];
    return { lineIdx: idx, charPos: targetLine ? textLength(targetLine) : 0 };
  }

  let lineEl: Node | null = container;
  while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
  if (!lineEl) return null;

  if (lineEl.nodeType !== Node.ELEMENT_NODE) {
    const offset = container === lineEl ? range.startOffset : 0;
    return { lineIdx: 0, charPos: offset };
  }

  const lineIdx = Array.from(root.children).indexOf(lineEl as Element);
  if (lineIdx === -1) return null;

  const result = findCaretOffset(lineEl, container, range.startOffset);
  const charPos = result.found ? result.chars : textLength(lineEl);
  return { lineIdx, charPos };
}
