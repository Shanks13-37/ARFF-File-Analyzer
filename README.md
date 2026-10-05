# ARFF File Analyzer

ARFF File Analyzer is a React, Express, and Prisma application for **Module 1.0: File Upload & Validation**. It lets normal users register, log in, and upload `.arff` files for validation, while administrators use the same login page and are automatically routed to the admin dashboard based on their stored role.

## Features

- User registration with name, email, organization, and password
- Duplicate email protection during registration
- Single login page for both users and admins
- JWT-based authentication
- Mandatory authenticator app two-step authentication for all accounts
- Role-based authorization for user and admin pages
- ARFF file upload validation
- 10 MB upload size limit
- Upload results stored in the database
- Activity logging for registrations, logins, admin actions, and upload validation
- Admin dashboard with recent activity metrics and logs
- Admin login detail management

## User Roles

The application uses one `User` model with a `role` field.

- `USER`: created through the public registration page. Users must finish authenticator setup before using the app and provide a code at each login.
- `ADMIN`: created through the seed script. Admins use the same `/login` page and must finish authenticator setup before accessing the admin dashboard.

Public registration always creates a `USER`. Admin accounts should be created only through the seed script or direct database administration.

Email addresses are normalized to lowercase during registration and login. The database enforces `email` as unique, and the registration API rejects duplicate emails with a `409` response.

## Page Flow

### User Flow

1. Open `/register` and create an account with your details.
2. Scan the authenticator setup QR code with a TOTP app and enter its current 6-digit code.
3. After setup is confirmed, the app signs you in and opens `/`.
4. Upload a `.arff` file from the user upload workspace.

Existing users can go directly to `/login`.

### Admin Flow

1. Seed the admin account with `npm run db:seed`.
2. Open `/login`.
3. Log in with the seeded admin email and password.
4. The backend detects that the account role is `ADMIN`.
5. If the admin has not configured 2FA, scan the setup QR code with an authenticator app.
6. Enter the 6-digit authenticator code.
7. After verification, the app redirects to `/admin`.

The admin dashboard is separate from the user upload page. It shows admin security controls, activity metrics, and recent activity logs.

## Pages

| Route | Access | Description |
| --- | --- | --- |
| `/register` | Public | Register a normal user account. |
| `/login` | Public | Log in as a normal user or administrator. |
| `/` | `USER` | Upload and validate ARFF files. |
| `/admin` | `ADMIN` | Admin dashboard, activity logs, and login settings. |

## API Endpoints

### Health

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Check whether the API is running. |

### Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create a user account and begin required authenticator setup. |
| `POST` | `/api/auth/login` | Public | Verify password, then require authenticator setup or issue a second-step challenge. |
| `POST` | `/api/auth/2fa/enable` | Short-lived setup session | Verify the setup code and finish account enrollment. |
| `POST` | `/api/auth/2fa/verify-login` | Short-lived challenge | Complete login with an authenticator code. |
| `GET` | `/api/auth/me` | Authenticated | Return the current signed-in user. |

### User Uploads

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/uploads/arff` | `USER` | Upload a file using multipart field `file`. |

### Admin

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/admin/login-details` | `ADMIN` | Update admin email/password or reset two-step authentication. |
| `GET` | `/api/activity-logs` | `ADMIN` | Read recent activity logs. |

## Project Structure

```text
api/          API route modules registered by the backend server
backend/      Express server setup, database client, and shared utilities
dist/         Production frontend build output
frontend/     React + Vite frontend app
prisma/       Prisma schema and seed script
```

Important files:

```text
api/auth.js                Registration, shared login, admin role detection, and 2FA setup
api/admin.js               Admin settings endpoint
api/activityLogs.js        Admin activity log endpoint
api/uploads.js             User ARFF upload endpoint
backend/index.js           Express application entry point
backend/utils/auth.js      JWT helpers and role guards
backend/utils/activity.js  Activity logging helper
frontend/src/main.jsx      Frontend routes and page components
frontend/src/styles.css    Frontend styling
prisma/schema.prisma       Database schema
prisma/seed.js             Admin seed script
```

## Environment Variables

Create `.env` from `.env.example`.

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Configure these values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/arff_analyzer?schema=public"
FRONTEND_ORIGIN="http://localhost:5173"
JWT_SECRET="replace-with-a-long-random-secret"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="ChangeMe123!"
PORT=4000
VITE_API_URL="http://localhost:4000"
```

Variable notes:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `FRONTEND_ORIGIN`: frontend origin allowed by CORS.
- `JWT_SECRET`: secret used to sign authentication tokens.
- `ADMIN_EMAIL`: email used by the admin seed script.
- `ADMIN_PASSWORD`: password used by the admin seed script.
- `PORT`: Express API port.
- `VITE_API_URL`: API URL used by the frontend.

Use a long, random `JWT_SECRET` in real deployments.

## Local Setup

### Docker Compose

Docker Compose can run PostgreSQL, the API, and the built frontend together:

```bash
docker compose up --build
```

Open `http://localhost:4000`. The app container waits for PostgreSQL, pushes the Prisma schema, seeds the admin account, and starts the Express server. Set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env` to override the Compose defaults.

