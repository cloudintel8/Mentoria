import { Router } from 'express'
import multer from 'multer'
import { changePassword, createNotification, getProfile, updateAvatar, updateProfile } from '../config/db.js'
import { authenticate } from '../middleware/auth.js'
import { uploadPrivateFile } from '../services/s3.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function canAccessProfile(req, userId) {
  return req.user.id === userId || ['admin', 'lecturer'].includes(req.user.role)
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
  await createNotification({ userId: req.params.userId, role: req.user.role, type: 'profile', title: 'Profile updated', message: 'Your profile has been updated.' })
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

  let key = null
  if (req.file) {
    try {
      key = await uploadPrivateFile(req.file, 'profile-images')
    } catch (error) {
      console.warn(`Avatar upload fallback used: ${error.message}`)
    }
  }

  const user = await updateAvatar(req.params.userId, key)
  if (!user) return res.status(404).json({ message: 'Profile not found.' })
  res.status(201).json({ message: 'Profile picture updated successfully.', url: user.profileImageUrl || '', user })
})

export default router
