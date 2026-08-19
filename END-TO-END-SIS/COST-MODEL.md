# AfiyetSesli — Cost Model & Pricing Estimate

**Last verified:** 2026-08-19
**FX rate used:** 1 USD = **47.9 TRY** (spot, 18–19 Aug 2026)
**Purpose:** Ground-truth the per-minute cost of running an AI voice order-agent for
Turkish restaurants, compare the managed (Vapi) vs self-hosted architectures, and
derive defensible plan pricing. Every input below is sourced at the bottom.

> ⚠️ **Confidence labels** are on every number: **[V]** = verified from a cited
> source, **[E]** = engineering estimate (our assumption, shown so it can be
> challenged), **[Q]** = needs a supplier quote before it can be trusted.

---

## 1. Verified component pricing

| Component | Price | Confidence | Source |
|---|---|---|---|
| **Vapi platform fee** | $0.05 / min (flat, charged even with your own model keys) | [V] | Vapi pricing analyses |
| **Groq — Llama 3.1 8B Instant (LLM)** | $0.05 / 1M input tok, $0.08 / 1M output tok | [V] | CloudZero / CostBench |
| **Groq — Whisper Large v3 Turbo (STT)** | $0.04 / hour of audio | [V] | CloudZero |
| **Inworld TTS — TTS-1** | $5 / 1M chars | [V] | TextToLab / Inworld |
| **Inworld TTS — 1.5 Mini** | $15–25 / 1M chars (volume-tiered) | [V] | TextToLab / Inworld |
| **Inworld TTS — TTS-2 (realtime)** | $25–35 / 1M chars on-demand | [V] | Inworld |
| **Verimor — retail after-package rate** | 0.99 TL / min (fixed & mobile, tax incl.) | [V] | Verimor |
| **Verimor — billing granularity** | 6-second periods on 5,000+ min packages; 60 s on smaller | [V] | Verimor |
| **Verimor — bulk package rate** | *Unknown for 2026.* 2019 sheet: 25,000 min = 1,399 TL (≈0.056 TL/min then) | [Q] | Verimor 2019 PDF |
| **jambonz media server (self-host)** | ~$40 / month, one CPU VPS, ~50+ concurrent calls | [E] | — |
| **GPU box (full self-host AI)** | ~$250 / month (shared across all tenants) | [E] | — |

---

## 2. Usage assumptions (per minute of live call)

These are **[E]** engineering estimates for a Turkish restaurant order call:

| Assumption | Value | Rationale |
|---|---|---|
| Agent speech share | ~50% of call | Order-taking is turn-based, roughly half caller / half agent |
| TTS characters spoken | ~500 chars / call-minute | ~150 wpm speech × ~50% talk time |
| LLM tokens | ~2,000 in + ~200 out / call-minute | System prompt + short rolling history, ~2 turns/min |
| STT audio transcribed | ~1 min audio / call-minute (conservative, full stream) | Upper bound; real caller audio is less |
| Average call length | 2.5 min | ~order + confirm |

---

## 3. Per-minute cost — three architectures

| Component | **A: Vapi managed** | **B: Self-host media, cloud AI** | **C: Self-host media + AI** |
|---|---|---|---|
| STT (Groq Whisper turbo) | $0.00067 | $0.00067 | ~$0 (self-hosted) |
| LLM (Groq Llama 3.1 8B) | $0.00012 | $0.00012 | ~$0 (self-hosted) |
| TTS | $0.010 (Inworld) | $0.010 (Inworld) | ~$0 (Piper, self-hosted) |
| Telephony (Verimor, bulk est.) | $0.017 | $0.017 | $0.017 |
| Platform / server (per-min) | $0.050 (Vapi) | ~$0.0004 (CPU, amortized) | ~$0.002 (GPU, amortized) |
| **Total per minute** | **~$0.078** | **~$0.028** | **~$0.019** |
| **Total per minute (TL)** | **~3.7 TL** | **~1.3 TL** | **~0.9 TL** |

**Key structural facts**
- The entire A→B gap ($0.05/min) is **Vapi's platform fee** — pure margin you reclaim by self-hosting the media plane.
- Telephony ($0.017/min) is a **hard floor**: it is a licensed carrier charge (Verimor) and **cannot be self-hosted away**. This is why Tier C is ~$0.019/min, not lower.
- Groq STT+LLM is **near-free** (<$0.001/min). It is never the cost problem.
- TTS (Inworld, $0.010/min) is the largest *reducible* AI cost — self-hosting Piper removes it, worth doing only at high volume.

---

## 4. Monthly cost by usage level

### At 500 min/month (typical small restaurant)
| Tier | Monthly COGS |
|---|---|
| A (Vapi) | ~$39 |
| B (self-host media) | ~$14 |
| C (full self-host) | ~$9.5 |

