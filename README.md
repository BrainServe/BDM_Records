# Brain Serve — Institution & Course Directory

A React.js + Spring Boot + PostgreSQL administrative directory with dynamic sections and Brain Serve branding. The **login form is on the right** of the photo-backed authentication screen; the uploaded company logo and wordmark appear on both the login and dashboard, and the icon is used for the favicon.

**No sample business data is seeded.** Flyway creates tables and constraints only. IT, Government, and Higher Education are optional *form presets* on an empty workspace, not fixed sections or inserted records.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, JavaScript, Lucide icons, responsive CSS |
| Backend | Java 21, Spring Boot 4.1.3, Spring Security, Jakarta Validation |
| Database | PostgreSQL 17, Spring Data JPA, JDBC, Flyway SQL migrations |
| Identity | BCrypt 12, default 15-minute signed JWTs, 7-day opaque rotating HttpOnly refresh cookies, refresh-family replay protection |
| PDF | Apache PDFBox 3.0.8, authenticated server-side export, A4 landscape, pagination |
| Testing | Node built-in test runner, JUnit tests, live API smoke script, Playwright real-browser workflows and CI definitions |

## 1. Start PostgreSQL

At the project root, copy `.env.example` to `.env`, replace the database password, then run:

```bash
docker compose up -d db
```

Or supply an existing PostgreSQL installation and database named `institution_directory`. Database URLs, usernames, and passwords belong in **backend environment variables**, not in frontend JavaScript.

## 2. Configure and launch the backend

Create `backend/.env` from `backend/.env.example`. **Set these values before the first launch:**

| Variable | Purpose |
|---|---|
| `DB_URL` | JDBC URL for your PostgreSQL database |
| `DB_USERNAME` / `DB_PASSWORD` | Dedicated database login; never commit these |
| `JWT_SECRET_BASE64` | Strong Base64-encoded secret, at least 32 random decoded bytes |
| `ADMIN_SETUP_KEY` | **Mandatory private initial-admin setup key, 20 or more characters** |
| `FRONTEND_ORIGIN` | The exact allowed browser origin; e.g. `http://localhost:5173` |
| `COOKIE_SECURE` | Defaults to **true**; set `false` explicitly only for local HTTP development; `prod` profile refuses false |
| `PDF_FONT_PATH` | Optional absolute path to an installed TrueType font; recommended for Unicode data |
| `JWT_ACCESS_SECONDS` | Defaults to 900 seconds; can be lowered in isolated integration tests |

Generate different secrets (macOS/Linux or Git Bash):

```bash
openssl rand -base64 48  # use output for JWT_SECRET_BASE64
openssl rand -hex 24     # use output for ADMIN_SETUP_KEY
```

**`.env` is not auto-loaded by Spring Boot.** Export variables in the same terminal before running Maven:

```bash
cd backend
set -a; source .env; set +a
mvn spring-boot:run
```

Windows PowerShell:

```powershell
cd backend
Get-Content .env | Where-Object { $_ -match '^[A-Za-z_][A-Za-z_0-9]*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
mvn spring-boot:run
```

Flyway applies `V1__create_schema.sql`. The backend uses Hibernate `ddl-auto: validate`, not `create` or `update`.

## 3. Launch the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` to `http://localhost:8080`. Only the server stores JWT signing secrets. To create the *first* administrator, enter the username, a password of 12 or more characters, and the **private `ADMIN_SETUP_KEY`** on the setup screen. Setup becomes unavailable after the first user is created.

## 4. Feature walkthrough

