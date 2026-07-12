import express from 'express'
import cors from 'cors'
import healthRouter from './routes/health'
import transactionsRouter from './routes/transactions'
import balancesRouter from './routes/balances'
import spendingRouter from './routes/spending'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/balances', balancesRouter)
app.use('/api/spending', spendingRouter)

export default app
