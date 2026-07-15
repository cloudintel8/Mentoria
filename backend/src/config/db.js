import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { demoAssignments, demoCourses, demoLessons, demoQuizzes, demoResults, demoUsers } from '../data/demoData.js'
import { presentAssignment, presentCourse, presentCourseLesson, presentSubmission, presentUser } from '../services/s3.js'

let pool = null
let databaseEnabled = false
const data = { users: [], courses: [], lessons: [], assignments: [], submissions: [], notifications: [], quizzes: [], results: [] }

function legacyS3Key(value) {
  if (!value || typeof value !== 'string') return ''
  const match = value.match(/\.amazonaws\.com\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function isDatabaseEnabled() { return databaseEnabled }
export function getPool() { return pool }

export async function initializeDatabase() {
  data.users = await Promise.all(demoUsers.map(async (user) => ({ ...user, password: await bcrypt.hash(user.password, 10) })))
  data.courses = demoCourses.map((course) => ({ ...course }))
  data.lessons = demoLessons.map((lesson) => ({ ...lesson }))
  data.assignments = demoAssignments.map((assignment) => ({ ...assignment }))
  data.submissions = []
  data.notifications = []
  data.quizzes = demoQuizzes.map((quiz) => ({ ...quiz, questions: quiz.questions.map((q) => ({ ...q })) }))
  data.results = demoResults.map((result) => ({ ...result }))

  if (String(process.env.USE_DATABASE).toLowerCase() !== 'true') {
    console.warn('USE_DATABASE is not true; running with in-memory demo data.')
    return 'demo'
  }

  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) {
    console.warn(`Database configuration is incomplete (${missing.join(', ')}); using demo mode.`)
    return 'demo'
  }

  const candidate = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000),
  })

  try {
    pool = candidate
    await pool.query('SELECT 1')
    await createTables()
    await ensureOptionalColumns()
    await seedDemoData()
    databaseEnabled = true
    console.log('Connected to AWS RDS MySQL.')
    return 'database'
  } catch (error) {
    await candidate.end().catch(() => {})
    pool = null
    databaseEnabled = false
    console.warn(`Could not connect to MySQL (${error.message}). Continuing in demo mode.`)
    return 'demo'
  }
}
export const initializeDataStore = initializeDatabase

