'use client';

import { useRef } from 'react';
import { highlightChordPro } from '@/lib/utils/chordpro-highlight';

interface ChordProEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SHARED_TEXT_STYLE: React.CSSProperties = {
  lineHeight: '1.6',
  tabSize: 2,
};

export function ChordProEditor({ value, onChange, className = '' }: ChordProEditorProps) {
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
  };

  return (
    <div className={`relative flex bg-[var(--bg)]/60 ${className}`}>
      <div
        ref={gutterRef}
        aria-hidden
        className="overflow-hidden select-none text-right py-4 pl-3 pr-2 text-xs font-mono text-[var(--muted)] border-r border-[var(--line)] flex-shrink-0 opacity-65"
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
          className="absolute inset-0 overflow-auto p-4 m-0 text-xs font-mono whitespace-pre pointer-events-none"
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
          spellCheck={false}
          className="absolute inset-0 w-full h-full overflow-auto p-4 text-xs font-mono whitespace-pre bg-transparent text-transparent caret-[var(--accent)] outline-none resize-none"
          style={SHARED_TEXT_STYLE}
        />
      </div>
    </div>
  );
}
