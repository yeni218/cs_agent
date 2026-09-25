# CONTINUE — AfiyetSesli handoff

**Last updated:** 2026-09-25
**Branch:** `feat/insurance-agent-compliance-store`
**Repo:** https://github.com/yeni218/cs_agent

Read top-to-bottom before doing anything. The user is a **non-technical solo founder in
Turkey**, **no budget, no working credit card**, and **nothing runs on their PC** — respect
these in every suggestion.

---

## What this project is
AfiyetSesli: a Turkish AI **phone-ordering agent for restaurants** (like VoiceBit).
A customer calls the restaurant's number → AI answers in Turkish → takes the order →
it lands in a Supabase-backed dashboard. Two-sided app: restaurants (cost hidden) +
admin (MRR/COGS). Runs on **our own engine (Groq + Inworld)** → ~$0.028/min vs Vapi's ~$0.078.

---

## 🎉 STATUS: THE PHONE CALL WORKS END-TO-END (2026-09-25)
Calling **+90 212 706 15 40** → Verimor → LiveKit → our agent → **answers in Turkish.**
Full pipeline confirmed live (agent status went `Running`, took the call).

| Piece | Status |
|---|---|
| Customer app — **bare React Native** (`mobile/`) | ✅ Migrated off Expo (RN CLI 0.81.4); bundles clean |
| Customer app — old Expo (`customer/`) | ✅ still there; `mobile/` is the RN successor |
| Supabase backend (auth, RLS, cost redaction) | ✅ Live |
| Edge Functions: `call`, `ingest-call`, `vapi`, `voice`, **`agent-config`** | ✅ Deployed |
| Own engine (Groq + Inworld) COGS | ✅ measured ~$0.018–0.032/min (COST-MODEL.md §0) |
| **Real phone call via OUR engine (LiveKit)** | ✅ **WORKS** |
| **Turkish voice quality** | 🔴 **OPEN** — English accent, see "CURRENT TASK" |

---

## 🔴 CURRENT TASK: fix the Turkish accent (switch TTS to Azure)
The agent works but **speaks Turkish with an English accent.** Root cause: **Inworld has
ZERO Turkish voices** (checked live: 0 of 282 voices are `tr`; langs are en/es/ru/de/pt/…).
`language: tr-TR` only makes an English voice *pronounce* Turkish → accent is unfixable in Inworld.

**Fix = switch the TTS to Azure** (native Turkish neural voices `tr-TR-EmelNeural` /
`tr-TR-AhmetNeural`). The user has **Azure for Students** ($100, **no card**), and
`@livekit/agents-plugin-azure@1.9.0` exists.

**Waiting on the user to:** create an **Azure Speech** resource (portal.azure.com → Create
resource → "Speech" → region e.g. West Europe, tier F0/S0) → send **KEY + REGION**.

**Then do:**
1. `cd END-TO-END-SIS/agent && npm i @livekit/agents-plugin-azure@1.x`
2. In `src/agent.ts`, replace the `inworld.TTS({…})` with
   `new azure.TTS({ speechKey: …, speechRegion: …, voice: 'tr-TR-EmelNeural' })`
   (import `* as azure from '@livekit/agents-plugin-azure'`). Keep Groq STT + LLM as-is.
3. Add LiveKit secrets: `lk agent update --secrets AZURE_SPEECH_KEY=… --secrets AZURE_SPEECH_REGION=… -y`
   (needs `livekit.toml` in cwd — already in `agent/`).
4. Redeploy: `lk agent deploy` (from `agent/`).
5. Call +90 212 706 15 40 to verify native Turkish.
**Verimor settings do NOT change** — the voice is 100% agent-side.

---

## How the telephony saga was solved (do NOT re-debug these)
The `404 No trunk found` that blocked us for many rounds had **TWO** root causes, both fixed:

1. **WRONG SIP URI (the big one).** LiveKit gives two different URLs:
   - **Project URL** (app/wss/dashboard): `afiyet-tj1bqfhh.livekit.cloud`
   - **SIP URI** (telephony — built from the *Project ID*): **`5nss36rwwaz.sip.livekit.cloud`**
   Verimor had been given `afiyet-tj1bqfhh.eu.sip.livekit.cloud` — a **guess** off the Project URL.
   Every call hit the wrong hostname → LiveKit couldn't find the project's trunk → 404.
   **Fixed** by telling Verimor (Fatih KAFADAR) the correct SIP URI `5nss36rwwaz.sip.livekit.cloud`.
   → Verimor's self-service "Gelen Çağrı Yönetimi" only accepts an **IP**, not a hostname, so
   this change **must be done by Verimor support**, not the panel.

2. **Missing CA certs in the agent image.** The merged Dockerfile used `node:24-slim` (ships
   without root certificates). The agent connected to the job but failed:
   `engine: signal failure: … no native root CA certificates found` → couldn't join the room →
   caller heard silence. **Fixed** by adding `RUN apt-get install -y ca-certificates` to the
   runtime stage of `agent/Dockerfile` + redeploy.