1. **Sections:** Create, rename, configure or delete any number of sections. Form presets include IT (Institute/Course), Government (Institute/Course), and Higher Education (Country/Consultant). No preset inserts business data.
2. **Records:** Create a row in the current or another section; edit its name and all amounts, or delete it. Selection checkboxes support multi-row deletion and clearing amounts.
3. **Dynamic columns:** Add, rename, and delete course/consultant columns, including multiple selected columns. Any number of columns can be used; tables scroll horizontally rather than squeezing values.
4. **Amounts:** Click any cell to edit; clear an amount by leaving it blank. Whole-grid edit can save multiple values. Amounts are validated to `NUMERIC(16,2)` and sent as exact decimal **strings**, avoiding floating-point currency rounding.
5. **Pagination, search and sort:** Browse **10, 25, 50 or 100 rows per page** using first/previous/next/last controls with accurate row numbering. Sorting and text search apply to all rows before paging, and a changed filter resets to page one. The total row count and current matching count remain visible. Select-all checks only the current page, while already selected rows on other pages remain selected for bulk operations.
6. **Exports:** **Export PDF** downloads an authenticated PDF of the **entire selected section**, not merely the search-filtered rows. The server repeats column headers, paginates long data sets and splits wide tables into groups of up to five course/consultant columns. **Export CSV** preserves full cell text and escapes spreadsheet formulas. **Print** uses the browser print dialog, temporarily renders all filtered rows rather than only the visible page, and restores the paginated view afterward.
7. **Safety:** Deletions and clearing operations require confirmation. Section switching warns about unsaved whole-grid changes; failed requests display errors. JWT access tokens remain in JS memory, refresh cookies are HttpOnly, and logout revokes server sessions.

### PDF international text and layout

The server tries a locally installed TrueType font (common Windows/macOS/Linux paths), falling back to PDF standard fonts if none is found. Set `PDF_FONT_PATH` to a suitable **locally installed TrueType font** if names use Indian languages or other non-Latin scripts. Fonts are not bundled with this source archive. When a font lacks a character, the PDF replaces that character; extremely long table labels may be shortened to fit column widths. CSV is the lossless alternative for long text.

## 5. Run tests

Frontend regression tests (authorization, refresh, PDF binary responses, CSV escaping, validation, exact decimals, batching, pagination boundaries and page clamping):

```bash
cd frontend
npm test
npm run build
npm audit --audit-level=high
```

Backend compilation and JUnit tests (JWT and setup checks, PDF creation/pagination):

```bash
cd backend
mvn verify
```

For **live endpoint tests**, start Spring Boot against a **development or disposable test database** with an existing administrator. From the project root:

```bash
SMOKE_USERNAME=your-admin SMOKE_PASSWORD=your-password node scripts/smoke-test.mjs
```

The smoke script creates a uniquely named temporary section, exercises create/list/edit/delete for sections, rows and columns, single/bulk cell editing, value clearing, PDF generation, invalid JWT rejection, refresh rotation and logout, and removes the temporary section. It refuses remote servers unless `ALLOW_REMOTE_TEST=YES` is explicitly supplied. **Never run this destructive test on production data.** On Windows PowerShell, set environment variables with `$env:SMOKE_USERNAME=...` and `$env:SMOKE_PASSWORD=...`.

`.github/workflows/verify.yml` is included for CI: frontend tests/build/audit; Java compilation/JUnit; and a disposable PostgreSQL instance for the live endpoint smoke test. It will run once the project is pushed to a GitHub repository with workflows enabled.

## 6. REST routes

Authentication: `GET /api/auth/status`; `POST /api/auth/setup`; `POST /api/auth/login`; `POST /api/auth/refresh`; `POST /api/auth/logout`; `GET /api/auth/me`.

All directory endpoints below require a valid `ADMIN` access JWT:

