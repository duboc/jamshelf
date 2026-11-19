// A live session is keyed by setlist id — everyone opening that setlist's
// songs shares one doc. The leader pushes ground-truth state; followers poll
// and extrapolate/ease locally.
export interface LiveSession {
  leaderId: string | null;
  leaderName: string | null;
  currentSongId: string | null;
  isAutoScrolling: boolean;
  autoScrollSpeed: number;
  scrollTop: number;
  scrollRatio: number | null; // normalized 0..1 progress across different screens/font sizes
  metronomeOn: boolean;
  bpm: number;
  updatedAt: number; // leader's own clock only, never compared cross-device
}

export const DEFAULT_LIVE_SESSION: LiveSession = {
  leaderId: null,
  leaderName: null,
  currentSongId: null,
  isAutoScrolling: false,
  autoScrollSpeed: 1,
  scrollTop: 0,
  scrollRatio: null,
  metronomeOn: false,
  bpm: 120,
  updatedAt: 0,
};
