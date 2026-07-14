import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { demoCourses, demoQuizzes, demoUsers } from '../data/demoData.js'

let pool = null
let databaseEnabled = false
const data = { users: [], courses: [], quizzes: [], results: [] }

export function isDatabaseEnabled() { return databaseEnabled }
export function getPool() { return pool }

export async function initializeDatabase() {
  data.users = await Promise.all(demoUsers.map(async (user) => ({ ...user, password: await bcrypt.hash(user.password, 10) })))
  data.courses = demoCourses.map((course) => ({ ...course }))
  data.quizzes = demoQuizzes.map((quiz) => ({ ...quiz, questions: quiz.questions.map((q) => ({ ...q })) }))
  data.results = []

  if (String(process.env.USE_DATABASE).toLowerCase() !== 'true') {
    console.warn('USE_DATABASE is not true; running with in-memory demo data.')
    return 'demo'
  }
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) { console.warn(`Database configuration is incomplete (${missing.join(', ')}); using demo mode.`); return 'demo' }
  const candidate = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, waitForConnections: true, connectionLimit: 10, queueLimit: 0, charset: 'utf8mb4', connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000) })
  try { pool = candidate; await pool.query('SELECT 1'); await createTables(); await seedDemoData(); databaseEnabled = true; console.log('Connected to AWS RDS MySQL.'); return 'database' }
  catch (error) { await candidate.end().catch(() => {}); pool = null; databaseEnabled = false; console.warn(`Could not connect to MySQL (${error.message}). Continuing in demo mode.`); return 'demo' }
}
export const initializeDataStore = initializeDatabase

async function createTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'student', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, code VARCHAR(50) NOT NULL, description TEXT NOT NULL, instructor VARCHAR(120) NOT NULL, duration VARCHAR(80) NOT NULL, level VARCHAR(80) NOT NULL, progress INT NOT NULL DEFAULT 0, color VARCHAR(20) NOT NULL DEFAULT '#2e8b57', material_link TEXT, video_link TEXT, created_by VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS quizzes (id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL UNIQUE, title VARCHAR(255) NOT NULL, questions LONGTEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS results (id VARCHAR(64) PRIMARY KEY, student_id VARCHAR(64) NOT NULL, student_name VARCHAR(120) NOT NULL, course_id VARCHAR(64) NOT NULL, quiz_title VARCHAR(255) NOT NULL, score INT NOT NULL, total INT NOT NULL, percentage INT NOT NULL, answers LONGTEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
}
async function seedDemoData() {
  const [[u]] = await pool.query('SELECT COUNT(*) AS total FROM users'); if (!u.total) for (const x of data.users) await pool.execute('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)', [x.id,x.name,x.email,x.password,x.role])
  const [[c]] = await pool.query('SELECT COUNT(*) AS total FROM courses'); if (!c.total) for (const x of data.courses) await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,progress,color,material_link,video_link,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [x.id,x.title,x.code,x.description,x.instructor,x.duration,x.level,x.progress,x.color,x.materialLink,x.videoLink,x.createdBy])
  const [[q]] = await pool.query('SELECT COUNT(*) AS total FROM quizzes'); if (!q.total) for (const x of data.quizzes) await pool.execute('INSERT INTO quizzes (id,course_id,title,questions) VALUES (?,?,?,?)', [x.id,x.courseId,x.title,JSON.stringify(x.questions)])
}

