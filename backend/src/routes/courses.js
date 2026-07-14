import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { pool } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      id,
      title,
      code,
      description,
      instructor,
      duration,
      level,
      progress,
      color,
      material_link AS materialLink,
      video_link AS videoLink
    FROM courses
    ORDER BY created_at DESC
  `)

  res.json(rows)
})

router.post('/', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const { title, description, materialLink, videoLink, code, instructor, duration, level } = req.body
  if (!title?.trim() || !description?.trim()) return res.status(400).json({ message: 'Course title and description are required.' })

  const course = {
    id: randomUUID(),
    title: title.trim(),
    description: description.trim(),
    materialLink: materialLink || '',
    videoLink: videoLink || '',
    code: code?.trim() || `CRS-${Date.now().toString().slice(-4)}`,
    instructor: instructor?.trim() || req.user.name,
    duration: duration?.trim() || 'Self-paced',
    level: level?.trim() || 'All levels',
    progress: 0,
    color: '#6558e8',
  }

  await pool.execute(
    `INSERT INTO courses
      (id, title, code, description, instructor, duration, level, progress, color, material_link, video_link, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      course.id,
      course.title,
      course.code,
      course.description,
      course.instructor,
      course.duration,
      course.level,
      course.progress,
      course.color,
      course.materialLink,
      course.videoLink,
      req.user.id,
    ],
  )

  res.status(201).json(course)
})

export default router