async function createTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'student', profile_image_key TEXT, profile_image_url TEXT, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, code VARCHAR(50) NOT NULL, description TEXT NOT NULL, instructor VARCHAR(120) NOT NULL, duration VARCHAR(80) NOT NULL, level VARCHAR(80) NOT NULL, category VARCHAR(120) NOT NULL DEFAULT 'Cloud', progress INT NOT NULL DEFAULT 0, color VARCHAR(20) NOT NULL DEFAULT '#2e8b57', material_link TEXT, video_link TEXT, cover_image_key TEXT, material_file_key TEXT, video_file_key TEXT, cover_image_url TEXT, created_by VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS course_lessons (id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL, lesson_title VARCHAR(255) NOT NULL, lesson_description TEXT, material_file_key TEXT, video_file_key TEXT, sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_course_lessons_course_order (course_id, sort_order), CONSTRAINT fk_course_lessons_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS assignments (id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL, lesson_id VARCHAR(64) NULL, title VARCHAR(255) NOT NULL, description TEXT, instruction_file_key TEXT, due_date DATETIME NULL, allow_resubmission BOOLEAN NOT NULL DEFAULT TRUE, created_by VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_assignments_course (course_id), CONSTRAINT fk_assignments_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS assignment_submissions (id VARCHAR(64) PRIMARY KEY, assignment_id VARCHAR(64) NOT NULL, student_id VARCHAR(64) NOT NULL, submission_file_key TEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, status VARCHAR(30) NOT NULL DEFAULT 'Submitted', grade DECIMAL(5,2) NULL, feedback TEXT, graded_at TIMESTAMP NULL, graded_by VARCHAR(64), UNIQUE KEY uq_assignment_student (assignment_id, student_id), INDEX idx_submissions_assignment (assignment_id), CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, role VARCHAR(20), type VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, related_course_id VARCHAR(64), related_lesson_id VARCHAR(64), related_assignment_id VARCHAR(64), is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_notifications_user_created (user_id, created_at))`)
  await pool.query(`CREATE TABLE IF NOT EXISTS quizzes (id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL, title VARCHAR(255), question TEXT NOT NULL, option_a TEXT NOT NULL, option_b TEXT NOT NULL, option_c TEXT NOT NULL, option_d TEXT NOT NULL, correct_answer INT NOT NULL, explanation TEXT, questions LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS results (id VARCHAR(64) PRIMARY KEY, student_id VARCHAR(64) NOT NULL, student_name VARCHAR(120) NOT NULL, course_id VARCHAR(64) NOT NULL, quiz_title VARCHAR(255) NOT NULL, score INT NOT NULL, total INT NOT NULL, percentage INT NOT NULL, answers LONGTEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
}

async function ensureOptionalColumns() {
  const statements = [
    'ALTER TABLE users ADD COLUMN profile_image_key TEXT',
    'ALTER TABLE users ADD COLUMN profile_image_url TEXT',
    'ALTER TABLE users ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    "ALTER TABLE courses ADD COLUMN category VARCHAR(120) NOT NULL DEFAULT 'Cloud'",
    'ALTER TABLE courses ADD COLUMN cover_image_key TEXT',
    'ALTER TABLE courses ADD COLUMN material_file_key TEXT',
    'ALTER TABLE courses ADD COLUMN video_file_key TEXT',
    'ALTER TABLE courses ADD COLUMN cover_image_url TEXT',
    'ALTER TABLE assignments ADD COLUMN lesson_id VARCHAR(64) NULL',
    'ALTER TABLE assignments ADD COLUMN description TEXT',
    'ALTER TABLE assignments ADD COLUMN instruction_file_key TEXT',
    'ALTER TABLE assignments ADD COLUMN due_date DATETIME NULL',
    'ALTER TABLE assignments ADD COLUMN allow_resubmission BOOLEAN NOT NULL DEFAULT TRUE',
    'ALTER TABLE assignments ADD COLUMN created_by VARCHAR(64)',
    'ALTER TABLE assignments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE assignments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    'ALTER TABLE assignment_submissions ADD COLUMN submission_file_key TEXT',
    'ALTER TABLE assignment_submissions ADD COLUMN submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    "ALTER TABLE assignment_submissions ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'Submitted'",
    'ALTER TABLE assignment_submissions ADD COLUMN grade DECIMAL(5,2) NULL',
    'ALTER TABLE assignment_submissions ADD COLUMN feedback TEXT',
    'ALTER TABLE assignment_submissions ADD COLUMN graded_at TIMESTAMP NULL',
    'ALTER TABLE assignment_submissions ADD COLUMN graded_by VARCHAR(64)',
    'ALTER TABLE notifications ADD COLUMN role VARCHAR(20)',
    'ALTER TABLE notifications ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT \'info\'',
    'ALTER TABLE notifications ADD COLUMN title VARCHAR(255)',
    'ALTER TABLE notifications ADD COLUMN message TEXT',
    'ALTER TABLE notifications ADD COLUMN related_course_id VARCHAR(64)',
    'ALTER TABLE notifications ADD COLUMN related_lesson_id VARCHAR(64)',
    'ALTER TABLE notifications ADD COLUMN related_assignment_id VARCHAR(64)',
    'ALTER TABLE notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE notifications ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE quizzes ADD COLUMN question TEXT',
    'ALTER TABLE quizzes ADD COLUMN option_a TEXT',
    'ALTER TABLE quizzes ADD COLUMN option_b TEXT',
    'ALTER TABLE quizzes ADD COLUMN option_c TEXT',
    'ALTER TABLE quizzes ADD COLUMN option_d TEXT',
    'ALTER TABLE quizzes ADD COLUMN correct_answer INT',
    'ALTER TABLE quizzes ADD COLUMN explanation TEXT',
    'ALTER TABLE quizzes ADD COLUMN title VARCHAR(255)',
    'ALTER TABLE quizzes ADD COLUMN questions LONGTEXT',
    'ALTER TABLE quizzes MODIFY title VARCHAR(255) NULL',
    'ALTER TABLE quizzes MODIFY questions LONGTEXT NULL',
    'ALTER TABLE quizzes DROP INDEX course_id',
    "UPDATE users SET profile_image_key=SUBSTRING_INDEX(profile_image_url, '.amazonaws.com/', -1), profile_image_url=NULL WHERE (profile_image_key IS NULL OR profile_image_key='') AND profile_image_url LIKE 'https://%.amazonaws.com/%'",
    "UPDATE courses SET cover_image_key=SUBSTRING_INDEX(cover_image_url, '.amazonaws.com/', -1), cover_image_url=NULL WHERE (cover_image_key IS NULL OR cover_image_key='') AND cover_image_url LIKE 'https://%.amazonaws.com/%'",
    "UPDATE courses SET material_file_key=SUBSTRING_INDEX(material_link, '.amazonaws.com/', -1), material_link=NULL WHERE (material_file_key IS NULL OR material_file_key='') AND material_link LIKE 'https://%.amazonaws.com/%'",
    "UPDATE courses SET video_file_key=SUBSTRING_INDEX(video_link, '.amazonaws.com/', -1), video_link=NULL WHERE (video_file_key IS NULL OR video_file_key='') AND video_link LIKE 'https://%.amazonaws.com/%'",
  ]
  for (const statement of statements) {
    await pool.query(statement).catch((error) => {
      if (!['ER_DUP_FIELDNAME', 'ER_BAD_FIELD_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(error.code)) throw error
    })
  }
}

async function seedDemoData() {
  const [[u]] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (!u.total) {
    for (const x of data.users) {
      await pool.execute('INSERT INTO users (id,name,email,password,role,profile_image_key,profile_image_url,joined_at) VALUES (?,?,?,?,?,?,?,?)', [x.id, x.name, x.email, x.password, x.role, x.profileImageKey || '', x.profileImageUrl || '', x.joinedAt || new Date()])
    }
  }

  const [[c]] = await pool.query('SELECT COUNT(*) AS total FROM courses')
  if (!c.total) {
    for (const x of data.courses) {
      const materialKey = x.materialFileKey || legacyS3Key(x.materialLink)
      const videoKey = x.videoFileKey || legacyS3Key(x.videoLink)
      await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,category,progress,color,material_link,video_link,cover_image_key,material_file_key,video_file_key,cover_image_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [x.id, x.title, x.code, x.description, x.instructor, x.duration, x.level, x.category || 'Cloud', x.progress, x.color, materialKey ? '' : (x.materialLink || ''), videoKey ? '' : (x.videoLink || ''), x.coverImageKey || legacyS3Key(x.coverImageUrl), materialKey, videoKey, '', x.createdBy])
    }
  }

  const [[q]] = await pool.query('SELECT COUNT(*) AS total FROM quizzes')
  if (!q.total) {
    for (const x of data.quizzes) {
      for (const question of x.questions) {
        const normalized = normalizeQuestion(question)
        await pool.execute('INSERT INTO quizzes (id,course_id,question,option_a,option_b,option_c,option_d,correct_answer,explanation) VALUES (?,?,?,?,?,?,?,?,?)', [normalized.id, x.courseId, normalized.text, normalized.options[0], normalized.options[1], normalized.options[2], normalized.options[3], normalized.correctAnswer, normalized.explanation || ''])
      }
    }
  }

  const [[l]] = await pool.query('SELECT COUNT(*) AS total FROM course_lessons')
  if (!l.total) {
    for (const lesson of data.lessons) {
      const [[courseExists]] = await pool.execute('SELECT COUNT(*) AS total FROM courses WHERE id=?', [lesson.courseId])
      if (!courseExists.total) continue
      await pool.execute('INSERT INTO course_lessons (id,course_id,lesson_title,lesson_description,material_file_key,video_file_key,sort_order) VALUES (?,?,?,?,?,?,?)', [lesson.id, lesson.courseId, lesson.lessonTitle, lesson.lessonDescription, lesson.materialFileKey || '', lesson.videoFileKey || '', lesson.sortOrder || 0])
    }
  }

  const [[a]] = await pool.query('SELECT COUNT(*) AS total FROM assignments')
  if (!a.total) {
    for (const assignment of data.assignments) {
      const [[courseExists]] = await pool.execute('SELECT COUNT(*) AS total FROM courses WHERE id=?', [assignment.courseId])
      if (!courseExists.total) continue
      await pool.execute('INSERT INTO assignments (id,course_id,lesson_id,title,description,instruction_file_key,due_date,allow_resubmission,created_by) VALUES (?,?,?,?,?,?,?,?,?)', [assignment.id, assignment.courseId, assignment.lessonId || null, assignment.title, assignment.description, assignment.instructionFileKey || '', assignment.dueDate ? new Date(assignment.dueDate) : null, assignment.allowResubmission !== false, assignment.createdBy])
    }
  }

  const [[r]] = await pool.query('SELECT COUNT(*) AS total FROM results')
  if (!r.total) {
    for (const x of data.results) {
      await pool.execute('INSERT INTO results (id,student_id,student_name,course_id,quiz_title,score,total,percentage,answers,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [x.id, x.studentId, x.studentName, x.courseId, x.quizTitle, x.score, x.total, x.percentage, JSON.stringify(x.answers || {}), x.submittedAt])
    }
  }
}

function publicUser(user) {
  if (!user) return null
  const { password, profile_image_key, profile_image_url, joined_at, created_at, ...safe } = user
  return {
    ...safe,
    profileImageKey: user.profileImageKey ?? profile_image_key ?? '',
    profileImageUrl: user.profileImageUrl ?? profile_image_url ?? '',
    joinedAt: normalizeDate(user.joinedAt ?? joined_at ?? created_at),
  }
}

function normalizeDate(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function mapCourse(row) {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    description: row.description,
    instructor: row.instructor,
    duration: row.duration,
    level: row.level,
    category: row.category || 'Cloud',
    progress: Number(row.progress || 0),
    color: row.color,
    materialLink: row.materialLink ?? row.material_link ?? '',
    videoLink: row.videoLink ?? row.video_link ?? '',
    coverImageKey: row.coverImageKey ?? row.cover_image_key ?? '',
    materialFileKey: row.materialFileKey ?? row.material_file_key ?? '',
    videoFileKey: row.videoFileKey ?? row.video_file_key ?? '',
    materialUrl: row.materialUrl || '',
    videoUrl: row.videoUrl || '',
    isLegacy: Boolean(row.isLegacy),
    coverImageUrl: row.coverImageUrl ?? row.cover_image_url ?? '',
    createdBy: row.createdBy ?? row.created_by,
  }
}

function publicResult(result) {
  const { answers, submitted_at, ...safe } = result
  const courseTitle = safe.courseTitle || data.courses.find((course) => course.id === safe.courseId)?.title
  return {
    ...safe,
    courseTitle,
    submittedAt: normalizeDate(safe.submittedAt ?? submitted_at),
    status: Number(safe.percentage) >= 60 ? 'Passed' : 'Needs Improvement',
  }
}

function normalizeCorrectAnswer(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim().toUpperCase()
    if (['A', 'B', 'C', 'D'].includes(trimmed)) return trimmed.charCodeAt(0) - 65
  }
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number <= 3 ? number : 0
}

function normalizeQuestion(question) {
  const options = question.options || [question.optionA ?? question.option_a, question.optionB ?? question.option_b, question.optionC ?? question.option_c, question.optionD ?? question.option_d]
  return {
    id: question.id,
    text: question.text ?? question.question ?? '',
    options: options.map((option) => option ?? ''),
    correctAnswer: normalizeCorrectAnswer(question.correctAnswer ?? question.correct_answer),
    explanation: question.explanation || '',
  }
}

function withCourseProgress(courses, results, quizzes) {
  return courses.map((course) => {
    const courseResults = results.filter((result) => result.courseId === course.id)
    const totalQuizzes = quizzes.some((quiz) => quiz.courseId === course.id && (!quiz.questions || quiz.questions.length)) ? 1 : 0
    const completedQuizzes = courseResults.length ? 1 : 0
    const progress = totalQuizzes && completedQuizzes ? 100 : Number(course.progress || 0)
    return {
      ...course,
      progress,
      totalQuizzes,
      completedQuizzes,
      completionStatus: progress >= 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Not Started',
    }
  })
}

function filterCourses(courses, search = '') {
  const query = search.toLowerCase().trim()
  if (!query) return courses
  return courses.filter((course) => [course.title, course.code, course.description, course.instructor].some((value) => value?.toLowerCase().includes(query)))
}

async function summarizeStudent(user, studentResults, courses, quizzes) {
  const safeUser = await presentUser(publicUser(user))
  const averageScore = studentResults.length ? Math.round(studentResults.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / studentResults.length) : 0
  const recentAttempts = studentResults.map(publicResult).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
  const coursesWithProgress = withCourseProgress(courses, studentResults, quizzes)
  const overallProgress = coursesWithProgress.length ? Math.round(coursesWithProgress.reduce((sum, course) => sum + Number(course.progress || 0), 0) / coursesWithProgress.length) : 0
  return {
    ...safeUser,
    totalEnrolledCourses: courses.length,
    completedQuizzes: studentResults.length,
    averageScore,
    overallProgress,
    recentQuizAttempts: recentAttempts.slice(0, 5),
    courses: await Promise.all(coursesWithProgress.map((course) => presentCourse(course))),
    lastActivity: recentAttempts[0]?.submittedAt || null,
  }
}

async function dbCourses() {
  const [rows] = await pool.query('SELECT id,title,code,description,instructor,duration,level,category,progress,color,material_link AS materialLink,video_link AS videoLink,cover_image_key AS coverImageKey,material_file_key AS materialFileKey,video_file_key AS videoFileKey,cover_image_url AS coverImageUrl,created_by AS createdBy FROM courses ORDER BY created_at ASC')
  return rows.map(mapCourse)
}

async function dbResults(studentId) {
  const sql = 'SELECT r.id,r.student_id AS studentId,r.student_name AS studentName,r.course_id AS courseId,c.title AS courseTitle,r.quiz_title AS quizTitle,r.score,r.total,r.percentage,r.submitted_at AS submittedAt FROM results r LEFT JOIN courses c ON c.id=r.course_id'
  const [rows] = studentId ? await pool.execute(`${sql} WHERE r.student_id=? ORDER BY r.submitted_at DESC`, [studentId]) : await pool.query(`${sql} ORDER BY r.submitted_at DESC`)
  return rows
}

async function dbQuizCourseIds() {
  const [rows] = await pool.query('SELECT DISTINCT course_id AS courseId FROM quizzes')
  return rows
}

export async function findUserByEmail(email) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,name,email,password,role,profile_image_key AS profileImageKey,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE email = ? LIMIT 1', [email])
    return rows[0]
  }
  return data.users.find((u) => u.email === email)
}

export async function findUserById(userId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,name,email,password,role,profile_image_key AS profileImageKey,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE id = ? LIMIT 1', [userId])
    return rows[0]
  }
  return data.users.find((u) => u.id === userId)
}

export async function createUser(user) {
  const nextUser = { ...user, joinedAt: user.joinedAt || new Date().toISOString(), profileImageKey: user.profileImageKey || '', profileImageUrl: user.profileImageUrl || '' }
  if (databaseEnabled) {
    await pool.execute('INSERT INTO users (id,name,email,password,role,profile_image_key,profile_image_url,joined_at) VALUES (?,?,?,?,?,?,?,?)', [nextUser.id, nextUser.name, nextUser.email, nextUser.password, nextUser.role, nextUser.profileImageKey, nextUser.profileImageUrl, nextUser.joinedAt])
  } else {
    data.users.push(nextUser)
  }
  return nextUser
}

export async function listCourses(options = {}) {
  const { search = '', studentId } = options
  if (databaseEnabled) {
    const courses = await dbCourses()
    const results = studentId ? await dbResults(studentId) : []
    const quizzes = await dbQuizCourseIds()
    return Promise.all(filterCourses(withCourseProgress(courses, results, quizzes), search).map((course) => presentCourse(course)))
  }
  const results = studentId ? data.results.filter((result) => result.studentId === studentId) : []
  return Promise.all(filterCourses(withCourseProgress(data.courses.map(mapCourse), results, data.quizzes), search).map((course) => presentCourse(course)))
}

// Internal lookup used by multipart edits; public endpoints use listCourses/presentCourse.
export async function findCourseById(courseId) {
  if (databaseEnabled) {
    const courses = await dbCourses()
    return courses.find((course) => course.id === courseId) || null
  }
  return data.courses.map(mapCourse).find((course) => course.id === courseId) || null
}

function mapLesson(row) {
  return {
    id: row.id,
    courseId: row.courseId ?? row.course_id,
    lessonTitle: row.lessonTitle ?? row.lesson_title ?? '',
    lessonDescription: row.lessonDescription ?? row.lesson_description ?? '',
    materialFileKey: row.materialFileKey ?? row.material_file_key ?? '',
    videoFileKey: row.videoFileKey ?? row.video_file_key ?? '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    createdAt: normalizeDate(row.createdAt ?? row.created_at),
  }
}

async function rawLessons(courseId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,course_id AS courseId,lesson_title AS lessonTitle,lesson_description AS lessonDescription,material_file_key AS materialFileKey,video_file_key AS videoFileKey,sort_order AS sortOrder,created_at AS createdAt FROM course_lessons WHERE course_id=? ORDER BY sort_order ASC, created_at ASC', [courseId])
    return rows.map(mapLesson)
  }
  return data.lessons.filter((lesson) => lesson.courseId === courseId).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(mapLesson)
}

