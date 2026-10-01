import { Router } from 'express';
import { authController } from '../controllers/auth.controller.ts';
import { authenticate } from '../middleware/auth.middleware.ts';

const router = Router();

router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/refresh', (req, res) => authController.refresh(req, res));
router.post('/logout', authenticate, (req, res) => authController.logout(req, res));

export default router;
