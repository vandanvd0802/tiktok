/**
 * Messages shared by the server and the browser pages (SSE events, settings, dashboard commands).
 * No runtime dependencies: both sides import this file.
 */

export type Viewer = { id: string; name: string; avatar: string };
export type ChatMessage = Viewer & { text: string };
export type GiftMessage = Viewer & { giftName: string; coinsEach: number; count: number };
export type LikeMessage = { name: string; count: number; totalLikes: number };

export type LiveStatus = {
  isConnected: boolean;
  isConnecting: boolean;
  username: string;
  viewerCount: number;
  totalLikes: number;
  error: string;
};

export const EMPTY_STATUS: LiveStatus = {
  isConnected: false,
  isConnecting: false,
  username: '',
  viewerCount: 0,
  totalLikes: 0,
  error: '',
};

/** Owner settings: saved by the server in settings.json and replayed to every page. */
export type StageSettings = {
  channelName: string;
  keyword: string; // a comment containing it puts the viewer in the queue for the next race
  boardTitle: string;
  showTopBoard: boolean;
  musicOn: boolean;
  musicVolume: number; // 0..1
  voiceRate: number; // playback speed of the voice, 1 = as synthesised
  background: string; // custom backdrop image URL (the stands), '' = the built-in stadium
  voiceId: string; // MC voice, an id from GET /api/voices
  musicTrack: string; // '' = built-in house beat, '*' = every file in public/audio in turn, else one file name
};

export const BUILT_IN_BEAT = '';
export const ALL_TRACKS = '*';

export type VoiceOption = { id: string; name: string };
export type MusicOption = { file: string; name: string };

export const DEFAULT_SETTINGS: StageSettings = {
  channelName: 'Đua Online',
  keyword: 'vào đua',
  boardTitle: 'TOP DONATE',
  showTopBoard: true,
  musicOn: true,
  musicVolume: 0.35,
  voiceRate: 1.2,
  background: '',
  voiceId: 'BV075_streaming',
  musicTrack: BUILT_IN_BEAT,
};

/** One-off commands from the dashboard; only the stage page acts on them. */
export type StageCommand =
  | { action: 'speak'; text: string }
  | { action: 'shareReminder' }
  | { action: 'startRace' }
  | { action: 'testGift'; name: string; coins: number }
  | { action: 'testComment'; name: string; text: string }
  | { action: 'testLike'; name: string; count: number };

/** Server-sent event names and their payloads. */
export type ServerEvents = {
  status: LiveStatus;
  settings: StageSettings;
  command: StageCommand;
  chat: ChatMessage;
  gift: GiftMessage;
  join: Viewer;
  follow: Viewer;
  like: LikeMessage;
  viewers: { viewerCount: number };
};
export type ServerEventName = keyof ServerEvents;
