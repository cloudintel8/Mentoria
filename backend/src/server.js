import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import courseRoutes from './routes/courses.js'
import quizRoutes from './routes/quizzes.js'
import resultRoutes from './routes/results.js'
import profileRoutes from './routes/profile.js'
import uploadRoutes from './routes/upload.js'
import assignmentRoutes from './routes/assignments.js'
import studentRoutes from './routes/student.js'
import notificationRoutes from './routes/notifications.js'
import { initializeDatabase } from './config/db.js'

const requiredEnv = ['JWT_SECRET']
const missingEnv = requiredEnv.filter((name) => !process.env[name])
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`)
  process.exit(1)
}

await initializeDatabase()
const app = express()
const port = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'CloudLearn API' }))
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/quiz', quizRoutes)
app.use('/api/results', resultRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/student', studentRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((req, res) => res.status(404).json({ message: 'API route not found.' }))
app.use((error, req, res, next) => {
  console.error(error)
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.message })
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
  res.status(500).json({ message: 'The server could not complete the request.' })
})

app.listen(port, () => console.log(`CloudLearn API running at http://localhost:${port}`))
