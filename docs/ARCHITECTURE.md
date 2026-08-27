# MyCove API — Architecture

> NestJS 11 · Prisma 7 · PostgreSQL · service name `mycove-api`
>
> Feature inventory: [FEATURES.md](FEATURES.md) · Mobile app:
> [`../../mycove/docs/ARCHITECTURE.md`](../../mycove/docs/ARCHITECTURE.md)
> · Admin:
> [`../../mycove-admin/docs/ARCHITECTURE.md`](../../mycove-admin/docs/ARCHITECTURE.md)

## 1. System context

```
Resident/Guard app ─┐
                    ├─ HTTPS ─▶ ┌───────────────────────────┐
Admin dashboard  ───┘           │      MyCove API           │
                                │  (NestJS, /api prefix)    │
                                └─────┬─────────┬───────────┘
                                      │         │
              Prisma 7 (adapter-pg) ──▶│         │◀── firebase-admin (FCM sends)
                     ▼                 │         │◀── mixpanel node client
               PostgreSQL              │         │◀── VTpass / BuyPower vending
                                       │         │◀── Paystack-shaped payments
                                (docker-compose localhost:5433)
```

One NestJS process serves residents, guards, and admins. Everything estate-
scoped is filtered by `estateId` from the JWT.

## 2. Request lifecycle

1. Global prefix `/api` (`app.setGlobalPrefix`).
2. CORS enabled with reflected origin + credentials (admin web is a separate
   origin/port; local dev picks free ports).
3. JSON body limit raised to **25 MB** for base64 media.
4. Global `ValidationPipe` — `whitelist` strips unknown properties,
   `forbidNonWhitelisted` rejects them, DTOs are class-validator annotated and
   auto-transformed.
5. `JwtAuthGuard` verifies the access JWT (15 min, carries `sub`, `role`,
   `estateId`, one-time `jti`) and attaches an `AuthUser` via the `@CurrentUser`
   decorator.
6. `RolesGuard` + `@Roles(...)` gate admin surfaces.
7. Controller → service → Prisma. Services never read raw headers.

## 3. Module organization

Feature-module per resource, each with `*.controller.ts` / `*.service.ts` /
`*.module.ts` / `dto/`:

```
auth  users  estates  household  announcements  meetings  projects  polls
rules  spotlights  complaints  notifications  reminders  dues  payments
wallet  finance  visitor-passes  utilities  push  voice  admin  analytics  health
src/common/    # JwtAuthGuard, RolesGuard/@Roles, CurrentUser decorator,
               # normalize-phone util, analytics service
src/database/  # global PrismaModule/PrismaService
```

Cross-module calls go through injected services (e.g. every notifying module
calls `PushService.sendToUsers`, which is the single choke point that filters
revoked accounts before fanning out).

## 4. AuthN/AuthZ design

- **Access token**: JWT, 15-minute TTL, `jti` recorded so logout can blacklist.
- **Refresh token**: separate JWT, 30-day TTL, purpose-claimed, **single-use** —
  rotation blacklists the presented token immediately and rotates the session's
  `jti` in place; a replayed token dies on first use.
- **Passwords & PINs**: argon2 hashed everywhere.
- **OTP reset**: 10-minute OTP, purpose-scoped single-use reset tokens.
- **Force reset**: every new account boots with `mustResetPassword`; the mobile
  wizard finishes through `POST /auth/complete-force-reset`, which also finalizes
  household invites (ACCEPTED + join date + access-code destruction).

## 5. Integration gateways (swappable provider pattern)

Every external dependency hides behind an interface so a real vendor can replace
a stub without touching call sites:

