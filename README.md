# CommunityHub API

Backend for the [CommunityHub](../communityhub) Flutter app — an estate
management system ("Palm Court Estate") with a resident role (dashboard,
announcements, meetings, dues/payments, visitor passes, community projects,
polls, notifications, rules, complaints) and a security guard role
(scan/verify visitor passes, access log).

NestJS 11 + Prisma 7 (PostgreSQL) + hand-rolled JWT auth. Payments are backed
by `MockPaystackGateway` (see `src/modules/payments/gateway/`) — every
transaction "succeeds" ~1.4s after being initiated, no external account
needed. Swap in a real Paystack client behind the same `PaymentGateway`
interface when you're ready to go live.

## Setup

```bash
docker compose up -d          # Postgres on localhost:5433
npm install
npx prisma migrate dev        # create tables
npm run prisma:seed           # demo data + accounts
npm run start:dev             # http://localhost:3000/api
```

## Demo accounts

| Role     | Phone         | Password   |
| -------- | ------------- | ---------- |
| Resident | `08035550142` | `estate123`|
| Guard    | `08052229981` | `guard123` |
| Resident (forces a password reset on login) | `08099990000` | `temp1234` |

## Project layout

- `src/modules/<name>/` — one folder per resource: `<name>.controller.ts`,
  `<name>.service.ts`, `<name>.module.ts`, `dto/`.
- `src/common/` — `JwtAuthGuard` + `RolesGuard`/`@Roles()` (role-gate a route
  with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('RESIDENT' | 'GUARD')`),
  `CurrentUser` decorator.
- `src/database/` — `PrismaService`/`PrismaModule` (global).
- `prisma/schema.prisma`, `prisma/seed.ts`.

## Useful commands

```bash
npm run build        # tsc build
npm run lint         # eslint --fix
npx prisma studio    # browse the database
```
