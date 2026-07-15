import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { hasUsableS3Config, presignGetUrl, uploadPrivateFile } from '../services/s3.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
const allowedFolders = new Set(['assignments', 'courses', 'videos', 'profile-images', 'temporary'])

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Select a file to upload.' })
    const folder = req.body.folder || 'temporary'
    if (!allowedFolders.has(folder)) return res.status(400).json({ message: 'Invalid S3 folder.' })
    if (req.user.role === 'student' && !['assignments', 'profile-images', 'temporary'].includes(folder)) return res.status(403).json({ message: 'Students cannot upload to this folder.' })

    if (!hasUsableS3Config()) return res.status(503).json({ message: 'S3 is not configured. File uploads are unavailable in demo mode.' })
    const key = await uploadPrivateFile(req.file, folder)
    res.status(201).json({ message: 'File uploaded successfully.', key, url: await presignGetUrl(key) })
  } catch (error) {
    next(error)
  }
})

export default router
