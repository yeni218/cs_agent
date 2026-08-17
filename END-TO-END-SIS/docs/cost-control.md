# Cost Control And Proofing

Target: keep blended COGS below **$0.02 per live call minute** without Vapi.

## Default Cheap Route

- STT: Groq `whisper-large-v3-turbo`
- LLM: Groq `llama-3.1-8b-instant`
- TTS: Inworld `inworld-tts-1.5-mini`
- Telephony: Verimor bundled minutes
- Platform/media: our own worker, measured separately

With the current defaults, a normal minute is expected to land around
`$0.013-$0.016/min` before unusual overages. The number is only valid when these
assumptions stay true.

## Env Values To Pin Before Selling

Set these from invoices, not memory:

```bash
USD_TRY=47.52
VERIMOR_PACKAGE_MINUTES=10000
VERIMOR_PACKAGE_PRICE_TRY=2999
VERIMOR_OVERAGE_TRY_PER_MIN=0.99
VERIMOR_BILLING_INCREMENT_SEC=6

PRICE_STT_PER_SEC=0.000011111
PRICE_LLM_IN_PER_1K=0.00005
PRICE_LLM_OUT_PER_1K=0.00008
PRICE_TTS_PER_1K_CHARS=0.009
PRICE_MEDIA_PER_SEC=0
PRICE_PLATFORM_PER_CALL=0.005
PRICE_PLATFORM_PER_SEC=0
PRICE_TARGET_PER_MIN=0.02
```

`PRICE_TRANSPORT_PER_SEC` is optional. If omitted, the code computes it from
`VERIMOR_PACKAGE_*` and `USD_TRY`.

## Production Proof Loop

1. The voice worker submits the finished call to Supabase `ingest-call`.
2. `ingest-call` writes `calls.cost_breakdown` and `call_usage_events`.
3. When Verimor CDR arrives, submit it with `telephonyCdr`.
4. Supabase writes `telephony_cdrs` and `cost_reconciliations`.
5. Admin reads `admin_cost_daily` or the app admin cockpit.
6. Any call with `cost_status = 'review'` is investigated before billing plans
   are expanded.

The root `apps/voice-agent` performs step 1 automatically when these are set:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
AFIYET_INGEST_SECRET=...
AFIYET_ASSISTANT_ID=asst_lezzet
AFIYET_TENANT_ID=t_lezzet
```

## Red Lines

- Customer surfaces only use `customer_calls`; never expose `calls`,
  `call_usage_events`, `telephony_cdrs`, or `cost_reconciliations`.
- Verimor overage can exceed `$0.02/min` by itself. Do not sell "unlimited"
  until package exhaustion and overage alerts are live.
- The dashboard price is an estimate until provider invoices/CDRs reconcile.
