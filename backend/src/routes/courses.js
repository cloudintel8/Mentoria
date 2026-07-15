import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { listCourses, findCourseById, createCourse, updateCourse, deleteCourse, listLessons, findLessonById, createLesson, updateLesson, deleteLesson, listAssignments, createAssignment, notifyCourseStudents } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'
import { presentCourse, uploadPrivateFile } from '../services/s3.js'

const router = Router()
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
const allowedCoverTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function s3KeyFromUrl(value) {
  if (!value || typeof value !== 'string' || !value.includes('.amazonaws.com/')) return ''
  try { return decodeURIComponent(new URL(value).pathname.replace(/^\/+/, '')) } catch { return '' }
}

async function uploadCourseFile(file, prefix) {
  if (!file) return ''
  if (prefix === 'courses/covers' && !allowedCoverTypes.has(file.mimetype)) {
    const error = new Error('Course cover must be a JPG, PNG, or WebP image.')
    error.statusCode = 400
    throw error
  }
  try {
    return await uploadPrivateFile(file, prefix) || ''
  } catch (error) {
    console.warn(`Course file upload fallback used: ${error.message}`)
    return ''
  }
}

function buildCoursePayload(body, user, existing = {}) {
  const title = body.title?.trim()
  const description = body.description?.trim()
  if (!title || !description) return null

  const materialLink = body.materialLink ?? existing.materialLink ?? ''
  const videoLink = body.videoLink ?? existing.videoLink ?? ''
  return {
    title,
    description,
    materialLink: s3KeyFromUrl(materialLink) ? '' : materialLink,
    videoLink: s3KeyFromUrl(videoLink) ? '' : videoLink,
    code: body.code?.trim() || existing.code || `CRS-${Date.now().toString().slice(-4)}`,
    instructor: body.instructor?.trim() || existing.instructor || user.name,
    duration: body.duration?.trim() || existing.duration || 'Self-paced',
    level: body.level?.trim() || existing.level || 'All levels',
    category: body.category?.trim() || existing.category || 'Cloud',
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : existing.progress ?? 0,
    color: body.color || existing.color || '#6558e8',
    coverImageKey: body.coverImageKey && !s3KeyFromUrl(body.coverImageKey) ? body.coverImageKey : s3KeyFromUrl(body.coverImageKey) || existing.coverImageKey || '',
    materialFileKey: body.materialFileKey || s3KeyFromUrl(materialLink) || existing.materialFileKey || '',
    videoFileKey: body.videoFileKey || s3KeyFromUrl(videoLink) || existing.videoFileKey || '',
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

router.get('/:courseId/lessons', async (req, res) => {
  const lessons = await listLessons(req.params.courseId)
  if (lessons === null) return res.status(404).json({ message: 'Course not found.' })
  res.json(lessons)
})

const lessonUpload = coverUpload.fields([{ name: 'materialFile', maxCount: 1 }, { name: 'videoFile', maxCount: 1 }])

async function lessonPayload(req, existing = {}) {
  const lessonTitle = req.body.lessonTitle?.trim() || existing.lessonTitle || ''
  if (!lessonTitle) return null
  const files = req.files || {}
  const materialFileKey = await uploadCourseFile(files.materialFile?.[0], 'courses/materials')
  const videoFileKey = await uploadCourseFile(files.videoFile?.[0], 'videos')
  return {
    lessonTitle,
    lessonDescription: req.body.lessonDescription?.trim() ?? existing.lessonDescription ?? '',
    materialFileKey: materialFileKey || existing.materialFileKey || '',
    videoFileKey: videoFileKey || existing.videoFileKey || '',
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : existing.sortOrder || 0,
  }
}

router.post('/:courseId/lessons', authenticate, allowRoles('admin', 'lecturer'), lessonUpload, async (req, res, next) => {
  try {
    const payload = await lessonPayload(req)
    if (!payload) return res.status(400).json({ message: 'Lesson title is required.' })
    const lesson = await createLesson(req.params.courseId, payload)
    if (!lesson) return res.status(404).json({ message: 'Course not found.' })
    const course = await findCourseById(req.params.courseId)
    await notifyCourseStudents({ type: 'lesson', title: 'New lesson added', message: `New lesson added to ${course?.title || 'your course'}: ${lesson.lessonTitle}.`, relatedCourseId: req.params.courseId, relatedLessonId: lesson.id })
    res.status(201).json(lesson)
  } catch (error) { next(error) }
})

router.put('/:courseId/lessons/:lessonId', authenticate, allowRoles('admin', 'lecturer'), lessonUpload, async (req, res, next) => {
  try {
    const course = await findCourseById(req.params.courseId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    const existing = await findLessonById(req.params.courseId, req.params.lessonId)
    if (!existing) return res.status(404).json({ message: 'Lesson not found.' })
    const payload = await lessonPayload(req, existing)
    const lesson = await updateLesson(req.params.courseId, req.params.lessonId, payload)
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
    res.json(lesson)
  } catch (error) { next(error) }
})

router.delete('/:courseId/lessons/:lessonId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const removed = await deleteLesson(req.params.courseId, req.params.lessonId)
  if (!removed) return res.status(404).json({ message: 'Lesson not found.' })
  res.json({ message: 'Lesson deleted successfully.' })
})

router.get('/:courseId/assignments', authenticate, async (req, res) => {
  const course = await findCourseById(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId
  res.json(await listAssignments(req.params.courseId, studentId))
})

router.post('/:courseId/assignments', authenticate, allowRoles('admin', 'lecturer'), coverUpload.fields([{ name: 'instructionFile', maxCount: 1 }]), async (req, res, next) => {
  try {
    const title = req.body.title?.trim()
    if (!title) return res.status(400).json({ message: 'Assignment title is required.' })
    const assignment = await createAssignment(req.params.courseId, {
      lessonId: req.body.lessonId || '',
      title,
      description: req.body.description?.trim() || '',
      instructionFileKey: await uploadCourseFile(req.files?.instructionFile?.[0], 'assignments/instructions'),
      dueDate: req.body.dueDate || null,
      allowResubmission: req.body.allowResubmission !== 'false',
      createdBy: req.user.id,
    })
    if (!assignment) return res.status(404).json({ message: 'Course not found.' })
    await notifyCourseStudents({ type: 'assignment', title: 'New assignment posted', message: `New assignment posted: ${assignment.title}${assignment.dueDate ? ` . Due on ${new Date(assignment.dueDate).toLocaleDateString()}.` : '.'}`, relatedCourseId: req.params.courseId, relatedAssignmentId: assignment.id })
    res.status(201).json({ message: 'Assignment created successfully.', assignment })
  } catch (error) { next(error) }
})

router.post('/', authenticate, allowRoles('admin', 'lecturer'), coverUpload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'materialFile', maxCount: 1 }, { name: 'videoFile', maxCount: 1 }]), async (req, res, next) => {
  try {
    const payload = buildCoursePayload(req.body, req.user)
    if (!payload) return res.status(400).json({ message: 'Course title and description are required.' })
    const files = req.files || {}
    const coverImageKey = await uploadCourseFile(files.coverImage?.[0], 'courses/covers')
    const materialFileKey = await uploadCourseFile(files.materialFile?.[0], 'courses')
    const videoFileKey = await uploadCourseFile(files.videoFile?.[0], 'videos')

    const course = {
      id: randomUUID(),
      ...payload,
      coverImageKey: coverImageKey || payload.coverImageKey,
      materialFileKey: materialFileKey || payload.materialFileKey,
      videoFileKey: videoFileKey || payload.videoFileKey,
      progress: 0,
    }

    await createCourse(course, req.user.id)

    res.status(201).json(await presentCourse(course))
  } catch (error) {
    next(error)
  }
})

router.put('/:courseId', authenticate, allowRoles('admin', 'lecturer'), coverUpload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'materialFile', maxCount: 1 }, { name: 'videoFile', maxCount: 1 }]), async (req, res, next) => {
  try {
    const existing = await findCourseById(req.params.courseId)
    if (!existing) return res.status(404).json({ message: 'Course not found.' })

    const course = buildCoursePayload(req.body, req.user, existing)
    if (!course) return res.status(400).json({ message: 'Course title and description are required.' })
    const files = req.files || {}
    const coverImageKey = await uploadCourseFile(files.coverImage?.[0], 'courses/covers')
    const materialFileKey = await uploadCourseFile(files.materialFile?.[0], 'courses')
    const videoFileKey = await uploadCourseFile(files.videoFile?.[0], 'videos')
    if (coverImageKey) course.coverImageKey = coverImageKey
    if (materialFileKey) course.materialFileKey = materialFileKey
    if (videoFileKey) course.videoFileKey = videoFileKey

    const updated = await updateCourse(req.params.courseId, course)
    res.json(await presentCourse(updated))
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
