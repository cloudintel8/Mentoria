# CloudLearn — Cloud-Based E-Learning Platform

CloudLearn is a full-stack university cloud computing project. It demonstrates a role-based learning portal with a React interface, REST API, JWT authentication, quiz scoring, AWS S3 object storage, and AWS RDS MySQL persistence in the Singapore Region.

## Technology

- Frontend: React 19, Vite, React Router, Axios
- Backend: Node.js, Express, bcryptjs, JSON Web Tokens, mysql2/promise
- Cloud storage: AWS S3 using AWS SDK for JavaScript v3
- Database: AWS RDS MySQL
- Uploads: Multer memory storage (files are sent directly to S3)
- Demo data: auto-seeded into MySQL the first time empty tables are created

## Project structure

```text
frontend/       React + Vite web application
backend/        Express REST API and S3 integration
screenshots/    Presentation screenshots
README.md       Project documentation
```

## Prerequisites

- Node.js 20 or newer
- An AWS account and an S3 bucket named `cloud-elearning-storage-2026` in `ap-southeast-1`
- An IAM user or role allowed to run `s3:PutObject` on `arn:aws:s3:::cloud-elearning-storage-2026/*`
- An AWS RDS MySQL instance reachable from the machine running the backend

Do not commit AWS keys. Both `.env` files and all `node_modules` folders are excluded by the root `.gitignore`.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Edit `backend/.env` before starting:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-string
DB_HOST=your-rds-endpoint.ap-southeast-1.rds.amazonaws.com
DB_PORT=3306
DB_NAME=cloudlearn
DB_USER=admin
DB_PASSWORD=replace-with-your-rds-password
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=cloud-elearning-storage-2026
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

The backend creates the `users`, `courses`, `quizzes`, and `results` tables automatically if they do not exist, then seeds demo users, courses, and quizzes when those tables are empty. The AWS SDK also supports the normal AWS credential chain, so deployed environments can use an IAM role and omit static access keys entirely. The app never contains hardcoded credentials or database passwords.

### 2. Frontend

Open a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:5173`.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | `student@cloudlearn.edu` | `Student123!` |
| Lecturer | `lecturer@cloudlearn.edu` | `Lecturer123!` |
| Administrator | `admin@cloudlearn.edu` | `Admin123!` |

New registrations always receive the `student` role. Admin/lecturer accounts should be provisioned by a trusted server-side process in a production system.

## REST API

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API health check |
| POST | `/auth/register` | Public | Register a student |
| POST | `/auth/login` | Public | Log in and receive a JWT |
| GET | `/courses` | Public | List all courses |
| POST | `/courses` | Admin/Lecturer | Publish a course |
| GET | `/quiz/:courseId` | Public | Get quiz questions without answers |
| POST | `/quiz/submit` | Student | Score and save quiz answers |
| GET | `/results/:studentId` | Owner/Admin/Lecturer | Get one student's results |
| GET | `/admin/results` | Admin/Lecturer | Get all student quiz results |
| POST | `/upload` | Authenticated | Upload one file to S3 |

Send protected requests with `Authorization: Bearer <token>`.

### Course body

```json
{
  "title": "Serverless on AWS",
  "description": "Learn event-driven cloud design.",
  "materialLink": "https://example.com/notes.pdf",
  "videoLink": "https://example.com/video.mp4",
  "code": "AWS 302",
  "instructor": "Lecturer Name",
  "duration": "6 weeks",
  "level": "Intermediate"
}
```

### Quiz submission body

Answers use question IDs as keys and zero-based option indexes as values.

```json
{
  "courseId": "course-cloud-101",
  "answers": { "q1": 2, "q2": 0, "q3": 2, "q4": 1, "q5": 2 }
}
```

### S3 upload

Send `multipart/form-data` with:

- `file`: the uploaded file (maximum 100 MB)
- `folder`: one of `assignments`, `courses`, `videos`, `profile-images`, or `temporary`

Students may upload only to `assignments/`, `profile-images/`, and `temporary/`. Admins and lecturers may use all folders. S3 objects are private unless the bucket policy says otherwise; the returned URL does not itself grant access.

## Suggested S3 CORS configuration

Direct browser access to public objects may require bucket CORS. The current upload goes through the backend, so CORS is not required for uploading. If course links are served directly from S3, configure only the origins and methods the project needs.

## Important demo notes

- The backend now stores users, courses, quizzes, and results in MySQL instead of memory, so data persists across restarts.
- For production, add refresh tokens, rate limiting, stricter file type validation, malware scanning, private objects with presigned download URLs, and an IAM role instead of long-lived keys.
- The sample course links illustrate S3 paths. Upload real files through the admin screen and paste the returned object URLs when creating courses.