Stop the services with:

```bash
docker compose down
```

The PostgreSQL data is kept in the `postgres_data` Docker volume.

### Manual Node.js Setup

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run db:generate
```

Push the schema to the configured PostgreSQL database:

```bash
npm run db:push
```

Seed the admin account:

```bash
npm run db:seed
```

Start the full development app:

```bash
npm run dev
```

By default:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

If port `5173` is already in use, Vite will automatically choose the next available port and print it in the terminal.

## Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start API and frontend together. |
| `npm run dev:api` | Start only the Express API with watch mode. |
| `npm run dev:web` | Start only the Vite frontend. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm run preview` | Preview the production frontend build. |
| `npm start` | Start the Express server. |
| `npm run db:generate` | Generate Prisma client code. |
| `npm run db:push` | Push Prisma schema changes to the database. |
| `npm run db:migrate` | Run deployed Prisma migrations. |
| `npm run db:seed` | Create or update the seeded admin account. |

## Database Models

### User

Stores both normal users and administrators.

Key fields:

- `name`
- `email`
- `organization`
- `passwordHash`
- `role`
- `twoFactorSecret`
- `twoFactorEnabled`

### Dataset

Stores uploaded dataset validation results.

Key fields:

- `originalName`
- `fileSize`
- `fileType`
- `valid`
- `errors`
- `userId` (the account that uploaded the dataset; older records remain unassigned)

### ActivityLog

Stores audit events.

Key fields:

- `userId`
- `action`
- `status`
- `ipAddress`
- `userAgent`
- `metadata`

### ContactMessage

Reserved for contact form messages.

## Authentication and Authorization Details

Passwords are hashed with `bcryptjs`.

JWT tokens are signed with `JWT_SECRET` and include:

- user id
- email
- role

Protected endpoints use authorization headers:

```http
Authorization: Bearer <token>
```

Role guards:

- `requireAuth`: any signed-in user
- `requireRole("USER")`: normal users only
- `requireAdmin`: administrators only

The upload endpoint requires the `USER` role. Users can retrieve only their own dataset history and activity logs; administrators can retrieve all records with their owner identity. Admin settings require the `ADMIN` role.

## Authenticator App Two-Step Authentication

Two-step authentication is mandatory for admins and regular users. New users configure it during registration. Existing accounts without a configured authenticator are prompted to enroll after password verification at their next login. Compatible apps include Google Authenticator and other TOTP clients.

The setup flow returns:

- a short-lived `setupToken`
- a QR code and manual setup key

After setup, a 6-digit time-based code is required after the account password at each login. Authenticated API requests also require a token issued after successful authenticator verification.

Admins can reset their authenticator setup from Admin Settings; they must complete setup again before their next login. Users cannot disable mandatory two-step authentication. Authenticator challenges and setup attempts are rate limited.

## Upload Validation Behavior

The app accepts one file through multipart form field `file`.

Validation rules:

- file must exist
- file name must end with `.arff`
- file size must be 10 MB or smaller

Successful uploads return `201`.

Invalid extensions return `422`.

Missing files return `400`.

Files larger than 10 MB return `413`.

Every upload attempt is logged in `ActivityLog`.

## Deployment Notes

Use a PostgreSQL provider such as Neon, Supabase, AWS RDS, Railway, Render Postgres, or another managed PostgreSQL host.

Deployment checklist:

1. Set all environment variables.
2. Run `npm install`.
3. Run `npm run db:generate`.
4. Run `npm run db:push` or `npm run db:migrate`.
5. Run `npm run db:seed` to create the admin account.
6. Run `npm run build`.
7. Start the server with `npm start`.

The Express server serves the production frontend from `dist/`, so after building, one server can serve both the API and the frontend.

## Troubleshooting

### Database URL still contains placeholders

If `DATABASE_URL` contains `USER`, `PASSWORD`, or `HOST`, Prisma cannot connect. Replace it with a real PostgreSQL connection string.

### Prisma generate fails on Windows with `EPERM`

This can happen when another Node process has Prisma files locked. Stop running dev servers, close terminals using the app, then run:

```bash
npm run db:generate
```

If only the client metadata needs refreshing, this can help:

```bash
npx prisma generate --no-engine
```

### API port is already in use

Port `4000` is already running another process. Stop that process or set a different `PORT` in `.env`.

### Frontend port is already in use

Vite will automatically choose another port and print the new URL in the terminal.

### Admin cannot access `/admin`

Make sure you are logging in through `/login` with an account whose database `role` is `ADMIN`.

### User cannot upload

Make sure you are logged in through `/login` or `/register` with a normal `USER` account. The upload endpoint rejects admin tokens by design.
# ARFF-File-Analyzer