function legacyLesson(course) {
  if (!course || (!course.materialFileKey && !course.videoFileKey && !course.materialLink && !course.videoLink)) return null
  return mapLesson({ id: `${course.id}-introduction`, courseId: course.id, lessonTitle: 'Course Introduction', lessonDescription: course.description, materialFileKey: course.materialFileKey || legacyS3Key(course.materialLink), videoFileKey: course.videoFileKey || legacyS3Key(course.videoLink), materialUrl: legacyS3Key(course.materialLink) ? '' : course.materialLink, videoUrl: legacyS3Key(course.videoLink) ? '' : course.videoLink, sortOrder: 1, isLegacy: true })
}

export async function listLessons(courseId) {
  const course = await findCourseById(courseId)
  if (!course) return null
  const lessons = await rawLessons(courseId)
  const fallback = legacyLesson(course)
  const withFallback = lessons.length ? lessons : (fallback ? [fallback] : [])
  return Promise.all(withFallback.map((lesson) => presentCourseLesson(lesson)))
}

export async function findLessonById(courseId, lessonId) {
  const lessons = await rawLessons(courseId)
  return lessons.find((lesson) => lesson.id === lessonId) || null
}

export async function createLesson(courseId, lesson) {
  const course = await findCourseById(courseId)
  if (!course) return null
  const next = mapLesson({ ...lesson, id: lesson.id || randomUUID(), courseId, sortOrder: Number(lesson.sortOrder || 0) })
  if (databaseEnabled) {
    await pool.execute('INSERT INTO course_lessons (id,course_id,lesson_title,lesson_description,material_file_key,video_file_key,sort_order) VALUES (?,?,?,?,?,?,?)', [next.id, courseId, next.lessonTitle, next.lessonDescription, next.materialFileKey, next.videoFileKey, next.sortOrder])
  } else data.lessons.push(next)
  return presentCourseLesson(next)
}

