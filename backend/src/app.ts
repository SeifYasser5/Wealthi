import express from 'express'
import { resolve } from 'node:path'
import cors from 'cors'
import healthRouter from './routes/health'
import transactionsRouter from './routes/transactions'
import balancesRouter from './routes/balances'
import spendingRouter from './routes/spending'
import insightsRouter from './routes/insights'
import categoriesRouter from './routes/categories'
import merchantCategoriesRouter from './routes/merchant-categories'
import accountsRouter from './routes/accounts'
import accountSourcesRouter from './routes/account-sources'
import transferRulesRouter from './routes/transfer-rules'
import bankSendersRouter from './routes/bank-senders'
import importRouter from './routes/import'
import patternsRouter from './routes/patterns'
import schedulesRouter from './routes/schedules'
import manualTransactionsRouter from './routes/manual-transactions'

const app = express()

// These endpoints serve your full financial history with no authentication, so
// the allowed origins are an explicit list rather than "*": otherwise any page
// open in your browser could read them off localhost while the server runs.
// The Vite dev server proxies /api, so its requests are same-origin and never
// appear here; this list only covers a frontend served from another origin.
// Override with a comma-separated CORS_ORIGINS.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: CORS_ORIGINS }))
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/balances', balancesRouter)
app.use('/api/spending', spendingRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/merchant-categories', merchantCategoriesRouter)
app.use('/api/accounts', accountsRouter)
app.use('/api/account-sources', accountSourcesRouter)
app.use('/api/transfer-rules', transferRulesRouter)
app.use('/api/bank-senders', bankSendersRouter)
app.use('/api/import', importRouter)
app.use('/api/patterns', patternsRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/manual-transactions', manualTransactionsRouter)

// The public demo serves the built frontend from this same origin (see
// Dockerfile). In development Vite serves it instead and proxies /api here.
const STATIC_DIR = process.env.WEALTHI_STATIC_DIR
if (STATIC_DIR) {
  const indexHtml = resolve(STATIC_DIR, 'index.html')
  app.use(express.static(STATIC_DIR))
  // Client-side routes (/transactions, /balances, …) all load the app shell;
  // an unknown /api path stays a 404.
  app.get(/^\/(?!api(?:\/|$))/, (_req, res) => res.sendFile(indexHtml))
}

export default app
