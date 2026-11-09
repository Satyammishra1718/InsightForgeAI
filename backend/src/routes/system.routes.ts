import { Router } from 'express';
import { getSystemStatus } from '../controllers/system.controller.js';

const router = Router();

// GET /api/system/status -> returns connectivity of Mongo, Redis, Python service, and MCP servers
router.get('/status', getSystemStatus);

export default router;
