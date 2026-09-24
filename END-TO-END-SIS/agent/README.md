# AfiyetSesli Agent — our own engine on a real phone call (replaces Vapi)

This is the LiveKit voice agent that lets a caller dial your Verimor number and
talk to **your own** Groq + Inworld engine — not Vapi.

```
Caller → Verimor SIP trunk → LiveKit Cloud (media + agent host) → Supabase
                                          │
                  Groq Whisper (STT) + Groq gpt-oss-20b (LLM) + Inworld TTS
```

- **LiveKit Cloud** = both the media plane *and* the host for this agent. Build
  plan: **$0/mo, no credit card**, 1 agent deployment, 1,000 agent-session
  minutes and 1,000 third-party SIP minutes per month.
- **This agent** = the brain, using **your own keys** → the ~$0.028/min economics.
- **Supabase** = system of record. The agent POSTs each finished call to the
  existing `ingest-call` Edge Function, so cost computation, usage rows,
  reconciliation and the audit chain are unchanged and the app needs no edits.

**Nothing runs on your PC.** You only use the `lk` CLI to push a deployment.

---

## 1. Sign up for LiveKit Cloud (free, no card)
1. Go to **cloud.livekit.io** → sign up, choose the **Build** plan.
2. Create a project.
3. **Settings → Keys** → copy the **Project URL** (`wss://….livekit.cloud`),
   **API Key**, **API Secret**.

## 2. Configure
```bash
cd END-TO-END-SIS/agent
cp .env.example .env     # fill in LIVEKIT_*, GROQ_API_KEY, INWORLD_API_KEY, AFIYET_INGEST_SECRET
```
`AFIYET_INGEST_SECRET` is the value already set as a Supabase secret — see
`CONTINUE.md`. The agent never gets a service-role key.

## 2b. Deploy the config function to Supabase
The agent bootstraps its keys from this, so it must exist first:
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy agent-config \
  --project-ref tdmfpiynrybrnehnoaot --no-verify-jwt
```

## 3. Deploy the agent to LiveKit Cloud
```bash
npm i -g livekit-cli      # provides the `lk` command
lk cloud auth             # opens a browser, links this machine to your project
lk agent create           # creates the deployment + writes livekit.toml, uploads .env as secrets
```
`lk agent create` reads `Dockerfile` (already written) and builds the image **on
LiveKit's servers**. After the first create, ship changes with:
```bash
lk agent deploy
lk agent status
lk agent logs
```

> On the Build plan a deployed agent is **shut down once no sessions are
> active**, so the first call after an idle period waits ~10–20 s for a cold
> start. See "Known limits" below.

## 4. Connect Verimor → LiveKit (SIP inbound)
**a) Inbound trunk** — tells LiveKit to accept calls for your number:
```bash
lk sip inbound create --name "Verimor" --numbers "+902127061540"
```

**b) Dispatch rule** — routes each inbound call into its own room, handled by
this agent (`agentName` is `afiyetsesli`, set at the bottom of `src/agent.ts`):
```bash
lk sip dispatch create \
  --name "afiyet-inbound" \
  --trunks <INBOUND_TRUNK_ID> \
  --agent-name "afiyetsesli" \
  --individual --room-prefix "call-"
```

**c) On the Verimor side** — point the trunk at LiveKit's SIP host
(`<project>.sip.livekit.cloud`) instead of Vapi's gateway `194.49.126.26`, and
whitelist LiveKit's SIP IPs. This is the only migration step: the app, Supabase
and the phone number all stay exactly as they are, so you can switch back to
Vapi by reverting this one setting.

## 5. Test
Call **+90 212 706 15 40**. The agent answers in Turkish, takes the order, and
on hangup the call appears in Supabase → your app, with real measured cost.

---

## Where the secrets live
**Supabase, not LiveKit.** At worker startup the agent calls the `agent-config`
Edge Function and receives the Groq + Inworld keys plus each restaurant's
settings. LiveKit therefore stores **one** secret — `AFIYET_INGEST_SECRET` —
which grants nothing beyond `agent-config` and `ingest-call`. No service-role
key ever reaches the agent container, so a compromised agent cannot read tenant
data.

Rotating a provider key is one command, with no redeploy:
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set GROQ_API_KEY=<new> --project-ref tdmfpiynrybrnehnoaot
```

