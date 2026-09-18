# Wealthi

Turns bank SMS notifications (received as iMessages) into a structured financial
ledger: a local Postgres database of transactions, internal transfers and
monthly balance snapshots, with a small React reader on top.

Everything personal — your accounts, opening balances, merchant categories,
transfer rules and the SMS templates your banks use — lives in gitignored config
files. Nothing in this repo is specific to any bank or account.

## Requirements

- Node.js 20+ and npm
- Docker (for the Postgres container)
- macOS, with your bank SMS in Messages

## Setup

Run these from the repository root unless stated otherwise.

### 1. Install dependencies

The repo is an npm workspace (`shared`, `backend`, `frontend`), so one install
from the root covers all three. It needs npm 11 or newer. npm 10 crashes on this
dependency tree.

```bash
npm install
```

### 2. Create `backend/.env`

The backend needs `DATABASE_URL`. It is not created for you:

```bash
cat > backend/.env <<'ENV'
DATABASE_URL=postgresql://wealthi:wealthi_secret@127.0.0.1:5432/wealthi_db
ENV
```

Use `127.0.0.1` rather than `localhost`: the database is published on IPv4
loopback only, and `localhost` may resolve to IPv6 `::1` first and fail to
connect. If you change the credentials here, change them in `docker-compose.yml`
too (or set `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` in your
environment before starting the container).

### 3. Create your private config

```bash
cp backend/config/wealthi.example.json backend/config/wealthi.json
```

Then edit `backend/config/wealthi.json`. At minimum set:

- `bankSenders` — the sender ID each bank texts from, exactly as Messages shows
  it (a short name like `"MyBank"`, or a phone number)
- `accounts` — your own accounts, with an id, a display label and a currency
- `accountSources` — maps a bank-level source key (`"<bank>:<last 4 digits>"`)
  to one of your account ids
- `openingBalances` — the starting balance of each account

`merchantCategories`, `extraCategories`, `transferRules`,
`recurringTransactions`, `manualTransactions` and `csvImports` are optional and
can start empty. This file is gitignored and never leaves your machine.

### 4. Copy your iMessage database

```bash
mkdir -p backend/data
cp ~/Library/Messages/chat.db backend/data/chat.db
```

This needs Full Disk Access for your terminal
(System Settings → Privacy & Security → Full Disk Access). The copy is read
only — Wealthi never writes to it. Set `IMESSAGE_DB_PATH` to keep it elsewhere.

### 5. Start Postgres and create the schema

```bash
docker compose up -d
cd backend && npm run db:push
```

### 6. Learn your banks' SMS patterns

```bash
cd backend && npm run patterns:learn
```

This reads your messages and writes a pattern file per bank to
`backend/config/patterns/<bank>.json` (gitignored). New patterns are added
**disabled** — open each file, check that the extracted fields look right, and
set `"enabled": true` on the ones you want. Until a pattern is enabled its
messages are reported as parse errors and no transaction is created. Re-run this
command whenever a bank changes a template; your edits and flags are preserved.

### 7. Run it

```bash
cd backend  && npm run dev     # http://127.0.0.1:3000
cd frontend && npm run dev     # http://localhost:5173
```

The backend imports from `chat.db` on startup and prints a summary. The Vite dev
server proxies `/api` to the backend, so open the frontend URL.

## Environment variables

Only `DATABASE_URL` is required. All of these go in `backend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required) |
| `PORT` | `3000` | Backend port |
| `HOST` | `127.0.0.1` | Bind address. The API is unauthenticated — widen this only if you know what you are doing |
| `IMESSAGE_DB_PATH` | `backend/data/chat.db` | Where to read messages from |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |

## Common commands

```bash
# backend/
npm run dev              # dev server with hot reload
npm run patterns:learn   # re-learn SMS patterns from chat.db
npm run db:push          # sync the Prisma schema to Postgres
npm run db:studio        # browse the database
npm run lint
npm run format

# frontend/
npm run dev
npm run build
npm run lint
```

## Troubleshooting

**`Config not found at .../config/wealthi.json`** — step 3 was skipped.

**`Can't reach database server`** — the container is not up (`docker compose ps`),
or `DATABASE_URL` uses `localhost` instead of `127.0.0.1`.

**`No chat.db found ... skipping auto-import`** — step 4 was skipped, or the path
in `IMESSAGE_DB_PATH` is wrong.

**The import finds messages but stores nothing** — you have no enabled patterns
yet. Run `npm run patterns:learn` and enable the ones that look correct (step 6).

**`no account mapped for source "<bank>:1234"`** — add that key to
`accountSources` in `backend/config/wealthi.json`.
