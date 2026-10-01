import { Router } from 'express';
import { deviceController } from '../controllers/device.controller.ts';
import { authenticate } from '../middleware/auth.middleware.ts';

const router = Router();

// All device routes require authentication
router.use(authenticate);

router.post('/register', (req, res) => deviceController.register(req, res));
router.get('/', (req, res) => deviceController.getDevices(req, res));
router.get('/:id', (req, res) => deviceController.getDeviceById(req, res));
router.delete('/:id', (req, res) => deviceController.deleteDevice(req, res));

export default router;