Because config is read **once per worker process**, a rotation takes effect on
the next process start. Force it with `lk agent restart`.

If Supabase is unreachable the agent falls back to `GROQ_API_KEY` /
`INWORLD_API_KEY` from the environment — normally blank, so the phone line
degrades loudly rather than failing silently.

## Editing a restaurant without redeploying
`agent-config` also returns per-assistant settings from the `assistants` table:
greeting, voice, LLM model, language, opening hours. Change a row in Supabase
and the next call uses it. Deprecated Groq model IDs stored on old rows are
rewritten to `openai/gpt-oss-20b` by the function so a stale row can't 404 a
live call.

## How a call is recorded
The agent tracks **real** usage during the call (LLM tokens, TTS characters, STT
audio seconds) from LiveKit's own metrics, then POSTs it to `ingest-call`. That
means the cost on the admin dashboard is measured, not estimated.

Tenant routing: the agent reads the dialed number from the SIP participant
(`sip.trunkPhoneNumber`) and maps it to an assistant via `AFIYET_NUMBER_MAP`, so
one deployment can serve every restaurant. Unknown numbers fall back to
`AFIYET_ASSISTANT_ID`.

## Known limits (Build plan)
| Limit | Value | Impact |
|---|---|---|
| Agent deployments | 1 | Fine — one deployment serves all tenants. |
| Concurrent sessions | 5 | 5 simultaneous callers across all restaurants. |
| Agent-session minutes | 1,000/mo, **hard cap** | ~1 small restaurant. Requests fail past it — no surprise bill. |
| Third-party SIP minutes | 1,000/mo | Verimor traffic counts here. |
| Cold start | ~10–20 s | Agent is stopped when idle. Paid Ship plan ($50/mo) keeps it warm. |

The 1,000-minute cap is the real ceiling: it is enough to demo and to run the
first pilot restaurant, not to run a paying business. See `COST-MODEL.md` §3a
for what LiveKit adds to per-minute COGS once you outgrow it.

## Local development
Requires **Node 22.6+** (the agent is run as TypeScript directly, no build step).
```bash
npm install
npm run console   # talk to the agent from your terminal, no phone needed
npm run dev       # connect to LiveKit Cloud and take real calls
```
Neither is required — deployment goes straight to LiveKit Cloud.

## Latency
Two separate things, with separate fixes:

**Per-turn latency** (the "real time" feel) — tuned in `src/agent.ts`:
- **Streaming STT.** `STT_PROVIDER=inworld` streams over a WebSocket and decides
  end-of-turn from confidence. `groq` is batch Whisper — it buffers the whole
  utterance before transcribing, which is dead air. Flip the env var to A/B them.
- **Preemptive generation** — the LLM starts on the partial transcript instead of
  waiting for the turn to end. Wasted tokens are near-free on Groq.
- **Endpointing** `minDelay: 300, maxDelay: 2000` (SDK defaults are 500/3000).
  If the agent starts interrupting callers mid-sentence, raise `minDelay` first.
- **Short replies.** The prompt caps answers at 1–2 sentences. Audio starts after
  the first sentence is synthesized, so verbosity is a latency bug.

**Cold start (~10–20 s)** — only the first call after idle, and **not fixable in
code**. The Build plan stops the agent when no sessions are active. Fixes: the
$50/mo Ship plan, or self-hosting. Does not affect subsequent calls.

## Things to tune
- **Menu + prices:** to quote accurate order totals, load the restaurant's menu
  into `SYSTEM_PROMPT` — otherwise the agent asks for prices instead of quoting
  them. Longer term this should be read per-assistant from Supabase.
- **Voice:** `INWORLD_VOICE` defaults to `Ashley`. Check Inworld's Turkish voices
  and pick one that sounds local.
- **TTS model:** `inworld-tts-1.5-max` is the default; `inworld-tts-2` is higher
  quality and more expensive.
