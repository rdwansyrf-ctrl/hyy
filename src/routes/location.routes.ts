import { Router } from 'express';
import { locationController } from '../controllers/location.controller.ts';
import { authenticate } from '../middleware/auth.middleware.ts';

const router = Router();

// All location routes require authentication
router.use(authenticate);

router.post('/update', (req, res) => locationController.update(req, res));
router.get('/:deviceId', (req, res) => locationController.getLatest(req, res));

export default router;