export async function updateLesson(courseId, lessonId, lesson) {
  const current = (await rawLessons(courseId)).find((item) => item.id === lessonId)
  if (!current) return null
  const next = mapLesson({ ...current, ...lesson, id: lessonId, courseId, sortOrder: Number(lesson.sortOrder ?? current.sortOrder) })
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE course_lessons SET lesson_title=?,lesson_description=?,material_file_key=?,video_file_key=?,sort_order=? WHERE id=? AND course_id=?', [next.lessonTitle, next.lessonDescription, next.materialFileKey, next.videoFileKey, next.sortOrder, lessonId, courseId])
    if (!result.affectedRows) return null
  } else {
    const index = data.lessons.findIndex((item) => item.id === lessonId && item.courseId === courseId)
    if (index < 0) return null
    data.lessons[index] = next
  }
  return presentCourseLesson(next)
}

export async function deleteLesson(courseId, lessonId) {
  if (databaseEnabled) {
    const [result] = await pool.execute('DELETE FROM course_lessons WHERE id=? AND course_id=?', [lessonId, courseId])
    return result.affectedRows > 0
  }
  const before = data.lessons.length
  data.lessons = data.lessons.filter((item) => !(item.id === lessonId && item.courseId === courseId))
  return data.lessons.length < before
}

