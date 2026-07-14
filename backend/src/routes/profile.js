import { Router } from 'express'
import multer from 'multer'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { changePassword, getProfile, updateAvatar, updateProfile } from '../config/db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function canAccessProfile(req, userId) {
  return req.user.id === userId || ['admin', 'lecturer'].includes(req.user.role)
}

function hasUsableS3Config() {
  const values = [process.env.AWS_REGION, process.env.AWS_S3_BUCKET]
  return values.every((value) => value && !/placeholder|example|your-|change-me/i.test(value))
}

async function uploadAvatarToS3(file) {
  if (!hasUsableS3Config()) return null
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')
  const key = `profile-images/${randomUUID()}-${safeName}`
  const client = new S3Client({ region: process.env.AWS_REGION })
  await client.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }))
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodedKey}`
}

router.get('/:userId', authenticate, async (req, res) => {
  if (!canAccessProfile(req, req.params.userId)) return res.status(403).json({ message: 'You can only view your own profile.' })
  const profile = await getProfile(req.params.userId)
  if (!profile) return res.status(404).json({ message: 'Profile not found.' })
  res.json(profile)
})

router.put('/:userId', authenticate, async (req, res) => {
  if (!canAccessProfile(req, req.params.userId)) return res.status(403).json({ message: 'You can only update your own profile.' })
  const updated = await updateProfile(req.params.userId, req.body)
  if (!updated) return res.status(400).json({ message: 'Name and email are required.' })
  if (updated.conflict) return res.status(409).json({ message: 'An account with that email already exists.' })
  res.json({ message: 'Profile updated successfully.', user: updated })
})

router.put('/:userId/password', authenticate, async (req, res) => {
  if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'You can only change your own password.' })
  const result = await changePassword(req.params.userId, req.body.oldPassword, req.body.newPassword)
  if (result.missing) return res.status(404).json({ message: 'Profile not found.' })
  if (result.invalid) return res.status(400).json({ message: 'New password must be at least 6 characters.' })
  if (result.wrongPassword) return res.status(400).json({ message: 'Old password is incorrect.' })
  res.json({ message: 'Password updated successfully.' })
})

router.post('/:userId/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!canAccessProfile(req, req.params.userId)) return res.status(403).json({ message: 'You can only update your own avatar.' })

  let url = '/icons.svg'
  if (req.file) {
    try {
      url = await uploadAvatarToS3(req.file) || `/icons.svg?avatar=${encodeURIComponent(req.file.originalname)}`
    } catch (error) {
      console.warn(`Avatar upload fallback used: ${error.message}`)
      url = `/icons.svg?avatar=${encodeURIComponent(req.file.originalname)}`
    }
  }

  const user = await updateAvatar(req.params.userId, url)
  if (!user) return res.status(404).json({ message: 'Profile not found.' })
  res.status(201).json({ message: 'Profile picture updated successfully.', url, user })
})

export default router
