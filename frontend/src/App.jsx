import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from './api'
import './App.css'

const AuthContext = createContext(null)
const ToastContext = createContext(null)
const ThemeContext = createContext(null)

const icons = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  courses: 'M4 5.5 12 2l8 3.5v10L12 19l-8-3.5v-10Zm8-1.3L6.7 6.5 12 8.8l5.3-2.3L12 4.2ZM6 8v6.2l5 2.2v-6.2L6 8Zm7 8.4 5-2.2V8l-5 2.2v6.2Z',
  quiz: 'M9 3h6l1 2h3v16H5V5h3l1-2Zm1.2 2-.5 1H7v13h10V7h-2.7l-.5-1h-3.6ZM9 10h6v2H9v-2Zm0 4h6v2H9v-2Z',
  result: 'M5 3h14v18H5V3Zm2 2v14h10V5H7Zm2 9 2-2 1.5 1.5L15 10l1.4 1.4-3.9 3.9-1.5-1.5-.6.6L9 14Z',
  logout: 'M10 4H5v16h5v-2H7V6h3V4Zm5.6 3.6L14.2 9l2 2H9v2h7.2l-2 2 1.4 1.4L20 12l-4.4-4.4Z',
  arrow: 'm9 18 6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 15v5h14v-5',
  play: 'm9 7 8 5-8 5V7Z',
  file: 'M6 2h8l4 4v16H6V2Zm8 2.5V8h3.5L14 4.5ZM8 11v2h8v-2H8Zm0 4v2h8v-2Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0H5Z',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm8.5 4a8.8 8.8 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L16 3.5h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a8.8 8.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z',
  students: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a6 6 0 0 1 12 0H2Zm12.5 0a7.5 7.5 0 0 0-2.1-5.2A5 5 0 0 1 22 18v3h-7.5Z',
  moon: 'M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z',
}

function Icon({ name, size = 20 }) {
  const strokeOnly = ['arrow', 'plus', 'upload', 'menu'].includes(name)
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={strokeOnly ? 'none' : 'currentColor'} stroke={strokeOnly ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts((items) => [...items, { id, message, type }])
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500)
  }, [])
  return <ToastContext.Provider value={showToast}>{children}<div className="toast-stack">{toasts.map((toast) => <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>)}</div></ToastContext.Provider>
}

