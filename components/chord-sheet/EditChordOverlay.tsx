'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence, useRetainedValue } from '@/lib/hooks/use-animated-presence';
import { getDiatonicChordsForKey } from '@/lib/utils/music';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  PlusIcon,
} from '@/components/ui/Icons';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SUFFIXES = [
  '',
  'm',
  '7',
  'm7',
  'maj7',
  '6',
  'm6',
  '9',
  'add9',
  'sus2',
  'sus4',
  '7sus4',
  'dim',
  'aug',
  'm7b5',
  '5',
];

interface SelectedChord {
  sectionIdx: number;
  lineIdx: number;
  segIdx: number;
  chord: string;
}

interface EditChordOverlayProps {
  selected: SelectedChord | null;
  addTarget: { sectionIdx: number; lineIdx: number; charPos: number } | null;
  pickStampMode?: boolean;
  songChords?: string[];
  songKey?: string;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  isChordOnlyLine?: boolean;
  canStepPrev?: boolean;
  canStepNext?: boolean;
  onMove: (sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') => void;
  onMoveWord?: (sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') => void;
  onStepChord?: (dir: 'prev' | 'next') => void;
  onRename: (sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) => void;
  onDelete: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onInsert: (sectionIdx: number, lineIdx: number, charPos: number, chord: string) => void;
  onInsertAndNext?: (sectionIdx: number, lineIdx: number, charPos: number, chord: string) => void;
  onPickStamp?: (chord: string) => void;
  onClose: () => void;
}

function parseChordParts(chord: string): { root: string; suffix: string; bass: string } {
  const [main, bass = ''] = chord.split('/');
  const m = main.match(/^([A-G][#b]?)(.*)/);
  if (!m) return { root: 'C', suffix: '', bass: '' };
  return { root: m[1], suffix: m[2], bass };
}

/** Normalizes user-typed chord input: strips brackets, removes spaces around '/', and capitalizes root/bass notes. */
function normalizeChordInput(raw: string): string {
  const collapsed = raw
    .replace(/[\[\]{}]/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
  const firstToken = collapsed.split(/\s+/)[0] ?? '';
  if (!firstToken) return '';
  const [main, bass] = firstToken.split('/');
  const capNote = (s: string) =>
    /^[a-g]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const cleanMain = capNote(main);
  const cleanBass = bass ? capNote(bass) : '';
  return cleanBass ? `${cleanMain}/${cleanBass}` : cleanMain;
}

function OverlayInner({
  open,
  closing,
  selected,
  addTarget,
  pickStampMode = false,
  songChords = [],
  songKey,
  canMoveLeft = true,
  canMoveRight = true,
  isChordOnlyLine = false,
  canStepPrev = false,
  canStepNext = false,
  onMove,
  onMoveWord,
  onStepChord,
  onRename,
  onDelete,
  onInsert,
  onInsertAndNext,
  onPickStamp,
  onClose,
}: EditChordOverlayProps & { open: boolean; closing: boolean }) {
  const storeUseFlats = usePlayerStore((s) => s.useFlats);
  const isStampPick = Boolean(pickStampMode && !selected && !addTarget);
  const isAdd = addTarget !== null && selected === null && !isStampPick;
  const isEdit = selected !== null;
  const targetKey = selected
    ? `edit-${selected.sectionIdx}-${selected.lineIdx}-${selected.segIdx}`
    : addTarget
    ? `add-${addTarget.sectionIdx}-${addTarget.lineIdx}-${addTarget.charPos}`
    : isStampPick
    ? 'pick-stamp'
    : '';

  const parsed = selected ? parseChordParts(selected.chord) : { root: 'C', suffix: '', bass: '' };
  const initialFlats = selected ? selected.chord.includes('b') || storeUseFlats : storeUseFlats;

  const [prevTargetKey, setPrevTargetKey] = useState(targetKey);
  const [mode, setMode] = useState<'main' | 'change'>(isAdd || isStampPick ? 'change' : 'main');
  const [useFlats, setUseFlats] = useState(initialFlats);
  const [pickedRoot, setPickedRoot] = useState(parsed.root);
  const [pickedSuffix, setPickedSuffix] = useState(parsed.suffix);
  const [pickedBass, setPickedBass] = useState(parsed.bass);
  const [customInput, setCustomInput] = useState(selected?.chord ?? '');
  const [showBassPicker, setShowBassPicker] = useState(Boolean(parsed.bass));

  if (open && targetKey && targetKey !== prevTargetKey) {
    setPrevTargetKey(targetKey);
    setMode(isAdd || isStampPick ? 'change' : 'main');
    setUseFlats(initialFlats);
    setPickedRoot(parsed.root);
    setPickedSuffix(parsed.suffix);
    setPickedBass(parsed.bass);
    setCustomInput(selected?.chord ?? '');
    setShowBassPicker(Boolean(parsed.bass));
  }

  // Keep latest selected + callbacks in refs so hold-to-repeat and keyboard listeners stay fresh
  const selectedRef = useRef(selected);
  const onMoveRef = useRef(onMove);
  const onMoveWordRef = useRef(onMoveWord);
  const onStepChordRef = useRef(onStepChord);
  useEffect(() => {
    selectedRef.current = selected;
    onMoveRef.current = onMove;
    onMoveWordRef.current = onMoveWord;
    onStepChordRef.current = onStepChord;
  });

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerMovedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const moveLeftRef = useRef<HTMLButtonElement>(null);
  const moveRightRef = useRef<HTMLButtonElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Only trap focus as a blocking modal in `change` mode; in `main` mode allow scrolling & 1-tap chord switching!
  useDialogA11y(open && mode === 'change', onClose, dialogRef);

  const stopHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => stopHold, []);

  // Auto-focus custom chord input ONLY on fine-pointer desktop so touch keyboards never cover the picker grid
  useEffect(() => {
    if (!open) return;
    if (mode === 'change') {
      if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
        requestAnimationFrame(() => {
          customInputRef.current?.focus({ preventScroll: true });
          customInputRef.current?.select();
        });
      }
      return;
    }
    if (mode === 'main') {
      const targetBtn =
        !moveLeftRef.current?.disabled
          ? moveLeftRef.current
          : !moveRightRef.current?.disabled
          ? moveRightRef.current
          : null;
      targetBtn?.focus({ preventScroll: true });
    }
  }, [open, mode, targetKey]);

  const triggerMove = (dir: 'left' | 'right') => {
    const cur = selectedRef.current;
    if (!cur) return;
    onMoveRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
  };

  const triggerWordMove = (dir: 'left' | 'right') => {
    const cur = selectedRef.current;
    if (!cur) return;
    if (onMoveWordRef.current) {
      onMoveWordRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
    } else {
      onMoveRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
    }
  };

  const startHoldMove = (dir: 'left' | 'right') => {
    stopHold();
    triggerMove(dir);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => triggerMove(dir), 95);
    }, 280);
  };

  // Keyboard shortcuts while overlay is open (nudge, word-jump, step prev/next chord, quick-type A-G)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (inInput) return;
      if (mode === 'main' && selectedRef.current) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (e.shiftKey || e.altKey) triggerWordMove('left');
          else triggerMove('left');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (e.shiftKey || e.altKey) triggerWordMove('right');
          else triggerMove('right');
        } else if (e.key === 'Tab' && onStepChordRef.current) {
          e.preventDefault();
          onStepChordRef.current(e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const cur = selectedRef.current;
          onDelete(cur.sectionIdx, cur.lineIdx, cur.segIdx);
          onClose();
        } else if (
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          /^[a-gA-G]$/.test(e.key)
        ) {
          e.preventDefault();
          const letter = e.key.toUpperCase();
          setPickedRoot(letter);
          setPickedSuffix('');
          setPickedBass('');
          setShowBassPicker(false);
          setCustomInput(letter);
          setMode('change');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mode, onClose, onDelete]);

