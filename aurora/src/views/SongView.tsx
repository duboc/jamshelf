import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { diffLines } from 'diff';
import type { ParsedSong, Section } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import { useLiveSession, type LiveScrollState } from '@/lib/stores/live-session-store';
import {
  ensureMetronomeAudioContext,
  useMetronomeEngine,
} from '@/lib/hooks/use-metronome-engine';
import {
  SECTION_COLORS,
  extractChords,
  formatSectionLabel,
  getDiatonicChordsForKey,
  isInstrumentalSection,
  isMinorKey,
  lineHasLyrics,
  parseLine,
  transposeChord,
  transposeSong,
} from '@/lib/utils/music';
import {
  addSongSection,
  countChordOccurrences,
  deleteChord,
  duplicateSongSection,
  findAdjacentChord,
  insertChord,
  moveChordByWordWithIndex,
  moveChordWithIndex,
  moveSongSection,
  removeSongSection,
  renameChord,
  renameSongSection,
  replaceAllChordsInSections,
} from '@/lib/utils/edit-chordpro';
import {
  formatDuration,
  parseChordPro,
  removeChordProMeta,
  serializeMarks,
  songToChordPro,
} from '@/lib/utils/chordpro-parser';
import { highlightChordPro } from '@/lib/utils/chordpro-highlight';
import { ensurePitchAudioContext } from '@/lib/utils/pitch-audio';
import {
  computeEffectiveDurationSec,
  estimateSectionMarks,
  hasUsableMarks,
  interpolateMarkedScroll,
  scrollTopToMarkedElapsed,
} from '@/lib/utils/autoscroll';
import { AuroraEnergy, useEnergyTask } from '../aurora/energy';
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
  UiIcon,
  copyText,
} from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { applyColorScheme } from '../components/AuroraShell';
import { ChordInspectorContent, ChordInspectorSheet } from '../components/ChordDiagrams';
import { VisualPulseRibbon } from '../components/MetronomeControl';
import { SongAdjustmentsPopover } from '../components/SongAdjustmentsPopover';
import { SongMetaPopover } from '../components/SongMetaPopover';
import { ChordStampDock } from '../components/ChordStampDock';
import { ChordStampSection } from '../components/ChordStampSection';
import {
  CalibrationBanner,
  CleanStageChrome,
  CountInOverlay,
  SongMetaDialog,
  SpotifyPanel,
  type SpotifyTrack,
} from '../components/SongExtras';
import {
  VisualChordEditModal,
  type AddChordTarget,
  type SelectedChordTarget,
} from '../components/VisualChordEditModal';
import { navigate, useRoute } from '../router';

const QUICK_SECTION_PRESETS = [
  'Verso',
  'Refrão',
  'Pré-refrão',
  'Ponte',
  'Intro',
  'Solo',
  'Final',
] as const;