function useToast() {
  return useContext(ToastContext)
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(localStorage.getItem('cloudlearn-theme') || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cloudlearn-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme((value) => value === 'dark' ? 'light' : 'dark')
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

function useTheme() {
  return useContext(ThemeContext)
}

function AuthProvider({ children }) {
  const saved = JSON.parse(localStorage.getItem('cloudlearn-auth') || 'null')
  const [auth, setAuth] = useState(saved)
  const signIn = (payload) => { setAuth(payload); localStorage.setItem('cloudlearn-auth', JSON.stringify(payload)) }
  const updateUser = (user) => {
    setAuth((current) => {
      if (!current) return current
      const next = { ...current, user: { ...current.user, ...user } }
      localStorage.setItem('cloudlearn-auth', JSON.stringify(next))
      return next
    })
  }
  const signOut = () => { setAuth(null); localStorage.removeItem('cloudlearn-auth') }
  return <AuthContext.Provider value={{ auth, signIn, signOut, updateUser }}>{children}</AuthContext.Provider>
}

function Protected({ roles, children }) {
  const { auth } = useContext(AuthContext)
  if (!auth) return <Navigate to="/login" replace />
  if (roles && !roles.includes(auth.user.role)) return <Navigate to={auth.user.role === 'student' ? '/dashboard' : '/admin'} replace />
  return children
}

function Logo() {
  return <Link className="logo" to="/"><span className="logo-mark">C</span><span>Cloud<span>Learn</span></span></Link>
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return <button className="theme-toggle" type="button" onClick={toggleTheme}><Icon name="moon" size={17} />{theme === 'dark' ? 'Light' : 'Dark'}</button>
}

function Loading({ text = 'Loading...' }) {
  return <div className="loading enhanced"><span className="spinner" />{text}</div>
}

function Empty({ title, text, action, to }) {
  return <div className="empty"><span>CL</span><h2>{title}</h2><p>{text}</p>{action && <Link className="button primary" to={to}>{action}</Link>}</div>
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Not available'
}

function statusFor(percent) {
  return Number(percent) >= 60 ? 'Passed' : 'Needs Improvement'
}

function badgeFor(course) {
  if (course.completionStatus) return course.completionStatus
  if (Number(course.progress) >= 100) return 'Completed'
  if (Number(course.progress) > 0) return 'In Progress'
  return 'Not Started'
}

function MarketingNav() {
  const { auth } = useContext(AuthContext)
  return <header className="marketing-nav"><Logo /><nav><a href="#features">Features</a><Link to="/public-courses">Courses</Link><a href="#about">About</a></nav><div className="nav-actions"><ThemeToggle />{auth ? <Link className="button primary small" to={auth.user.role === 'student' ? '/dashboard' : '/admin'}>Dashboard</Link> : <><Link className="text-link" to="/login">Sign in</Link><Link className="button primary small" to="/register">Get started</Link></>}</div></header>
}

function Landing() {
  const { courses, loading, error } = usePublicCourses()
  const featureCards = [
    ['Cloud-based learning', 'Access courses anytime with cloud-hosted content.'],
    ['Online assessments', 'Take quizzes and view instant results.'],
    ['Progress tracking', 'Track course completion, quiz attempts, and scores.'],
    ['Secure cloud storage', 'Course materials and media are stored using AWS S3.'],
    ['Student profiles', 'Manage personal profile, profile picture, and learning history.'],
    ['Admin course management', 'Lecturers can add, edit, delete, and manage courses.'],
  ]
  const steps = ['Browse courses', 'Register for free', 'Start learning', 'Complete quizzes and track progress']
  const heroCourse = courses[0]
  return <div className="landing"><MarketingNav /><main>
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow">LEARN. BUILD. GROW.</span><h1>Master the cloud.<br /><em>Shape your future.</em></h1><p>Practical cloud computing courses built for curious minds. Learn at your pace, test your skills, and become cloud-ready.</p><div className="hero-actions"><Link className="button primary" to="/register">Start learning free <Icon name="arrow" /></Link><Link className="button ghost" to="/public-courses">Explore courses</Link></div><div className="hero-proof"><div className="avatar-stack"><span>NP</span><span>AS</span><span>MK</span></div><p><strong>1,200+ learners</strong><br />already growing with us</p></div></div><div className="hero-art"><div className="orb one" /><div className="orb two" /><div className="cloud-card main-card"><div className="card-top"><span className="course-symbol">CL</span><span className="status-pill">{heroCourse?.level || 'Cloud ready'}</span></div><small>FEATURED COURSE</small><h3>{heroCourse?.title || 'Cloud learning path'}</h3><div className="mini-progress"><span style={{ width: '100%' }} /></div><div className="card-bottom"><span>{heroCourse?.duration || 'Self-paced'}</span><b>Preview -&gt;</b></div></div><div className="float-card score-card"><strong>92%</strong><span>Quiz score</span></div><div className="float-card lesson-card"><span className="play-dot">Play</span><div><strong>24 lessons</strong><small>Video + reading</small></div></div></div></section>
    <section id="features" className="feature-strip"><article><span>01</span><h3>Learn by doing</h3><p>Courses grounded in real-world cloud scenarios.</p></article><article><span>02</span><h3>Track your growth</h3><p>Clear progress, quizzes, and instant results.</p></article><article><span>03</span><h3>Built for the cloud</h3><p>Materials and media delivered securely with AWS.</p></article></section>
    <section className="marketing-section"><div className="section-intro compact"><span className="eyebrow">PLATFORM FEATURES</span><h2>Everything learners and lecturers need.</h2><p>CloudLearn combines course delivery, assessments, results, and administration in one clean REST API-driven experience.</p></div><div className="marketing-grid">{featureCards.map(([title, text], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="marketing-section split"><div><span className="eyebrow">HOW IT WORKS</span><h2>From browsing to progress in four simple steps.</h2></div><div className="how-grid">{steps.map((step, index) => <article key={step}><strong>{index + 1}</strong><span>{step}</span></article>)}</div></section>
    <section id="about" className="section-intro why-panel"><span className="eyebrow">WHY CLOUDLEARN</span><h2>A clearer path into<br />cloud computing.</h2><p>Built for cloud learning with a React frontend, REST API backend, AWS S3-ready media storage, RDS MySQL support, and a secure scalable design that can grow beyond demo mode.</p></section>
    <section className="marketing-section"><div className="section-title public-title"><div><span className="eyebrow">POPULAR COURSES</span><h2>Start with these cloud learning paths.</h2></div><Link to="/public-courses">View all courses -&gt;</Link></div>{loading ? <Loading text="Loading featured courses..." /> : error ? <div className="alert error">{error}</div> : courses.length ? <div className="popular-grid">{courses.slice(0, 3).map((course) => <PublicCourseCard key={course.id} course={course} compact />)}</div> : <Empty title="No courses available" text="Please check back soon for new cloud learning paths." />}</section>
    <section className="final-cta"><span className="eyebrow light">START TODAY</span><h2>Ready to begin your cloud learning journey?</h2><p>Browse the catalogue first, then create your free account when you are ready to start a course.</p><div className="hero-actions"><Link className="button light" to="/register">Create your free account</Link><Link className="button ghost light-ghost" to="/public-courses">Explore courses</Link></div></section>
  </main><footer><Logo /><span>University cloud computing project - 2026</span></footer></div>
}

function AuthPage({ register = false }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useContext(AuthContext)
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const selectedCourseId = new URLSearchParams(location.search).get('courseId')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post(register ? '/auth/register' : '/auth/login', form)
      signIn(data)
      toast(data.message || 'Login successful.')
      const studentTarget = register && selectedCourseId ? `/courses/${encodeURIComponent(selectedCourseId)}` : '/dashboard'
      navigate(data.user.role === 'student' ? studentTarget : '/admin')
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to connect to server.'
      setError(message)
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }
  return <div className="auth-page"><div className="auth-side"><Logo /><div><span className="eyebrow light">CLOUD LEARNING, SIMPLIFIED</span><h1>{register ? 'Begin your cloud journey.' : 'Welcome back to your journey.'}</h1><p>Learn practical skills, follow your progress, and keep moving forward one lesson at a time.</p></div><small>2026 CloudLearn</small></div><div className="auth-main"><form className="auth-form" onSubmit={submit}><Link className="back-link" to="/">Back to home</Link><span className="eyebrow">{register ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</span><h2>{register ? 'Join CloudLearn' : 'Sign in to CloudLearn'}</h2><p>{register ? 'Free access to courses, quizzes, and results.' : 'Enter your details to continue learning.'}</p>{error && <div className="alert error">{error}</div>}{register && <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" required /></label>}<label>Email address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></label><label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" required /></label><button className="button primary full" disabled={loading}>{loading ? 'Please wait...' : register ? 'Create my account' : 'Sign in'}</button><p className="switch-auth">{register ? 'Already have an account?' : 'New to CloudLearn?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>{!register && <div className="demo-note"><strong>Demo accounts</strong><span>Student: student@cloudlearn.edu / Student123!</span><span>Admin: admin@cloudlearn.edu / Admin123!</span></div>}</form></div></div>
}

function AppShell({ children, admin = false }) {
  const { auth, signOut } = useContext(AuthContext)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const nav = admin
    ? [{ to: '/admin', label: 'Overview', icon: 'dashboard' }, { to: '/admin/courses', label: 'Manage courses', icon: 'courses' }, { to: '/admin/students', label: 'Manage students', icon: 'students' }, { to: '/admin/results', label: 'Student results', icon: 'result' }, { to: '/admin/upload', label: 'S3 uploads', icon: 'upload' }]
    : [{ to: '/dashboard', label: 'Overview', icon: 'dashboard' }, { to: '/courses', label: 'My courses', icon: 'courses' }, { to: '/results', label: 'Quiz results', icon: 'result' }, { to: '/profile', label: 'My profile', icon: 'profile' }]
  return <div className="app-shell"><aside className={open ? 'sidebar open' : 'sidebar'}><div className="side-head"><Logo /><button className="icon-button mobile-only" onClick={() => setOpen(false)}>X</button></div><span className="side-label">{admin ? 'ADMIN WORKSPACE' : 'LEARNING SPACE'}</span><nav>{nav.map((item) => <NavLink key={item.to} to={item.to} end onClick={() => setOpen(false)}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav><div className="side-bottom"><div className="user-chip"><span>{auth.user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span><div><strong>{auth.user.name}</strong><small>{auth.user.role}</small></div></div><button onClick={() => { signOut(); navigate('/') }}><Icon name="logout" /> Sign out</button></div></aside><section className="app-main"><header className="app-top"><button className="icon-button mobile-only" onClick={() => setOpen(true)}><Icon name="menu" /></button><div><span className="eyebrow">CLOUDLEARN</span></div><div className="top-actions"><ThemeToggle /><div className="top-status"><span className="online-dot" /> AWS ready</div></div></header><div className="page-content">{children}</div></section></div>
}

function useCourses(studentId) {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    setLoading(true)
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
    return api.get(`/courses${query}`).then(({ data }) => setCourses(data)).finally(() => setLoading(false))
  }, [studentId])
  useEffect(() => { refresh() }, [refresh])
  return { courses, loading, refresh }
}

function usePublicCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true)
    setError('')
    api.get('/courses').then(({ data }) => setCourses(data)).catch(() => setError('Failed to connect to server. Please try again shortly.')).finally(() => setLoading(false))
  }, [])
  return { courses, loading, error }
}

function useResults(studentId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    if (!studentId) return Promise.resolve()
    setLoading(true)
    return api.get(`/results/${studentId}`).then(({ data }) => setItems(data)).finally(() => setLoading(false))
  }, [studentId])
  useEffect(() => { refresh() }, [refresh])
  return { items, loading, refresh }
}

function Dashboard() {
  const { auth } = useContext(AuthContext)
  const { courses, loading } = useCourses(auth.user.id)
  const [profile, setProfile] = useState(null)
  useEffect(() => { api.get(`/profile/${auth.user.id}`).then(({ data }) => setProfile(data)).catch(() => {}) }, [auth.user.id])
  const averageProgress = courses.length ? Math.round(courses.reduce((sum, course) => sum + Number(course.progress || 0), 0) / courses.length) : 0
  return <AppShell><div className="page-heading"><div><span className="eyebrow">STUDENT DASHBOARD</span><h1>Good evening, {auth.user.name.split(' ')[0]}.</h1><p>Pick up where you left off and keep the momentum going.</p></div><div className="heading-actions"><Link className="button ghost" to="/profile">My Profile</Link><Link className="button primary" to="/courses">Browse courses <Icon name="arrow" /></Link></div></div><div className="stats-row"><StatCard icon="courses" label="Total courses" value={loading ? '-' : courses.length} /><StatCard icon="quiz" label="Completed quizzes" value={profile?.completedQuizzes ?? 0} /><StatCard icon="result" label="Average score" value={`${profile?.averageScore ?? 0}%`} /><StatCard icon="dashboard" label="Course progress" value={`${averageProgress}%`} /><StatCard icon="file" label="Available assessments" value={courses.reduce((sum, course) => sum + Number(course.totalQuizzes || 0), 0)} /></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">CONTINUE LEARNING</span><h2>Your courses</h2></div><Link to="/courses">View all -&gt;</Link></div>{loading ? <Loading text="Loading courses..." /> : <div className="course-grid">{courses.slice(0, 3).map((course) => <CourseCard key={course.id} course={course} />)}</div>}</section></AppShell>
}

function StatCard({ icon, label, value }) {
  return <div><span className="stat-icon purple"><Icon name={icon} /></span><p>{label}<strong>{value}</strong></p></div>
}

function CourseCard({ course }) {
  const badge = badgeFor(course)
  const coverStyle = course.coverImageUrl ? { '--course-color': course.color, backgroundImage: `linear-gradient(135deg, rgba(20,22,48,.78), rgba(20,22,48,.42)), url("${course.coverImageUrl}")` } : { '--course-color': course.color }
  return <article className="course-card"><div className={course.coverImageUrl ? 'course-cover has-image' : 'course-cover'} style={coverStyle}><span>{course.code}</span><i>{course.category || 'Cloud'}</i></div><div className="course-body"><div className="card-row"><span className="course-meta">{course.level} - {course.duration}</span><span className={`status-badge ${badge.toLowerCase().replaceAll(' ', '-')}`}>{badge}</span></div><h3>{course.title}</h3><p>{course.description}</p><div className="progress-label"><span>{course.progress}% completed</span><strong>{course.completedQuizzes || 0}/{course.totalQuizzes || 1} quizzes</strong></div><div className="progress"><span style={{ width: `${course.progress || 0}%`, background: course.color }} /></div><Link to={`/courses/${course.id}`}>Continue course <Icon name="arrow" size={17} /></Link></div></article>
}

function PublicCourseCard({ course, compact = false }) {
  const coverStyle = course.coverImageUrl ? { '--course-color': course.color, backgroundImage: `linear-gradient(135deg, rgba(15,18,42,.82), rgba(15,18,42,.46)), url("${course.coverImageUrl}")` } : { '--course-color': course.color }
  return <article className={compact ? 'public-course-card compact' : 'public-course-card'}><div className={course.coverImageUrl ? 'public-course-cover has-image' : 'public-course-cover'} style={coverStyle}><span>{course.code}</span><strong>{course.category || 'Cloud'}</strong></div><div className="public-course-body"><div className="card-row"><span className="course-meta">{course.level}</span><span className="level-chip">{course.duration}</span></div><h3>{course.title}</h3><p>{course.description}</p><dl><div><dt>Instructor</dt><dd>{course.instructor || 'CloudLearn Faculty'}</dd></div><div><dt>Level</dt><dd>{course.level || 'Beginner'}</dd></div></dl><Link className="button ghost full" to={`/public-courses/${course.id}`}>View details <Icon name="arrow" size={17} /></Link></div></article>
}

function PublicCourses() {
  const { courses, loading, error } = usePublicCourses()
  return <div className="landing public-page"><MarketingNav /><main><section className="public-heading"><span className="eyebrow">COURSE CATALOGUE</span><h1>Explore cloud courses before you register.</h1><p>Preview available CloudLearn courses, instructors, levels, and duration. Progress tracking begins after you create a student account.</p></section>{loading ? <Loading text="Loading public courses..." /> : error ? <div className="public-error"><h2>Courses could not be loaded</h2><p>{error}</p></div> : courses.length ? <section className="public-course-grid">{courses.map((course) => <PublicCourseCard key={course.id} course={course} />)}</section> : <Empty title="No courses available" text="Please check back soon for new cloud learning paths." />}</main><footer><Logo /><span>Browse first. Register when you are ready.</span></footer></div>
}

function PublicCourseDetail() {
  const { courseId } = useParams()
  const { auth } = useContext(AuthContext)
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/courses/${courseId}`).then(({ data }) => setCourse(data)).catch((err) => setError(err.response?.data?.message || 'This course is not available right now.')).finally(() => setLoading(false))
  }, [courseId])
  if (loading) return <div className="landing public-page"><MarketingNav /><Loading text="Loading course details..." /></div>
  if (error || !course) return <div className="landing public-page"><MarketingNav /><main><Empty title="Course not found" text={error || 'This course may no longer be available.'} action="Explore courses" to="/public-courses" /></main></div>
  const heroStyle = course.coverImageUrl ? { '--course-color': course.color, backgroundImage: `linear-gradient(135deg, rgba(15,18,42,.9), rgba(15,18,42,.5)), url("${course.coverImageUrl}")` } : { '--course-color': course.color }
  const startTo = auth ? (auth.user.role === 'student' ? `/courses/${course.id}` : '/admin') : `/register?courseId=${encodeURIComponent(course.id)}`
  return <div className="landing public-page"><MarketingNav /><main><Link className="back-link public-back" to="/public-courses">Back to public courses</Link><section className={course.coverImageUrl ? 'public-detail-hero has-image' : 'public-detail-hero'} style={heroStyle}><div><span className="tag">{course.code} - {course.level}</span><h1>{course.title}</h1><p>{course.description}</p><div className="detail-meta"><span>Instructor <strong>{course.instructor || 'CloudLearn Faculty'}</strong></span><span>{course.duration}</span><span>{course.category || 'Cloud'}</span></div><Link className="button light" to={startTo}>{auth ? 'Open course' : 'Get Started'} <Icon name="arrow" /></Link></div></section><section className="public-detail-layout"><main><span className="eyebrow">COURSE PREVIEW</span><h2>What you can expect</h2><p>Preview professional cloud learning materials, guided resources, and practical assessment activities before creating your account.</p><div className="preview-panel"><h3>Materials preview</h3><p>Includes lesson notes, cloud architecture examples, and curated learning resources for this topic.</p></div></main><aside className="preview-panel assessment"><span className="assessment-pill">Assessment available</span><h3>Knowledge check included</h3><p>This course includes a multiple-choice quiz. Register to start the course, submit answers, and track your results.</p><Link className="button primary full" to={startTo}>{auth ? 'Continue learning' : 'Get Started'}</Link></aside></section></main><footer><Logo /><span>CloudLearn public course preview</span></footer></div>
}

function Courses() {
  const { auth } = useContext(AuthContext)
  const { courses, loading } = useCourses(auth?.user?.id)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('All')
  const filtered = useMemo(() => courses.filter((course) => {
    const matchesLevel = level === 'All' || course.level === level
    const query = search.toLowerCase().trim()
    const matchesSearch = !query || [course.title, course.code, course.description, course.instructor].some((value) => value?.toLowerCase().includes(query))
    return matchesLevel && matchesSearch
  }), [courses, search, level])
  return <AppShell><div className="page-heading compact"><div><span className="eyebrow">COURSE CATALOGUE</span><h1>Explore your courses.</h1><p>Practical learning paths for modern cloud skills.</p></div></div><div className="course-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, code, description, or instructor" /><select value={level} onChange={(e) => setLevel(e.target.value)}><option>All</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div>{loading ? <Loading text="Loading courses..." /> : filtered.length ? <div className="course-grid wide">{filtered.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <Empty title={search ? 'No matching courses found' : 'No courses found'} text="Try a different search term or level filter." />}</AppShell>
}

function CourseDetail() {
  const { id } = useParams()
  const { auth } = useContext(AuthContext)
  const { courses, loading } = useCourses(auth?.user?.id)
  const course = courses.find((item) => item.id === id)
  if (loading) return <AppShell><Loading text="Loading course..." /></AppShell>
  if (!course) return <AppShell><Empty title="Course not found" text="This course may no longer be available." /></AppShell>
  const heroStyle = course.coverImageUrl ? { '--course-color': course.color, backgroundImage: `linear-gradient(135deg, rgba(22,24,54,.86), rgba(22,24,54,.48)), url("${course.coverImageUrl}")` } : { '--course-color': course.color }
  return <AppShell><div className="detail-actions"><Link className="back-link" to="/courses">Back to courses</Link><Link className="button ghost" to="/dashboard">Go to Dashboard</Link></div><div className={course.coverImageUrl ? 'detail-hero has-image' : 'detail-hero'} style={heroStyle}><div><span className="tag">{course.code} - {course.level}</span><h1>{course.title}</h1><p>{course.description}</p><div className="detail-meta"><span>By <strong>{course.instructor}</strong></span><span>{course.duration}</span><span>{course.progress}% completed</span></div></div><div className="detail-cloud">{course.category || 'Cloud'}</div></div><div className="detail-layout"><main><span className="eyebrow">COURSE RESOURCES</span><h2>Materials & lessons</h2><a className="resource-card" href={course.materialLink} target="_blank" rel="noreferrer"><span className="resource-icon"><Icon name="file" /></span><div><small>COURSE MATERIAL</small><strong>Lecture notes and learning resources</strong><span>Open material</span></div></a><a className="resource-card" href={course.videoLink} target="_blank" rel="noreferrer"><span className="resource-icon video"><Icon name="play" /></span><div><small>VIDEO LESSON</small><strong>Watch the course video</strong><span>Start watching</span></div></a></main><aside className="quiz-callout"><span className="eyebrow light">KNOWLEDGE CHECK</span><h3>Ready to test what you learned?</h3><p>Take the multiple-choice quiz and get your score instantly.</p><Link className="button light full" to={`/quiz/${course.id}`}>Start quiz <Icon name="arrow" /></Link></aside></div></AppShell>
}

function Quiz() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    api.get(`/quiz/${courseId}`).then(({ data }) => setQuiz(data)).catch((err) => setError(err.response?.data?.message || 'Quiz unavailable.')).finally(() => setLoading(false))
  }, [courseId])
  const submit = async () => {
    if (Object.keys(answers).length !== quiz.questions.length) return setError('Please answer every question before submitting.')
    try {
      const { data } = await api.post('/quiz/submit', { courseId, answers })
      toast('Quiz submitted successfully.')
      navigate('/quiz/result', { state: data })
    } catch (err) {
      const message = err.response?.data?.message || 'Could not submit quiz.'
      setError(message)
      toast(message, 'error')
    }
  }
  if (loading) return <AppShell><Loading text="Preparing quiz..." /></AppShell>
  if (error && !quiz) return <AppShell><Empty title="Quiz unavailable" text={error} /></AppShell>
  return <AppShell><div className="quiz-header"><Link className="back-link" to={`/courses/${courseId}`}>Back to course</Link><span>{Object.keys(answers).length} of {quiz.questions.length} answered</span></div><div className="quiz-wrap"><span className="eyebrow">KNOWLEDGE CHECK</span><h1>{quiz.title}</h1><p>Choose the best answer for each question.</p>{error && <div className="alert error">{error}</div>}<div className="questions">{quiz.questions.map((question, qIndex) => <fieldset key={question.id}><legend><span>{String(qIndex + 1).padStart(2, '0')}</span>{question.text}</legend>{question.options.map((option, index) => <label key={option} className={Number(answers[question.id]) === index ? 'selected' : ''}><input type="radio" name={question.id} checked={Number(answers[question.id]) === index} onChange={() => setAnswers({ ...answers, [question.id]: index })} /><i>{String.fromCharCode(65 + index)}</i>{option}</label>)}</fieldset>)}</div><button className="button primary submit-quiz" onClick={submit}>Submit answers <Icon name="arrow" /></button></div></AppShell>
}

function QuizResult() {
  const result = useLocation().state
  if (!result) return <Navigate to="/courses" replace />
  const passed = result.percentage >= 60
  return <AppShell><div className="result-card"><div className={passed ? 'score-ring pass' : 'score-ring'}><strong>{result.percentage}%</strong><span>{result.score}/{result.total}</span></div><span className="eyebrow">QUIZ COMPLETE</span><h1>{passed ? 'Nicely done!' : 'Keep learning.'}</h1><p>{passed ? 'You have a solid grasp of this topic.' : 'Review the course resources and give it another try.'}</p><div className="result-details"><span>Quiz<strong>{result.quizTitle}</strong></span><span>Submitted<strong>{formatDate(result.submittedAt)}</strong></span><span>Status<strong className={passed ? 'success-text' : ''}>{statusFor(result.percentage)}</strong></span></div><div className="result-actions"><Link className="button primary" to="/courses">Back to courses</Link><Link className="button ghost" to="/results">View all results</Link></div></div></AppShell>
}

function AttemptList({ items }) {
  if (!items?.length) return <Empty title="No quiz attempts yet" text="Complete a course quiz and your score will appear here." action="Browse courses" to="/courses" />
  return <div className="result-list">{items.map((item) => <article key={item.id}><div className={item.percentage >= 60 ? 'result-percent pass' : 'result-percent'}>{item.percentage}%</div><div><span className="eyebrow">{item.courseTitle || item.courseId}</span><h3>{item.quizTitle}</h3><p>{formatDate(item.submittedAt)} - {statusFor(item.percentage)}</p></div><strong>{item.score} / {item.total}</strong></article>)}</div>
}

function Results() {
  const { auth } = useContext(AuthContext)
  const { items, loading } = useResults(auth.user.id)
  return <AppShell><div className="page-heading compact"><div><span className="eyebrow">YOUR PERFORMANCE</span><h1>Quiz results.</h1><p>A record of your completed knowledge checks.</p></div></div>{loading ? <Loading text="Loading results..." /> : <AttemptList items={items} />}</AppShell>
}

function Profile() {
  const { auth } = useContext(AuthContext)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get(`/profile/${auth.user.id}`).then(({ data }) => setProfile(data)).finally(() => setLoading(false)) }, [auth.user.id])
  if (loading) return <AppShell><Loading text="Loading profile..." /></AppShell>
  return <AppShell><div className="profile-hero"><img src={profile.profileImageUrl || '/icons.svg'} alt="" /><div><span className="eyebrow">MY PROFILE</span><h1>{profile.name}</h1><p>{profile.email} - {profile.role}</p><small>Joined {formatDate(profile.joinedAt)}</small></div><Link className="button primary" to="/profile/settings"><Icon name="settings" /> Profile settings</Link></div><div className="stats-row"><StatCard icon="courses" label="Enrolled courses" value={profile.totalEnrolledCourses} /><StatCard icon="quiz" label="Completed quizzes" value={profile.completedQuizzes} /><StatCard icon="result" label="Average score" value={`${profile.averageScore}%`} /><StatCard icon="dashboard" label="Overall progress" value={`${profile.overallProgress}%`} /></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Quiz attempt history</h2></div></div><AttemptList items={profile.recentQuizAttempts} /></section></AppShell>
}

function ProfileSettings() {
  const { auth, updateUser } = useContext(AuthContext)
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ name: '', email: '' })
  const [passwords, setPasswords] = useState({ oldPassword: '', newPassword: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get(`/profile/${auth.user.id}`).then(({ data }) => { setProfile(data); setForm({ name: data.name, email: data.email }) }).finally(() => setLoading(false))
  }, [auth.user.id])
  const saveProfile = async (event) => {
    event.preventDefault()
    try {
      const { data } = await api.put(`/profile/${auth.user.id}`, form)
      updateUser(data.user)
      setProfile({ ...profile, ...data.user })
      toast('Profile updated successfully.')
    } catch (err) {
      toast(err.response?.data?.message || 'Could not update profile.', 'error')
    }
  }
  const savePassword = async (event) => {
    event.preventDefault()
    try {
      await api.put(`/profile/${auth.user.id}/password`, passwords)
      setPasswords({ oldPassword: '', newPassword: '' })
      toast('Password updated successfully.')
    } catch (err) {
      toast(err.response?.data?.message || 'Could not update password.', 'error')
    }
  }
  const uploadAvatar = async (event) => {
    event.preventDefault()
    if (!file) return toast('No uploaded file selected.', 'error')
    const body = new FormData()
    body.append('avatar', file)
    try {
      const { data } = await api.post(`/profile/${auth.user.id}/avatar`, body)
      updateUser(data.user)
      setProfile({ ...profile, profileImageUrl: data.url })
      setFile(null)
      toast('Profile picture updated successfully.')
    } catch (err) {
      toast(err.response?.data?.message || 'Could not upload profile picture.', 'error')
    }
  }
  if (loading) return <AppShell><Loading text="Loading profile settings..." /></AppShell>
  return <AppShell><div className="page-heading compact"><div><span className="eyebrow">PROFILE SETTINGS</span><h1>Manage your account.</h1><p>Update your personal details, password, and profile picture.</p></div></div><div className="settings-grid"><form className="panel-form" onSubmit={saveProfile}><h3>Personal details</h3><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><button className="button primary">Save profile</button></form><form className="panel-form" onSubmit={savePassword}><h3>Change password</h3><label>Old password<input type="password" value={passwords.oldPassword} onChange={(e) => setPasswords({ ...passwords, oldPassword: e.target.value })} required /></label><label>New password<input type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} required /></label><button className="button primary">Update password</button></form><form className="panel-form avatar-form" onSubmit={uploadAvatar}><h3>Profile picture</h3><img src={profile.profileImageUrl || '/icons.svg'} alt="" /><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /><button className="button primary">Upload picture</button></form></div></AppShell>
}

function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const { courses } = useCourses()
  useEffect(() => { api.get('/admin/stats').then(({ data }) => setStats(data)).catch(() => {}) }, [])
  return <AppShell admin><div className="page-heading"><div><span className="eyebrow">ADMIN OVERVIEW</span><h1>Learning operations.</h1><p>Manage learners, course content, and cloud-hosted resources.</p></div><div className="heading-actions"><Link className="button ghost" to="/admin/students"><Icon name="students" /> Manage Students</Link><Link className="button primary" to="/admin/courses"><Icon name="plus" /> Add a course</Link></div></div><div className="stats-row"><StatCard icon="students" label="Total students" value={stats?.totalStudents ?? '-'} /><StatCard icon="courses" label="Total courses" value={stats?.totalCourses ?? courses.length} /><StatCard icon="quiz" label="Quiz attempts" value={stats?.totalQuizAttempts ?? '-'} /><StatCard icon="result" label="Average class score" value={`${stats?.averageClassScore ?? 0}%`} /></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">RECENT CONTENT</span><h2>Published courses</h2></div></div><div className="admin-course-list">{courses.map((course) => <div key={course.id}><span style={{ background: course.color }}>{course.code}</span><div><strong>{course.title}</strong><small>{course.instructor} - {course.level}</small></div><Link to={`/courses/${course.id}`}>View</Link></div>)}</div></section></AppShell>
}

function AdminResults() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { api.get('/admin/results').then(({ data }) => setItems(data)).catch((err) => setError(err.response?.data?.message || 'Could not load student results.')).finally(() => setLoading(false)) }, [])
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">ASSESSMENT RESULTS</span><h1>Student results.</h1><p>Review submitted quiz scores across all cloud courses.</p></div></div>{error && <div className="alert error">{error}</div>}{loading ? <Loading text="Loading student results..." /> : items.length ? <div className="admin-results-table"><div className="admin-results-head"><span>Student</span><span>Course</span><span>Score</span><span>Percentage</span><span>Submitted</span></div>{items.map((item) => <article key={item.id}><div><strong>{item.studentName}</strong><small>{item.studentId}</small></div><div><strong>{item.courseTitle || item.courseId}</strong><small>{item.quizTitle}</small></div><span>{item.score} / {item.total}</span><span className={item.percentage >= 60 ? 'success-text' : ''}>{item.percentage}%</span><time>{formatDate(item.submittedAt)}</time></article>)}</div> : <Empty title="No student results available" text="Student quiz submissions will appear here after a quiz is completed." />}</AppShell>
}

function AdminStudents() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get('/admin/students').then(({ data }) => setStudents(data)).finally(() => setLoading(false)) }, [])
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">STUDENT MANAGEMENT</span><h1>Manage students.</h1><p>Track learner activity, quiz completion, and average scores.</p></div></div>{loading ? <Loading text="Loading students..." /> : students.length ? <div className="student-table"><div className="student-table-head"><span>Student</span><span>Joined</span><span>Completed quizzes</span><span>Average score</span><span>Last activity</span></div>{students.map((student) => <article key={student.id}><div className="student-cell"><img src={student.profileImageUrl || '/icons.svg'} alt="" /><div><strong>{student.name}</strong><small>{student.email}</small></div></div><span>{formatDate(student.joinedAt)}</span><span>{student.completedQuizzes}</span><span>{student.averageScore}%</span><span>{student.lastActivity ? formatDate(student.lastActivity) : 'No activity yet'}</span></article>)}</div> : <Empty title="No students found" text="Registered students will appear here." />}</AppShell>
}

function AdminCourseManager() {
  const emptyForm = { title: '', description: '', materialLink: '', videoLink: '', code: '', instructor: '', duration: '', level: 'Beginner', category: 'Cloud' }
  const [form, setForm] = useState(emptyForm)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { courses, loading, refresh } = useCourses()
  const toast = useToast()
  const resetForm = () => { setForm(emptyForm); setCoverFile(null); setCoverPreview(''); setEditingId(null); setMessage('') }
  const editCourse = (course) => {
    setEditingId(course.id)
    setMessage('')
    setCoverFile(null)
    setCoverPreview(course.coverImageUrl || '')
    setForm({ title: course.title || '', description: course.description || '', materialLink: course.materialLink || '', videoLink: course.videoLink || '', code: course.code || '', instructor: course.instructor || '', duration: course.duration || '', level: course.level || 'Beginner', category: course.category || 'Cloud', coverImageUrl: course.coverImageUrl || '' })
  }
  const changeCover = (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setCoverFile(null)
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Course cover must be a JPG, PNG, or WebP image.', 'error')
      event.target.value = ''
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast('Course cover image must be 4 MB or smaller.', 'error')
      event.target.value = ''
      return
    }
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }
  const courseFormData = () => {
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, value ?? ''))
    if (coverFile) body.append('coverImage', coverFile)
    return body
  }
  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      const body = courseFormData()
      if (editingId) await api.put(`/courses/${editingId}`, body)
      else await api.post('/courses', body)
      await refresh()
      setForm(emptyForm)
      setCoverFile(null)
      setCoverPreview('')
      setEditingId(null)
      const message = editingId ? 'Course updated successfully.' : 'Course added successfully.'
      setMessage(message)
      toast(message)
    } catch (err) {
      const message = err.response?.data?.message || 'Could not save course.'
      setMessage(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }
  const removeCourse = async (course) => {
    if (!window.confirm(`Delete "${course.title}"? This will remove its quiz and related demo results.`)) return
    setMessage('')
    try {
      await api.delete(`/courses/${course.id}`)
      if (editingId === course.id) resetForm()
      await refresh()
      setMessage('Course deleted successfully.')
      toast('Course deleted successfully.')
    } catch (err) {
      const message = err.response?.data?.message || 'Could not delete course.'
      setMessage(message)
      toast(message, 'error')
    }
  }
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">CONTENT MANAGEMENT</span><h1>{editingId ? 'Edit course.' : 'Manage courses.'}</h1><p>Publish, update, and remove cloud learning paths from the backend API.</p></div></div><div className="admin-form-layout"><form className="panel-form" onSubmit={submit}>{message && <div className="alert">{message}</div>}<div className="field-row"><label>Course title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Serverless on AWS" /></label><label>Course code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. AWS 302" /></label></div><label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows="4" placeholder="What will students learn?" /></label><div className="field-row"><label>Material link<input type="url" value={form.materialLink} onChange={(e) => setForm({ ...form, materialLink: e.target.value })} placeholder="https://..." /></label><label>Video link<input type="url" value={form.videoLink} onChange={(e) => setForm({ ...form, videoLink: e.target.value })} placeholder="https://..." /></label></div><div className="field-row three"><label>Instructor<input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Lecturer name" /></label><label>Duration<input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="8 weeks" /></label><label>Level<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div><label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Cloud" /></label><label>Course cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={changeCover} /></label>{coverPreview && <div className="cover-preview"><img src={coverPreview} alt="" /><span>{coverFile ? coverFile.name : 'Current course cover'}</span></div>}<div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update course' : 'Publish course'} <Icon name="arrow" /></button>{editingId && <button className="button ghost" type="button" onClick={resetForm}>Cancel edit</button>}</div></form><aside className="form-aside"><span className="eyebrow">PUBLISHED</span><strong>{courses.length}</strong><p>courses currently available to students.</p><Link to="/admin/upload">Upload files to S3 -&gt;</Link></aside></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">COURSE LIBRARY</span><h2>Published courses</h2></div></div>{loading ? <Loading text="Loading courses..." /> : courses.length ? <div className="admin-manage-list">{courses.map((course) => <article key={course.id}><span style={{ background: course.color }}>{course.code}</span><div><strong>{course.title}</strong><small>{course.instructor} - {course.level} - {course.duration}</small><p>{course.description}</p></div><div className="course-actions"><Link className="text-button" to={`/courses/${course.id}`}>View</Link><button type="button" onClick={() => editCourse(course)}>Edit</button><button className="danger-button" type="button" onClick={() => removeCourse(course)}>Delete</button></div></article>)}</div> : <Empty title="No courses found" text="Published courses will appear here." />}</section></AppShell>
}

function AdminUpload() {
  const [file, setFile] = useState(null)
  const [folder, setFolder] = useState('courses')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const submit = async (event) => {
    event.preventDefault()
    if (!file) {
      setStatus({ ok: false, message: 'No uploaded file selected.' })
      toast('No uploaded file selected.', 'error')
      return
    }
    setLoading(true)
    setStatus(null)
    const body = new FormData()
    body.append('file', file)
    body.append('folder', folder)
    try {
      const { data } = await api.post('/upload', body)
      setStatus({ ok: true, ...data })
      toast('File uploaded successfully.')
    } catch (err) {
      const message = err.response?.data?.message || 'Upload failed.'
      setStatus({ ok: false, message })
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">AWS S3 STORAGE</span><h1>Upload cloud resources.</h1><p>Store materials in the configured Singapore Region bucket.</p></div></div><div className="upload-layout"><form className="upload-panel" onSubmit={submit}><div className="drop-zone"><Icon name="upload" size={34} /><h3>{file ? file.name : 'Choose a file to upload'}</h3><p>Course materials, videos, assignments, or profile images - max 100 MB</p><input type="file" onChange={(e) => setFile(e.target.files[0])} /></div><label>Destination folder<select value={folder} onChange={(e) => setFolder(e.target.value)}><option value="courses">courses/</option><option value="videos">videos/</option><option value="assignments">assignments/</option><option value="profile-images">profile-images/</option><option value="temporary">temporary/</option></select></label><button className="button primary full" disabled={loading}>{loading ? 'Uploading to S3...' : 'Upload file'}</button>{status && <div className={`alert ${status.ok ? 'success' : 'error'}`}><strong>{status.message}</strong>{status.url && <a href={status.url} target="_blank" rel="noreferrer">Open uploaded object</a>}</div>}</form><aside className="bucket-card"><span>ACTIVE BUCKET</span><h3>cloud-elearning-storage-2026</h3><p><i className="online-dot" /> ap-southeast-1 - Singapore</p><div><small>FOLDER STRUCTURE</small>{['assignments/', 'courses/', 'videos/', 'profile-images/', 'temporary/'].map((name) => <code key={name}>{name}</code>)}</div></aside></div></AppShell>
}

function AppRoutes() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/public-courses" element={<PublicCourses />} /><Route path="/public-courses/:courseId" element={<PublicCourseDetail />} /><Route path="/explore" element={<Navigate to="/public-courses" replace />} /><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/dashboard" element={<Protected roles={['student']}><Dashboard /></Protected>} /><Route path="/courses" element={<Protected><Courses /></Protected>} /><Route path="/courses/:id" element={<Protected><CourseDetail /></Protected>} /><Route path="/quiz/result" element={<Protected roles={['student']}><QuizResult /></Protected>} /><Route path="/quiz/:courseId" element={<Protected roles={['student']}><Quiz /></Protected>} /><Route path="/results" element={<Protected roles={['student']}><Results /></Protected>} /><Route path="/profile" element={<Protected roles={['student']}><Profile /></Protected>} /><Route path="/profile/settings" element={<Protected roles={['student']}><ProfileSettings /></Protected>} /><Route path="/admin" element={<Protected roles={['admin', 'lecturer']}><AdminDashboard /></Protected>} /><Route path="/admin/courses" element={<Protected roles={['admin', 'lecturer']}><AdminCourseManager /></Protected>} /><Route path="/admin/students" element={<Protected roles={['admin', 'lecturer']}><AdminStudents /></Protected>} /><Route path="/admin/results" element={<Protected roles={['admin', 'lecturer']}><AdminResults /></Protected>} /><Route path="/admin/upload" element={<Protected roles={['admin', 'lecturer']}><AdminUpload /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}

export default function App() {
  return <BrowserRouter><ThemeProvider><ToastProvider><AuthProvider><AppRoutes /></AuthProvider></ToastProvider></ThemeProvider></BrowserRouter>
}
