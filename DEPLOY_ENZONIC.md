# Deploy Sparepart di Enzonic Deploy (source-based Node.js)

## Build and runtime
- Framework: Node.js / Express (source, not Docker)
- Build command: `npm run build`
- Start command: `npm start`
- Root directory: repository root
- Node.js: 20 or newer

The root `package.json` installs and builds both `server` and `client`.
The Express server serves `client/dist` and the API from the same origin.

## Environment variables
Set these in Enzonic Production environment:
- `NODE_ENV=production`
- `PORT` (use the platform-provided port; do not hardcode)
- `DB_HOST` (TiDB host)
- `DB_PORT=4000`
- `DB_USER` (TiDB username)
- `DB_PASSWORD` (TiDB password)
- `DB_NAME=sparepart_db`
- `DB_SSL=true`
- `AUTH_TOKEN_SECRET` (random secret, at least 64 characters)
- `OWNER_SETUP_KEY` only if a first-owner setup is still required; otherwise omit it.
- `CLIENT_ORIGIN` is not needed for same-origin production hosting; leave unset.

Do not commit `.env`. Never paste database credentials into GitHub or chat.

## Database safety
Do not run old migrations 002, 003, or 004 automatically. The existing TiDB database has already received parts of those schema changes. Back up first and inspect schema before applying any migration.
