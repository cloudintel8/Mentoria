import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { listCourses, createCourse, updateCourse, deleteCourse } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

function buildCoursePayload(body, user, existing = {}) {
  const title = body.title?.trim()
  const description = body.description?.trim()
  if (!title || !description) return null

  return {
    title,
    description,
    materialLink: body.materialLink ?? existing.materialLink ?? '',
    videoLink: body.videoLink ?? existing.videoLink ?? '',
    code: body.code?.trim() || existing.code || `CRS-${Date.now().toString().slice(-4)}`,
    instructor: body.instructor?.trim() || existing.instructor || user.name,
    duration: body.duration?.trim() || existing.duration || 'Self-paced',
    level: body.level?.trim() || existing.level || 'All levels',
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : existing.progress ?? 0,
    color: body.color || existing.color || '#6558e8',
  }
}

router.get('/', async (req, res) => {
  res.json(await listCourses())
})

router.post('/', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const payload = buildCoursePayload(req.body, req.user)
  if (!payload) return res.status(400).json({ message: 'Course title and description are required.' })

  const course = {
    id: randomUUID(),
    ...payload,
    progress: 0,
  }

  await createCourse(course, req.user.id)

  res.status(201).json(course)
})

router.put('/:courseId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const existing = (await listCourses()).find((course) => course.id === req.params.courseId)
  if (!existing) return res.status(404).json({ message: 'Course not found.' })

  const course = buildCoursePayload(req.body, req.user, existing)
  if (!course) return res.status(400).json({ message: 'Course title and description are required.' })

  const updated = await updateCourse(req.params.courseId, course)
  res.json(updated)
})

router.delete('/:courseId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const removed = await deleteCourse(req.params.courseId)
  if (!removed) return res.status(404).json({ message: 'Course not found.' })
  res.json({ message: 'Course deleted successfully.' })
})

export default router
