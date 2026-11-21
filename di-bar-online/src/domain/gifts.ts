/** Gift size tiers (drive the size of the effects) and Vietnamese names for common TikTok gifts. */

export type GiftTier = 'small' | 'medium' | 'big' | 'huge';

export function giftTier(coins: number): GiftTier {
  if (coins >= 1000) return 'huge';
  if (coins >= 100) return 'big';
  if (coins >= 10) return 'medium';
  return 'small';
}

const VIETNAMESE: Record<string, string> = {
  rose: 'hoa hồng',
  'finger heart': 'bắn tim',
  'heart me': 'trái tim',
  'ice cream cone': 'cây kem',
  doughnut: 'bánh donut',
  perfume: 'nước hoa',
  'hand hearts': 'tim tay',
  'love bang': 'bùm tình yêu',
  'confetti': 'pháo giấy',
  'sunglasses': 'kính râm',
  'disco ball': 'quả cầu disco',
  'microphone': 'micro',
  'galaxy': 'thiên hà',
  'lion': 'sư tử',
  'universe': 'vũ trụ',
};

export function giftNameVi(name: string): string {
  return VIETNAMESE[name.trim().toLowerCase()] ?? name;
}