| Method | Route | Operation |
|---|---|---|
| `GET, POST` | `/api/sections` | List/create sections |
| `PATCH, DELETE` | `/api/sections/{sectionId}` | Edit/delete section |
| `GET` | `/api/sections/{sectionId}/matrix` | Get sections, rows, columns, values |
| **`GET`** | **`/api/sections/{sectionId}/export/pdf`** | **Download complete section as PDF** |
| `POST` | `/api/sections/{sectionId}/records/with-values` | Add row and amounts |
| `PATCH` | `/api/sections/{sectionId}/records/{recordId}/with-values` | Edit row and amounts |
| `POST` | `/api/sections/{sectionId}/records` | Add row |
| `PATCH, DELETE` | `/api/sections/{sectionId}/records/{recordId}` | Rename/delete row |
| `POST` | `/api/sections/{sectionId}/records/bulk-delete` | Delete selected rows (max 5,000/request) |
| `POST` | `/api/sections/{sectionId}/records/clear-values` | Clear selected rows' values (max 5,000/request) |
| `POST` | `/api/sections/{sectionId}/items` | Add dynamic column |
| `PATCH, DELETE` | `/api/sections/{sectionId}/items/{itemId}` | Rename/delete column |
| `POST` | `/api/sections/{sectionId}/items/bulk-delete` | Delete selected columns (max 5,000/request) |
| `PUT` | `/api/sections/{sectionId}/cell` | Edit/clear one amount |
| `PATCH` | `/api/sections/{sectionId}/cells` | Edit up to 5,000 amounts/request atomically |
| `DELETE` | `/api/sections/{sectionId}/values` | Clear all amounts; preserve rows/columns |

Bulk-edit and multi-delete submissions use **one atomic transaction each**, limited to 5,000 affected cells/IDs. The API rejects stale values and names with HTTP 409 instead of blindly overwriting the data. The table is **client-side paginated**: only one page is rendered, but the frontend still fetches the full matrix to support full-grid editing, cross-page selection and complete CSV exports. **Server-side query pagination is not yet implemented** and is recommended for large directories. PDF generation rejects sections containing more than 12,000 potential cells (use CSV for large exports).

## 7. Database architecture

Exactly **three business JPA entities plus a login entity**: `CatalogRecord`, `CatalogItem`, `CatalogAmount`, `AppUser`. Configuration sections (`catalog_sections`) and refresh sessions (`refresh_sessions`) are SQL-managed tables rather than additional JPA business entities. Foreign keys cascade deletes, unique constraints guard duplicates and amount values must be nonnegative. All SQL inputs are parameterized, and Flyway **does not insert** any institutions, courses, users, countries, consultants or section data.

## 8. Security and production precautions

- Keep `.env` out of version control. Set `COOKIE_SECURE=true` with HTTPS and deploy behind a trusted TLS reverse proxy. Never use example passwords or test keys in production.
- Before exposing initial setup, generate a private `ADMIN_SETUP_KEY`; the server refuses to create an administrator when it is absent or too short.
- Origin/Fetch-Metadata checks guard cookie-based actions. Browser requests must originate from your configured trusted site. CORS is restricted to `FRONTEND_ORIGIN`; no wildcard origins.
- Refresh tokens are random, SHA-256 hashed in the database, rotated and revoked on logout. JWTs are version-checked against the user record. Passwords are BCrypt hashes, not reversibly encrypted.
- The in-process login rate limiter is bounded but **is not shared across multiple application instances**; use API-gateway/Redis throttling for clustered deployments.
- Browser tabs coordinate refresh through Web Locks where supported. The backend rejects rotation races without issuing another token; test on all target browsers before multi-tab production rollout.
- PDF export responses are `no-store`, attachment-only and generated exclusively from authenticated sections. Use CSV for very long/unrepresentable Unicode text.
- Add deployment-appropriate database backups, monitoring, and audit logging before relying on this system for sensitive business operations.

## Verification limits for this delivery

In the authoring environment, **27 Node unit tests passed**, all Java files passed the JDK parser syntax check, frontend JavaScript/JSX passed the TypeScript parser check, and the assets/archive were inspected. The environment cannot reach the npm registry and does not provide Maven/PostgreSQL, so **the Java dependency build, backend JUnit execution, browser E2E checks, live smoke script and PDF endpoint runtime were NOT run here**. The Playwright test origin has been aligned with `FRONTEND_ORIGIN=http://localhost:5173`. Pagination E2E scenarios have been added but not run locally. The supplied CI workflow and smoke script are intended to close those verification gaps on your machine or CI runner. See `VALIDATION.md` for the exact status.