function mapAssignment(row) {
  return {
    id: row.id,
    courseId: row.courseId ?? row.course_id,
    lessonId: row.lessonId ?? row.lesson_id ?? '',
    title: row.title || '',
    description: row.description || '',
    instructionFileKey: row.instructionFileKey ?? row.instruction_file_key ?? '',
    dueDate: row.dueDate ?? row.due_date ?? null,
    allowResubmission: row.allowResubmission ?? row.allow_resubmission ?? true,
    createdBy: row.createdBy ?? row.created_by,
    courseTitle: row.courseTitle,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  }
}

function assignmentStatus(assignment, submission) {
  if (!submission) return assignment.dueDate && !assignment.allowResubmission && new Date() > new Date(assignment.dueDate) ? 'Closed' : 'Not submitted'
  if (submission.status === 'Graded') return 'Graded'
  if (assignment.dueDate && new Date(submission.submittedAt) > new Date(assignment.dueDate)) return 'Late'
  return submission.status || 'Submitted'
}

async function rawAssignments(courseId) {
  if (databaseEnabled) {
    const [rows] = courseId
      ? await pool.execute('SELECT a.id,a.course_id AS courseId,a.lesson_id AS lessonId,a.title,a.description,a.instruction_file_key AS instructionFileKey,a.due_date AS dueDate,a.allow_resubmission AS allowResubmission,a.created_by AS createdBy,a.created_at AS createdAt,a.updated_at AS updatedAt,c.title AS courseTitle FROM assignments a LEFT JOIN courses c ON c.id=a.course_id WHERE a.course_id=? ORDER BY a.due_date ASC, a.created_at ASC', [courseId])
      : await pool.query('SELECT a.id,a.course_id AS courseId,a.lesson_id AS lessonId,a.title,a.description,a.instruction_file_key AS instructionFileKey,a.due_date AS dueDate,a.allow_resubmission AS allowResubmission,a.created_by AS createdBy,a.created_at AS createdAt,a.updated_at AS updatedAt,c.title AS courseTitle FROM assignments a LEFT JOIN courses c ON c.id=a.course_id ORDER BY a.due_date ASC, a.created_at ASC')
    return rows.map(mapAssignment)
  }
  return data.assignments.filter((assignment) => !courseId || assignment.courseId === courseId).map(mapAssignment).sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0))
}

async function rawSubmissions(assignmentId, studentId) {
  if (databaseEnabled) {
    let sql = 'SELECT s.id,s.assignment_id AS assignmentId,s.student_id AS studentId,s.submission_file_key AS submissionFileKey,s.submitted_at AS submittedAt,s.status,s.grade,s.feedback,s.graded_at AS gradedAt,s.graded_by AS gradedBy,u.name AS studentName,u.email AS studentEmail FROM assignment_submissions s LEFT JOIN users u ON u.id=s.student_id WHERE s.assignment_id=?'
    const params = [assignmentId]
    if (studentId) { sql += ' AND s.student_id=?'; params.push(studentId) }
    sql += ' ORDER BY s.submitted_at DESC'
    const [rows] = await pool.execute(sql, params)
    return rows
  }
  return data.submissions.filter((submission) => submission.assignmentId === assignmentId && (!studentId || submission.studentId === studentId)).map((submission) => ({ ...submission, studentName: data.users.find((user) => user.id === submission.studentId)?.name, studentEmail: data.users.find((user) => user.id === submission.studentId)?.email }))
}

export async function listAssignments(courseId, studentId) {
  const assignments = await rawAssignments(courseId)
  const result = []
  for (const assignment of assignments) {
    const [submission] = await rawSubmissions(assignment.id, studentId)
    const presented = await presentAssignment(assignment)
    result.push({ ...presented, status: assignmentStatus(assignment, submission), submission: await presentSubmission(submission) })
  }
  return result
}

export async function findAssignmentById(assignmentId) {
  const assignments = await rawAssignments()
  return assignments.find((assignment) => assignment.id === assignmentId) || null
}

export async function createAssignment(courseId, payload) {
  const course = await findCourseById(courseId)
  if (!course) return null
  const next = mapAssignment({ ...payload, id: payload.id || randomUUID(), courseId, dueDate: payload.dueDate || null })
  if (databaseEnabled) await pool.execute('INSERT INTO assignments (id,course_id,lesson_id,title,description,instruction_file_key,due_date,allow_resubmission,created_by) VALUES (?,?,?,?,?,?,?,?,?)', [next.id, courseId, next.lessonId || null, next.title, next.description, next.instructionFileKey, next.dueDate ? new Date(next.dueDate) : null, next.allowResubmission !== false, next.createdBy])
  else data.assignments.push(next)
  return presentAssignment(next)
}

