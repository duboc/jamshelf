'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  buildSmoothSvgPath,
  computeStrokeWidthEm,
  NOTE_TONE_MAP,
  NOTE_TONES,
  QUICK_NOTE_CUES,
  type AnnotateTool,
  type InkStroke,
  type NoteShape,
  type NoteTone,
  type TextNote,
} from '@/lib/types/annotations';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EditIcon,
  EraserIcon,
  HighlighterIcon,
  MoreVertIcon,
  RedoIcon,
  TextNoteIcon,
  TrashIcon,
  UndoIcon,
} from '@/components/ui/Icons';

const SVG_SCALE = 100;

function blurOnPointer(e: React.MouseEvent<HTMLButtonElement>) {
  if (e.detail > 0) {
    e.currentTarget.blur();
  }
}

function scaledPath(points: [number, number, number][]): string {
  const scaled: [number, number, number][] = points.map(([x, y, p]) => [
    Math.round(x * SVG_SCALE * 10) / 10,
    Math.round(y * SVG_SCALE * 10) / 10,
    p,
  ]);
  return buildSmoothSvgPath(scaled);
}

/** Color-independent micro-shape paired with each semantic note tone (WCAG 1.4.1). */
export function ToneShapeGlyph({
  shape,
  color,
  size = 8,
}: {
  shape: NoteShape;
  color: string;
  size?: number;
}) {
  if (shape === 'diamond') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <polygon points="5,0.6 9.4,5 5,9.4 0.6,5" fill={color} />
      </svg>
    );
  }
  if (shape === 'square') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1.8" fill={color} />
      </svg>
    );
  }
  if (shape === 'triangle') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
        <polygon points="5,0.8 9.3,8.8 0.7,8.8" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className="flex-shrink-0" aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill={color} />
    </svg>
  );
}

interface StrokeLayerProps {
  strokes: InkStroke[];
  coordMode: 'em' | 'page';
  /** Separate pass so highlighters paint cleanly BEHIND lyrics/chords (z-0) and pen ink stays sharp ABOVE (z-10). */
  renderKind: 'highlighter' | 'pen';
}

