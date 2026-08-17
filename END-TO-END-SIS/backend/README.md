# E2E-SIS Backend — one brain, two faces, two data sources

Serves the app's endpoints and, crucially, **enforces cost redaction server-side**
for the customer scope — for both demo data and live Vapi data.

## Run (demo)
```bash
npm start          # http://localhost:8787  (source: demo)
```

## Run (live Vapi proxy)
```bash
DATA_SOURCE=vapi VAPI_API_KEY=<your_vapi_private_key> npm start
```
1. Copy `tenants.example.json` → **`tenants.json`** and map each tenant to its
   real Vapi **assistantIds** (this is your multi-tenant layer on top of Vapi).
2. Start with `DATA_SOURCE=vapi` + `VAPI_API_KEY`.
3. The backend now fetches from `api.vapi.ai`, maps Vapi objects to our shapes,
   and applies the **same redaction** — so `/customer/*` still has no cost fields.

`tenants.json` and `.env` are git-ignored. See `.env.example`.

## Endpoints

| Scope | Endpoint | Source → mapping |
|---|---|---|
| Auth | `POST /auth/login` | our own accounts (independent of data source) |
| Customer | `GET /customer/overview` | revenue/answer-rate/usage — **no cost** |
| Customer | `GET /customer/calls[/:id]` | list + detail (transcript, order, recording) — **no cost**; cross-tenant blocked |
| Customer | `GET·PATCH /customer/assistant[/:id]` | agent config (Vapi `firstMessage`/`metadata`) |
| Customer | `GET /customer/phone-number` | tenant number |
| Admin | `GET /admin/overview` · `/admin/tenants` | MRR, COGS, **margins** |
| Admin | `GET /admin/calls[/:id]` | full `costBreakdown` + transcript |
| Raw | `GET /assistant[/:id]` · `/call[/:id]` | Vapi-shaped passthrough |

## How the mapping works (Vapi → us)
`src/vapi.js` maps:
- **assistant** → `{ name, model, voice, config.greeting (=firstMessage), config.openHours (=metadata) }`
- **call** → `{ answered (from status/endedReason), outcome/orderAmount/customerName (from `analysis.structuredData`), summary (from `analysis.summary`), cost/costBreakdown }`
- **call detail** → adds `transcript` (from `messages`), `recordingUrl`, `analysis`

> For `outcome`/`orderAmount`/`customerName` to be populated from live calls, the
> Vapi assistant needs an **`analysisPlan.structuredDataSchema`** that emits
> `intent`, `total`, `customerName`. Otherwise they fall back sensibly.

## The guarantee
Redaction is one function (`toCustomerCall*`) applied to normalized objects from
**either** source. A customer session cannot receive `cost`/`costBreakdown`, and
cannot fetch another tenant's call by id (enforced by `tenantId` check).
