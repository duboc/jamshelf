'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import {
  LINE_CLASS,
  domToLines,
  linesToDom,
  selectionToLinePos,
} from '@/lib/utils/editable-section';

interface SectionEditorProps {
  lines: string[];
  selected: { lineIdx: number; segIdx: number } | null;
  onChordSelect: (lineIdx: number, segIdx: number) => void;
  onAddChord: (lineIdx: number, charPos: number) => void;
  onLinesChange: (lines: string[]) => void;
}

const FLUSH_DEBOUNCE_MS = 500;
const SELECTED_CLASSES = ['ring-2', 'ring-[var(--accent)]', 'scale-110', 'bg-[var(--accent-dim)]'];

function isChordEl(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.chord !== undefined;
}

/** Address of a chord widget within its line, matching parseLine's segment
 * indexing: chord widgets before it, plus one if the line has leading text.
 * Widgets may be nested inside a no-wrap grouping span (see linesToDom), so
 * this walks the whole subtree in document order rather than direct children. */
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

/** Splits the current line at the caret and inserts plain text, used for
 * both a real clipboard paste and (with text = '\n') an intercepted Enter —
 * both need the exact same "split around the caret" DOM surgery. */
function insertPlainTextAtCaret(root: HTMLElement, text: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  let lineEl: Node | null = range.startContainer;
  while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
  if (!lineEl || lineEl.nodeType !== Node.ELEMENT_NODE) return;
  const line = lineEl as HTMLElement;

  range.deleteContents();
  const soleBr = line.childNodes.length === 1 && line.firstChild?.nodeName === 'BR' ? line.firstChild : null;
  if (soleBr) line.removeChild(soleBr);

  const pasteLines = text.split('\n');
  if (pasteLines.length === 1) {
    const textNode = document.createTextNode(pasteLines[0]);
    range.insertNode(textNode);
    line.normalize();
    if (line.childNodes.length === 0) line.appendChild(document.createElement('br'));
    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return;
  }

  const tailRange = document.createRange();
  tailRange.selectNodeContents(line);
  tailRange.setStart(range.startContainer, range.startOffset);
  const tailFragment = tailRange.extractContents();

  line.appendChild(document.createTextNode(pasteLines[0]));
  line.normalize();
  if (line.childNodes.length === 0) line.appendChild(document.createElement('br'));

  let afterEl: Element = line;
  let lastNewLine: HTMLElement | null = null;
  for (let i = 1; i < pasteLines.length; i++) {
    const newLine = document.createElement('div');
    newLine.dataset.line = '';
    newLine.className = LINE_CLASS;
    newLine.appendChild(document.createTextNode(pasteLines[i]));
    afterEl.parentNode!.insertBefore(newLine, afterEl.nextSibling);
    afterEl = newLine;
    lastNewLine = newLine;
  }
  if (lastNewLine) {
    if (tailFragment.childNodes.length > 0) lastNewLine.appendChild(tailFragment);
    lastNewLine.normalize();
    if (lastNewLine.childNodes.length === 0) lastNewLine.appendChild(document.createElement('br'));

    const newRange = document.createRange();
    newRange.setStart(lastNewLine, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

export function SectionEditor({ lines, selected, onChordSelect, onAddChord, onLinesChange }: SectionEditorProps) {
  const { transpose, capo, useFlats } = usePlayerStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [caretMarker, setCaretMarker] = useState<{ top: number; left: number } | null>(null);
  const lastSerializedRef = useRef<string[]>(lines);
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLinesChangeRef = useRef(onLinesChange);
  useEffect(() => {
    onLinesChangeRef.current = onLinesChange;
  });

  const flush = () => {
    const root = rootRef.current;
    if (!root) return;
    const next = domToLines(root);
    lastSerializedRef.current = next;
    onLinesChangeRef.current(next);
  };

  const scheduleFlush = (immediate: boolean) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (immediate) flush();
    else debounceRef.current = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composingRef.current) return;
    const isOwnEdit =
      root.children.length > 0 &&
      lastSerializedRef.current.length === lines.length &&
      lastSerializedRef.current.every((l, i) => l === lines[i]);
    if (isOwnEdit) return;
    linesToDom(root, lines, transpose, capo, useFlats);
    lastSerializedRef.current = lines;
  }, [lines, transpose, capo, useFlats]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('[data-chord]').forEach((el) => el.classList.remove(...SELECTED_CLASSES));
    if (!selected) return;
    const lineEl = root.children[selected.lineIdx];
    if (!lineEl) return;
    const widget = widgetAt(lineEl, selected.segIdx);
    widget?.classList.add(...SELECTED_CLASSES);
  }, [selected, lines]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      flush();
    };
  }, []);

  // Track the caret so a small "+" can appear right where the user clicked,
  // instead of a static button elsewhere on the section.
  useEffect(() => {
    const updateCaretMarker = () => {
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
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && rects.length === 0) {
        setCaretMarker(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      setCaretMarker({
        top: rect.top - containerRect.top - rect.height * 0.9,
        left: rect.left - containerRect.left,
      });
    };
    document.addEventListener('selectionchange', updateCaretMarker);
    return () => document.removeEventListener('selectionchange', updateCaretMarker);
  }, []);

  const handleInput = () => scheduleFlush(false);
  const handleBlur = () => {
    setCaretMarker(null);
    scheduleFlush(true);
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Fallback for engines where Enter doesn't reliably route through
    // beforeinput — harmless on engines where it does, since a keydown
    // preventDefault() here suppresses that later beforeinput entirely.
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    insertPlainTextAtCaret(root, '\n');
    scheduleFlush(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const root = rootRef.current;
    if (!root) return;
    insertPlainTextAtCaret(root, text);
    scheduleFlush(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const widget = target.closest('[data-chord]');
    const root = rootRef.current;
    if (!widget || !root) return;
    let lineEl: Node | null = widget;
    while (lineEl && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
    if (!lineEl || lineEl.nodeType !== Node.ELEMENT_NODE) return;
    const lineIdx = Array.from(root.children).indexOf(lineEl as Element);
    if (lineIdx === -1) return;
    const segIdx = addressOf(lineEl as Element, widget);
    scheduleFlush(true); // keep app state fresh before the overlay reads it
    onChordSelect(lineIdx, segIdx);
  };

  const handleAddChordClick = () => {
    const root = rootRef.current;
    if (!root) return;
    const pos = selectionToLinePos(root, window.getSelection());
    if (!pos) return;
    setCaretMarker(null);
    scheduleFlush(true); // keep app state fresh before the overlay reads it
    onAddChord(pos.lineIdx, pos.charPos);
  };

  return (
    <div ref={containerRef} className="relative">
      {caretMarker && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAddChordClick}
          style={{ top: caretMarker.top, left: caretMarker.left }}
          className="absolute z-20 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-[var(--on-accent)] text-sm font-bold flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          title="Adicionar acorde aqui"
        >
          +
        </button>
      )}
      <div
        ref={rootRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="outline-none"
        onInput={handleInput}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
      />
    </div>
  );
}
