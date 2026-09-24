# Verimor → LiveKit switch

**Status:** ⏳ Waiting on Verimor. Everything on our side is deployed and running.
**Written:** 2026-09-12

This is the *one* change that moves the phone line off Vapi and onto our own
engine. Nothing else is left.

---

## What has to change

Exactly one thing: **where Verimor sends inbound calls for `+90 212 706 1540`.**

| | Before (Vapi) | After (LiveKit) |
|---|---|---|
| Destination | Vapi's gateway | `afiyet-tj1bqfhh.eu.sip.livekit.cloud` |
| IPs to allow | `44.229.228.186`, `44.238.177.138` | `161.115.160.0/19` |
| | | (currently `161.115.161.130`, `161.115.161.170`) |
| Port / transport | 5060 UDP | 5060 UDP — unchanged |
| Authentication | IP-based, no password | unchanged |
| Phone number | +90 212 706 1540 | unchanged |

**Always ask for the `/19` range, never the two bare IPs.** LiveKit publishes
`161.115.160.0/19` as a static block, but individual addresses inside it rotate.
Whitelisting only the two is how this line breaks months later with nobody
remembering why.

**Use the `.eu.` regional hostname.** The global endpoint
`afiyet-tj1bqfhh.sip.livekit.cloud` (`84.13.78.97`, `158.178.131.46`) is *not*
in any published static range and may change without notice.

---

## Why we can't avoid touching Verimor

We looked for a way to do this purely from the LiveKit side. There isn't one.

Inbound SIP is one-directional: **the carrier decides where the call goes.**
Verimor currently holds "send calls for this number → Vapi's IPs". Configuring
LiveKit only controls what LiveKit *accepts*, not what Verimor *sends*. It's
changing your mailbox without telling the post office.

Registration-based trunks would escape this — the endpoint logs in and the
carrier routes back to wherever it registered from, no carrier change needed.
**Our Verimor trunk is IP-authenticated with no password**, so there is no login
for LiveKit to perform and no way to announce a new location.

That also rules out an outbound-only test: Verimor's gateway `194.49.126.26`
only accepts INVITEs from whitelisted IPs, and LiveKit's are not on the list.

### The one alternative, if Verimor access stays blocked
Verimor → **Vapi** (untouched) → Vapi forwards/transfers the call to LiveKit's
SIP URI → our agent. Zero Verimor changes, and it proves the agent works on a
real call. But Vapi keeps billing ~$0.05/min for its leg, which is the entire
cost problem this project exists to solve. **Test path, not an end state.**
Requires Vapi dashboard access.

---

## The email to send

Verimor support works in Turkish. Send from the **account holder's** address, or
CC them — carriers won't action routing changes from someone not on the account.

> **Konu:** SIP Trunk yönlendirme değişikliği talebi — 0212 706 15 40
>
> Merhaba,
>
> `+90 212 706 1540` numaramıza gelen çağrıların yönlendirildiği hedefi
> değiştirmek istiyoruz.
>
> **Yeni hedef:**
> `afiyet-tj1bqfhh.eu.sip.livekit.cloud`
>
> **IP izin listesine eklenmesini rica ettiğimiz aralık:**
> `161.115.160.0/19`
> (şu anki adresler: `161.115.161.130`, `161.115.161.170`)
>
> Port ve protokol aynı kalacak: **5060 UDP**. Kimlik doğrulama yine IP bazlı,
> şifre kullanılmıyor.
>
> Bu değişiklik geri alınabilir; sorun yaşarsak eski yönlendirmeye dönebiliriz.
>
> Yardımınız için teşekkürler.
>
> Saygılarımla,
> [adınız]

The email deliberately does **not** mention Vapi or explain the migration.
Verimor doesn't need to know, and naming a competitor's infra invites questions
instead of action.

---

## How to revert

Point the Verimor trunk destination back at Vapi's IPs
(`44.229.228.186`, `44.238.177.138`). One setting, and Vapi answers the phone
again. Our Supabase data, the app, and the phone number are all unaffected
either way — they are shared by both paths.

---

## Our side (already done — no action needed)

Deployed 2026-09-12, LiveKit Cloud project `afiyet` / `afiyet-tj1bqfhh`,
region `eu-central` (Frankfurt), Build/free plan:

| Piece | ID | State |
|---|---|---|
| Agent `afiyetsesli` | `CA_UFfPHJ2MJUhR` | Running; loads keys from Supabase |
| SIP inbound trunk | `ST_u2XdCqpYLnsu` | Bound to `+902127061540` |
| SIP dispatch rule | `SDR_rgxgfK9A5Hiy` | → agent, individual rooms `call_*` |
| `agent-config` function | — | Deployed, verified |

Verified in production logs: `[afiyet] config loaded: 2 assistant(s)`.

**Open hardening item:** the trunk's `AllowedAddresses` is still empty — it
should be `194.49.126.26/32` (Verimor's gateway) so LiveKit only accepts INVITEs
from Verimor. The `lk sip inbound update` JSON syntax rejected our attempts;
set it from the LiveKit dashboard instead. Not blocking, but it means the trunk
currently accepts SIP from any source.

**Still untested:** no call has been placed. Inworld streaming STT has never
transcribed Turkish for us, and the hangup → `ingest-call` POST has never fired.
Worth a browser test (`lk dispatch` + playground, free, no phone) before anyone
reroutes a production number.
