import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { createNotification, createQuizQuestion, deleteQuizQuestion, findQuiz, saveResult, updateQuizQuestion } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

function parseQuestions(value) {
  if (!value) return []
  return typeof value === 'string' ? JSON.parse(value) : value
}

function optionalUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function canManageQuiz(req) {
  return ['admin', 'lecturer'].includes(optionalUser(req)?.role)
}

function validateQuestion(body) {
  const text = body.text?.trim() || body.question?.trim()
  const options = body.options || [body.optionA, body.optionB, body.optionC, body.optionD]
  const normalizedOptions = options.map((option) => String(option || '').trim())
  const answer = body.correctAnswer ?? body.correct_answer
  const answerValue = typeof answer === 'string' && ['A', 'B', 'C', 'D'].includes(answer.trim().toUpperCase())
    ? answer.trim().toUpperCase().charCodeAt(0) - 65
    : Number(answer)

  if (!text) return { error: 'Question text is required.' }
  if (normalizedOptions.length !== 4 || normalizedOptions.some((option) => !option)) return { error: 'All four answer options are required.' }
  if (!Number.isInteger(answerValue) || answerValue < 0 || answerValue > 3) return { error: 'Correct answer is required.' }

  return {
    question: {
      id: body.id || randomUUID(),
      text,
      options: normalizedOptions,
      correctAnswer: answerValue,
      explanation: body.explanation?.trim() || '',
    },
  }
}

router.get('/:courseId', async (req, res) => {
  const quiz = await findQuiz(req.params.courseId)
  const questions = parseQuestions(quiz.questions)
  const isManager = canManageQuiz(req)
  const safeQuiz = {
    ...quiz,
    questions: isManager ? questions : questions.map(({ correctAnswer, ...question }) => question),
  }

  res.json(safeQuiz)
})

router.post('/submit', authenticate, allowRoles('student'), async (req, res) => {
  const { courseId, answers } = req.body
  const quiz = await findQuiz(courseId)
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

  await saveResult(result, answers)
  await createNotification({ userId: req.user.id, role: 'student', type: 'quiz', title: 'Quiz result available', message: `Your ${quiz.title} result is ready: ${result.percentage}%.`, relatedCourseId: courseId })

  res.status(201).json(result)
})

router.post('/:courseId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const { error, question } = validateQuestion(req.body)
  if (error) return res.status(400).json({ message: error })

  const created = await createQuizQuestion(req.params.courseId, question)
  res.status(201).json({ message: 'Quiz question added successfully.', question: created })
})

router.put('/:courseId/:questionId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const { error, question } = validateQuestion({ ...req.body, id: req.params.questionId })
  if (error) return res.status(400).json({ message: error })

  const updated = await updateQuizQuestion(req.params.courseId, req.params.questionId, question)
  if (!updated) return res.status(404).json({ message: 'Quiz question not found.' })
  res.json({ message: 'Quiz question updated successfully.', question: updated })
})

router.delete('/:courseId/:questionId', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  const removed = await deleteQuizQuestion(req.params.courseId, req.params.questionId)
  if (!removed) return res.status(404).json({ message: 'Quiz question not found.' })
  res.json({ message: 'Quiz question deleted successfully.' })
})

export default router
