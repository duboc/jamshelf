'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { extractLyricText, isValidChordToken, lineHasLyrics } from '@/lib/utils/music';
import {
  LINE_CLASS,
  domToLines,
  linesToDom,
  selectionToLinePos,
} from '@/lib/utils/editable-section';
import { PlusIcon } from '@/components/ui/Icons';

interface SectionEditorProps {
  sectionIdx: number;
  sectionLabel: string;
  lines: string[];
  selected: { lineIdx: number; segIdx: number } | null;
  onChordSelect: (lineIdx: number, segIdx: number) => void;
  onAddChord: (lineIdx: number, charPos: number) => void;
  onLinesChange: (lines: string[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDismissOverlay?: () => void;
  domSyncKey?: number;
}

const FLUSH_DEBOUNCE_MS = 500;
const SELECTED_CLASSES = [
  'ring-2',
  'ring-[var(--accent)]',
  'ring-offset-2',
  'ring-offset-[var(--surface)]',
  'scale-105',
  '!bg-[var(--accent)]',
  '!text-[var(--on-accent)]',
];

function isChordEl(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.chord !== undefined;
}

/** Address of a chord widget within its line, matching parseLine's segment
 * indexing: chord widgets before it, plus one if the line has leading text. */
function addressOf(lineEl: Element, widget: Element): number {
  let chordsBefore = 0;
  let hasLeadingText = false;
  let sawFirstChord = false;
  let done = false;

  const walk = (node: Node) => {
    if (done) return;
    if (node === widget) {
      done = true;
      return;
    }
    if (isChordEl(node)) {
      chordsBefore++;
      sawFirstChord = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (!sawFirstChord && (node.textContent?.length ?? 0) > 0) hasLeadingText = true;
      return;
    }
    node.childNodes.forEach(walk);
  };
  lineEl.childNodes.forEach(walk);

  return chordsBefore + (hasLeadingText ? 1 : 0);
}

function widgetAt(lineEl: Element, segIdx: number): HTMLElement | null {
  for (const widget of Array.from(lineEl.querySelectorAll('[data-chord]'))) {
    if (addressOf(lineEl, widget) === segIdx) return widget as HTMLElement;
  }
  return null;
}

/** Checks if any plain text node inside `root` contains an unrendered `[Chord]` token. */
function hasRawBracketText(root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('[data-chord]')) continue;
    const matches = (node.textContent || '').matchAll(/\[([^\]]+)\]/g);
    for (const m of matches) {
      if (isValidChordToken(m[1])) return true;
    }
  }
  return false;
}

/** Places the collapsed caret cleanly right after the `chordOrdinal`-th `[data-chord]` chip on `lineIdx`.
 * Uses a zero-width space anchor (`\u200B`, stripped by `domToLines`) when no text node follows the
 * chip so Chromium never snaps subsequent typing before an `inline-block` chord group. */
function placeCaretAfterChordOrdinal(root: HTMLElement, lineIdx: number, chordOrdinal: number) {
  const lineEl = root.children[lineIdx] as HTMLElement | undefined;
  if (!lineEl) return;
  const widgets = Array.from(lineEl.querySelectorAll<HTMLElement>('[data-chord]'));
  const widget = widgets[chordOrdinal];
  if (!widget) return;

  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();

  const parent = widget.parentElement;
  if (parent && parent !== lineEl) {
    // Stacked chord group: place caret inside following text node or create a zero-width anchor inside the group
    const nextSibling = widget.nextSibling;
    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
      range.setStart(nextSibling, 0);
    } else {
      const anchor = document.createTextNode('\u200B');
      parent.appendChild(anchor);
      range.setStart(anchor, 1);
    }
  } else {
    // Chord-only inline chip: ensure a text node exists right after the chip inside lineEl
    const nextSibling = widget.nextSibling;
    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
      range.setStart(nextSibling, 0);
    } else {
      const anchor = document.createTextNode('\u200B');
      lineEl.insertBefore(anchor, widget.nextSibling);
      range.setStart(anchor, 1);
    }
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * If the user just typed `]` closing a valid chord token like `[Am7]` or `[D/F#]`,
 * returns the target `{ lineIdx, chordOrdinal }` so we can auto-convert it into a live chip.
 */
