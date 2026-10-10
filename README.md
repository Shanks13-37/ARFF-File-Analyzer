# ARFF File Analyzer

A web application for uploading, validating, and analyzing ARFF datasets. It combines a React interface with an Express API and PostgreSQL storage, and includes role-based accounts, mandatory authenticator-app two-factor authentication, password recovery, and activity history.

## Features

- Parse and validate `.arff` files, including relation/attribute declarations and data rows.
- Analyze records for missing values, duplicate rows, attribute details, and related dataset statistics.
- Review analysis results in the browser and export reports.
- Keep a per-account dataset history and activity log; administrators can review system-wide history.
- Register user accounts and manage administrator accounts separately.
- Require a time-based one-time password (TOTP) from an authenticator app at sign-in.
- Recover an account password using its existing authenticator, then sign in immediately.
- Show regular users their last successful login time in account settings.

Uploaded file contents are processed in memory. The database stores the dataset name, size, validation result, and errors—not a copy of the original ARFF file.

## Stack

- Frontend: React, Vite
- Backend: Node.js, Express
- Database: PostgreSQL, Prisma ORM
- Authentication: bcrypt password hashing, signed JWT sessions, TOTP
- Deployment: Docker Compose

## Run with Docker Compose

Prerequisite: Docker Desktop (or Docker Engine) with Compose.

From the repository root:

```powershell
docker compose up --build
```

