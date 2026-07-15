import { Router } from 'express'
import { authenticate, allowRoles } from '../middleware/auth.js'
import { createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../config/db.js'

const router = Router()

router.get('/:userId', authenticate, async (req, res) => {
  if (req.user.id !== req.params.userId && !['admin', 'lecturer'].includes(req.user.role)) return res.status(403).json({ message: 'You can only view your own notifications.' })
  res.json(await listNotifications(req.params.userId))
})

router.put('/:notificationId/read', authenticate, async (req, res) => {
  if (!await markNotificationRead(req.params.notificationId, req.user.id)) return res.status(404).json({ message: 'Notification not found.' })
  res.json({ message: 'Notification marked as read.' })
})

router.put('/:userId/read-all', authenticate, async (req, res) => {
  if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'You can only update your own notifications.' })
  await markAllNotificationsRead(req.params.userId)
  res.json({ message: 'Notifications marked as read.' })
})

router.post('/', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  if (!req.body.userId || !req.body.title || !req.body.message) return res.status(400).json({ message: 'userId, title, and message are required.' })
  res.status(201).json(await createNotification(req.body))
})

export default router
