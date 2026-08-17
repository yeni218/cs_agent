# E2E-SIS Mobile Dashboard (React Native / Expo)

A voice-agent operations dashboard: **assistants**, **calls**, and **cost /
analytics visualization** — talking to **Vapi** now, and to **our own sovereign
backend** later, via one swappable client.

## Run

```bash
npm install
npx expo start        # press w = web, i = iOS sim, a = Android; or scan QR in Expo Go
```

It launches in **Demo mode** (bundled sample data — no API key needed), so you
can explore the whole UI immediately.

## Point it at real data

Open the **Ayarlar (Settings)** tab and pick a source:

| Preset | Base URL | Needs |
|---|---|---|
| Demo | — | nothing |
| Vapi Cloud | `https://api.vapi.ai` | your Vapi **private** API key |
| Afiyet Backend | `http://localhost:8787` | the `../backend` stub running |

> On a physical phone, `localhost` won't reach your computer — use your machine's
> LAN IP (e.g. `http://192.168.1.67:8787`) in the Base URL field.

## Why it's built this way

- `src/api/client.js` — the **only** place that knows about HTTP/auth. Swapping
  Vapi ↔ our backend = changing `baseUrl`.
- `src/api/vapi.js` — Vapi-shaped resource calls (`/assistant`, `/call`) +
  on-device analytics. Our backend returns the same shapes, so screens never
  change.
- `src/screens/*` — pure UI over normalized data.

When we finish the sovereign backend (`../backend`), we flip the base URL and the
app keeps working — no rewrite. That's the migration strategy.

## Notes
- Charts are dependency-free (`src/components/ui.js`) so it runs in Expo Go with
  no native chart modules.
- Versions in `package.json` target Expo SDK 52; if `expo start` complains, run
  `npx expo install` to align native module versions.
