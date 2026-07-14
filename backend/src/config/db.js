import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { demoCourses, demoQuizzes, demoResults, demoUsers } from '../data/demoData.js'

let pool = null
let databaseEnabled = false
const data = { users: [], courses: [], quizzes: [], results: [] }

export function isDatabaseEnabled() { return databaseEnabled }
export function getPool() { return pool }

export async function initializeDatabase() {
  data.users = await Promise.all(demoUsers.map(async (user) => ({ ...user, password: await bcrypt.hash(user.password, 10) })))
  data.courses = demoCourses.map((course) => ({ ...course }))
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
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'student', profile_image_url TEXT, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, code VARCHAR(50) NOT NULL, description TEXT NOT NULL, instructor VARCHAR(120) NOT NULL, duration VARCHAR(80) NOT NULL, level VARCHAR(80) NOT NULL, category VARCHAR(120) NOT NULL DEFAULT 'Cloud', progress INT NOT NULL DEFAULT 0, color VARCHAR(20) NOT NULL DEFAULT '#2e8b57', material_link TEXT, video_link TEXT, cover_image_url TEXT, created_by VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS quizzes (id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL UNIQUE, title VARCHAR(255) NOT NULL, questions LONGTEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS results (id VARCHAR(64) PRIMARY KEY, student_id VARCHAR(64) NOT NULL, student_name VARCHAR(120) NOT NULL, course_id VARCHAR(64) NOT NULL, quiz_title VARCHAR(255) NOT NULL, score INT NOT NULL, total INT NOT NULL, percentage INT NOT NULL, answers LONGTEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
}

async function ensureOptionalColumns() {
  const statements = [
    'ALTER TABLE users ADD COLUMN profile_image_url TEXT',
    'ALTER TABLE users ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    "ALTER TABLE courses ADD COLUMN category VARCHAR(120) NOT NULL DEFAULT 'Cloud'",
    'ALTER TABLE courses ADD COLUMN cover_image_url TEXT',
  ]
  for (const statement of statements) {
    await pool.query(statement).catch((error) => {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    })
  }
}

async function seedDemoData() {
  const [[u]] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (!u.total) {
    for (const x of data.users) {
      await pool.execute('INSERT INTO users (id,name,email,password,role,profile_image_url,joined_at) VALUES (?,?,?,?,?,?,?)', [x.id, x.name, x.email, x.password, x.role, x.profileImageUrl || '', x.joinedAt || new Date()])
    }
  }

  const [[c]] = await pool.query('SELECT COUNT(*) AS total FROM courses')
  if (!c.total) {
    for (const x of data.courses) {
      await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,category,progress,color,material_link,video_link,cover_image_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [x.id, x.title, x.code, x.description, x.instructor, x.duration, x.level, x.category || 'Cloud', x.progress, x.color, x.materialLink, x.videoLink, x.coverImageUrl || '', x.createdBy])
    }
  }

  const [[q]] = await pool.query('SELECT COUNT(*) AS total FROM quizzes')
  if (!q.total) {
    for (const x of data.quizzes) {
      await pool.execute('INSERT INTO quizzes (id,course_id,title,questions) VALUES (?,?,?,?)', [x.id, x.courseId, x.title, JSON.stringify(x.questions)])
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
  const { password, profile_image_url, joined_at, created_at, ...safe } = user
  return {
    ...safe,
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

function withCourseProgress(courses, results, quizzes) {
  return courses.map((course) => {
    const courseResults = results.filter((result) => result.courseId === course.id)
    const totalQuizzes = quizzes.some((quiz) => quiz.courseId === course.id) ? 1 : 0
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

function summarizeStudent(user, studentResults, courses, quizzes) {
  const safeUser = publicUser(user)
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
    courses: coursesWithProgress,
    lastActivity: recentAttempts[0]?.submittedAt || null,
  }
}

async function dbCourses() {
  const [rows] = await pool.query('SELECT id,title,code,description,instructor,duration,level,category,progress,color,material_link AS materialLink,video_link AS videoLink,cover_image_url AS coverImageUrl,created_by AS createdBy FROM courses ORDER BY created_at ASC')
  return rows.map(mapCourse)
}

async function dbResults(studentId) {
  const sql = 'SELECT r.id,r.student_id AS studentId,r.student_name AS studentName,r.course_id AS courseId,c.title AS courseTitle,r.quiz_title AS quizTitle,r.score,r.total,r.percentage,r.submitted_at AS submittedAt FROM results r LEFT JOIN courses c ON c.id=r.course_id'
  const [rows] = studentId ? await pool.execute(`${sql} WHERE r.student_id=? ORDER BY r.submitted_at DESC`, [studentId]) : await pool.query(`${sql} ORDER BY r.submitted_at DESC`)
  return rows
}

async function dbQuizCourseIds() {
  const [rows] = await pool.query('SELECT course_id AS courseId FROM quizzes')
  return rows
}

export async function findUserByEmail(email) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,name,email,password,role,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE email = ? LIMIT 1', [email])
    return rows[0]
  }
  return data.users.find((u) => u.email === email)
}

export async function findUserById(userId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,name,email,password,role,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE id = ? LIMIT 1', [userId])
    return rows[0]
  }
  return data.users.find((u) => u.id === userId)
}

export async function createUser(user) {
  const nextUser = { ...user, joinedAt: user.joinedAt || new Date().toISOString(), profileImageUrl: user.profileImageUrl || '/icons.svg' }
  if (databaseEnabled) {
    await pool.execute('INSERT INTO users (id,name,email,password,role,profile_image_url,joined_at) VALUES (?,?,?,?,?,?,?)', [nextUser.id, nextUser.name, nextUser.email, nextUser.password, nextUser.role, nextUser.profileImageUrl, nextUser.joinedAt])
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
    return filterCourses(withCourseProgress(courses, results, quizzes), search)
  }
  const results = studentId ? data.results.filter((result) => result.studentId === studentId) : []
  return filterCourses(withCourseProgress(data.courses.map(mapCourse), results, data.quizzes), search)
}

export async function createCourse(course, createdBy) {
  const nextCourse = { ...course, category: course.category || 'Cloud' }
  if (databaseEnabled) {
    await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,category,progress,color,material_link,video_link,cover_image_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [nextCourse.id, nextCourse.title, nextCourse.code, nextCourse.description, nextCourse.instructor, nextCourse.duration, nextCourse.level, nextCourse.category, nextCourse.progress, nextCourse.color, nextCourse.materialLink, nextCourse.videoLink, nextCourse.coverImageUrl || '', createdBy])
  } else {
    data.courses.push({ ...nextCourse, createdBy })
  }
  return nextCourse
}

export async function updateCourse(courseId, course) {
  const nextCourse = { ...course, category: course.category || 'Cloud' }
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE courses SET title=?,code=?,description=?,instructor=?,duration=?,level=?,category=?,progress=?,color=?,material_link=?,video_link=?,cover_image_url=? WHERE id=?', [nextCourse.title, nextCourse.code, nextCourse.description, nextCourse.instructor, nextCourse.duration, nextCourse.level, nextCourse.category, nextCourse.progress, nextCourse.color, nextCourse.materialLink, nextCourse.videoLink, nextCourse.coverImageUrl || '', courseId])
    if (!result.affectedRows) return null
    const [rows] = await pool.execute('SELECT id,title,code,description,instructor,duration,level,category,progress,color,material_link AS materialLink,video_link AS videoLink,cover_image_url AS coverImageUrl FROM courses WHERE id=? LIMIT 1', [courseId])
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
  data.quizzes = data.quizzes.filter((quiz) => quiz.courseId !== courseId)
  data.results = data.results.filter((result) => result.courseId !== courseId)
  return true
}

export async function findQuiz(courseId) {
  if (databaseEnabled) {
    const [rows] = await pool.execute('SELECT id,course_id AS courseId,title,questions FROM quizzes WHERE course_id = ? LIMIT 1', [courseId])
    if (!rows[0]) return null
    return { ...rows[0], questions: typeof rows[0].questions === 'string' ? JSON.parse(rows[0].questions) : rows[0].questions }
  }
  return data.quizzes.find((q) => q.courseId === courseId)
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
    return publicUser(await findUserById(userId))
  }
  user.name = name
  user.email = email
  data.results = data.results.map((result) => result.studentId === userId ? { ...result, studentName: name } : result)
  return publicUser(user)
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

export async function updateAvatar(userId, profileImageUrl) {
  const user = await findUserById(userId)
  if (!user) return null
  if (databaseEnabled) {
    await pool.execute('UPDATE users SET profile_image_url=? WHERE id=?', [profileImageUrl, userId])
    return publicUser(await findUserById(userId))
  }
  user.profileImageUrl = profileImageUrl
  return publicUser(user)
}

export async function listStudents() {
  const students = databaseEnabled
    ? (await pool.query("SELECT id,name,email,password,role,profile_image_url AS profileImageUrl,joined_at AS joinedAt,created_at AS createdAt FROM users WHERE role='student' ORDER BY joined_at ASC"))[0]
    : data.users.filter((user) => user.role === 'student')
  const courses = databaseEnabled ? await dbCourses() : data.courses.map(mapCourse)
  const results = databaseEnabled ? await dbResults() : data.results
  const quizzes = databaseEnabled ? await dbQuizCourseIds() : data.quizzes
  return students.map((student) => summarizeStudent(student, results.filter((result) => result.studentId === student.id), courses, quizzes))
}

export async function getAdminStats() {
  const students = await listStudents()
  const courses = await listCourses()
  const results = await listAllResults()
  const averageClassScore = results.length ? Math.round(results.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / results.length) : 0
  return {
    totalStudents: students.length,
    totalCourses: courses.length,
    totalQuizAttempts: results.length,
    averageClassScore,
  }
}