function detectJustTypedChordToken(
  root: HTMLElement
): { lineIdx: number; chordOrdinal: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const tn = range.startContainer as Text;
  if (tn.parentElement?.closest('[data-chord]')) return null;
  const before = (tn.textContent || '').slice(0, range.startOffset);
  const m = before.match(/\[([^\]]+)\]$/);
  if (!m || !isValidChordToken(m[1])) return null;

  let lineEl: Node | null = tn;
  while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
  if (!lineEl || lineEl.nodeType !== Node.ELEMENT_NODE) return null;
  const lineIdx = Array.from(root.children).indexOf(lineEl as Element);
  if (lineIdx === -1) return null;

  // Count how many existing chord widgets (and earlier bracket tokens) precede this one on the line
  let chordOrdinal = 0;
  let reached = false;
  const walk = (node: Node) => {
    if (reached) return;
    if (node === tn) {
      const earlier = before.slice(0, before.length - m[0].length);
      const earlierMatches = earlier.matchAll(/\[([^\]]+)\]/g);
      for (const em of earlierMatches) {
        if (isValidChordToken(em[1])) chordOrdinal++;
      }
      reached = true;
      return;
    }
    if (isChordEl(node)) {
      chordOrdinal++;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const matches = (node.textContent || '').matchAll(/\[([^\]]+)\]/g);
      for (const em of matches) {
        if (isValidChordToken(em[1])) chordOrdinal++;
      }
      return;
    }
    node.childNodes.forEach(walk);
  };
  lineEl.childNodes.forEach(walk);
  return { lineIdx, chordOrdinal };
}

/** Resolves the direct `[data-line]` child of `root` containing `node`, wrapping bare nodes if needed. */
function ensureLineElementForCaret(root: HTMLElement, node: Node): HTMLElement | null {
  if (node === root) {
    let firstLine = root.querySelector<HTMLElement>('[data-line]');
    if (!firstLine) {
      firstLine = document.createElement('div');
      firstLine.dataset.line = '';
      firstLine.className = LINE_CLASS;
      while (root.firstChild) firstLine.appendChild(root.firstChild);
      if (firstLine.childNodes.length === 0) firstLine.appendChild(document.createElement('br'));
      root.appendChild(firstLine);
    }
    return firstLine;
  }
  let lineEl: Node | null = node;
  while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
  if (!lineEl) return null;
  if (lineEl.nodeType !== Node.ELEMENT_NODE) {
    const wrapper = document.createElement('div');
    wrapper.dataset.line = '';
    wrapper.className = LINE_CLASS;
    root.insertBefore(wrapper, lineEl);
    wrapper.appendChild(lineEl);
    return wrapper;
  }
  const el = lineEl as HTMLElement;
  if (!el.hasAttribute('data-line')) {
    el.dataset.line = '';
    el.className = LINE_CLASS;
  }
  return el;
}

/** Splits the current line at the caret and inserts plain text, safely handling
 * single-line paste, multi-line paste, Enter, and cross-line selections without
 * ever calling `normalize()` before positioning the caret. */
