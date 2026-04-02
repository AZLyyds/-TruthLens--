export const corsOptions = {
  origin(origin, callback) {
    const allowlist = [
      'http://localhost:5173',
      'https://truthlens.example.com',
    ]
    if (!origin || allowlist.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('CORS rejected'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400,
}
