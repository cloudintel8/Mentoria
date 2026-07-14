import { Router } from 'express'
import { getAdminStats, listAllResults, listStudents } from '../config/db.js'
import { authenticate, allowRoles } from '../middleware/auth.js'

const router = Router()

function mapResult(row) {
  return {
    ...row,
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
  }
}

router.get('/results', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  res.json((await listAllResults()).map(mapResult))
})

router.get('/students', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  res.json(await listStudents())
})

router.get('/stats', authenticate, allowRoles('admin', 'lecturer'), async (req, res) => {
  res.json(await getAdminStats())
})

export default router
