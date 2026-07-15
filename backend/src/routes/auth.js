import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { createUser, findUserByEmail } from '../config/db.js'
import { presentUser } from '../services/s3.js'

const router = Router()

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '8h' })
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })

  const normalizedEmail = email.toLowerCase().trim()
  if (await findUserByEmail(normalizedEmail)) return res.status(409).json({ message: 'An account with that email already exists.' })

  const user = {
    id: randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    role: 'student',
    password: await bcrypt.hash(password, 10),
  }

  await createUser(user)

  res.status(201).json({ message: 'Registration successful.', token: issueToken(user), user: await presentUser(user) })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  const normalizedEmail = email?.toLowerCase().trim()
  const user = await findUserByEmail(normalizedEmail)

  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    return res.status(401).json({ message: 'Incorrect email or password.' })
  }

  res.json({ message: 'Login successful.', token: issueToken(user), user: await presentUser(user) })
})

export default router