Open [http://localhost:4000](http://localhost:4000). Compose starts PostgreSQL, waits for its health check, applies the Prisma schema, seeds an administrator, and starts the app (API and frontend).

Optional: create a root `.env` file to set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before starting. Compose has development defaults; set your own strong values, especially before exposing the app beyond your machine. The seeded admin account must also enroll in an authenticator app at first sign-in.

To stop the services while retaining database data:

```powershell
docker compose down
```

PostgreSQL data is kept in the `postgres_data` volume. Avoid `docker compose down -v` unless you intentionally want to delete that database. To rebuild the app after changing code:

```powershell
docker compose up -d --build app
```

## Run locally without Docker

Prerequisites: Node.js 22 or later, npm, and a running PostgreSQL server.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create `.env` from the example and edit it for your local PostgreSQL credentials:

   ```powershell
   Copy-Item .env.example .env
   ```

   For a local database, `DATABASE_URL` should use `localhost` as the host. Keep `FRONTEND_ORIGIN=http://localhost:5173`, `PORT=4000`, and `VITE_API_URL=http://localhost:4000` for the default development ports. Set a strong, private `JWT_SECRET` and your desired admin seed credentials.

3. Generate the Prisma client, apply the schema, and seed the administrator:

   ```powershell
   npm run db:generate
   npm run db:push
   npm run db:seed
   ```

   Review Prisma’s output before applying schema changes to a database with existing data. Back up important data before any operation that warns about dropping columns or tables.

4. Start the API and frontend together:

   ```powershell
   npm run dev
   ```

   The frontend is normally at [http://localhost:5173](http://localhost:5173), and the API is at [http://localhost:4000](http://localhost:4000). The API health check is [http://localhost:4000/api/health](http://localhost:4000/api/health).

The services can also be started separately in two terminals with `npm run dev:api` and `npm run dev:web`. The API script runs Node directly; restart it after backend changes. Vite serves the frontend in development.

## First sign-in

1. Register a normal account at `/register`, or sign in using the administrator credentials configured for the seed script.
2. On first sign-in, scan the displayed QR code with a TOTP authenticator app (for example, Google Authenticator) and enter its current six-digit code.
3. On later sign-ins, provide the password and the current authenticator code.
4. Regular users can upload files from the user workspace. Administrators are directed to `/admin`.

Password recovery at `/forgot-password` uses the account email and its existing TOTP authenticator code. It does not send an SMS or email code. If the authenticator is lost, use an administrator-managed recovery process; this app currently has no separate authenticator recovery channel.

## Pages

| Path | Access | Purpose |
| --- | --- | --- |
| `/register` | Public | Create a regular user account and enroll its authenticator. |
| `/login` | Public | Sign in as a regular user or administrator. |
| `/forgot-password` | Public | Verify with TOTP, choose a new password, and sign in. |
| `/` | Regular user | Upload, validate, analyze, and review dataset history. |
| `/admin` | Administrator | Review activity and dataset history and manage admin login settings. |

## API overview

All protected routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | API health check. |
| `POST` | `/api/auth/register` | Public | Register a regular user and begin TOTP enrollment. |
| `POST` | `/api/auth/login` | Public | Verify credentials and begin the TOTP login step or enrollment. |
| `POST` | `/api/auth/2fa/enable` | Setup token | Confirm authenticator enrollment. |
| `POST` | `/api/auth/2fa/verify-login` | Login challenge | Complete sign-in with a TOTP code. |
| `POST` | `/api/auth/password-reset/verify-totp` | Public, rate-limited | Verify the account email and TOTP code. |
| `POST` | `/api/auth/password-reset/complete` | Reset token | Save a new password, invalidate earlier sessions, and sign in. |
| `GET` | `/api/auth/me` | Authenticated | Return the current profile and last successful login time. |
| `POST` | `/api/uploads/arff` | Regular user | Upload a file as multipart field `file`. |
| `GET` | `/api/datasets` | Authenticated | List the current user's history; admins can list all users' datasets. |
| `GET` | `/api/activity-logs` | Authenticated | List the current user's logs; admins can review system-wide logs. |
| `PATCH` | `/api/account/login-details` | Authenticated user | Update the current user's email or password. |
| `PATCH` | `/api/admin/login-details` | Administrator | Update admin login details or reset admin TOTP enrollment. |

## ARFF upload behavior

The upload accepts one file using multipart form field `file` and enforces a 10 MiB maximum. Empty files and non-`.arff` files are rejected. The parser validates ARFF structure and row values; analysis results include record and attribute information, missing values, duplicate records, and other summaries. A validation failure is returned with details and is still recorded in the dataset history when possible.

## Configuration

Copy `.env.example` to `.env` and configure the variables below. Do not commit real secrets.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `FRONTEND_ORIGIN` | Frontend origin allowed by the API's CORS policy. |
| `JWT_SECRET` | Secret used to sign session and short-lived authentication tokens. |
| `ADMIN_EMAIL` | Email for the administrator created by the seed script. |
| `ADMIN_PASSWORD` | Password for the seeded administrator; use a strong value. |
| `PORT` | Express server port (default `4000`). |
| `VITE_API_URL` | API URL embedded in the frontend build; empty uses same-origin API requests. |

In Docker Compose, the app connects to the database host `postgres` on the Compose network, and the built app is served at port `4000`. For local Node development, PostgreSQL is normally reached at `localhost:5432` and Vite at port `5173`.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and Vite frontend together. |
| `npm run dev:api` | Start the Express API. |
| `npm run dev:web` | Start the Vite development server. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm start` | Start Express, serving the built frontend and API. |
| `npm test` | Run unit, integration, and system tests. |
| `npm run db:generate` | Generate Prisma client code. |
| `npm run db:push` | Apply the Prisma schema to the configured database. |
| `npm run db:migrate` | Apply Prisma migrations (once migration files have been created and committed). |
| `npm run db:seed` | Create or update the configured admin account. |

Compose currently applies the schema with `prisma db push`. This repository does not include a Prisma migrations directory yet. Before adopting `db:migrate` for production, create and commit migration history, then use the deployment workflow appropriate for that database. Always back up production data before schema changes.

## Deployment checklist

The Express server serves the production frontend from `dist/`, so the app can be deployed as one service alongside PostgreSQL. Before deployment:

1. Provision PostgreSQL and configure `DATABASE_URL` with the provider's connection string.
2. Set a unique strong `JWT_SECRET`, secure admin seed credentials, `NODE_ENV=production`, `PORT`, and the allowed `FRONTEND_ORIGIN`.
3. Decide on a database migration process; do not use a development database push against production without reviewing its changes and backing up the data.
4. Install dependencies, generate Prisma client code, build the frontend with `npm run build`, and start the app with `npm start`.
5. Verify `/api/health`, create/seed an administrator securely, and enroll TOTP before normal use.

## Project layout

```text
api/                 Express route modules
backend/             Server setup, Prisma client, ARFF parser/analyzer, utilities
frontend/            React application and Vite configuration
prisma/              Database schema and admin seed script
test/                Unit, integration, and system tests
Dockerfile           Multi-stage production image build
docker-compose.yml   App and PostgreSQL services
```

## Security notes

- Passwords are hashed with bcrypt; sessions use signed JWTs.
- TOTP is required for both user and admin accounts.
- Password-reset grants are short-lived and single-use; completing a reset invalidates older sessions.
- Reset requires access to the account's authenticator. A lost authenticator cannot be recovered through email or SMS in the current implementation.
- Configure a unique, strong `JWT_SECRET` and strong admin credentials outside local development. Do not expose the sample Compose credentials publicly.

## Troubleshooting

**The app cannot connect to PostgreSQL:** Check that the database is running and `DATABASE_URL` is correct. Use host `postgres` from the Compose app container, but `localhost` from a local Node process. Compose waits for the database health check before starting the app.

**Prisma reports possible data loss:** Stop and inspect the proposed schema changes. Back up the database before proceeding; do not add `--accept-data-loss` unless you understand and accept the affected data loss.

**Port 4000 is already in use:** Stop the other service using port 4000 or change `PORT` and the frontend API URL consistently.

**Prisma generation fails with `EPERM` on Windows:** Another Node process may have locked Prisma's generated engine. Stop the app/dev servers, close terminals using the project, then run `npm run db:generate` again.

**Docker still shows old frontend code:** The frontend is baked into the app image and is not bind-mounted. Rebuild and recreate the app with `docker compose up -d --build app`, then hard-refresh the browser.

**Login is rejected after password reset:** Start a fresh login; completing a reset intentionally invalidates sessions issued before the reset.

**An admin cannot access `/admin`:** Confirm the account was seeded with role `ADMIN`, then sign in through `/login` and finish TOTP setup if prompted.