export function StrokeLayer({ strokes, coordMode, renderKind }: StrokeLayerProps) {
  const filtered = strokes.filter((s) => s.tool === renderKind);
  if (filtered.length === 0) return null;

  const isHi = renderKind === 'highlighter';

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-visible ${isHi ? 'z-0' : 'z-10'}`}
      aria-hidden="true"
    >
      {filtered.map((stroke) => {
        const tone = NOTE_TONE_MAP[stroke.tone] ?? NOTE_TONE_MAP.amber;
        const strokeColor = isHi ? tone.hiVar : tone.inkVar;
        const strokeWidth = computeStrokeWidthEm(stroke.tool, stroke.points) * SVG_SCALE;

        let maxDxEm = 0.6;
        for (let i = 0; i < stroke.points.length; i++) {
          if (stroke.points[i][0] > maxDxEm) maxDxEm = stroke.points[i][0];
        }
        const safeRightReserve = Math.min(8, Math.round(maxDxEm * 10) / 10);

        const posStyle: CSSProperties =
          coordMode === 'em'
            ? {
                left: `min(calc(${Math.max(0, stroke.originX)}em), max(0px, calc(100% - ${safeRightReserve}em - 6px)))`,
                top: `${stroke.originY}em`,
              }
            : {
                left: `${stroke.originX * 100}%`,
                top: `${stroke.originY * 100}%`,
              };

        return (
          <div
            key={stroke.id}
            className="absolute pointer-events-none"
            style={posStyle}
          >
            <svg
              width="1em"
              height="1em"
              viewBox={`0 0 ${SVG_SCALE} ${SVG_SCALE}`}
              className={`overflow-visible block ${isHi ? 'gm3-note-hi-stroke' : ''}`}
            >
              <path
                data-stroke-id={stroke.id}
                data-stroke-tool={stroke.tool}
                d={scaledPath(stroke.points)}
                fill="none"
                stroke={strokeColor}
                strokeOpacity={1}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

interface TextNoteListProps {
  notes: TextNote[];
  coordMode: 'em' | 'page';
  annotateMode: boolean;
  activeTool: AnnotateTool;
  draggingNoteId: string | null;
  onStartDragNote: (note: TextNote, e: React.PointerEvent<HTMLButtonElement>) => void;
  onTapNote: (note: TextNote, rect: DOMRect) => void;
}

function getNotePosStyle(note: TextNote, coordMode: 'em' | 'page'): CSSProperties {
  if (coordMode === 'page') {
    if (note.align === 'right' || note.x > 0.62) {
      return {
        right: `clamp(8px, ${(1 - note.x) * 100}%, calc(100% - 140px))`,
        top: `clamp(16px, ${note.y * 100}%, calc(100% - 36px))`,
        transform: 'translateY(-50%)',
      };
    }
    return {
      left: `clamp(8px, ${note.x * 100}%, calc(100% - 140px))`,
      top: `clamp(16px, ${note.y * 100}%, calc(100% - 36px))`,
      transform: 'translateY(-50%)',
    };
  }

  // Symmetric clamps ensure notes placed on wide 1920px columns stay inside 375px phones cleanly
  if (note.align === 'right') {
    return {
      right: `clamp(0px, calc(${Math.max(0, note.x)}em), max(0px, calc(100% - min(180px, 65%))))`,
      top: `${note.y}em`,
      transform: 'translateY(-45%)',
    };
  }
  return {
    left: `clamp(0px, calc(${Math.max(0, note.x)}em), max(0px, calc(100% - min(180px, 65%))))`,
    top: `${note.y}em`,
    transform: 'translateY(-45%)',
  };
}

export function TextNoteList({
  notes,
  coordMode,
  annotateMode,
  activeTool,
  draggingNoteId,
  onStartDragNote,
  onTapNote,
}: TextNoteListProps) {
  if (notes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-20">
      {notes.map((note) => {
        const tone = NOTE_TONE_MAP[note.tone] ?? NOTE_TONE_MAP.amber;
        const isDragging = draggingNoteId === note.id;
        const posStyle = getNotePosStyle(note, coordMode);

        // In Reading Mode, render a semantic read-only note (never a dead focusable button for VoiceOver)
        if (!annotateMode) {
          return (
            <div
              key={note.id}
              role="note"
              data-note-id={note.id}
              data-note-tone={note.tone}
              data-editable="false"
              aria-label={`Nota (${tone.label}): ${note.text}`}
              className="gm3-note-chip pointer-events-none absolute inline-flex items-start gap-1.5 px-2.5 py-1 text-left w-max max-w-[min(240px,86%)] select-none"
              style={{
                ...posStyle,
                backgroundColor: tone.chipBg,
                color: tone.chipFg,
              }}
            >
              <span className="mt-[0.3em]">
                <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={8} />
              </span>
              <span className="font-sans font-medium text-[clamp(12px,0.76em,17px)] leading-snug break-words whitespace-pre-wrap">
                {note.text}
              </span>
            </div>
          );
        }

        const isEraser = activeTool === 'eraser';
        return (
          <button
            key={note.id}
            type="button"
            data-note-id={note.id}
            data-note-tone={note.tone}
            data-editable="true"
            data-dragging={isDragging ? 'true' : 'false'}
            aria-label={
              isEraser
                ? `Apagar nota (${tone.label}): ${note.text}`
                : `Editar ou mover nota (${tone.label}): ${note.text}`
            }
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDragNote(note, e);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail === 0) {
                onTapNote(note, e.currentTarget.getBoundingClientRect());
              }
            }}
            className={`gm3-note-chip pointer-events-auto touch-none absolute inline-flex items-start gap-1.5 px-2.5 py-1 text-left w-max max-w-[min(240px,86%)] select-none before:content-[''] before:absolute before:-inset-y-2.5 before:-inset-x-1.5 ${
              isEraser
                ? 'cursor-pointer ring-2 ring-inset ring-[var(--rec)]'
                : 'cursor-grab active:cursor-grabbing'
            } ${isDragging ? 'opacity-30' : 'opacity-100'}`}
            style={{
              ...posStyle,
              backgroundColor: tone.chipBg,
              color: tone.chipFg,
            }}
          >
            <span className="mt-[0.3em]">
              <ToneShapeGlyph shape={tone.shape} color={tone.dotColor} size={8} />
            </span>
            <span className="font-sans font-medium text-[clamp(12px,0.76em,17px)] leading-snug break-words whitespace-pre-wrap">
              {note.text}
            </span>
            {isEraser && (
              <span className="ml-0.5 mt-[2px] flex-shrink-0 text-[var(--rec)]" aria-hidden="true">
                <CloseIcon size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface LiveStrokePreviewProps {
  points: Array<{ x: number; y: number; pressure: number }>;
  tool: 'pen' | 'highlighter';
  tone: NoteTone;
  scalePx: number;
}

export function LiveStrokePreview({
  points,
  tool,
  tone,
  scalePx,
}: LiveStrokePreviewProps) {
  if (points.length === 0) return null;
  const toneMeta = NOTE_TONE_MAP[tone] ?? NOTE_TONE_MAP.amber;
  const isHi = tool === 'highlighter';
  const tuples: [number, number, number][] = points.map((p) => [p.x, p.y, p.pressure]);
  const widthPx = computeStrokeWidthEm(tool, tuples) * scalePx;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 w-full h-full z-30 overflow-visible ${
        isHi ? 'gm3-note-hi-stroke' : ''
      }`}
      aria-hidden="true"
    >
      <path
        d={buildSmoothSvgPath(tuples)}
        fill="none"
        stroke={isHi ? toneMeta.hiVar : toneMeta.inkVar}
        strokeOpacity={1}
        strokeWidth={widthPx}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TOOL_ITEMS: { id: AnnotateTool; label: string; icon: React.ReactNode }[] = [
  { id: 'pen', label: 'Caneta', icon: <EditIcon size={16} /> },
  { id: 'highlighter', label: 'Marcador', icon: <HighlighterIcon size={16} /> },
  { id: 'text', label: 'Texto', icon: <TextNoteIcon size={16} /> },
  { id: 'eraser', label: 'Borracha', icon: <EraserIcon size={16} /> },
];

