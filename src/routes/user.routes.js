import { Router } from 'express';
import { getCurrentUser, updateUserProfile, uploadIdDocument, revokeIdSubmission, getActiveSessions, revokeSession } from '../controllers/user.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { uploadIdToCloudinary } from '../middleware/multer.middleware.js';

const router = Router();

// All routes in this file are protected and require a valid access token.
router.use(verifyJWT);

router.route('/me')
    .get(getCurrentUser)
    .put(updateUserProfile);

router.route('/upload-id')
    .post(uploadIdToCloudinary.single('idDocument'), uploadIdDocument); // 'idDocument' is the field name in the form-data

router.route('/revoke-id')
    .delete(revokeIdSubmission);

router.get('/sessions', getActiveSessions);
router.delete('/sessions/:sessionId', revokeSession);

export default router;