import { Router } from 'express'
import { listAllResults } from '../config/db.js'
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

export default router