type DockPopoverKind = 'tools' | 'tones' | 'more' | 'clear' | null;

interface SlideAnnotationDockProps {
  tool: AnnotateTool;
  tone: NoteTone;
  canUndo: boolean;
  canRedo: boolean;
  hasAnyAnnotations: boolean;
  annotationCount: number;
  atDeckStart: boolean;
  atDeckEnd: boolean;
  pageLabel: string;
  onSelectTool: (t: AnnotateTool, fromKeyboard?: boolean) => void;
  onSelectTone: (tone: NoteTone) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  onDone: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function SlideAnnotationDock({
  tool,
  tone,
  canUndo,
  canRedo,
  hasAnyAnnotations,
  annotationCount,
  atDeckStart,
  atDeckEnd,
  pageLabel,
  onSelectTool,
  onSelectTone,
  onUndo,
  onRedo,
  onClearAll,
  onDone,
  onPrev,
  onNext,
}: SlideAnnotationDockProps) {
  const [openPopover, setOpenPopover] = useState<DockPopoverKind>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const activePopover: DockPopoverKind =
    openPopover === 'clear' && !hasAnyAnnotations ? null : openPopover;

  // Close any open dock popover on outside tap or Escape
  useEffect(() => {
    if (!activePopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dockRef.current && e.target instanceof Node && !dockRef.current.contains(e.target)) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenPopover(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [activePopover]);

  const activeToolItem = TOOL_ITEMS.find((t) => t.id === tool) ?? TOOL_ITEMS[0];
  const activeToneMeta = NOTE_TONE_MAP[tone] ?? NOTE_TONE_MAP.amber;

  const handleTrashTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    blurOnPointer(e);
    if (!hasAnyAnnotations) return;
    if (activePopover === 'clear') {
      // Second tap directly on armed Trash confirms immediately (2-tap safety + zero width shift!)
      setOpenPopover(null);
      onClearAll();
    } else {
      setOpenPopover('clear');
    }
  };

  return (
    <div
      ref={dockRef}
      role="region"
      aria-label="Ferramentas de anotação"
      data-annotate-dock="true"
      className="pointer-events-none fixed bottom-0 inset-x-0 z-40 h-[56px] flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3.5"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          blurOnPointer(e);
          setOpenPopover(null);
          onPrev();
        }}
        aria-disabled={atDeckStart}
        aria-label="Página anterior"
        title="Página anterior"
        className={`pointer-events-auto pill-btn h-11 min-w-11 w-11 flex-shrink-0 ${
          atDeckStart ? 'opacity-40' : ''
        }`}
        style={{ boxShadow: 'var(--shadow-sm)' }}
      >
        <ChevronLeftIcon size={17} />
      </button>

      {/* Strictly single-row 52px floating GM3 dock (3 progressive tiers: <640px, 640-1023px, >=1024px) */}
      <div className="relative pointer-events-auto flex items-center justify-center min-w-0">
        {/* Upward popovers anchored cleanly above the single-row dock */}
        {activePopover === 'tools' && (
          <div
            role="group"
            aria-label="Escolher ferramenta de anotação"
            data-dock-popover="tools"
            className="gm3-dock-popover absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 p-1.5 z-50"
          >
            <ConnectedGroup value={tool} ariaLabel="Ferramenta de anotação">
              {TOOL_ITEMS.map((item) => {
                const active = tool === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-annotate-tool={item.id}
                    onClick={(e) => {
                      const fromKeyboard = e.detail === 0;
                      blurOnPointer(e);
                      setOpenPopover(null);
                      onSelectTool(item.id, fromKeyboard);
                    }}
                    aria-pressed={active}
                    aria-label={item.label}
                    className={`gm3-connected-btn h-11 min-w-11 px-3 text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                      active ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </ConnectedGroup>
          </div>
        )}

        {activePopover === 'tones' && (
          <div
            role="group"
            aria-label="Escolher cor da anotação"
            data-dock-popover="tones"
            className="gm3-dock-popover absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 p-1.5 z-50 inline-flex items-center gap-1"
          >
            {NOTE_TONES.map((t) => {
              const selected = tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-annotate-tone={t.id}
                  onClick={(e) => {
                    blurOnPointer(e);
                    onSelectTone(t.id);
                    setOpenPopover(null);
                  }}
                  aria-pressed={selected}
                  aria-label={t.label}
                  title={t.label}
                  className="h-11 min-w-11 w-11 inline-flex items-center justify-center cursor-pointer rounded-full"
                >
                  <span
                    className="gm3-note-swatch"
                    data-selected={selected ? 'true' : 'false'}
                    style={{ backgroundColor: t.chipBg, color: t.chipFg }}
                  >
                    {selected ? (
                      <CheckIcon size={15} />
                    ) : (
                      <ToneShapeGlyph shape={t.shape} color={t.dotColor} size={13} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activePopover === 'more' && (
          <div
            role="group"
            aria-label="Mais opções de anotação"
            data-dock-popover="more"
            className="gm3-dock-popover absolute bottom-[calc(100%+8px)] right-0 p-2 z-50 flex flex-col gap-1.5 min-w-[200px]"
          >
            <div className="flex items-center justify-between px-2 pt-0.5 text-xs text-[var(--muted)] font-medium tabular-nums">
              <span>Anotações</span>
              <span>{pageLabel}</span>
            </div>
            <button
              type="button"
              data-annotate-redo="true"
              disabled={!canRedo}
              onClick={(e) => {
                blurOnPointer(e);
                onRedo();
                setOpenPopover(null);
              }}
              className="pill-btn h-11 min-w-11 px-3 text-xs font-medium justify-start"
            >
              <RedoIcon size={15} />
              <span>Refazer</span>
            </button>
            <button
              type="button"
              data-annotate-clear="true"
              disabled={!hasAnyAnnotations}
              onClick={(e) => {
                blurOnPointer(e);
                setOpenPopover('clear');
              }}
              className="pill-btn h-11 min-w-11 px-3 text-xs font-medium justify-start text-[var(--rec)]"
            >
              <TrashIcon size={15} />
              <span>Limpar música ({annotationCount})</span>
            </button>
          </div>
        )}

        {activePopover === 'clear' && (
          <div
            role="dialog"
            aria-label="Confirmar limpeza de anotações"
            data-clear-popover="true"
            className="gm3-dock-popover absolute bottom-[calc(100%+8px)] right-0 p-3 z-50 flex flex-col gap-2 min-w-[236px]"
          >
            <p className="text-xs font-medium text-[var(--ink)] leading-snug px-0.5">
              Limpar {annotationCount === 1 ? '1 anotação' : `${annotationCount} anotações`} desta música?
            </p>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  blurOnPointer(e);
                  setOpenPopover(null);
                }}
                className="pill-btn h-11 min-w-11 px-3 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-clear-confirm="true"
                onClick={(e) => {
                  blurOnPointer(e);
                  setOpenPopover(null);
                  onClearAll();
                }}
                className="pill-btn pill-btn-rec h-11 min-w-11 px-3.5 text-xs font-semibold"
              >
                Limpar tudo
              </button>
            </div>
          </div>
        )}

        {/* Single-row 52px GM3 dock pill */}
        <div className="gm3-annotate-dock flex flex-nowrap items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1">
          {/* Phones (< 640px): single Active Tool button opening upward 4-tool popover */}
          <button
            type="button"
            data-annotate-tool-trigger="true"
            onClick={(e) => {
              blurOnPointer(e);
              setOpenPopover((p) => (p === 'tools' ? null : 'tools'));
            }}
            aria-haspopup="true"
            aria-expanded={activePopover === 'tools'}
            aria-label={`Ferramenta: ${activeToolItem.label}. Toque para trocar`}
            title={`Ferramenta: ${activeToolItem.label}`}
            className="sm:hidden pill-btn pill-btn-tonal h-11 min-w-11 w-11 flex-shrink-0"
          >
            {activeToolItem.icon}
          </button>

          {/* Tablets & Desktop (>= 640px): all 4 tools inline in ConnectedGroup */}
          <div className="hidden sm:inline-flex items-center">
            <ConnectedGroup value={tool} ariaLabel="Ferramenta de anotação">
              {TOOL_ITEMS.map((item) => {
                const active = tool === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-annotate-tool={item.id}
                    onClick={(e) => {
                      const fromKeyboard = e.detail === 0;
                      blurOnPointer(e);
                      setOpenPopover(null);
                      onSelectTool(item.id, fromKeyboard);
                    }}
                    aria-pressed={active}
                    aria-label={
                      item.id === 'text' && active
                        ? 'Texto (ativo — ative novamente para inserir nova nota)'
                        : item.label
                    }
                    title={
                      item.id === 'text'
                        ? 'Adicionar nota de texto (toque em qualquer lugar do slide)'
                        : item.label
                    }
                    className={`gm3-connected-btn h-11 min-w-11 px-2.5 xl:px-3 text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                      active ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {item.icon}
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                );
              })}
            </ConnectedGroup>
          </div>

          <span className="hidden lg:block w-px h-6 bg-[var(--line-subtle)] mx-0.5" aria-hidden="true" />

          {/* Phones & Portrait Tablets (< 1024px): single Active Tone swatch button opening 4-swatch popover */}
          <button
            type="button"
            data-annotate-tone-trigger="true"
            onClick={(e) => {
              blurOnPointer(e);
              setOpenPopover((p) => (p === 'tones' ? null : 'tones'));
            }}
            aria-haspopup="true"
            aria-expanded={activePopover === 'tones'}
            aria-label={`Cor: ${activeToneMeta.label}. Toque para trocar`}
            title={`Cor: ${activeToneMeta.label}`}
            className="lg:hidden h-11 min-w-11 w-11 inline-flex items-center justify-center cursor-pointer rounded-full flex-shrink-0"
          >
            <span
              className="gm3-note-swatch"
              data-selected={activePopover === 'tones' ? 'true' : 'false'}
              style={{ backgroundColor: activeToneMeta.chipBg, color: activeToneMeta.chipFg }}
            >
              <ToneShapeGlyph shape={activeToneMeta.shape} color={activeToneMeta.dotColor} size={13} />
            </span>
          </button>

          {/* Landscape Tablets & Desktop (>= 1024px): all 4 swatches inline */}
          <div
            role="group"
            aria-label="Cor da anotação"
            className="hidden lg:inline-flex items-center gap-0.5"
          >
            {NOTE_TONES.map((t) => {
              const selected = tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-annotate-tone={t.id}
                  onClick={(e) => {
                    blurOnPointer(e);
                    setOpenPopover(null);
                    onSelectTone(t.id);
                  }}
                  aria-pressed={selected}
                  aria-label={t.label}
                  title={t.label}
                  className="h-11 min-w-11 w-11 inline-flex items-center justify-center cursor-pointer rounded-full"
                >
                  <span
                    className="gm3-note-swatch"
                    data-selected={selected ? 'true' : 'false'}
                    style={{ backgroundColor: t.chipBg, color: t.chipFg }}
                  >
                    {selected ? (
                      <CheckIcon size={15} />
                    ) : (
                      <ToneShapeGlyph shape={t.shape} color={t.dotColor} size={13} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <span className="hidden lg:block w-px h-6 bg-[var(--line-subtle)] mx-0.5" aria-hidden="true" />

          {/* Undo (always inline on every device) + Redo (inline >= 640px, in More menu on phones) */}
          <div className="gm3-btn-group">
            <button
              type="button"
              data-annotate-undo="true"
              onClick={(e) => {
                blurOnPointer(e);
                setOpenPopover(null);
                onUndo();
              }}
              disabled={!canUndo}
              aria-label="Desfazer última anotação"
              title="Desfazer (Ctrl+Z)"
              className="pill-btn h-11 min-w-11 w-11"
            >
              <UndoIcon size={16} />
            </button>
            <button
              type="button"
              data-annotate-redo="true"
              onClick={(e) => {
                blurOnPointer(e);
                setOpenPopover(null);
                onRedo();
              }}
              disabled={!canRedo}
              aria-label="Refazer anotação"
              title="Refazer (Ctrl+Shift+Z)"
              className="hidden sm:inline-flex pill-btn h-11 min-w-11 w-11"
            >
              <RedoIcon size={16} />
            </button>
          </div>

          {/* Phones (< 640px): More button for Redo, Clear, and page indicator */}
          <button
            type="button"
            data-annotate-more="true"
            onClick={(e) => {
              blurOnPointer(e);
              setOpenPopover((p) => (p === 'more' ? null : 'more'));
            }}
            aria-haspopup="true"
            aria-expanded={activePopover === 'more'}
            aria-label="Mais opções de anotação"
            title="Mais opções"
            className="sm:hidden pill-btn h-11 min-w-11 w-11 flex-shrink-0"
          >
            <MoreVertIcon size={17} />
          </button>

          {/* Tablets & Desktop (>= 640px): fixed-width 44x44 Trash button opening anchored confirm popover (0px dock shift!) */}
          <span className="hidden lg:block w-px h-6 bg-[var(--line-subtle)] mx-0.5" aria-hidden="true" />
          <button
            type="button"
            data-annotate-clear="true"
            data-clear-armed={activePopover === 'clear' ? 'true' : 'false'}
            onClick={handleTrashTap}
            disabled={!hasAnyAnnotations}
            aria-haspopup="dialog"
            aria-expanded={activePopover === 'clear'}
            aria-label={
              activePopover === 'clear'
                ? `Confirmar limpeza de ${annotationCount} anotações desta música`
                : 'Limpar anotações desta música'
            }
            title={
              activePopover === 'clear'
                ? 'Toque novamente para confirmar limpeza'
                : 'Limpar anotações desta música'
            }
            className={`hidden sm:inline-flex pill-btn h-11 min-w-11 w-11 flex-shrink-0 ${
              activePopover === 'clear'
                ? 'bg-[var(--rec-dim)] text-[var(--on-rec-container)]'
                : 'text-[var(--rec)]'
            }`}
          >
            <TrashIcon size={15} />
          </button>

          <span
            data-dock-page-label="true"
            className="hidden lg:inline font-expressive text-xs font-medium text-[var(--muted)] tabular-nums px-1 whitespace-nowrap"
          >
            {pageLabel}
          </span>

          <button
            type="button"
            data-annotate-done="true"
            onClick={(e) => {
              blurOnPointer(e);
              setOpenPopover(null);
              onDone();
            }}
            aria-label="Concluir anotações"
            title="Concluir (Esc)"
            className="pill-btn pill-btn-primary h-11 min-w-11 w-11 md:w-auto md:px-3.5 text-xs sm:text-sm font-semibold flex-shrink-0"
          >
            <CheckIcon size={16} />
            <span className="hidden md:inline">Concluir</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          blurOnPointer(e);
          setOpenPopover(null);
          onNext();
        }}
        aria-disabled={atDeckEnd}
        aria-label="Próxima página"
        title="Próxima página"
        className={`pointer-events-auto pill-btn h-11 min-w-11 w-11 flex-shrink-0 ${
          atDeckEnd ? 'opacity-40' : ''
        }`}
        style={{ boxShadow: 'var(--shadow-sm)' }}
      >
        <ChevronRightIcon size={17} />
      </button>
    </div>
  );
}

export interface SectionMoveOption {
  sectionIdx: number;
  label: string;
}

interface SlideNoteComposerProps {
  initialText: string;
  initialTone: NoteTone;
  initialSectionIdx: number | null;
  sectionOptions: SectionMoveOption[];
  isEditing: boolean;
  /** Viewport coordinates for anchoring the popover cleanly inside visualViewport bounds. */
  anchorPoint: { x: number; y: number };
  onSave: (text: string, tone: NoteTone, targetSectionIdx?: number | null) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function SlideNoteComposer({
  initialText,
  initialTone,
  initialSectionIdx,
  sectionOptions,
  isEditing,
  anchorPoint,
  onSave,
  onDelete,
  onCancel,
}: SlideNoteComposerProps) {
  const [text, setText] = useState(initialText);
  const [tone, setTone] = useState<NoteTone>(initialTone);
  const [targetSection, setTargetSection] = useState<number | null>(initialSectionIdx);
  const [vpBox, setVpBox] = useState(() => ({
    w: typeof window !== 'undefined' ? window.visualViewport?.width ?? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 768,
    offsetTop: typeof window !== 'undefined' ? window.visualViewport?.offsetTop ?? 0 : 0,
    offsetLeft: typeof window !== 'undefined' ? window.visualViewport?.offsetLeft ?? 0 : 0,
  }));
  const [measuredH, setMeasuredH] = useState(310);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture & restore focus cleanly on unmount (WCAG 2.4.3 / iPadOS VoiceOver)
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const isCoarse =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const id = requestAnimationFrame(() => {
      if (isCoarse && !isEditing) {
        dialogRef.current?.focus();
      } else {
        inputRef.current?.focus();
        if (initialText) {
          inputRef.current?.setSelectionRange(initialText.length, initialText.length);
        }
      }
    });

    return () => {
      cancelAnimationFrame(id);
      const prev = openerRef.current;
      if (prev && prev.isConnected) {
        prev.focus();
      } else {
        const fallback = document.querySelector<HTMLElement>('[data-annotate-toggle="true"]');
        fallback?.focus();
      }
    };
  }, [initialText, isEditing]);

  // Track visualViewport resizes & offsets (iOS virtual keyboard + orientation flips)
  useEffect(() => {
    const updateVp = () => {
      setVpBox({
        w: window.visualViewport?.width ?? window.innerWidth,
        h: window.visualViewport?.height ?? window.innerHeight,
        offsetTop: window.visualViewport?.offsetTop ?? 0,
        offsetLeft: window.visualViewport?.offsetLeft ?? 0,
      });
    };
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateVp);
    vv?.addEventListener('scroll', updateVp);
    window.addEventListener('resize', updateVp);
    return () => {
      vv?.removeEventListener('resize', updateVp);
      vv?.removeEventListener('scroll', updateVp);
      window.removeEventListener('resize', updateVp);
    };
  }, []);

  useLayoutEffect(() => {
    if (!dialogRef.current) return;
    const h = Math.ceil(dialogRef.current.getBoundingClientRect().height);
    if (h > 0 && Math.abs(h - measuredH) > 4) {
      setMeasuredH(h);
    }
  }, [measuredH, sectionOptions.length, isEditing, vpBox.h]);

  const isShortViewport = vpBox.h < 480;
  const isWideShort = isShortViewport && vpBox.w >= 560;
  const maxDialogH = Math.max(180, vpBox.h - 16);
  const effectiveH = Math.min(measuredH, maxDialogH);
  const boxW = isWideShort
    ? Math.min(500, Math.max(320, vpBox.w - 24))
    : Math.min(364, Math.max(260, vpBox.w - 24));
  const minLeft = vpBox.offsetLeft + 12;
  const maxLeft = Math.max(minLeft, vpBox.offsetLeft + vpBox.w - boxW - 12);
  const left = Math.max(minLeft, Math.min(anchorPoint.x - boxW / 2, maxLeft));
  const preferAbove = anchorPoint.y > vpBox.offsetTop + vpBox.h * 0.52;
  const rawTop = preferAbove ? anchorPoint.y - effectiveH - 14 : anchorPoint.y + 14;
  const minTop = vpBox.offsetTop + 8;
  const maxTop = Math.max(minTop, vpBox.offsetTop + vpBox.h - effectiveH - 8);
  const top = Math.max(minTop, Math.min(rawTop, maxTop));

  const toneMeta = NOTE_TONE_MAP[tone] ?? NOTE_TONE_MAP.amber;
  const canSave = text.trim().length > 0;

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const movedSection = targetSection !== initialSectionIdx ? targetSection : undefined;
    onSave(trimmed, tone, movedSection);
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/15"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={isEditing ? 'Editar nota no slide' : 'Nova nota no slide'}
        data-note-composer="true"
        className={`gm3-note-composer fixed flex flex-col focus:outline-none overflow-hidden ${
          isShortViewport ? 'p-3 gap-2' : 'p-4 gap-3'
        }`}
        style={{ left, top, width: boxW, maxHeight: maxDialogH }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Pinned Composer Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: toneMeta.chipBg, color: toneMeta.chipFg }}
          >
            <ToneShapeGlyph shape={toneMeta.shape} color={toneMeta.dotColor} size={9} />
            {isEditing ? 'Editar nota' : 'Nota no slide'}
          </span>

          <div className="inline-flex items-center gap-0.5" role="group" aria-label="Cor da nota">
            {NOTE_TONES.map((t) => {
              const active = tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  aria-pressed={active}
                  aria-label={t.label}
                  className="h-11 min-w-11 w-11 inline-flex items-center justify-center rounded-full cursor-pointer"
                >
                  <span
                    className="gm3-note-swatch"
                    data-selected={active ? 'true' : 'false'}
                    style={{ backgroundColor: t.chipBg, color: t.chipFg }}
                  >
                    {active ? (
                      <CheckIcon size={15} />
                    ) : (
                      <ToneShapeGlyph shape={t.shape} color={t.dotColor} size={13} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Middle Body (stays visible even when iOS keyboard shrinks visualViewport) */}
        <div className={`min-h-0 flex-1 overflow-y-auto flex flex-col ${isShortViewport ? 'gap-2' : 'gap-3'}`}>
          <textarea
            ref={inputRef}
            rows={isShortViewport ? 1 : 2}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSave) submit();
              }
            }}
            placeholder="Ex.: Entra bateria, 2x, só violão..."
            aria-label="Texto da nota"
            className="studio-input w-full px-3 py-2 text-base sm:text-sm resize-none leading-snug bg-[var(--surface)]"
          />

          {/* 1-tap >=44px quick musical stage cues (single scrollable row on short landscape phones) */}
          <div
            className={
              isShortViewport
                ? 'flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5'
                : 'flex flex-wrap gap-2'
            }
          >
            {QUICK_NOTE_CUES.map((cue) => (
              <button
                key={cue}
                type="button"
                onClick={() => {
                  setText((prev) => (prev.trim() ? `${prev.trim()} · ${cue}` : cue));
                }}
                className="rounded-full bg-[var(--surface)] hover:bg-[var(--surface2)] text-[var(--ink)] min-h-11 min-w-11 px-3.5 py-2 text-xs font-medium cursor-pointer transition-colors flex-shrink-0"
              >
                {cue}
              </button>
            ))}
          </div>

          {/* Non-drag section mover (WCAG 2.5.7 AA single-pointer / keyboard alternative to dragging) */}
          {sectionOptions.length > 1 && (
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
              <span className="font-medium whitespace-nowrap">Seção</span>
              <select
                aria-label="Seção da nota"
                value={targetSection === null ? '' : String(targetSection)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTargetSection(v === '' ? null : Number(v));
                }}
                className="studio-input h-11 px-3 text-base sm:text-xs bg-[var(--surface)] min-w-0 flex-1"
              >
                {sectionOptions.map((opt) => (
                  <option key={opt.sectionIdx} value={opt.sectionIdx}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Pinned Composer Footer (Excluir / Cancelar / Salvar never scroll off-screen) */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 pt-0.5">
          {isEditing && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="pill-btn h-11 min-w-11 px-3 text-xs font-medium text-[var(--rec)]"
            >
              <TrashIcon size={14} />
              <span>Excluir</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="pill-btn h-11 min-w-11 px-3.5 text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-note-save="true"
              disabled={!canSave}
              onClick={submit}
              className="pill-btn pill-btn-primary h-11 min-w-11 px-4 text-xs font-semibold"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
