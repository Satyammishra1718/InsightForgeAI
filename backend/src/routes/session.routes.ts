import { Router } from 'express';
import {
  createSession,
  listSessions,
  getSessionById,
  deleteSession,
} from '../controllers/session.controller.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import {
  createSessionSchema,
  listSessionsQuerySchema,
  sessionParamSchema,
} from '../validators/session.validator.js';

const router = Router();

// POST /api/sessions -> create new research session
router.post('/', validateBody(createSessionSchema), createSession);

// GET /api/sessions -> list sessions (paginated, most recent first)
router.get('/', validateQuery(listSessionsQuerySchema), listSessions);

// GET /api/sessions/:id -> get one session with report & traces
router.get('/:id', validateParams(sessionParamSchema), getSessionById);

// DELETE /api/sessions/:id -> delete a session
router.delete('/:id', validateParams(sessionParamSchema), deleteSession);

export default router;
