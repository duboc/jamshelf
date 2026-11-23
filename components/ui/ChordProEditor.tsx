'use client';

import { useRef } from 'react';
import { highlightChordPro } from '@/lib/utils/chordpro-highlight';

interface ChordProEditorProps {
  value: string;
  onChange: (value: string) => void;
  songChords?: string[];
  onScrollRatioChange?: (ratio: number) => void;
  className?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

const SHARED_TEXT_STYLE: React.CSSProperties = {
  lineHeight: '1.6',
  tabSize: 2,
};

export function ChordProEditor({
  value,
  onChange,
  songChords = [],
  onScrollRatioChange,
  className = '',
  ariaInvalid,
  ariaDescribedBy,
}: ChordProEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = value.split('\n').length;

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (onScrollRatioChange) {
      const max = Math.max(0, ta.scrollHeight - ta.clientHeight);
      onScrollRatioChange(max > 0 ? ta.scrollTop / max : 0);
    }
  };

  /** Inserts text or wraps selection at the current caret without losing focus.
   * If the editor was never focused (caret stuck at 0 before `{title:...}`), appends cleanly at the end instead of corrupting header directives. */
  const insertSnippet = (before: string, after = '', placeInside = true) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + before + after);
      return;
    }
    const isFocused = document.activeElement === ta;
    let start = ta.selectionStart ?? value.length;
    let end = ta.selectionEnd ?? start;
    if (!isFocused && start === 0 && end === 0 && /^[ \t]*\{title:/i.test(value)) {
      start = value.length;
      end = value.length;
    }
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    const nextCursor =
      selected.length > 0
        ? start + before.length + selected.length + after.length
        : placeInside
        ? start + before.length
        : start + before.length + after.length;
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Auto-close `[` -> `[]` (or wrap selected chord text) for effortless desktop ChordPro entry
    if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const nextChar = value[end] || '';
      if (start !== end || nextChar === '' || /[\s\w\n]/.test(nextChar)) {
        e.preventDefault();
        insertSnippet('[', ']', true);
      }
    }
  };

  return (
    <div className={`flex flex-col bg-[var(--bg)]/60 min-h-0 ${className}`}>
      <div className="relative flex flex-1 min-h-0">
        {/* Line-number gutter stays exact on lg+ (desktop no-wrap); hidden on < lg where soft-wrap prevents horizontal scroll */}
        <div
          ref={gutterRef}
          aria-hidden
          className="hidden lg:block overflow-hidden select-none text-right pt-4 pb-12 pl-3 pr-2 text-sm font-mono text-[var(--muted)] border-r border-[var(--line-subtle)]/35 flex-shrink-0 opacity-75 tabular-nums"
          style={SHARED_TEXT_STYLE}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative flex-1 overflow-hidden">
          <pre
            ref={highlightRef}
            aria-hidden
            className="absolute inset-0 overflow-auto px-3 py-3 sm:p-4 m-0 text-base lg:text-sm font-mono whitespace-pre-wrap break-words lg:whitespace-pre lg:break-normal pointer-events-none"
            style={SHARED_TEXT_STYLE}
            dangerouslySetInnerHTML={{
              __html: highlightChordPro(value) + (value.endsWith('\n') ? ' ' : ''),
            }}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            aria-label="Código fonte ChordPro"
            aria-invalid={ariaInvalid || undefined}
            aria-describedby={ariaDescribedBy}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            className="absolute inset-0 w-full h-full overflow-auto px-3 py-3 sm:p-4 text-base lg:text-sm font-mono whitespace-pre-wrap break-words lg:whitespace-pre lg:break-normal bg-transparent text-transparent caret-[var(--accent)] focus:outline-none resize-none"
            style={SHARED_TEXT_STYLE}
          />
        </div>
      </div>

      {/* Slim touch-friendly ChordPro accessory bar (1-tap brackets, sections & song chords) */}
      <div
        role="toolbar"
        aria-label="Atalhos rápidos de ChordPro"
        className="flex-shrink-0 border-t border-[var(--line-subtle)]/40 bg-[var(--surface-high)]/75 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
      >
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertSnippet('[', ']', true)}
          className="flex-shrink-0 pill-btn bg-[var(--surface-control)] px-3 h-9 font-mono text-xs font-bold"
          title="Inserir colchetes de acorde [ ]"
        >
          [ ]
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertSnippet('\n[', ']\n', true)}
          className="flex-shrink-0 pill-btn bg-[var(--surface-control)] px-3 h-9 font-mono text-xs"
          title="Inserir cabeçalho de seção"
        >
          + Seção
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertSnippet('/', '', false)}
          className="flex-shrink-0 pill-btn bg-[var(--surface-control)] w-9 h-9 font-mono text-xs font-bold"
          title="Inserir barra de baixo invertido (/)"
          aria-label="Inserir barra"
        >
          /
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertSnippet('#', '', false)}
          className="flex-shrink-0 pill-btn bg-[var(--surface-control)] w-9 h-9 font-mono text-xs font-bold"
          title="Inserir sustenido (#)"
          aria-label="Inserir sustenido"
        >
          #
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertSnippet('b', '', false)}
          className="flex-shrink-0 pill-btn bg-[var(--surface-control)] w-9 h-9 font-mono text-xs font-bold"
          title="Inserir bemol (b)"
          aria-label="Inserir bemol"
        >
          b
        </button>
        {songChords.length > 0 && (
          <>
            <span aria-hidden="true" className="w-px h-5 bg-[var(--line-subtle)]/70 mx-0.5 flex-shrink-0" />
            {songChords.slice(0, 12).map((c) => (
              <button
                key={c}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => insertSnippet(`[${c}]`, '', false)}
                className="flex-shrink-0 px-3 h-9 rounded-full font-mono text-xs font-bold bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors cursor-pointer"
                title={`Inserir [${c}] no cursor`}
              >
                {c}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
