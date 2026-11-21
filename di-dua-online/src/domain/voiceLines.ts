/**
 * What the voice says. Short on purpose: one breath per line keeps the queue moving on a busy live.
 * Names arrive already cleaned by nameForSpeech; `channel` is the owner's saved channel name.
 */
import type { GiftTier } from './gifts';
import { joinNames } from './speechName';

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// Lines that name no viewer: the same every time, so they are synthesised once and kept on disk
const START_LINES = ['Ba, hai, một, chạy!', 'Vào vị trí! Chạy!'];
const PHOTO_FINISH_LINES = ['Sát nút! Ai sẽ về nhất đây?', 'Căng quá, ngang nhau luôn!'];
const hypeLines = (channel: string, keyword: string) => [
  `Gõ ${keyword} để xếp hàng chạy đua nha!`,
  `Tặng hoa hồng là được bay qua rào luôn đó!`,
  `Đang chạy mà được tặng quà là bay lên liền!`,
  `Thả tim cho người chạy tăng tốc nào!`,
  `Muốn chạy thì gõ ${keyword} nha!`,
  `Tặng quà là được lên đầu hàng chờ đó nha!`,
  `Chia sẻ live cho bạn bè vào đua chung nha!`,
  `${channel} hôm nay đua căng lắm, vào chơi nào!`,
  `Mỗi lượt tám người, nhanh tay gõ ${keyword} nha!`,
  `Cổ vũ cho người chạy nào, thả tim lên!`,
  `Gõ số làn từ một đến tám để cổ vũ người chạy nha!`,
  `Làn nào được cổ vũ nhiều là chạy nhanh hơn đó!`,
  `Đang chạy mà gõ người là đổi nhân vật liền nha!`,
];
const plainShareLine = (channel: string) => `Cả nhà chia sẻ live cho bạn bè vào ${channel} đua chung nha!`;

/** Every line the MC can say that holds no viewer name, for synthesising ahead of time. */
export function fixedVoiceLines(channel: string, keyword: string): string[] {
  return [...START_LINES, ...PHOTO_FINISH_LINES, ...hypeLines(channel, keyword), plainShareLine(channel)];
}

export const voiceLines = {
  welcome(names: string[], channel: string): string {
    const who = joinNames(names);
    return pick([
      `Chào ${who} vừa vào ${channel}, vào đua chung nha!`,
      `${who} tới rồi! Xếp hàng chạy đua luôn nào!`,
      `Hello ${who}, đường đua đang nóng lắm!`,
      `Chào mừng ${who} tới ${channel}!`,
    ]);
  },

  giftThanks(name: string, giftName: string, tier: GiftTier, flying: boolean): string {
    if (flying) {
      return pick([
        `Cảm ơn ${name} tặng ${giftName}! Bay lên, vượt rào luôn!`,
        `${name} cất cánh rồi! Cảm ơn ${giftName} nha!`,
        `Ôi ${name} bay qua rào kìa! Cảm ơn nha!`,
      ]);
    }
    if (tier === 'huge' || tier === 'big') {
      return pick([`Ôi ${name} chơi lớn quá! Cảm ơn ${giftName}, được chạy trước luôn!`, `Đỉnh quá ${name} ơi! Cảm ơn ${giftName} nha!`]);
    }
    return pick([`Cảm ơn ${name} tặng ${giftName}, được ưu tiên vào đua nha!`, `Cảm ơn ${name} nhiều nha, lên đầu hàng chờ luôn!`]);
  },

  follow(name: string, channel: string): string {
    return pick([`Cảm ơn ${name} đã follow ${channel} nha!`, `${name} vừa follow, cảm ơn nha!`]);
  },

  likeThanks(name: string): string {
    return pick([`Cảm ơn ${name} đã thả tim nha!`, `${name} thả tim kìa, cảm ơn nha!`]);
  },

  queued(name: string, position: number): string {
    if (position <= 1) return pick([`${name} vào hàng chờ, chạy lượt sau nha!`, `${name} xếp hàng số một rồi!`]);
    return pick([`${name} vào hàng chờ, số ${position} nha!`, `${name} đã xếp hàng, đứng thứ ${position}!`]);
  },

  raceIntro(names: string[]): string {
    if (!names.length) return pick(START_LINES);
    return pick([`${joinNames(names)} vào vạch xuất phát! Ba, hai, một, chạy!`, `Cố lên ${joinNames(names)}! Chạy nào!`]);
  },

  results(podium: string[], streak: number): string {
    const [first, second] = podium;
    if (streak >= 2) return pick([`${first} thắng ${streak} trận liên tiếp! Ai cản nổi đây?`, `Chuỗi ${streak} trận thắng cho ${first}! Vua đường đua!`]);
    if (!second) return `${first} về nhất!`;
    return pick([`${first} về nhất! ${second} về nhì!`, `Chúc mừng ${first} vô địch!`, `${first} thắng rồi! Hoan hô!`]);
  },

  newLeader(name: string): string {
    return pick([`${name} vượt lên dẫn đầu!`, `${name} lên số một rồi!`, `Ôi ${name} vượt lên kìa!`]);
  },

  tripped(name: string): string {
    return pick([`Ôi ${name} vấp rào rồi!`, `${name} ngã kìa, đứng dậy nhanh!`, `Á, ${name} vướng rào!`]);
  },

  photoFinish(): string {
    return pick(PHOTO_FINISH_LINES);
  },

  cheerBoost(name: string): string {
    return pick([`Cả phòng cổ vũ ${name}, tăng tốc!`, `${name} được tiếp sức, chạy nhanh lên!`]);
  },

  idleHype(channel: string, keyword: string): string {
    return pick(hypeLines(channel, keyword));
  },

  shareReminder(names: string[], channel: string): string {
    if (!names.length) return plainShareLine(channel);
    return `Cảm ơn ${joinNames(names)} đang chơi cùng ${channel}. Chia sẻ live cho bạn bè vào đua chung nha!`;
  },
};