export async function updateAssignment(assignmentId, payload) {
  const existing = await findAssignmentById(assignmentId)
  if (!existing) return null
  const next = mapAssignment({ ...existing, ...payload, id: assignmentId, courseId: existing.courseId })
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE assignments SET lesson_id=?,title=?,description=?,instruction_file_key=?,due_date=?,allow_resubmission=? WHERE id=?', [next.lessonId || null, next.title, next.description, next.instructionFileKey, next.dueDate ? new Date(next.dueDate) : null, next.allowResubmission !== false, assignmentId])
    if (!result.affectedRows) return null
  } else {
    const index = data.assignments.findIndex((assignment) => assignment.id === assignmentId)
    if (index < 0) return null
    data.assignments[index] = next
  }
  return presentAssignment(next)
}

export async function deleteAssignment(assignmentId) {
  if (databaseEnabled) {
    const [result] = await pool.execute('DELETE FROM assignments WHERE id=?', [assignmentId])
    return result.affectedRows > 0
  }
  const before = data.assignments.length
  data.assignments = data.assignments.filter((assignment) => assignment.id !== assignmentId)
  data.submissions = data.submissions.filter((submission) => submission.assignmentId !== assignmentId)
  return data.assignments.length < before
}

export async function listSubmissions(assignmentId) {
  const assignment = await findAssignmentById(assignmentId)
  if (!assignment) return null
  const submissions = await rawSubmissions(assignmentId)
  return Promise.all(submissions.map((submission) => presentSubmission({ ...submission, status: assignmentStatus(assignment, submission) })))
}

export async function listStudentSubmissions(studentId) {
  const assignments = await rawAssignments()
  const result = []
  for (const assignment of assignments) {
    const [submission] = await rawSubmissions(assignment.id, studentId)
    if (submission) result.push({ assignment: await presentAssignment(assignment), submission: await presentSubmission({ ...submission, status: assignmentStatus(assignment, submission) }) })
  }
  return result
}

export async function submitAssignment(assignmentId, studentId, submissionFileKey) {
  const assignment = await findAssignmentById(assignmentId)
  if (!assignment) return { missing: true }
  const existing = (await rawSubmissions(assignmentId, studentId))[0]
  if (existing && !assignment.allowResubmission) return { closed: true }
  const status = assignment.dueDate && new Date() > new Date(assignment.dueDate) ? 'Late' : 'Submitted'
  const next = { id: existing?.id || randomUUID(), assignmentId, studentId, submissionFileKey, submittedAt: new Date(), status, grade: existing?.grade ?? null, feedback: existing?.feedback || '', gradedAt: existing?.gradedAt || null, gradedBy: existing?.gradedBy || null }
  if (databaseEnabled) {
    if (existing) await pool.execute('UPDATE assignment_submissions SET submission_file_key=?,submitted_at=?,status=?,grade=NULL,feedback=NULL,graded_at=NULL,graded_by=NULL WHERE id=?', [submissionFileKey, next.submittedAt, status, existing.id])
    else await pool.execute('INSERT INTO assignment_submissions (id,assignment_id,student_id,submission_file_key,submitted_at,status) VALUES (?,?,?,?,?,?)', [next.id, assignmentId, studentId, submissionFileKey, next.submittedAt, status])
  } else {
    if (existing) data.submissions = data.submissions.map((submission) => submission.id === existing.id ? next : submission)
    else data.submissions.push(next)
  }
  return presentSubmission(next)
}

export async function gradeSubmission(submissionId, payload, gradedBy) {
  let existing
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,assignment_id AS assignmentId,student_id AS studentId,submission_file_key AS submissionFileKey,submitted_at AS submittedAt,status,grade,feedback,graded_at AS gradedAt,graded_by AS gradedBy FROM assignment_submissions WHERE id=? LIMIT 1', [submissionId])
    existing = rows[0]
  } else existing = data.submissions.find((submission) => submission.id === submissionId)
  if (!existing) return null
  const grade = payload.grade === '' || payload.grade == null ? null : Number(payload.grade)
  if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 100)) return { invalid: true }
  const next = { ...existing, grade, feedback: payload.feedback || '', status: 'Graded', gradedAt: new Date(), gradedBy }
  if (databaseEnabled) await pool.execute('UPDATE assignment_submissions SET status=?,grade=?,feedback=?,graded_at=?,graded_by=? WHERE id=?', ['Graded', grade, next.feedback, next.gradedAt, gradedBy, submissionId])
  else data.submissions = data.submissions.map((submission) => submission.id === submissionId ? next : submission)
  return presentSubmission(next)
}

export async function createNotification(payload) {
  const next = { id: payload.id || randomUUID(), userId: payload.userId, role: payload.role || '', type: payload.type || 'info', title: payload.title, message: payload.message, relatedCourseId: payload.relatedCourseId || '', relatedLessonId: payload.relatedLessonId || '', relatedAssignmentId: payload.relatedAssignmentId || '', isRead: false, createdAt: new Date() }
  if (databaseEnabled) await pool.execute('INSERT INTO notifications (id,user_id,role,type,title,message,related_course_id,related_lesson_id,related_assignment_id,is_read) VALUES (?,?,?,?,?,?,?,?,?,?)', [next.id, next.userId, next.role, next.type, next.title, next.message, next.relatedCourseId || null, next.relatedLessonId || null, next.relatedAssignmentId || null, false])
  else data.notifications.push(next)
  return next
}

export async function notifyCourseStudents(payload) {
  const students = databaseEnabled ? (await pool.query("SELECT id,role FROM users WHERE role='student'"))[0] : data.users.filter((user) => user.role === 'student')
  return Promise.all(students.map((student) => createNotification({ ...payload, userId: student.id, role: student.role })))
}