export async function findUserByEmail(email) { if (databaseEnabled) { const [rows] = await pool.execute('SELECT id,name,email,password,role FROM users WHERE email = ? LIMIT 1',[email]); return rows[0] } return data.users.find((u) => u.email === email) }
export async function createUser(user) { if (databaseEnabled) await pool.execute('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)',[user.id,user.name,user.email,user.password,user.role]); else data.users.push(user); return user }
export async function listCourses() { if (databaseEnabled) { const [rows] = await pool.query('SELECT id,title,code,description,instructor,duration,level,progress,color,material_link AS materialLink,video_link AS videoLink FROM courses ORDER BY created_at ASC'); return rows } return data.courses }
export async function createCourse(course, createdBy) { if (databaseEnabled) await pool.execute('INSERT INTO courses (id,title,code,description,instructor,duration,level,progress,color,material_link,video_link,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[course.id,course.title,course.code,course.description,course.instructor,course.duration,course.level,course.progress,course.color,course.materialLink,course.videoLink,createdBy]); else data.courses.push({ ...course, createdBy }); return course }
export async function updateCourse(courseId, course) {
  if (databaseEnabled) {
    const [result] = await pool.execute('UPDATE courses SET title=?,code=?,description=?,instructor=?,duration=?,level=?,progress=?,color=?,material_link=?,video_link=? WHERE id=?',[course.title,course.code,course.description,course.instructor,course.duration,course.level,course.progress,course.color,course.materialLink,course.videoLink,courseId])
    if (!result.affectedRows) return null
    const [rows] = await pool.execute('SELECT id,title,code,description,instructor,duration,level,progress,color,material_link AS materialLink,video_link AS videoLink FROM courses WHERE id=? LIMIT 1',[courseId])
    return rows[0]
  }
  const index = data.courses.findIndex((item) => item.id === courseId)
  if (index === -1) return null
  data.courses[index] = { ...data.courses[index], ...course, id: courseId }
  return data.courses[index]
}
export async function deleteCourse(courseId) {
  if (databaseEnabled) {
    await pool.execute('DELETE FROM results WHERE course_id=?',[courseId])
    await pool.execute('DELETE FROM quizzes WHERE course_id=?',[courseId])
    const [result] = await pool.execute('DELETE FROM courses WHERE id=?',[courseId])
    return result.affectedRows > 0
  }
  const index = data.courses.findIndex((item) => item.id === courseId)
  if (index === -1) return false
  data.courses.splice(index, 1)
  data.quizzes = data.quizzes.filter((quiz) => quiz.courseId !== courseId)
  data.results = data.results.filter((result) => result.courseId !== courseId)
  return true
}
export async function findQuiz(courseId) { if (databaseEnabled) { const [rows] = await pool.execute('SELECT id,course_id AS courseId,title,questions FROM quizzes WHERE course_id = ? LIMIT 1',[courseId]); if (!rows[0]) return null; return { ...rows[0], questions: typeof rows[0].questions === 'string' ? JSON.parse(rows[0].questions) : rows[0].questions } } return data.quizzes.find((q) => q.courseId === courseId) }
export async function saveResult(result, answers) { if (databaseEnabled) await pool.execute('INSERT INTO results (id,student_id,student_name,course_id,quiz_title,score,total,percentage,answers) VALUES (?,?,?,?,?,?,?,?,?)',[result.id,result.studentId,result.studentName,result.courseId,result.quizTitle,result.score,result.total,result.percentage,JSON.stringify(answers)]); else data.results.push({ ...result, answers }); return result }
function publicResult(result) { const { answers, ...safe } = result; return safe }
export async function listResults(studentId) { if (databaseEnabled) { const [rows] = await pool.execute('SELECT r.id,r.student_id AS studentId,r.student_name AS studentName,r.course_id AS courseId,c.title AS courseTitle,r.quiz_title AS quizTitle,r.score,r.total,r.percentage,r.submitted_at AS submittedAt FROM results r LEFT JOIN courses c ON c.id=r.course_id WHERE r.student_id=? ORDER BY r.submitted_at DESC',[studentId]); return rows } return data.results.filter((r) => r.studentId === studentId).map((r) => ({ ...publicResult(r), courseTitle: data.courses.find((c) => c.id === r.courseId)?.title })) }
export async function listAllResults() { if (databaseEnabled) { const [rows] = await pool.query('SELECT r.id,r.student_id AS studentId,r.student_name AS studentName,r.course_id AS courseId,c.title AS courseTitle,r.quiz_title AS quizTitle,r.score,r.total,r.percentage,r.submitted_at AS submittedAt FROM results r LEFT JOIN courses c ON c.id=r.course_id ORDER BY r.submitted_at DESC'); return rows } return data.results.map((r) => ({ ...publicResult(r), courseTitle: data.courses.find((c) => c.id === r.courseId)?.title })) }
