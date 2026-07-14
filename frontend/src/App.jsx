import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from './api'
import './App.css'

const AuthContext = createContext(null)

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
  file: 'M6 2h8l4 4v16H6V2Zm8 2.5V8h3.5L14 4.5ZM8 11v2h8v-2H8Zm0 4v2h8v-2H8Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
}

function Icon({ name, size = 20 }) {
  const strokeOnly = ['arrow', 'plus', 'upload', 'menu'].includes(name)
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={strokeOnly ? 'none' : 'currentColor'} stroke={strokeOnly ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>
}

function AuthProvider({ children }) {
  const saved = JSON.parse(localStorage.getItem('cloudlearn-auth') || 'null')
  const [auth, setAuth] = useState(saved)
  const signIn = (payload) => { setAuth(payload); localStorage.setItem('cloudlearn-auth', JSON.stringify(payload)) }
  const signOut = () => { setAuth(null); localStorage.removeItem('cloudlearn-auth') }
  return <AuthContext.Provider value={{ auth, signIn, signOut }}>{children}</AuthContext.Provider>
}

function Protected({ roles, children }) {
  const { auth } = useContext(AuthContext)
  if (!auth) return <Navigate to="/login" replace />
  if (roles && !roles.includes(auth.user.role)) return <Navigate to="/dashboard" replace />
  return children
}

function Logo() {
  return <Link className="logo" to="/"><span className="logo-mark">C</span><span>Cloud<span>Learn</span></span></Link>
}

function MarketingNav() {
  const { auth } = useContext(AuthContext)
  return <header className="marketing-nav"><Logo /><nav><a href="#features">Features</a><Link to="/courses">Courses</Link><a href="#about">About</a></nav><div className="nav-actions">{auth ? <Link className="button primary small" to="/dashboard">Dashboard</Link> : <><Link className="text-link" to="/login">Sign in</Link><Link className="button primary small" to="/register">Get started</Link></>}</div></header>
}

function Landing() {
  return <div className="landing"><MarketingNav /><main>
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow">LEARN. BUILD. GROW.</span><h1>Master the cloud.<br /><em>Shape your future.</em></h1><p>Practical cloud computing courses built for curious minds. Learn at your pace, test your skills, and become cloud-ready.</p><div className="hero-actions"><Link className="button primary" to="/register">Start learning free <Icon name="arrow" /></Link><Link className="button ghost" to="/courses">Explore courses</Link></div><div className="hero-proof"><div className="avatar-stack"><span>NP</span><span>AS</span><span>MK</span></div><p><strong>1,200+ learners</strong><br />already growing with us</p></div></div><div className="hero-art"><div className="orb one" /><div className="orb two" /><div className="cloud-card main-card"><div className="card-top"><span className="course-symbol">☁</span><span className="status-pill">In progress</span></div><small>FEATURED COURSE</small><h3>Cloud Computing<br />Fundamentals</h3><div className="mini-progress"><span style={{ width: '72%' }} /></div><div className="card-bottom"><span>72% complete</span><b>Continue →</b></div></div><div className="float-card score-card"><strong>92%</strong><span>Quiz score</span></div><div className="float-card lesson-card"><span className="play-dot">▶</span><div><strong>24 lessons</strong><small>Video + reading</small></div></div></div></section>
    <section id="features" className="feature-strip"><article><span>01</span><h3>Learn by doing</h3><p>Courses grounded in real-world cloud scenarios.</p></article><article><span>02</span><h3>Track your growth</h3><p>Clear progress, quizzes, and instant results.</p></article><article><span>03</span><h3>Built for the cloud</h3><p>Materials and media delivered securely with AWS.</p></article></section>
    <section id="about" className="section-intro"><span className="eyebrow">WHY CLOUDLEARN</span><h2>A clearer path into<br />cloud computing.</h2><p>No clutter, no endless theory. Just focused lessons, useful resources, and feedback that helps you move forward.</p></section>
  </main><footer><Logo /><span>University cloud computing project · 2026</span></footer></div>
}

function AuthPage({ register = false }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useContext(AuthContext)
  const navigate = useNavigate()
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await api.post(register ? '/auth/register' : '/auth/login', form)
      signIn(data); navigate(data.user.role === 'student' ? '/dashboard' : '/admin')
    } catch (err) { setError(err.response?.data?.message || 'Cannot connect to the server.') } finally { setLoading(false) }
  }
  return <div className="auth-page"><div className="auth-side"><Logo /><div><span className="eyebrow light">CLOUD LEARNING, SIMPLIFIED</span><h1>{register ? 'Begin your cloud journey.' : 'Welcome back to your journey.'}</h1><p>Learn practical skills, follow your progress, and keep moving forward—one lesson at a time.</p></div><small>© 2026 CloudLearn</small></div><div className="auth-main"><form className="auth-form" onSubmit={submit}><Link className="back-link" to="/">← Back to home</Link><span className="eyebrow">{register ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</span><h2>{register ? 'Join CloudLearn' : 'Sign in to CloudLearn'}</h2><p>{register ? 'Free access to courses, quizzes, and results.' : 'Enter your details to continue learning.'}</p>{error && <div className="alert error">{error}</div>}{register && <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" required /></label>}<label>Email address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></label><label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" required /></label><button className="button primary full" disabled={loading}>{loading ? 'Please wait…' : register ? 'Create my account' : 'Sign in'}</button><p className="switch-auth">{register ? 'Already have an account?' : 'New to CloudLearn?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>{!register && <div className="demo-note"><strong>Demo accounts</strong><span>Student: student@cloudlearn.edu / Student123!</span><span>Admin: admin@cloudlearn.edu / Admin123!</span></div>}</form></div></div>
}

function AppShell({ children, admin = false }) {
  const { auth, signOut } = useContext(AuthContext)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const nav = admin ? [{ to: '/admin', label: 'Overview', icon: 'dashboard' }, { to: '/admin/courses', label: 'Manage courses', icon: 'courses' }, { to: '/admin/results', label: 'Student results', icon: 'result' }, { to: '/admin/upload', label: 'S3 uploads', icon: 'upload' }] : [{ to: '/dashboard', label: 'Overview', icon: 'dashboard' }, { to: '/courses', label: 'My courses', icon: 'courses' }, { to: '/results', label: 'Quiz results', icon: 'result' }]
  return <div className="app-shell"><aside className={open ? 'sidebar open' : 'sidebar'}><div className="side-head"><Logo /><button className="icon-button mobile-only" onClick={() => setOpen(false)}>×</button></div><span className="side-label">{admin ? 'ADMIN WORKSPACE' : 'LEARNING SPACE'}</span><nav>{nav.map((item) => <NavLink key={item.to} to={item.to} end onClick={() => setOpen(false)}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav><div className="side-bottom"><div className="user-chip"><span>{auth.user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span><div><strong>{auth.user.name}</strong><small>{auth.user.role}</small></div></div><button onClick={() => { signOut(); navigate('/') }}><Icon name="logout" /> Sign out</button></div></aside><section className="app-main"><header className="app-top"><button className="icon-button mobile-only" onClick={() => setOpen(true)}><Icon name="menu" /></button><div><span className="eyebrow">CLOUDLEARN</span></div><div className="top-status"><span className="online-dot" /> AWS Singapore</div></header><div className="page-content">{children}</div></section></div>
}

function useCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    setLoading(true)
    return api.get('/courses').then(({ data }) => setCourses(data)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { courses, loading, refresh }
}

function Dashboard() {
  const { auth } = useContext(AuthContext)
  const { courses, loading } = useCourses()
  return <AppShell><div className="page-heading"><div><span className="eyebrow">MONDAY, 13 JULY</span><h1>Good evening, {auth.user.name.split(' ')[0]}.</h1><p>Pick up where you left off and keep the momentum going.</p></div><Link className="button primary" to="/courses">Browse courses <Icon name="arrow" /></Link></div><div className="stats-row"><div><span className="stat-icon purple"><Icon name="courses" /></span><p>Courses in progress<strong>{loading ? '—' : courses.length}</strong></p></div><div><span className="stat-icon orange"><Icon name="quiz" /></span><p>Quizzes completed<strong>0</strong></p></div><div><span className="stat-icon green"><Icon name="result" /></span><p>Average score<strong>—</strong></p></div></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">CONTINUE LEARNING</span><h2>Your courses</h2></div><Link to="/courses">View all →</Link></div><div className="course-grid">{courses.slice(0, 3).map((course) => <CourseCard key={course.id} course={course} />)}</div></section></AppShell>
}

function CourseCard({ course }) {
  return <article className="course-card"><div className="course-cover" style={{ '--course-color': course.color }}><span>{course.code}</span><i>☁</i></div><div className="course-body"><span className="course-meta">{course.level} · {course.duration}</span><h3>{course.title}</h3><p>{course.description}</p><div className="progress-label"><span>Progress</span><strong>{course.progress}%</strong></div><div className="progress"><span style={{ width: `${course.progress}%`, background: course.color }} /></div><Link to={`/courses/${course.id}`}>Continue course <Icon name="arrow" size={17} /></Link></div></article>
}

function Courses() {
  const { courses, loading } = useCourses()
  return <AppShell><div className="page-heading compact"><div><span className="eyebrow">COURSE CATALOGUE</span><h1>Explore your courses.</h1><p>Practical learning paths for modern cloud skills.</p></div></div>{loading ? <div className="loading">Loading courses…</div> : <div className="course-grid wide">{courses.map((course) => <CourseCard key={course.id} course={course} />)}</div>}</AppShell>
}

function CourseDetail() {
  const { id } = useParams(); const { courses, loading } = useCourses(); const course = courses.find((item) => item.id === id)
  if (loading) return <AppShell><div className="loading">Loading course…</div></AppShell>
  if (!course) return <AppShell><Empty title="Course not found" text="This course may no longer be available." /></AppShell>
  return <AppShell><Link className="back-link" to="/courses">← All courses</Link><div className="detail-hero" style={{ '--course-color': course.color }}><div><span className="tag">{course.code} · {course.level}</span><h1>{course.title}</h1><p>{course.description}</p><div className="detail-meta"><span>By <strong>{course.instructor}</strong></span><span>{course.duration}</span></div></div><div className="detail-cloud">☁</div></div><div className="detail-layout"><main><span className="eyebrow">COURSE RESOURCES</span><h2>Materials & lessons</h2><a className="resource-card" href={course.materialLink} target="_blank" rel="noreferrer"><span className="resource-icon"><Icon name="file" /></span><div><small>COURSE MATERIAL</small><strong>Lecture notes and learning resources</strong><span>Open material ↗</span></div></a><a className="resource-card" href={course.videoLink} target="_blank" rel="noreferrer"><span className="resource-icon video"><Icon name="play" /></span><div><small>VIDEO LESSON</small><strong>Watch the course video</strong><span>Start watching ↗</span></div></a></main><aside className="quiz-callout"><span className="eyebrow light">KNOWLEDGE CHECK</span><h3>Ready to test what you learned?</h3><p>Take the multiple-choice quiz and get your score instantly.</p><Link className="button light full" to={`/quiz/${course.id}`}>Start quiz <Icon name="arrow" /></Link></aside></div></AppShell>
}

function Quiz() {
  const { courseId } = useParams(); const navigate = useNavigate(); const [quiz, setQuiz] = useState(null); const [answers, setAnswers] = useState({}); const [error, setError] = useState('')
  useEffect(() => { api.get(`/quiz/${courseId}`).then(({ data }) => setQuiz(data)).catch((err) => setError(err.response?.data?.message || 'Quiz unavailable.')) }, [courseId])
  const submit = async () => {
    if (Object.keys(answers).length !== quiz.questions.length) return setError('Please answer every question before submitting.')
    try { const { data } = await api.post('/quiz/submit', { courseId, answers }); navigate('/quiz/result', { state: data }) } catch (err) { setError(err.response?.data?.message || 'Could not submit quiz.') }
  }
  if (error && !quiz) return <AppShell><Empty title="Quiz unavailable" text={error} /></AppShell>
  if (!quiz) return <AppShell><div className="loading">Preparing quiz…</div></AppShell>
  return <AppShell><div className="quiz-header"><Link className="back-link" to={`/courses/${courseId}`}>← Back to course</Link><span>{Object.keys(answers).length} of {quiz.questions.length} answered</span></div><div className="quiz-wrap"><span className="eyebrow">KNOWLEDGE CHECK</span><h1>{quiz.title}</h1><p>Choose the best answer for each question.</p>{error && <div className="alert error">{error}</div>}<div className="questions">{quiz.questions.map((question, qIndex) => <fieldset key={question.id}><legend><span>{String(qIndex + 1).padStart(2, '0')}</span>{question.text}</legend>{question.options.map((option, index) => <label key={option} className={Number(answers[question.id]) === index ? 'selected' : ''}><input type="radio" name={question.id} checked={Number(answers[question.id]) === index} onChange={() => setAnswers({ ...answers, [question.id]: index })} /><i>{String.fromCharCode(65 + index)}</i>{option}</label>)}</fieldset>)}</div><button className="button primary submit-quiz" onClick={submit}>Submit answers <Icon name="arrow" /></button></div></AppShell>
}

function QuizResult() {
  const result = useLocation().state
  if (!result) return <Navigate to="/courses" replace />
  const passed = result.percentage >= 60
  return <AppShell><div className="result-card"><div className={passed ? 'score-ring pass' : 'score-ring'}><strong>{result.percentage}%</strong><span>{result.score}/{result.total}</span></div><span className="eyebrow">QUIZ COMPLETE</span><h1>{passed ? 'Nicely done!' : 'Keep learning.'}</h1><p>{passed ? 'You have a solid grasp of this topic.' : 'Review the course resources and give it another try.'}</p><div className="result-details"><span>Quiz<strong>{result.quizTitle}</strong></span><span>Submitted<strong>{new Date(result.submittedAt).toLocaleDateString()}</strong></span><span>Status<strong className={passed ? 'success-text' : ''}>{passed ? 'Passed' : 'Review needed'}</strong></span></div><div className="result-actions"><Link className="button primary" to="/courses">Back to courses</Link><Link className="button ghost" to="/results">View all results</Link></div></div></AppShell>
}

function Results() {
  const { auth } = useContext(AuthContext); const [items, setItems] = useState([]); const [loading, setLoading] = useState(true)
  useEffect(() => { api.get(`/results/${auth.user.id}`).then(({ data }) => setItems(data)).finally(() => setLoading(false)) }, [auth.user.id])
  return <AppShell><div className="page-heading compact"><div><span className="eyebrow">YOUR PERFORMANCE</span><h1>Quiz results.</h1><p>A record of your completed knowledge checks.</p></div></div>{loading ? <div className="loading">Loading results...</div> : items.length ? <div className="result-list">{items.map((item) => <article key={item.id}><div className={item.percentage >= 60 ? 'result-percent pass' : 'result-percent'}>{item.percentage}%</div><div><span className="eyebrow">{item.courseTitle || item.courseId}</span><h3>{item.quizTitle}</h3><p>{new Date(item.submittedAt).toLocaleString()}</p></div><strong>{item.score} / {item.total}</strong></article>)}</div> : <Empty title="No quiz results yet" text="Complete a course quiz and your score will appear here." action="Browse courses" to="/courses" />}</AppShell>
}

function AdminResults() {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { api.get('/admin/results').then(({ data }) => setItems(data)).catch((err) => setError(err.response?.data?.message || 'Could not load student results.')).finally(() => setLoading(false)) }, [])
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">ASSESSMENT RESULTS</span><h1>Student results.</h1><p>Review submitted quiz scores across all cloud courses.</p></div></div>{error && <div className="alert error">{error}</div>}{loading ? <div className="loading">Loading student results...</div> : items.length ? <div className="admin-results-table"><div className="admin-results-head"><span>Student</span><span>Course</span><span>Score</span><span>Percentage</span><span>Submitted</span></div>{items.map((item) => <article key={item.id}><div><strong>{item.studentName}</strong><small>{item.studentId}</small></div><div><strong>{item.courseTitle || item.courseId}</strong><small>{item.quizTitle}</small></div><span>{item.score} / {item.total}</span><span className={item.percentage >= 60 ? 'success-text' : ''}>{item.percentage}%</span><time>{new Date(item.submittedAt).toLocaleString()}</time></article>)}</div> : <Empty title="No submissions yet" text="Student quiz submissions will appear here after a quiz is completed." />}</AppShell>
}

function AdminDashboard() {
  const { courses } = useCourses()
  return <AppShell admin><div className="page-heading"><div><span className="eyebrow">ADMIN OVERVIEW</span><h1>Learning operations.</h1><p>Manage course content and cloud-hosted resources.</p></div><Link className="button primary" to="/admin/courses"><Icon name="plus" /> Add a course</Link></div><div className="stats-row"><div><span className="stat-icon purple"><Icon name="courses" /></span><p>Published courses<strong>{courses.length}</strong></p></div><div><span className="stat-icon orange"><Icon name="upload" /></span><p>Storage region<strong className="small-stat">Singapore</strong></p></div><div><span className="stat-icon green"><Icon name="dashboard" /></span><p>Platform status<strong className="small-stat success-text">Operational</strong></p></div></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">RECENT CONTENT</span><h2>Published courses</h2></div></div><div className="admin-course-list">{courses.map((course) => <div key={course.id}><span style={{ background: course.color }}>{course.code}</span><div><strong>{course.title}</strong><small>{course.instructor} · {course.level}</small></div><Link to={`/courses/${course.id}`}>View →</Link></div>)}</div></section></AppShell>
}

function AdminCourseManager() {
  const emptyForm = { title: '', description: '', materialLink: '', videoLink: '', code: '', instructor: '', duration: '', level: 'Beginner' }
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { courses, loading, refresh } = useCourses()

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setMessage('') }
  const editCourse = (course) => {
    setEditingId(course.id)
    setMessage('')
    setForm({
      title: course.title || '',
      description: course.description || '',
      materialLink: course.materialLink || '',
      videoLink: course.videoLink || '',
      code: course.code || '',
      instructor: course.instructor || '',
      duration: course.duration || '',
      level: course.level || 'Beginner',
    })
  }
  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      if (editingId) await api.put(`/courses/${editingId}`, form)
      else await api.post('/courses', form)
      await refresh()
      setForm(emptyForm)
      setEditingId(null)
      setMessage(editingId ? 'Course updated successfully.' : 'Course published successfully.')
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save course.')
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
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not delete course.')
    }
  }

  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">CONTENT MANAGEMENT</span><h1>{editingId ? 'Edit course.' : 'Manage courses.'}</h1><p>Publish, update, and remove cloud learning paths from the backend API.</p></div></div><div className="admin-form-layout"><form className="panel-form" onSubmit={submit}>{message && <div className="alert">{message}</div>}<div className="field-row"><label>Course title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Serverless on AWS" /></label><label>Course code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. AWS 302" /></label></div><label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows="4" placeholder="What will students learn?" /></label><div className="field-row"><label>Material link<input type="url" value={form.materialLink} onChange={(e) => setForm({ ...form, materialLink: e.target.value })} placeholder="https://..." /></label><label>Video link<input type="url" value={form.videoLink} onChange={(e) => setForm({ ...form, videoLink: e.target.value })} placeholder="https://..." /></label></div><div className="field-row three"><label>Instructor<input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Lecturer name" /></label><label>Duration<input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="8 weeks" /></label><label>Level<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update course' : 'Publish course'} <Icon name="arrow" /></button>{editingId && <button className="button ghost" type="button" onClick={resetForm}>Cancel edit</button>}</div></form><aside className="form-aside"><span className="eyebrow">PUBLISHED</span><strong>{courses.length}</strong><p>courses currently available to students.</p><Link to="/admin/upload">Upload files to S3 -&gt;</Link></aside></div><section className="content-section"><div className="section-title"><div><span className="eyebrow">COURSE LIBRARY</span><h2>Published courses</h2></div></div>{loading ? <div className="loading">Loading courses...</div> : <div className="admin-manage-list">{courses.map((course) => <article key={course.id}><span style={{ background: course.color }}>{course.code}</span><div><strong>{course.title}</strong><small>{course.instructor} - {course.level} - {course.duration}</small><p>{course.description}</p></div><div className="course-actions"><Link className="text-button" to={`/courses/${course.id}`}>View</Link><button type="button" onClick={() => editCourse(course)}>Edit</button><button className="danger-button" type="button" onClick={() => removeCourse(course)}>Delete</button></div></article>)}</div>}</section></AppShell>
}

function AdminUpload() {
  const [file, setFile] = useState(null); const [folder, setFolder] = useState('courses'); const [status, setStatus] = useState(null); const [loading, setLoading] = useState(false)
  const submit = async (event) => { event.preventDefault(); if (!file) return; setLoading(true); setStatus(null); const body = new FormData(); body.append('file', file); body.append('folder', folder); try { const { data } = await api.post('/upload', body); setStatus({ ok: true, ...data }) } catch (err) { setStatus({ ok: false, message: err.response?.data?.message || 'Upload failed.' }) } finally { setLoading(false) } }
  return <AppShell admin><div className="page-heading compact"><div><span className="eyebrow">AWS S3 STORAGE</span><h1>Upload cloud resources.</h1><p>Store materials in the configured Singapore Region bucket.</p></div></div><div className="upload-layout"><form className="upload-panel" onSubmit={submit}><div className="drop-zone"><Icon name="upload" size={34} /><h3>{file ? file.name : 'Choose a file to upload'}</h3><p>Course materials, videos, assignments, or profile images · max 100 MB</p><input type="file" onChange={(e) => setFile(e.target.files[0])} /></div><label>Destination folder<select value={folder} onChange={(e) => setFolder(e.target.value)}><option value="courses">courses/</option><option value="videos">videos/</option><option value="assignments">assignments/</option><option value="profile-images">profile-images/</option><option value="temporary">temporary/</option></select></label><button className="button primary full" disabled={!file || loading}>{loading ? 'Uploading to S3…' : 'Upload file'}</button>{status && <div className={`alert ${status.ok ? 'success' : 'error'}`}><strong>{status.message}</strong>{status.url && <a href={status.url} target="_blank" rel="noreferrer">Open uploaded object ↗</a>}</div>}</form><aside className="bucket-card"><span>ACTIVE BUCKET</span><h3>cloud-elearning-storage-2026</h3><p><i className="online-dot" /> ap-southeast-1 · Singapore</p><div><small>FOLDER STRUCTURE</small>{['assignments/', 'courses/', 'videos/', 'profile-images/', 'temporary/'].map((name) => <code key={name}>↳ {name}</code>)}</div></aside></div></AppShell>
}

function Empty({ title, text, action, to }) { return <div className="empty"><span>☁</span><h2>{title}</h2><p>{text}</p>{action && <Link className="button primary" to={to}>{action}</Link>}</div> }

function AppRoutes() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/dashboard" element={<Protected roles={['student']}><Dashboard /></Protected>} /><Route path="/courses" element={<Protected><Courses /></Protected>} /><Route path="/courses/:id" element={<Protected><CourseDetail /></Protected>} /><Route path="/quiz/result" element={<Protected roles={['student']}><QuizResult /></Protected>} /><Route path="/quiz/:courseId" element={<Protected roles={['student']}><Quiz /></Protected>} /><Route path="/results" element={<Protected roles={['student']}><Results /></Protected>} /><Route path="/admin" element={<Protected roles={['admin', 'lecturer']}><AdminDashboard /></Protected>} /><Route path="/admin/courses" element={<Protected roles={['admin', 'lecturer']}><AdminCourseManager /></Protected>} /><Route path="/admin/results" element={<Protected roles={['admin', 'lecturer']}><AdminResults /></Protected>} /><Route path="/admin/upload" element={<Protected roles={['admin', 'lecturer']}><AdminUpload /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}

export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter> }