### At 5,000 min/month (high-volume / busy line)
| Tier | Monthly COGS |
|---|---|
| A (Vapi) | ~$390 ❌ (exceeds a $200 sell ceiling — **not viable**) |
| B (self-host media) | ~$140 |
| C (full self-host) | ~$95 |

---

## 5. Recommended plan pricing

Selling ceiling assumption: **~$200/month** (market tolerance in Turkey today).
Goal: price low enough to overcome slow adoption while holding ~50–70% margin.

| Plan | Included min | Sell price | Sell (TL) | COGS (Tier B/C) | Margin |
|---|---|---|---|---|---|
| **Küçük** | 500 | $39 | ~1,870 TL | ~$14 (B) | ~64% |
| **Orta** | 2,000 | $99 | ~4,740 TL | ~$50 (B) | ~50% |
| **Yoğun** | 5,000 | $190 | ~9,100 TL | ~$95 (C) | ~50% |

**Design rules that fall out of the math**
1. **Vapi is impossible under this ceiling at volume** — its fee alone ($0.05 × 5,000 = $250) exceeds the whole $200 price. **Self-hosting is mandatory.**
2. **Pricing must be tiered by minutes.** A single cheap flat price cannot cover both a 500-min and a 5,000-min restaurant — COGS differs 10×.
3. **Switch heavy tenants (Yoğun) to self-hosted Piper TTS** — saves ~$50/month/tenant at 5,000 min. Keep Inworld for small tenants (better quality, only $0.010/min there).

---

## 6. The single biggest lever: Verimor bulk rate

At high volume, **telephony is ~85–90% of COGS** (everything else is self-hosted to near-zero). The whole Yoğun-tier margin therefore rides on the Verimor **bulk package** rate, which is **[Q] not yet quoted**:

- At retail **0.99 TL/min** ($0.0207): 5,000 min telephony = **$103/mo** → Yoğun plan barely breaks even.
- At an assumed bulk **~0.80 TL/min** ($0.017): 5,000 min = **$85/mo** → ~50% margin (used above).
- 2019 reference implies bulk can go far lower; **must confirm the 2026 5,000/10,000/25,000-min package rates with Verimor sales before finalizing the Yoğun tier.**

**Action:** get the Verimor bulk quote (0850 532 00 00 / OIM portal) → replace the [Q] telephony number → re-run this table.

---

## 7. Recommended architecture (summary)

**Tier B as the default, Tier C for heavy tenants:**
- Self-host **only** the jambonz media plane (cheap CPU VPS) — deletes Vapi's $0.05/min tax.
- Keep **Groq** (STT+LLM) as cheap cloud APIs (near-free, no GPU needed).
- **Inworld TTS** for small/medium tenants; **Piper (self-hosted)** for Yoğun tenants.
- **Verimor** SIP trunk for minutes (bulk package).
- Everything lands in **Supabase** via the existing `ingest-call` Edge Function — no change to the app or data layer.

---

## Sources

- **FX rate (USD/TRY 47.9, Aug 2026):** https://www.exchangerates.org.uk/USD-TRY-spot-exchange-rates-history-2026.html
- **Vapi $0.05/min flat platform fee (incl. BYO keys):**
  - https://vapi.health/learn/vapi-pricing-per-minute
  - https://www.cekura.ai/blogs/vapi-ai-pricing
  - https://zeeg.me/en/blog/post/vapi-ai-pricing
- **Groq pricing (Llama 3.1 8B $0.05/$0.08 per M; Whisper v3 Turbo $0.04/hr):**
  - https://www.cloudzero.com/blog/groq-pricing/
  - https://costbench.com/software/llm-api-providers/groq/
- **Inworld TTS pricing ($5–35 / 1M chars by model/tier):**
  - https://texttolab.com/blog/inworld-pricing
  - https://inworld.ai/resources/voice-agent-cost-per-minute-2026
- **Verimor rates (0.99 TL/min retail, 6-second billing, packages):**
  - https://www.verimor.com.tr/konusma-paketleri/
  - https://www.verimor.com.tr/kurumsal-tarifemiz/
  - https://www.verimor.com.tr/bulut-santral-sip-trunk/
  - 2019 package sheet (historical bulk reference): https://www.verimor.com.tr/wp-content/uploads/2019/08/Paket-ve-Tarifelerimiz.pdf
- **Verimor ↔ Vapi AI-agent integration guide:**
  - https://www.verimor.com.tr/makaleler/vapi-verimor-entegrasyonu-ai-ajanlar-icin-numara-ve-sip-altyapisi/

---

*All prices exclude Turkish taxes (KDV/ÖİV) unless the source states "tax incl." Verify
tax treatment per line item before pricing. Re-verify all [Q] items and re-run the
tables before any external commitment.*
