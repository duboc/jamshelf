import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDiatonicChordsForKey, parseLine } from '@/lib/utils/music';
import { getChordMoveBounds } from '@/lib/utils/edit-chordpro';
import {
  AuroraButton,
  AuroraChip,
  AuroraCollapsible,
  AuroraDialog,
  UiIcon,
} from '../aurora/primitives';

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
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

function parseChordParts(chord: string): { root: string; suffix: string; bass: string } {
  const [main, bass = ''] = chord.split('/');
  const m = main.match(/^([A-G][#b]?)(.*)/);
  if (!m) return { root: 'C', suffix: '', bass: '' };
  return { root: m[1], suffix: m[2], bass };
}

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

export interface SelectedChordTarget {
  sectionIdx: number;
  lineIdx: number;
  segIdx: number;
  chord: string;
}

export interface AddChordTarget {
  sectionIdx: number;
  lineIdx: number;
  charPos: number;
}

export function VisualChordEditModal({
  selected,
  addTarget,
  pickStampMode = false,
  activeLine,
  songChords = [],
  songKey,
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
}: {
  selected: SelectedChordTarget | null;
  addTarget: AddChordTarget | null;
  pickStampMode?: boolean;
  activeLine?: string;
  songChords?: string[];
  songKey?: string;
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
}) {
  const isStampPick = Boolean(pickStampMode && !selected && !addTarget);
  const open = Boolean(selected || addTarget || isStampPick);
  const isAdd = Boolean(addTarget && !selected && !isStampPick);
  const initial = selected ? parseChordParts(selected.chord) : { root: 'C', suffix: '', bass: '' };
  const quickGroupId = useId();
  const rootGroupId = useId();
  const suffixGroupId = useId();
  const bassGroupId = useId();

  const [useFlats, setUseFlats] = useState(initial.root.includes('b'));
  const [root, setRoot] = useState(initial.root);
  const [suffix, setSuffix] = useState(initial.suffix);
  const [bass, setBass] = useState(initial.bass);
  const [bassOpen, setBassOpen] = useState(Boolean(initial.bass));
  const [custom, setCustom] = useState(selected?.chord ?? '');
  const [liveStatus, setLiveStatus] = useState('');
  const [nudge, setNudge] = useState<{ dir: 'left' | 'right' | 'swap'; seq: number } | null>(null);

  const moveCountRef = useRef(0);
  const prevTargetKeyRef = useRef('');
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const pointerHandledRef = useRef(false);
  const selectedRef = useRef(selected);
  const onMoveRef = useRef(onMove);
  const onMoveWordRef = useRef(onMoveWord);
  const onStepChordRef = useRef(onStepChord);
  selectedRef.current = selected;
  onMoveRef.current = onMove;
  onMoveWordRef.current = onMoveWord;
  onStepChordRef.current = onStepChord;

  const stopHold = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => stopHold, []);

  useEffect(() => {
    const targetKey = selected
      ? `edit:${selected.sectionIdx}:${selected.lineIdx}:${selected.segIdx}:${selected.chord}`
      : addTarget
        ? `add:${addTarget.sectionIdx}:${addTarget.lineIdx}:${addTarget.charPos}`
        : isStampPick
          ? 'stamp-pick'
          : '';
    if (targetKey === prevTargetKeyRef.current) return;
    prevTargetKeyRef.current = targetKey;
    const p = selected ? parseChordParts(selected.chord) : { root: 'C', suffix: '', bass: '' };
    setRoot(p.root);
    setSuffix(p.suffix);
    setBass(p.bass);
    setBassOpen(Boolean(p.bass));
    setUseFlats(p.root.includes('b'));
    setCustom(selected?.chord ?? '');
  }, [
    selected?.sectionIdx,
    selected?.lineIdx,
    selected?.segIdx,
    selected?.chord,
    addTarget?.sectionIdx,
    addTarget?.lineIdx,
    addTarget?.charPos,
    isStampPick,
  ]);

  const parsedPreview = useMemo(
    () => (activeLine !== undefined ? parseLine(activeLine) : []),
    [activeLine]
  );

  const { canMoveLeft, canMoveRight, isChordOnlyLine } = useMemo(() => {
    if (!selected || activeLine === undefined) {
      return { canMoveLeft: false, canMoveRight: false, isChordOnlyLine: false };
    }
    const bounds = getChordMoveBounds(activeLine, selected.segIdx);
    const hasLyrics = parsedPreview.some((s) => s.text.trim().length > 0);
    return {
      canMoveLeft: bounds.canMoveLeft,
      canMoveRight: bounds.canMoveRight,
      isChordOnlyLine: !hasLyrics,
    };
  }, [selected, activeLine, parsedPreview]);

  const triggerMove = (dir: 'left' | 'right') => {
    const cur = selectedRef.current;
    if (!cur) return;
    moveCountRef.current += 1;
    setNudge((prev) => ({ dir, seq: (prev?.seq ?? 0) + 1 }));
    onMoveRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
    setLiveStatus(
      `Acorde ${cur.chord} movido para a ${dir === 'left' ? 'esquerda' : 'direita'} (ajuste ${moveCountRef.current})`
    );
  };

  const triggerWordMove = (dir: 'left' | 'right') => {
    const cur = selectedRef.current;
    if (!cur) return;
    moveCountRef.current += 1;
    setNudge((prev) => ({ dir, seq: (prev?.seq ?? 0) + 1 }));
    if (onMoveWordRef.current) {
      onMoveWordRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
    } else {
      onMoveRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
    }
    setLiveStatus(
      `Acorde ${cur.chord} pulou palavra para a ${dir === 'left' ? 'esquerda' : 'direita'}`
    );
  };

  const triggerStepChord = (dir: 'prev' | 'next') => {
    if (!onStepChordRef.current) return;
    setNudge((prev) => ({ dir: dir === 'prev' ? 'left' : 'right', seq: (prev?.seq ?? 0) + 1 }));
    onStepChordRef.current(dir);
  };

  const startHoldMove = (dir: 'left' | 'right') => {
    stopHold();
    triggerMove(dir);
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => triggerMove(dir), 95);
    }, 280);
  };

  useEffect(() => {
    if (!open || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey || e.altKey) triggerWordMove('left');
        else if (canMoveLeft) triggerMove('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey || e.altKey) triggerWordMove('right');
        else if (canMoveRight) triggerMove('right');
      } else if ((e.key === '[' || e.key === 'PageUp') && onStepChordRef.current) {
        if (canStepPrev) {
          e.preventDefault();
          triggerStepChord('prev');
        }
      } else if ((e.key === ']' || e.key === 'PageDown') && onStepChordRef.current) {
        if (canStepNext) {
          e.preventDefault();
          triggerStepChord('next');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
        onClose();
      } else if (!e.altKey && /^[a-gA-G]$/.test(e.key)) {
        e.preventDefault();
        const letter = e.key.toUpperCase();
        setRoot(letter);
        setSuffix('');
        setBass('');
        setBassOpen(false);
        setCustom(letter);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    open,
    selected,
    canMoveLeft,
    canMoveRight,
    canStepPrev,
    canStepNext,
    onDelete,
    onClose,
  ]);

  const composed = `${root}${suffix}${bass ? `/${bass}` : ''}`;
  const previewChordLabel = normalizeChordInput(custom) || composed;
  const notes = useFlats ? FLAT_NOTES : SHARP_NOTES;
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
    if (selected) {
      setNudge((prev) => ({ dir: 'swap', seq: (prev?.seq ?? 0) + 1 }));
      onRename(selected.sectionIdx, selected.lineIdx, selected.segIdx, clean);
      if (!keepOpen) onClose();
      return;
    }
    if (addTarget) {
      if (keepOpen && onInsertAndNext) {
        onInsertAndNext(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
        setCustom('');
        return;
      }
      onInsert(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
      onClose();
    }
  };

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title={
        isStampPick
          ? 'Escolher acorde para carimbar'
          : isAdd
            ? 'Inserir acorde na linha'
            : `Editar acorde ${selected?.chord ?? ''}`
      }
      subtitle={
        isStampPick
          ? 'Escolha ou digite o acorde que ficará ativo na barra de carimbo'
          : isAdd
            ? 'Toque num acorde da música ou monte qualquer cifra abaixo'
            : 'Mova pela palavra (Shift+←/→), ajuste letra a letra (←/→) ou alterne com [ e ]'
      }
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <div role="status" aria-live="polite" className="sr-only">
          {liveStatus}
        </div>

        {/* Prev / Next chord stepper when editing */}
        {selected && onStepChord && (
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5">
              <AuroraButton
                color="outlined"
                icon="chevron_left"
                disabled={!canStepPrev}
                onClick={() => triggerStepChord('prev')}
                title="Acorde anterior ([ ou PageUp)"
                className="h-9 min-h-[38px] px-3"
              >
                Anterior
              </AuroraButton>
              <AuroraButton
                color="outlined"
                trailingIcon="chevron_right"
                disabled={!canStepNext}
                onClick={() => triggerStepChord('next')}
                title="Próximo acorde (] ou PageDown)"
                className="h-9 min-h-[38px] px-3"
              >
                Próximo
              </AuroraButton>
            </div>
            <span className="font-mono typescale-label-lg text-primary px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container">
              {selected.chord}
            </span>
          </div>
        )}

        {/* Live lyric line preview */}
        {activeLine !== undefined && !isStampPick && (
          <div className="rounded-2xl bg-surface-container p-4 space-y-1">
            <div className="typescale-label-sm text-on-surface-variant">Prévia da linha</div>
            <div className="pt-6 leading-[1.45] typescale-body-lg">
              {(() => {
                let offset = 0;
                let insertedMarker = false;
                return parsedPreview.map((seg, idx) => {
                  const segStart = offset;
                  const segEnd = offset + seg.text.length;
                  offset = segEnd;
                  const isSelectedSeg = selected && selected.segIdx === idx;

                  if (
                    isAdd &&
                    addTarget &&
                    !insertedMarker &&
                    addTarget.charPos >= segStart &&
                    addTarget.charPos <= segEnd
                  ) {
                    insertedMarker = true;
                    const splitAt = Math.max(0, addTarget.charPos - segStart);
                    const before = seg.text.slice(0, splitAt);
                    const after = seg.text.slice(splitAt);
                    return (
                      <span key={idx}>
                        {seg.chord ? (
                          <span className="relative inline-block leading-none">
                            <span className="font-mono font-bold text-xs absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container">
                              {seg.chord}
                            </span>
                            <span className="text-on-surface whitespace-pre-wrap leading-[1.45]">
                              {before || '\u00A0'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-on-surface whitespace-pre-wrap">{before}</span>
                        )}
                        <span className="relative inline-block leading-none">
                          <span className="font-mono font-bold text-xs absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap px-1.5 py-0.5 rounded bg-primary text-on-primary">
                            + {previewChordLabel}
                          </span>
                          <span className="text-on-surface whitespace-pre-wrap leading-[1.45] underline decoration-primary decoration-2 underline-offset-4">
                            {after || '\u00A0'}
                          </span>
                        </span>
                      </span>
                    );
                  }

                  if (!seg.chord) {
                    return (
                      <span key={idx} className="text-on-surface whitespace-pre-wrap">
                        {seg.text}
                      </span>
                    );
                  }
                  return (
                    <span key={idx} className="relative inline-block leading-none">
                      <span
                        key={isSelectedSeg && nudge ? `nudge-${nudge.seq}` : 'static'}
                        data-nudge={isSelectedSeg && nudge ? nudge.dir : undefined}
                        className={`font-mono font-bold text-xs absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap px-1.5 py-0.5 rounded ${
                          isSelectedSeg
                            ? 'chord-nudge bg-primary text-on-primary'
                            : 'bg-primary-container text-on-primary-container'
                        }`}
                      >
                        {isSelectedSeg ? previewChordLabel : seg.chord}
                      </span>
                      <span className="text-on-surface whitespace-pre-wrap leading-[1.45]">
                        {seg.text || '\u00A0'}
                      </span>
                    </span>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Word-jump + hold-to-repeat fine move row + Delete */}
        {selected && (
          <div className="rounded-2xl bg-surface-container-low p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              {!isChordOnlyLine && onMoveWord && (
                <button
                  type="button"
                  disabled={!canMoveLeft}
                  onClick={() => triggerWordMove('left')}
                  aria-label="Pular acorde uma palavra para a esquerda"
                  title="Pular palavra à esquerda (Shift+←)"
                  className="stage-btn stage-btn-tonal flex-1 min-h-[42px] px-2"
                >
                  <UiIcon name="keyboard_double_arrow_left" size={20} />
                </button>
              )}
              <button
                type="button"
                disabled={!canMoveLeft}
                onPointerDown={(e) => {
                  if (!canMoveLeft) return;
                  e.preventDefault();
                  pointerHandledRef.current = true;
                  startHoldMove('left');
                }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={() => {
                  pointerHandledRef.current = false;
                  stopHold();
                }}
                onClick={() => {
                  if (pointerHandledRef.current) {
                    pointerHandledRef.current = false;
                    return;
                  }
                  if (canMoveLeft) triggerMove('left');
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && canMoveLeft) {
                    e.preventDefault();
                    triggerMove('left');
                  }
                }}
                aria-label="Mover acorde para a esquerda"
                title={
                  isChordOnlyLine
                    ? 'Trocar com acorde à esquerda (←)'
                    : 'Mover 1 caractere à esquerda (segure ou ←)'
                }
                className="stage-btn stage-btn-tonal flex-1 min-h-[42px] px-2 touch-none select-none"
              >
                <UiIcon name="chevron_left" size={20} />
              </button>
              <button
                type="button"
                disabled={!canMoveRight}
                onPointerDown={(e) => {
                  if (!canMoveRight) return;
                  e.preventDefault();
                  pointerHandledRef.current = true;
                  startHoldMove('right');
                }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={() => {
                  pointerHandledRef.current = false;
                  stopHold();
                }}
                onClick={() => {
                  if (pointerHandledRef.current) {
                    pointerHandledRef.current = false;
                    return;
                  }
                  if (canMoveRight) triggerMove('right');
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && canMoveRight) {
                    e.preventDefault();
                    triggerMove('right');
                  }
                }}
                aria-label="Mover acorde para a direita"
                title={
                  isChordOnlyLine
                    ? 'Trocar com acorde à direita (→)'
                    : 'Mover 1 caractere à direita (segure ou →)'
                }
                className="stage-btn stage-btn-tonal flex-1 min-h-[42px] px-2 touch-none select-none"
              >
                <UiIcon name="chevron_right" size={20} />
              </button>
              {!isChordOnlyLine && onMoveWord && (
                <button
                  type="button"
                  disabled={!canMoveRight}
                  onClick={() => triggerWordMove('right')}
                  aria-label="Pular acorde uma palavra para a direita"
                  title="Pular palavra à direita (Shift+→)"
                  className="stage-btn stage-btn-tonal flex-1 min-h-[42px] px-2"
                >
                  <UiIcon name="keyboard_double_arrow_right" size={20} />
                </button>
              )}
            </div>

            <AuroraButton
              color="danger"
              icon="delete"
              onClick={() => {
                onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
                onClose();
              }}
            >
              Remover
            </AuroraButton>
          </div>
        )}

        {/* Quick 1-tap swap (stays open when editing so musicians can audition/step fast) */}
        {quickPickChords.length > 0 && (
          <div role="group" aria-labelledby={quickGroupId} className="space-y-1.5">
            <div id={quickGroupId} className="typescale-label-sm text-on-surface-variant">
              {songChords.length > 0
                ? selected
                  ? 'Troca rápida (toque para atualizar na hora)'
                  : 'Acordes já usados nesta música'
                : `Sugestões do tom (${songKey || 'C'})`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickPickChords.slice(0, 14).map((c) => (
                <AuroraChip
                  key={c}
                  selected={selected?.chord === c}
                  onClick={() => commitChord(c, Boolean(selected))}
                >
                  <span className="font-mono">{c}</span>
                </AuroraChip>
              ))}
            </div>
          </div>
        )}

        <div role="group" aria-labelledby={rootGroupId} className="space-y-2">
          <div className="flex items-center justify-between">
            <span id={rootGroupId} className="typescale-label-sm text-on-surface-variant">
              Nota fundamental
            </span>
            <AuroraButton color="text" onClick={() => setUseFlats((v) => !v)}>
              {useFlats ? 'Mostrar sustenidos (♯)' : 'Mostrar bemóis (♭)'}
            </AuroraButton>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {notes.map((n) => (
              <AuroraChip
                key={n}
                selected={root === n}
                onClick={() => {
                  setRoot(n);
                  setCustom(`${n}${suffix}${bass ? `/${bass}` : ''}`);
                }}
                className="justify-center"
              >
                <span className="font-mono">{n}</span>
              </AuroraChip>
            ))}
          </div>
        </div>

        <div role="group" aria-labelledby={suffixGroupId} className="space-y-2">
          <span id={suffixGroupId} className="typescale-label-sm text-on-surface-variant block">
            Qualidade / extensão
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SUFFIXES.map((sf) => (
              <AuroraChip
                key={sf || 'maj'}
                selected={suffix === sf}
                onClick={() => {
                  setSuffix(sf);
                  setCustom(`${root}${sf}${bass ? `/${bass}` : ''}`);
                }}
              >
                <span className="font-mono">{sf || 'Maior'}</span>
              </AuroraChip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span id={bassGroupId} className="typescale-label-sm text-on-surface-variant">
              Baixo invertido (opcional){bass ? `: /${bass}` : ''}
            </span>
            <AuroraButton
              color="text"
              aria-expanded={bassOpen}
              onClick={() => setBassOpen((v) => !v)}
            >
              {bassOpen ? 'Ocultar baixo' : 'Escolher baixo'}
            </AuroraButton>
          </div>
          <AuroraCollapsible open={bassOpen}>
            <div role="group" aria-labelledby={bassGroupId} className="flex flex-wrap gap-1.5 pt-1">
              <AuroraChip
                selected={!bass}
                onClick={() => {
                  setBass('');
                  setCustom(`${root}${suffix}`);
                }}
              >
                Sem baixo
              </AuroraChip>
              {notes.map((n) => (
                <AuroraChip
                  key={`bass-${n}`}
                  selected={bass === n}
                  onClick={() => {
                    setBass(n);
                    setCustom(`${root}${suffix}/${n}`);
                  }}
                >
                  <span className="font-mono">/{n}</span>
                </AuroraChip>
              ))}
            </div>
          </AuroraCollapsible>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitChord(custom || composed, false);
          }}
          className="sticky bottom-0 bg-surface-container-low -mx-6 -mb-6 px-6 pt-3 pb-4 flex flex-wrap items-center gap-2 border-t border-outline-variant"
        >
          <label htmlFor="custom-chord-input" className="sr-only">
            Cifra personalizada
          </label>
          <input
            id="custom-chord-input"
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={composed}
            className="stage-field font-mono text-base lg:text-sm flex-1 min-w-[140px]"
          />
          {isAdd && onInsertAndNext && (
            <AuroraButton
              color="tonal"
              icon="add"
              onClick={() => commitChord(custom || composed, true)}
              title="Inserir este acorde e continuar inserindo o próximo sem fechar"
            >
              Próximo
            </AuroraButton>
          )}
          <AuroraButton type="submit" color="filled" icon="check">
            {isStampPick
              ? `Usar ${previewChordLabel}`
              : isAdd
                ? `Inserir ${previewChordLabel}`
                : `Aplicar ${previewChordLabel}`}
          </AuroraButton>
        </form>
      </div>
    </AuroraDialog>
  );
}