export async function listNotifications(userId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,user_id AS userId,role,type,title,message,related_course_id AS relatedCourseId,related_lesson_id AS relatedLessonId,related_assignment_id AS relatedAssignmentId,is_read AS isRead,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC', [userId])
    return rows.map((row) => ({ ...row, createdAt: normalizeDate(row.createdAt) }))
  }
  return data.notifications.filter((notification) => notification.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export async function markNotificationRead(notificationId, userId) {
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE notifications SET is_read=TRUE WHERE id=? AND user_id=?', [notificationId, userId])
    return result.affectedRows > 0
  }
  const notification = data.notifications.find((item) => item.id === notificationId && item.userId === userId)
  if (!notification) return false
  notification.isRead = true
  return true
}

export async function markAllNotificationsRead(userId) {
  if (databaseEnabled) { await pool.execute('UPDATE notifications SET is_read=TRUE WHERE user_id=?', [userId]); return true }
  data.notifications.filter((notification) => notification.userId === userId).forEach((notification) => { notification.isRead = true })
  return true
}

export async function createCourse(course, createdBy) {
  const nextCourse = { ...course, category: course.category || 'Cloud' }
  if (databaseEnabled) {
    await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,category,progress,color,material_link,video_link,cover_image_key,material_file_key,video_file_key,cover_image_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [nextCourse.id, nextCourse.title, nextCourse.code, nextCourse.description, nextCourse.instructor, nextCourse.duration, nextCourse.level, nextCourse.category, nextCourse.progress, nextCourse.color, nextCourse.materialLink, nextCourse.videoLink, nextCourse.coverImageKey || '', nextCourse.materialFileKey || '', nextCourse.videoFileKey || '', nextCourse.coverImageUrl || '', createdBy])
  } else {
    data.courses.push({ ...nextCourse, createdBy })
  }
  return nextCourse
}

export async function updateCourse(courseId, course) {
  const nextCourse = { ...course, category: course.category || 'Cloud' }
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE courses SET title=?,code=?,description=?,instructor=?,duration=?,level=?,category=?,progress=?,color=?,material_link=?,video_link=?,cover_image_key=?,material_file_key=?,video_file_key=?,cover_image_url=? WHERE id=?', [nextCourse.title, nextCourse.code, nextCourse.description, nextCourse.instructor, nextCourse.duration, nextCourse.level, nextCourse.category, nextCourse.progress, nextCourse.color, nextCourse.materialLink, nextCourse.videoLink, nextCourse.coverImageKey || '', nextCourse.materialFileKey || '', nextCourse.videoFileKey || '', nextCourse.coverImageUrl || '', courseId])
    if (!result.affectedRows) return null
    const [rows] = await pool.execute('SELECT id,title,code,description,instructor,duration,level,category,progress,color,material_link AS materialLink,video_link AS videoLink,cover_image_key AS coverImageKey,material_file_key AS materialFileKey,video_file_key AS videoFileKey,cover_image_url AS coverImageUrl FROM courses WHERE id=? LIMIT 1', [courseId])
    return mapCourse(rows[0])
  }
  const index = data.courses.findIndex((item) => item.id === courseId)
  if (index === -1) return null
  data.courses[index] = { ...data.courses[index], ...nextCourse, id: courseId }
  return mapCourse(data.courses[index])
}

export async function deleteCourse(courseId) {
  if (databaseEnabled) {
    await pool.execute('DELETE FROM results WHERE course_id=?', [courseId])
    await pool.execute('DELETE FROM quizzes WHERE course_id=?', [courseId])
    const [result] = await pool.execute('DELETE FROM courses WHERE id=?', [courseId])
    return result.affectedRows > 0
  }
  const index = data.courses.findIndex((item) => item.id === courseId)
  if (index === -1) return false
  data.courses.splice(index, 1)
  data.lessons = data.lessons.filter((lesson) => lesson.courseId !== courseId)
  data.quizzes = data.quizzes.filter((quiz) => quiz.courseId !== courseId)
  data.results = data.results.filter((result) => result.courseId !== courseId)
  return true
}

export async function findQuiz(courseId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,course_id AS courseId,title,questions,question,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,correct_answer AS correctAnswer,explanation FROM quizzes WHERE course_id = ? ORDER BY created_at ASC', [courseId])
    const courses = await dbCourses()
    const course = courses.find((item) => item.id === courseId)
    const legacyQuestions = rows.flatMap((row) => row.questions ? JSON.parse(row.questions).map(normalizeQuestion) : [])
    const normalizedQuestions = rows.filter((row) => row.question).map(normalizeQuestion)
    return { id: `quiz-${courseId}`, courseId, title: rows.find((row) => row.title)?.title || (course ? `${course.title} Quiz` : 'Course Quiz'), questions: normalizedQuestions.length ? normalizedQuestions : legacyQuestions }
  }
  const quiz = data.quizzes.find((q) => q.courseId === courseId)
  if (!quiz) return { id: `quiz-${courseId}`, courseId, title: 'Course Quiz', questions: [] }
  return { ...quiz, questions: quiz.questions.map(normalizeQuestion) }
}

export async function createQuizQuestion(courseId, question) {
  const nextQuestion = normalizeQuestion(question)
  if (databaseEnabled) {
    await pool.execute('INSERT INTO quizzes (id,course_id,question,option_a,option_b,option_c,option_d,correct_answer,explanation) VALUES (?,?,?,?,?,?,?,?,?)', [nextQuestion.id, courseId, nextQuestion.text, nextQuestion.options[0], nextQuestion.options[1], nextQuestion.options[2], nextQuestion.options[3], nextQuestion.correctAnswer, nextQuestion.explanation || ''])
    return nextQuestion
  }
  let quiz = data.quizzes.find((item) => item.courseId === courseId)
  if (!quiz) {
    const course = data.courses.find((item) => item.id === courseId)
    quiz = { id: `quiz-${courseId}`, courseId, title: course ? `${course.title} Quiz` : 'Course Quiz', questions: [] }
    data.quizzes.push(quiz)
  }
  quiz.questions.push(nextQuestion)
  return nextQuestion
}

