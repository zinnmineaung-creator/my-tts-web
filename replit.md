# Myanmar TTS & SRT Studio

A Myanmar (Burmese) text-to-speech platform with two front doors: a Telegram bot (@zinn_tts_srt_bot) that mints VIP access passwords, and a web app where users generate narrated MP3 audio with matching timestamped SRT subtitles for storytelling/movie-recap content.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/tts-web run dev` — run the web app
- `python3 telegram-bot/bot.py` — run the Telegram bot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (only covers `/auth/*` and `/tts/voices`; `/tts/generate` is called via raw `fetch`, not generated)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, speech synthesis via the `edge-tts` CLI (Microsoft Edge neural voices), audio duration probing via `ffprobe`
- Web: React + Vite
- Telegram bot: Python + aiogram
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/api-server/src/routes/tts.ts` — voice catalog, style presets, `/tts/generate` (MP3 + SRT), `/tts/voices`
- `artifacts/api-server/src/routes/auth.ts` — VIP password login, free-trial entry, JWT session issuance
- `artifacts/tts-web/src/components/Studio.tsx` — main generation UI (voice/style pickers, fine-tuning sliders, download buttons)
- `artifacts/tts-web/src/hooks/use-tts.ts` — calls `/tts/generate`, decodes base64 audio + SRT text into downloadable blobs
- `telegram-bot/bot.py` — gateway bot: 3 buttons + `/generatepass` (mints VIP codes via an internal JWT-authenticated endpoint)
- `web_users.json`, `vip_codes.json` (workspace root) — flat-file user/session and VIP code persistence

## Architecture decisions

- **Only 2 real Myanmar voices exist** (`my-MM-NilarNeural` female, `my-MM-ThihaNeural` male) in edge-tts's catalog — there is no native 6-voice set. The "6 voices" offered in the UI are personas built by pairing these 2 base voices with tuned rate/pitch/volume offsets (adult/youth/elder tones), combined numerically with per-request style/custom offsets at generation time.
- **SRT timestamps are estimated, not measured from real speech alignment**: text is split into sentence-sized cues, then cue durations are allocated proportionally to each cue's character length against the actual measured audio duration (via `ffprobe`), so the total always matches the real MP3 length even though per-cue timing is approximate.
- **No character limit is enforced for either free or VIP tiers** — access is gated purely by account status (14-day free trial expiry vs. 90-day VIP expiry via `requireAuth`), not by text length. A generous technical safety cap exists in `tts.ts` purely to prevent pathological input from hanging the process.
- **`/tts/generate` bypasses OpenAPI codegen** — it returns JSON with base64-encoded audio + SRT text via a plain `fetch` call, not a generated hook, since the response shape (dual binary+text payload) doesn't fit the codegen'd client cleanly.
- **VIP codes are the credential itself** (no separate password) — a 6-digit code from the Telegram bot logs a user in directly and can be reused until it expires (90 days from first use). Free entry uses a browser fingerprint + IP combo instead of a password to track the 14-day trial.

## Product

- Users get Myanmar text turned into narrated speech (6 voice personas mixing male/female, adult/youth/elder tones) plus a synced `.srt` subtitle file, both downloadable — aimed at storytelling and movie-recap video creators.
- Access is either via a VIP password (minted through the Telegram bot) or a free 14-day trial with no signup form, unlimited text length in both cases.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `WORKSPACE_ROOT` in `auth.ts` must resolve 3 levels up from the bundled `dist/index.mjs` (dist → api-server → artifacts → root), not 4 — an off-by-one here previously caused persisted user/VIP data to silently write to the wrong location.
- edge-tts CLI voice names are case-sensitive and locale-specific (`my-MM-*`, not `mm-MM-*`); unrecognized voice names fail silently or error out — always verify against `edge-tts --list-voices` before adding a new voice entry.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
