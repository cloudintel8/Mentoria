import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const demoUsers = [
  { id: 'admin-001', name: 'Demo Administrator', email: 'admin@cloudlearn.edu', role: 'admin', password: 'Admin123!' },
  { id: 'lecturer-001', name: 'Demo Lecturer', email: 'lecturer@cloudlearn.edu', role: 'lecturer', password: 'Lecturer123!' },
  { id: 'student-001', name: 'Demo Student', email: 'student@cloudlearn.edu', role: 'student', password: 'Student123!' },
]

const demoCourses = [
  {
    id: 'course-cloud-101',
    title: 'Cloud Computing Fundamentals',
    code: 'CC 101',
    description: 'Learn cloud service models, virtualization, elasticity, regions, availability zones, and shared responsibility.',
    instructor: 'Dr. Maya Perera',
    duration: '8 weeks',
    level: 'Beginner',
    progress: 72,
    color: '#6558e8',
    materialLink: 'https://cloud-elearning-storage-2026.s3.ap-southeast-1.amazonaws.com/courses/cloud-fundamentals.pdf',
    videoLink: 'https://cloud-elearning-storage-2026.s3.ap-southeast-1.amazonaws.com/videos/cloud-introduction.mp4',
    createdBy: 'admin-001',
  },
  {
    id: 'course-aws-201',
    title: 'AWS Services & Architecture',
    code: 'AWS 201',
    description: 'Design resilient cloud solutions using core AWS compute, networking, storage, and identity services.',
    instructor: 'Prof. Nimal Fernando',
    duration: '10 weeks',
    level: 'Intermediate',
    progress: 38,
    color: '#e26d49',
    materialLink: 'https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html',
    videoLink: 'https://aws.amazon.com/training/',
    createdBy: 'lecturer-001',
  },
  {
    id: 'course-devops-301',
    title: 'DevOps on the Cloud',
    code: 'DEV 301',
    description: 'Build CI/CD pipelines and explore infrastructure as code, containers, monitoring, and deployment strategies.',
    instructor: 'Ms. Anjali Silva',
    duration: '6 weeks',
    level: 'Advanced',
    progress: 15,
    color: '#1d9d78',
    materialLink: 'https://aws.amazon.com/devops/what-is-devops/',
    videoLink: 'https://aws.amazon.com/devops/',
    createdBy: 'lecturer-001',
  },
]

const demoQuizzes = [
  {
    id: 'quiz-cloud-101',
    courseId: 'course-cloud-101',
    title: 'Cloud Foundations Checkpoint',
    questions: [
      { id: 'q1', text: 'Which cloud model provides virtual machines and networking?', options: ['SaaS', 'PaaS', 'IaaS', 'FaaS'], correctAnswer: 2 },
      { id: 'q2', text: 'What describes automatically adding resources when demand rises?', options: ['Elasticity', 'Encryption', 'Archiving', 'Federation'], correctAnswer: 0 },
      { id: 'q3', text: 'Which AWS service provides object storage?', options: ['Amazon EC2', 'Amazon RDS', 'Amazon S3', 'AWS Lambda'], correctAnswer: 2 },
      { id: 'q4', text: 'An AWS Region is best described as:', options: ['One data center', 'A geographic area containing Availability Zones', 'A private subnet', 'A billing account'], correctAnswer: 1 },
      { id: 'q5', text: 'Who secures customer data under the shared responsibility model?', options: ['Only AWS', 'Only the ISP', 'The customer, with responsibilities varying by service', 'Nobody'], correctAnswer: 2 },
    ],
  },
  {
    id: 'quiz-aws-201',
    courseId: 'course-aws-201',
    title: 'AWS Architecture Quiz',
    questions: [
      { id: 'q1', text: 'Which service controls access through users, roles, and policies?', options: ['IAM', 'CloudFront', 'Route 53', 'SQS'], correctAnswer: 0 },
      { id: 'q2', text: 'What improves availability within one Region?', options: ['Using one instance', 'Deploying across Availability Zones', 'Storing files locally', 'Disabling health checks'], correctAnswer: 1 },
      { id: 'q3', text: 'Which service is a managed relational database?', options: ['Amazon S3', 'Amazon RDS', 'Amazon SNS', 'Amazon ECR'], correctAnswer: 1 },
    ],
  },
]

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
})

export async function initializeDatabase() {
  await createTables()
  await seedDemoData()
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      code VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      instructor VARCHAR(120) NOT NULL,
      duration VARCHAR(80) NOT NULL,
      level VARCHAR(80) NOT NULL,
      progress INT NOT NULL DEFAULT 0,
      color VARCHAR(20) NOT NULL DEFAULT '#2e8b57',
      material_link TEXT,
      video_link TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_courses_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id VARCHAR(64) PRIMARY KEY,
      course_id VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      questions LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_quizzes_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS results (
      id VARCHAR(64) PRIMARY KEY,
      student_id VARCHAR(64) NOT NULL,
      student_name VARCHAR(120) NOT NULL,
      course_id VARCHAR(64) NOT NULL,
      quiz_title VARCHAR(255) NOT NULL,
      score INT NOT NULL,
      total INT NOT NULL,
      percentage INT NOT NULL,
      answers LONGTEXT,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_results_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_results_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `)
}

async function seedDemoData() {
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (!userCount.total) {
    for (const user of demoUsers) {
      await pool.execute(
        'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.name, user.email, await bcrypt.hash(user.password, 10), user.role],
      )
    }
  }

  const [[courseCount]] = await pool.query('SELECT COUNT(*) AS total FROM courses')
  if (!courseCount.total) {
    for (const course of demoCourses) {
      await pool.execute(
        `INSERT INTO courses
          (id, title, code, description, instructor, duration, level, progress, color, material_link, video_link, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          course.id,
          course.title,
          course.code,
          course.description,
          course.instructor,
          course.duration,
          course.level,
          course.progress,
          course.color,
          course.materialLink,
          course.videoLink,
          course.createdBy,
        ],
      )
    }
  }

  const [[quizCount]] = await pool.query('SELECT COUNT(*) AS total FROM quizzes')
  if (!quizCount.total) {
    for (const quiz of demoQuizzes) {
      await pool.execute(
        'INSERT INTO quizzes (id, course_id, title, questions) VALUES (?, ?, ?, ?)',
        [quiz.id, quiz.courseId, quiz.title, JSON.stringify(quiz.questions)],
      )
    }
  }
}
