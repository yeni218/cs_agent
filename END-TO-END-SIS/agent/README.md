# AfiyetSesli Agent — our own engine on a real phone call (replaces Vapi)

This is the LiveKit voice agent that lets a caller dial your Verimor number and
talk to **your own** Groq + Inworld engine — not Vapi.

```
Caller → Verimor SIP trunk → LiveKit Cloud (media, free tier) → THIS agent → Supabase
                                                                 │
                        Groq Whisper (STT) + Groq gpt-oss-20b (LLM) + Inworld TTS
```

- **LiveKit Cloud** = the media plane (free tier, 1,000 min/mo, **no credit card**). It answers the SIP call and moves audio.
- **This agent** = the brain, using **your own keys** → the ~$0.028/min economics.
- **Supabase** = system of record (each call is logged into the same `calls` table the app reads).

---

## 1. Sign up for LiveKit Cloud (free, no card)
1. Go to **cloud.livekit.io** → sign up (no credit card on the Build/free plan).
2. Create a project.
3. **Settings → Keys** → copy **Project URL** (`wss://…livekit.cloud`), **API Key**, **API Secret**.

## 2. Install + configure
```bash
cd END-TO-END-SIS/agent
npm install
cp .env.example .env      # fill in LIVEKIT_*, GROQ_API_KEY, INWORLD_API_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## 3. Connect Verimor → LiveKit (SIP inbound)
LiveKit needs an **inbound trunk** + a **dispatch rule**. Easiest via the LiveKit CLI (`lk`):

**a) Inbound trunk** — tells LiveKit to accept calls for your number:
```bash
lk sip inbound create \
  --numbers "+902127061540" \
  --name "Verimor"
```

**b) Dispatch rule** — routes each inbound call into a room handled by this agent:
```bash
lk sip dispatch create \
  --agent-name "afiyetsesli" \
  --rule-type individual \
  --room-prefix "call-"
```

**c) On the Verimor side** — point your trunk at LiveKit's SIP URI instead of Vapi's:
LiveKit gives you a SIP host like `<project>.sip.livekit.cloud`. In the Verimor
panel, change the trunk's destination to that host (the same place your friend
set the Vapi gateway `194.49.126.26`). Whitelist LiveKit's SIP IPs if required.

## 4. Run the agent
```bash
npm run dev
```
This connects **outward** to LiveKit Cloud (no inbound port/NAT needed), so it runs
fine from your machine while developing.

## 5. Test
Call **+90 212 706 15 40**. The agent answers in Turkish, takes the order, and on
hangup the call appears in Supabase → your app.

---

## Where does the agent run in production?
During development it runs on your machine (it's just `npm run dev`). For production
it needs a small always-on host — but that's a *later* decision, funded once you have
a customer. The media plane (LiveKit Cloud) is already hosted for free; only this
lightweight agent process needs a home eventually. It's open-source LiveKit, so you
can self-host the whole thing later for full KVKK sovereignty.

## Notes / things we may tune on first run
- The LiveKit Agents SDK moves fast — plugin option names (STT/LLM/TTS) may need
  small adjustments; we'll confirm on the first `npm run dev`.
- Inworld TTS: LiveKit also has native `inworld/…` inference models; if the
  OpenAI-compatible TTS wiring here needs changing, we switch to that.
- Menu + prices: to quote accurate order totals, load the restaurant's menu into
  `SYSTEM_PROMPT` (otherwise the agent asks for prices instead of quoting them).
