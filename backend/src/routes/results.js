import { Router } from 'express'
import { listResults } from '../config/db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

function mapResult(row) {
  return {
    ...row,
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
  }
}

router.get('/:studentId', authenticate, async (req, res) => {
  if (req.user.role === 'student' && req.user.id !== req.params.studentId) return res.status(403).json({ message: 'You can only view your own results.' })

  res.json((await listResults(req.params.studentId)).map(mapResult))
})

export default router
