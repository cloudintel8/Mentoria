import { Router } from 'express'
import multer from 'multer'
import { authenticate, allowRoles } from '../middleware/auth.js'
import { createNotification, deleteAssignment, findAssignmentById, gradeSubmission, listAssignments, listSubmissions, submitAssignment, updateAssignment } from '../config/db.js'
import { uploadPrivateFile } from '../services/s3.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

async function instructionKey(file) {
  if (!file) return ''
  return await uploadPrivateFile(file, 'assignments/instructions') || ''
}

router.get('/admin/assignments', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  res.json(await listAssignments(req.query.courseId))
})

router.get('/:assignmentId/submissions', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const submissions = await listSubmissions(req.params.assignmentId)
  if (submissions === null) return res.status(404).json({ message: 'Assignment not found.' })
  res.json(submissions)
})

router.put('/:assignmentId', authenticate, allowRoles('admin', 'lecturer'), upload.fields([{ name: 'instructionFile', maxCount: 1 }]), async (req, res, next) => {
  try {
    const existing = await findAssignmentById(req.params.assignmentId)
    if (!existing) return res.status(404).json({ message: 'Assignment not found.' })
    const assignment = await updateAssignment(req.params.assignmentId, {
      lessonId: req.body.lessonId ?? existing.lessonId,
      title: req.body.title?.trim() || existing.title,
      description: req.body.description?.trim() ?? existing.description,
      instructionFileKey: await instructionKey(req.files?.instructionFile?.[0]) || existing.instructionFileKey,
      dueDate: req.body.dueDate ?? existing.dueDate,
      allowResubmission: req.body.allowResubmission !== undefined ? req.body.allowResubmission !== 'false' : existing.allowResubmission,
    })
    res.json({ message: 'Assignment updated successfully.', assignment })
  } catch (error) { next(error) }
})

router.delete('/:assignmentId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  if (!await deleteAssignment(req.params.assignmentId)) return res.status(404).json({ message: 'Assignment not found.' })
  res.json({ message: 'Assignment deleted successfully.' })
})

router.post('/:assignmentId/submit', authenticate, upload.single('submissionFile'), async (req, res, next) => {
  try {
    if (req.user.role !== 'student' || req.body.studentId && req.body.studentId !== req.user.id) return res.status(403).json({ message: 'Only the owning student can submit this assignment.' })
    if (!req.file) return res.status(400).json({ message: 'Select a submission file.' })
    const key = await uploadPrivateFile(req.file, 'assignments/submissions') || `demo/assignments/submissions/${req.user.id}-${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const result = await submitAssignment(req.params.assignmentId, req.user.id, key)
    if (result.missing) return res.status(404).json({ message: 'Assignment not found.' })
    if (result.closed) return res.status(409).json({ message: 'Resubmission is not allowed for this assignment.' })
    res.status(201).json({ message: 'Assignment submitted successfully.', submission: result })
  } catch (error) { next(error) }
})

router.put('/:submissionId/grade', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const result = await gradeSubmission(req.params.submissionId, req.body, req.user.id)
  if (!result) return res.status(404).json({ message: 'Submission not found.' })
  if (result.invalid) return res.status(400).json({ message: 'Grade must be between 0 and 100.' })
  await createNotification({ userId: result.studentId, role: 'student', type: 'graded', title: 'Assignment graded', message: 'Your assignment has been graded.', relatedAssignmentId: result.assignmentId })
  res.json({ message: 'Submission graded successfully.', submission: result })
})

export default router