## Security and deployment hardening (November 2026)

- **TLS required in production:** Start the backend with `SPRING_PROFILES_ACTIVE=prod`, `FRONTEND_ORIGIN=https://your-domain`, and `COOKIE_SECURE=true`. With the production profile, startup rejects HTTP frontend origins, insecure cookies, and missing initial setup keys. The local `backend/.env.example` intentionally sets `COOKIE_SECURE=false` for localhost only.
- **Refresh-token replay handling:** Refresh sessions have a family ID (`V2__session_family.sql`). Within an 8-second rotation race window, old tokens receive HTTP 409 (no new token is issued); a later replay revokes the family and increments the access token version. The frontend serializes refresh across same-origin tabs where the Web Locks API is available, and broadcasts logout to other tabs.
- **CSP and secure headers:** Backend responses include a restrictive API CSP; `frontend/public/_headers` configures frontend CSP and frame/microphone/camera restrictions for static hosts supporting `_headers` (e.g., Netlify). If using Nginx, Apache or another host, set equivalent headers at the proxy. Review them with real browser security scans before production.
- **Concurrency:** Section-level row locks serialize mutations, and edit requests send `expectedAmount`/`expectedName`. A stale value or name results in 409 and the complete transaction rolls back. Editing the whole grid disables destructive actions until save/cancel.
- **No silent large-batch partial commits:** Each grid save or multi-delete is one request/transaction with maximum 5,000 entries. If the limit is reached, the UI asks for smaller edits instead of silently committing multiple batches.
- **Supply chain:** This archive **does not include a verified npm lockfile** because the npm registry could not be reached in the build environment. On a networked development machine, run `cd frontend && npm install --package-lock-only --ignore-scripts && npm ci && npm audit --audit-level=high`, then **commit the generated `package-lock.json`**. The CI workflow currently resolves an ephemeral lockfile, then runs `npm ci` and `npm audit`. Until the generated lockfile is checked in and the audit has passed, this is **not a reproducible production release**. Dependabot configuration is included for npm, Maven and GitHub Actions.

## Real end-to-end browser tests

The Playwright scenarios exercise a **running React application with a real Spring Boot API and disposable PostgreSQL database**, rather than mocks. They cover login, session refresh after an HTTP 401, logout, section creation and deletion, row/column creation and rename, complete record editing, single amount edits, bulk edit, multi-row and multi-column deletion, CSV/PDF downloads, and 390px mobile navigation/layout.

1. Prepare a **disposable database**, start PostgreSQL and Spring Boot, and create a test-only administrator. Never execute the test suite against production data.
2. From `frontend`, run `npm install`, `npx playwright install chromium`, and `E2E_USERNAME=... E2E_PASSWORD=... npm run test:e2e` (PowerShell uses `$env:` variables).
3. Inspect the Playwright HTML/trace artifacts and screenshots for failed cases. The GitHub Actions workflow is configured to run these checks automatically after starting the disposable backend.

**Local verification limitation:** The archive was generated in an offline environment without Maven or installed React/Vite/Playwright npm packages. Java/JSX source parsing and **27 passing Node regression tests** were run, but **Maven compile, Vite build, online security audit, live PostgreSQL API and real browser E2E have not run locally**. Treat those as release gates, not as passed tests.

## Remaining follow-ups

Server-side pagination for very large matrices (the UI now has client-side pagination), a distributed login rate limiter, persisted per-change audit history/undo, font-coverage validation for PDF exports, and production proxy CSP/TLS verification are not included in this revision. These should be planned before high-volume or multi-node production deployment.
