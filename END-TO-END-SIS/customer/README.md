# AfiyetSesli — The App (one app, role-based login)

> Folder is named `customer/` for historical reasons — it is now the **single
> unified app**. Same binary for restaurants and for us; **the login decides
> which experience you get.**

- **Restaurant login** → Voicebit-like view: phone revenue, orders, answer rate,
  agent, plan usage. **Never shows our costs.**
- **Admin login** (us) → ops cockpit: MRR, COGS, gross margin, per-tenant margins,
  system health, per-call cost breakdown.

The account's `role` (+ `tenantId`) comes back from `/auth/login`; the app renders
the matching tabs and the client sends the matching scope header, so the server
returns customer-safe (cost-stripped) or full-economics data accordingly.

## Run
```bash
npm install            # already installed
npx expo start         # w = web, or scan QR in Expo Go
```

### Demo logins (no backend needed — tick "Demo modu")
| Role | Email | Password |
|---|---|---|
| Restaurant (customer) | `lezzet@demo.com` | `demo` |
| Restaurant (customer) | `kebap@demo.com` | `demo` |
| Admin (us) | `admin@afiyet.ai` | `admin` |

Or use the **Hızlı demo girişi** buttons on the login screen.

### Live logins
Preferred path is direct Supabase:

```bash
cp .env.example .env
# set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

Untick "Demo modu" and log in with Supabase Auth users linked in
`public.profiles`. The app reads customer data from `customer_calls`, so customer
responses do not contain cost columns.

If Supabase env vars are absent, live mode still supports the old backend
fallback: run `../backend`, keep the URL as `http://localhost:8787`, and log in
with the same accounts. On a phone use your PC's LAN IP.

## Structure
- `src/screens/LoginScreen.js` — single login (customer + admin).
- customer screens: `HomeScreen`, `OrdersScreen`, `AgentScreen`, `PlanScreen`.
- admin screens: `AdminHomeScreen` (MRR/margins/tenants/health), `AdminCallsScreen` (cost breakdown).
- `src/api/supabase.js` — direct Supabase client.
- `src/api/client.js` — session-aware; direct Supabase when configured, backend fallback otherwise.
- `App.js` — session gate + role-based tabs + logout.

The `../mobile/` app is the earlier admin-only prototype and is now superseded by
this app's admin role — it can be removed.
