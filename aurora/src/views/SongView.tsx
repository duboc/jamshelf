import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { diffLines } from 'diff';
import type { ParsedSong, Section } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import { useLiveSession, type LiveScrollState } from '@/lib/stores/live-session-store';
import {
  extractChords,
  isInstrumentalSection,
  isMinorKey,
  lineHasLyrics,
  parseLine,
  transposeChord,
  transposeSong,
} from '@/lib/utils/music';
import {
  addSongSection,
  deleteChord,
  duplicateSongSection,
  insertChord,
  moveChordWithIndex,
  moveSongSection,
  removeSongSection,
  renameChord,
  renameSongSection,
} from '@/lib/utils/edit-chordpro';
import {
  formatDuration,
  parseChordPro,
  removeChordProMeta,
  serializeMarks,
  songToChordPro,
} from '@/lib/utils/chordpro-parser';
import { computeEffectiveDurationSec, hasUsableMarks } from '@/lib/utils/autoscroll';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import { AuroraEnergy, useEnergyTask, usePrefersReducedMotion } from '../aurora/energy';
import {
  AuroraButton,
  AuroraChip,
  AuroraCollapsible,
  AuroraDialog,
  AuroraIconButton,
  AuroraProcessingIndicator,
  AuroraSegmented,
  AuroraSheet,
  AuroraThinkingSteps,
  GsIcon,
  copyText,
  useModalA11y,
} from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { applyColorScheme } from '../components/AuroraShell';
import { ChordInspectorContent, ChordInspectorSheet } from '../components/ChordDiagrams';
import { MetronomeControl, VisualBeatStrip } from '../components/MetronomeControl';
import {
  CalibrationBanner,
  FocusModeChrome,
  SongMetaDialog,
  SpotifyPanel,
  type SpotifyTrack,
} from '../components/SongExtras';
import {
  VisualChordEditModal,
  type AddChordTarget,
  type SelectedChordTarget,
} from '../components/VisualChordEditModal';
import { AuroraLink, navigate, useRoute } from '../router';

