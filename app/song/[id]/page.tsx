'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useLiveSession } from '@/lib/stores/live-session-store';
import { extractChords, transposeChord, parseLine, transposeSong } from '@/lib/utils/music';
import { moveChord, renameChord, deleteChord, insertChord } from '@/lib/utils/edit-chordpro';
import { songToChordPro, removeChordProMeta } from '@/lib/utils/chordpro-parser';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { ChordPanel } from '@/components/chord-diagrams/ChordPanel';
import { Metronome } from '@/components/metronome/Metronome';
import { EditChordOverlay } from '@/components/chord-sheet/EditChordOverlay';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import type { SpotifyTrackResult } from '@/lib/spotify';

type SelectedCoord = { sectionIdx: number; lineIdx: number; segIdx: number };
type AddTarget = { sectionIdx: number; lineIdx: number; charPos: number };

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getSong, patchMeta, exportEntry, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const store = usePlayerStore();
  const [showExport, setShowExport] = useState(false);
  const [showSpotifyPreview, setShowSpotifyPreview] = useState(false);
  const [showSpotifyPicker, setShowSpotifyPicker] = useState(false);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [autoSearchLoading, setAutoSearchLoading] = useState(false);
  const [spotifySuggestionDismissed, setSpotifySuggestionDismissed] = useState(false);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [showSetlistMenu, setShowSetlistMenu] = useState(false);
  const [setlistMsg, setSetlistMsg] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [showTransposeConfirm, setShowTransposeConfirm] = useState(false);

  // Edit mode state
  const [selectedCoord, setSelectedCoord] = useState<SelectedCoord | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

  // Live session (cross-device sync while playing a setlist)
  const setlistIdParam = searchParams.get('setlist');
  const activeSetlist = setlistIdParam
    ? setlists.find((sl) => sl.id === setlistIdParam) ?? null
    : null;
  const scrollTopRef = useRef(0);
  const live = useLiveSession(activeSetlist ? activeSetlist.id : null, id, scrollTopRef);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const song = getSong(id);

  useEffect(() => {
    if (song) store.setBpm(song.tempo);
  }, [song?.tempo]);

  useEffect(() => {
    if (song) store.setCapo(song.capo);
  }, [song?.capo]);

  // Follow the leader to whatever song they're on
  useEffect(() => {
    if (!activeSetlist) return;
    if (live.isFollowing && live.session.currentSongId && live.session.currentSongId !== id) {
      router.push(`/song/${live.session.currentSongId}?setlist=${activeSetlist.id}`);
    }
  }, [activeSetlist, live.isFollowing, live.session.currentSongId, id, router]);

  // Auto-search Spotify for songs that don't have a match yet, so a
  // suggestion card can show up without the user having to search manually.
  useEffect(() => {
    if (!song) return;
    if (song.spotifyTrackId) return;
    let cancelled = false;
    // Standard cancelable fetch-on-mount pattern (identical to the one in
    // app/add-song/page.tsx, which lints clean) — the loading flag just
    // gates the fallback "Find on Spotify" button below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoSearchLoading(true);
    const query = `${song.title} ${song.artist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSpotifyResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpotifyResults([]);
      })
      .finally(() => {
        if (!cancelled) setAutoSearchLoading(false);
      });
    return () => { cancelled = true; };
  }, [song?.spotifyTrackId, song?.title, song?.artist]);

  const handleGoLive = () => {
    if (!live.deviceName) {
      setNameInput('');
      setShowNamePrompt(true);
    } else {
      live.startLeading();
    }
  };

  const confirmGoLive = () => {
    if (!nameInput.trim()) return;
    live.startLeading(nameInput.trim());
    setShowNamePrompt(false);
  };

  // Clear selection when leaving edit mode
  useEffect(() => {
    if (!store.editMode) {
      const timer = setTimeout(() => {
        setSelectedCoord(null);
        setAddTarget(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [store.editMode]);

  if (!song) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Song not found.{' '}
        <button onClick={() => router.push('/')} className="text-violet-400 underline ml-2">
          Go back
        </button>
      </div>
    );
  }

  const allChords = extractChords(song.sections);
  const totalShift = store.transpose + store.capo;
  const displayedKey = totalShift
    ? transposeChord(song.displayKey, totalShift, store.useFlats)
    : song.displayKey;

  const setlistSongIdx = activeSetlist ? activeSetlist.songIds.indexOf(id) : -1;
  const prevSongId = setlistSongIdx > 0 ? activeSetlist!.songIds[setlistSongIdx - 1] : null;
  const nextSongId =
    activeSetlist && setlistSongIdx >= 0 && setlistSongIdx < activeSetlist.songIds.length - 1
      ? activeSetlist.songIds[setlistSongIdx + 1]
      : null;

  // ── Edit helpers ────────────────────────────────────────────────────────────
  // Capture the narrowed song in a const so nested functions can access it
  const currentSong = song;

  function applyLineEdit(sectionIdx: number, lineIdx: number, newLine: string) {
    const updatedSections = currentSong.sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l, li) => (li === lineIdx ? newLine : l)),
      };
    });
    const updatedSong = { ...currentSong, sections: updatedSections };
    updateEntry(id, songToChordPro(updatedSong));
  }

  function handleChordSelect(sectionIdx: number, lineIdx: number, segIdx: number) {
    if (
      selectedCoord?.sectionIdx === sectionIdx &&
      selectedCoord?.lineIdx === lineIdx &&
      selectedCoord?.segIdx === segIdx
    ) {
      setSelectedCoord(null);
      setAddTarget(null);
    } else {
      setSelectedCoord({ sectionIdx, lineIdx, segIdx });
      setAddTarget(null);
    }
  }

  function handleAddChord(sectionIdx: number, lineIdx: number, charPos: number) {
    setSelectedCoord(null);
    setAddTarget({ sectionIdx, lineIdx, charPos });
  }

  function handleMove(sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = moveChord(line, segIdx, dir);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleRename(sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = renameChord(line, segIdx, newChord);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleDelete(sectionIdx: number, lineIdx: number, segIdx: number) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = deleteChord(line, segIdx);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleInsert(sectionIdx: number, lineIdx: number, charPos: number, chord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = insertChord(line, charPos, chord);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function closeOverlay() {
    setSelectedCoord(null);
    setAddTarget(null);
  }

  const overlayChordName = selectedCoord
    ? parseLine(currentSong.sections[selectedCoord.sectionIdx].lines[selectedCoord.lineIdx])[selectedCoord.segIdx]?.chord ?? ''
    : '';

  const overlaySelected = selectedCoord && overlayChordName
    ? { ...selectedCoord, chord: overlayChordName }
    : null;

  // ── Rating / Favorite / Setlist ────────────────────────────────────────────

  const handleStar = (star: number) => {
    patchMeta(id, 'rating', song.rating === star ? 0 : star);
  };

  const handleFavorite = () => {
    patchMeta(id, 'favorite', song.favorite ? 'false' : 'true');
  };

  const handleAddToSetlist = (setlistId: string, setlistName: string) => {
    addSongToSetlist(setlistId, id);
    setSetlistMsg(`Added to "${setlistName}"`);
    setShowSetlistMenu(false);
    setTimeout(() => setSetlistMsg(''), 2000);
  };

  const openSpotifyPicker = () => {
    setShowSpotifyPicker(true);
    setSpotifyLoading(true);
    const query = `${song.title} ${song.artist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => setSpotifyResults(data.results ?? []))
      .catch(() => setSpotifyResults([]))
      .finally(() => setSpotifyLoading(false));
  };

  const handleSelectSpotify = (trackId: string) => {
    patchMeta(id, 'spotify', trackId);
    setShowSpotifyPicker(false);
    setShowMoreSuggestions(false);
  };

  const handleClearSpotify = () => {
    const text = exportEntry(id);
    if (text) updateEntry(id, removeChordProMeta(text, 'spotify'));
    setShowSpotifyPicker(false);
    setShowSpotifyPreview(false);
    setSpotifySuggestionDismissed(false);
  };

  const handleSaveAsKey = () => {
    const transposed = transposeSong(song, store.transpose, store.useFlats);
    updateEntry(id, songToChordPro(transposed));
    store.setTranspose(0);
    setShowTransposeConfirm(false);
    setSavedMsg('✓ Saved as new key');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto space-y-1.5">
        <Breadcrumb
          items={
            activeSetlist
              ? [
                  { label: 'Home', href: '/' },
                  { label: 'Setlists', href: '/?tab=setlists' },
                  { label: activeSetlist.name, href: `/setlists/${activeSetlist.id}` },
                  { label: song.title },
                ]
              : [{ label: 'Home', href: '/' }, { label: song.title }]
          }
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {activeSetlist && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => prevSongId && router.push(`/song/${prevSongId}?setlist=${activeSetlist.id}`)}
                  disabled={!prevSongId}
                  className="text-zinc-400 hover:text-white disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors text-sm"
                  title="Previous song in setlist"
                >
                  &#8249;
                </button>
                <button
                  onClick={() => nextSongId && router.push(`/song/${nextSongId}?setlist=${activeSetlist.id}`)}
                  disabled={!nextSongId}
                  className="text-zinc-400 hover:text-white disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors text-sm"
                  title="Next song in setlist"
                >
                  &#8250;
                </button>
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold font-display text-zinc-100">{song.title}</h1>
              <div className="text-xs text-zinc-400">{song.artist}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Live session status */}
            {activeSetlist && (
              <div className="relative flex items-center gap-1.5">
                {live.isLeading ? (
                  <>
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Leading
                    </span>
                    <button
                      onClick={live.stopLeading}
                      className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                    >
                      Stop
                    </button>
                  </>
                ) : live.isFollowing ? (
                  <>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-violet-400 font-semibold">
                      &#128279; {live.isLeaderStale ? `${live.session.leaderName} inactive` : `Following ${live.session.leaderName}`}
                    </span>
                    <button
                      onClick={handleGoLive}
                      className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                    >
                      Take over
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleGoLive}
                    className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    &#128308; Go Live
                  </button>
                )}
                {showNamePrompt && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 p-3 space-y-2">
                    <div className="text-xs text-zinc-400">Your name, so the band knows who&rsquo;s leading:</div>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmGoLive(); if (e.key === 'Escape') setShowNamePrompt(false); }}
                      placeholder="e.g. Alex - Guitar"
                      className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 outline-none focus:border-violet-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowNamePrompt(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                      <button onClick={confirmGoLive} className="text-xs px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold">Go Live</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Star rating */}
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStar(star)}
                  className={`text-lg transition-colors ${
                    star <= song.rating ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-400/60'
                  }`}
                >★</button>
              ))}
            </div>

            {/* Favorite */}
            <button
              onClick={handleFavorite}
              className={`text-xl transition-colors ${
                song.favorite ? 'text-red-400' : 'text-zinc-600 hover:text-red-400/60'
              }`}
            >
              {song.favorite ? '♥' : '♡'}
            </button>

            {/* Add to setlist */}
            <div className="relative">
              <button
                onClick={() => setShowSetlistMenu(!showSetlistMenu)}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
              >
                + Setlist
              </button>
              {showSetlistMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  {setlists.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-500">
                      No setlists yet.{' '}
                      <button
                        onClick={() => { setShowSetlistMenu(false); router.push('/'); }}
                        className="text-violet-400 underline"
                      >
                        Create one
                      </button>
                    </div>
                  ) : (
                    setlists.map((sl) => {
                      const already = sl.songIds.includes(id);
                      return (
                        <button
                          key={sl.id}
                          onClick={() => !already && handleAddToSetlist(sl.id, sl.name)}
                          disabled={already}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            already ? 'text-zinc-600 cursor-default' : 'text-zinc-200 hover:bg-zinc-800'
                          }`}
                        >
                          {sl.name}
                          {already && <span className="ml-2 text-xs text-zinc-600">✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {setlistMsg && (
              <span className="text-xs text-green-400 font-medium">{setlistMsg}</span>
            )}

            {/* Key */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Key:</span>
              <span className="text-sm font-mono font-bold text-violet-400">{displayedKey}</span>
            </div>

            {/* Capo */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Capo:</span>
              <button onClick={() => patchMeta(id, 'capo', Math.max(0, song.capo - 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">-</button>
              <span className="text-sm font-mono text-amber-400 w-4 text-center">{song.capo}</span>
              <button onClick={() => patchMeta(id, 'capo', Math.min(12, song.capo + 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">+</button>
            </div>

            {/* BPM */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">BPM:</span>
              <button onClick={() => patchMeta(id, 'tempo', Math.max(20, song.tempo - 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">-</button>
              <input
                type="number"
                value={song.tempo}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 20 && v <= 300) patchMeta(id, 'tempo', v);
                }}
                className="w-10 text-center text-sm font-mono text-zinc-300 bg-transparent border-b border-zinc-700 outline-none focus:border-violet-500"
              />
              <button onClick={() => patchMeta(id, 'tempo', Math.min(300, song.tempo + 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">+</button>
            </div>

            {/* Time Signature */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Time:</span>
              <select
                value={song.timeSignature}
                onChange={(e) => patchMeta(id, 'time', e.target.value)}
                className="text-sm font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 outline-none focus:border-violet-500"
              >
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
                <option value="2/4">2/4</option>
                <option value="5/4">5/4</option>
                <option value="7/8">7/8</option>
              </select>
            </div>

            {/* Spotify match */}
            <div className="relative flex items-center gap-1">
              {song.spotifyTrackId && (
                <>
                  <button
                    onClick={() => setShowSpotifyPreview(!showSpotifyPreview)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      showSpotifyPreview ? 'bg-green-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                    }`}
                  >
                    &#127925; Preview
                  </button>
                  <button
                    onClick={openSpotifyPicker}
                    title="Change Spotify match"
                    className="text-xs px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 transition-colors"
                  >
                    &#8635;
                  </button>
                </>
              )}
              {!song.spotifyTrackId && !autoSearchLoading && (spotifyResults.length === 0 || spotifySuggestionDismissed) && (
                <button
                  onClick={openSpotifyPicker}
                  className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                >
                  &#127925; Find on Spotify
                </button>
              )}

              {showSpotifyPicker && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 p-3 space-y-2">
                  {spotifyLoading ? (
                    <div className="text-xs text-zinc-500 py-2 text-center">Searching Spotify...</div>
                  ) : spotifyResults.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-2 text-center">No matches found.</div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {spotifyResults.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => handleSelectSpotify(track.id)}
                          className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-left transition-colors ${
                            song.spotifyTrackId === track.id
                              ? 'border-violet-500 bg-violet-500/10'
                              : 'border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {track.albumArt ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={track.albumArt} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs text-zinc-100 truncate">{track.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{track.artist}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between pt-1">
                    {song.spotifyTrackId && (
                      <button onClick={handleClearSpotify} className="text-xs text-red-400 hover:text-red-300">
                        Clear match
                      </button>
                    )}
                    <button
                      onClick={() => setShowSpotifyPicker(false)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 ml-auto"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Export .cho */}
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
            >
              .cho
            </button>
          </div>
        </div>
        </div>
      </header>

      {/* Spotify preview */}
      {showSpotifyPreview && song.spotifyTrackId && (
        <div className="border-b border-zinc-800 px-4 py-2">
          <div className="max-w-5xl mx-auto">
            <iframe
              key={song.spotifyTrackId}
              src={`https://open.spotify.com/embed/track/${song.spotifyTrackId}?utm_source=generator`}
              width="100%"
              height="152"
              style={{ border: 0 }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Spotify suggested match — shown automatically, no click required */}
      {!song.spotifyTrackId && !spotifySuggestionDismissed && spotifyResults.length > 0 && (
        <div className="border-b border-violet-900/40 bg-violet-950/10 px-4 py-3">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3">
              {spotifyResults[0].albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={spotifyResults[0].albumArt} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded bg-zinc-800 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-violet-400 font-semibold mb-0.5">Suggested match on Spotify</div>
                <div className="text-sm text-zinc-100 truncate">{spotifyResults[0].name}</div>
                <div className="text-xs text-zinc-500 truncate">{spotifyResults[0].artist}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleSelectSpotify(spotifyResults[0].id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors"
                >
                  Use this
                </button>
                {spotifyResults.length > 1 && (
                  <button
                    onClick={() => setShowMoreSuggestions(!showMoreSuggestions)}
                    className="text-xs px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    {showMoreSuggestions ? 'Hide' : `${spotifyResults.length - 1} more`}
                  </button>
                )}
                <button
                  onClick={() => setSpotifySuggestionDismissed(true)}
                  title="Dismiss"
                  className="text-zinc-500 hover:text-zinc-300 text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors"
                >
                  &times;
                </button>
              </div>
            </div>

            {showMoreSuggestions && (
              <div className="mt-2 space-y-1.5 pl-[60px]">
                {spotifyResults.slice(1).map((track) => (
                  <button
                    key={track.id}
                    onClick={() => handleSelectSpotify(track.id)}
                    className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
                  >
                    {track.albumArt ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.albumArt} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-100 truncate">{track.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{track.artist}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto flex-wrap gap-2">
          {/* Transpose */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Transpose:</span>
            <button onClick={store.transposeDown} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors">-</button>
            <span className="text-xs font-mono text-zinc-300 w-6 text-center">
              {store.transpose > 0 ? `+${store.transpose}` : store.transpose || '0'}
            </span>
            <button onClick={store.transposeUp} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors">+</button>
            <button
              onClick={store.toggleFlats}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                store.useFlats ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {store.useFlats ? 'b' : '#'}
            </button>
            {store.transpose !== 0 && (
              <button
                onClick={() => setShowTransposeConfirm(true)}
                title="Permanently rewrite the chords in this key"
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-violet-400 transition-colors"
              >
                &#128190; Save as Key
              </button>
            )}
          </div>

          {/* Font size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Size:</span>
            <button onClick={() => store.setFontSize(store.fontSize - 10)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors">A-</button>
            <button onClick={() => store.setFontSize(store.fontSize + 10)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors">A+</button>
          </div>

          {/* Auto scroll */}
          {live.isFollowing ? (
            <div className="flex items-center gap-2">
              <span className="text-xs px-3 py-1.5 rounded font-bold bg-zinc-800 text-violet-400">
                {store.isAutoScrolling ? 'Scrolling (synced)' : 'Auto Scroll (synced)'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={store.toggleAutoScroll}
                disabled={store.editMode}
                className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
                  store.isAutoScrolling
                    ? 'bg-green-600 text-white'
                    : store.editMode
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {store.isAutoScrolling ? 'Scrolling...' : 'Auto Scroll'}
              </button>
              {store.isAutoScrolling && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => store.setAutoScrollSpeed(Math.max(0.05, +(store.autoScrollSpeed - 0.05).toFixed(2)))}
                    className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-xs transition-colors"
                  >-</button>
                  {[
                    { label: 'Slow', value: 0.3 },
                    { label: 'Med', value: 0.7 },
                    { label: 'Fast', value: 1.5 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => store.setAutoScrollSpeed(preset.value)}
                      className={`text-[10px] px-2 py-1 rounded font-semibold transition-colors ${
                        Math.abs(store.autoScrollSpeed - preset.value) < 0.03
                          ? 'bg-green-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => store.setAutoScrollSpeed(Math.min(3.0, +(store.autoScrollSpeed + 0.05).toFixed(2)))}
                    className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-xs transition-colors"
                  >+</button>
                  <span className="text-[10px] font-mono text-zinc-500 w-8 text-center">{store.autoScrollSpeed.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Metronome */}
          <Metronome readOnly={live.isFollowing} />

          {/* Edit toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (store.editMode) {
                  setSavedMsg('✓ Saved');
                  setTimeout(() => setSavedMsg(''), 2000);
                }
                store.toggleEditMode();
                closeOverlay();
              }}
              className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
                store.editMode
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {store.editMode ? '✓ Done' : '✎ Edit'}
            </button>
            {savedMsg && (
              <span className="text-xs text-green-400 font-medium">{savedMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Chord buttons bar — hidden in edit mode */}
      {!store.editMode && (
        <div className="border-b border-zinc-800 px-4 py-2 overflow-x-auto">
          <div className="max-w-5xl mx-auto flex gap-1.5 flex-wrap">
            {allChords.map((chord) => {
              const displayed = transposeChord(chord, totalShift, store.useFlats);
              return (
                <button
                  key={chord}
                  onClick={() => store.setActiveChord(displayed)}
                  className={`text-xs px-2 py-1 rounded font-mono font-bold transition-colors ${
                    store.activeChord === displayed
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-violet-400 hover:bg-zinc-700'
                  }`}
                >
                  {displayed}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit mode hint */}
      {store.editMode && (
        <div className="border-b border-violet-900/40 bg-violet-950/20 px-4 py-2">
          <p className="max-w-5xl mx-auto text-xs text-violet-400 text-center">
            Tap a chord chip to select · <span className="font-bold">◀ ▶</span> to move · <span className="font-bold">+</span> to add · tap <span className="font-bold">✓ Done</span> to exit
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 relative min-h-0">
        <ChordSheet
          song={song}
          onChordTap={(chord) => store.setActiveChord(chord)}
          editMode={store.editMode}
          selectedCoord={selectedCoord}
          onChordSelect={handleChordSelect}
          onAddChord={handleAddChord}
          onScrollTopChange={(v) => { scrollTopRef.current = v; }}
          syncCorrection={live.syncCorrection}
        />
        {!store.editMode && (
          <ChordPanel
            chord={store.activeChord}
            onClose={() => store.setActiveChord(null)}
          />
        )}
      </div>

      {/* Edit chord overlay */}
      {store.editMode && (overlaySelected || addTarget) && (
        <EditChordOverlay
          selected={overlaySelected}
          addTarget={addTarget}
          onMove={handleMove}
          onRename={handleRename}
          onDelete={handleDelete}
          onInsert={handleInsert}
          onClose={closeOverlay}
        />
      )}

      {/* Setlist dropdown backdrop */}
      {showSetlistMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSetlistMenu(false)} />
      )}

      {/* Spotify picker backdrop */}
      {showSpotifyPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSpotifyPicker(false)} />
      )}

      {/* Save as Key confirmation */}
      {showTransposeConfirm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowTransposeConfirm(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-zinc-100 mb-1">Save as new key?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              <span className="font-mono text-zinc-300">{song.displayKey}</span>
              {' → '}
              <span className="font-mono text-violet-400">
                {transposeChord(song.displayKey, store.transpose, store.useFlats)}
              </span>
              . This permanently rewrites every chord in the song. The transpose control resets to 0 afterward.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTransposeConfirm(false)}
                className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsKey}
                className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors"
              >
                Save as Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export .cho modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100">ChordPro Source</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { const cho = exportEntry(id); if (cho) navigator.clipboard.writeText(cho); }}
                  className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowExport(false)}
                  className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors"
                >
                  &times;
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap">
              {exportEntry(id)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
