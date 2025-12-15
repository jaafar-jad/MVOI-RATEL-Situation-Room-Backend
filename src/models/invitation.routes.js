import { Router } from 'express';
import { respondToInvitation } from '../controllers/invitation.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// Protect all routes
router.use(verifyJWT);

router.put('/:complaintId/respond', respondToInvitation);

export default router;