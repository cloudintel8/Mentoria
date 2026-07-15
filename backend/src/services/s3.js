import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'

const PRESIGNED_URL_TTL_SECONDS = 60 * 60
let client

function configured(value) {
  return value && !/placeholder|example|your-|change-me|replace-with/i.test(value)
}

export function hasUsableS3Config() {
  return configured(process.env.AWS_REGION) && configured(process.env.AWS_S3_BUCKET)
}

function s3Client() {
  if (!client) client = new S3Client({ region: process.env.AWS_REGION })
  return client
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-') || 'upload'
}

function keyFromLegacyUrl(value) {
  if (!value || typeof value !== 'string') return ''
  const match = value.match(/\.amazonaws\.com\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : ''
}

// Objects are deliberately uploaded without ACLs so Block Public Access can remain enabled.
export async function uploadPrivateFile(file, prefix) {
  if (!hasUsableS3Config()) return null
  const key = `${prefix}/${randomUUID()}-${safeFileName(file.originalname)}`
  await s3Client().send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }))
  return key
}

export async function presignGetUrl(key) {
  if (!key || !hasUsableS3Config()) return ''
  try {
    return await getSignedUrl(s3Client(), new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }), { expiresIn: PRESIGNED_URL_TTL_SECONDS })
  } catch (error) {
    // Demo mode remains useful when credentials or S3 are unavailable.
    console.warn(`Could not create S3 download URL: ${error.message}`)
    return ''
  }
}

export async function presentUser(user) {
  if (!user) return null
  const { password, profileImageKey, profile_image_key, profileImageUrl, profile_image_url, ...safe } = user
  const key = (profileImageKey ?? profile_image_key) || keyFromLegacyUrl(profileImageUrl || profile_image_url)
  return { ...safe, profileImageUrl: await presignGetUrl(key) || ((profileImageUrl || profile_image_url || '').includes('.amazonaws.com/') ? '' : (profileImageUrl || profile_image_url || '')) }
}

export async function presentCourse(course) {
  const { coverImageKey, materialFileKey, videoFileKey, cover_image_key, material_file_key, video_file_key, coverImageUrl, materialUrl, videoUrl, materialLink, videoLink, ...safe } = course
  const coverKey = (coverImageKey ?? cover_image_key) || keyFromLegacyUrl(coverImageUrl)
  const materialKey = (materialFileKey ?? material_file_key) || keyFromLegacyUrl(materialLink)
  const videoKey = (videoFileKey ?? video_file_key) || keyFromLegacyUrl(videoLink)
  return {
    ...safe,
    // External links are supported for legacy/demo courses; S3-backed files always use a signed URL.
    coverImageUrl: await presignGetUrl(coverKey) || (coverImageUrl?.includes('.amazonaws.com/') ? '' : coverImageUrl || ''),
    materialUrl: await presignGetUrl(materialKey) || (materialLink?.includes('.amazonaws.com/') ? '' : materialLink || ''),
    videoUrl: await presignGetUrl(videoKey) || (videoLink?.includes('.amazonaws.com/') ? '' : videoLink || ''),
  }
}

export async function presentCourseLesson(lesson) {
  if (!lesson) return null
  const { materialFileKey, videoFileKey, material_file_key, video_file_key, materialUrl, videoUrl, ...safe } = lesson
  return {
    ...safe,
    materialUrl: await presignGetUrl(materialFileKey ?? material_file_key) || materialUrl || '',
    videoUrl: await presignGetUrl(videoFileKey ?? video_file_key) || videoUrl || '',
  }
}

export async function presentAssignment(assignment) {
  if (!assignment) return null
  const { instructionFileKey, instruction_file_key, instructionFileUrl, ...safe } = assignment
  return {
    ...safe,
    instructionFileUrl: await presignGetUrl(instructionFileKey ?? instruction_file_key) || instructionFileUrl || '',
    dueDate: safe.dueDate instanceof Date ? safe.dueDate.toISOString() : safe.dueDate,
  }
}

export async function presentSubmission(submission) {
  if (!submission) return null
  const { submissionFileKey, submission_file_key, submissionFileUrl, ...safe } = submission
  return {
    ...safe,
    submissionFileUrl: await presignGetUrl(submissionFileKey ?? submission_file_key) || submissionFileUrl || '',
    submittedAt: safe.submittedAt instanceof Date ? safe.submittedAt.toISOString() : safe.submittedAt,
    gradedAt: safe.gradedAt instanceof Date ? safe.gradedAt.toISOString() : safe.gradedAt,
  }
}