export async function updateQuizQuestion(courseId, questionId, question) {
  const nextQuestion = normalizeQuestion({ ...question, id: questionId })
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE quizzes SET question=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_answer=?,explanation=? WHERE course_id=? AND id=?', [nextQuestion.text, nextQuestion.options[0], nextQuestion.options[1], nextQuestion.options[2], nextQuestion.options[3], nextQuestion.correctAnswer, nextQuestion.explanation || '', courseId, questionId])
    return result.affectedRows ? nextQuestion : null
  }
  const quiz = data.quizzes.find((item) => item.courseId === courseId)
  if (!quiz) return null
  const index = quiz.questions.findIndex((item) => item.id === questionId)
  if (index === -1) return null
  quiz.questions[index] = nextQuestion
  return nextQuestion
}

export async function deleteQuizQuestion(courseId, questionId) {
  if (databaseEnabled) {
    const [result] = await pool.execute('DELETE FROM quizzes WHERE course_id=? AND id=?', [courseId, questionId])
    return result.affectedRows > 0
  }
  const quiz = data.quizzes.find((item) => item.courseId === courseId)
  if (!quiz) return false
  const before = quiz.questions.length
  quiz.questions = quiz.questions.filter((item) => item.id !== questionId)
  return quiz.questions.length !== before
}

export async function saveResult(result, answers) {
  if (databaseEnabled) {
    await pool.execute('INSERT INTO results (id,student_id,student_name,course_id,quiz_title,score,total,percentage,answers,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [result.id, result.studentId, result.studentName, result.courseId, result.quizTitle, result.score, result.total, result.percentage, JSON.stringify(answers), result.submittedAt])
  } else {
    data.results.push({ ...result, answers })
  }
  return result
}

export async function listResults(studentId) {
  if (databaseEnabled) return (await dbResults(studentId)).map(publicResult)
  return data.results.filter((r) => r.studentId === studentId).map(publicResult).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
}

export async function listAllResults() {
  if (databaseEnabled) return (await dbResults()).map(publicResult)
  return data.results.map(publicResult).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
}

export async function getProfile(userId) {
  const user = await findUserById(userId)
  if (!user) return null
  const courses = databaseEnabled ? await dbCourses() : data.courses.map(mapCourse)
  const results = databaseEnabled ? await dbResults(userId) : data.results.filter((result) => result.studentId === userId)
  const quizzes = databaseEnabled ? await dbQuizCourseIds() : data.quizzes
  return summarizeStudent(user, results, courses, quizzes)
}

export async function updateProfile(userId, payload) {
  const user = await findUserById(userId)
  if (!user) return null
  const name = payload.name?.trim()
  const email = payload.email?.toLowerCase().trim()
  if (!name || !email) return null

  const duplicate = await findUserByEmail(email)
  if (duplicate && duplicate.id !== userId) return { conflict: true }

  if (databaseEnabled) {
    await pool.execute('UPDATE users SET name=?, email=? WHERE id=?', [name, email, userId])
    await pool.execute('UPDATE results SET student_name=? WHERE student_id=?', [name, userId])
    return presentUser(publicUser(await findUserById(userId)))
  }
  user.name = name
  user.email = email
  data.results = data.results.map((result) => result.studentId === userId ? { ...result, studentName: name } : result)
  return presentUser(publicUser(user))
}

export async function changePassword(userId, oldPassword, newPassword) {
  const user = await findUserById(userId)
  if (!user) return { missing: true }
  if (!newPassword || newPassword.length < 6) return { invalid: true }
  if (oldPassword && !(await bcrypt.compare(oldPassword, user.password))) return { wrongPassword: true }

  const hashed = await bcrypt.hash(newPassword, 10)
  if (databaseEnabled) await pool.execute('UPDATE users SET password=? WHERE id=?', [hashed, userId])
  else user.password = hashed
  return { ok: true }
}

export async function updateAvatar(userId, profileImageKey) {
  const user = await findUserById(userId)
  if (!user) return null
  if (databaseEnabled) {
    await pool.execute('UPDATE users SET profile_image_key=? WHERE id=?', [profileImageKey || '', userId])
    return presentUser(publicUser(await findUserById(userId)))
  }
  if (profileImageKey) user.profileImageKey = profileImageKey
  return presentUser(publicUser(user))
}

export async function listStudents() {
  const students = databaseEnabled
    ? (await pool.query("SELECT id,name,email,password,role,profile_image_key AS profileImageKey,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE role='student' ORDER BY joined_at ASC"))[0]
    : data.users.filter((user) => user.role === 'student')
  const courses = databaseEnabled ? await dbCourses() : data.courses.map(mapCourse)
  const results = databaseEnabled ? await dbResults() : data.results
  const quizzes = databaseEnabled ? await dbQuizCourseIds() : data.quizzes
  return Promise.all(students.map((student) => summarizeStudent(student, results.filter((result) => result.studentId === student.id), courses, quizzes)))
}

export async function getAdminStats() {
  const students = await listStudents()
  const courses = await listCourses()
  const results = await listAllResults()
  const averageClassScore = results.length ? Math.round(results.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / results.length) : 0
  const totalLessons = databaseEnabled ? Number((await pool.query('SELECT COUNT(*) AS total FROM course_lessons'))[0][0].total) : data.lessons.length
  const totalAssignments = databaseEnabled ? Number((await pool.query('SELECT COUNT(*) AS total FROM assignments'))[0][0].total) : data.assignments.length
  const pendingSubmissions = databaseEnabled ? Number((await pool.query("SELECT COUNT(*) AS total FROM assignment_submissions WHERE status <> 'Graded'"))[0][0].total) : data.submissions.filter((submission) => submission.status !== 'Graded').length
  return {
    totalStudents: students.length,
    totalCourses: courses.length,
    totalQuizAttempts: results.length,
    averageClassScore,
    totalLessons,
    totalAssignments,
    pendingSubmissions,
  }
}
