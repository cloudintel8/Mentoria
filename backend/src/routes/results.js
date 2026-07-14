import { Router } from 'express'
import { pool } from '../config/db.js'
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

  const [rows] = await pool.execute(
    `SELECT
      r.id,
      r.student_id AS studentId,
      r.student_name AS studentName,
      r.course_id AS courseId,
      c.title AS courseTitle,
      r.quiz_title AS quizTitle,
      r.score,
      r.total,
      r.percentage,
      r.submitted_at AS submittedAt
    FROM results r
    LEFT JOIN courses c ON c.id = r.course_id
    WHERE r.student_id = ?
    ORDER BY r.submitted_at DESC`,
    [req.params.studentId],
  )

  res.json(rows.map(mapResult))
})

export default router
