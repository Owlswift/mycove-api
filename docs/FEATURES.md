# MyCove API — Feature Documentation

> NestJS 11 + Prisma 7 (PostgreSQL) · global prefix `/api` · service name
> `mycove-api` in health/analytics. Formerly **MyCove API**.
>
> Sibling docs: [`MyCove mobile app`](../../mycove/docs/FEATURES.md)
> · [`MyCove admin dashboard`](../../mycove-admin/docs/FEATURES.md)

Backend for the MyCove estate-management platform: resident app, guard app, and
admin dashboard all talk to this. Roles enforced via `JwtAuthGuard` +
`RolesGuard`: `RESIDENT`, `GUARD`, `ADMIN`, `FINANCE_SECRETARY`, `PROJECT_ADMIN`.

## 1. Auth & accounts (`/auth`)

- **Login** — phone + password; role-aware errors ("registered as a resident…");
  issues a 15-minute access token + single-use 30-day refresh token; records a
  `Session` row per mobile platform/device.
- **Forgot password flow** — `forgot-password` → `verify-otp` (10-minute OTP,
  dev-surfaced when configured) → `reset-password`; purpose-scoped reset tokens,
  single use with blacklisting.
- **Refresh rotation** — presented refresh token is blacklisted immediately and
  rotated; stolen-and-replayed tokens die on first use. Session rows rotate jti
  in place rather than duplicating.
- **Complete force reset** — the one call finishing every new account's setup:
  new password + optional profile fields (**full name, house, email, emergency
  contact name/phone, vehicle plates**) + clears `mustResetPassword`. For
  household invites this is also the "invitee actually logged in" moment: marks
  the invite ACCEPTED, stamps the join date, and destroys the one-time access code.
- **Sessions & logout** — list sessions for the account, revoke any device;
  logout blacklists both tokens and deletes the session row.
- **Transaction PIN** — `pin/set` (argon2-hashed) and `pin/verify`.

## 2. Users self-service (`/users`)

- `GET me` — full profile projection: identity, house, email,
  **emergencyContactName/Phone**, vehicle plates, initials, `mustResetPassword`,
  `hasPin`, estate info, dues liability, inviter name.
- `PATCH me` — self-service edit of **email and emergency-contact
  name/phone only** (empty string clears). Identity fields (phone, fullName,
  house, role, duesLiable) are deliberately immutable here — they're
  estate-managed data owned by admin/invite flows.

## 3. Estates

- `GET /estates/:code` — public lookup powering the app's estate-code gate
  (name, address, managed-by, media, resident count).
- `GET /estates/emergency-contacts` — security-desk + management office phones
  shown on the resident SOS screen; requires only a valid token, since callers
  are mid-emergency, not proving identity depth.
- Admin `GET/PATCH /estates/admin/emergency-contacts` — configure those numbers.

## 4. Household management