function isEditableEl(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
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
          <div
            role="alert"
            className="rounded-2xl bg-error-container text-on-error-container p-4 typescale-body-md"
          >
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
  editSubMode,
  stampChord,
  selectedChordInSection,
  calibrating,
  calibrationMark,
  isJumpTarget = false,
  isJustMoved = false,
  lastStamped = null,
  onCalibrateStamp,
  onSelectChord,
  onEditChord,
  onAddChord,
  onStampAt,
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
  editSubMode: 'text' | 'chords';
  stampChord: string | null;
  selectedChordInSection: { lineIdx: number; segIdx: number } | null;
  calibrating: boolean;
  calibrationMark: number | null;
  isJumpTarget?: boolean;
  isJustMoved?: boolean;
  lastStamped?: { sectionIdx: number; lineIdx: number; segIdx: number; seq: number } | null;
  onCalibrateStamp: (sectionIdx: number) => void;
  onSelectChord: (chord: string) => void;
  onEditChord: (sectionIdx: number, lineIdx: number, segIdx: number, chord: string) => void;
  onAddChord: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onStampAt: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onEditLineText: (sectionIdx: number, lineIdx: number, nextRawLine: string) => void;
  onAddLine: (sectionIdx: number) => void;
  onRenameSection: (sectionIdx: number, nextLabel: string) => void;
  onMoveSection: (sectionIdx: number, dir: 'up' | 'down') => void;
  onDuplicateSection: (sectionIdx: number) => void;
  onRemoveSection: (sectionIdx: number) => void;
}) {
  const isChorus = section.type === 'chorus';
  const instrumental = isInstrumentalSection(section.lines);
  const displayLabel = formatSectionLabel(section.label);
  const sectionColors = SECTION_COLORS[section.type] || SECTION_COLORS.verse;
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

  if (!editMode && displayMode === 'lyrics-only' && instrumental) {
    return (
      <section
        id={`song-section-${sectionIdx}`}
        tabIndex={-1}
        data-jump-target={isJumpTarget ? 'true' : undefined}
        onClick={calibrating ? () => onCalibrateStamp(sectionIdx) : undefined}
        className={`stage-card scroll-mt-16 px-4 py-2.5 bg-surface-container-low flex items-center justify-between gap-2 break-inside-avoid ${
          calibrating ? 'cursor-pointer hover:ring-2 hover:ring-tertiary' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: sectionColors.bd }}
            aria-hidden="true"
          />
          <span className="typescale-label-sm text-on-surface-variant">{displayLabel}</span>
          <span className="typescale-body-sm text-on-surface-variant italic">
            · trecho instrumental
          </span>
        </div>
        {calibrationMark !== null && (
          <span className="px-2.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-mono typescale-label-sm tabular-nums">
            {formatDuration(calibrationMark)}
          </span>
        )}
      </section>
    );
  }

  return (
    <section
      id={`song-section-${sectionIdx}`}
      tabIndex={-1}
      data-jump-target={isJumpTarget ? 'true' : undefined}
      data-just-moved={isJustMoved ? 'true' : undefined}
      style={sectionIdx < 6 ? ({ '--stagger-i': sectionIdx } as CSSProperties) : undefined}
      onClick={calibrating ? () => onCalibrateStamp(sectionIdx) : undefined}
      className={`${sectionIdx < 6 ? 'stagger-item ' : ''}stage-card scroll-mt-16 p-5 sm:p-6 space-y-3 break-inside-avoid ${
        isChorus ? 'stage-card-chorus' : 'bg-surface'
      } ${calibrating ? 'cursor-pointer hover:ring-2 hover:ring-tertiary' : ''} ${
        editMode ? 'ring-1 ring-primary/60' : ''
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
                className="stage-field text-base lg:text-sm min-h-[38px] py-1 px-3 w-44"
              />
            </form>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full typescale-label-sm ${
                isChorus
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: sectionColors.bd }}
                aria-hidden="true"
              />
              {displayLabel}
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
              label={`Renomear seção ${displayLabel}`}
              onClick={() => {
                setLabelDraft(section.label);
                setEditingLabel(true);
              }}
            />
            <AuroraIconButton
              icon="arrow_upward"
              label={`Mover seção ${displayLabel} para cima`}
              disabled={sectionIdx === 0}
              onClick={() => onMoveSection(sectionIdx, 'up')}
            />
            <AuroraIconButton
              icon="arrow_downward"
              label={`Mover seção ${displayLabel} para baixo`}
              disabled={sectionIdx === totalSections - 1}
              onClick={() => onMoveSection(sectionIdx, 'down')}
            />
            <AuroraIconButton
              icon="content_copy"
              label={`Duplicar seção ${displayLabel}`}
              onClick={() => onDuplicateSection(sectionIdx)}
            />
            <AuroraIconButton
              icon="delete_outline"
              label={`Remover seção ${displayLabel}`}
              disabled={totalSections <= 1}
              onClick={() => onRemoveSection(sectionIdx)}
            />
          </div>
        )}
      </div>

      {/* 1-Tap Touch Chord Stamping Surface ("Acordes" sub-mode) */}
      {editMode && editSubMode === 'chords' ? (
        <ChordStampSection
          sectionIdx={sectionIdx}
          sectionLabel={displayLabel}
          lines={section.lines}
          fontSize={fontSize}
          selected={selectedChordInSection}
          stampChord={stampChord}
          lastStamped={lastStamped}
          onChordSelect={(li, si, chord) => onEditChord(sectionIdx, li, si, chord)}
          onStampAt={(li, pos) => onStampAt(sectionIdx, li, pos)}
          onAddChord={(li, pos) => onAddChord(sectionIdx, li, pos)}
        />
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
                        className="stage-field font-mono text-base lg:text-xs flex-1 min-w-[200px]"
                      />
                      <AuroraButton color="outlined" onClick={() => setEditingLineIdx(null)}>
                        Cancelar
                      </AuroraButton>
                      <AuroraButton type="submit" color="filled">
                        OK
                      </AuroraButton>
                    </form>
                  ) : (
                    <div
                      className="flex-1 pt-6 leading-[1.45]"
                      style={{ fontSize: `${lyricScale}rem` }}
                    >
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
                                className="chord-token inline-flex items-center justify-center min-w-[28px] min-h-[28px] absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded"
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
                                className="chord-token inline-flex items-center justify-center min-w-[28px] min-h-[28px] absolute left-0 bottom-[calc(100%+2px)] leading-none whitespace-nowrap bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded"
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
  const cleanUrl = route.params.get('show') === '1' || route.params.get('clean') === '1';

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const { getSong, getEntry, patchMeta, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist, reorderSong } = useSetlistStore();
  const store = usePlayerStore();
  const {
    displayMode,
    toggleHideChords,
    fontSize,
    setFontSize,
    sheetColumns,
    capoDisplay,
    chordsRefOpen,
    setChordsRefOpen,
    focusMode,
    setFocusMode,
    theme,
    setTheme,
    singleKeyShortcuts,
    scrollLeadInSec,
  } = useDisplayStore();

  const isCleanStage = !store.editMode && (focusMode || cleanUrl);

  // Visual edit draft + undo/redo + 1-tap Chord Stamping sub-mode
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [editSubMode, setEditSubMode] = useState<'text' | 'chords'>('text');
  const [stampChord, setStampChord] = useState<string | null>(null);
  const [pickStampOpen, setPickStampOpen] = useState(false);
  const [editDiscardArmed, setEditDiscardArmed] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [selectedChordEdit, setSelectedChordEdit] = useState<SelectedChordTarget | null>(null);
  const [addChordEdit, setAddChordEdit] = useState<AddChordTarget | null>(null);
  const [replaceAllPrompt, setReplaceAllPrompt] = useState<{
    oldChord: string;
    newChord: string;
    count: number;
  } | null>(null);

  // Calibration state ("Calibrar rolagem")
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
      return parseChordPro(songId, editDraftText, { preserveEmptySections: true });
    }
    return storedSong;
  }, [store.editMode, editDraftText, songId, storedSong]);

  const beatsPerBar = parseInt(song?.timeSignature || '4/4', 10) || 4;
  const { audioBlocked, unlockAudio } = useMetronomeEngine(beatsPerBar);

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

  // Header & popovers state
  const [scrolled, setScrolled] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const adjustWrapRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const adjustTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  // Inline identity rename + Go Live + Confirmation dialogs
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [artistDraft, setArtistDraft] = useState('');
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false);
  const [liveNameInput, setLiveNameInput] = useState('');
  const [confirmSaveTransposeOpen, setConfirmSaveTransposeOpen] = useState(false);
  const [confirmClearCalOpen, setConfirmClearCalOpen] = useState(false);

  // Dialogs & drawers
  const [showEnhance, setShowEnhance] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showMetaDialog, setShowMetaDialog] = useState(false);
  const [showSetlistDrawer, setShowSetlistDrawer] = useState(false);
  const [showSpotifyPreview, setShowSpotifyPreview] = useState(false);
  const [showSpotifyPicker, setShowSpotifyPicker] = useState(false);
  const [confirmDiscardSource, setConfirmDiscardSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const [sourceTab, setSourceTab] = useState<'split' | 'edit' | 'preview'>('split');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [countInOpen, setCountInOpen] = useState(false);
  const [leadInLeft, setLeadInLeft] = useState(0);
  const leadInLeftRef = useRef(0);
  leadInLeftRef.current = leadInLeft;
  const skipLeadInRef = useRef<(() => void) | null>(null);
  const [manualYieldNotice, setManualYieldNotice] = useState(false);
  const [toast, setToast] = useState<{
    id: number;
    msg: string;
    undoText?: string;
    undoTranspose?: number;
    undoDraft?: boolean;
  } | null>(null);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [jumpedSectionIdx, setJumpedSectionIdx] = useState<number | null>(null);
  const [movedSectionIdx, setMovedSectionIdx] = useState<number | null>(null);
  const [lastStamped, setLastStamped] = useState<{
    sectionIdx: number;
    lineIdx: number;
    segIdx: number;
    seq: number;
  } | null>(null);
  const [stampAnnouncement, setStampAnnouncement] = useState('');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeImmediate, setSwipeImmediate] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number; t: number; locked: 'h' | 'v' | null } | null>(
    null
  );

  const jumpHighlightTimerRef = useRef<number | null>(null);
  const moveHighlightTimerRef = useRef<number | null>(null);
  const discardArmTimerRef = useRef<number | null>(null);
  const replaceTimerRef = useRef<number | null>(null);
  const sectionRailRef = useRef<HTMLDivElement>(null);
  const scrollProgressRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [chordSheetModalOpen, setChordSheetModalOpen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const speedRef = useRef(store.autoScrollSpeed);
  speedRef.current = store.autoScrollSpeed;

  // Accurate capo pitch math: ChordPro stores capo finger shapes while {key:} is concert key
  const rawTotalShift =
    capoDisplay === 'shapes' ? store.transpose : store.transpose + store.capo;
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

  const notify = useCallback(
    (
      msg: string,
      opts?: { undoText?: string; undoTranspose?: number; undoDraft?: boolean }
    ) => {
      setToast({
        id: Date.now(),
        msg,
        undoText: opts?.undoText,
        undoTranspose: opts?.undoTranspose,
        undoDraft: opts?.undoDraft,
      });
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(
        () => setToast(null),
        opts?.undoText || opts?.undoDraft ? 6500 : 3800
      );
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (jumpHighlightTimerRef.current) window.clearTimeout(jumpHighlightTimerRef.current);
      if (moveHighlightTimerRef.current) window.clearTimeout(moveHighlightTimerRef.current);
      if (discardArmTimerRef.current) window.clearTimeout(discardArmTimerRef.current);
      if (replaceTimerRef.current) window.clearTimeout(replaceTimerRef.current);
    };
  }, []);

  // Warn before browser refresh/close with unsaved visual edits
  const editDirty = store.editMode && undoStack.length > 0;
  useEffect(() => {
    if (!editDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editDirty]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (y > 68 ? true : y < 32 ? false : prev));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!adjustOpen && !moreOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (adjustOpen && adjustWrapRef.current && !adjustWrapRef.current.contains(e.target as Node)) {
        setAdjustOpen(false);
      }
      if (moreOpen && moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (adjustOpen) {
          e.stopPropagation();
          setAdjustOpen(false);
          adjustTriggerRef.current?.focus({ preventScroll: true });
        }
        if (moreOpen) {
          e.stopPropagation();
          setMoreOpen(false);
          moreTriggerRef.current?.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [adjustOpen, moreOpen]);

  // Safe horizontal-only scroll for SectionNav chips (NEVER scrollIntoView)
  useEffect(() => {
    const rail = sectionRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 4) return;
    const activeChip = rail.querySelector<HTMLElement>('[aria-current="location"]');
    if (!activeChip) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetLeft =
      activeChip.offsetLeft - rail.clientWidth / 2 + activeChip.clientWidth / 2;
    rail.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [activeSectionIdx]);

  useEffect(() => {
    if (!storedSong) return;
    store.resetForSong(
      storedSong.tempo,
      storedSong.capo,
      storedSong.scrollSpeed,
      storedSong.originalKey
    );
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setEditSubMode('text');
    setStampChord(null);
    setEditDiscardArmed(false);
    setReplaceAllPrompt(null);
    setCalibrating(false);
    setActiveSectionIdx(0);
    setEditingIdentity(false);
    setTitleDraft(storedSong.title);
    setArtistDraft(storedSong.artist);
    setAdjustOpen(false);
    setMoreOpen(false);
  }, [storedSong?.id]);

  // Screen Wake Lock
  useEffect(() => {
    if (!isCleanStage && !store.isAutoScrolling && !store.metronomeOn) {
      setWakeLockActive(false);
      return;
    }
    let sentinel: { release: () => Promise<void> } | null = null;
    const wl = (
      navigator as unknown as {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      }
    ).wakeLock;
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
  }, [isCleanStage, store.isAutoScrolling, store.metronomeOn]);

  useEffect(() => {
    if (!calibrating) return;
    const id = window.setInterval(() => {
      setCalElapsedSec((Date.now() - calStartMs) / 1000);
    }, 150);
    return () => window.clearInterval(id);
  }, [calibrating, calStartMs]);

  // Auto-scroll with calibrated / auto-estimated section marks + scoped manual yield + lead-in skip
  const durationSec = useMemo(
    () => (song ? computeEffectiveDurationSec(song, store.bpm) : 180),
    [song, store.bpm]
  );

  const activeScrollMarks = useMemo(() => {
    if (!song || song.sections.length < 2) return null;
    if (hasUsableMarks(song.sectionMarks, song.sections.length)) {
      return song.sectionMarks;
    }
    return estimateSectionMarks(song, durationSec);
  }, [song, durationSec]);

  useEffect(() => {
    if (!store.isAutoScrolling) {
      setLeadInLeft(0);
      setManualYieldNotice(false);
      skipLeadInRef.current = null;
      return;
    }
    const maxCheck = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (maxCheck <= 2) {
      store.setAutoScrolling(false);
      notify('A cifra inteira já cabe na tela.');
      return;
    }

    let frame = 0;
    let delayInterval = 0;
    let manualPauseUntil = 0;
    let needsReanchor = false;
    let elapsedSec = 0;
    let last = performance.now();

    const getSectionTops = (): number[] => {
      if (!song) return [];
      return song.sections.map((_, i) => {
        const el = document.getElementById(`song-section-${i}`);
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
      });
    };

    const reanchorFromScroll = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;
      if (activeScrollMarks && activeScrollMarks.length >= 2) {
        const tops = getSectionTops();
        if (tops.length >= 2) {
          elapsedSec = scrollTopToMarkedElapsed(
            window.scrollY,
            activeScrollMarks,
            tops,
            maxScroll,
            durationSec,
            window.innerHeight
          );
          return;
        }
      }
      elapsedSec = (window.scrollY / maxScroll) * Math.max(20, durationSec);
    };

    // Only pause for genuine manual scrolling on the chord sheet (ignore buttons/chrome/lead-in)
    const onManualInput = (ev: Event) => {
      if (leadInLeftRef.current > 0) return;
      const target = ev.target instanceof Element ? ev.target : null;
      if (
        target?.closest(
          'header, nav, [role="dialog"], button, a, input, select, [data-scroll-dock], [data-clean-dock]'
        )
      ) {
        return;
      }
      manualPauseUntil = performance.now() + 1400;
      needsReanchor = true;
      setManualYieldNotice(true);
    };

    window.addEventListener('wheel', onManualInput, { passive: true });
    window.addEventListener('touchmove', onManualInput, { passive: true });

    const startLoop = () => {
      if (delayInterval) {
        window.clearInterval(delayInterval);
        delayInterval = 0;
      }
      skipLeadInRef.current = null;
      setLeadInLeft(0);
      reanchorFromScroll();
      last = performance.now();

      const step = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

        if (now < manualPauseUntil) {
          frame = requestAnimationFrame(step);
          return;
        }
        if (needsReanchor) {
          needsReanchor = false;
          setManualYieldNotice(false);
          reanchorFromScroll();
        }

        if (maxScroll > 0) {
          elapsedSec += dt * speedRef.current;
          let targetY: number;
          if (activeScrollMarks && activeScrollMarks.length >= 2) {
            const tops = getSectionTops();
            targetY =
              tops.length >= 2
                ? interpolateMarkedScroll(
                    elapsedSec,
                    activeScrollMarks,
                    tops,
                    maxScroll,
                    durationSec,
                    window.innerHeight
                  )
                : (elapsedSec / Math.max(20, durationSec)) * maxScroll;
          } else {
            targetY = (elapsedSec / Math.max(20, durationSec)) * maxScroll;
          }

          window.scrollTo({ top: Math.min(maxScroll, Math.max(0, targetY)), behavior: 'instant' });
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
      skipLeadInRef.current = startLoop;
      delayInterval = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          startLoop();
        } else {
          setLeadInLeft(remaining);
        }
      }, 1000);
    } else {
      startLoop();
    }

    return () => {
      window.removeEventListener('wheel', onManualInput);
      window.removeEventListener('touchmove', onManualInput);
      if (delayInterval) window.clearInterval(delayInterval);
      if (frame) cancelAnimationFrame(frame);
      skipLeadInRef.current = null;
      setLeadInLeft(0);
      setManualYieldNotice(false);
    };
  }, [
    store.isAutoScrolling,
    durationSec,
    activeScrollMarks,
    song,
    store.setAutoScrolling,
    scrollLeadInSec,
    notify,
  ]);

  useEffect(() => {
    if (!live.isFollowing || !live.syncCorrection) return;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (maxScroll <= 0) return;
    const targetY =
      live.syncCorrection.scrollRatio !== null
        ? live.syncCorrection.scrollRatio * maxScroll
        : live.syncCorrection.scrollTop;
    if (Math.abs(window.scrollY - targetY) > 36) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: Math.max(0, Math.min(maxScroll, targetY)),
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  }, [live.isFollowing, live.syncCorrection]);

  useEffect(() => {
    if (
      live.isFollowing &&
      live.session.currentSongId &&
      live.session.currentSongId !== songId &&
      activeSetlist
    ) {
      navigate(
        `/song/${live.session.currentSongId}?setlist=${activeSetlist.id}${isCleanStage ? '&clean=1' : ''}`,
        { replace: true }
      );
    }
  }, [live.isFollowing, live.session.currentSongId, songId, activeSetlist, isCleanStage]);

  const navigateSetlistSong = useCallback(
    (targetSongId: string, direction?: 'lateral-next' | 'lateral-prev') => {
      if (!activeSetlist) return;
      navigate(
        `/song/${targetSongId}?setlist=${activeSetlist.id}${isCleanStage ? '&clean=1' : ''}`,
        direction ? { direction } : undefined
      );
    },
    [activeSetlist, isCleanStage]
  );

  const exitCleanStage = useCallback(() => {
    setFocusMode(false);
    if (cleanUrl) {
      navigate(activeSetlist ? `/song/${songId}?setlist=${activeSetlist.id}` : `/song/${songId}`, {
        replace: true,
      });
    }
  }, [setFocusMode, cleanUrl, activeSetlist, songId]);

  const enterCleanStage = useCallback(() => {
    setAdjustOpen(false);
    setMoreOpen(false);
    setFocusMode(true);
  }, [setFocusMode]);

  const triggerCountIn = useCallback(() => {
    // Synchronously unlock Web Audio inside click handler for iOS/iPadOS Safari
    ensurePitchAudioContext();
    ensureMetronomeAudioContext();
    if (live.isLeading) {
      live.triggerCountIn(store.bpm, beatsPerBar);
    }
    setCountInOpen(true);
  }, [live, store.bpm, beatsPerBar]);

  // Visual edit helpers
  const enterVisualEdit = useCallback(() => {
    if (!rawEntry) return;
    setAdjustOpen(false);
    setMoreOpen(false);
    setFocusMode(false);
    setEditDraftText(rawEntry.text);
    setUndoStack([]);
    setRedoStack([]);
    setEditDiscardArmed(false);
    setReplaceAllPrompt(null);
    setCalibrating(false);
    const parsed = parseChordPro(songId, rawEntry.text, { preserveEmptySections: true });
    setTitleDraft(parsed.title);
    setArtistDraft(parsed.artist);
    const chords = [...new Set(extractChords(parsed.sections))];
    setStampChord(chords[0] ?? getDiatonicChordsForKey(parsed.originalKey)[0] ?? 'C');
    store.setEditMode(true);
  }, [rawEntry, songId, setFocusMode, store]);

  const commitDraftChange = useCallback((nextText: string) => {
    setEditDiscardArmed(false);
    setEditDraftText((curr) => {
      if (curr !== null && curr !== nextText) {
        setUndoStack((st) => [...st.slice(-39), curr]);
        setRedoStack([]);
      }
      return nextText;
    });
  }, []);

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
      const parsed = parseChordPro(songId, editDraftText, { preserveEmptySections: true });
      const nextSong = mutator(parsed);
      commitDraftChange(songToChordPro(nextSong));
    },
    [editDraftText, songId, commitDraftChange]
  );

  const saveVisualEdit = useCallback(() => {
    if (editDraftText !== null) {
      let finalText = editDraftText;
      const parsed = parseChordPro(songId, finalText, { preserveEmptySections: true });
      const cleanTitle = titleDraft.trim();
      const cleanArtist = artistDraft.trim();
      if ((cleanTitle && cleanTitle !== parsed.title) || cleanArtist !== parsed.artist) {
        finalText = songToChordPro({
          ...parsed,
          title: cleanTitle || parsed.title,
          artist: cleanArtist,
        });
      }
      updateEntry(songId, finalText);
      notify('Alterações na cifra salvas.');
    }
    store.setEditMode(false);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedChordEdit(null);
    setAddChordEdit(null);
    setPickStampOpen(false);
    setEditDiscardArmed(false);
    setReplaceAllPrompt(null);
  }, [editDraftText, songId, titleDraft, artistDraft, updateEntry, notify, store]);

  const performCancelVisualEdit = () => {
    store.setEditMode(false);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedChordEdit(null);
    setAddChordEdit(null);
    setPickStampOpen(false);
    setEditDiscardArmed(false);
    setReplaceAllPrompt(null);
  };

  // 2-tap Cancelar -> Descartar safety (zero modal interruption, zero accidental loss)
  const cancelVisualEdit = () => {
    if (undoStack.length > 0 && !editDiscardArmed) {
      setEditDiscardArmed(true);
      if (discardArmTimerRef.current) window.clearTimeout(discardArmTimerRef.current);
      discardArmTimerRef.current = window.setTimeout(() => setEditDiscardArmed(false), 4500);
      return;
    }
    performCancelVisualEdit();
  };

  // Scroll-spy for section jump chips
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

  const performClearCalibration = () => {
    if (!rawEntry) return;
    const prevText = rawEntry.text;
    updateEntry(songId, removeChordProMeta(prevText, 'marks'));
    setConfirmClearCalOpen(false);
    notify('Calibração removida.', { undoText: prevText });
  };

  const handleSaveSource = useCallback(() => {
    if (!song || !sourceDraft.trim()) return;
    if (store.editMode) {
      commitDraftChange(sourceDraft);
      setShowSource(false);
      setConfirmDiscardSource(false);
      notify('Rascunho ChordPro atualizado.');
      return;
    }
    updateEntry(song.id, sourceDraft);
    setShowSource(false);
    setConfirmDiscardSource(false);
    notify('Cifra ChordPro atualizada.');
  }, [song, sourceDraft, store.editMode, commitDraftChange, updateEntry, notify]);

  // Global keyboard shortcuts (blocks behind ANY open [role="dialog"], arrow nav works even if singleKeyShortcuts off)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (showSource) {
          e.preventDefault();
          handleSaveSource();
          return;
        }
        if (store.editMode) {
          e.preventDefault();
          saveVisualEdit();
          return;
        }
      }

      if (document.querySelector('[role="dialog"]')) return;

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
        if (live.incomingCountIn) {
          live.clearIncomingCountIn();
          return;
        }
        if (isCleanStage) {
          exitCleanStage();
          return;
        }
        if (calibrating) {
          setCalibrating(false);
          return;
        }
      }

      if (store.editMode || e.metaKey || e.ctrlKey || e.altKey) return;

      // Setlist lateral arrows work even when singleKeyShortcuts is disabled
      if (!onInteractive && activeSetlist && !live.isFollowing) {
        if (e.key === 'ArrowLeft' && prevSong) {
          e.preventDefault();
          navigateSetlistSong(prevSong.id, 'lateral-prev');
          return;
        }
        if (e.key === 'ArrowRight' && nextSong) {
          e.preventDefault();
          navigateSetlistSong(nextSong.id, 'lateral-next');
          return;
        }
      }

      if (!singleKeyShortcuts) return;

      if (e.key === ' ') {
        if (onInteractive) return;
        e.preventDefault();
        if (!live.isFollowing) store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (!live.isFollowing) {
          if (!store.metronomeOn) ensureMetronomeAudioContext();
          store.setMetronomeOn(!store.metronomeOn);
        }
      } else if (e.key === '+' || e.key === '=') {
        if (!live.isFollowing) {
          e.preventDefault();
          store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1);
        }
      } else if (e.key === '-' || e.key === '_') {
        if (!live.isFollowing) {
          e.preventDefault();
          store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1);
        }
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        triggerCountIn();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleHideChords();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (isCleanStage) exitCleanStage();
        else enterCleanStage();
      } else if (e.key.toLowerCase() === 's' && activeSetlist) {
        e.preventDefault();
        setShowSetlistDrawer((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    showSource,
    handleSaveSource,
    store.editMode,
    store.metronomeOn,
    store.autoScrollSpeed,
    store.setMetronomeOn,
    store.setAutoScrollSpeed,
    store.toggleAutoScroll,
    saveVisualEdit,
    handleUndo,
    handleRedo,
    calibrating,
    song,
    calNextIdx,
    stampSection,
    countInOpen,
    live,
    isCleanStage,
    exitCleanStage,
    enterCleanStage,
    singleKeyShortcuts,
    triggerCountIn,
    toggleHideChords,
    activeSetlist,
    prevSong,
    nextSong,
    navigateSetlistSong,
  ]);

  if (!song) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 space-y-4"
      >
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
  const totalShift =
    capoDisplay === 'shapes' ? store.transpose : store.transpose + store.capo;
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
  const rawUniqueChords = useMemo(
    () => [...new Set(extractChords(song.sections))],
    [song.sections]
  );
  const railChord = store.activeChord || uniqueChords[0] || null;
  const hasCal = hasUsableMarks(song.sectionMarks, song.sections.length);
  const speedChanged = Math.abs(store.autoScrollSpeed - (song.scrollSpeed ?? 1)) >= 0.05;
  const transposeDeltaLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  const sectionChipLabels = useMemo(() => {
    const formatted = song.sections.map((s) => formatSectionLabel(s.label));
    const totals = new Map<string, number>();
    formatted.forEach((lbl) => totals.set(lbl, (totals.get(lbl) ?? 0) + 1));
    const seen = new Map<string, number>();
    return formatted.map((lbl) => {
      const count = totals.get(lbl) ?? 1;
      if (count <= 1) return lbl;
      const n = (seen.get(lbl) ?? 0) + 1;
      seen.set(lbl, n);
      return `${lbl} ${n}`;
    });
  }, [song.sections]);

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleThemeQuick = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    applyColorScheme(next);
  };

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

  const handlePatchSongMeta = (key: string, value: string | number) => {
    if (store.editMode) {
      mutateDraftSong((p) => {
        if (key === 'key') return { ...p, originalKey: String(value), displayKey: String(value) };
        if (key === 'capo') return { ...p, capo: Number(value) || 0 };
        if (key === 'tempo') return { ...p, tempo: Number(value) || 120, tempoConfirmed: true };
        if (key === 'time') return { ...p, timeSignature: String(value) };
        if (key === 'duration') return { ...p, duration: Number(value) || null };
        return p;
      });
    } else {
      patchMeta(song.id, key, value);
    }
    if (key === 'capo') store.setCapo(Number(value) || 0);
    if (key === 'tempo') store.setBpm(Number(value) || 120);
  };

  const performSavePermanentTranspose = () => {
    if (!song || store.transpose === 0) return;
    const prevText = rawEntry?.text ?? songToChordPro(song);
    const prevTranspose = store.transpose;
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
    setConfirmSaveTransposeOpen(false);
    notify(`Tonalidade fixada em ${label}.`, { undoText: prevText, undoTranspose: prevTranspose });
  };

  const handleOpenSource = () => {
    setSourceDraft(store.editMode && editDraftText !== null ? editDraftText : rawEntry?.text ?? '');
    setShowSource(true);
  };

  const handleRequestCloseSource = () => {
    const baseline =
      store.editMode && editDraftText !== null ? editDraftText : rawEntry?.text ?? '';
    if (sourceDraft !== baseline) {
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
      const savedName = localStorage.getItem('jamshelf-device-name') || '';
      if (!savedName.trim()) {
        setLiveNameInput('');
        setShowGoLiveDialog(true);
        return;
      }
      live.startLeading(savedName);
      notify(`Sessão ao vivo iniciada como ${savedName}.`);
    }
  };

  const confirmGoLive = () => {
    const name = liveNameInput.trim() || 'Líder';
    live.startLeading(name);
    setShowGoLiveDialog(false);
    notify(`Sessão ao vivo iniciada como ${name}.`);
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
    notify('Faixa do Spotify desvinculada.', { undoText: prevText });
  };

  const saveInlineIdentity = () => {
    const nextTitle = titleDraft.trim();
    const nextArtist = artistDraft.trim();
    if (nextTitle && nextTitle !== song.title) {
      patchMeta(song.id, 'title', nextTitle);
    }
    if (nextArtist !== song.artist) {
      patchMeta(song.id, 'artist', nextArtist);
    }
    setEditingIdentity(false);
    notify('Título e artista atualizados.');
  };

  const openSlidesMode = () => {
    navigate(
      activeSetlist
        ? `/slides?setlist=${activeSetlist.id}&song=${song.id}`
        : `/slides?song=${song.id}`
    );
  };

  useEffect(() => {
    document.title = `${displayTitle} - Jamshelf`;
  }, [displayTitle]);

  const sourcePreviewSong = useMemo(
    () => (showSource ? parseChordPro(song.id, sourceDraft, { preserveEmptySections: true }) : null),
    [showSource, song.id, sourceDraft]
  );

  const minor = isMinorKey(displayedKey);
  const showSidebar =
    !isCleanStage &&
    !store.editMode &&
    sheetColumns === 1 &&
    (uniqueChords.length > 0 || Boolean(activeSetlist));

  const isXlDesktop = typeof window !== 'undefined' && window.innerWidth >= 1280;
  const hasActiveAdjustments =
    store.transpose !== 0 ||
    fontSize !== 100 ||
    store.metronomeOn ||
    (chordsRefOpen && !(showSidebar && isXlDesktop)) ||
    sheetColumns === 2 ||
    live.isLeading ||
    live.isFollowing;

  const activeEditLine = selectedChordEdit
    ? song.sections[selectedChordEdit.sectionIdx]?.lines[selectedChordEdit.lineIdx]
    : addChordEdit
      ? song.sections[addChordEdit.sectionIdx]?.lines[addChordEdit.lineIdx]
      : undefined;

  const canStepPrev = Boolean(
    selectedChordEdit && findAdjacentChord(song.sections, selectedChordEdit, 'prev')
  );
  const canStepNext = Boolean(
    selectedChordEdit && findAdjacentChord(song.sections, selectedChordEdit, 'next')
  );

  // Clean stage horizontal touch swipe with 24px edge guard, 600ms cap & reduced-motion check
  const canSwipeSetlist = isCleanStage && Boolean(activeSetlist) && !live.isFollowing;
  const onTouchStartClean = (e: React.TouchEvent) => {
    if (!canSwipeSetlist || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: null };
  };
  const onTouchMoveClean = (e: React.TouchEvent) => {
    if (!canSwipeSetlist || !swipeStartRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    if (!swipeStartRef.current.locked) {
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swipeStartRef.current.locked = 'h';
      } else if (Math.abs(dy) > 12) {
        swipeStartRef.current.locked = 'v';
      }
    }
    if (
      swipeStartRef.current.locked === 'h' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const canGo = (dx > 0 && prevSong) || (dx < 0 && nextSong);
      const damped = canGo ? Math.max(-72, Math.min(72, dx * 0.38)) : dx * 0.14;
      setSwipeImmediate(false);
      setSwipeOffset(damped);
    }
  };
  const onTouchEndClean = (e: React.TouchEvent) => {
    if (!canSwipeSetlist || !swipeStartRef.current) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const dx = e.changedTouches[0] ? e.changedTouches[0].clientX - start.x : 0;
    const dt = Date.now() - start.t;
    const committedPrev = start.locked === 'h' && dt <= 600 && dx > 68 && Boolean(prevSong);
    const committedNext = start.locked === 'h' && dt <= 600 && dx < -68 && Boolean(nextSong);
    setSwipeImmediate(committedPrev || committedNext);
    setSwipeOffset(0);
    if (committedPrev && prevSong) navigateSetlistSong(prevSong.id, 'lateral-prev');
    else if (committedNext && nextSong) navigateSetlistSong(nextSong.id, 'lateral-next');
  };

  const activeCountIn = countInOpen
    ? { bpm: store.bpm, beats: beatsPerBar, leaderName: null as string | null }
    : live.incomingCountIn
      ? {
          bpm: live.incomingCountIn.bpm,
          beats: live.incomingCountIn.beats,
          leaderName: live.session.leaderName || 'Líder',
        }
      : null;

  return (
    <div
      data-motion-scheme={isCleanStage ? 'standard' : undefined}
      className="flex-1 flex flex-col min-w-0"
      onTouchStart={onTouchStartClean}
      onTouchMove={onTouchMoveClean}
      onTouchEnd={onTouchEndClean}
      onTouchCancel={() => {
        swipeStartRef.current = null;
        setSwipeOffset(0);
      }}
    >
      <VisualPulseRibbon />
      <div
        ref={scrollProgressRef}
        aria-hidden="true"
        data-active={store.isAutoScrolling && leadInLeft === 0 ? 'true' : undefined}
        className="scroll-progress-bar"
        style={{ transform: 'scaleX(0)' }}
      />

      {/* Top Chrome: Unified Tela limpa vs Dedicated Pinned Edit Header vs Constant 56px SongHeader */}
      {isCleanStage ? (
        <CleanStageChrome
          songTitle={displayTitle}
          displayedKey={displayedKey}
          capo={song.capo}
          beatsPerBar={beatsPerBar}
          savedTempo={song.tempo}
          tempoConfirmed={song.tempoConfirmed}
          stageNotes={song.notes}
          wakeLockActive={wakeLockActive}
          scrolled={scrolled}
          activeSetlist={activeSetlist}
          setlistIdx={currentIdx}
          totalSetlistSongs={setlistSongs.length}
          prevSongId={prevSong?.id ?? null}
          nextSongId={nextSong?.id ?? null}
          live={live}
          leadInLeft={leadInLeft}
          scrollLeadInSec={scrollLeadInSec}
          onSkipLeadIn={() => skipLeadInRef.current?.()}
          audioBlocked={audioBlocked}
          onUnlockAudio={unlockAudio}
          onNavigateSong={(id) =>
            navigateSetlistSong(id, id === prevSong?.id ? 'lateral-prev' : 'lateral-next')
          }
          onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
          onTriggerCountIn={triggerCountIn}
          onSaveBpm={(nextBpm) => {
            patchMeta(song.id, 'tempo', nextBpm);
            notify(`BPM salvo em ${nextBpm}.`);
          }}
          onRequestSaveTranspose={() => setConfirmSaveTransposeOpen(true)}
          onGoLive={handleGoLive}
          onToggleTheme={toggleThemeQuick}
          isDark={isDark}
          onEnterSlidesMode={openSlidesMode}
          onEnterEdit={enterVisualEdit}
          onExit={exitCleanStage}
        />
      ) : store.editMode ? (
        <header className="dock-enter-top sticky top-0 z-30 flex-shrink-0 bg-canvas border-b border-outline-variant/60 px-3 sm:px-6 lg:px-8 py-2.5 space-y-2">
          <div className="max-w-[1360px] mx-auto space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <h1 className="sr-only">Editando {displayTitle}</h1>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    if (titleDraft.trim() && titleDraft.trim() !== song.title) {
                      mutateDraftSong((p) => ({ ...p, title: titleDraft.trim() }));
                    }
                  }}
                  aria-label="Título da música"
                  className="stage-field stage-field-title text-base sm:text-lg font-bold py-1.5 px-3 w-full max-w-xl"
                />
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <input
                    type="text"
                    value={artistDraft}
                    onChange={(e) => setArtistDraft(e.target.value)}
                    onBlur={() => {
                      if (artistDraft.trim() !== song.artist) {
                        mutateDraftSong((p) => ({ ...p, artist: artistDraft.trim() }));
                      }
                    }}
                    placeholder="Artista"
                    aria-label="Artista"
                    className="stage-field text-base lg:text-sm min-h-[38px] py-1 px-2.5 w-40 sm:w-52"
                  />
                  <SongMetaPopover
                    song={song}
                    displayedKey={displayedKey}
                    onPatchMeta={handlePatchSongMeta}
                    editMode
                  />
                  <AuroraButton
                    color="text"
                    icon="code"
                    onClick={handleOpenSource}
                    className="h-9 min-h-[36px] px-2.5"
                  >
                    .cho (rascunho)
                  </AuroraButton>
                </div>
              </div>
            </div>

            {/* Pinned Visual Edit Toolbar: Texto | Acordes + Undo/Redo + Original Key + Dirty + 2-tap Cancel + Save */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-container px-2.5 sm:px-3.5 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <AuroraSegmented<'text' | 'chords'>
                  ariaLabel="Ferramenta de edição"
                  value={editSubMode}
                  onChange={(nextMode) => {
                    setEditSubMode(nextMode);
                    if (nextMode === 'chords' && !stampChord) {
                      setStampChord(
                        rawUniqueChords[0] ?? getDiatonicChordsForKey(song.originalKey)[0] ?? 'C'
                      );
                    }
                  }}
                  options={[
                    { value: 'text', label: 'Texto' },
                    { value: 'chords', label: 'Acordes' },
                  ]}
                />

                <AuroraButton
                  color="outlined"
                  icon="undo"
                  aria-label="Desfazer"
                  title="Desfazer (Ctrl+Z)"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                  className="h-9 min-h-[38px] px-2.5 sm:px-3"
                >
                  <span className="hidden md:inline">Desfazer</span>
                </AuroraButton>
                <AuroraButton
                  color="outlined"
                  icon="redo"
                  aria-label="Refazer"
                  title="Refazer (Ctrl+Y)"
                  disabled={redoStack.length === 0}
                  onClick={handleRedo}
                  className="h-9 min-h-[38px] px-2.5 sm:px-3"
                >
                  <span className="hidden md:inline">Refazer</span>
                </AuroraButton>

                {store.transpose !== 0 && song.originalKey && (
                  <span className="hidden lg:inline-flex px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-mono typescale-label-sm">
                    Tom original {song.originalKey}
                  </span>
                )}

                {editDirty && (
                  <span className="inline-flex items-center gap-1.5 font-mono typescale-label-sm text-on-surface-variant px-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
                    <span className="hidden md:inline">Pendente</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <AuroraButton
                  color={editDiscardArmed ? 'danger' : 'outlined'}
                  onClick={cancelVisualEdit}
                  className="h-9 min-h-[38px] px-3"
                >
                  {editDiscardArmed ? 'Descartar' : 'Cancelar'}
                </AuroraButton>
                <AuroraButton
                  color="filled"
                  icon="check"
                  onClick={saveVisualEdit}
                  title="Salvar e sair (Ctrl+S)"
                  className="h-9 min-h-[38px] px-3.5"
                >
                  <span className="sm:hidden">Salvar</span>
                  <span className="hidden sm:inline">Salvar e sair</span>
                </AuroraButton>
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header
          data-song-topbar="true"
          data-scrolled={scrolled ? 'true' : undefined}
          className={`sticky top-0 z-30 flex-shrink-0 h-[56px] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 border-b transition-colors ${
            scrolled
              ? 'bg-surface border-outline-variant/60'
              : 'bg-canvas border-transparent'
          }`}
        >
          {/* Left: Back + Setlist stepper (md+) + scrolled title & key (zero height change) */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <AuroraIconButton
              icon="arrow_back"
              label={activeSetlist ? `Voltar para ${activeSetlist.name}` : 'Voltar para o repertório'}
              onClick={() =>
                navigate(activeSetlist ? `/setlists/${activeSetlist.id}` : '/', {
                  direction: 'backward',
                })
              }
            />

            {activeSetlist && (
              <>
                <div className="hidden lg:inline-flex items-center rounded-full bg-surface-container p-0.5 flex-shrink-0">
                  <button
                    type="button"
                    disabled={!prevSong || live.isFollowing}
                    onClick={() => prevSong && navigateSetlistSong(prevSong.id, 'lateral-prev')}
                    aria-label="Música anterior no setlist"
                    title="Música anterior no setlist (←)"
                    className="dock-stepper-btn disabled:opacity-35"
                  >
                    <UiIcon name="chevron_left" size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSetlistDrawer(true)}
                    aria-label={`Setlist ${currentIdx + 1} de ${setlistSongs.length}, abrir lista`}
                    title="Abrir lista do setlist (S)"
                    className="h-9 px-2.5 rounded-full bg-transparent hover:bg-surface-container-high border-none font-mono typescale-label-sm tabular-nums text-on-surface cursor-pointer transition-colors"
                  >
                    {currentIdx + 1}/{setlistSongs.length}
                  </button>
                  <button
                    type="button"
                    disabled={!nextSong || live.isFollowing}
                    onClick={() => nextSong && navigateSetlistSong(nextSong.id, 'lateral-next')}
                    aria-label="Próxima música no setlist"
                    title="Próxima música no setlist (→)"
                    className="dock-stepper-btn disabled:opacity-35"
                  >
                    <UiIcon name="chevron_right" size={20} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSetlistDrawer(true)}
                  aria-label={`Abrir setlist (${currentIdx + 1} de ${setlistSongs.length})`}
                  title="Abrir lista do setlist (S)"
                  className="hidden md:inline-flex lg:hidden stage-btn stage-btn-outlined h-9 min-h-[38px] px-2.5 font-mono typescale-label-sm tabular-nums flex-shrink-0"
                >
                  <UiIcon name="queue_music" size={20} />
                  {currentIdx + 1}/{setlistSongs.length}
                </button>
              </>
            )}

            {editingIdentity ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveInlineIdentity();
                }}
                className="flex items-center gap-1.5 min-w-0 flex-1"
              >
                <input
                  type="text"
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setEditingIdentity(false)}
                  aria-label="Título da música"
                  className="stage-field text-base lg:text-sm min-h-[38px] py-1 px-2.5 min-w-0 flex-1 max-w-xs"
                />
                <input
                  type="text"
                  value={artistDraft}
                  onChange={(e) => setArtistDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setEditingIdentity(false)}
                  placeholder="Artista"
                  aria-label="Artista"
                  className="hidden sm:block stage-field text-base lg:text-sm min-h-[38px] py-1 px-2.5 w-40"
                />
                <AuroraButton type="submit" color="tonal" icon="check" className="h-9 min-h-[38px] px-3">
                  OK
                </AuroraButton>
              </form>
            ) : (
              <div
                aria-hidden={!scrolled || undefined}
                className={`flex items-center gap-2 min-w-0 flex-1 transition-opacity ${
                  scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <span className="typescale-title-md text-on-surface truncate" title={displayTitle}>
                  {displayTitle}
                </span>
                {displayedKey && (
                  <span
                    className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full font-mono typescale-label-sm flex-shrink-0 ${
                      minor
                        ? 'bg-minor-bg text-minor-ink'
                        : 'bg-primary-container text-on-primary-container'
                    }`}
                  >
                    {displayedKey}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Active pills + 4-5 calm immediate controls (Rolar, Tela limpa, Slides, Ajustes, Mais) */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {store.metronomeOn && (
              <button
                type="button"
                onClick={() => (audioBlocked ? unlockAudio() : store.setMetronomeOn(false))}
                className={`inline-flex stage-btn h-9 min-h-[38px] px-2.5 font-mono typescale-label-sm tabular-nums ${
                  audioBlocked ? 'bg-warn-bg text-warn-ink' : 'stage-btn-primary-tonal'
                }`}
                title={
                  audioBlocked
                    ? 'Toque para liberar o áudio do metrônomo'
                    : 'Metrônomo ativo. Toque para parar (M)'
                }
              >
                <UiIcon name={audioBlocked ? 'volume_up' : 'graphic_eq'} size={20} />
                <span>{audioBlocked ? 'Ativar som' : store.bpm}</span>
              </button>
            )}

            {activeSetlist && (live.isLeading || live.isFollowing) && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setAdjustOpen((v) => !v);
                }}
                className={`hidden sm:inline-flex stage-btn h-9 min-h-[38px] px-2.5 typescale-label-sm ${
                  live.isLeading
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-tertiary-container text-on-tertiary-container'
                }`}
              >
                <UiIcon name="sensors" size={20} />
                {live.isLeading ? 'Ao vivo' : 'Seguindo'}
              </button>
            )}

            {!live.isFollowing && !calibrating && (
              <AuroraButton
                color={store.isAutoScrolling ? 'filled' : 'primary-tonal'}
                icon={
                  store.isAutoScrolling
                    ? leadInLeft > 0
                      ? 'hourglass_top'
                      : 'pause'
                    : 'play_arrow'
                }
                aria-pressed={store.isAutoScrolling}
                aria-label={store.isAutoScrolling ? 'Pausar rolagem' : 'Iniciar rolagem'}
                onClick={() => store.toggleAutoScroll()}
                className="relative overflow-hidden h-9 min-h-[38px] w-10 px-0 sm:w-auto sm:px-3.5 tabular-nums"
              >
                <span
                  key={leadInLeft > 0 ? `lead-${leadInLeft}` : store.isAutoScrolling ? 'run' : 'idle'}
                  className="countdown-tick hidden sm:inline"
                >
                  {scrollActionLabel}
                </span>
                {leadInLeft > 0 && (
                  <span
                    aria-hidden="true"
                    className="leadin-bar absolute bottom-0 inset-x-0 h-[2px] bg-on-primary/70 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.05, leadInLeft / Math.max(1, scrollLeadInSec))})`,
                    }}
                  />
                )}
              </AuroraButton>
            )}

            <AuroraButton
              color="outlined"
              icon="fullscreen"
              onClick={enterCleanStage}
              title="Abrir Tela limpa para tocar ou cantar sem distrações (F)"
              className="hidden lg:inline-flex h-9 min-h-[38px] px-3"
            >
              Tela limpa
            </AuroraButton>

            <AuroraButton
              color="tonal"
              icon="slideshow"
              aria-label="Slides"
              onClick={openSlidesMode}
              title="Abrir em Slides para iPad e pedal Bluetooth"
              className="h-9 min-h-[38px] w-10 px-0 sm:w-auto sm:px-3.5"
            >
              <span className="hidden sm:inline">Slides</span>
            </AuroraButton>

            {/* Unified Ajustes popover */}
            <div ref={adjustWrapRef} className="relative">
              <button
                ref={adjustTriggerRef}
                type="button"
                data-song-adjustments-trigger="true"
                onClick={() => {
                  setMoreOpen(false);
                  setAdjustOpen((v) => !v);
                }}
                aria-expanded={adjustOpen}
                aria-haspopup="dialog"
                aria-label="Ajustes e ensaio"
                title="Ajustes de tonalidade, fonte, leitura, metrônomo e palco"
                className={`relative stage-btn h-9 min-h-[38px] w-10 px-0 xl:w-auto xl:px-3.5 typescale-label-lg flex-shrink-0 ${
                  adjustOpen ? 'stage-btn-tonal' : 'stage-btn-outlined'
                }`}
              >
                <UiIcon name="tune" size={20} />
                <span className="hidden xl:inline">Ajustes</span>
                {hasActiveAdjustments && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 xl:static w-2 h-2 rounded-full bg-primary"
                  />
                )}
              </button>

              {adjustOpen && (
                <div
                  role="dialog"
                  aria-label="Ajustes e ferramentas de ensaio"
                  data-song-adjustments-popover="true"
                  className="stage-popover fixed right-3 top-[60px] sm:absolute sm:right-0 sm:top-[calc(100%+8px)] z-50 w-[min(336px,calc(100vw-24px))] max-h-[min(86vh,720px)] overflow-y-auto rounded-[24px] bg-surface border border-outline-variant p-3.5"
                  style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
                >
                  <SongAdjustmentsPopover
                    variant="song"
                    displayedKey={displayedKey}
                    capo={song.capo}
                    beatsPerBar={beatsPerBar}
                    savedTempo={song.tempo}
                    tempoConfirmed={song.tempoConfirmed}
                    isFollowing={live.isFollowing}
                    isDark={isDark}
                    onToggleTheme={toggleThemeQuick}
                    audioBlocked={audioBlocked}
                    onUnlockAudio={unlockAudio}
                    chordCount={uniqueChords.length}
                    hideDiagramsOnXl={showSidebar}
                    onToggleChordsRef={() => setChordsRefOpen(!chordsRefOpen)}
                    hasCalibration={hasCal}
                    canCalibrate={song.sections.length >= 2}
                    calibrating={calibrating}
                    onStartCalibration={startCalibration}
                    onClearCalibration={() => setConfirmClearCalOpen(true)}
                    hasSpotify={Boolean(song.spotifyTrackId)}
                    showSpotifyPreview={showSpotifyPreview}
                    onToggleSpotifyPreview={() => setShowSpotifyPreview((v) => !v)}
                    onSaveBpm={(nextBpm) => {
                      patchMeta(song.id, 'tempo', nextBpm);
                      notify(`BPM salvo em ${nextBpm}.`);
                    }}
                    onRequestSaveTranspose={() => setConfirmSaveTransposeOpen(true)}
                    onTriggerCountIn={triggerCountIn}
                    hasSetlist={Boolean(activeSetlist)}
                    live={live}
                    onGoLive={handleGoLive}
                    onEnterFocusMode={enterCleanStage}
                    onEnterEdit={enterVisualEdit}
                    onClose={() => setAdjustOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Mais popover (Editar letra e acordes at top!) */}
            <div ref={moreWrapRef} className="relative">
              <button
                ref={moreTriggerRef}
                type="button"
                data-song-more-trigger="true"
                onClick={() => {
                  setAdjustOpen(false);
                  setMoreOpen((v) => !v);
                }}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-label="Mais ações da música"
                title="Mais ações da música"
                className={`stage-btn h-9 min-h-[38px] w-10 px-0 lg:w-auto lg:px-3 typescale-label-lg flex-shrink-0 ${
                  moreOpen ? 'stage-btn-tonal' : 'stage-btn-outlined'
                }`}
              >
                <UiIcon name="more_vert" size={20} className="lg:hidden" />
                <span className="hidden lg:inline-flex items-center gap-1">
                  Mais
                  <UiIcon
                    name="expand_more"
                    size={20}
                    className={`tx-chevron ${moreOpen ? 'tx-chevron-open' : ''}`}
                  />
                </span>
              </button>

              {moreOpen && (
                <div
                  role="dialog"
                  aria-label="Mais ações da música"
                  data-song-more-popover="true"
                  className="stage-popover fixed right-3 top-[60px] sm:absolute sm:right-0 sm:top-[calc(100%+8px)] z-50 w-[min(296px,calc(100vw-24px))] max-h-[min(78vh,560px)] overflow-y-auto rounded-[24px] bg-surface border border-outline-variant py-2"
                  style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
                >
                  <div className="px-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        enterVisualEdit();
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-label-lg flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="edit_note" size={20} className="text-primary" />
                      <span>Editar letra e acordes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setTitleDraft(song.title);
                        setArtistDraft(song.artist);
                        setEditingIdentity(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon
                        name="drive_file_rename_outline"
                        size={20}
                        className="text-on-surface-variant"
                      />
                      <span>Renomear título e artista</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowMetaDialog(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="tune" size={20} className="text-on-surface-variant" />
                      <span>Editar propriedades completas</span>
                    </button>
                  </div>

                  <div className="my-1.5 mx-3 border-t border-outline-variant/50" />

                  <div className="px-4 pt-1 pb-1 typescale-label-sm text-on-surface-variant">
                    Adicionar ao setlist
                  </div>
                  {setlists.length === 0 ? (
                    <div className="px-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          navigate('/?tab=setlists');
                        }}
                        className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-primary typescale-label-lg flex items-center gap-2 text-left cursor-pointer"
                      >
                        <UiIcon name="add" size={20} />
                        <span>Criar primeiro setlist</span>
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto px-1.5 space-y-0.5">
                      {setlists.map((sl) => {
                        const already = sl.songIds.includes(song.id);
                        return (
                          <button
                            key={sl.id}
                            type="button"
                            disabled={already}
                            onClick={() => {
                              if (!already) {
                                addSongToSetlist(sl.id, song.id);
                                notify(`Adicionada em "${sl.name}".`);
                                setMoreOpen(false);
                              }
                            }}
                            className={`stage-list-row w-full min-h-[40px] px-3 rounded-xl border-none bg-transparent typescale-body-md flex items-center justify-between gap-2 text-left ${
                              already
                                ? 'text-on-surface-variant opacity-65 cursor-default'
                                : 'text-on-surface hover:bg-surface-container-high cursor-pointer'
                            }`}
                          >
                            <span className="truncate">{sl.name}</span>
                            {already && (
                              <UiIcon name="check" size={20} className="text-tertiary flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="my-1.5 mx-3 border-t border-outline-variant/50" />

                  <div className="px-1.5 space-y-0.5">
                    {song.spotifyTrackId && (
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          setShowSpotifyPreview((v) => !v);
                        }}
                        className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        <UiIcon name="headphones" size={20} className="text-on-surface-variant" />
                        <span>
                          {showSpotifyPreview ? 'Ocultar player do Spotify' : 'Ouvir prévia no Spotify'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setNotesDraft(song.notes);
                        setEditingNotes(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="sticky_note_2" size={20} className="text-on-surface-variant" />
                      <span>
                        {song.notes
                          ? 'Editar notas de palco (Deixa)'
                          : 'Adicionar notas de palco (Deixa)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowSpotifyPicker(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="search" size={20} className="text-on-surface-variant" />
                      <span>
                        {song.spotifyTrackId ? 'Trocar vínculo no Spotify' : 'Buscar faixa no Spotify'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowEnhance(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="auto_awesome" size={20} className="text-on-surface-variant" />
                      <span>Revisar letra e acordes com IA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowHistory(true);
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="history" size={20} className="text-on-surface-variant" />
                      <span>Histórico de versões</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        handleOpenSource();
                      }}
                      className="stage-list-row w-full min-h-[44px] px-3 rounded-xl border-none bg-transparent hover:bg-surface-container-high text-on-surface typescale-body-md flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <UiIcon name="code" size={20} className="text-on-surface-variant" />
                      <span>Editar fonte ChordPro (.cho)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Main Scrollable Song Surface */}
      <main
        id="main"
        tabIndex={-1}
        style={
          swipeOffset !== 0
            ? { transform: `translate3d(${swipeOffset}px, 0, 0)`, transition: 'none' }
            : swipeImmediate
              ? { transition: 'none' }
              : undefined
        }
        className={`clean-swipe-main flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 space-y-4 focus:outline-none ${
          isCleanStage
            ? 'max-w-5xl pb-36'
            : store.editMode && editSubMode === 'chords'
              ? 'max-w-[1360px] pb-40'
              : 'max-w-[1360px] pb-28 md:pb-12'
        }`}
      >
        {/* Scrollable SongHeroStrip */}
        {!isCleanStage && !store.editMode && (
          <section data-song-hero="true" aria-label="Cabeçalho da música" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="typescale-headline-md sm:typescale-display-sm text-on-surface m-0">
                {displayTitle}
              </h1>
              {incomplete && (
                <span className="px-2.5 py-0.5 rounded-full bg-warn-bg text-warn-ink typescale-label-sm flex-shrink-0">
                  Incompleta
                </span>
              )}
              {hasCal && (
                <span className="px-2.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm flex-shrink-0">
                  Rolagem calibrada
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span className="typescale-body-md text-on-surface-variant truncate max-w-[240px]">
                  {displayArtist || 'Artista não informado'}
                </span>

                <SongMetaPopover
                  song={song}
                  displayedKey={displayedKey}
                  onPatchMeta={handlePatchSongMeta}
                  hideKey
                />

                {activeSetlist && (
                  <div className="inline-flex md:hidden items-center rounded-full bg-surface-container p-0.5 flex-shrink-0">
                    <button
                      type="button"
                      disabled={!prevSong || live.isFollowing}
                      onClick={() => prevSong && navigateSetlistSong(prevSong.id, 'lateral-prev')}
                      aria-label="Música anterior no setlist"
                      className="dock-stepper-btn disabled:opacity-35"
                    >
                      <UiIcon name="chevron_left" size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSetlistDrawer(true)}
                      aria-label={`Setlist ${currentIdx + 1} de ${setlistSongs.length}`}
                      className="h-9 px-2 rounded-full bg-transparent border-none font-mono typescale-label-sm tabular-nums text-on-surface cursor-pointer"
                    >
                      {currentIdx + 1}/{setlistSongs.length}
                    </button>
                    <button
                      type="button"
                      disabled={!nextSong || live.isFollowing}
                      onClick={() => nextSong && navigateSetlistSong(nextSong.id, 'lateral-next')}
                      aria-label="Próxima música no setlist"
                      className="dock-stepper-btn disabled:opacity-35"
                    >
                      <UiIcon name="chevron_right" size={20} />
                    </button>
                  </div>
                )}
              </div>

              {/* Direct 1-tap Tonalidade & Fonte controls (fits 320px cleanly & lifts above canvas in dark mode) */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full">
                <div
                  data-hero-transpose="true"
                  role="group"
                  aria-label="Ajustar tonalidade"
                  className="inline-flex items-center gap-0.5 rounded-full bg-surface-container border border-outline-variant/60 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => store.transposeDown()}
                    aria-label="Baixar meio tom"
                    title="Baixar meio tom"
                    className="dock-stepper-btn !min-w-[34px] !w-9 sm:!w-10 !min-h-[40px] !h-10"
                  >
                    <UiIcon name="remove" size={20} />
                  </button>
                  <button
                    type="button"
                    disabled={store.transpose === 0}
                    onClick={() => store.setTranspose(0)}
                    data-gm3-focal="true"
                    aria-label={
                      store.transpose !== 0
                        ? `Tom ${displayedKey || transposeDeltaLabel}. Toque para restaurar tom original`
                        : `Tom ${displayedKey || 'original'}`
                    }
                    title={
                      store.transpose !== 0
                        ? `Tom ${displayedKey || transposeDeltaLabel} (${transposeDeltaLabel}). Toque para voltar ao original`
                        : displayedKey
                          ? `Tom ${displayedKey}`
                          : 'Tom original'
                    }
                    className={`min-w-[40px] sm:min-w-[44px] h-9 px-2 sm:px-2.5 rounded-full font-mono typescale-label-sm tabular-nums border-none transition-colors ${
                      minor
                        ? 'bg-minor-bg text-minor-ink'
                        : 'bg-primary-container text-on-primary-container'
                    } ${store.transpose !== 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span
                      key={shiftTracker.dir === 'none' ? 'init' : `${totalShift}-${store.useFlats}`}
                      data-shift-dir={shiftTracker.dir === 'none' ? undefined : shiftTracker.dir}
                      className="chord-settle"
                    >
                      {displayedKey || transposeDeltaLabel || 'Tom'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => store.transposeUp()}
                    aria-label="Subir meio tom"
                    title="Subir meio tom"
                    className="dock-stepper-btn !min-w-[34px] !w-9 sm:!w-10 !min-h-[40px] !h-10"
                  >
                    <UiIcon name="add" size={20} />
                  </button>
                </div>

                {store.transpose !== 0 && (
                  <AuroraButton
                    color="primary-tonal"
                    icon="check"
                    onClick={() => setConfirmSaveTransposeOpen(true)}
                    className="panel-settle h-10 min-h-[40px] px-3"
                  >
                    Salvar tom
                  </AuroraButton>
                )}

                <div
                  data-hero-font="true"
                  role="group"
                  aria-label="Ajustar tamanho da fonte"
                  className="inline-flex items-center gap-0.5 rounded-full bg-surface-container border border-outline-variant/60 p-0.5"
                >
                  <button
                    type="button"
                    disabled={fontSize <= 70}
                    onClick={() => setFontSize(fontSize - 10)}
                    aria-label="Diminuir fonte"
                    title="Diminuir fonte"
                    className="dock-stepper-btn !min-w-[34px] !w-9 sm:!w-10 !min-h-[40px] !h-10 font-mono typescale-label-sm disabled:opacity-40"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    disabled={fontSize === 100}
                    onClick={() => setFontSize(100)}
                    aria-label={`Tamanho da fonte ${fontSize}%`}
                    title={fontSize !== 100 ? 'Toque para voltar a 100%' : 'Tamanho padrão (100%)'}
                    className={`min-w-[40px] sm:min-w-[44px] h-9 px-1.5 rounded-full font-mono typescale-label-sm tabular-nums border-none transition-colors ${
                      fontSize !== 100
                        ? 'bg-primary-container text-on-primary-container cursor-pointer'
                        : 'bg-transparent text-on-surface-variant cursor-default'
                    }`}
                  >
                    {fontSize}%
                  </button>
                  <button
                    type="button"
                    disabled={fontSize >= 160}
                    onClick={() => setFontSize(fontSize + 10)}
                    aria-label="Aumentar fonte"
                    title="Aumentar fonte"
                    className="dock-stepper-btn !min-w-[34px] !w-9 sm:!w-10 !min-h-[40px] !h-10 font-mono typescale-label-sm disabled:opacity-40"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>

            {song.sections.length > 1 && (
              <nav aria-label="Navegação por seções da música">
                <div
                  ref={sectionRailRef}
                  className="flex items-center gap-1.5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar py-0.5"
                >
                  {song.sections.map((sec, idx) => {
                    const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;
                    const active = activeSectionIdx === idx;
                    return (
                      <a
                        key={`${sec.label}-${idx}`}
                        href={`#song-section-${idx}`}
                        aria-current={active ? 'location' : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveSectionIdx(idx);
                          setJumpedSectionIdx(idx);
                          if (jumpHighlightTimerRef.current) {
                            window.clearTimeout(jumpHighlightTimerRef.current);
                          }
                          jumpHighlightTimerRef.current = window.setTimeout(
                            () => setJumpedSectionIdx(null),
                            700
                          );
                          const reduced = window.matchMedia(
                            '(prefers-reduced-motion: reduce)'
                          ).matches;
                          const targetEl = document.getElementById(`song-section-${idx}`);
                          if (targetEl) {
                            const top =
                              targetEl.getBoundingClientRect().top + window.scrollY - 72;
                            window.scrollTo({
                              top: Math.max(0, top),
                              behavior: reduced ? 'auto' : 'smooth',
                            });
                            targetEl.focus({ preventScroll: true });
                          }
                        }}
                        className="stage-chip typescale-label-sm"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colors.bd }}
                          aria-hidden="true"
                        />
                        {sectionChipLabels[idx]}
                      </a>
                    );
                  })}
                </div>
              </nav>
            )}
          </section>
        )}

        {/* Universal Live Session Status Strip */}
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
              <UiIcon name="sensors" size={20} />
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

        {!isCleanStage && !store.editMode && (
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

        {!isCleanStage && (song.notes || editingNotes) && (
          <section
            aria-label="Notas de palco"
            className="rounded-2xl bg-warn-bg text-warn-ink px-4 py-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 typescale-label-lg">
                <UiIcon name="sticky_note_2" size={20} />
                <span>Notas de palco (Deixa)</span>
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
                  className="stage-field text-base lg:text-sm"
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

        {!store.editMode && displayMode !== 'lyrics-only' && uniqueChords.length > 0 && (
          <AuroraCollapsible open={chordsRefOpen} className={showSidebar ? 'xl:hidden' : undefined}>
            <div className="pb-1">
              <section aria-label="Acordes usados nesta música" className="stage-card p-4 space-y-2">
                <div className="typescale-label-sm text-on-surface-variant">
                  Toque em qualquer acorde para abrir violão e teclado
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

        {manualYieldNotice && (
          <div className="fixed top-[66px] inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
            <div
              role="status"
              aria-live="polite"
              className="stage-toast rounded-full bg-inverse-surface text-inverse-on-surface px-4 py-1.5 typescale-label-sm"
              style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
            >
              Rolagem pausada manualmente
            </div>
          </div>
        )}

        {/* Main chord sheet + desktop Studio Sidebar */}
        <div
          className={
            showSidebar ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_336px] xl:items-start gap-6' : ''
          }
        >
          <div className="space-y-4">
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
                  editSubMode={editSubMode}
                  stampChord={stampChord}
                  selectedChordInSection={
                    selectedChordEdit && selectedChordEdit.sectionIdx === idx
                      ? { lineIdx: selectedChordEdit.lineIdx, segIdx: selectedChordEdit.segIdx }
                      : null
                  }
                  calibrating={calibrating}
                  calibrationMark={
                    calibrating ? calMarks[idx] ?? null : song.sectionMarks?.[idx] ?? null
                  }
                  isJumpTarget={jumpedSectionIdx === idx}
                  isJustMoved={movedSectionIdx === idx}
                  lastStamped={lastStamped}
                  onCalibrateStamp={stampSection}
                  onSelectChord={handleSelectChord}
                  onEditChord={(si, li, segIdx, chord) => {
                    setAddChordEdit(null);
                    setPickStampOpen(false);
                    setSelectedChordEdit({ sectionIdx: si, lineIdx: li, segIdx, chord });
                  }}
                  onAddChord={(si, li, charPos) => {
                    setSelectedChordEdit(null);
                    setPickStampOpen(false);
                    setAddChordEdit({ sectionIdx: si, lineIdx: li, charPos });
                  }}
                  onStampAt={(si, li, charPos) => {
                    if (!stampChord) return;
                    const oldLine = song.sections[si]?.lines[li] ?? '';
                    const nextLine = insertChord(oldLine, charPos, stampChord);
                    const nextSegs = parseLine(nextLine);
                    let run = 0;
                    let foundSeg = 0;
                    for (let idxSeg = 0; idxSeg < nextSegs.length; idxSeg += 1) {
                      if (nextSegs[idxSeg].chord === stampChord && Math.abs(run - charPos) <= 1) {
                        foundSeg = idxSeg;
                        break;
                      }
                      run += nextSegs[idxSeg].text.length;
                    }
                    setLastStamped((prev) => ({
                      sectionIdx: si,
                      lineIdx: li,
                      segIdx: foundSeg,
                      seq: (prev?.seq ?? 0) + 1,
                    }));
                    setStampAnnouncement(`Acorde ${stampChord} carimbado na linha ${li + 1}`);
                    mutateDraftSong((p) => ({
                      ...p,
                      sections: p.sections.map((s, sIdx) =>
                        sIdx === si
                          ? {
                              ...s,
                              lines: s.lines.map((l, lIdx) =>
                                lIdx === li ? insertChord(l, charPos, stampChord) : l
                              ),
                            }
                          : s
                      ),
                    }));
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
                  onMoveSection={(si, dir) => {
                    const targetIdx =
                      dir === 'up' ? Math.max(0, si - 1) : Math.min(song.sections.length - 1, si + 1);
                    mutateDraftSong((p) => ({
                      ...p,
                      sections: moveSongSection(p.sections, si, dir),
                    }));
                    setMovedSectionIdx(targetIdx);
                    if (moveHighlightTimerRef.current) {
                      window.clearTimeout(moveHighlightTimerRef.current);
                    }
                    moveHighlightTimerRef.current = window.setTimeout(
                      () => setMovedSectionIdx(null),
                      650
                    );
                  }}
                  onDuplicateSection={(si) =>
                    mutateDraftSong((p) => ({
                      ...p,
                      sections: duplicateSongSection(p.sections, si),
                    }))
                  }
                  onRemoveSection={(si) => {
                    const removedName = formatSectionLabel(sec.label);
                    mutateDraftSong((p) => ({
                      ...p,
                      sections: removeSongSection(p.sections, si),
                    }));
                    notify(`Seção "${removedName}" removida.`, { undoDraft: true });
                  }}
                />
              ))}
            </article>

            {/* Quick Section Presets in Edit Mode */}
            {store.editMode && (
              <div className="stage-card p-4 space-y-2.5 bg-surface-container-low">
                <div className="typescale-label-sm text-on-surface-variant">
                  Adicionar nova seção
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SECTION_PRESETS.map((preset) => (
                    <AuroraChip
                      key={preset}
                      icon="add"
                      onClick={() =>
                        mutateDraftSong((p) => {
                          const added = addSongSection(p.sections, preset);
                          const lastIdx = added.length - 1;
                          return {
                            ...p,
                            sections: added.map((sec, idx) =>
                              idx === lastIdx && sec.lines.every((l) => !l.trim())
                                ? { ...sec, lines: [''] }
                                : sec
                            ),
                          };
                        })
                      }
                    >
                      {preset}
                    </AuroraChip>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showSidebar && (
            <aside
              aria-label="Painel lateral de acordes e sequência"
              className="hidden xl:flex flex-col gap-4 sticky top-[72px]"
            >
              {displayMode !== 'lyrics-only' && uniqueChords.length > 0 && (
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
                            onClick={() => navigateSetlistSong(s.id)}
                            className={`stage-list-row w-full min-h-[44px] px-3 py-1.5 rounded-xl border-none flex items-center justify-between gap-2 text-left cursor-pointer ${
                              current
                                ? 'bg-secondary-container text-on-secondary-container'
                                : 'bg-transparent text-on-surface hover:bg-surface-container-high'
                            }`}
                          >
                            <span className="typescale-body-md truncate">
                              <span className="font-mono text-on-surface-variant mr-1.5">
                                {idx + 1}.
                              </span>
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
      </main>

      {/* Song View Floating Auto-Scroll Speed & Lead-In Dock (shown only while scrolling!) */}
      {store.isAutoScrolling && !isCleanStage && !store.editMode && !live.isFollowing && (
        <nav
          aria-label="Controles de velocidade da rolagem"
          data-scroll-dock="true"
          className="fixed bottom-20 md:bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
        >
          <div className="dock-enter-bottom stage-floating-bar pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 max-w-full">
            <AuroraButton
              color="filled"
              icon={leadInLeft > 0 ? 'hourglass_top' : 'pause'}
              onClick={() => store.setAutoScrolling(false)}
              className="h-9 min-h-[38px] px-3 tabular-nums"
            >
              {leadInLeft > 0 ? `Em ${leadInLeft}s` : 'Pausar'}
            </AuroraButton>

            {leadInLeft > 0 ? (
              <AuroraButton
                color="tonal"
                onClick={() => skipLeadInRef.current?.()}
                className="h-9 min-h-[38px] px-3"
              >
                Iniciar já
              </AuroraButton>
            ) : (
              <>
                <div className="inline-flex items-center rounded-full bg-surface-container p-0.5">
                  <button
                    type="button"
                    aria-label="Diminuir velocidade da rolagem"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                    className="dock-stepper-btn"
                  >
                    <UiIcon name="remove" size={20} />
                  </button>
                  <span
                    aria-live="polite"
                    className="font-mono typescale-label-sm tabular-nums text-on-surface px-1.5 min-w-[40px] text-center"
                  >
                    {store.autoScrollSpeed.toFixed(1)}×
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar velocidade da rolagem"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                    className="dock-stepper-btn"
                  >
                    <UiIcon name="add" size={20} />
                  </button>
                </div>

                <div className="hidden sm:inline-flex items-center gap-1">
                  {[0.7, 1.0, 1.3].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => store.setAutoScrollSpeed(preset)}
                      className={`h-8 px-2.5 rounded-full border-none font-mono typescale-label-sm cursor-pointer transition-colors ${
                        Math.abs(store.autoScrollSpeed - preset) < 0.05
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {preset.toFixed(1)}×
                    </button>
                  ))}
                </div>

                {speedChanged && (
                  <AuroraButton
                    color="primary-tonal"
                    icon="check"
                    onClick={() => {
                      patchMeta(song.id, 'scroll', Number(store.autoScrollSpeed.toFixed(2)));
                      notify(`Ritmo de rolagem salvo em ${store.autoScrollSpeed.toFixed(1)}×.`);
                    }}
                    className="h-9 min-h-[38px] px-3"
                  >
                    Salvar ritmo
                  </AuroraButton>
                )}
              </>
            )}
          </div>
        </nav>
      )}

      {/* 1-Tap Chord Stamping Bottom Dock ("Acordes" sub-mode) */}
      {store.editMode && editSubMode === 'chords' && !selectedChordEdit && !addChordEdit && !pickStampOpen && (
        <ChordStampDock
          songChords={rawUniqueChords}
          songKey={song.originalKey}
          activeChord={stampChord}
          statusAnnouncement={stampAnnouncement}
          onSelectChord={(c) => {
            setStampChord(c);
            setStampAnnouncement(`Acorde ${c} selecionado para carimbar`);
          }}
          onOpenCustomPicker={() => setPickStampOpen(true)}
        />
      )}

      {/* Replace-All Chord Snackbar (when renaming a chord appearing multiple times) */}
      {store.editMode && replaceAllPrompt && (
        <div className="fixed bottom-24 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div
            role="status"
            aria-live="polite"
            style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
            className="dock-enter-bottom inverse-snackbar pointer-events-auto w-full max-w-md rounded-2xl bg-inverse-surface text-inverse-on-surface px-4 py-2.5 flex items-center justify-between gap-2"
          >
            <span className="typescale-body-sm">
              Trocar os outros {replaceAllPrompt.count} [{replaceAllPrompt.oldChord}] por [
              {replaceAllPrompt.newChord}]?
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <AuroraButton
                color="text"
                className="text-inverse-primary"
                onClick={() => {
                  const { oldChord, newChord } = replaceAllPrompt;
                  mutateDraftSong((p) => {
                    const res = replaceAllChordsInSections(p.sections, oldChord, newChord);
                    return { ...p, sections: res.sections };
                  });
                  setReplaceAllPrompt(null);
                  notify(`Todos os ${oldChord} trocados por ${newChord}.`, { undoDraft: true });
                }}
              >
                Trocar todos
              </AuroraButton>
              <AuroraIconButton
                icon="close"
                label="Fechar sugestão"
                className="text-inverse-on-surface"
                onClick={() => setReplaceAllPrompt(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Inverse Snackbar */}
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
              {(toast.undoText || toast.undoDraft) && (
                <AuroraButton
                  color="text"
                  className="text-inverse-primary"
                  onClick={() => {
                    if (toast.undoDraft) {
                      handleUndo();
                    } else if (toast.undoText) {
                      updateEntry(song.id, toast.undoText);
                      if (toast.undoTranspose !== undefined) {
                        store.setTranspose(toast.undoTranspose);
                      }
                    }
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

      {/* Quick Setlist Drawer with live reorder (shortcut S) */}
      {activeSetlist && (
        <AuroraSheet
          open={showSetlistDrawer}
          onClose={() => setShowSetlistDrawer(false)}
          motionScheme={isCleanStage ? 'standard' : 'expressive'}
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
                <li
                  key={s.id}
                  className={`rounded-2xl flex items-center gap-1 pr-1 ${
                    current
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-low text-on-surface'
                  }`}
                >
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      setShowSetlistDrawer(false);
                      navigateSetlistSong(s.id);
                    }}
                    className="stage-list-row flex-1 min-w-0 min-h-[48px] px-4 py-2.5 rounded-2xl border-none bg-transparent text-inherit flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <span className="typescale-title-md truncate">
                      {idx + 1}. {sInfo.title}
                    </span>
                    <span className="typescale-label-sm font-mono flex-shrink-0">
                      {sKey || '-'}
                    </span>
                  </button>
                  <div className="flex items-center flex-shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      aria-label={`Mover ${sInfo.title} para cima`}
                      onClick={() => reorderSong(activeSetlist.id, idx, idx - 1)}
                      className="dock-stepper-btn disabled:opacity-30"
                    >
                      <UiIcon name="arrow_upward" size={20} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === setlistSongs.length - 1}
                      aria-label={`Mover ${sInfo.title} para baixo`}
                      onClick={() => reorderSong(activeSetlist.id, idx, idx + 1)}
                      className="dock-stepper-btn disabled:opacity-30"
                    >
                      <UiIcon name="arrow_downward" size={20} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </AuroraSheet>
      )}

      {/* Confirm Permanent Transpose Rewrite */}
      <AuroraDialog
        open={confirmSaveTransposeOpen}
        onClose={() => setConfirmSaveTransposeOpen(false)}
        motionScheme={isCleanStage ? 'standard' : 'expressive'}
        title={`Fixar música em ${displayedKey || transposeDeltaLabel}?`}
        subtitle="Reescreve todos os acordes da cifra no novo tom e cria backup automático no histórico."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmSaveTransposeOpen(false)}>
            Cancelar
          </AuroraButton>
          <AuroraButton color="filled" icon="check" onClick={performSavePermanentTranspose}>
            Salvar neste tom
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Confirm Calibration Removal */}
      <AuroraDialog
        open={confirmClearCalOpen}
        onClose={() => setConfirmClearCalOpen(false)}
        motionScheme={isCleanStage ? 'standard' : 'expressive'}
        title="Remover calibração de rolagem?"
        subtitle="A rolagem voltará a estimar o tempo automaticamente por seção."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmClearCalOpen(false)}>
            Cancelar
          </AuroraButton>
          <AuroraButton color="danger" icon="delete" onClick={performClearCalibration}>
            Remover calibração
          </AuroraButton>
        </div>
      </AuroraDialog>

      {/* Go-Live Name Prompt Dialog */}
      <AuroraDialog
        open={showGoLiveDialog}
        onClose={() => setShowGoLiveDialog(false)}
        motionScheme={isCleanStage ? 'standard' : 'expressive'}
        title="Iniciar Ao vivo"
        subtitle="Seu nome, para a banda saber quem está puxando a música"
        maxWidth="max-w-sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmGoLive();
          }}
          className="space-y-4"
        >
          <input
            type="text"
            autoFocus
            value={liveNameInput}
            onChange={(e) => setLiveNameInput(e.target.value)}
            aria-label="Seu nome na sessão ao vivo"
            placeholder="Ex.: Alex - Guitarra"
            className="stage-field"
          />
          <div className="flex justify-end gap-2">
            <AuroraButton color="outlined" onClick={() => setShowGoLiveDialog(false)}>
              Cancelar
            </AuroraButton>
            <AuroraButton type="submit" color="filled" icon="sensors">
              Iniciar
            </AuroraButton>
          </div>
        </form>
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

      {/* Visual Chord Editor Modal (word-jump, hold-repeat nudge, prev/next stepping, chain-insert, custom stamp picker) */}
      <VisualChordEditModal
        selected={selectedChordEdit}
        addTarget={addChordEdit}
        pickStampMode={pickStampOpen}
        activeLine={activeEditLine}
        songChords={rawUniqueChords}
        songKey={song.originalKey}
        canStepPrev={canStepPrev}
        canStepNext={canStepNext}
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
        onMoveWord={(si, li, segIdx, dir) => {
          mutateDraftSong((p) => {
            const line = p.sections[si]?.lines[li];
            if (line === undefined) return p;
            const res = moveChordByWordWithIndex(line, segIdx, dir);
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
        onStepChord={(dir) => {
          if (!selectedChordEdit) return;
          const adj = findAdjacentChord(song.sections, selectedChordEdit, dir);
          if (!adj) return;
          const targetLine = song.sections[adj.sectionIdx]?.lines[adj.lineIdx] ?? '';
          const targetChord = parseLine(targetLine)[adj.segIdx]?.chord ?? '';
          if (targetChord) {
            setSelectedChordEdit({ ...adj, chord: targetChord });
          }
        }}
        onRename={(si, li, segIdx, nextChord) => {
          const prevChord = selectedChordEdit?.chord ?? '';
          const remainingCount =
            prevChord && prevChord !== nextChord
              ? countChordOccurrences(song.sections, prevChord) - 1
              : 0;
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
          setSelectedChordEdit((curr) => (curr ? { ...curr, chord: nextChord } : curr));
          if (remainingCount > 0) {
            setReplaceAllPrompt({ oldChord: prevChord, newChord: nextChord, count: remainingCount });
            if (replaceTimerRef.current) window.clearTimeout(replaceTimerRef.current);
            replaceTimerRef.current = window.setTimeout(() => setReplaceAllPrompt(null), 7000);
          }
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
          notify('Acorde removido.', { undoDraft: true });
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
        onInsertAndNext={(si, li, charPos, chord) => {
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
          setAddChordEdit({ sectionIdx: si, lineIdx: li, charPos: charPos + 4 });
        }}
        onPickStamp={(chord) => {
          setStampChord(chord);
          setPickStampOpen(false);
        }}
        onClose={() => {
          setSelectedChordEdit(null);
          setAddChordEdit(null);
          setPickStampOpen(false);
        }}
      />

      {/* Song Metadata Dialog */}
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
          patchMeta(song.id, 'time', upd.timeSignature);
          if (upd.durationSec !== null) patchMeta(song.id, 'duration', upd.durationSec);
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

      {activeCountIn && (
        <CountInOverlay
          bpm={activeCountIn.bpm}
          beats={activeCountIn.beats}
          leaderName={activeCountIn.leaderName}
          onDone={() => {
            setCountInOpen(false);
            live.clearIncomingCountIn();
          }}
          onCancel={() => {
            setCountInOpen(false);
            live.clearIncomingCountIn();
          }}
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
          notify('Versão anterior restaurada.', { undoText: prevText });
        }}
      />

      <AuroraDialog
        open={showSource}
        onClose={handleRequestCloseSource}
        title="Fonte ChordPro (.cho)"
        subtitle="Edite diretivas, seções e acordes diretamente com destaque de sintaxe e prévia"
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
              <div className="space-y-2">
                <textarea
                  aria-label="Editor de texto ChordPro"
                  rows={18}
                  value={sourceDraft}
                  onChange={(e) => setSourceDraft(e.target.value)}
                  className="stage-field font-mono text-base lg:text-xs resize-y"
                />
                <details className="rounded-xl bg-surface-container-low px-3 py-2">
                  <summary className="typescale-label-sm text-on-surface-variant cursor-pointer">
                    Leitura com destaque de sintaxe
                  </summary>
                  <pre
                    className="mt-2 max-h-44 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap m-0"
                    dangerouslySetInnerHTML={{ __html: highlightChordPro(sourceDraft) }}
                  />
                </details>
              </div>
            )}
            {sourceTab !== 'edit' && sourcePreviewSong && (
              <div className="rounded-2xl bg-surface-container-low p-4 max-h-[54dvh] overflow-y-auto space-y-3">
                {sourcePreviewSong.sections.map((sec, si) => (
                  <div key={si} className="space-y-2">
                    <div className="typescale-label-sm text-primary">
                      {formatSectionLabel(sec.label)}
                    </div>
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
                                {tail && (
                                  <span className="text-on-surface whitespace-pre-wrap">{tail}</span>
                                )}
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
    </div>
  );
}
