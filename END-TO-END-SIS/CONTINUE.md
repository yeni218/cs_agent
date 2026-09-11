# CONTINUE — AfiyetSesli handoff

**Last updated:** 2026-09-11
**Branch:** `feat/insurance-agent-compliance-store`
**Repo:** https://github.com/yeni218/cs_agent

Read this top-to-bottom before doing anything. It captures decisions already made
so you don't re-litigate them. The user is a **non-technical solo founder in Turkey**,
**no budget, no working credit card** — respect these constraints in every suggestion.

---

## What this project is
AfiyetSesli: a Turkish AI **phone-ordering agent for restaurants** (like VoiceBit).
A customer calls the restaurant's number, an AI answers in Turkish, takes the order,
and it lands in a dashboard. Two-sided app: restaurants (cost hidden) + admin (MRR/COGS).

The stack we're building **replaces Vapi** with our own engine (Groq + Inworld) to hit
**~$0.028/min** instead of Vapi's ~$0.078/min.

---

## Current status snapshot

| Piece | Status |
|---|---|
| Customer app (Expo/RN, role-based) | ✅ Works — Expo Go tested, APK built via EAS |
| Supabase backend (auth, RLS, cost redaction) | ✅ Live |
| Edge Functions: `call`, `ingest-call`, `vapi`, `voice` | ✅ Deployed |
| Own engine (Groq + Inworld) | ✅ **Live-tested**, ~$0.018–0.032/min measured (see COST-MODEL.md §0) |
| Login users | ✅ Created (below) |
| **Real phone call via Vapi** | ✅ **WORKS** (Verimor → Vapi → assistant) |
| **Real phone call via OUR engine** | 🚧 In progress — LiveKit path (below) |

---


## THE hard technical truth (established — do NOT re-litigate)
A live phone call uses **SIP + RTP over UDP**, a continuous real-time stream. **Supabase
Edge Functions cannot do this** (no UDP, short-lived, no WebRTC). Neither can Cloudflare
Workers, nor "a lighter LiveKit," nor the Proxylity UDP-bridge trick (fine for IoT, not
real-time voice). **A phone call's media plane MUST run on an always-on host.** We spent
many turns confirming this from every angle. Supabase stays the **brain/system-of-record**;
the media plane lives elsewhere. Don't propose "run the phone call in Supabase" again.

Likewise, a LiveKit **"agent" is a live audio participant** (WebRTC) — it also can't be a
Supabase function. The agent must run on a real host.

---

## The plan we're executing: bypass Vapi with LiveKit

```
Caller → Verimor SIP trunk → LiveKit Cloud (media plane) → Agent (Groq+Inworld) → Supabase
                              free tier, no card            YOUR engine, $0.028/min
```

**Two-phase strategy (agreed):**
- **Phase 1 (done):** Vapi works today → use it to demo/land first customer.
- **Phase 2 (now):** LiveKit → our own engine → cut Vapi's fee. Migration is a config swap
  (re-point Verimor trunk; app + Supabase unchanged).

**What's built:** `END-TO-END-SIS/agent/` — a LiveKit Node agent (Groq Whisper STT +
gpt-oss-20b LLM + Inworld TTS, logs to Supabase). See `agent/README.md`.

---

## HARD CONSTRAINTS from the user (must respect)
1. **No credit card** — declined on Oracle/AWS/GitHub (international transactions blocked by
   their Turkish bank). Crypto VPS was rejected as "sketchy." Do not push crypto.
2. **Nothing runs on their PC** — not even a dev process. Rules out `npm run dev` locally.
3. **Doesn't want to babysit servers.** Prefers managed/free where it's legit.
4. **Wants max in Supabase.** (It already is, except the media plane — which can't be.)
5. **KVKK:** data ideally stays in Turkey. LiveKit Cloud is EU — acceptable for build, revisit
   for production (self-host LiveKit in TR later; it's open-source).
6. **Pricing:** market ceiling ~$200/mo; wants to price cheap ($30–70/mo) to win adoption.
   Tier by minutes (500 min ≈ small, 5,000 min ≈ heavy). See COST-MODEL.md §5.

---

## IMMEDIATE NEXT STEP (where we stopped)
Because "nothing on the PC," the LiveKit **agent must be hosted by LiveKit Cloud itself**
(their agent-deployment feature), not run locally.

**OPEN QUESTION being verified when the session ended:**
> Does **LiveKit Cloud agent hosting/deployment** work on the **free tier with no credit card**?

- If **yes** → the whole thing runs with nothing on the user's PC and no card:
  LiveKit Cloud hosts media + agent, Supabase logs, Verimor is the number. Proceed to wire it.
- If **no** (needs a card/paid) → that's the honest limit; fall back options:
  (a) keep Vapi for now, (b) find a free agent host that needs no card and isn't the PC.

**Next actions once that's answered:**
1. User signs up **cloud.livekit.io** (Build/free plan) → get Project URL, API Key, API Secret.
2. Fill `END-TO-END-SIS/agent/.env` (LiveKit keys + Groq/Inworld keys + Supabase service role).
3. Configure LiveKit **SIP inbound trunk** for `+902127061540` + **dispatch rule** → agent.
4. In Verimor, re-point the trunk destination from Vapi's gateway to **LiveKit's SIP host**.
5. **Deploy the agent to LiveKit Cloud** (NOT the user's PC).
6. First run: expect to fix `@livekit/agents` plugin option names (SDK moves fast — STT/LLM/TTS
   wiring in `agent/src/agent.ts` is best-effort and untested; verify against current docs).
7. Call `+90 212 706 15 40` → confirm the agent answers in Turkish and the call logs to Supabase.

---

## Gotchas / lessons (save time)
- **Groq models:** only `openai/gpt-oss-20b` (cheap) etc. work now; old llama IDs 404.
- **Expo env vars:** reference `process.env.EXPO_PUBLIC_X` **directly** — aliasing `process.env`
  to a var breaks Expo's build-time inlining (this bug shipped an empty Supabase URL once).
- **supabase-js in React Native:** `metro.config.js` must shim `ws` (→ global WebSocket) via
  `resolveRequest`, because realtime-js pulls Node `ws`/`stream`/`zlib`. Already fixed.
- **EAS builds:** free queue is slow (20+ min); use **Expo Go** for dev iteration.
- **Cost model** is measured & sourced in `COST-MODEL.md` (§0 live test, §6 the one open [Q]:
  Verimor **bulk minute rate** — get a quote; it's ~85% of COGS at scale).
- **VoiceBit** (competitor/partner pitch in `resource/`) charges $99–400/mo; we can undercut
  massively (our COGS ~$0.028/min vs their $0.40–0.99/min price).

---

## Files worth reading
- `END-TO-END-SIS/COST-MODEL.md` — full sourced economics + live-measured proof.
- `END-TO-END-SIS/agent/README.md` — LiveKit agent setup steps.
- `END-TO-END-SIS/agent/src/agent.ts` — the agent (needs first-run SDK verification).
- `END-TO-END-SIS/supabase/functions/` — `call`, `voice`, `ingest-call`, `vapi`, `_shared/engine.ts`.
- `END-TO-END-SIS/customer/` — the app (role-based, Supabase-direct).

## Memory (persists across sessions)
See `~/.claude/.../memory/MEMORY.md`:
- `verimor-bulk-quote-action.md` — #1 open COGS action.
- `afiyet-architecture-decision.md` — self-host media plane decision.
