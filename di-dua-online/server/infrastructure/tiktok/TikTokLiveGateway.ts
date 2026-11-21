/**
 * TikTok LIVE through `tiktok-live-connector` 2.5 (unofficial; proto v3: chat text is `content`, gifts carry
 * gift.name / diamondCount / type, avatar is user.avatarThumb.urlList[0]).
 */
import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { Viewer } from '../../../shared/contracts';
import type { LiveRoomGateway, LiveRoomHandlers } from '../../application/ports';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const viewerOf = (data: Raw): Viewer => ({
  id: data?.user?.uniqueId || data?.user?.displayId || data?.uniqueId || '',
  name: data?.user?.nickname || data?.nickname || data?.user?.uniqueId || data?.uniqueId || 'bạn',
  avatar: data?.user?.avatarThumb?.urlList?.[0] || '',
});

export class TikTokLiveGateway implements LiveRoomGateway {
  private connection: InstanceType<typeof TikTokLiveConnection> | null = null;

  async connect(username: string, on: LiveRoomHandlers): Promise<void> {
    const conn = new TikTokLiveConnection(username, {
      processInitialData: true,
      // The gift-list fetch behind this option needs a paid Euler Stream plan; gift events carry name and coins already
      enableExtendedGiftInfo: false,
    });
    this.connection = conn;

    conn.on(ControlEvent.CONNECTED, () => {
      console.log(`[TikTok] connected to @${username}`);
      on.onConnected();
    });
    conn.on(ControlEvent.DISCONNECTED, () => on.onDisconnected());
    conn.on(WebcastEvent.STREAM_END, () => on.onDisconnected('Phiên LIVE đã kết thúc'));
    conn.on(ControlEvent.ERROR, (err: unknown) => on.onError(err instanceof Error ? err.message : String(err)));

    conn.on(WebcastEvent.CHAT, (data: Raw) => on.onChat({ ...viewerOf(data), text: data?.content || data?.comment || '' }));
    conn.on(WebcastEvent.MEMBER, (data: Raw) => on.onJoin(viewerOf(data)));
    conn.on(WebcastEvent.FOLLOW, (data: Raw) => on.onFollow(viewerOf(data)));
    conn.on(WebcastEvent.ROOM_USER, (data: Raw) => {
      if (typeof data?.viewerCount === 'number') on.onViewerCount(data.viewerCount);
    });
    conn.on(WebcastEvent.LIKE, (data: Raw) =>
      on.onLike({
        name: viewerOf(data).name,
        count: Number(data?.likeCount) || 1,
        totalLikes: Number(data?.totalLikeCount) || 0,
      })
    );

    // Streak gifts are resent with a growing repeatCount: only forward the new units
    const streaks = new Map<string, number>();
    conn.on(WebcastEvent.GIFT, (data: Raw) => {
      const viewer = viewerOf(data);
      const giftId = data?.giftId || 0;
      const key = `${viewer.id}_${giftId}`;
      const total = data?.repeatCount || 1;
      const count = total - (streaks.get(key) || 0);
      const streakable = (data?.gift?.type ?? data?.giftDetails?.giftType ?? data?.giftType) === 1;
      if (streakable && !data?.repeatEnd) streaks.set(key, total);
      else streaks.delete(key);
      if (count <= 0) return;
      on.onGift({
        ...viewer,
        giftName: data?.gift?.name || data?.giftDetails?.giftName || data?.giftName || 'quà',
        coinsEach: data?.gift?.diamondCount || data?.diamondCount || data?.giftDetails?.diamondCount || 1,
        count,
      });
    });

    await conn.connect();
  }

  disconnect(): void {
    if (!this.connection) return;
    try {
      this.connection.disconnect();
    } catch (err) {
      console.warn('[TikTok] disconnect failed:', err instanceof Error ? err.message : err);
    }
    this.connection = null;
  }
}
