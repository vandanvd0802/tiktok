# Đi Bar Online

Sân khấu 3D tương tác để live TikTok, chạy cùng TikTok LIVE Studio trên Windows. Bối cảnh là một quán bar: sàn nhảy LED, DJ, đèn quét, laser, quả cầu disco. Người xem vào phòng là có nhân vật mang tên họ bước vào sàn nhảy. Ai tặng quà hay gõ từ khóa thì được lên sân khấu nhảy, máy quay áp sát người tặng quà, giọng đọc gọi tên cảm ơn.

## Tính năng

- **Sàn nhảy 3D.** Người mới vào phòng (hoặc vừa comment) có nhân vật đi vào sàn, nhảy theo nhịp nhạc với nhiều kiểu (giơ tay, vỗ tay, lắc, shuffle). Tên hiện trên đầu. Sàn đầy thì người im lặng lâu nhất nhường chỗ.
- **Lên sân khấu.** Gõ `quẩy` (từ khóa đổi được) thì lên sân khấu nhảy 7 giây, tối đa 5 người cùng lúc, mỗi người 1 lần mỗi phút. Tặng quà thì được ưu tiên lên trước, nhảy 9 giây, máy quay áp sát, pháo giấy theo độ lớn của quà.
- **Tim.** Đủ 99 tim: "drop" nhạc, cả sàn nhảy lên, chớp sáng. Đủ 666 tim: **bùng nổ** 60 giây (laser, pháo giấy liên tục, nhạc dồn dập hơn).
- **TOP QUẨY.** 1 comment = 1 điểm, 1 xu quà = 10 điểm. Bật/tắt và đổi tên bảng được.
- **Giọng đọc CapCut** (giọng nam giống giọng "narrator" của dự án short-cartoon-horror), đọc nhanh 1.2x, câu ngắn. Chào người mới (gộp 3 tên một câu), cảm ơn quà (đọc trước mọi câu khác, combo chỉ cảm ơn 1 lần), cảm ơn follow, hô khi drop / bùng nổ, nhắc chia sẻ mỗi 5 phút, tự hô hào khi live im quá 60 giây. Câu sau được tạo sẵn trong lúc câu trước đang đọc nên không bị ngắt quãng. CapCut lỗi thì tự chuyển sang giọng Edge.
- **MC.** Chọn giọng MC trong danh sách (18 giọng CapCut tiếng Việt, nghe thử ở `giong-mau/index.html`). Gõ câu bất kỳ vào ô "MC nói" rồi Enter là MC đọc ngay trên live (chen trước các câu đang chờ); 6 câu gần nhất hiện bên dưới, bấm để nói lại.
- **Nhạc nền.** Chọn trong danh sách: nhạc house tự tạo (124 BPM), một bài trong thư mục `public/audio` (phát lặp), hoặc phát lần lượt tất cả. Chép thêm file .mp3 vào `public/audio` rồi bấm "Tải lại danh sách nhạc". Nhạc tự nhỏ lại khi MC nói.
- **Tùy chỉnh:** tên kênh (tiêu đề + giọng đọc xưng tên này), từ khóa, tên bảng, ảnh nền riêng (thay bức tường sau DJ), tốc độ đọc. Lưu vào `settings.json`.

## Cài và chạy

1. Cài [Node.js](https://nodejs.org) bản LTS.
2. Bấm đúp `BAT-LIVE.bat`. Lần đầu tự cài thư viện (1–2 phút), sau đó mở trang điều khiển `http://localhost:3000`.
3. Trong TikTok LIVE Studio thêm nguồn **Link**: `http://lvh.me:3000/?view=stage`, kích thước 1080 × 1920.
4. Bắt đầu live, nhập username TikTok ở trang điều khiển rồi bấm **Kết nối**.

Các trang:

| Link | Dùng để |
| --- | --- |
| `http://localhost:3000/` | Trang điều khiển (không có tiếng) |
| `http://lvh.me:3000/?view=stage` | Trang live cho LIVE Studio (có tiếng) |
| `http://localhost:3000/?view=preview` | Xem sân khấu toàn màn hình, không tiếng |

Chỉ trang `?view=stage` phát tiếng. Đừng mở thêm trang đó ở trình duyệt khác khi đang live, nếu không sẽ nghe hai giọng.

## Giọng mặc định

Giọng MC chọn ở trang điều khiển. Giọng dùng khi chưa chọn có thể đặt trong file `.env` (xem `.env.example`):

```
CAPCUT_VOICE=BV562_streaming
CAPCUT_RESOURCE_ID=7483736254694035984
```

Danh sách giọng: `D:\code\short-cartoon-horror\config.json` → `tts.capcut.voices`.

## Cho người sửa code

```
npm run dev     # chạy server (Express + Vite)
npm test        # kiểm tra luật chơi, giọng đọc
npm run lint    # kiểm tra kiểu TypeScript
```

Cấu trúc (Clean Architecture, phụ thuộc chỉ hướng vào trong):

```
shared/contracts.ts          kiểu dữ liệu dùng chung server ↔ trình duyệt (sự kiện, cài đặt, lệnh)
server/
  application/               SpeechService, SettingsService, LiveRoomService + ports (interface)
  infrastructure/            CapCut TTS (port từ capcut-tts-api), Edge TTS dự phòng, TikTok, SSE, lưu file
  http/createApiRouter.ts    API /api/*
  index.ts                   ráp mọi thứ lại (composition root)
src/
  domain/                    luật thuần: sàn nhảy, tim, bảng xếp hạng, từ khóa, câu đọc
  application/               ClubSession (trạng thái live), VoiceAnnouncer (đọc gì, khi nào), ports
  infrastructure/            hàng đợi giọng đọc, nhạc + hiệu ứng Web Audio, SSE, API
  three/                     cảnh 3D: ClubWorld (phòng), Dancer (nhân vật nhảy), ClubScene (điều phối)
  ui/                        React: stage/ và dashboard/
```

## Phụ thuộc bên ngoài

- Sự kiện TikTok qua [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) (không chính thức).
- Giọng CapCut qua API không chính thức (cùng cách gọi với gói Python `capcut-tts-api`), có thể đổi hoặc hỏng bất cứ lúc nào; khi đó app tự dùng giọng Edge.
