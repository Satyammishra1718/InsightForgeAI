import { Router } from 'express';
import healthRoutes from './health.routes.js';
import sessionRoutes from './session.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/sessions', sessionRoutes);

export default apiRouter;
