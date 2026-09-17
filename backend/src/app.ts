import express from 'express'
import cors from 'cors'
import healthRouter from './routes/health'
import transactionsRouter from './routes/transactions'
import balancesRouter from './routes/balances'
import spendingRouter from './routes/spending'
import categoriesRouter from './routes/categories'
import accountsRouter from './routes/accounts'

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
app.use('/api/categories', categoriesRouter)
app.use('/api/accounts', accountsRouter)

export default app
