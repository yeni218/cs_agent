# Two-Sided Architecture — Customer end + Admin end

## The deepthink

We're running a **platform**, not a single app. Two very different audiences look
at the same underlying calls through opposite lenses:

| | **Customer end** (restaurant) | **Admin end** (us, the operator) |
|---|---|---|
| Who | The business paying us a subscription | Platform operators / founders |
| Mental model | "Is my phone making me money?" | "Are we profitable per tenant?" |
| Sees | Revenue, answered calls, orders, reservations, avg ticket, their agent config, their plan usage | **Real COGS** (STT/LLM/TTS/telephony), **margin per call/tenant**, MRR, all tenants, system health |
| Never sees | **Our costs, margins, other tenants, infra** | (sees everything) |
| Feel | Like Voicebit — outcome-first, zero infra jargon | An ops/finance cockpit |

### The one hard rule: cost redaction is server-side

The customer must **never** be able to see our COGS or margin — not even by
opening dev tools. So the split is **not** "hide columns in the UI." It's two
separate API scopes, and the customer scope **builds response objects that
physically do not contain cost fields.** A leaked `costBreakdown` is a business
incident (it reveals our margin to the customer). This is the core design
constraint.

```
                 ┌───────────── backend (one brain, two faces) ─────────────┐
customer app ───▶│  /customer/*   tenant-scoped, COGS stripped server-side  │
 (Voicebit-like) │                revenue/orders/usage framing               │
                 │                                                           │
   admin app ───▶│  /admin/*      all tenants, full COGS, margin, MRR        │
 (ops cockpit)   └───────────────────────────────┬───────────────────────────┘
                                                  ▼
                                   call records + costBreakdown
                                   (from Vapi now / sovereign cascade later)
```

## Tenancy model

- **tenant** (a restaurant): `id`, `name`, `plan { name, monthlyPrice, includedMinutes }`,
  `phoneNumber`, `language`, `status`. `monthlyPrice` = what *they pay us* (their
  "revenue" line is their own sales; their *cost* is our subscription).
- **assistant**: belongs to a tenant.
- **call**: belongs to tenant + assistant, and carries **two disjoint field sets**:
  - *customer-facing*: `answered`, `durationSec`, `outcome` (order/reservation/faq),
    `orderAmount`, `customerName`, `summary`.
  - *internal-only*: `costBreakdown { stt, llm, tts, transport, platform }` → our COGS.

## What each end computes

**Customer overview** (per tenant, no costs):
- Phone-driven revenue = Σ `orderAmount`
- Answer rate = answered / total
- Average ticket = revenue / orders
- Call volume by day
- Plan usage = minutes used vs `includedMinutes`

**Admin overview** (all tenants, full economics):
- Per tenant: revenue-to-us = `plan.monthlyPrice`; our COGS = Σ call cost;
  **margin = monthlyPrice − COGS**; minutes used
- **MRR** = Σ `monthlyPrice`; total COGS; blended gross margin %
- System health (STT/LLM/TTS/telephony up, latency)

## Endpoint map

| Scope | Endpoint | Returns |
|---|---|---|
| Customer | `GET /customer/overview` | revenue, answerRate, avgTicket, volume[], usage — **no costs** |
| Customer | `GET /customer/calls` | tenant calls, **cost fields stripped** |
| Customer | `GET /customer/assistant` | tenant's agent config |
| Admin | `GET /admin/overview` | MRR, total COGS, margin %, systemHealth |
| Admin | `GET /admin/tenants` | every tenant with revenue, COGS, **margin** |
| Admin | `GET /admin/calls` | all calls, **full costBreakdown + per-call margin** |

Auth (demo): customer sends `x-tenant-id` (scopes to one tenant); admin sends an
admin key. In production these become real scoped tokens (`acenteId` tenancy,
matching the insurance backend).

## App mapping in this repo

- `customer/` — new Voicebit-like app (revenue/orders/agent/plan). Hits `/customer/*`.
- `admin/` — the ops cockpit (costs/margins/tenants/health). The existing
  `mobile/` analytics app is the seed for this — repointed at `/admin/*`.
- `backend/` — the one brain, now tenant-aware with the two scopes above and
  **server-side COGS redaction** for the customer scope.

## Why this ordering

Build the **backend split first** (it enforces the cost-redaction rule that both
apps depend on), then the two frontends. The redaction lives in one place so a UI
bug can never leak margin.