Also learned: LiveKit's inbound-trunk matching needs **one of** `Numbers`, `AllowedAddresses`,
or `AuthUsername+Password` set (can't be fully empty). Current trunk matches by `Numbers`.

---

## KEY FACTS / IDs / credentials
**LiveKit Cloud** (project name "Afiyet"):
- Project URL / subdomain: `afiyet-tj1bqfhh.livekit.cloud` ; Project ID: `p_5nss36rwwaz`
- **SIP URI (telephony): `5nss36rwwaz.sip.livekit.cloud`** ← the one Verimor must use
- API key: `APICfDEWy7jVhqu` (⚠️ secret was pasted in chat — **ROTATE IT**, Settings→Keys)
- Deployed agent: `CA_UFfPHJ2MJUhR`, dispatch name **`afiyetsesli`**, region eu-central
- Inbound SIP trunk: `ST_6NPBKdjTa4D7` (numbers `["902127061540"]`, no IP restriction)
- Dispatch rule: `SDR_rgxgfK9A5Hiy` → agent `afiyetsesli`
- **Plan: Build (free, no card).** Agent sleeps when idle → first call has ~10–20 s cold start.
- Agent secrets on LiveKit: `GROQ_API_KEY`, `INWORLD_API_KEY` (added 09-24), plus friend's
  config: `GROQ_LLM_MODEL`, `GROQ_STT_MODEL`, `INWORLD_TTS_MODEL`, `INWORLD_VOICE`,
  `STT_PROVIDER`, `AFIYET_NUMBER_MAP`, `AFIYET_ASSISTANT_ID`, `AFIYET_INGEST_SECRET`, `SUPABASE_URL`.

**Verimor:** number **+90 212 706 1540**; SIP source IP `194.49.126.26`; server `sip.verimor.com.tr`;
contact **Fatih KAFADAR**. Self-service routing page = *Ses Hizmeti → Gelen Çağrı Yönetimi*
(IP-only, so LiveKit hostname routing needs Fatih). It can also be reverted to the old **Vapi**
trunk (`44.229.228.186`) — that's the fallback.

**Supabase:** project `tdmfpiynrybrnehnoaot` (eu-central-1). Management token `sbp_808929…`
(⚠️ **user meant to revoke** — confirm). Login users: `admin@afiyet.com` / `Afiyet2026!` (admin),
`lezzet@afiyet.com` / `Afiyet2026!` (restaurant, tenant `t_lezzet`).

**Groq model:** `openai/gpt-oss-20b` (llama-3.1-8b / 3.3-70b were deprecated 2026-06-17).

**lk CLI:** deploy with `LIVEKIT_URL/API_KEY/API_SECRET` env + `lk agent deploy` from `agent/`
(builds on LiveKit's servers). CLI binary was fetched to the scratchpad; user can
`npm i -g livekit-cli`.

---

## The agent (friend's version won the merge — it's the deployed one)
`END-TO-END-SIS/agent/src/agent.ts`: multi-tenant (dialed-number → assistant via
`AFIYET_NUMBER_MAP`), fetches keys/config from Supabase `agent-config` at startup (falls back
to env), streaming STT option, posts finished call to `ingest-call` (so cost/usage/audit stay
in Supabase). Groq STT + Groq `gpt-oss-20b` LLM + **Inworld TTS (← being replaced by Azure)**.
See `agent/README.md` for the full deploy/secrets/latency notes.

**Known non-fatal issue:** agent logs `getaddrinfo ENOTFOUND tdmfpiynrybrnehnoaot.supabase.co`
— it can't reach Supabase from the LiveKit container, so it **falls back to env-var keys**
(which are set, so calls work) but **call logging to Supabase may not land**. Investigate
DNS/egress later; not blocking the phone call.

---

## HARD CONSTRAINTS (respect these)
1. **No credit card** — declined on Oracle/AWS/GitHub. Crypto rejected as "sketchy." Azure
   Student and LiveKit Build tier work because they need no card.
2. **Nothing runs on the user's PC** — agent runs on **LiveKit Cloud** (hosted), not locally.
3. **KVKK:** data ideally in Turkey. LiveKit Cloud is EU — OK for now; self-host in TR later.
4. **Pricing:** market ceiling ~$200/mo; price cheap ($30–70) to win adoption; tier by minutes.

---

## Gotchas / lessons (save time)
- **Groq models:** only `openai/gpt-oss-20b` etc.; old llama IDs 404.
- **node:*-slim images lack CA certs** → install `ca-certificates` or TLS/connect fails.
- **LiveKit has two URLs** — Project URL (app) vs SIP URI (telephony). Telephony uses the SIP URI.
- **RN (`mobile/`):** icons = `react-native-vector-icons` (+ fonts.gradle); `metro.config.js`
  shims `ws`→global WebSocket for supabase-js; Supabase URL/anon key hardcoded in `src/config.js`
  (anon key is public). `git push` was blocked once by a "credential" check on that anon key —
  the user pushes it themselves with `!git push`.
- **Cost model** measured in `COST-MODEL.md`. Open [Q]: Verimor **bulk minute rate** (get a quote).

## Security TODO
Rotate: LiveKit API secret (in chat), Groq + Inworld keys (user said they'd revoke),
Supabase management token `sbp_808929…`.

## Files worth reading
- `agent/README.md`, `agent/src/agent.ts`, `agent/Dockerfile` (CA-cert fix)
- `COST-MODEL.md` (economics), `VERIMOR-SWITCH.md`
- `mobile/HOW_TO_RUN.md` (RN app), `customer/` (old Expo app)
- Memory: `~/.claude/.../memory/MEMORY.md`