function insertPlainTextAtCaret(root: HTMLElement, rawText: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const text = rawText.replace(/\r\n?/g, '\n');

  const startLine = ensureLineElementForCaret(root, range.startContainer);
  const endLine = ensureLineElementForCaret(root, range.endContainer);
  if (!startLine) return;

  // Handle cross-line selections cleanly so range never collapses onto `root`
  if (endLine && endLine !== startLine) {
    const endTailRange = document.createRange();
    endTailRange.selectNodeContents(endLine);
    endTailRange.setStart(range.endContainer, range.endOffset);
    const endTail = endTailRange.extractContents();

    const startTailRange = document.createRange();
    startTailRange.selectNodeContents(startLine);
    startTailRange.setStart(range.startContainer, range.startOffset);
    startTailRange.deleteContents();

    // Remove every line strictly after startLine up through endLine
    let cursorNode: ChildNode | null = startLine.nextSibling;
    while (cursorNode) {
      const next: ChildNode | null = cursorNode.nextSibling;
      cursorNode.remove();
      if (cursorNode === endLine) break;
      cursorNode = next;
    }

    const insertPos = startLine.childNodes.length;
    if (endTail.childNodes.length > 0) {
      startLine.appendChild(endTail);
    }
    range.setStart(startLine, insertPos);
    range.collapse(true);
  } else {
    range.deleteContents();
  }

  const line = startLine;
  const soleBr = line.childNodes.length === 1 && line.firstChild?.nodeName === 'BR' ? line.firstChild : null;
  if (soleBr) {
    line.removeChild(soleBr);
    range.setStart(line, 0);
    range.collapse(true);
  }

  const pasteLines = text.split('\n');
  if (pasteLines.length === 1) {
    const chunk = pasteLines[0];
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const existing = range.startContainer as Text;
      const offset = range.startOffset;
      existing.insertData(offset, chunk);
      const newRange = document.createRange();
      newRange.setStart(existing, offset + chunk.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      const textNode = document.createTextNode(chunk);
      range.insertNode(textNode);
      const newRange = document.createRange();
      newRange.setStart(textNode, chunk.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    if (line.childNodes.length === 0) line.appendChild(document.createElement('br'));
    return;
  }

  const tailRange = document.createRange();
  tailRange.selectNodeContents(line);
  tailRange.setStart(range.startContainer, range.startOffset);
  const tailFragment = tailRange.extractContents();

  if (pasteLines[0]) {
    line.appendChild(document.createTextNode(pasteLines[0]));
  }
  if (line.childNodes.length === 0) line.appendChild(document.createElement('br'));

  let afterEl: Element = line;
  let lastNewLine: HTMLElement | null = null;
  let lastLeadText: Text | null = null;
  for (let i = 1; i < pasteLines.length; i++) {
    const newLine = document.createElement('div');
    newLine.dataset.line = '';
    newLine.className = LINE_CLASS;
    if (pasteLines[i]) {
      const tn = document.createTextNode(pasteLines[i]);
      newLine.appendChild(tn);
      lastLeadText = tn;
    } else {
      lastLeadText = null;
    }
    afterEl.parentNode!.insertBefore(newLine, afterEl.nextSibling);
    afterEl = newLine;
    lastNewLine = newLine;
  }
  if (lastNewLine) {
    if (tailFragment.childNodes.length > 0) lastNewLine.appendChild(tailFragment);
    if (lastNewLine.childNodes.length === 0) lastNewLine.appendChild(document.createElement('br'));

    const newRange = document.createRange();
    if (lastLeadText && lastLeadText.isConnected) {
      newRange.setStart(lastLeadText, lastLeadText.length);
    } else {
      newRange.setStart(lastNewLine, 0);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

/** Resolves a reliable visual anchor rect for the caret, including empty lines and chord-only lines. */
function resolveCaretRect(root: HTMLElement, range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (rects.length > 0 && (rects[0].width > 0 || rects[0].height > 0)) {
    return rects[0];
  }
  const bounding = range.getBoundingClientRect();
  if (bounding.width > 0 || bounding.height > 0) {
    return bounding;
  }

  const container = range.startContainer;
  if (container.nodeType === Node.ELEMENT_NODE) {
    const el = container as HTMLElement;
    if (range.startOffset > 0 && el.childNodes[range.startOffset - 1]) {
      const prev = el.childNodes[range.startOffset - 1];
      if (prev.nodeType === Node.ELEMENT_NODE) {
        const pr = (prev as HTMLElement).getBoundingClientRect();
        if (pr.height > 0) return new DOMRect(pr.right + 4, pr.top, 0, pr.height);
      }
    }
    const er = el.getBoundingClientRect();
    if (er.height > 0) {
      return new DOMRect(er.left + 12, er.top + Math.min(er.height * 0.5, 22), 0, 20);
    }
  }

  const firstLine = root.querySelector<HTMLElement>('[data-line]');
  if (firstLine) {
    const fr = firstLine.getBoundingClientRect();
    if (fr.height > 0) return new DOMRect(fr.left + 12, fr.top + 18, 0, 20);
  }
  return null;
}

export function SectionEditor({
  sectionIdx,
  sectionLabel,
  lines,
  selected,
  onChordSelect,
  onAddChord,
  onLinesChange,
  onUndo,
  onRedo,
  onDismissOverlay,
  domSyncKey = 0,
}: SectionEditorProps) {
  const { useFlats } = usePlayerStore();
  // Always edit in the song's original key (0 shift) so widgets match EditChordOverlay and saved ChordPro.
  const transpose = 0;
  const capo = 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [caretMarker, setCaretMarker] = useState<{ top: number; left: number } | null>(null);
  const [isEmptySection, setIsEmptySection] = useState(
    lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')
  );
  const lastCaretPosRef = useRef<{ lineIdx: number; charPos: number } | null>(null);
  const lastSerializedRef = useRef<string[]>(lines);
  const lastSyncKeyRef = useRef<number>(domSyncKey);
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLinesChangeRef = useRef(onLinesChange);
  useEffect(() => {
    onLinesChangeRef.current = onLinesChange;
  });

  const flush = (forceConvertBrackets = false) => {
    const root = rootRef.current;
    if (!root) return;
    const next = domToLines(root);
    setIsEmptySection(next.length === 0 || (next.length === 1 && next[0].trim() === ''));
    if (forceConvertBrackets && hasRawBracketText(root)) {
      linesToDom(root, next, transpose, capo, useFlats);
    }
    if (
      lastSerializedRef.current.length === next.length &&
      lastSerializedRef.current.every((l, i) => l === next[i])
    ) {
      return;
    }
    lastSerializedRef.current = next;
    onLinesChangeRef.current(next);
  };

  const scheduleFlush = (immediate: boolean, convertBrackets = false) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (immediate) flush(convertBrackets);
    else debounceRef.current = setTimeout(() => flush(false), FLUSH_DEBOUNCE_MS);
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composingRef.current) return;
    setIsEmptySection(lines.length === 0 || (lines.length === 1 && lines[0].trim() === ''));
    const forceSync = lastSyncKeyRef.current !== domSyncKey;
    lastSyncKeyRef.current = domSyncKey;
    const isOwnEdit =
      !forceSync &&
      root.children.length > 0 &&
      lastSerializedRef.current.length === lines.length &&
      lastSerializedRef.current.every((l, i) => l === lines[i]);
    if (isOwnEdit) return;
    linesToDom(root, lines, transpose, capo, useFlats);
    lastSerializedRef.current = lines;
  }, [lines, transpose, capo, useFlats, domSyncKey]);

  // Highlight selected chord widget and smoothly scroll it above the bottom EditChordOverlay when needed
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('[data-chord]').forEach((el) => el.classList.remove(...SELECTED_CLASSES));
    if (!selected) return;
    const lineEl = root.children[selected.lineIdx];
    if (!lineEl) return;
    const widget = widgetAt(lineEl, selected.segIdx);
    if (widget) {
      widget.classList.add(...SELECTED_CLASSES);
      const wr = widget.getBoundingClientRect();
      if (typeof window !== 'undefined' && wr.bottom > window.innerHeight - 310) {
        widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selected, lines]);

  // Only cancel pending timer on unmount — NEVER flush stale DOM on Cancel, Undo, or Section Delete!
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const syncCaretMarker = () => {
    const root = rootRef.current;
    const container = containerRef.current;
    if (!root || !container || document.activeElement !== root) {
      setCaretMarker(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !root.contains(sel.anchorNode)) {
      setCaretMarker(null);
      return;
    }
    const pos = selectionToLinePos(root, sel);
    if (pos) lastCaretPosRef.current = pos;

    const range = sel.getRangeAt(0);
    const rect = resolveCaretRect(root, range);
    if (!rect) {
      setCaretMarker(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const rawLeft = rect.left - containerRect.left;
    const rawTop = rect.top - containerRect.top - Math.max(14, rect.height * 0.7);
    const clampedLeft = Math.max(22, Math.min(Math.max(22, containerRect.width - 22), rawLeft));
    const clampedTop = Math.max(18, rawTop);
    setCaretMarker({ top: clampedTop, left: clampedLeft });
  };

  useEffect(() => {
    document.addEventListener('selectionchange', syncCaretMarker);
    return () => document.removeEventListener('selectionchange', syncCaretMarker);
  }, []);

  const handleInput = () => {
    const root = rootRef.current;
    if (root) {
      if (!composingRef.current) {
        const justTyped = detectJustTypedChordToken(root);
        if (justTyped) {
          const next = domToLines(root);
          setIsEmptySection(next.length === 0 || (next.length === 1 && next[0].trim() === ''));
          linesToDom(root, next, transpose, capo, useFlats);
          placeCaretAfterChordOrdinal(root, justTyped.lineIdx, justTyped.chordOrdinal);
          lastSerializedRef.current = next;
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          onLinesChangeRef.current(next);
          requestAnimationFrame(syncCaretMarker);
          return;
        }
      }
      const cur = domToLines(root);
      setIsEmptySection(cur.length === 0 || (cur.length === 1 && cur[0].trim() === ''));
    }
    scheduleFlush(false);
    requestAnimationFrame(syncCaretMarker);
  };
  const handleFocus = () => {
    requestAnimationFrame(syncCaretMarker);
  };
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Keep "+" trigger alive if keyboard focus moved directly onto it
    if (addBtnRef.current && e.relatedTarget === addBtnRef.current) {
      scheduleFlush(true, true);
      return;
    }
    setCaretMarker(null);
    scheduleFlush(true, true);
  };
  const handleCompositionStart = () => {
    composingRef.current = true;
  };
  const handleCompositionEnd = () => {
    composingRef.current = false;
    scheduleFlush(false);
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') return;
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    insertPlainTextAtCaret(root, '\n');
    scheduleFlush(false);
    requestAnimationFrame(syncCaretMarker);
  };

  const openChordWidget = (widget: Element) => {
    const root = rootRef.current;
    if (!root) return;
    let lineEl: Node | null = widget;
    while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
    if (!lineEl || lineEl.nodeType !== Node.ELEMENT_NODE) return;
    const lineIdx = Array.from(root.children).indexOf(lineEl as Element);
    if (lineIdx === -1) return;
    const segIdx = addressOf(lineEl as Element, widget);
    scheduleFlush(true, true);
    onChordSelect(lineIdx, segIdx);
  };

  const handleAddChordClick = () => {
    const root = rootRef.current;
    if (!root) return;
    const pos = selectionToLinePos(root, window.getSelection()) ?? lastCaretPosRef.current ?? { lineIdx: 0, charPos: 0 };
    setCaretMarker(null);
    scheduleFlush(true, true);
    onAddChord(pos.lineIdx, pos.charPos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Unified Ctrl/Cmd+Z & Ctrl/Cmd+Y inside contentEditable so Undo never breaks after Enter/Paste/chord edits
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey && onUndo) {
        e.preventDefault();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        onUndo();
        return;
      }
      if ((k === 'y' || (k === 'z' && e.shiftKey)) && onRedo) {
        e.preventDefault();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        onRedo();
        return;
      }
    }

    // Keyboard shortcut Alt+A to insert a chord at the caret (WCAG 2.1.1)
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleAddChordClick();
      return;
    }

    const target = e.target as HTMLElement | null;
    const widget = target?.closest?.('[data-chord]');
    if (widget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openChordWidget(widget);
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    insertPlainTextAtCaret(root, '\n');
    scheduleFlush(false);
    requestAnimationFrame(syncCaretMarker);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const root = rootRef.current;
    if (!root) return;
    insertPlainTextAtCaret(root, text);
    const hasBrackets = /\[[^\]]+\]/.test(text);
    scheduleFlush(hasBrackets, hasBrackets);
    requestAnimationFrame(syncCaretMarker);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const widget = target.closest('[data-chord]');
    if (widget) {
      openChordWidget(widget);
      return;
    }
    onDismissOverlay?.();
    requestAnimationFrame(syncCaretMarker);
  };

  const isChordOnlySection = !isEmptySection && lines.every((l) => !lineHasLyrics(l));

  return (
    <div ref={containerRef} className="relative">
      {isEmptySection && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAddChord(0, 0)}
            className="pill-btn pill-btn-tonal px-3 h-9 text-xs font-mono font-semibold"
          >
            <PlusIcon size={13} />
            Acorde
          </button>
          <button
            type="button"
            onClick={() => rootRef.current?.focus()}
            className="text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-text"
          >
            ou digite a letra (use [Am7] para criar acorde direto)…
          </button>
        </div>
      )}
      {caretMarker && (
        <button
          ref={addBtnRef}
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAddChordClick}
          style={{
            transform: `translate3d(${caretMarker.left}px, ${caretMarker.top}px, 0) translate(-50%, -50%)`,
          }}
          className="gm3-panel-enter gm3-caret-add-btn absolute top-0 left-0 z-20 w-10 h-10 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-[var(--on-accent)] text-base font-bold flex items-center justify-center shadow-lg cursor-pointer"
          title="Adicionar acorde aqui (Alt+A)"
          aria-label="Adicionar acorde na posição do cursor"
        >
          +
        </button>
      )}
      <div
        ref={rootRef}
        data-section-editor-idx={sectionIdx}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={`Letra e acordes de ${sectionLabel}`}
        className="rounded-xl p-1 -m-1 focus:ring-2 focus:ring-[var(--accent)]/40 min-w-0 max-w-full overflow-x-hidden"
        onFocus={handleFocus}
        onInput={handleInput}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
      />
      {isChordOnlySection && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => {
              scheduleFlush(true, true);
              const lastIdx = Math.max(0, lines.length - 1);
              const endPos = extractLyricText(lines[lastIdx] || '').length;
              onAddChord(lastIdx, endPos);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--line-subtle)] px-3 h-8 text-xs font-mono font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] hover:bg-[var(--primary-container)]/40 cursor-pointer transition-colors"
            title="Adicionar acorde ao final desta seção instrumental"
          >
            <PlusIcon size={12} />
            Acorde
          </button>
        </div>
      )}
    </div>
  );
}
