# Đi Bar Online: notes for Claude

Bar-themed fork of di-chua-online (D:\code\tiktok\di-chua-online), rewritten with Clean Architecture. TikTok LIVE Studio Link source: `http://lvh.me:3000/?view=stage` (1080×1920).

## Never break the live

- Only `?view=stage` makes sound. To look at the stage use `?view=preview` (silent) or the dashboard. Test servers go on another port (e.g. `PORT=3010`).
- The owner's live server is `BAT-LIVE.bat` (`LIVE_MODE=1`, no HMR). Ask before editing or restarting while they may be live.
- The browser pane pauses requestAnimationFrame when hidden; to test motion there, drive `window.__scene.loop()` from a setInterval (`?demo=1` exposes `__scene` and `__dbo` = the ClubSession).

## How it works

- Voice: CapCut TTS ported to TS (`server/infrastructure/capcut/`). The MC voice is the `voiceId` setting (dashboard dropdown, list in `capcutVoices.ts`, samples in `giong-mau/`); default `BV075_streaming` (= "narrator" in short-cartoon-horror). `/api/tts` reads the voice from settings server-side. Edge fallback. CapCut rate-limits bursts (`ExceededQPSQuota`): the synthesizer retries.
- Music: `musicTrack` setting: '' = built-in Web Audio beat, '*' = all of `public/audio` in turn, else one file (validated against the folder). `BackgroundMusic` plays it on the stage page and ducks under the MC. Speed is applied in the browser (`playbackRate`, pitch kept), default 1.2x like that project. `TtsSpeechQueue` prefetches the next 3 lines.
- Lines live in `src/domain/voiceLines.ts`: keep them short. Every self-reference uses the saved channel name.
- No alcohol words in UI or voice lines (TikTok rules); it is a dance/music party.
- Rig `nguoi.fbx` rests in a T-pose after retargeting; `Dancer.arm()` measures from arms hanging down.
