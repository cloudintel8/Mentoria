import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { pool } from '../config/db.js'

const router = Router()

function publicUser(user) {
  const { password, ...safeUser } = user
  return safeUser
}

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '8h' })
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })

  const normalizedEmail = email.toLowerCase().trim()
  const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail])
  if (existingUsers.length) return res.status(409).json({ message: 'An account with that email already exists.' })

  const user = {
    id: randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    role: 'student',
    password: await bcrypt.hash(password, 10),
  }

  await pool.execute(
    'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [user.id, user.name, user.email, user.password, user.role],
  )

  res.status(201).json({ message: 'Registration successful.', token: issueToken(user), user: publicUser(user) })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  const normalizedEmail = email?.toLowerCase().trim()
  const [rows] = await pool.execute(
    'SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail],
  )
  const user = rows[0]

  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    return res.status(401).json({ message: 'Incorrect email or password.' })
  }

  res.json({ message: 'Login successful.', token: issueToken(user), user: publicUser(user) })
})

export default router
