# Customer Inquiry Management System — Backend

REST API for the Coffee Ninja (Pvt) Ltd full-stack technical assessment. Authenticated staff members sign in, create customer inquiries, search and filter them, open a single inquiry, edit it, and move it through a status workflow. Every inquiry is **Public** (all staff) or **Private** (creator only), and that rule is enforced by the backend on every request.

The React frontend is in a separate repository: [customer-inquiry-frontend](https://github.com/Gihan302/customer-inquiry-frontend). Engineering decisions are explained in [DECISIONS.md](DECISIONS.md).

---

## Contents

1. [Technology stack](#1-technology-stack)
2. [Project structure](#2-project-structure)
3. [Prerequisites](#3-prerequisites)
4. [PostgreSQL setup](#4-postgresql-setup)
5. [Environment variables](#5-environment-variables)
6. [Migrations](#6-migrations)
7. [Seeding and staff accounts](#7-seeding-and-staff-accounts)
8. [Running the server](#8-running-the-server)
9. [API documentation](#9-api-documentation)
10. [Tests](#10-tests)
11. [Test accounts (local development)](#11-test-accounts-local-development)
12. [Known limitations](#12-known-limitations)

---

## 1. Technology stack

| Concern | Choice |
|---|---|
| Runtime / language | Node.js 20+ (developed on 24), TypeScript (strict) |
| Framework | Express 5 |
| Database | PostgreSQL (tested on 19) via `pg` — parameterized SQL, **no ORM** |
| Authentication | JWT (`jsonwebtoken`, HS256) in the `Authorization: Bearer` header |
| Password hashing | `bcryptjs` |
| Validation | Zod (requests and environment variables) |
| Security | Helmet, CORS (single allowed origin), 50 KB body limit |
| Testing | Jest + Supertest against a separate PostgreSQL test database |
| Config | dotenv |

## 2. Project structure

```
Backend/
├── src/
│   ├── config/         env.ts (validated config), database.ts (pg.Pool)
│   ├── routes/         URL → middleware → controller wiring
│   ├── controllers/    HTTP in/out only (no business logic)
│   ├── services/       business rules: access, status transitions, conflicts
│   ├── repositories/   all SQL (parameterized), incl. the Public/Private access rule
│   ├── middlewares/    auth (JWT), validate (Zod), requireJson, notFound, error
│   ├── validators/     Zod schemas for every request
│   ├── types/          shared types + Express Request augmentation (req.user)
│   ├── utils/          jwt, password, apiResponse, appError
│   ├── app.ts          builds the Express app (imported by tests)
│   └── server.ts       starts the app: DB check, listen, graceful shutdown
├── database/
│   ├── migrations/001_initial_schema.sql
│   ├── migrate.ts      migration runner
│   ├── seeds/seed.ts   initial staff accounts
│   └── scripts/create-staff.ts
├── tests/              auth.test.ts, inquiry.test.ts, health.test.ts, helpers
├── DECISIONS.md
└── README.md
```

Request flow: `route → authenticate → validate → controller → service → repository → PostgreSQL`, with every error ending in the central error middleware.

## 3. Prerequisites

- **Node.js 20 or newer** and npm — check with `node -v` and `npm -v`.
- **PostgreSQL** — developed and tested on version 19.

## 4. PostgreSQL setup

### Install and verify

- **Windows:** install from <https://www.postgresql.org/download/windows/> (the installer includes pgAdmin and `psql`). Remember the password you set for the `postgres` user. Verify the service is running:
  ```powershell
  Get-Service postgresql*
  & 'C:\Program Files\PostgreSQL\19\bin\psql.exe' --version   # adjust the version folder
  ```
  `psql` is not added to `PATH` by default; either use the full path as above or add `C:\Program Files\PostgreSQL\<version>\bin` to `PATH`.
- **macOS:** `brew install postgresql@17 && brew services start postgresql@17`
- **Linux (Debian/Ubuntu):** `sudo apt install postgresql && sudo systemctl start postgresql`

### Create the databases

Two databases are used: one for development and a **separate one for automated tests** (tests delete data, so they must never touch the development database).

Using `psql`:

```bash
psql -h localhost -U postgres -c "CREATE DATABASE customer_inquiry_db;"
psql -h localhost -U postgres -c "CREATE DATABASE customer_inquiry_test_db;"
```

Using **pgAdmin**: connect to your server (host `localhost`, port `5432`, user `postgres`) → right-click **Databases** → **Create → Database…** → name `customer_inquiry_db`. Repeat for `customer_inquiry_test_db`.

To connect and look around afterwards: `psql -h localhost -U postgres -d customer_inquiry_db`, then `\dt` (tables), `\d inquiries` (table structure), `\dT` (enum types), `\q` to quit.

## 5. Environment variables

```bash
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Then edit `.env`. **Never commit `.env`** — it is git-ignored; only `.env.example` is committed.

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `PORT` | no (5000) | `5000` | HTTP port |
| `NODE_ENV` | no (`development`) | `development` | `development`, `production` or `test` |
| `FRONTEND_URL` | yes | `http://localhost:5173` | The only browser origin allowed by CORS |
| `DB_HOST` | yes | `localhost` | PostgreSQL host |
| `DB_PORT` | no (5432) | `5432` | PostgreSQL port |
| `DB_NAME` | yes | `customer_inquiry_db` | Development database |
| `DB_USER` | yes | `postgres` | Database user |
| `DB_PASSWORD` | yes | — | Database password |
| `TEST_DB_NAME` | no | `customer_inquiry_test_db` | Test database; must differ from `DB_NAME` |
| `JWT_SECRET` | yes, ≥ 32 chars | — | Signs tokens. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | yes | `1h` | Token lifetime (`3600`, `15m`, `1h`, `7d`) |
| `BCRYPT_SALT_ROUNDS` | no (10) | `10` | bcrypt cost factor (4–15) |
| `SEED_STAFF_PASSWORD` | no | — | Password for seeded accounts (see §7) |

All variables are validated at startup (`src/config/env.ts`). A missing or invalid value stops the app with a message naming the variable — values are never printed:

```
Invalid environment configuration (check your .env file):
  - JWT_SECRET: JWT_SECRET must be at least 32 characters long
```

## 6. Migrations

```bash
npm install
npm run db:migrate         # development database (DB_NAME)
npm run db:migrate:test    # test database (TEST_DB_NAME)
```

The runner executes every `.sql` file in `database/migrations/` in filename order. `001_initial_schema.sql` creates:

- ENUM types `inquiry_status` (`New`, `In Progress`, `Resolved`) and `inquiry_visibility` (`Public`, `Private`)
- `users` and `inquiries` tables with `NOT NULL`, `UNIQUE`, `CHECK` (no blank text, lower-case emails) and foreign-key constraints
- **Relationship:** one user creates many inquiries — `inquiries.created_by → users.id` (`ON DELETE RESTRICT`)
- Indexes on `(visibility, created_at)`, `(created_by, created_at)`, `(status, created_at)` and `(created_at)` for the dashboard query

The migration is idempotent (safe to run repeatedly) and runs in a single transaction. To run it without Node instead:
`psql -h localhost -U postgres -d customer_inquiry_db -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql`

## 7. Seeding and staff accounts

There is **no public registration endpoint** by design.

```bash
npm run db:seed
```

Creates (or updates) `staff1@example.com` and `staff2@example.com`. Safe to run repeatedly — accounts are matched by email, never duplicated. Passwords are stored only as bcrypt hashes. The password comes from `SEED_STAFF_PASSWORD`, or the documented local default `Password123!`; the default is **refused** when `NODE_ENV=production`.

**Adding more staff** (requires server access, which is the access control):

```bash
npm run staff:create -- --name "Jane Perera" --email jane@example.com
```

A random password is generated and printed **once**, so it never appears in shell history. To choose it yourself, set the `STAFF_PASSWORD` environment variable for that command. Duplicate emails and invalid input are rejected.

## 8. Running the server

| Command | What it does |
|---|---|
| `npm run dev` | Development server with auto-restart (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (`node dist/server.js`) — use for production |
| `npm run typecheck` | Type-check everything (src, tests, scripts) |

On startup the server checks the database connection and **refuses to start** if it is unreachable:

```
[database] Connected to "customer_inquiry_db" (server time 2026-11-22T05:16:43.009Z)
[server] Listening on http://localhost:5000 (development)
```

Ctrl+C (SIGINT) or SIGTERM triggers a graceful shutdown: stop accepting connections, finish in-flight requests, close the database pool (forced exit after 10 s).

**Production:** set `NODE_ENV=production`, a strong `JWT_SECRET`, the real `FRONTEND_URL`, then `npm ci && npm run build && npm run db:migrate && npm start`. (`db:migrate` uses `tsx`, a dev dependency — run it from a full install or apply the SQL file with `psql`.)

Health check: `GET /api/health` → `200 {"success":true,"message":"API is running","data":{}}`.

## 9. API documentation

Base URL: `http://localhost:5000/api`. All bodies are JSON (`Content-Type: application/json`). All examples below are **real responses** captured from the running API (tokens shortened).

### Response format

```jsonc
// success
{ "success": true,  "message": "Inquiry created successfully", "data": { ... } }
// error
{ "success": false, "message": "Validation failed", "errors": [ { "field": "subject", "message": "Subject is required" } ] }
```

### Status codes used

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Validation failed, invalid id, invalid status transition, malformed JSON |
| 401 | Missing, invalid or expired token; wrong email/password |
| 404 | Inquiry does not exist **or** is another staff member's Private inquiry (indistinguishable on purpose) |
| 409 | Conflict — the inquiry changed since the client loaded it |
| 413 / 415 | Body larger than 50 KB / body is not JSON |
| 500 / 503 | Unexpected error / database unavailable (no internal details are returned) |

### Authentication

Protected endpoints require the header `Authorization: Bearer <token>`. The user's identity is taken **only** from the verified token — never from request bodies or URLs.

**Postman:** send the login request, copy `data.token`, then on other requests choose *Authorization → Bearer Token* and paste it (or set it once on a collection).

---

### `POST /api/auth/login`

Auth: none.

```json
{ "email": "staff1@example.com", "password": "Password123!" }
```

Email is trimmed and case-insensitive. **200:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": "1h",
    "user": { "id": 1, "name": "Staff One", "email": "staff1@example.com", "created_at": "2026-11-22T06:04:06.066Z" }
  }
}
```

Errors: **401** `Invalid email or password` (same message for unknown email and wrong password) · **400** validation:

```json
{ "success": false, "message": "Validation failed", "errors": [
  { "field": "email", "message": "Email must be a valid email address" },
  { "field": "password", "message": "Password is required" } ] }
```

### `GET /api/auth/me`

Auth: required. Returns the signed-in staff member. **200:**

```json
{ "success": true, "message": "Authenticated user retrieved successfully",
  "data": { "user": { "id": 1, "name": "Staff One", "email": "staff1@example.com", "created_at": "2026-11-22T06:04:06.066Z" } } }
```

Errors (**401**): `Authentication required. Provide a Bearer token.` · `Invalid token` · `Token has expired` · `Authorization header must be in the format: Bearer <token>`.

---

### Inquiry access rule

A staff member can see, open and change an inquiry when **`visibility = 'Public'` OR `created_by = <their user id>`**. This condition is part of every inquiry SQL query, so lists, counts, search, single reads and updates all obey it.

### `POST /api/inquiries`

Auth: required.

| Field | Rules |
|---|---|
| `customer_name` | required, 1–150 chars (trimmed) |
| `contact_info` | required, ≤ 150 chars, a valid **email or phone number** (7–15 digits; `+`, spaces, `-`, `()` allowed) |
| `subject` | required, 1–200 chars |
| `description` | required, 1–5000 chars |
| `visibility` | optional, `Public` (default) or `Private` |

`status` is always `New` and `created_by` comes from the token; sending `status`, `created_by` or any other unknown field is **rejected**.

```json
{ "customer_name": "John Silva", "contact_info": "0771234567", "subject": "Service Inquiry",
  "description": "Customer wants information about the service.", "visibility": "Public" }
```

**201:**

```json
{ "success": true, "message": "Inquiry created successfully", "data": { "inquiry": {
  "id": 1, "customer_name": "John Silva", "contact_info": "0771234567", "subject": "Service Inquiry",
  "description": "Customer wants information about the service.", "status": "New", "visibility": "Public",
  "created_by": 1, "created_at": "2026-11-22T06:38:04.149Z", "updated_at": "2026-11-22T06:38:04.149Z" } } }
```

Errors: **400** validation (one entry per invalid field):

```json
{ "success": false, "message": "Validation failed", "errors": [
  { "field": "customer_name", "message": "Customer name is required" },
  { "field": "contact_info", "message": "Contact info must be a valid email address or phone number" },
  { "field": "description", "message": "Description is required" } ] }
```

**400** unknown/forbidden field: `"Unknown field(s): status. Allowed fields: customer_name, contact_info, subject, description, visibility"` · **401**.

### `GET /api/inquiries`

Auth: required. Returns Public inquiries plus the caller's own Private ones, **newest first**.

| Query | Default | Rules |
|---|---|---|
| `page` | 1 | integer ≥ 1 |
| `limit` | 10 | integer 1–100 |
| `status` | — | `New`, `In Progress`, `Resolved` |
| `visibility` | — | `Public`, `Private` (Private = only your own) |
| `search` | — | ≤ 100 chars; case-insensitive match on customer name **or** subject (`%` and `_` are literal) |

Example: `GET /api/inquiries?page=1&limit=2&status=New&search=john` → **200:**

```json
{ "success": true, "message": "Inquiries retrieved successfully", "data": {
  "inquiries": [ { "id": 1, "customer_name": "John Silva", "contact_info": "0771234567", "subject": "Service Inquiry",
    "description": "Customer wants information about the service.", "status": "New", "visibility": "Public",
    "created_by": 1, "created_at": "2026-11-22T06:38:04.149Z", "updated_at": "2026-11-22T06:38:04.149Z" } ],
  "pagination": { "page": 1, "limit": 2, "total": 1, "total_pages": 1 } } }
```

Errors: **400** e.g. `?page=0&status=Closed`:

```json
{ "success": false, "message": "Validation failed", "errors": [
  { "field": "page", "message": "page must be at least 1" },
  { "field": "status", "message": "Status must be one of: New, In Progress, Resolved" } ] }
```

### `GET /api/inquiries/:id`

Auth: required. **200** `{ "success": true, "message": "Inquiry retrieved successfully", "data": { "inquiry": { ... } } }`.

Errors: **400** `{"field":"id","message":"Inquiry ID must be a positive integer"}` (e.g. `abc`, `0`, `1.5`) · **404** `Inquiry not found` — for ids that do not exist **and** for other staff members' Private inquiries, so their existence is not revealed.

### `PUT /api/inquiries/:id`

Auth: required; same access rule. Edits the four text fields (same rules as create; all four required). `status`, `visibility` and `created_by` **cannot** be changed here (400 if sent).

Optional `expected_updated_at`: the `updated_at` value the client last saw. If the inquiry changed since then, the update is refused with **409** instead of overwriting someone else's change.

```json
{ "customer_name": "John Silva", "contact_info": "john@example.com", "subject": "Service Inquiry (updated)",
  "description": "Customer wants pricing details.", "expected_updated_at": "2026-11-22T06:38:04.149Z" }
```

**200** `"Inquiry updated successfully"` with the updated inquiry (`updated_at` moves forward).
Errors: **400** validation · **404** not found/not accessible · **409**:

```json
{ "success": false, "message": "This inquiry was changed by someone else since you loaded it. Refresh to see the latest version and try again.", "errors": [] }
```

### `PATCH /api/inquiries/:id/status`

Auth: required; same access rule.

```json
{ "status": "In Progress" }
```

Allowed transitions (validated in the service layer):

```
New ──► In Progress ──► Resolved
            ▲               │
            └──── reopen ───┘
```

Requesting the current status is allowed and changes nothing.

| Case | Response |
|---|---|
| Valid change | **200** `"Inquiry status updated successfully"` + inquiry (`updated_at` moves forward) |
| Same status | **200** `"Inquiry status unchanged"` + inquiry |
| Not allowed (e.g. New → Resolved) | **400** `"Invalid status transition"`, `errors: [{"field":"status","message":"Cannot change status from 'New' to 'Resolved'"}]` |
| Unknown status | **400** `"Status must be one of: New, In Progress, Resolved"` |
| Changed concurrently by another request | **409** (compare-and-set update; nothing is overwritten) |
| Not found / not accessible | **404** |

**DELETE** is intentionally not implemented (see DECISIONS.md).

## 10. Tests

```bash
npm run db:migrate:test   # once: create the schema in the test database
npm test                  # 55 tests: auth, inquiries, health
npx jest tests/inquiry.test.ts   # a single file
```

Tests run against `TEST_DB_NAME` only. Three safeguards protect the development database: Jest forces `NODE_ENV=test`; the reset helper asks PostgreSQL which database it is connected to and refuses unless it is the configured test database **and** its name contains "test"; and the config rejects `TEST_DB_NAME == DB_NAME`. Each test starts from an empty database with fresh staff users.

Coverage includes everything the assessment lists — valid/incorrect login; missing, invalid and **expired** tokens; creating valid and invalid inquiries; Public visibility; **Private inquiries hidden from other staff, including by direct URL (Situation 3)**; creator access; updating Public vs. another user's Private inquiry; valid and invalid status transitions; invalid ids — plus 409 conflicts, search/filter/pagination, rejected client-controlled fields and body-format errors.

## 11. Test accounts (local development)

Created by `npm run db:seed`:

| Name | Email | Password |
|---|---|---|
| Staff One | `staff1@example.com` | `Password123!` |
| Staff Two | `staff2@example.com` | `Password123!` |

Log in as both (e.g. one in a private browser window) to see the Public/Private rules in action.

## 12. Known limitations

- **No real-time updates.** Another tab or colleague's change appears after a refresh (button, or automatically when the tab regains focus). Conflicting writes are detected (409), not silently lost. See DECISIONS.md.
- **No login rate limiting / account lockout** — would need an extra dependency (e.g. `express-rate-limit`) or a reverse proxy.
- **No token revocation.** Logging out removes the token from the browser, but the JWT stays valid until it expires (1 h). Refresh tokens / a deny-list were out of scope.
- **Staff names are not returned with inquiries** — only `created_by` (an id); the frontend shows "You" or "Colleague".
- **Search uses `ILIKE '%…%'`**, which cannot use the B-tree indexes; fine at this scale, a `pg_trgm` index would be needed for large data.
- **No delete, no password reset, no registration** — out of scope by the assessment brief.
- Single migration file and a simple runner (no down-migrations or migration history table).