Resident-facing:
- Invite another person into the household by name+phone (inviter-only policy —
  an invited member can't chain invites); generates a shareable one-time
  **8-char access code** from a look-alike-safe alphabet.
- List pending invites (with codes) and joined members (who joined, when).

Admin approval (`/admin/household-invites`):
- Approve → **immediately provisions the invitee's account**: inherits the
  inviter's house, gets the access code as argon2-hashed password,
  `mustResetPassword`, `duesLiable: false`, and is linked as the invitee of the
  inviter (no second dues obligation for the household).
- Reject pending invites; view all members across the estate.

## 5. Content & community

- **Announcements** — paginated list, rich detail (markdown/media), per-user
  read receipts; admin publish.
- **Meetings** — list/detail for residents; admin authoring. A dedicated
  reminder service schedules meeting-reminder pushes.
- **Projects** — list/detail with progress and funding; pledges: make a pledge,
  view my pledges; admin: create/update/delete projects, post progress updates
  and reports, send pledge reminders, mark pledges fulfilled.
- **Polls** — active polls, one vote per resident; admin creates polls.
- **Rules** — sectioned community rules for residents; admin CRUD.
- **Spotlights** — current dashboard banner + archive; admin create/toggle/delete.

## 6. Money

- **Dues & levies** — resident dues status (months paid/owing), estate-wide
  owing summary (finance view), levy records, levy payment initiation.
  Household-invited members carry `duesLiable: false` so billing stays on the
  household's primary account.
- **Payments** — `initiate` → `verify/:reference` → receipt media, powered by
  `MockPaystackGateway` (~1.4s simulated success); swap in the real gateway
  behind the same `PaymentGateway` interface.
- **Wallet** — balance and transaction history.
- **Finance suite (admin)** — financial summary, fund allocation to projects,
  project budgets, dues ledger with per-resident payment recording,
  configurable dues rate, levy lifecycle + per-resident levy payments, invoice
  review with approve/reject.

## 7. Operations

- **Visitor passes** — resident create/list/detail/revoke (each pass carries an
  auto fallback code for manual entry); guard endpoints verify a scanned/code
  pass and record entry/exit; estate-wide access log feed.
- **Complaints** — resident submit/list; admin review all complaints and move
  them through a status workflow.
- **Notifications** — DB-backed in-app feed, mark-all-read; every business event
  that notifies also fans out through the push service.
- **Reminders** — manual `send-all` broadcast plus scheduled crons (daily
  payment reminders, meeting reminders).
- **Push** — `register-token` / `unregister-token` upsert into `DeviceToken`
  (unique on token, keyed user+estate+platform); sends go through
  `FirebasePushGateway` (`sendEachForMulticast` via firebase-admin) using
  `FIREBASE_SERVICE_ACCOUNT_JSON`; without it the gateway logs once and no-ops
  while registration keeps working.
- **Utilities** — saved meters, DISCO catalogue, meter verification (live
  name/address lookup), electricity purchase and airtime purchase through VTpass
  with BuyPower fallback (extended timeouts), purchase history, VTpass webhook
  callback endpoint.
- **Voice** — `prepare` generates spoken answers for purchase/balance/history
  intents (e.g. "Your MyCove balance is ₦…"); `logs` ingests batched on-device
  interaction logs (transcript + parser trail) for offline analysis.

## 8. Platform

- **Analytics** — Mixpanel ingest wrapper attaching request id, environment, and
  `service: 'mycove-api'` to every backend event; never throws.
- **Health** — liveness probe reporting status + service name + timestamp.
- **Cross-cutting** — global ValidationPipe (whitelist + forbid non-whitelisted),
  25 MB JSON limit for base64 media, CORS open to admin origin, request-scoped
  Prisma service.

## 9. Data model highlights

| Model | Notes |
|---|---|
| `User` | phone-unique identity; `mustResetPassword`, `duesLiable`, `invitedById`, `emergencyContactName/Phone`, `vehiclePlates`, `pinHash`, estate + role relations |
| `HouseholdInvite` | lifecycle `PENDING_ADMIN_APPROVAL → APPROVED → ACCEPTED` / `REJECTED`; carries the one-time access code and accepted user/date |
| `Session` / `BlacklistedToken` | per-device sessions with jti rotation; revoked-token registry |
| `DeviceToken` | FCM tokens, unique per token, keyed to user+estate+platform |
| Estate-scoped entities | announcements, meetings (+reports), projects (+pledges/progress/reports), polls(+votes), rules, spotlights, complaints, notifications, dues/levies/payments/wallet/invoices, visitor passes/access log, utility meters/purchases |

## 10. Module map

```
src/modules/
├── auth/          # login, OTP reset, force reset, sessions, PIN
├── users/         # me + self-service profile updates
├── estates/       # lookup + emergency-contact settings
├── household/     # resident invites + admin approval
├── announcements/ meetings/ projects/ polls/ rules/ spotlights/
├── dues/ payments/ wallet/ finance/
├── visitor-passes/ complaints/ notifications/ reminders/
├── push/          # controller + FirebasePushGateway
├── utilities/     # meters/discos/buy + vtpass callback
├── voice/         # prepare + logs
├── admin/         # user provisioning, reset-password, revoke/restore
├── analytics/     # Mixpanel ingest
└── health/
prisma/schema.prisma + seed.ts   # demo estate "Palm Court" (PALM001)
```

## 11. Recent changes

1. **Rebrand to `mycove-api`** — package name, health/analytics service
   identifiers, push/reminder notification titles ("MyCove"), voice-assistant
   speech ("Your MyCove balance is…"), startup log line, docs.
2. **Docs/comments aligned with the onboarding emergency-contact step** — the
   household-invite and users-service comments no longer claim invited members
   skip profile completion; they now reflect that everyone captures an emergency
   contact in the force-reset wizard while identity fields stay estate-managed.
3. **`emergency_contact_updated`** added to the analytics event dictionary.
4. `.env.example` dev secret placeholder renamed (`mycove-dev-secret`); database
   and docker identifiers intentionally unchanged.