import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { listAssignments, listStudentSubmissions } from '../config/db.js'

const router = Router()

function canAccess(req, studentId) {
  return req.user.id === studentId || ['admin', 'lecturer'].includes(req.user.role)
}

router.get('/:studentId/assignments', authenticate, async (req, res) => {
  if (!canAccess(req, req.params.studentId)) return res.status(403).json({ message: 'You can only view your own assignments.' })
  res.json(await listAssignments(null, req.params.studentId))
})

router.get('/:studentId/submissions', authenticate, async (req, res) => {
  if (!canAccess(req, req.params.studentId)) return res.status(403).json({ message: 'You can only view your own submissions.' })
  res.json(await listStudentSubmissions(req.params.studentId))
})

export default router
