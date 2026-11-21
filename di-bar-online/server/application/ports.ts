/** Abstractions the application services depend on; infrastructure implements them. */
import type { ChatMessage, GiftMessage, LikeMessage, MusicOption, ServerEventName, ServerEvents, StageSettings, Viewer, VoiceOption } from '../../shared/contracts';

export interface SpeechSynthesizer {
  readonly name: string;
  synthesize(text: string, voiceId: string): Promise<Buffer>; // MP3 bytes; a provider without that voice uses its own
}

export interface VoiceCatalog {
  list(): VoiceOption[];
  has(id: string): boolean;
}

export interface MusicLibrary {
  list(): MusicOption[];
  has(file: string): boolean;
}

export interface EventPublisher {
  publish<K extends ServerEventName>(event: K, data: ServerEvents[K]): void;
}

export interface SettingsRepository {
  load(): Partial<StageSettings>;
  save(settings: StageSettings): void;
}

export type LiveRoomHandlers = {
  onConnected(): void;
  onDisconnected(reason?: string): void;
  onError(message: string): void;
  onChat(msg: ChatMessage): void;
  onGift(msg: GiftMessage): void;
  onJoin(viewer: Viewer): void;
  onFollow(viewer: Viewer): void;
  onLike(msg: LikeMessage): void;
  onViewerCount(count: number): void;
};

export interface LiveRoomGateway {
  connect(username: string, handlers: LiveRoomHandlers): Promise<void>;
  disconnect(): void;
}

export interface BackgroundImageStore {
  save(bytes: Buffer, contentType: string): string; // returns the public URL
  remove(url: string): void;
  accepts(contentType: string): boolean;
}