function isEditableEl(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function CountInModal({
  bpm,
  beats,
  onDone,
}: {
  bpm: number;
  beats: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const reduced = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useModalA11y(true, dialogRef, () => doneRef.current());

  useEffect(() => {
    const msPerBeat = Math.round(60000 / Math.max(40, Math.min(240, bpm)));
    let current = 1;
    const playClick = (accent: boolean) => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = accent ? 'triangle' : 'sine';
        osc.frequency.value = accent ? 1120 : 820;
        gain.gain.setValueAtTime(accent ? 0.3 : 0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.065);
        window.setTimeout(() => void ctx.close(), 120);
      } catch {
        // ignore audio errors
      }
    };

    playClick(true);
    const id = window.setInterval(() => {
      current += 1;
      if (current > beats) {
        window.clearInterval(id);
        doneRef.current();
        return;
      }
      setStep(current);
      playClick(false);
    }, msPerBeat);

    return () => window.clearInterval(id);
  }, [bpm, beats]);

  if (typeof document === 'undefined') return null;

  const safeStatic = reduced || bpm > 170;

  return createPortal(
    <div
      data-motion-scheme="standard"
      className="fixed inset-0 z-50 stage-scrim flex items-center justify-center p-6"
      onClick={() => doneRef.current()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Contagem de ${beats} tempos a ${bpm} BPM`}
        tabIndex={-1}
        className="stage-dialog focus:outline-none px-12 py-10 text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="typescale-label-lg text-on-surface-variant">Contagem ({bpm} BPM)</div>
        <div className="typescale-hero-count text-primary" aria-live="polite">
          {step}
        </div>
        {!safeStatic && (
          <div className="flex items-center justify-center gap-3" aria-hidden="true">
            {Array.from({ length: beats }).map((_, idx) => (
              <span
                key={idx}
                data-active={idx + 1 === step ? (idx === 0 ? 'downbeat' : 'beat') : undefined}
                className={`beat-dot ${
                  idx + 1 === step ? 'bg-primary' : 'bg-outline'
                }`}
              />
            ))}
          </div>
        )}
        <div className="pt-1">
          <AuroraButton color="outlined" onClick={() => doneRef.current()}>
            Cancelar
          </AuroraButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EnhanceDialog({
  open,
  songId,
  onClose,
  onApplied,
}: {
  open: boolean;
  songId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const updateEntry = useSongStore((s) => s.updateEntry);
  const energy = useEnergyTask();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [enhancedText, setEnhancedText] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setOriginalText('');
    setEnhancedText('');

    void energy.run(async (set) => {
      set('processing');
      try {
        const res = await fetch(`/api/songs/${songId}/enhance`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha na revisão com IA.');
        if (cancelled) return;
        setOriginalText(data.originalText);
        setEnhancedText(data.enhancedText);
        set('responding');
        await new Promise((r) => window.setTimeout(r, 500));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao consultar IA.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, songId, energy.run]);

  const changes = useMemo(
    () => (originalText && enhancedText ? diffLines(originalText, enhancedText) : []),
    [originalText, enhancedText]
  );

  const handleApply = async () => {
    setApplying(true);
    try {
      await fetch(`/api/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText }),
      });
      updateEntry(songId, enhancedText);
      onApplied();
      onClose();
    } catch {
      setError('Não foi possível salvar o backup da versão anterior antes de aplicar.');
      setApplying(false);
    }
  };

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title="Revisar cifra com IA"
      subtitle="Verifica letra e acordes com fontes confiáveis e cria backup automático antes de salvar"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {loading ? (
          <AuroraEnergy state={energy.state}>
            <div className="p-6 space-y-4">
              <AuroraProcessingIndicator
                state={energy.state}
                label="Conferindo acordes e letra com IA"
              />
              <AuroraThinkingSteps
                defaultExpanded
                summary="Etapas da revisão"
                steps={[
                  {
                    title: 'Consulta de referências da música',
                    detail: 'Verificando harmonia, tonalidade e versos conhecidos.',
                    done: false,
                  },
                  {
                    title: 'Comparação linha a linha em ChordPro',
                    detail: 'Preservando diretivas e estrutura da cifra atual.',
                    done: false,
                  },
                ]}
              />
            </div>
          </AuroraEnergy>
        ) : error ? (
          <div role="alert" className="rounded-2xl bg-error-container text-on-error-container p-4 typescale-body-md">
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 max-h-[50dvh] overflow-auto font-mono text-xs whitespace-pre-wrap">
              {changes.map((part, i) => {
                const lines = part.value.replace(/\n$/, '').split('\n');
                const cls = part.added
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : part.removed
                    ? 'bg-error-container text-on-error-container line-through'
                    : 'text-on-surface-variant';
                const marker = part.added ? '+' : part.removed ? '-' : ' ';
                return lines.map((line, j) => (
                  <div key={`${i}-${j}`} className={`px-2 py-0.5 rounded ${cls}`}>
                    <span className="select-none opacity-70 mr-2">{marker}</span>
                    {line || '\u00A0'}
                  </div>
                ));
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="typescale-body-sm text-on-surface-variant">
                {enhancedText === originalText
                  ? 'Nenhuma correção necessária encontrada.'
                  : 'A versão atual será arquivada no histórico antes de aplicar.'}
              </span>
              <div className="flex items-center gap-2">
                <AuroraButton color="outlined" onClick={onClose}>
                  Fechar
                </AuroraButton>
                {enhancedText !== originalText && (
                  <AuroraButton
                    color="filled"
                    icon="check"
                    disabled={applying}
                    onClick={() => void handleApply()}
                  >
                    {applying ? 'Aplicando...' : 'Aplicar correções'}
                  </AuroraButton>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AuroraDialog>
  );
}

interface SongVersion {
  id: string;
  createdAt?: string;
  text: string;
}

function VersionHistoryDialog({
  open,
  songId,
  onClose,
  onRestore,
}: {
  open: boolean;
  songId: string;
  onClose: () => void;
  onRestore: (text: string) => void;
}) {
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/songs/${songId}/versions`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao carregar histórico');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setVersions(Array.isArray(data) ? data : data.versions ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Histórico indisponível sem conexão com o servidor.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, songId]);

  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title="Histórico de versões"
      subtitle="Restaure revisões anteriores salvas automaticamente"
    >
      {loading ? (
        <p className="typescale-body-md text-on-surface-variant m-0">Carregando versões...</p>
      ) : error ? (
        <p className="typescale-body-md text-error m-0">{error}</p>
      ) : versions.length === 0 ? (
        <p className="typescale-body-md text-on-surface-variant m-0">
          Nenhuma versão arquivada para esta música ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {versions.map((v, i) => (
            <div
              key={v.id || i}
              className="rounded-2xl bg-surface-container-low p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="typescale-title-md text-on-surface">
                  Versão {versions.length - i}
                </div>
                <div className="typescale-body-sm text-on-surface-variant">
                  {v.createdAt ? new Date(v.createdAt).toLocaleString('pt-BR') : 'Backup salvo'}
                </div>
              </div>
              <AuroraButton
                color="tonal"
                icon="restore"
                onClick={() => {
                  onRestore(v.text);
                  onClose();
                }}
              >
                Restaurar
              </AuroraButton>
            </div>
          ))}
        </div>
      )}
    </AuroraDialog>
  );
}

function SongSectionCard({
  section,
  sectionIdx,
  totalSections,
  displayMode,
  totalShift,
  useFlats,
  shiftDir,
  shiftKey,
  fontSize,
  activeChord,
  editMode,
  calibrating,
  calibrationMark,
  isJumpTarget = false,
  onCalibrateStamp,
  onSelectChord,
  onEditChord,
  onAddChord,
  onEditLineText,
  onAddLine,
  onRenameSection,
  onMoveSection,
  onDuplicateSection,
  onRemoveSection,
}: {
  section: Section;
  sectionIdx: number;
  totalSections: number;
  displayMode: DisplayMode;
  totalShift: number;
  useFlats: boolean;
  shiftDir: 'none' | 'up' | 'down' | 'reset';
  shiftKey: string;
  fontSize: number;
  activeChord: string | null;
  editMode: boolean;
  calibrating: boolean;
  calibrationMark: number | null;
  isJumpTarget?: boolean;
  onCalibrateStamp: (sectionIdx: number) => void;
  onSelectChord: (chord: string) => void;
  onEditChord: (sectionIdx: number, lineIdx: number, segIdx: number, chord: string) => void;
  onAddChord: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onEditLineText: (sectionIdx: number, lineIdx: number, nextRawLine: string) => void;
  onAddLine: (sectionIdx: number) => void;
  onRenameSection: (sectionIdx: number, nextLabel: string) => void;
  onMoveSection: (sectionIdx: number, dir: 'up' | 'down') => void;
  onDuplicateSection: (sectionIdx: number) => void;
  onRemoveSection: (sectionIdx: number) => void;
}) {
  const isChorus = section.type === 'chorus';
  const instrumental = isInstrumentalSection(section.lines);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(section.label);
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState('');

  const visibleLines = useMemo(() => {
    if (editMode) return section.lines;
    if (displayMode === 'lyrics-only') {
      if (instrumental) return [];
      return section.lines.filter((l) => l.trim() === '' || lineHasLyrics(l));
    }
    if (displayMode === 'chords-only') {
      return section.lines.filter((l) => parseLine(l).some((seg) => Boolean(seg.chord)));
    }
    return section.lines;
  }, [section.lines, displayMode, instrumental, editMode]);

  const lyricScale = fontSize / 100;

  return (
    <section
      id={`song-section-${sectionIdx}`}
      tabIndex={-1}
      data-jump-target={isJumpTarget ? 'true' : undefined}
      style={sectionIdx < 6 ? ({ '--stagger-i': sectionIdx } as CSSProperties) : undefined}
      onClick={calibrating ? () => onCalibrateStamp(sectionIdx) : undefined}
      className={`${sectionIdx < 6 ? 'stagger-item ' : ''}stage-card scroll-mt-4 p-5 sm:p-6 space-y-3 break-inside-avoid ${
        isChorus ? 'stage-card-chorus' : 'bg-surface'
      } ${calibrating ? 'cursor-pointer hover:ring-2 hover:ring-tertiary' : ''} ${
        editMode ? 'ring-1 ring-primary/70' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {editMode && editingLabel ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRenameSection(sectionIdx, labelDraft);
                setEditingLabel(false);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                autoFocus
                aria-label="Nome da seção"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => {
                  onRenameSection(sectionIdx, labelDraft);
                  setEditingLabel(false);
                }}
                className="stage-field min-h-[38px] py-1 px-3 w-44"
              />
            </form>
          ) : (
            <span
              className={`px-3 py-1 rounded-full typescale-label-sm ${
                isChorus
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {section.label}
            </span>
          )}

          {calibrationMark !== null && (
            <span className="px-2.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-mono typescale-label-sm tabular-nums">
              {formatDuration(calibrationMark)}
            </span>
          )}
        </div>

        {editMode && (
          <div className="flex items-center gap-0.5 -mr-2.5">
            <AuroraIconButton
              icon="edit"
              label={`Renomear seção ${section.label}`}
              onClick={() => {
                setLabelDraft(section.label);
                setEditingLabel(true);
              }}
            />
            <AuroraIconButton
              icon="arrow_upward"
              label={`Mover seção ${section.label} para cima`}
              disabled={sectionIdx === 0}
              onClick={() => onMoveSection(sectionIdx, 'up')}
            />
            <AuroraIconButton
              icon="arrow_downward"
              label={`Mover seção ${section.label} para baixo`}
              disabled={sectionIdx === totalSections - 1}
              onClick={() => onMoveSection(sectionIdx, 'down')}
            />
            <AuroraIconButton
              icon="content_copy"
              label={`Duplicar seção ${section.label}`}
              onClick={() => onDuplicateSection(sectionIdx)}
            />
            <AuroraIconButton
              icon="delete_outline"
              label={`Remover seção ${section.label}`}
              disabled={totalSections <= 1}
              onClick={() => onRemoveSection(sectionIdx)}
            />
          </div>
        )}
      </div>

      {!editMode && displayMode === 'lyrics-only' && instrumental ? (
        <p className="typescale-body-sm text-on-surface-variant m-0 italic">
          Trecho instrumental
        </p>
      ) : (
        <div className="space-y-3">
          {visibleLines.map((line, li) => {
            if (!editMode && !line.trim()) return <div key={li} className="h-2" />;
            const segs = parseLine(line);

            if (editMode) {
              const plainLen = segs.reduce((acc, s) => acc + s.text.length, 0);
              let runningOffset = 0;
              return (
                <div
                  key={li}
                  className="rounded-xl bg-surface-container-low/80 px-3 py-2 flex items-center justify-between gap-2"
                >
                  {editingLineIdx === li ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onEditLineText(sectionIdx, li, lineDraft);
                        setEditingLineIdx(null);
                      }}
                      className="flex-1 flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="text"
                        autoFocus
                        aria-label={`Editar linha ${li + 1} em ChordPro`}
                        value={lineDraft}
                        onChange={(e) => setLineDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingLineIdx(null);
                          }
                        }}
                        className="stage-field font-mono text-xs flex-1 min-w-[200px]"
                      />
                      <AuroraButton color="outlined" onClick={() => setEditingLineIdx(null)}>
                        Cancelar
                      </AuroraButton>
                      <AuroraButton type="submit" color="filled">
                        OK
                      </AuroraButton>
                    </form>
                  ) : (
                    <div className="flex-1 pt-6 leading-[1.45]" style={{ fontSize: `${lyricScale}rem` }}>
                      {segs.map((seg, si) => {
                        const segStart = runningOffset;
                        runningOffset += seg.text.length;
                        const nextHasChord = Boolean(segs[si + 1]?.chord);
                        const prevEndedSpace = si > 0 && /\s$/.test(segs[si - 1].text);

                        const renderClickableWords = (text: string, basePos: number) => {
                          const parts = text.split(/(\s+)/);
                          let rel = 0;
                          return parts.map((part, pi) => {
                            const pos = basePos + rel;
                            rel += part.length;
                            if (!part || /^\s+$/.test(part)) {
                              return (
                                <span key={pi} className="whitespace-pre">
                                  {part}
                                </span>
                              );
                            }
                            return (
                              <button
                                key={pi}
                                type="button"
                                onClick={() => onAddChord(sectionIdx, li, pos)}
                                title={`Inserir acorde em "${part}"`}
                                className="edit-word-slot"
                              >
                                {part}
                              </button>
                            );
                          });
                        };

                        if (!seg.chord) {
                          return <span key={si}>{renderClickableWords(seg.text, segStart)}</span>;
                        }
                        const hasLyrics = seg.text.trim().length > 0;
                        if (!hasLyrics) {
                          return (
                            <span
                              key={si}
                              className="relative inline-block leading-none mr-3"
                              style={{ minWidth: `${Math.max(seg.chord.length + 1.5, 3)}ch` }}
                            >
                              <button
                                type="button"
                                aria-label={`Editar acorde ${seg.chord}`}
                                onClick={() => onEditChord(sectionIdx, li, si, seg.chord!)}
                                className="chord-token absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded"
                                style={{ fontSize: `${0.84 * lyricScale}rem` }}
                              >
                                {seg.chord}
                              </button>
                              <span className="text-on-surface whitespace-pre leading-[1.45]">
                                {seg.text || '\u00A0'}
                              </span>
                            </span>
                          );
                        }
                        const wm = seg.text.match(/^(\s*)(\S+)(.*)$/);
                        const rawLead = wm ? wm[1] : '';
                        const leadSpace = si === 0 || prevEndedSpace ? '' : rawLead;
                        const anchor = wm ? wm[2] : seg.text;
                        const tail = wm ? wm[3] : '';
                        const tailOffset = segStart + rawLead.length + anchor.length;
                        return (
                          <span key={si}>
                            {leadSpace && <span className="whitespace-pre">{leadSpace}</span>}
                            <span
                              className="relative inline-block leading-none"
                              style={{
                                minWidth:
                                  nextHasChord && !tail.trim() && anchor.length < seg.chord.length
                                    ? `${seg.chord.length + 0.8}ch`
                                    : undefined,
                              }}
                            >
                              <button
                                type="button"
                                aria-label={`Editar acorde ${seg.chord}`}
                                onClick={() => onEditChord(sectionIdx, li, si, seg.chord!)}
                                className="chord-token absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded"
                                style={{ fontSize: `${0.84 * lyricScale}rem` }}
                              >
                                {seg.chord}
                              </button>
                              <span className="text-on-surface whitespace-pre leading-[1.45]">
                                {anchor}
                              </span>
                            </span>
                            {tail && renderClickableWords(tail, tailOffset)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {editingLineIdx !== li && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <AuroraIconButton
                        icon="add_circle"
                        label={`Inserir acorde na linha ${li + 1}`}
                        onClick={() => onAddChord(sectionIdx, li, Math.floor(plainLen / 2))}
                      />
                      <AuroraIconButton
                        icon="edit_note"
                        label={`Editar texto da linha ${li + 1}`}
                        onClick={() => {
                          setLineDraft(line);
                          setEditingLineIdx(li);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            }

            if (displayMode === 'chords-only') {
              const chords = segs
                .filter((s) => s.chord)
                .map((s) => transposeChord(s.chord!, totalShift, useFlats));
              return (
                <div key={li} className="flex flex-wrap items-center gap-2 py-1">
                  {chords.map((c, ci) => (
                    <button
                      key={ci}
                      type="button"
                      aria-label={`${c}, ver diagrama do acorde`}
                      data-active={activeChord === c ? 'true' : undefined}
                      onClick={() => onSelectChord(c)}
                      className="chord-token min-h-[44px] min-w-[44px] px-3 justify-center rounded-xl bg-surface-container-low"
                      style={{ fontSize: `${Math.max(0.95, 1.02 * lyricScale)}rem` }}
                    >
                      <span
                        key={shiftDir === 'none' ? 'init' : shiftKey}
                        data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
                        className="chord-settle"
                      >
                        {c}
                      </span>
                    </button>
                  ))}
                </div>
              );
            }

            if (displayMode === 'lyrics-only') {
              const lyricText = segs.map((s) => s.text).join('').replace(/^\s+/, '');
              return (
                <p
                  key={li}
                  className="text-on-surface m-0 leading-relaxed py-0.5"
                  style={{ fontSize: `${1.05 * lyricScale}rem` }}
                >
                  {lyricText}
                </p>
              );
            }

            return (
              <div
                key={li}
                className="pt-6 leading-[1.42]"
                style={{ fontSize: `${1.02 * lyricScale}rem` }}
              >
                {segs.map((seg, si) => {
                  const displayedChord = seg.chord
                    ? transposeChord(seg.chord, totalShift, useFlats)
                    : null;
                  const nextHasChord = Boolean(segs[si + 1]?.chord);
                  const prevEndedSpace = si > 0 && /\s$/.test(segs[si - 1].text);
                  if (!displayedChord) {
                    const cleanText = si === 0 ? seg.text.replace(/^\s+/, '') : seg.text;
                    return (
                      <span key={si} className="text-on-surface whitespace-pre-wrap">
                        {cleanText}
                      </span>
                    );
                  }
                  const hasLyrics = seg.text.trim().length > 0;
                  if (!hasLyrics) {
                    return (
                      <span
                        key={si}
                        className="relative inline-block leading-none mr-3"
                        style={{ minWidth: `${Math.max(displayedChord.length + 0.5, 2.5)}ch` }}
                      >
                        <button
                          type="button"
                          aria-label={`${displayedChord}, ver diagrama do acorde`}
                          data-active={activeChord === displayedChord ? 'true' : undefined}
                          onClick={() => onSelectChord(displayedChord)}
                          className="chord-token absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap"
                          style={{ fontSize: `${0.86 * lyricScale}rem` }}
                        >
                          <span
                            key={shiftDir === 'none' ? 'init' : shiftKey}
                            data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
                            className="chord-settle"
                          >
                            {displayedChord}
                          </span>
                        </button>
                        <span className="text-on-surface whitespace-pre leading-[1.42]">
                          {seg.text || '\u00A0'}
                        </span>
                      </span>
                    );
                  }
                  const wm = seg.text.match(/^(\s*)(\S+)(.*)$/);
                  const rawLead = wm ? wm[1] : '';
                  const leadSpace = si === 0 || prevEndedSpace ? '' : rawLead;
                  const anchor = wm ? wm[2] : seg.text;
                  const tail = wm ? wm[3] : '';
                  const tightToNext = nextHasChord && !tail.trim();
                  return (
                    <span key={si}>
                      {leadSpace && (
                        <span className="text-on-surface whitespace-pre">{leadSpace}</span>
                      )}
                      <span
                        className="relative inline-block leading-none"
                        style={{
                          minWidth:
                            tightToNext && anchor.length < displayedChord.length
                              ? `${displayedChord.length + 0.8}ch`
                              : undefined,
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`${displayedChord}, ver diagrama do acorde`}
                          data-active={activeChord === displayedChord ? 'true' : undefined}
                          onClick={() => onSelectChord(displayedChord)}
                          className="chord-token absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap"
                          style={{ fontSize: `${0.86 * lyricScale}rem` }}
                        >
                          <span
                            key={shiftDir === 'none' ? 'init' : shiftKey}
                            data-shift-dir={shiftDir === 'none' ? undefined : shiftDir}
                            className="chord-settle"
                          >
                            {displayedChord}
                          </span>
                        </button>
                        <span className="text-on-surface whitespace-pre leading-[1.42]">
                          {anchor}
                        </span>
                      </span>
                      {tail && (
                        <span className="text-on-surface whitespace-pre-wrap">{tail}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {editMode && (
            <div className="pt-2">
              <AuroraButton color="text" icon="add" onClick={() => onAddLine(sectionIdx)}>
                Adicionar linha
              </AuroraButton>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SongView({ songId }: { songId: string }) {
  const route = useRoute();
  const setlistId = route.params.get('setlist');
  const showMode = route.params.get('show') === '1';

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const { getSong, getEntry, patchMeta, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const store = usePlayerStore();
  const {
    displayMode,
    setDisplayMode,
    toggleHideChords,
    fontSize,
    setFontSize,
    sheetColumns,
    setSheetColumns,
    capoDisplay,
    setCapoDisplay,
    chordsRefOpen,
    setChordsRefOpen,
    visualPulseEnabled,
    focusMode,
    setFocusMode,
    theme,
    setTheme,
    singleKeyShortcuts,
    scrollLeadInSec,
  } = useDisplayStore();

  // Visual edit draft + undo/redo stacks
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [selectedChordEdit, setSelectedChordEdit] = useState<SelectedChordTarget | null>(null);
  const [addChordEdit, setAddChordEdit] = useState<AddChordTarget | null>(null);

  // Calibration state ("Gravar rolagem")
  const [calibrating, setCalibrating] = useState(false);
  const [calStartMs, setCalStartMs] = useState(0);
  const [calElapsedSec, setCalElapsedSec] = useState(0);
  const [calMarks, setCalMarks] = useState<(number | null)[]>([]);
  const [calNextIdx, setCalNextIdx] = useState(1);

  const storedSong = useMemo(() => {
    void entries;
    return getSong(songId);
  }, [entries, getSong, songId]);

  const rawEntry = useMemo(() => {
    void entries;
    return getEntry(songId);
  }, [entries, getEntry, songId]);

  const song = useMemo(() => {
    if (store.editMode && editDraftText !== null) {
      return parseChordPro(songId, editDraftText);
    }
    return storedSong;
  }, [store.editMode, editDraftText, songId, storedSong]);

  const activeSetlist = setlistId ? setlists.find((sl) => sl.id === setlistId) ?? null : null;
  const setlistSongs = useMemo(() => {
    if (!activeSetlist) return [];
    return activeSetlist.songIds
      .map((sid) => getSong(sid))
      .filter((s): s is ParsedSong => s !== null);
  }, [activeSetlist, getSong, entries]);

  const currentIdx = setlistSongs.findIndex((s) => s.id === songId);
  const prevSong = currentIdx > 0 ? setlistSongs[currentIdx - 1] : null;
  const nextSong =
    currentIdx >= 0 && currentIdx < setlistSongs.length - 1 ? setlistSongs[currentIdx + 1] : null;

  const scrollStateRef = useRef<LiveScrollState>({ scrollTop: 0, scrollRatio: 0 });
  const live = useLiveSession(activeSetlist?.id ?? null, songId, scrollStateRef);

  const [showEnhance, setShowEnhance] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showMetaDialog, setShowMetaDialog] = useState(false);
  const [showAddToSetlist, setShowAddToSetlist] = useState(false);
  const [showSetlistDrawer, setShowSetlistDrawer] = useState(false);
  const [showSpotifyPreview, setShowSpotifyPreview] = useState(false);
  const [showSpotifyPicker, setShowSpotifyPicker] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false);
  const [confirmDiscardSource, setConfirmDiscardSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const [sourceTab, setSourceTab] = useState<'split' | 'edit' | 'preview'>('split');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [countInOpen, setCountInOpen] = useState(false);
  const [leadInLeft, setLeadInLeft] = useState(0);
  const [toast, setToast] = useState<{ id: number; msg: string; undoText?: string } | null>(null);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [jumpedSectionIdx, setJumpedSectionIdx] = useState<number | null>(null);
  const jumpHighlightTimerRef = useRef<number | null>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const scrollProgressRef = useRef<HTMLDivElement>(null);
  const rawTotalShift =
    capoDisplay === 'shapes' ? store.transpose - store.capo : store.transpose;
  const [shiftTracker, setShiftTracker] = useState<{
    songId: string;
    shift: number;
    flats: boolean;
    dir: 'none' | 'up' | 'down' | 'reset';
  }>({ songId, shift: rawTotalShift, flats: store.useFlats, dir: 'none' });
  if (shiftTracker.songId !== songId) {
    setShiftTracker({ songId, shift: rawTotalShift, flats: store.useFlats, dir: 'none' });
  } else if (shiftTracker.shift !== rawTotalShift || shiftTracker.flats !== store.useFlats) {
    const dir =
      rawTotalShift === 0 && shiftTracker.shift !== 0
        ? 'reset'
        : rawTotalShift > shiftTracker.shift
          ? 'up'
          : rawTotalShift < shiftTracker.shift
            ? 'down'
            : 'reset';
    setShiftTracker({ songId, shift: rawTotalShift, flats: store.useFlats, dir });
  }
  const toastTimerRef = useRef<number | null>(null);
  const [chordSheetModalOpen, setChordSheetModalOpen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const speedRef = useRef(store.autoScrollSpeed);
  speedRef.current = store.autoScrollSpeed;

  const notify = useCallback((msg: string, undoText?: string) => {
    setToast({ id: Date.now(), msg, undoText });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), undoText ? 6500 : 3800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (jumpHighlightTimerRef.current) window.clearTimeout(jumpHighlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const nav = sectionNavRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth + 4) return;
    const activeChip = nav.querySelector<HTMLElement>('[aria-current="location"]');
    if (!activeChip) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeChip.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      inline: 'nearest',
      block: 'nearest',
    });
  }, [activeSectionIdx]);

  useEffect(() => {
    if (!storedSong) return;
    store.resetForSong(storedSong.tempo, storedSong.capo, storedSong.scrollSpeed, storedSong.originalKey);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setCalibrating(false);
    setActiveSectionIdx(0);
  }, [storedSong?.id]);

  // Screen Wake Lock
  useEffect(() => {
    if (!showMode && !focusMode && !store.isAutoScrolling && !store.metronomeOn) {
      setWakeLockActive(false);
      return;
    }
    let sentinel: { release: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen')
      .then((s) => {
        sentinel = s;
        setWakeLockActive(true);
      })
      .catch(() => setWakeLockActive(false));
    return () => {
      setWakeLockActive(false);
      void sentinel?.release();
    };
  }, [showMode, focusMode, store.isAutoScrolling, store.metronomeOn]);

  // Calibration stopwatch
  useEffect(() => {
    if (!calibrating) return;
    const id = window.setInterval(() => {
      setCalElapsedSec((Date.now() - calStartMs) / 1000);
    }, 150);
    return () => window.clearInterval(id);
  }, [calibrating, calStartMs]);

  // Auto-scroll with optional lead-in delay
  const durationSec = useMemo(
    () => (song ? computeEffectiveDurationSec(song, store.bpm) : 180),
    [song, store.bpm]
  );

  useEffect(() => {
    if (!store.isAutoScrolling) {
      setLeadInLeft(0);
      return;
    }
    let frame = 0;
    let delayInterval = 0;
    let last = performance.now();

    const startLoop = () => {
      setLeadInLeft(0);
      last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (maxScroll > 0) {
          const pxPerSec = (maxScroll / Math.max(30, durationSec)) * speedRef.current;
          window.scrollBy(0, pxPerSec * dt);
          const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
          scrollStateRef.current = {
            scrollTop: window.scrollY,
            scrollRatio: ratio,
          };
          if (scrollProgressRef.current) {
            scrollProgressRef.current.style.transform = `scaleX(${Math.max(0.02, ratio)})`;
          }
          if (window.scrollY >= maxScroll - 2) {
            store.setAutoScrolling(false);
            return;
          }
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    if (window.scrollY < 20 && scrollLeadInSec > 0) {
      let remaining = Math.ceil(scrollLeadInSec);
      setLeadInLeft(remaining);
      delayInterval = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearInterval(delayInterval);
          delayInterval = 0;
          startLoop();
        } else {
          setLeadInLeft(remaining);
        }
      }, 1000);
    } else {
      startLoop();
    }

    return () => {
      if (delayInterval) window.clearInterval(delayInterval);
      if (frame) cancelAnimationFrame(frame);
      setLeadInLeft(0);
    };
  }, [store.isAutoScrolling, durationSec, store.setAutoScrolling, scrollLeadInSec]);

  useEffect(() => {
    if (
      live.isFollowing &&
      live.session.currentSongId &&
      live.session.currentSongId !== songId &&
      activeSetlist
    ) {
      navigate(
        `/song/${live.session.currentSongId}?setlist=${activeSetlist.id}${showMode ? '&show=1' : ''}`,
        { replace: true }
      );
    }
  }, [live.isFollowing, live.session.currentSongId, songId, activeSetlist, showMode]);

  // Visual edit mode helpers
  const enterVisualEdit = () => {
    if (!rawEntry) return;
    setEditDraftText(rawEntry.text);
    setUndoStack([]);
    setRedoStack([]);
    setCalibrating(false);
    store.setEditMode(true);
  };

  const commitDraftChange = useCallback(
    (nextText: string) => {
      setEditDraftText((curr) => {
        if (curr !== null && curr !== nextText) {
          setUndoStack((st) => [...st.slice(-39), curr]);
          setRedoStack([]);
        }
        return nextText;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((st) => {
      if (st.length === 0) return st;
      const prev = st[st.length - 1];
      setEditDraftText((curr) => {
        if (curr !== null) setRedoStack((r) => [...r, curr]);
        return prev;
      });
      return st.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((st) => {
      if (st.length === 0) return st;
      const next = st[st.length - 1];
      setEditDraftText((curr) => {
        if (curr !== null) setUndoStack((u) => [...u, curr]);
        return next;
      });
      return st.slice(0, -1);
    });
  }, []);

  const mutateDraftSong = useCallback(
    (mutator: (parsed: ParsedSong) => ParsedSong) => {
      if (!editDraftText) return;
      const parsed = parseChordPro(songId, editDraftText);
      const nextSong = mutator(parsed);
      commitDraftChange(songToChordPro(nextSong));
    },
    [editDraftText, songId, commitDraftChange]
  );

  const saveVisualEdit = () => {
    if (editDraftText !== null) {
      updateEntry(songId, editDraftText);
      notify('Alterações na cifra salvas.');
    }
    store.setEditMode(false);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedChordEdit(null);
    setAddChordEdit(null);
  };

  const performCancelVisualEdit = () => {
    store.setEditMode(false);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedChordEdit(null);
    setAddChordEdit(null);
    setConfirmDiscardEdit(false);
  };

  const cancelVisualEdit = () => {
    if (undoStack.length > 0) {
      setConfirmDiscardEdit(true);
      return;
    }
    performCancelVisualEdit();
  };

  // Scroll-spy for section jump chips (tracks full visible set + bottom-of-page fallback)
  useEffect(() => {
    if (!song || song.sections.length < 2) return;
    const totalCount = song.sections.length;
    const elements = song.sections
      .map((_, i) => document.getElementById(`song-section-${i}`))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visibleSet = new Set<number>();
    const pickActive = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
      if (atBottom) {
        setActiveSectionIdx(totalCount - 1);
        return;
      }
      if (visibleSet.size > 0) {
        const sorted = [...visibleSet].sort((a, b) => a - b);
        setActiveSectionIdx(sorted[0]);
      }
    };

    const io = new IntersectionObserver(
      (entriesList) => {
        entriesList.forEach((en) => {
          const match = en.target.id.match(/song-section-(\d+)/);
          if (!match) return;
          const idx = Number(match[1]);
          if (en.isIntersecting) visibleSet.add(idx);
          else visibleSet.delete(idx);
        });
        pickActive();
      },
      { rootMargin: '-8% 0px -55% 0px', threshold: 0 }
    );
    elements.forEach((el) => io.observe(el));
    window.addEventListener('scroll', pickActive, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', pickActive);
    };
  }, [song?.id, song?.sections.length]);

  // Calibration actions
  const startCalibration = () => {
    if (!song || song.sections.length < 2) return;
    store.setAutoScrolling(false);
    setCalStartMs(Date.now());
    setCalElapsedSec(0);
    setCalMarks(song.sections.map((_, i) => (i === 0 ? 0 : null)));
    setCalNextIdx(1);
    setCalibrating(true);
  };

  const stampSection = useCallback(
    (idx: number) => {
      const sec = Math.max(0, Number(((Date.now() - calStartMs) / 1000).toFixed(1)));
      setCalMarks((prev) => {
        const next = [...prev];
        next[idx] = sec;
        return next;
      });
      setCalNextIdx((curr) => Math.max(curr, idx + 1));
    },
    [calStartMs]
  );

  const saveCalibration = () => {
    if (!song) return;
    const dense: number[] = [];
    let last = 0;
    for (let i = 0; i < calMarks.length; i++) {
      const m = calMarks[i];
      if (m !== null) {
        last = Math.max(last, m);
        dense.push(last);
      } else {
        last += 12;
        dense.push(last);
      }
    }
    patchMeta(song.id, 'marks', serializeMarks(dense));
    setCalibrating(false);
    notify('Calibração de seções salva.');
  };

  const clearCalibration = () => {
    if (!rawEntry) return;
    const prevText = rawEntry.text;
    updateEntry(songId, removeChordProMeta(prevText, 'marks'));
    notify('Calibração removida.', prevText);
  };

  // Global keyboard shortcuts for stage, focus mode, calibration, and edit mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (store.editMode && (e.metaKey || e.ctrlKey)) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if (isEditableEl(e.target)) return;
      const onInteractive =
        e.target instanceof HTMLElement &&
        Boolean(e.target.closest('button, a, [role="button"], summary'));

      if (calibrating && !onInteractive && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        if (song && calNextIdx < song.sections.length) {
          stampSection(calNextIdx);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (countInOpen) {
          setCountInOpen(false);
          return;
        }
        if (focusMode) {
          setFocusMode(false);
          return;
        }
        if (showMode) {
          navigate(activeSetlist ? `/song/${songId}?setlist=${activeSetlist.id}` : `/song/${songId}`);
          return;
        }
        if (calibrating) {
          setCalibrating(false);
          return;
        }
      }

      if (!singleKeyShortcuts || store.editMode) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ') {
        if (onInteractive) return;
        e.preventDefault();
        if (!live.isFollowing) store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setCountInOpen(true);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleHideChords();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode(!focusMode);
      } else if (e.key.toLowerCase() === 's' && activeSetlist) {
        e.preventDefault();
        setShowSetlistDrawer((v) => !v);
      } else if (e.key === 'ArrowLeft' && prevSong && activeSetlist) {
        e.preventDefault();
        navigate(`/song/${prevSong.id}?setlist=${activeSetlist.id}${showMode ? '&show=1' : ''}`, {
          direction: 'lateral-prev',
        });
      } else if (e.key === 'ArrowRight' && nextSong && activeSetlist) {
        e.preventDefault();
        navigate(`/song/${nextSong.id}?setlist=${activeSetlist.id}${showMode ? '&show=1' : ''}`, {
          direction: 'lateral-next',
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    store.editMode,
    handleUndo,
    handleRedo,
    calibrating,
    song,
    calNextIdx,
    stampSection,
    focusMode,
    setFocusMode,
    showMode,
    activeSetlist,
    songId,
    singleKeyShortcuts,
    live.isFollowing,
    store.toggleAutoScroll,
    toggleHideChords,
    prevSong,
    nextSong,
  ]);

  if (!song) {
    return (
      <main id="main" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 space-y-4">
        <h1 className="typescale-headline-md text-on-surface m-0">
          {!songsLoaded ? 'Carregando cifra...' : 'Música não encontrada'}
        </h1>
        <AuroraButton color="tonal" icon="arrow_back" onClick={() => navigate('/')}>
          Voltar para o repertório
        </AuroraButton>
      </main>
    );
  }

  const { title: displayTitle, artist: displayArtist, incomplete } = getDisplayTitleAndArtist(song);
  const effectiveKeyInfo = getEffectiveKey(song);
  const beatsPerBar = parseInt(song.timeSignature || '4/4', 10) || 4;
  const totalShift =
    capoDisplay === 'shapes' ? store.transpose - store.capo : store.transpose;
  const displayedKey = effectiveKeyInfo.key
    ? store.editMode
      ? effectiveKeyInfo.key
      : transposeChord(effectiveKeyInfo.key, store.transpose, store.useFlats)
    : '';
  const allChords = useMemo(
    () =>
      extractChords(song.sections).map((c) => transposeChord(c, totalShift, store.useFlats)),
    [song.sections, totalShift, store.useFlats]
  );
  const uniqueChords = useMemo(() => [...new Set(allChords)], [allChords]);
  const rawUniqueChords = useMemo(() => [...new Set(extractChords(song.sections))], [song.sections]);
  const railChord = store.activeChord || uniqueChords[0] || null;
  const hasCal = hasUsableMarks(song.sectionMarks, song.sections.length);
  const speedChanged = Math.abs(store.autoScrollSpeed - (song.scrollSpeed ?? 1)) >= 0.05;

  // Disambiguate duplicate section labels in jump strip (e.g. Chorus 1, Chorus 2)
  const sectionChipLabels = useMemo(() => {
    const totals = new Map<string, number>();
    song.sections.forEach((s) => totals.set(s.label, (totals.get(s.label) ?? 0) + 1));
    const seen = new Map<string, number>();
    return song.sections.map((s) => {
      const count = totals.get(s.label) ?? 1;
      if (count <= 1) return s.label;
      const n = (seen.get(s.label) ?? 0) + 1;
      seen.set(s.label, n);
      return `${s.label} ${n}`;
    });
  }, [song.sections]);

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleSelectChord = (chord: string) => {
    const desktopSidebarVisible =
      showSidebar && typeof window !== 'undefined' && window.innerWidth >= 1280;
    if (desktopSidebarVisible) {
      store.setActiveChord(chord);
    } else {
      if (store.activeChord !== chord) {
        store.setActiveChord(chord);
      }
      setChordSheetModalOpen(true);
    }
  };

  const handleSavePermanentTranspose = () => {
    if (!song || store.transpose === 0) return;
    const prevText = rawEntry?.text ?? songToChordPro(song);
    void fetch(`/api/songs/${song.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prevText }),
    }).catch(() => {});
    const transposed = transposeSong(song, store.transpose, store.useFlats);
    const label =
      displayedKey || `${store.transpose > 0 ? '+' : ''}${store.transpose} st`;
    updateEntry(song.id, songToChordPro(transposed));
    store.setTranspose(0);
    notify(`Tonalidade fixada em ${label}.`, prevText);
  };

  const handleOpenSource = () => {
    setSourceDraft(rawEntry?.text ?? '');
    setShowSource(true);
  };

  const handleSaveSource = () => {
    if (!sourceDraft.trim()) return;
    updateEntry(song.id, sourceDraft);
    setShowSource(false);
    setConfirmDiscardSource(false);
    notify('Cifra ChordPro atualizada.');
  };

  const handleRequestCloseSource = () => {
    if (sourceDraft !== (rawEntry?.text ?? '')) {
      setConfirmDiscardSource(true);
      return;
    }
    setShowSource(false);
  };

  const handleGoLive = () => {
    if (!activeSetlist) return;
    if (live.isLeading) {
      live.stopLeading();
      notify('Você parou de liderar a sessão ao vivo.');
    } else if (live.isFollowing) {
      live.unfollow();
      notify('Você deixou de seguir o líder ao vivo.');
    } else if (live.hasRemoteLeader && live.localUnfollow) {
      live.refollow();
      notify(`Voltando a seguir ${live.session.leaderName || 'o líder'}.`);
    } else {
      const savedName = localStorage.getItem('jamshelf-device-name') || 'Líder';
      live.startLeading(savedName);
      notify(`Sessão ao vivo iniciada como ${savedName}.`);
    }
  };

  const scrollActionLabel = store.isAutoScrolling
    ? leadInLeft > 0
      ? `Em ${leadInLeft}s...`
      : 'Pausar'
    : 'Rolar';

  const handleSelectSpotify = (track: SpotifyTrack) => {
    patchMeta(song.id, 'spotify', track.id);
    if (track.durationMs) {
      patchMeta(song.id, 'duration', Math.round(track.durationMs / 1000));
    }
    setShowSpotifyPreview(true);
    notify(`Spotify vinculado: ${track.name}`);
  };

  const handleClearSpotify = () => {
    if (!rawEntry) return;
    const prevText = rawEntry.text;
    updateEntry(song.id, removeChordProMeta(prevText, 'spotify'));
    setShowSpotifyPreview(false);
    notify('Faixa do Spotify desvinculada.', prevText);
  };

  useEffect(() => {
    document.title = `${displayTitle} - Jamshelf`;
  }, [displayTitle]);

  const sourcePreviewSong = useMemo(
    () => (showSource ? parseChordPro(song.id, sourceDraft) : null),
    [showSource, song.id, sourceDraft]
  );

  const minor = isMinorKey(displayedKey);
  const showSidebar =
    !showMode &&
    !focusMode &&
    !store.editMode &&
    sheetColumns === 1 &&
    (uniqueChords.length > 0 || Boolean(activeSetlist));

  const activeEditLine = selectedChordEdit
    ? song.sections[selectedChordEdit.sectionIdx]?.lines[selectedChordEdit.lineIdx]
    : addChordEdit
      ? song.sections[addChordEdit.sectionIdx]?.lines[addChordEdit.lineIdx]
      : undefined;

  return (
    <main
      id="main"
      tabIndex={-1}
      data-motion-scheme={showMode || focusMode ? 'standard' : undefined}
      className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 focus:outline-none ${
        showMode ? 'max-w-[1220px] pb-36' : focusMode ? 'max-w-5xl pb-36' : 'max-w-[1360px] pb-24 md:pb-8'
      }`}
    >
      <div
        ref={scrollProgressRef}
        aria-hidden="true"
        data-active={store.isAutoScrolling && leadInLeft === 0 ? 'true' : undefined}
        className="scroll-progress-bar"
        style={{ transform: 'scaleX(0)' }}
      />
      {/* Top bar: Focus Mode / Show Mode / Breadcrumb */}
      {focusMode ? (
        <FocusModeChrome
          songTitle={displayTitle}
          displayedKey={displayedKey}
          stageNotes={song.notes}
          wakeLockActive={wakeLockActive}
          hasSetlist={Boolean(activeSetlist)}
          prevSongId={prevSong?.id ?? null}
          nextSongId={nextSong?.id ?? null}
          isFollowing={live.isFollowing}
          leadInLeft={leadInLeft}
          scrollLeadInSec={scrollLeadInSec}
          onNavigateSong={(id) =>
            activeSetlist &&
            navigate(`/song/${id}?setlist=${activeSetlist.id}${showMode ? '&show=1' : ''}`)
          }
          onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
          onTriggerCountIn={() => setCountInOpen(true)}
          onToggleTheme={() => {
            const next = isDark ? 'light' : 'dark';
            setTheme(next);
            applyColorScheme(next);
          }}
          isDark={isDark}
          onExit={() => setFocusMode(false)}
        />
      ) : showMode ? (
        <header
          className="dock-enter-top stage-floating-bar sticky top-3 z-30 rounded-[20px] px-2 sm:px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 sm:flex-1">
            <AuroraIconButton
              icon="close"
              label="Sair do modo show"
              variant="tonal"
              className="sm:hidden flex-shrink-0"
              onClick={() =>
                navigate(
                  activeSetlist
                    ? `/song/${song.id}?setlist=${activeSetlist.id}`
                    : `/song/${song.id}`
                )
              }
            />
            <AuroraButton
              color="tonal"
              icon="close"
              className="hidden sm:inline-flex flex-shrink-0"
              onClick={() =>
                navigate(
                  activeSetlist
                    ? `/song/${song.id}?setlist=${activeSetlist.id}`
                    : `/song/${song.id}`
                )
              }
            >
              Sair
            </AuroraButton>
            <h1 className="typescale-title-md sm:typescale-title-lg text-on-surface m-0 truncate flex-1 min-w-0">
              {displayTitle}
            </h1>
            {displayedKey && (
              <button
                type="button"
                onClick={() => {
                  playReferencePitch(displayedKey, { mode: 'chord', durationSec: 1.8 });
                  notify(`Tocando acorde guia ${displayedKey}`);
                }}
                aria-label={`Tom ${displayedKey}, tocar acorde guia`}
                title={`Tocar acorde de referência ${displayedKey}`}
                className={`key-ref-pill px-3 rounded-full inline-flex items-center gap-1 font-mono typescale-label-sm flex-shrink-0 cursor-pointer ${
                  minor
                    ? 'bg-surface text-minor-ink border border-outline-variant'
                    : 'bg-primary-container text-on-primary-container border-none'
                }`}
              >
                <GsIcon name="volume_up" size={20} />
                <span
                  key={shiftTracker.dir === 'none' ? 'init' : `${store.transpose}-${store.useFlats}`}
                  data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                  className="chord-settle"
                >
                  {displayedKey}
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1 sm:gap-1.5 flex-shrink-0">
            {activeSetlist && (
              <div className="flex items-center gap-0.5 sm:gap-1">
                <AuroraIconButton
                  icon="skip_previous"
                  label="Música anterior do setlist"
                  disabled={!prevSong}
                  onClick={() =>
                    prevSong &&
                    navigate(`/song/${prevSong.id}?setlist=${activeSetlist.id}&show=1`, {
                      direction: 'lateral-prev',
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowSetlistDrawer(true)}
                  aria-label={`Abrir lista do setlist (${currentIdx + 1} de ${setlistSongs.length})`}
                  title="Abrir lista do setlist (S)"
                  className="key-ref-pill px-1.5 sm:px-2.5 rounded-full bg-surface hover:bg-surface-container text-on-surface border border-outline-variant inline-flex items-center gap-0.5 sm:gap-1 font-mono typescale-label-sm tabular-nums cursor-pointer"
                >
                  <GsIcon name="queue_music" size={20} />
                  <span>
                    {currentIdx + 1}/{setlistSongs.length}
                  </span>
                </button>
                <AuroraIconButton
                  icon="skip_next"
                  label="Próxima música do setlist"
                  disabled={!nextSong}
                  onClick={() =>
                    nextSong &&
                    navigate(`/song/${nextSong.id}?setlist=${activeSetlist.id}&show=1`, {
                      direction: 'lateral-next',
                    })
                  }
                />
              </div>
            )}
            <div className="flex items-center gap-1 sm:gap-1.5 ml-auto sm:ml-0">
              <AuroraButton
                color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
                icon={store.isAutoScrolling ? (leadInLeft > 0 ? 'hourglass_top' : 'pause') : 'play_arrow'}
                disabled={live.isFollowing}
                onClick={() => store.toggleAutoScroll()}
                className="relative overflow-hidden min-w-[84px] sm:min-w-[104px] tabular-nums px-2.5 sm:px-3.5 gap-1 sm:gap-2"
              >
                <span
                  key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
                  className="countdown-tick"
                >
                  {scrollActionLabel}
                </span>
                {leadInLeft > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                      transition: 'transform 950ms linear',
                    }}
                  />
                )}
              </AuroraButton>
              <AuroraIconButton
                icon="looks_4"
                label="Contagem visual (C)"
                variant="outlined"
                className="sm:hidden text-on-surface"
                onClick={() => setCountInOpen(true)}
              />
              <AuroraButton
                color="outlined"
                icon="looks_4"
                className="hidden sm:inline-flex"
                onClick={() => setCountInOpen(true)}
              >
                Contagem
              </AuroraButton>
            </div>
          </div>
        </header>
      ) : (
        <nav aria-label="Caminho" className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 typescale-body-sm text-on-surface-variant min-w-0">
            <AuroraLink
              href="/"
              className="stage-breadcrumb-link"
            >
              Repertório
            </AuroraLink>
            {activeSetlist && (
              <>
                <GsIcon name="chevron_right" size={20} />
                <AuroraLink
                  href={`/setlists/${activeSetlist.id}`}
                  className="stage-breadcrumb-link truncate"
                >
                  {activeSetlist.name}
                </AuroraLink>
              </>
            )}
            <GsIcon name="chevron_right" size={20} />
            <span className="text-on-surface truncate">{displayTitle}</span>
          </div>

          {activeSetlist && (
            <div className="flex items-center gap-1.5">
              <AuroraButton
                color="outlined"
                icon="chevron_left"
                disabled={!prevSong}
                onClick={() =>
                  prevSong &&
                  navigate(`/song/${prevSong.id}?setlist=${activeSetlist.id}`, {
                    direction: 'lateral-prev',
                  })
                }
              >
                Anterior
              </AuroraButton>
              <button
                type="button"
                aria-label={`${currentIdx + 1} / ${setlistSongs.length}, abrir lista do setlist`}
                onClick={() => setShowSetlistDrawer(true)}
                className="stage-chip typescale-body-sm font-mono tabular-nums"
                title="Abrir lista do setlist (S)"
              >
                {currentIdx + 1} / {setlistSongs.length}
              </button>
              <AuroraButton
                color="outlined"
                trailingIcon="chevron_right"
                disabled={!nextSong}
                onClick={() =>
                  nextSong &&
                  navigate(`/song/${nextSong.id}?setlist=${activeSetlist.id}`, {
                    direction: 'lateral-next',
                  })
                }
              >
                Próxima
              </AuroraButton>
            </div>
          )}
        </nav>
      )}

      {/* Song identity + controls header (hidden in Focus Mode; compact without duplicate title in Show Mode) */}
      {!focusMode && (
        <section
          aria-label="Controles da música"
          className={`stage-card ${showMode ? 'p-2 sm:p-2.5 space-y-2' : 'p-3.5 sm:p-5 space-y-3'}`}
        >
          {!showMode && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex items-center gap-2 min-w-0 sm:min-w-[180px] flex-1">
                  <h1 className="typescale-headline-md sm:typescale-display-sm text-on-surface m-0 line-clamp-2 xl:truncate">
                    {displayTitle}
                  </h1>
                  {incomplete && (
                    <span className="px-2.5 py-0.5 rounded-full bg-warn-bg text-warn-ink typescale-label-sm flex-shrink-0">
                      Incompleta
                    </span>
                  )}
                </div>

                {!store.editMode && (
                  <div className="flex items-center gap-1 flex-shrink-0 -mr-2 lg:mr-0 ml-auto">
                    <AuroraIconButton
                      icon="favorite"
                      filled={song.favorite}
                      label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                      className={song.favorite ? 'text-error' : ''}
                      onClick={() => patchMeta(song.id, 'favorite', song.favorite ? 'false' : 'true')}
                    />
                    <div className="hidden lg:flex items-center gap-1.5">
                      <AuroraButton
                        color="outlined"
                        icon="edit_note"
                        onClick={enterVisualEdit}
                        title="Editar acordes e seções visualmente"
                        className="lg:px-3 xl:px-[18px] lg:gap-1.5 xl:gap-2"
                      >
                        Editar
                      </AuroraButton>
                      <AuroraButton
                        color="outlined"
                        icon="fullscreen"
                        onClick={() => setFocusMode(true)}
                        title="Tela limpa (atalho F)"
                        className="lg:px-3 xl:px-[18px] lg:gap-1.5 xl:gap-2"
                      >
                        Tela limpa
                      </AuroraButton>
                      <AuroraButton
                        color="tonal"
                        icon="slideshow"
                        onClick={() =>
                          navigate(
                            activeSetlist
                              ? `/slides?setlist=${activeSetlist.id}&song=${song.id}`
                              : `/slides?song=${song.id}`
                          )
                        }
                        className="lg:px-3 xl:px-[18px] lg:gap-1.5 xl:gap-2"
                      >
                        Slides
                      </AuroraButton>
                      <AuroraButton
                        color="filled"
                        icon="play_arrow"
                        onClick={() =>
                          navigate(
                            activeSetlist
                              ? `/song/${song.id}?setlist=${activeSetlist.id}&show=1`
                              : `/song/${song.id}?show=1`
                          )
                        }
                        className="lg:px-3 xl:px-[18px] lg:gap-1.5 xl:gap-2"
                      >
                        Show
                      </AuroraButton>
                      <AuroraIconButton
                        icon="headphones"
                        label={song.spotifyTrackId ? 'Abrir prévia no Spotify' : 'Vincular faixa do Spotify'}
                        variant={showSpotifyPreview ? 'tonal' : 'standard'}
                        onClick={() => {
                          if (song.spotifyTrackId) setShowSpotifyPreview((v) => !v);
                          else setShowSpotifyPicker(true);
                        }}
                      />
                      <AuroraIconButton
                        icon="more_vert"
                        label="Mais ações da música"
                        onClick={() => setShowMoreActions(true)}
                      />
                    </div>
                    <AuroraIconButton
                      icon="more_vert"
                      label="Mais ações da música"
                      onClick={() => setShowMoreActions(true)}
                      className="lg:hidden"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {displayedKey && (
                  <button
                    type="button"
                    onClick={() => {
                      playReferencePitch(displayedKey, { mode: 'chord', durationSec: 1.8 });
                      notify(`Tocando acorde guia ${displayedKey}`);
                    }}
                    title={
                      effectiveKeyInfo.estimated
                        ? `Tom estimado ${displayedKey} (toque para ouvir acorde guia)`
                        : `Tocar acorde de referência ${displayedKey}`
                    }
                    className={`key-ref-pill px-3.5 rounded-full border-none inline-flex items-center gap-1.5 font-mono typescale-label-sm cursor-pointer ${
                      minor
                        ? 'bg-minor-bg text-minor-ink'
                        : 'bg-primary-container text-on-primary-container'
                    }`}
                  >
                    <GsIcon name="volume_up" size={20} />
                    <span
                      key={shiftTracker.dir === 'none' ? 'init' : `${store.transpose}-${store.useFlats}`}
                      data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                      className="chord-settle"
                    >
                      Tom {displayedKey}
                    </span>
                  </button>
                )}
                {store.capo > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm font-mono">
                    Capo {store.capo}
                  </span>
                )}
                {song.rating > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warn-bg text-warn-ink typescale-label-sm tabular-nums">
                    <GsIcon name="star" size={20} filled className="text-warn-icon" />
                    <span>{song.rating}</span>
                  </span>
                )}
                <p className="typescale-body-sm sm:typescale-body-md text-on-surface-variant m-0">
                  {[
                    displayArtist || 'Artista não informado',
                    `${song.tempo} BPM`,
                    song.timeSignature,
                    song.duration ? formatDuration(song.duration) : null,
                    hasCal ? 'Rolagem calibrada' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Visual Edit Mode Toolbar vs Borderless Single-Row Rehearsal Dock */}
          {store.editMode ? (
            <div className="rounded-2xl bg-surface-container-low p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tertiary-container text-on-tertiary-container typescale-label-sm">
                    <GsIcon name="edit_note" size={20} />
                    <span>
                      {store.transpose !== 0
                        ? 'Modo edição visual (tom original)'
                        : 'Modo edição visual'}
                    </span>
                  </span>
                  <span className="hidden sm:inline-block w-px h-5 bg-outline-variant" aria-hidden="true" />
                  {undoStack.length > 0 && (
                    <span className="typescale-body-sm text-on-surface-variant font-mono tabular-nums">
                      {undoStack.length} {undoStack.length === 1 ? 'alteração' : 'alterações'}
                    </span>
                  )}
                  <AuroraButton
                    color="outlined"
                    icon="undo"
                    disabled={undoStack.length === 0}
                    onClick={handleUndo}
                  >
                    Desfazer
                  </AuroraButton>
                  <AuroraButton
                    color="outlined"
                    icon="redo"
                    disabled={redoStack.length === 0}
                    onClick={handleRedo}
                  >
                    Refazer
                  </AuroraButton>
                  <AuroraButton
                    color="tonal"
                    icon="add"
                    onClick={() =>
                      mutateDraftSong((p) => {
                        const added = addSongSection(p.sections, 'Nova seção');
                        const lastIdx = added.length - 1;
                        return {
                          ...p,
                          sections: added.map((sec, idx) =>
                            idx === lastIdx && sec.lines.every((l) => !l.trim())
                              ? { ...sec, lines: ['Nova linha'] }
                              : sec
                          ),
                        };
                      })
                    }
                  >
                    Nova seção
                  </AuroraButton>
                </div>
                <div className="flex items-center gap-2">
                  <AuroraButton color="outlined" onClick={cancelVisualEdit}>
                    Cancelar
                  </AuroraButton>
                  <AuroraButton color="filled" icon="check" onClick={saveVisualEdit}>
                    Salvar e sair
                  </AuroraButton>
                </div>
              </div>
              <p className="typescale-body-sm text-on-surface-variant m-0">
                Toque em qualquer acorde para mover ou trocar, ou toque direto em uma palavra da letra para inserir um acorde ali.
              </p>
            </div>
          ) : (
            <>
              {/* Balanced 2-row Mobile Stage Bar (< lg); in Show Mode, drops redundant nested box */}
              <div
                className={`lg:hidden space-y-2 ${
                  showMode ? '' : 'rounded-2xl stage-inset-well p-2'
                }`}
              >
                {showMode ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div
                      role="group"
                      aria-label="Transposição rápida"
                      className="inline-flex items-center justify-between sm:justify-start rounded-full bg-surface-container-high px-1 flex-shrink-0"
                    >
                      <AuroraIconButton
                        icon="remove"
                        label="Descer meio tom"
                        onClick={() => store.transposeDown()}
                      />
                      <button
                        type="button"
                        onClick={() => store.setTranspose(0)}
                        aria-label={`Tom atual ${displayedKey || store.transpose}. Ativar para restaurar tom original`}
                        className="transpose-reset-btn font-mono typescale-label-sm tabular-nums"
                        title="Restaurar tom original"
                      >
                        <span
                          key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                          data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                          className="chord-settle"
                        >
                          {displayedKey || (store.transpose > 0 ? `+${store.transpose}` : store.transpose)}
                        </span>
                      </button>
                      <AuroraIconButton
                        icon="add"
                        label="Subir meio tom"
                        onClick={() => store.transposeUp()}
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5">
                      {uniqueChords.length > 0 && (
                        <AuroraButton
                          color={chordsRefOpen ? 'tonal' : 'outlined'}
                          icon="piano"
                          aria-pressed={chordsRefOpen}
                          onClick={() => setChordsRefOpen(!chordsRefOpen)}
                          className="w-full sm:w-auto px-3 gap-1"
                        >
                          Acordes
                        </AuroraButton>
                      )}
                      <AuroraButton
                        color="outlined"
                        icon="tune"
                        onClick={() => setShowMobileControls(true)}
                        className={`w-full sm:w-auto px-3 gap-1 ${uniqueChords.length === 0 ? 'col-span-2' : ''}`}
                      >
                        Controles
                      </AuroraButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                      <AuroraButton
                        color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
                        icon={store.isAutoScrolling ? (leadInLeft > 0 ? 'hourglass_top' : 'pause') : 'play_arrow'}
                        disabled={live.isFollowing}
                        onClick={() => store.toggleAutoScroll()}
                        className="relative overflow-hidden flex-1 min-w-[84px] px-3 tabular-nums"
                      >
                        <span
                          key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
                          className="countdown-tick"
                        >
                          {scrollActionLabel}
                        </span>
                        {leadInLeft > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                            style={{
                              transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                              transition: 'transform 950ms linear',
                            }}
                          />
                        )}
                      </AuroraButton>

                      <div
                        role="group"
                        aria-label="Transposição rápida"
                        className="inline-flex items-center rounded-full bg-surface-container-high px-0.5 flex-shrink-0"
                      >
                        <button
                          type="button"
                          aria-label="Descer meio tom"
                          title="Descer meio tom"
                          onClick={() => store.transposeDown()}
                          className="dock-stepper-btn"
                        >
                          <GsIcon name="remove" size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => store.setTranspose(0)}
                          aria-label={`Tom atual ${displayedKey || store.transpose}. Ativar para restaurar tom original`}
                          className="transpose-reset-btn font-mono typescale-label-sm tabular-nums"
                          title="Restaurar tom original"
                        >
                          <span
                            key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                            data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                            className="chord-settle"
                          >
                            {displayedKey || (store.transpose > 0 ? `+${store.transpose}` : store.transpose)}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label="Subir meio tom"
                          title="Subir meio tom"
                          onClick={() => store.transposeUp()}
                          className="dock-stepper-btn"
                        >
                          <GsIcon name="add" size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {uniqueChords.length > 0 && (
                        <AuroraButton
                          color={chordsRefOpen ? 'tonal' : 'outlined'}
                          icon="piano"
                          aria-pressed={chordsRefOpen}
                          onClick={() => setChordsRefOpen(!chordsRefOpen)}
                          className="flex-auto px-2.5 gap-1"
                        >
                          Acordes
                        </AuroraButton>
                      )}
                      <AuroraButton
                        color="outlined"
                        icon="tune"
                        onClick={() => setShowMobileControls(true)}
                        className="flex-auto px-2.5 gap-1"
                      >
                        Controles
                      </AuroraButton>

                      <AuroraButton
                        color="filled"
                        icon="play_arrow"
                        onClick={() =>
                          navigate(
                            activeSetlist
                              ? `/song/${song.id}?setlist=${activeSetlist.id}&show=1`
                              : `/song/${song.id}?show=1`
                          )
                        }
                        className="flex-auto px-2.5 gap-1"
                      >
                        Show
                      </AuroraButton>
                    </div>
                  </>
                )}
              </div>

              {/* Single-Row Borderless Tonal Desktop Rehearsal Dock (lg+) */}
              <div
                className={`rehearsal-dock hidden lg:flex items-center flex-wrap gap-1 ${
                  showMode ? '' : 'rounded-2xl stage-inset-well p-1.5'
                }`}
              >
                {/* Auto-scroll */}
                <div className="inline-flex items-center rounded-full bg-surface-container-high px-0.5 flex-shrink-0">
                  {showMode ? (
                    <span className="typescale-label-sm text-on-surface-variant pl-2.5 pr-0.5">
                      Ritmo
                    </span>
                  ) : (
                    <AuroraButton
                      color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
                      icon={store.isAutoScrolling ? (leadInLeft > 0 ? 'hourglass_top' : 'pause') : 'play_arrow'}
                      disabled={live.isFollowing}
                      onClick={() => store.toggleAutoScroll()}
                      className="relative overflow-hidden min-w-[84px] tabular-nums"
                    >
                      <span
                        key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
                        className="countdown-tick"
                      >
                        {scrollActionLabel}
                      </span>
                      {leadInLeft > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                          style={{
                            transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                            transition: 'transform 950ms linear',
                          }}
                        />
                      )}
                    </AuroraButton>
                  )}
                  <button
                    type="button"
                    aria-label="Diminuir velocidade da rolagem"
                    title="Diminuir velocidade da rolagem"
                    disabled={live.isFollowing}
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.15)}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="remove" size={20} />
                  </button>
                  <span className="typescale-body-sm font-mono tabular-nums text-on-surface-variant min-w-[30px] text-center">
                    {store.autoScrollSpeed.toFixed(1)}x
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar velocidade da rolagem"
                    title="Aumentar velocidade da rolagem"
                    disabled={live.isFollowing}
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.15)}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="add" size={20} />
                  </button>
                  {speedChanged && !live.isFollowing && (
                    <AuroraButton
                      color="text"
                      onClick={() => {
                        patchMeta(song.id, 'scroll', Number(store.autoScrollSpeed.toFixed(2)));
                        notify(`Ritmo de rolagem salvo em ${store.autoScrollSpeed.toFixed(1)}x.`);
                      }}
                      className="panel-settle px-2"
                    >
                      Salvar
                    </AuroraButton>
                  )}
                </div>

                {/* Transpose */}
                <div
                  role="group"
                  aria-label="Transposição de tonalidade"
                  className="inline-flex items-center rounded-full bg-surface-container-high px-0.5 flex-shrink-0"
                >
                  <button
                    type="button"
                    aria-label="Descer meio tom"
                    title="Descer meio tom"
                    onClick={() => store.transposeDown()}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="remove" size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => store.setTranspose(0)}
                    aria-label={`Tom atual ${displayedKey || `${store.transpose} semitons`}. Ativar para restaurar tom original`}
                    className="transpose-reset-btn font-mono typescale-label-sm tabular-nums"
                    title="Restaurar tom original"
                  >
                    <span
                      key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                      data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                      className="chord-settle"
                    >
                      {displayedKey
                        ? store.transpose === 0
                          ? displayedKey
                          : `${displayedKey} (${store.transpose > 0 ? `+${store.transpose}` : store.transpose})`
                        : `${store.transpose > 0 ? `+${store.transpose}` : store.transpose} st`}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Subir meio tom"
                    title="Subir meio tom"
                    onClick={() => store.transposeUp()}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="add" size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label="Usar bemóis"
                    aria-pressed={store.useFlats}
                    title="Alternar bemóis e sustenidos"
                    onClick={() => store.toggleFlats()}
                    data-variant={store.useFlats ? 'tonal' : undefined}
                    className="dock-stepper-btn font-mono typescale-label-lg"
                  >
                    <span key={store.useFlats ? 'flat' : 'sharp'} className="chord-settle">
                      {store.useFlats ? '♭' : '♯'}
                    </span>
                  </button>
                  {store.transpose !== 0 && (
                    <AuroraButton
                      color="primary-tonal"
                      icon="save"
                      onClick={handleSavePermanentTranspose}
                      className="panel-settle"
                    >
                      Fixar {displayedKey || `${store.transpose > 0 ? '+' : ''}${store.transpose}`}
                    </AuroraButton>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <AuroraSegmented<DisplayMode>
                    ariaLabel="Modo de leitura da cifra"
                    value={displayMode}
                    onChange={setDisplayMode}
                    options={[
                      { value: 'both', label: 'Cifra' },
                      { value: 'lyrics-only', label: 'Letra' },
                      { value: 'chords-only', label: 'Acordes' },
                    ]}
                  />
                </div>

                <div className="inline-flex items-center rounded-full bg-surface-container-high px-0.5 flex-shrink-0">
                  <button
                    type="button"
                    aria-label="Diminuir fonte"
                    title="Diminuir fonte"
                    disabled={fontSize <= 70}
                    onClick={() => setFontSize(fontSize - 10)}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="text_decrease" size={20} />
                  </button>
                  <span className="typescale-body-sm font-mono tabular-nums text-on-surface-variant px-0.5">
                    {fontSize}%
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar fonte"
                    title="Aumentar fonte"
                    disabled={fontSize >= 160}
                    onClick={() => setFontSize(fontSize + 10)}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="text_increase" size={20} />
                  </button>
                  <span className="w-px h-5 bg-outline-variant mx-0.5" aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="Layout em 2 colunas"
                    title="Alternar 1 ou 2 colunas"
                    data-variant={sheetColumns === 2 ? 'tonal' : undefined}
                    aria-pressed={sheetColumns === 2}
                    onClick={() => setSheetColumns(sheetColumns === 2 ? 1 : 2)}
                    className="dock-stepper-btn"
                  >
                    <GsIcon name="view_column_2" size={20} />
                  </button>
                </div>

                <MetronomeControl
                  beatsPerBar={beatsPerBar}
                  savedTempo={song.tempo}
                  tempoConfirmed={song.tempoConfirmed}
                  readOnly={live.isFollowing}
                  compactCountIn={!showSidebar}
                  onCountIn={showMode ? undefined : () => setCountInOpen(true)}
                  onSaveBpm={(nextBpm) => {
                    patchMeta(song.id, 'tempo', nextBpm);
                    notify(`BPM salvo em ${nextBpm}.`);
                  }}
                />

                {uniqueChords.length > 0 && (
                  <AuroraButton
                    color={chordsRefOpen ? 'tonal' : 'outlined'}
                    icon="piano"
                    aria-pressed={chordsRefOpen}
                    onClick={() => setChordsRefOpen(!chordsRefOpen)}
                    className={`${showSidebar ? 'xl:hidden ' : ''}flex-shrink-0`}
                  >
                    Acordes ({uniqueChords.length})
                  </AuroraButton>
                )}

                {store.capo > 0 && (
                  <AuroraChip
                    selected={capoDisplay === 'shapes'}
                    onClick={() =>
                      setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')
                    }
                    className="flex-shrink-0"
                  >
                    {capoDisplay === 'shapes' ? 'Formas no capo' : 'Som real'}
                  </AuroraChip>
                )}

                {activeSetlist && (
                  <>
                    <AuroraButton
                      color={live.isLeading ? 'danger' : live.isFollowing ? 'tonal' : 'outlined'}
                      icon="sensors"
                      onClick={handleGoLive}
                      title={
                        live.isLeading
                          ? 'Parar de liderar sessão ao vivo'
                          : live.isFollowing
                            ? `Deixar de seguir ${live.session.leaderName || 'o líder'}`
                            : live.hasRemoteLeader && live.localUnfollow
                              ? `Voltar a seguir ${live.session.leaderName || 'o líder'}`
                              : 'Iniciar sessão ao vivo como líder'
                      }
                      className="flex-shrink-0"
                    >
                      {live.isLeading
                        ? 'Liderando'
                        : live.isFollowing
                          ? `Seguindo ${live.session.leaderName || 'líder'}`
                          : live.hasRemoteLeader && live.localUnfollow
                            ? 'Seguir líder'
                            : 'Ao vivo'}
                    </AuroraButton>
                    {live.hasRemoteLeader && (
                      <AuroraButton
                        color="outlined"
                        onClick={() => {
                          const savedName = localStorage.getItem('jamshelf-device-name') || 'Líder';
                          live.startLeading(savedName);
                          notify(`Você assumiu a liderança como ${savedName}.`);
                        }}
                        className="flex-shrink-0"
                      >
                        Assumir
                      </AuroraButton>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {visualPulseEnabled && <VisualBeatStrip beatsPerBar={beatsPerBar} />}
        </section>
      )}

      {/* Universal Live Session Status Strip (visible in Normal, Show, and Focus modes across all viewports) */}
      {activeSetlist && (live.isLeading || live.isFollowing || live.liveError) && (
        <div
          role={live.liveError ? 'alert' : 'status'}
          aria-live="polite"
          className={`panel-settle rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
            live.liveError
              ? 'bg-error-container text-on-error-container'
              : live.isLeading
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-secondary-container text-on-secondary-container'
          }`}
        >
          <span className="inline-flex items-center gap-2 typescale-label-lg min-w-0">
            <GsIcon name="sensors" size={20} />
            <span className="truncate">
              {live.liveError
                ? live.liveError
                : live.isLeading
                  ? `Liderando sessão ao vivo (${live.deviceName || 'Líder'})`
                  : live.isLeaderStale
                    ? `Seguindo ${live.session.leaderName || 'líder'} (sinal sem resposta recente)`
                    : `Seguindo ${live.session.leaderName || 'líder'} ao vivo (rolagem sincronizada)`}
            </span>
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {live.isFollowing && (
              <AuroraButton
                color="outlined"
                onClick={() => {
                  live.unfollow();
                  notify('Você deixou de seguir o líder ao vivo.');
                }}
              >
                Deixar de seguir
              </AuroraButton>
            )}
            {live.hasRemoteLeader && (
              <AuroraButton
                color="tonal"
                onClick={() => {
                  const savedName = localStorage.getItem('jamshelf-device-name') || 'Líder';
                  live.startLeading(savedName);
                  notify(`Você assumiu a liderança como ${savedName}.`);
                }}
              >
                Assumir liderança
              </AuroraButton>
            )}
            {live.isLeading && (
              <AuroraButton
                color="danger"
                onClick={() => {
                  live.stopLeading();
                  notify('Você parou de liderar a sessão ao vivo.');
                }}
              >
                Parar
              </AuroraButton>
            )}
          </div>
        </div>
      )}

      {/* Calibration Bar ("Gravar rolagem") via inline expansion */}
      <AuroraCollapsible open={calibrating}>
        <div className="pb-1">
          <CalibrationBanner
            sections={song.sections}
            elapsedSec={calElapsedSec}
            marks={calMarks}
            nextSectionIdx={calNextIdx}
            onMarkNext={() => calNextIdx < song.sections.length && stampSection(calNextIdx)}
            onSave={saveCalibration}
            onCancel={() => setCalibrating(false)}
          />
        </div>
      </AuroraCollapsible>

      {/* Spotify Embedded Player & Suggestion Banner */}
      {!focusMode && !showMode && !store.editMode && (
        <SpotifyPanel
          songTitle={displayTitle}
          songArtist={displayArtist}
          spotifyTrackId={song.spotifyTrackId}
          showPreview={showSpotifyPreview}
          showPicker={showSpotifyPicker}
          onSelectTrack={handleSelectSpotify}
          onClearTrack={handleClearSpotify}
          onClosePicker={() => setShowSpotifyPicker(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
            className="dock-enter-bottom inverse-snackbar pointer-events-auto w-full max-w-md rounded-2xl bg-inverse-surface text-inverse-on-surface px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <span className="typescale-body-md">{toast.msg}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {toast.undoText && (
                <AuroraButton
                  color="text"
                  className="text-inverse-primary"
                  onClick={() => {
                    updateEntry(song.id, toast.undoText!);
                    setToast(null);
                  }}
                >
                  Desfazer
                </AuroraButton>
              )}
              <AuroraIconButton
                icon="close"
                label="Fechar notificação"
                className="text-inverse-on-surface"
                onClick={() => setToast(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stage notes */}
      {!focusMode && (song.notes || editingNotes) && (
        <section
          aria-label="Notas de palco"
          className="rounded-2xl bg-warn-bg text-warn-ink px-4 py-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 typescale-label-lg">
              <GsIcon name="sticky_note_2" size={20} />
              <span>Notas de palco</span>
            </span>
            {!editingNotes && (
              <AuroraButton
                color="text"
                icon="edit"
                onClick={() => {
                  setNotesDraft(song.notes);
                  setEditingNotes(true);
                }}
              >
                Editar
              </AuroraButton>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                aria-label="Editar notas de palco"
                rows={2}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Ex.: Começa só violão, entra bateria no 2o refrão..."
                className="stage-field"
              />
              <div className="flex justify-end gap-2">
                <AuroraButton color="outlined" onClick={() => setEditingNotes(false)}>
                  Cancelar
                </AuroraButton>
                <AuroraButton
                  color="filled"
                  onClick={() => {
                    patchMeta(song.id, 'notes', notesDraft.trim());
                    setEditingNotes(false);
                    notify('Notas de palco atualizadas.');
                  }}
                >
                  Salvar nota
                </AuroraButton>
              </div>
            </div>
          ) : (
            <p className="typescale-body-md m-0">{song.notes}</p>
          )}
        </section>
      )}

      {/* Section jump strip (semantic in-page nav links + reduced-motion scroll) */}
      {!showMode && !focusMode && song.sections.length > 1 && (
        <div className="flex items-start justify-between gap-2">
          <nav
            ref={sectionNavRef}
            aria-label="Navegação por seções da música"
            className="min-w-0 flex-1 flex items-center gap-1.5 -mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 overflow-x-auto md:overflow-visible md:flex-wrap no-scrollbar pb-0.5"
          >
            {song.sections.map((sec, idx) => (
              <a
                key={`${sec.label}-${idx}`}
                href={`#song-section-${idx}`}
                aria-current={activeSectionIdx === idx ? 'location' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSectionIdx(idx);
                  setJumpedSectionIdx(idx);
                  if (jumpHighlightTimerRef.current) window.clearTimeout(jumpHighlightTimerRef.current);
                  jumpHighlightTimerRef.current = window.setTimeout(() => setJumpedSectionIdx(null), 650);
                  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  const targetEl = document.getElementById(`song-section-${idx}`);
                  targetEl?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
                  targetEl?.focus({ preventScroll: true });
                }}
                className="stage-chip typescale-label-lg"
              >
                {sectionChipLabels[idx]}
              </a>
            ))}
          </nav>

          {!song.notes && !editingNotes && !store.editMode && (
            <AuroraChip
              icon="sticky_note_2"
              onClick={() => {
                setNotesDraft('');
                setEditingNotes(true);
              }}
              className="hidden sm:inline-flex flex-shrink-0 border-outline-variant bg-surface-container-low"
            >
              Nota de palco
            </AuroraChip>
          )}
        </div>
      )}

      {/* Mobile/tablet chords strip via inline expansion */}
      {!store.editMode && uniqueChords.length > 0 && (
        <AuroraCollapsible open={chordsRefOpen} className={showSidebar ? 'xl:hidden' : undefined}>
          <div className="pb-1">
            <section
              aria-label="Acordes usados nesta música"
              className="stage-card p-4 space-y-2"
            >
              <div className="typescale-label-sm text-on-surface-variant">
                Toque em qualquer acorde para abrir violão, teclado e áudio guia
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueChords.map((c) => (
                  <AuroraChip
                    key={c}
                    selected={store.activeChord === c}
                    onClick={() => handleSelectChord(c)}
                  >
                    <span
                      key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                      data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                      className="chord-settle font-mono"
                    >
                      {c}
                    </span>
                  </AuroraChip>
                ))}
              </div>
            </section>
          </div>
        </AuroraCollapsible>
      )}

      {/* Main chord sheet + desktop Studio Sidebar */}
      <div className={showSidebar ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_336px] xl:items-start gap-6' : ''}>
        <article
          aria-label={`Cifra de ${song.title}`}
          className={
            sheetColumns === 2 && !store.editMode
              ? 'columns-1 lg:columns-2 gap-4 space-y-4'
              : 'space-y-4'
          }
        >
          {song.sections.map((sec, idx) => (
            <SongSectionCard
              key={`${sec.label}-${idx}`}
              section={sec}
              sectionIdx={idx}
              totalSections={song.sections.length}
              displayMode={displayMode}
              totalShift={totalShift}
              useFlats={store.useFlats}
              shiftDir={shiftTracker.dir}
              shiftKey={`${totalShift}-${store.useFlats}`}
              fontSize={fontSize}
              activeChord={store.activeChord}
              editMode={store.editMode}
              calibrating={calibrating}
              calibrationMark={calibrating ? calMarks[idx] ?? null : song.sectionMarks?.[idx] ?? null}
              isJumpTarget={jumpedSectionIdx === idx}
              onCalibrateStamp={stampSection}
              onSelectChord={handleSelectChord}
              onEditChord={(si, li, segIdx, chord) => {
                setAddChordEdit(null);
                setSelectedChordEdit({ sectionIdx: si, lineIdx: li, segIdx, chord });
              }}
              onAddChord={(si, li, charPos) => {
                setSelectedChordEdit(null);
                setAddChordEdit({ sectionIdx: si, lineIdx: li, charPos });
              }}
              onEditLineText={(si, li, nextRaw) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: p.sections.map((s, sIdx) =>
                    sIdx === si
                      ? { ...s, lines: s.lines.map((l, lIdx) => (lIdx === li ? nextRaw : l)) }
                      : s
                  ),
                }))
              }
              onAddLine={(si) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: p.sections.map((s, sIdx) =>
                    sIdx === si ? { ...s, lines: [...s.lines, 'Nova linha'] } : s
                  ),
                }))
              }
              onRenameSection={(si, nextLabel) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: renameSongSection(p.sections, si, nextLabel),
                }))
              }
              onMoveSection={(si, dir) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: moveSongSection(p.sections, si, dir),
                }))
              }
              onDuplicateSection={(si) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: duplicateSongSection(p.sections, si),
                }))
              }
              onRemoveSection={(si) =>
                mutateDraftSong((p) => ({
                  ...p,
                  sections: removeSongSection(p.sections, si),
                }))
              }
            />
          ))}
        </article>

        {showSidebar && (
          <aside
            aria-label="Painel lateral de acordes e sequência"
            className="hidden xl:flex flex-col gap-4 sticky top-6"
          >
            {uniqueChords.length > 0 && (
              <div className="stage-card p-5 space-y-4">
                <h2 className="typescale-title-md text-on-surface m-0">
                  Acordes da música ({uniqueChords.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueChords.map((c) => (
                    <AuroraChip
                      key={c}
                      selected={railChord === c}
                      onClick={() => store.setActiveChord(c)}
                    >
                      <span
                        key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                        data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                        className="chord-settle font-mono"
                      >
                        {c}
                      </span>
                    </AuroraChip>
                  ))}
                </div>
                {railChord && <ChordInspectorContent chord={railChord} />}
              </div>
            )}

            {activeSetlist && setlistSongs.length > 0 && (
              <div className="stage-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="typescale-title-md text-on-surface m-0 truncate">
                    {activeSetlist.name}
                  </h2>
                  <span className="typescale-body-sm text-on-surface-variant font-mono">
                    {currentIdx + 1}/{setlistSongs.length}
                  </span>
                </div>
                <ol className="m-0 p-0 list-none space-y-1 max-h-64 overflow-y-auto">
                  {setlistSongs.map((s, idx) => {
                    const current = s.id === song.id;
                    const sInfo = getDisplayTitleAndArtist(s);
                    const sKey = getEffectiveKey(s).key;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-current={current ? 'true' : undefined}
                          onClick={() => navigate(`/song/${s.id}?setlist=${activeSetlist.id}`)}
                          className={`stage-list-row w-full min-h-[44px] px-3 py-1.5 rounded-xl border-none flex items-center justify-between gap-2 text-left cursor-pointer ${
                            current
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-transparent text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          <span className="typescale-body-md truncate">
                            <span className="font-mono text-on-surface-variant mr-1.5">{idx + 1}.</span>
                            {sInfo.title}
                          </span>
                          {sKey && (
                            <span className="typescale-body-sm font-mono flex-shrink-0">
                              {sKey}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* More Actions Sheet (Visual Edit, Calibration, Spotify, AI Review, Source, History, Setlist, Notes) */}
      <AuroraSheet
        open={showMoreActions}
        onClose={() => setShowMoreActions(false)}
        title="Ações da música"
        subtitle={song.title}
      >
        <div className="flex flex-col gap-2">
          <div className="lg:hidden flex flex-col gap-2 pb-2 border-b border-outline-variant">
            <AuroraButton
              color="outlined"
              icon="fullscreen"
              onClick={() => {
                setShowMoreActions(false);
                setFocusMode(true);
              }}
            >
              Tela limpa
            </AuroraButton>
            <AuroraButton
              color="tonal"
              icon="slideshow"
              onClick={() => {
                setShowMoreActions(false);
                navigate(
                  activeSetlist
                    ? `/slides?setlist=${activeSetlist.id}&song=${song.id}`
                    : `/slides?song=${song.id}`
                );
              }}
            >
              Abrir em Slides
            </AuroraButton>
            <AuroraButton
              color="primary-tonal"
              icon="play_arrow"
              onClick={() => {
                setShowMoreActions(false);
                navigate(
                  activeSetlist
                    ? `/song/${song.id}?setlist=${activeSetlist.id}&show=1`
                    : `/song/${song.id}?show=1`
                );
              }}
            >
              Entrar no Modo show
            </AuroraButton>
          </div>

          <AuroraButton
            color="outlined"
            icon="edit_note"
            onClick={() => {
              setShowMoreActions(false);
              enterVisualEdit();
            }}
          >
            Editar acordes e seções (visual)
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="tune"
            onClick={() => {
              setShowMoreActions(false);
              setShowMetaDialog(true);
            }}
          >
            Editar título, tom, capo, BPM e estrelas
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="timer"
            disabled={song.sections.length < 2}
            onClick={() => {
              setShowMoreActions(false);
              startCalibration();
            }}
          >
            {hasCal ? 'Recalibrar rolagem por seção' : 'Gravar rolagem por seção'}
          </AuroraButton>
          {hasCal && (
            <AuroraButton
              color="text"
              icon="delete_sweep"
              onClick={() => {
                setShowMoreActions(false);
                clearCalibration();
              }}
            >
              Limpar calibração salva
            </AuroraButton>
          )}
          <AuroraButton
            color="outlined"
            icon="headphones"
            onClick={() => {
              setShowMoreActions(false);
              setShowSpotifyPicker(true);
            }}
          >
            {song.spotifyTrackId ? 'Trocar faixa do Spotify' : 'Vincular faixa do Spotify'}
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="auto_awesome"
            onClick={() => {
              setShowMoreActions(false);
              setShowEnhance(true);
            }}
          >
            Revisar cifra com IA
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="code"
            onClick={() => {
              setShowMoreActions(false);
              handleOpenSource();
            }}
          >
            Editar código ChordPro (.cho)
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="history"
            onClick={() => {
              setShowMoreActions(false);
              setShowHistory(true);
            }}
          >
            Histórico de versões
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="playlist_add"
            onClick={() => {
              setShowMoreActions(false);
              setShowAddToSetlist(true);
            }}
          >
            Adicionar a um setlist
          </AuroraButton>
          <AuroraButton
            color="outlined"
            icon="sticky_note_2"
            onClick={() => {
              setShowMoreActions(false);
              setNotesDraft(song.notes);
              setEditingNotes(true);
            }}
          >
            {song.notes ? 'Editar nota de palco' : 'Adicionar nota de palco'}
          </AuroraButton>
        </div>
      </AuroraSheet>

      {/* Quick Setlist Drawer (shortcut S) */}
      {activeSetlist && (
        <AuroraSheet
          open={showSetlistDrawer}
          onClose={() => setShowSetlistDrawer(false)}
          title={activeSetlist.name}
          subtitle={
            setlistSongs.length === 1
              ? '1 música na sequência'
              : `${setlistSongs.length} músicas na sequência`
          }
        >
          <ol className="m-0 p-0 list-none space-y-1.5">
            {setlistSongs.map((s, idx) => {
              const current = s.id === song.id;
              const sInfo = getDisplayTitleAndArtist(s);
              const sKey = getEffectiveKey(s).key;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      setShowSetlistDrawer(false);
                      navigate(
                        `/song/${s.id}?setlist=${activeSetlist.id}${showMode ? '&show=1' : ''}`
                      );
                    }}
                    className={`stage-list-row w-full min-h-[48px] px-4 py-2.5 rounded-2xl border-none flex items-center justify-between gap-3 text-left cursor-pointer ${
                      current
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="typescale-title-md truncate">
                      {idx + 1}. {sInfo.title}
                    </span>
                    <span className="typescale-label-sm font-mono flex-shrink-0">
                      {sKey || '-'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </AuroraSheet>
      )}

      {/* Mobile full stage controls sheet */}
      <AuroraSheet
        open={showMobileControls}
        onClose={() => setShowMobileControls(false)}
        title="Controles de palco"
        subtitle={displayTitle}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Modo de leitura</div>
            <AuroraSegmented<DisplayMode>
              ariaLabel="Modo de leitura da cifra no celular"
              value={displayMode}
              onChange={setDisplayMode}
              options={[
                { value: 'both', label: 'Cifra' },
                { value: 'lyrics-only', label: 'Letra' },
                { value: 'chords-only', label: 'Acordes' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Metrônomo e contagem</div>
            <div className="flex flex-wrap items-center gap-2">
              <MetronomeControl
                beatsPerBar={beatsPerBar}
                savedTempo={song.tempo}
                tempoConfirmed={song.tempoConfirmed}
                readOnly={live.isFollowing}
                onSaveBpm={(nextBpm) => {
                  patchMeta(song.id, 'tempo', nextBpm);
                  notify(`BPM salvo em ${nextBpm}.`);
                }}
              />
              <AuroraButton
                color="outlined"
                icon="looks_4"
                onClick={() => {
                  setShowMobileControls(false);
                  setCountInOpen(true);
                }}
              >
                Contagem
              </AuroraButton>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="typescale-label-lg text-on-surface">Velocidade de rolagem</span>
              <span
                aria-live="polite"
                className="typescale-body-sm font-mono tabular-nums text-on-surface-variant"
              >
                {store.autoScrollSpeed.toFixed(1)}x
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AuroraButton
                color="outlined"
                disabled={live.isFollowing}
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.15)}
              >
                Mais devagar
              </AuroraButton>
              <AuroraButton
                color="outlined"
                disabled={live.isFollowing}
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.15)}
              >
                Mais rápido
              </AuroraButton>
              {speedChanged && !live.isFollowing && (
                <AuroraButton
                  color="tonal"
                  icon="save"
                  onClick={() => {
                    patchMeta(song.id, 'scroll', Number(store.autoScrollSpeed.toFixed(2)));
                    notify(`Ritmo de rolagem salvo em ${store.autoScrollSpeed.toFixed(1)}x.`);
                  }}
                >
                  Salvar ritmo
                </AuroraButton>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="typescale-label-lg text-on-surface">Tamanho da cifra</span>
              <span
                aria-live="polite"
                className="typescale-body-sm font-mono tabular-nums text-on-surface-variant"
              >
                {fontSize}%
              </span>
            </div>
            <div role="group" aria-label="Tamanho da cifra" className="flex items-center gap-2">
              <AuroraButton
                color="outlined"
                aria-label="Diminuir tamanho da cifra"
                disabled={fontSize <= 70}
                onClick={() => setFontSize(fontSize - 10)}
              >
                A-
              </AuroraButton>
              <AuroraButton
                color={fontSize === 100 ? 'tonal' : 'outlined'}
                aria-label="Restaurar tamanho da cifra para 100%"
                aria-pressed={fontSize === 100}
                onClick={() => setFontSize(100)}
              >
                100%
              </AuroraButton>
              <AuroraButton
                color="outlined"
                aria-label="Aumentar tamanho da cifra"
                disabled={fontSize >= 160}
                onClick={() => setFontSize(fontSize + 10)}
              >
                A+
              </AuroraButton>
            </div>
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Notação e capo</div>
            <div className="flex flex-wrap items-center gap-2">
              <AuroraButton
                color={store.useFlats ? 'tonal' : 'outlined'}
                aria-pressed={store.useFlats}
                onClick={() => store.toggleFlats()}
              >
                {store.useFlats ? 'Usando bemóis (♭)' : 'Usando sustenidos (♯)'}
              </AuroraButton>
              {store.capo > 0 && (
                <AuroraButton
                  color={capoDisplay === 'shapes' ? 'tonal' : 'outlined'}
                  aria-pressed={capoDisplay === 'shapes'}
                  onClick={() =>
                    setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')
                  }
                >
                  {capoDisplay === 'shapes'
                    ? `Formas no capo ${store.capo}`
                    : `Som real (capo ${store.capo})`}
                </AuroraButton>
              )}
            </div>
          </div>

          {activeSetlist && (
            <div className="space-y-2">
              <div className="typescale-label-lg text-on-surface">Sessão ao vivo</div>
              <div className="flex flex-wrap items-center gap-2">
                <AuroraButton
                  color={live.isLeading ? 'danger' : live.isFollowing ? 'tonal' : 'outlined'}
                  icon="sensors"
                  onClick={handleGoLive}
                >
                  {live.isLeading
                    ? 'Parar de liderar'
                    : live.isFollowing
                      ? `Deixar de seguir ${live.session.leaderName || 'líder'}`
                      : live.hasRemoteLeader && live.localUnfollow
                        ? `Seguir ${live.session.leaderName || 'líder'}`
                        : 'Iniciar sessão como líder'}
                </AuroraButton>
                {live.hasRemoteLeader && (
                  <AuroraButton
                    color="outlined"
                    onClick={() => {
                      const savedName = localStorage.getItem('jamshelf-device-name') || 'Líder';
                      live.startLeading(savedName);
                      notify(`Você assumiu a liderança como ${savedName}.`);
                    }}
                  >
                    Assumir liderança
                  </AuroraButton>
                )}
              </div>
            </div>
          )}

          {store.transpose !== 0 && (
            <div className="pt-2">
              <AuroraButton
                color="primary-tonal"
                icon="save"
                onClick={() => {
                  setShowMobileControls(false);
                  handleSavePermanentTranspose();
                }}
              >
                Fixar {displayedKey || `${store.transpose > 0 ? '+' : ''}${store.transpose}`}
              </AuroraButton>
            </div>
          )}
        </div>
      </AuroraSheet>

      {/* Unsaved edits guard for Visual Edit Mode */}
      <AuroraDialog
        open={confirmDiscardEdit}
        onClose={() => setConfirmDiscardEdit(false)}
        title="Descartar alterações não salvas?"
        subtitle={`Você tem ${undoStack.length} ${undoStack.length === 1 ? 'alteração pendente' : 'alterações pendentes'} no modo edição visual.`}
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmDiscardEdit(false)}>
            Continuar editando
          </AuroraButton>
          <AuroraButton color="danger" onClick={performCancelVisualEdit}>
            Descartar
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Unsaved edits guard for Source ChordPro Editor */}
      <AuroraDialog
        open={confirmDiscardSource}
        onClose={() => setConfirmDiscardSource(false)}
        title="Descartar alterações no código ChordPro?"
        subtitle="Você alterou o texto da cifra. Sair agora descarta o que ainda não foi salvo."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmDiscardSource(false)}>
            Continuar editando
          </AuroraButton>
          <AuroraButton
            color="danger"
            onClick={() => {
              setConfirmDiscardSource(false);
              setShowSource(false);
            }}
          >
            Descartar
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Visual Chord Editor Modal with live lyric line preview */}
      <VisualChordEditModal
        selected={selectedChordEdit}
        addTarget={addChordEdit}
        activeLine={activeEditLine}
        songChords={rawUniqueChords}
        onMove={(si, li, segIdx, dir) => {
          mutateDraftSong((p) => {
            const line = p.sections[si]?.lines[li];
            if (line === undefined) return p;
            const res = moveChordWithIndex(line, segIdx, dir);
            setSelectedChordEdit((curr) =>
              curr ? { ...curr, segIdx: res.nextSegIdx } : curr
            );
            return {
              ...p,
              sections: p.sections.map((s, idx) =>
                idx === si
                  ? { ...s, lines: s.lines.map((l, lIdx) => (lIdx === li ? res.line : l)) }
                  : s
              ),
            };
          });
        }}
        onRename={(si, li, segIdx, nextChord) => {
          mutateDraftSong((p) => ({
            ...p,
            sections: p.sections.map((s, idx) =>
              idx === si
                ? {
                    ...s,
                    lines: s.lines.map((l, lIdx) =>
                      lIdx === li ? renameChord(l, segIdx, nextChord) : l
                    ),
                  }
                : s
            ),
          }));
        }}
        onDelete={(si, li, segIdx) => {
          mutateDraftSong((p) => ({
            ...p,
            sections: p.sections.map((s, idx) =>
              idx === si
                ? {
                    ...s,
                    lines: s.lines.map((l, lIdx) => (lIdx === li ? deleteChord(l, segIdx) : l)),
                  }
                : s
            ),
          }));
          notify('Acorde removido. Use Desfazer para restaurar.');
        }}
        onInsert={(si, li, charPos, chord) => {
          mutateDraftSong((p) => ({
            ...p,
            sections: p.sections.map((s, idx) =>
              idx === si
                ? {
                    ...s,
                    lines: s.lines.map((l, lIdx) =>
                      lIdx === li ? insertChord(l, charPos, chord) : l
                    ),
                  }
                : s
            ),
          }));
        }}
        onClose={() => {
          setSelectedChordEdit(null);
          setAddChordEdit(null);
        }}
      />

      {/* Song Metadata & Rating Dialog */}
      <SongMetaDialog
        open={showMetaDialog}
        song={song}
        onClose={() => setShowMetaDialog(false)}
        onSave={(upd) => {
          patchMeta(song.id, 'title', upd.title);
          patchMeta(song.id, 'artist', upd.artist);
          if (upd.key) patchMeta(song.id, 'key', upd.key);
          patchMeta(song.id, 'capo', upd.capo);
          patchMeta(song.id, 'tempo', upd.tempo);
          if (upd.durationSec !== null) patchMeta(song.id, 'duration', upd.durationSec);
          patchMeta(song.id, 'rating', upd.rating);
          store.setCapo(upd.capo);
          store.setBpm(upd.tempo);
          notify('Dados da música atualizados.');
        }}
      />

      <ChordInspectorSheet
        chord={chordSheetModalOpen ? store.activeChord : null}
        onClose={() => {
          setChordSheetModalOpen(false);
          store.setActiveChord(null);
        }}
      />

      {countInOpen && (
        <CountInModal
          bpm={store.bpm}
          beats={beatsPerBar}
          onDone={() => setCountInOpen(false)}
        />
      )}

      <EnhanceDialog
        open={showEnhance}
        songId={song.id}
        onClose={() => setShowEnhance(false)}
        onApplied={() => notify('Cifra atualizada com a revisão da IA.')}
      />

      <VersionHistoryDialog
        open={showHistory}
        songId={song.id}
        onClose={() => setShowHistory(false)}
        onRestore={(text) => {
          const prevText = rawEntry?.text;
          updateEntry(song.id, text);
          notify('Versão anterior restaurada.', prevText);
        }}
      />

      <AuroraSheet
        open={showAddToSetlist}
        onClose={() => setShowAddToSetlist(false)}
        title="Adicionar ao setlist"
        subtitle={song.title}
      >
        <div className="space-y-2">
          {setlists.length === 0 ? (
            <AuroraButton
              color="filled"
              icon="add"
              onClick={() => {
                setShowAddToSetlist(false);
                navigate('/?tab=setlists');
              }}
            >
              Criar primeiro setlist
            </AuroraButton>
          ) : (
            setlists.map((sl) => {
              const already = sl.songIds.includes(song.id);
              return (
                <button
                  key={sl.id}
                  type="button"
                  disabled={already}
                  onClick={() => {
                    addSongToSetlist(sl.id, song.id);
                    notify(`Adicionada em "${sl.name}".`);
                    setShowAddToSetlist(false);
                  }}
                  className="stage-list-row w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-surface-container-low hover:bg-surface-container-high border-none flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-60"
                >
                  <span className="typescale-label-lg text-on-surface truncate">{sl.name}</span>
                  <span className="typescale-body-sm text-on-surface-variant">
                    {already
                      ? 'Já incluída'
                      : sl.songIds.length === 1
                        ? '1 música'
                        : `${sl.songIds.length} músicas`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </AuroraSheet>

      <AuroraDialog
        open={showSource}
        onClose={handleRequestCloseSource}
        title="Fonte ChordPro (.cho)"
        subtitle="Edite diretivas, seções e acordes diretamente com prévia em tempo real"
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AuroraSegmented<'split' | 'edit' | 'preview'>
              ariaLabel="Visualização do editor"
              value={sourceTab}
              onChange={setSourceTab}
              options={[
                { value: 'split', label: 'Lado a lado' },
                { value: 'edit', label: 'Código' },
                { value: 'preview', label: 'Prévia' },
              ]}
            />
            <div className="flex items-center gap-2">
              <AuroraButton
                color="outlined"
                icon="content_copy"
                onClick={async () => {
                  const ok = await copyText(sourceDraft);
                  notify(ok ? 'ChordPro copiado.' : 'Falha ao copiar.');
                }}
              >
                Copiar .cho
              </AuroraButton>
              <AuroraButton
                color="filled"
                icon="check"
                disabled={!sourceDraft.trim()}
                onClick={handleSaveSource}
              >
                Salvar alterações
              </AuroraButton>
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              sourceTab === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {sourceTab !== 'preview' && (
              <textarea
                aria-label="Editor de texto ChordPro"
                rows={18}
                value={sourceDraft}
                onChange={(e) => setSourceDraft(e.target.value)}
                className="stage-field font-mono text-xs resize-y"
              />
            )}
            {sourceTab !== 'edit' && sourcePreviewSong && (
              <div className="rounded-2xl bg-surface-container-low p-4 max-h-[54dvh] overflow-y-auto space-y-3">
                {sourcePreviewSong.sections.map((sec, si) => (
                  <div key={si} className="space-y-2">
                    <div className="typescale-label-sm text-primary">{sec.label}</div>
                    {sec.lines.map((l, li) => {
                      if (!l.trim()) return <div key={li} className="h-1.5" />;
                      const segs = parseLine(l);
                      return (
                        <div key={li} className="pt-4 leading-[1.4] typescale-body-sm">
                          {segs.map((seg, sgi) => {
                            if (!seg.chord) {
                              return (
                                <span key={sgi} className="text-on-surface whitespace-pre-wrap">
                                  {seg.text}
                                </span>
                              );
                            }
                            const hasLyrics = seg.text.trim().length > 0;
                            if (!hasLyrics) {
                              return (
                                <span
                                  key={sgi}
                                  className="relative inline-block leading-none mr-3"
                                  style={{ minWidth: `${Math.max(seg.chord.length + 0.5, 2.5)}ch` }}
                                >
                                  <span className="font-mono font-bold text-primary text-xs absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap">
                                    {seg.chord}
                                  </span>
                                  <span className="text-on-surface whitespace-pre leading-[1.4]">
                                    {seg.text || '\u00A0'}
                                  </span>
                                </span>
                              );
                            }
                            const prevEndedSpace = sgi > 0 && /\s$/.test(segs[sgi - 1].text);
                            const wm = seg.text.match(/^(\s*)(\S+)(.*)$/);
                            const rawLead = wm ? wm[1] : '';
                            const leadSpace = sgi === 0 || prevEndedSpace ? '' : rawLead;
                            const anchor = wm ? wm[2] : seg.text;
                            const tail = wm ? wm[3] : '';
                            return (
                              <span key={sgi}>
                                {leadSpace && <span className="whitespace-pre">{leadSpace}</span>}
                                <span className="relative inline-block leading-none">
                                  <span className="font-mono font-bold text-primary text-xs absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap">
                                    {seg.chord}
                                  </span>
                                  <span className="text-on-surface whitespace-pre leading-[1.4]">
                                    {anchor}
                                  </span>
                                </span>
                                {tail && <span className="text-on-surface whitespace-pre-wrap">{tail}</span>}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AuroraDialog>
    </main>
  );
}
