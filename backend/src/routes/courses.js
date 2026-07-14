import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { listCourses, createCourse, updateCourse, deleteCourse } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })
const allowedCoverTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function hasUsableS3Config() {
  const values = [process.env.AWS_REGION, process.env.AWS_S3_BUCKET, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY]
  return values.every((value) => value && !/placeholder|example|your-|change-me/i.test(value))
}

async function uploadCoverImage(file) {
  if (!file) return ''
  if (!allowedCoverTypes.has(file.mimetype)) {
    const error = new Error('Course cover must be a JPG, PNG, or WebP image.')
    error.statusCode = 400
    throw error
  }
  if (!hasUsableS3Config()) return `/icons.svg?course-cover=${encodeURIComponent(file.originalname)}`

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')
  const key = `courses/covers/${randomUUID()}-${safeName}`
  try {
    const client = new S3Client({ region: process.env.AWS_REGION })
    await client.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }))
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodedKey}`
  } catch (error) {
    console.warn(`Course cover upload fallback used: ${error.message}`)
    return `/icons.svg?course-cover=${encodeURIComponent(file.originalname)}`
  }
}

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
    category: body.category?.trim() || existing.category || 'Cloud',
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : existing.progress ?? 0,
    color: body.color || existing.color || '#6558e8',
    coverImageUrl: body.coverImageUrl ?? existing.coverImageUrl ?? '',
  }
}

router.get('/', async (req, res) => {
  res.json(await listCourses({ search: req.query.search, studentId: req.query.studentId }))
})

router.get('/:courseId', async (req, res) => {
  const course = (await listCourses()).find((item) => item.id === req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  res.json(course)
})

router.post('/', authenticate, allowRoles('admin', 'lecturer'), coverUpload.single('coverImage'), async (req, res, next) => {
  try {
    const payload = buildCoursePayload(req.body, req.user)
    if (!payload) return res.status(400).json({ message: 'Course title and description are required.' })
    const coverImageUrl = await uploadCoverImage(req.file)

    const course = {
      id: randomUUID(),
      ...payload,
      coverImageUrl: coverImageUrl || payload.coverImageUrl,
      progress: 0,
    }

    await createCourse(course, req.user.id)

    res.status(201).json(course)
  } catch (error) {
    next(error)
  }
})

router.put('/:courseId', authenticate, allowRoles('admin', 'lecturer'), coverUpload.single('coverImage'), async (req, res, next) => {
  try {
    const existing = (await listCourses()).find((course) => course.id === req.params.courseId)
    if (!existing) return res.status(404).json({ message: 'Course not found.' })

    const course = buildCoursePayload(req.body, req.user, existing)
    if (!course) return res.status(400).json({ message: 'Course title and description are required.' })
    const coverImageUrl = await uploadCoverImage(req.file)
    if (coverImageUrl) course.coverImageUrl = coverImageUrl

    const updated = await updateCourse(req.params.courseId, course)
    res.json(updated)
  } catch (error) {
    next(error)
  }
})

router.delete('/:courseId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const removed = await deleteCourse(req.params.courseId)
  if (!removed) return res.status(404).json({ message: 'Course not found.' })
  res.json({ message: 'Course deleted successfully.' })
})

export default router
