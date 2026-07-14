import { Router } from 'express'
import multer from 'multer'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
const allowedFolders = new Set(['assignments', 'courses', 'videos', 'profile-images', 'temporary'])

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Select a file to upload.' })
    const folder = req.body.folder || 'temporary'
    if (!allowedFolders.has(folder)) return res.status(400).json({ message: 'Invalid S3 folder.' })
    if (req.user.role === 'student' && !['assignments', 'profile-images', 'temporary'].includes(folder)) return res.status(403).json({ message: 'Students cannot upload to this folder.' })

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')
    const key = `${folder}/${randomUUID()}-${safeName}`
    const client = new S3Client({ region: process.env.AWS_REGION })
    await client.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }))
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodedKey}`
    res.status(201).json({ message: 'File uploaded successfully.', key, url })
  } catch (error) {
    next(error)
  }
})

export default router

