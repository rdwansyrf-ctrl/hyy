import { Router } from 'express';
import { pairingController } from '../controllers/pairing.controller.ts';
import { authenticate } from '../middleware/auth.middleware.ts';

const router = Router();

// All pairing routes require authentication
router.use(authenticate);

router.post('/request', (req, res) => pairingController.request(req, res));
router.get('/requests', (req, res) => pairingController.getRequests(req, res));
router.post('/:id/approve', (req, res) => pairingController.approve(req, res));
router.post('/:id/reject', (req, res) => pairingController.reject(req, res));
router.post('/:id/revoke', (req, res) => pairingController.revoke(req, res));

export default router;
