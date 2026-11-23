import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseLine } from '@/lib/utils/music';
import { AuroraButton, AuroraChip, AuroraCollapsible, AuroraDialog } from '../aurora/primitives';

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
  activeLine,
  songChords = [],
  onMove,
  onRename,
  onDelete,
  onInsert,
  onClose,
}: {
  selected: SelectedChordTarget | null;
  addTarget: AddChordTarget | null;
  activeLine?: string;
  songChords?: string[];
  onMove: (sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') => void;
  onRename: (sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) => void;
  onDelete: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onInsert: (sectionIdx: number, lineIdx: number, charPos: number, chord: string) => void;
  onClose: () => void;
}) {
  const open = Boolean(selected || addTarget);
  const isAdd = Boolean(addTarget && !selected);
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
  const moveCountRef = useRef(0);
  const prevTargetKeyRef = useRef('');

  useEffect(() => {
    const targetKey = selected
      ? `edit:${selected.sectionIdx}:${selected.lineIdx}:${selected.chord}`
      : addTarget
        ? `add:${addTarget.sectionIdx}:${addTarget.lineIdx}:${addTarget.charPos}`
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
    selected?.chord,
    addTarget?.sectionIdx,
    addTarget?.lineIdx,
    addTarget?.charPos,
  ]);

  const parsedPreview = useMemo(() => (activeLine !== undefined ? parseLine(activeLine) : []), [activeLine]);

  const { canMoveLeft, canMoveRight } = useMemo(() => {
    if (!selected || activeLine === undefined) return { canMoveLeft: false, canMoveRight: false };
    const segs = parsedPreview;
    const idx = selected.segIdx;
    if (idx < 0 || idx >= segs.length) return { canMoveLeft: false, canMoveRight: false };
    const prevText = segs.slice(0, idx).map((s) => s.text).join('');
    const currText = segs[idx]?.text ?? '';
    const afterText = segs.slice(idx + 1).map((s) => s.text).join('');
    return {
      canMoveLeft: prevText.length > 0,
      canMoveRight: currText.length > 0 || afterText.length > 0,
    };
  }, [selected, activeLine, parsedPreview]);

  const triggerMove = (dir: 'left' | 'right') => {
    if (!selected) return;
    if (dir === 'left' && !canMoveLeft) return;
    if (dir === 'right' && !canMoveRight) return;
    moveCountRef.current += 1;
    onMove(selected.sectionIdx, selected.lineIdx, selected.segIdx, dir);
    setLiveStatus(
      `Acorde ${custom.trim() || selected.chord} movido para a ${dir === 'left' ? 'esquerda' : 'direita'} (ajuste ${moveCountRef.current})`
    );
  };

  useEffect(() => {
    if (!open || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        triggerMove('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        triggerMove('right');
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selected, canMoveLeft, canMoveRight, custom, onMove, onDelete, onClose]);

  const composed = `${root}${suffix}${bass ? `/${bass}` : ''}`;
  const previewChordLabel = custom.trim() || composed;
  const notes = useFlats ? FLAT_NOTES : SHARP_NOTES;

  const commitChord = (chordName: string) => {
    const clean = chordName.trim();
    if (!clean) return;
    if (selected) {
      onRename(selected.sectionIdx, selected.lineIdx, selected.segIdx, clean);
      onClose();
    } else if (addTarget) {
      onInsert(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
      onClose();
    }
  };

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title={isAdd ? 'Inserir acorde na linha' : `Editar acorde ${selected?.chord ?? ''}`}
      subtitle={
        isAdd
          ? 'Escolha um acorde da música ou monte qualquer cifra abaixo'
          : 'Mova pela letra (← / →), troque a cifra ou remova (Delete)'
      }
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        <div role="status" aria-live="polite" className="sr-only">
          {liveStatus}
        </div>
        {activeLine !== undefined && (
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

                  if (isAdd && addTarget && !insertedMarker && addTarget.charPos >= segStart && addTarget.charPos <= segEnd) {
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
                        className={`font-mono font-bold text-xs absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap px-1.5 py-0.5 rounded ${
                          isSelectedSeg
                            ? 'bg-primary text-on-primary'
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

        {selected && (
          <div className="rounded-2xl bg-surface-container-low p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AuroraButton
                color="tonal"
                icon="arrow_back"
                disabled={!canMoveLeft}
                onClick={() => triggerMove('left')}
              >
                Mover esq.
              </AuroraButton>
              <AuroraButton
                color="tonal"
                trailingIcon="arrow_forward"
                disabled={!canMoveRight}
                onClick={() => triggerMove('right')}
              >
                Mover dir.
              </AuroraButton>
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

        {songChords.length > 0 && (
          <div role="group" aria-labelledby={quickGroupId} className="space-y-1.5">
            <div id={quickGroupId} className="typescale-label-sm text-on-surface-variant">
              Acordes já usados nesta música
            </div>
            <div className="flex flex-wrap gap-1.5">
              {songChords.slice(0, 12).map((c) => (
                <AuroraChip
                  key={c}
                  selected={selected?.chord === c}
                  onClick={() => commitChord(c)}
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
            <AuroraButton
              color="text"
              onClick={() => setUseFlats((v) => !v)}
            >
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
            commitChord(custom || composed);
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
            className="stage-field font-mono flex-1 min-w-[140px]"
          />
          <AuroraButton type="submit" color="filled" icon="check">
            {isAdd ? `Inserir ${previewChordLabel}` : `Aplicar ${previewChordLabel}`}
          </AuroraButton>
        </form>
      </div>
    </AuroraDialog>
  );
}
