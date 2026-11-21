/** Keeps the TikTok LIVE connection state and forwards room events to the pages. */
import { EMPTY_STATUS, type LiveStatus } from '../../shared/contracts';
import type { EventPublisher, LiveRoomGateway } from './ports';

export class LiveRoomService {
  private status: LiveStatus = { ...EMPTY_STATUS };

  constructor(
    private readonly gateway: LiveRoomGateway,
    private readonly publisher: EventPublisher
  ) {}

  current(): LiveStatus {
    return { ...this.status };
  }

  async connect(rawUsername: string): Promise<void> {
    const username = rawUsername.replace(/^@/, '').trim();
    if (!username) throw new Error('Tên tài khoản không hợp lệ');
    this.gateway.disconnect();
    this.setStatus({ ...EMPTY_STATUS, isConnecting: true, username });
    try {
      await this.gateway.connect(username, {
        onConnected: () => this.setStatus({ isConnected: true, isConnecting: false, error: '' }),
        onDisconnected: (reason) => this.setStatus({ isConnected: false, isConnecting: false, error: reason ?? this.status.error }),
        onError: (message) => this.setStatus({ error: message }),
        onChat: (msg) => this.publisher.publish('chat', msg),
        onGift: (msg) => this.publisher.publish('gift', msg),
        onJoin: (viewer) => this.publisher.publish('join', viewer),
        onFollow: (viewer) => this.publisher.publish('follow', viewer),
        onLike: (msg) => {
          if (msg.totalLikes > 0) this.status.totalLikes = msg.totalLikes;
          this.publisher.publish('like', msg);
        },
        onViewerCount: (viewerCount) => {
          this.status.viewerCount = viewerCount;
          this.publisher.publish('viewers', { viewerCount });
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ isConnected: false, isConnecting: false, error: message });
      throw new Error(`Không kết nối được @${username}: ${message}. Tài khoản phải đang LIVE trên TikTok.`);
    }
  }

  disconnect(): void {
    this.gateway.disconnect();
    this.setStatus({ ...EMPTY_STATUS });
  }

  private setStatus(patch: Partial<LiveStatus>) {
    this.status = { ...this.status, ...patch };
    this.publisher.publish('status', this.current());
  }
}
