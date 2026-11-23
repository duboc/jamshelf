export interface SpotifyUserProfile {
  displayName: string | null;
  product: string | null;
}

export interface SpotifyWebPlaybackTrack {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string; uri: string }>;
  album: {
    name: string;
    images: Array<{ url: string; width?: number; height?: number }>;
  };
}

export interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  timestamp: number;
  track_window: {
    current_track: SpotifyWebPlaybackTrack;
  };
}

export interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: (arg: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (state: SpotifyPlaybackState | null) => void): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    cb: (arg: { message: string }) => void
  ): boolean;
  removeListener(event: string): boolean;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement?: () => Promise<void>;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
