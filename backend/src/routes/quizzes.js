import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { pool } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

function parseQuestions(value) {
  if (!value) return []
  return typeof value === 'string' ? JSON.parse(value) : value
}

router.get('/:courseId', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, course_id AS courseId, title, questions FROM quizzes WHERE course_id = ? LIMIT 1',
    [req.params.courseId],
  )
  const quiz = rows[0]
  if (!quiz) return res.status(404).json({ message: 'No quiz is available for this course.' })

  const questions = parseQuestions(quiz.questions)
  const safeQuiz = {
    ...quiz,
    questions: questions.map(({ correctAnswer, ...question }) => question),
  }

  res.json(safeQuiz)
})

router.post('/submit', authenticate, allowRoles('student'), async (req, res) => {
  const { courseId, answers } = req.body
  const [rows] = await pool.execute(
    'SELECT id, course_id AS courseId, title, questions FROM quizzes WHERE course_id = ? LIMIT 1',
    [courseId],
  )
  const quiz = rows[0]
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!answers || typeof answers !== 'object') return res.status(400).json({ message: 'Answers are required.' })

  const questions = parseQuestions(quiz.questions)
  const score = questions.reduce(
    (total, question) => total + (Number(answers[question.id]) === question.correctAnswer ? 1 : 0),
    0,
  )
  const result = {
    id: randomUUID(),
    studentId: req.user.id,
    studentName: req.user.name,
    courseId,
    quizTitle: quiz.title,
    score,
    total: questions.length,
    percentage: questions.length ? Math.round((score / questions.length) * 100) : 0,
    submittedAt: new Date().toISOString(),
  }

  await pool.execute(
    `INSERT INTO results
      (id, student_id, student_name, course_id, quiz_title, score, total, percentage, answers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      result.id,
      result.studentId,
      result.studentName,
      result.courseId,
      result.quizTitle,
      result.score,
      result.total,
      result.percentage,
      JSON.stringify(answers),
    ],
  )

  res.status(201).json(result)
})

export default router
