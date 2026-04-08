import express from 'express'
import cors from 'cors'
import { corsOptions } from './cors.config.js'

const app = express()
app.use(express.json())
app.use(cors(corsOptions))

app.get('/api/v1/healthz', (_req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: { status: 'up' },
    requestId: 'example',
    ts: new Date().toISOString(),
  })
})

app.listen(3000, () => {
  console.log('TruthLens backend example listening on 3000')
})