| Interface | Injection token | Active implementation | Swap-in |
|---|---|---|---|
| `PaymentGateway` | constructor injection in `payments` | **`MockPaystackGateway`** — "succeeds" ~1.4 s after initiation, no external account needed | Real Paystack client implementing the same interface |
| `PushGateway` (`PUSH_GATEWAY`) | `@Inject(PUSH_GATEWAY)` in `push.service` | **`FirebasePushGateway`** — firebase-admin `sendEachForMulticast`; logs per-token failures; **no-ops** when `FIREBASE_SERVICE_ACCOUNT_JSON` is unset while token registration keeps working | Any FCM sender |
| Utility vending providers | injected list `[VtpassProvider, BuypowerProvider]` in `utilities.service` | Ordered fallback chain: try VTpass first, fall back to BuyPower on failure; long per-request timeouts because real vends run ~20 s | Additional DISCO vendors appended to the list |

## 6. Third-party integrations

| Third party | Used for | Integration point | Configuration |
|---|---|---|---|
| **PostgreSQL** | Primary datastore | Prisma 7 with `@prisma/adapter-pg`, global `PrismaModule`; docker-compose exposes localhost:5433 (`POSTGRES_DB: mycove`) | `DATABASE_URL` |
| **Firebase Admin SDK** | Push delivery (`getMessaging().sendEachForMulticast`) and nothing else — tokens are registered by the mobile apps against the same project (`mycove-7f39c`) | `src/modules/push/gateway/firebase-push.gateway.ts` | `FIREBASE_SERVICE_ACCOUNT_JSON` (full service-account JSON); absent ⇒ pushes disabled by design |
| **Mixpanel** | Server-side product analytics ingest with common props (request id, environment, service name); never throws | `src/common/analytics/analytics.service.ts` | `MIXPANEL_TOKEN`; absent ⇒ disabled |
| **VTpass** | Electricity + airtime vending (primary), transaction-status webhooks back to `POST /utilities/callback/vtpass` (unique request-id idempotency) | `src/modules/utilities/providers/vtpass.provider.ts` | `VTPASS_BASE_URL`, `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, `VTPASS_SECRET_KEY` |
| **BuyPower** | Electricity vending fallback when VTpass fails | `src/modules/utilities/providers/buypower.provider.ts` | provider credentials |
| **Paystack (interface only)** | Payment processing contract for dues/levy/wallet top-ups | `PaymentGateway` interface | Currently satisfied by the mock — no live credentials |

Scheduled jobs live in-process via `@nestjs/schedule`:
- `meeting-reminder.service` — `@Interval(60_000)` scan for meetings starting
  soon → reminder push to invited residents.
- `reminders.service` — `@Cron('0 8 * * *')` daily 8 AM payment reminders, plus
  a manual `POST /reminders/send-all`.

## 7. Data model shape

All estate-scoped entities hang off `Estate`. Core identities and their
relations:

```
Estate ─┬─ User (role, house, mustResetPassword, duesLiable, invitedById,
        │        emergencyContactName/Phone, vehiclePlates, pinHash)
        ├─ HouseholdInvite (PENDING_ADMIN_APPROVAL → APPROVED → ACCEPTED/REJECTED,
        │        accessCode, acceptedUserId/At)
        ├─ Session / BlacklistedToken / DeviceToken
        ├─ Announcement · Meeting(+Report) · Project(+Pledge/Progress/Report)
        ├─ Poll(+Vote) · RulesSection · Spotlight · Complaint
        ├─ Levy · DuesMonth · WalletTransaction · Invoice
        ├─ VisitorPass · AccessLog
        └─ UtilityMeter · UtilityPurchase
```

Migrations under `prisma/migrations/`; `prisma/seed.ts` provisions the demo
"Palm Court Estate" (`PALM001`) with resident/guard/force-reset demo accounts.

## 8. Environment & configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (adapter-pg) |
| `JWT_SECRET` | Signing key for access/refresh/reset JWTs |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON enabling push sends |
| `VTPASS_BASE_URL/_API_KEY/_PUBLIC_KEY/_SECRET_KEY` | Vending provider creds |
| `MIXPANEL_TOKEN` | Server-side analytics |
| `PORT`, `NODE_ENV` | Listener port, environment label in events |

Everything degrades gracefully: unset Firebase/Mixpanel/VTPASS keys disable
those capabilities (with a startup log) instead of crashing boot.