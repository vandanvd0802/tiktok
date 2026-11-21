/**
 * What the voice says. Short on purpose: one breath per line keeps the queue moving on a busy live.
 * Names arrive already cleaned by nameForSpeech; `channel` is the owner's saved channel name.
 */
import type { GiftTier } from './gifts';
import { joinNames } from './speechName';

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export const voiceLines = {
  welcome(names: string[], channel: string): string {
    const who = joinNames(names);
    return pick([
      `Chào ${who} vừa vào ${channel}, quẩy chung nha!`,
      `${who} tới rồi! Vào sàn luôn nào!`,
      `Hello ${who}, nhạc đang lên, nhảy liền nha!`,
      `Chào mừng ${who} tới ${channel}!`,
    ]);
  },

  giftThanks(name: string, giftName: string, tier: GiftTier): string {
    if (tier === 'huge' || tier === 'big') {
      return pick([
        `Ôi ${name} chơi lớn quá! Cảm ơn ${giftName} nha, cả sàn hú lên nào!`,
        `Đỉnh quá ${name} ơi! Cảm ơn ${giftName}, DJ lên nhạc!`,
      ]);
    }
    return pick([
      `Cảm ơn ${name} tặng ${giftName} nha!`,
      `${name} gửi ${giftName}, cảm ơn nha, quẩy lên!`,
      `Cảm ơn ${name} nhiều nha!`,
    ]);
  },

  follow(name: string, channel: string): string {
    return pick([`Cảm ơn ${name} đã follow ${channel} nha!`, `${name} vừa follow, cảm ơn nha!`]);
  },

  likeThanks(name: string): string {
    return pick([`Cảm ơn ${name} đã thả tim nha!`, `${name} thả tim kìa, cảm ơn nha!`]);
  },

  drop(): string {
    return pick(['Đủ chín mươi chín tim rồi! Cả sàn nhảy lên nào!', 'Drop nè! Giơ tay lên!', 'Tim đầy rồi, cả bar nhảy lên!']);
  },

  partyStart(): string {
    return 'Sáu trăm sáu mươi sáu tim! Bùng nổ một phút, quẩy hết mình nào!';
  },

  idleHype(channel: string, keyword: string): string {
    const line = pick(
      [
        `Thả tim cho ${channel} nóng lên nào, đủ sáu trăm sáu mươi sáu tim là bùng nổ!`,
        `Ai muốn lên sân khấu thì gõ ${keyword} nha!`,
        `Chia sẻ live cho bạn bè vào quẩy chung nha!`,
        `Nhạc đang hay, thả tim cho DJ nào!`,
        `Cả sàn ơi, nhún nhảy lên nào!`,
        `Giơ tay lên nào các bạn ơi!`,
        `Ai thả tim là được lên sân khấu liền đó nha!`,
        `Bass đang đập, lắc người theo luôn nào!`,
        `Gõ ${keyword} để lên sân khấu tỏa sáng nè!`,
        `${channel} hôm nay nóng lắm, quẩy hết mình nha!`,
        `Bấm tim liên tục cho DJ thêm hứng nào!`,
        `Vỗ tay cho DJ một cái nào!`,
        `Đừng đứng yên nữa, nhảy lên nào cả nhà!`,
        `Gõ người hoặc thú vật để đổi hình đại diện nha!`,
        `Mời bạn bè vào quẩy chung cho đông vui nha!`,
        `Tim bay lên nào, sàn nhảy bùng cháy thôi!`,
        `Nhạc hay thế này sao ngồi yên được, lắc lên nào!`,
      ],
    );
    return line;
  },

  shareReminder(names: string[], channel: string): string {
    if (!names.length) return `Cả nhà chia sẻ live cho bạn bè vào ${channel} quẩy chung nha!`;
    return `Cảm ơn ${joinNames(names)} đang quẩy cùng ${channel}. Chia sẻ live cho bạn bè vào chung vui nha!`;
  },
};
