# Đua Online: notes for Claude

Foot-race game for TikTok LIVE (was the bar game "Đi Bar Online"; that version is backed up in D:\code\tiktok\di-dua-online-bar-backup). Viewers type the keyword (default "vào đua") to join the queue; 8 runners per race, bots fill empty lanes; a gift while running = fly over the hurdles for a few seconds (`FLY_SECONDS`), a gift while waiting = front of the queue. Rules in `src/domain/race.ts` + `raceQueue.ts`, flow in `src/application/RaceSession.ts` (ticked every frame by `RaceScene`). Runners are the human `character-*.glb` only. TikTok LIVE Studio Link source: `http://lvh.me:3000/?view=stage` (1080×1920).

## Never break the live

- Only `?view=stage` makes sound. To look at the stage use `?view=preview` (silent) or the dashboard. Test servers go on another port (e.g. `PORT=3010`).
- The owner's live server is `BAT-LIVE.bat` (`LIVE_MODE=1`, no HMR). Ask before editing or restarting while they may be live.
- The browser pane pauses requestAnimationFrame when hidden; to test motion there, drive `window.__scene.loop()` from a setInterval (`?demo=1` exposes `__scene` and `__dbo` = the RaceSession; `?fill=1` queues 28 sample viewers).

## How it works

- Voice: CapCut TTS ported to TS (`server/infrastructure/capcut/`). The MC voice is the `voiceId` setting (dashboard dropdown, list in `capcutVoices.ts`, samples in `giong-mau/`); default `BV075_streaming` (= "narrator" in short-cartoon-horror). `/api/tts` reads the voice from settings server-side. Edge fallback. CapCut rate-limits bursts (`ExceededQPSQuota`): the synthesizer retries.
- Music: `musicTrack` setting: '' = built-in Web Audio beat, '*' = all of `public/audio` in turn, else one file (validated against the folder). `BackgroundMusic` plays it on the stage page and ducks under the MC. Speed is applied in the browser (`playbackRate`, pitch kept), default 1.2x like that project. `TtsSpeechQueue` prefetches the next 3 lines.
- TTS cache: every synthesised line is kept on disk in `tts-cache/` (sha1 of voice|NFC text, LRU, `TTS_DISK_CACHE_FILES`), Edge fallback audio is not kept. The stage page posts `fixedVoiceLines()` (lines with no viewer name) to `POST /api/tts/warm` 3 s after settings settle; the server synthesises the missing ones one at a time (`TTS_WARM_GAP_MS`).
- Lines live in `src/domain/voiceLines.ts`: keep them short. Every self-reference uses the saved channel name.
- No alcohol words in UI or voice lines (TikTok rules).
- Stand backdrop `public/assets/race/stadium-backdrop.jpg` was generated with Codex (`codex.exe exec -s workspace-write "use your image generation tool ..."`).