  const noteList = useFlats ? FLAT_NOTES : NOTES;
  const builtChord = `${pickedRoot}${pickedSuffix}${pickedBass ? `/${pickedBass}` : ''}`;
  const quickPickChords =
    songChords.length > 0 ? songChords : getDiatonicChordsForKey(songKey);

  const commitChord = (chordName: string, keepOpen = false) => {
    const clean = normalizeChordInput(chordName);
    if (!clean) return;
    if (isStampPick && onPickStamp) {
      onPickStamp(clean);
      onClose();
      return;
    }
    if (isEdit && selected) {
      onRename(selected.sectionIdx, selected.lineIdx, selected.segIdx, clean);
      if (!keepOpen) onClose();
      return;
    }
    if (isAdd && addTarget) {
      if (keepOpen && onInsertAndNext) {
        onInsertAndNext(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
        setCustomInput('');
        return;
      }
      onInsert(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
      onClose();
    }
  };

  const openChangeMode = () => {
    if (selected) {
      const p = parseChordParts(selected.chord);
      setUseFlats(selected.chord.includes('b') || storeUseFlats);
      setPickedRoot(p.root);
      setPickedSuffix(p.suffix);
      setPickedBass(p.bass);
      setShowBassPicker(Boolean(p.bass));
      setCustomInput(selected.chord);
    } else {
      setUseFlats(storeUseFlats);
      setPickedRoot('C');
      setPickedSuffix('');
      setPickedBass('');
      setShowBassPicker(false);
      setCustomInput('');
    }
    setMode('change');
  };

  const primaryChordLabel = normalizeChordInput(customInput) || builtChord;

  return (
    <>
      {/* Only cover the sheet with a backdrop in full picker `change` mode so `main` mode allows scrolling & 1-tap chord switching */}
      {!closing && mode === 'change' && (
        <button
          type="button"
          aria-label="Fechar editor de acorde"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/20 border-0 p-0 cursor-default"
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={mode === 'change'}
        aria-labelledby="edit-chord-dialog-title"
        inert={closing || undefined}
        className={`${closing ? 'gm3-sheet-exit' : 'gm3-sheet-enter'} fixed bottom-0 inset-x-0 md:bottom-4 md:max-w-xl md:mx-auto z-50 rounded-t-[28px] md:rounded-[28px] bg-[var(--surface-high)] border border-[var(--line-subtle)]/65 max-h-[80vh] overflow-y-auto`}
        style={{ boxShadow: 'var(--shadow-md)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="w-full">
          {mode === 'main' && isEdit && selected && (
            <div key="main" className="gm3-view-enter px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {onStepChord && (
                    <div className="inline-flex items-center gap-1 mr-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={!canStepPrev}
                        onClick={() => onStepChord('prev')}
                        className="gm3-icon-btn w-9 h-9 flex items-center justify-center bg-[var(--surface-control)] text-[var(--ink)] hover:bg-[var(--surface2)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        title="Acorde anterior (Shift+Tab)"
                        aria-label="Acorde anterior"
                      >
                        <ChevronLeftIcon size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={!canStepNext}
                        onClick={() => onStepChord('next')}
                        className="gm3-icon-btn w-9 h-9 flex items-center justify-center bg-[var(--surface-control)] text-[var(--ink)] hover:bg-[var(--surface2)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        title="Próximo acorde (Tab)"
                        aria-label="Próximo acorde"
                      >
                        <ChevronRightIcon size={16} />
                      </button>
                    </div>
                  )}
                  <div id="edit-chord-dialog-title" className="flex items-center gap-2 min-w-0">
                    <span className="field-label hidden sm:inline">Acorde selecionado</span>
                    <span className="text-base font-bold font-mono text-[var(--accent-ink)] truncate">
                      {selected.chord}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="gm3-icon-btn w-10 h-10 flex items-center justify-center bg-[var(--surface-control)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer flex-shrink-0"
                  aria-label="Fechar"
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              {/* Word-jump + fine char nudge row (collapses to 2 buttons on chord-only lines) */}
              <div className="flex items-center gap-2">
                <span className="field-label w-12 flex-shrink-0">Mover</span>
                <div className="flex-1 flex items-center gap-1.5">
                  {!isChordOnlyLine && onMoveWord && (
                    <button
                      type="button"
                      disabled={!canMoveLeft}
                      onClick={() => triggerWordMove('left')}
                      className="flex-1 h-11 rounded-full bg-[var(--surface-control)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center select-none cursor-pointer"
                      title="Pular palavra para a esquerda (Shift+←)"
                      aria-label="Pular acorde uma palavra para a esquerda"
                    >
                      <ChevronsLeftIcon size={18} />
                    </button>
                  )}
                  <button
                    ref={moveLeftRef}
                    type="button"
                    disabled={!canMoveLeft}
                    onPointerDown={(e) => {
                      if (!canMoveLeft) return;
                      e.preventDefault();
                      pointerMovedRef.current = true;
                      startHoldMove('left');
                    }}
                    onPointerUp={stopHold}
                    onPointerLeave={() => {
                      stopHold();
                      pointerMovedRef.current = false;
                    }}
                    onPointerCancel={() => {
                      stopHold();
                      pointerMovedRef.current = false;
                    }}
                    onClick={() => {
                      if (!canMoveLeft) return;
                      if (pointerMovedRef.current) {
                        pointerMovedRef.current = false;
                        return;
                      }
                      triggerMove('left');
                    }}
                    className="flex-1 h-11 rounded-full bg-[var(--surface-control)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center select-none touch-none cursor-pointer"
                    title={isChordOnlyLine ? 'Trocar com acorde à esquerda (←)' : 'Mover 1 letra para esquerda (segure ou ←)'}
                    aria-label="Mover acorde para a esquerda"
                  >
                    <ChevronLeftIcon size={20} />
                  </button>
                  <button
                    ref={moveRightRef}
                    type="button"
                    disabled={!canMoveRight}
                    onPointerDown={(e) => {
                      if (!canMoveRight) return;
                      e.preventDefault();
                      pointerMovedRef.current = true;
                      startHoldMove('right');
                    }}
                    onPointerUp={stopHold}
                    onPointerLeave={() => {
                      stopHold();
                      pointerMovedRef.current = false;
                    }}
                    onPointerCancel={() => {
                      stopHold();
                      pointerMovedRef.current = false;
                    }}
                    onClick={() => {
                      if (!canMoveRight) return;
                      if (pointerMovedRef.current) {
                        pointerMovedRef.current = false;
                        return;
                      }
                      triggerMove('right');
                    }}
                    className="flex-1 h-11 rounded-full bg-[var(--surface-control)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center select-none touch-none cursor-pointer"
                    title={isChordOnlyLine ? 'Trocar com acorde à direita (→)' : 'Mover 1 letra para direita (segure ou →)'}
                    aria-label="Mover acorde para a direita"
                  >
                    <ChevronRightIcon size={20} />
                  </button>
                  {!isChordOnlyLine && onMoveWord && (
                    <button
                      type="button"
                      disabled={!canMoveRight}
                      onClick={() => triggerWordMove('right')}
                      className="flex-1 h-11 rounded-full bg-[var(--surface-control)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center select-none cursor-pointer"
                      title="Pular palavra para a direita (Shift+→)"
                      aria-label="Pular acorde uma palavra para a direita"
                    >
                      <ChevronsRightIcon size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Stay-open 1-tap quick swap with chords already in the song */}
              {quickPickChords.length > 0 && (
                <div className="space-y-1.5">
                  <span className="field-label block">
                    {songChords.length > 0
                      ? 'Troca rápida (toque para atualizar na hora)'
                      : `Sugestões do tom (${songKey || 'C'})`}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {quickPickChords.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={c === selected.chord}
                        onClick={() => commitChord(c, true)}
                        className={`px-3.5 h-11 md:h-10 rounded-full font-mono text-xs font-bold transition-colors cursor-pointer ${
                          c === selected.chord
                            ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                            : 'bg-[var(--surface-control)] text-[var(--ink)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openChangeMode}
                  className="flex-1 h-11 pill-btn pill-btn-tonal text-sm"
                >
                  Outro acorde…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
                    onClose();
                  }}
                  className="flex-1 h-11 pill-btn bg-[var(--rec-dim)] text-[var(--on-rec-container)] hover:bg-[var(--rec)] hover:text-[var(--on-rec)] text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          )}

          {mode === 'change' && (
            <div key="change" className="gm3-view-enter px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span id="edit-chord-dialog-title" className="text-sm font-semibold text-[var(--ink)]">
                  {isStampPick
                    ? 'Escolher acorde'
                    : isAdd
                    ? 'Inserir acorde'
                    : 'Trocar acorde'}
                  :{' '}
                  <span className="font-mono font-bold text-[var(--accent-ink)]">
                    {primaryChordLabel}
                  </span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={useFlats}
                    onClick={() => setUseFlats((f) => !f)}
                    className={`pill-btn px-3 h-10 text-xs font-mono ${
                      useFlats ? 'pill-btn-tonal' : 'bg-[var(--surface-control)]'
                    }`}
                  >
                    {useFlats ? '♭ Bemóis' : '♯ Sustenidos'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="gm3-icon-btn w-10 h-10 flex items-center justify-center bg-[var(--surface-control)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    aria-label="Fechar"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              </div>

              {/* Quick 1-tap chords from this song (or diatonic chords of song key when empty) */}
              {quickPickChords.length > 0 && (
                <div className="space-y-1.5">
                  <span className="field-label block">
                    {songChords.length > 0
                      ? 'Acordes desta música'
                      : `Acordes do tom (${songKey || 'C'})`}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {quickPickChords.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => commitChord(c, false)}
                        className="px-3.5 h-11 md:h-10 rounded-full font-mono text-xs font-bold bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors cursor-pointer"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct free-text input (Enter submits; bottom primary pill is the single submit CTA) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitChord(customInput.trim() || builtChord, false);
                }}
              >
                <input
                  ref={customInputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  aria-label="Digitar acorde personalizado"
                  placeholder="Digite direto e aperte Enter (ex.: D/F#, Cmaj7, Bm7b5)…"
                  className="studio-input w-full px-3.5 py-2.5 text-base lg:text-sm font-mono bg-[var(--surface-control)]"
                />
              </form>

              {/* Root note grid */}
              <div className="grid grid-cols-6 gap-1.5">
                {noteList.map((note) => (
                  <button
                    key={note}
                    type="button"
                    aria-pressed={pickedRoot === note}
                    onClick={() => {
                      setPickedRoot(note);
                      setCustomInput(`${note}${pickedSuffix}${pickedBass ? `/${pickedBass}` : ''}`);
                    }}
                    className={`h-11 md:h-10 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer ${
                      pickedRoot === note
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--surface-control)] text-[var(--ink)] hover:bg-[var(--surface2)]'
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>

              {/* Suffix chips */}
              <div className="flex flex-wrap gap-1.5">
                {SUFFIXES.map((suf) => (
                  <button
                    key={suf || 'maj'}
                    type="button"
                    aria-pressed={pickedSuffix === suf}
                    onClick={() => {
                      setPickedSuffix(suf);
                      setCustomInput(`${pickedRoot}${suf}${pickedBass ? `/${pickedBass}` : ''}`);
                    }}
                    className={`px-3.5 h-10 rounded-full text-xs font-mono font-bold transition-colors cursor-pointer ${
                      pickedSuffix === suf
                        ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                        : 'bg-[var(--surface-control)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {suf || 'maior'}
                  </button>
                ))}
              </div>

              {/* Slash-bass toggle + picker */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={showBassPicker}
                    onClick={() => setShowBassPicker((v) => !v)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-1 font-mono text-xs text-[var(--accent-ink)] hover:underline cursor-pointer"
                  >
                    <ChevronDownIcon size={14} className="gm3-chevron" />
                    {showBassPicker ? 'Baixo invertido (/nota)' : 'Baixo invertido (/F#, /G, /B…)'}
                    {pickedBass ? ` · /${pickedBass}` : ''}
                  </button>
                  {pickedBass && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickedBass('');
                        setCustomInput(`${pickedRoot}${pickedSuffix}`);
                      }}
                      className="min-h-[44px] px-2 font-mono text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      Limpar baixo
                    </button>
                  )}
                </div>
                <div
                  className="gm3-collapsible"
                  data-compact-slot="true"
                  data-collapsed={!showBassPicker ? 'true' : undefined}
                  aria-hidden={!showBassPicker || undefined}
                  inert={!showBassPicker || undefined}
                >
                  <div className="gm3-collapsible-inner">
                    <div className="grid grid-cols-6 gap-1.5 pt-1">
                      {noteList.map((bass) => (
                        <button
                          key={`bass-${bass}`}
                          type="button"
                          aria-pressed={pickedBass === bass}
                          onClick={() => {
                            const nextBass = pickedBass === bass ? '' : bass;
                            setPickedBass(nextBass);
                            setCustomInput(`${pickedRoot}${pickedSuffix}${nextBass ? `/${nextBass}` : ''}`);
                          }}
                          className={`pill-btn h-10 text-xs font-bold font-mono ${
                            pickedBass === bass
                              ? 'pill-btn-tonal'
                              : 'bg-[var(--surface-control)] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--ink)]'
                          }`}
                        >
                          /{bass}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer: single primary CTA + contextual secondary (Voltar or + Próximo chain-insert) */}
              <div className="flex gap-2 pt-1">
                {isEdit && (
                  <button
                    type="button"
                    onClick={() => setMode('main')}
                    className="flex-1 h-11 pill-btn bg-[var(--surface-control)] text-sm"
                  >
                    Voltar
                  </button>
                )}
                {isAdd && onInsertAndNext && (
                  <button
                    type="button"
                    onClick={() => commitChord(customInput.trim() || builtChord, true)}
                    className="flex-1 h-11 pill-btn pill-btn-tonal text-sm"
                    title="Inserir este acorde e continuar inserindo o próximo sem fechar"
                  >
                    <PlusIcon size={15} />
                    Próximo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => commitChord(customInput.trim() || builtChord, false)}
                  className="flex-1 h-11 pill-btn pill-btn-primary text-sm"
                >
                  {isStampPick
                    ? `Usar ${primaryChordLabel}`
                    : isAdd
                    ? `Inserir ${primaryChordLabel}`
                    : `Aplicar ${primaryChordLabel}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function EditChordOverlay(props: EditChordOverlayProps) {
  const isOpen = Boolean(props.selected || props.addTarget || props.pickStampMode);
  const { mounted, closing } = useAnimatedPresence(isOpen, 240);
  const targetKey = props.selected
    ? `e:${props.selected.sectionIdx}:${props.selected.lineIdx}:${props.selected.segIdx}:${props.selected.chord}`
    : props.addTarget
    ? `a:${props.addTarget.sectionIdx}:${props.addTarget.lineIdx}:${props.addTarget.charPos}`
    : props.pickStampMode
    ? 's:pick'
    : null;
  const retained = useRetainedValue(
    isOpen
      ? {
          selected: props.selected,
          addTarget: props.addTarget,
          pickStampMode: props.pickStampMode,
        }
      : null,
    targetKey
  );

  if (!mounted || !retained) return null;

  return (
    <OverlayInner
      {...props}
      open={isOpen}
      closing={closing}
      selected={retained.selected}
      addTarget={retained.addTarget}
      pickStampMode={retained.pickStampMode}
    />
  );
}
