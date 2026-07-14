import { Router } from 'express'
import { pool } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

function mapResult(row) {
  return {
    ...row,
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
  }
}

router.get('/results', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
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
    ORDER BY r.submitted_at DESC
  `)

  res.json(rows.map(mapResult))
})

export default router
