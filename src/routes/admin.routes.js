import { Router } from 'express';
import { verifyJWT, verifyAdminOrStaff } from '../middleware/auth.middleware.js';
import {
    getComplaints,
    getUsersToVerify,
    scheduleCase,
    verifyUser,
    vetCase,
    getComplaintStats,
    closeCase,
    bulkDeleteComplaints,
    publishComplaint,
    updatePublicNarrative, 
    addNote,
    revertCaseToPending,
    respondToUserProposal,
    getAllUsers,
    updateUserRole,
    updateUserStatus,
    createStaffAccount,
    getUserById,
    bulkDeleteUsers,
    getUserStats,
    getDailyActiveUsers,
    getAnalytics,
    getAppSettings,
    updateAppSettings,
} from '../controllers/admin.controller.js';

const router = Router();

// Protect all routes in this file: user must be logged in AND be an Admin or Staff.
router.use(verifyJWT, verifyAdminOrStaff);

// --- Statistics Routes ---
router.get('/stats/complaints', getComplaintStats);
router.get('/stats/users', getUserStats);
router.get('/stats/daily-active-users', getDailyActiveUsers);
router.get('/analytics', getAnalytics); // New comprehensive analytics endpoint

router.delete('/complaints/bulk', bulkDeleteComplaints); // New route for bulk deletion

// User Management Center (UMC) Routes
router.get('/users', getAllUsers);
router.put('/user-role/:userId', updateUserRole);
router.put('/user-status/:userId', updateUserStatus);
router.post('/users/create-staff', createStaffAccount);
router.delete('/users/bulk', bulkDeleteUsers);
router.get('/users/:userId', getUserById);

router.get('/complaints', getComplaints); // Renamed from /triage
router.get('/users-to-verify', getUsersToVerify);
router.put('/verify-user/:userId', verifyUser);
router.put('/vet-case/:caseId', vetCase);
router.put('/schedule-case/:caseId', scheduleCase);
router.put('/invitation-response/:complaintId', respondToUserProposal);
router.put('/revert-case/:caseId', revertCaseToPending); // New route to revert a case
router.put('/close-case/:caseId', closeCase);
router.put('/publish-complaint/:caseId', publishComplaint); // New route to make a complaint public
router.put('/complaint/:caseId/public-narrative', updatePublicNarrative); // New route to edit public narrative
router.post('/complaint/:caseId/notes', addNote); // New route to add a note

// --- Settings Route ---
router.route('/settings')
    .get(getAppSettings)
    .put(updateAppSettings);

export default router;