import { Router } from 'express';
import { verifyJWT, verifyAdminOrStaff } from '../middleware/auth.middleware.js';
import {
    getComplaints,
    getUsersToVerify,
    scheduleCase,
    verifyUser,
    vetCase,
    getComplaintStats,
    closeCase, bulkDeleteComplaints, updateComplaintDetails,
    addNote,
    revertCaseToPending,
    reviewAppeal,
    respondToUserProposal,
    getAllUsers,
    updateUserRole,
    updateUserStatus,
    createStaffAccount,
    getUserById,
    bulkUpdateUserStatus,
    bulkVerifyUsers,
    getAppealingUsers,
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
router.get('/users/appeals', getAppealingUsers); // New route for fetching appeals
router.put('/users/bulk-status', bulkUpdateUserStatus);
router.put('/users/bulk-verify', bulkVerifyUsers); // New route for bulk verification
router.delete('/users/bulk', bulkDeleteUsers);
router.get('/users/:userId', getUserById);
router.get('/users-to-verify', getUsersToVerify);

router.get('/complaints', getComplaints); // Renamed from /triage
router.put('/verify-user/:userId', verifyUser);
router.put('/vet-case/:caseId', vetCase);
router.put('/schedule-case/:caseId', scheduleCase);
router.put('/invitation-response/:complaintId', respondToUserProposal);
router.put('/revert-case/:caseId', revertCaseToPending); // New route to revert a case
router.put('/close-case/:caseId', closeCase);
router.put('/complaint/:id/details', updateComplaintDetails); // New route to edit complaint details
router.post('/complaint/:caseId/notes', addNote); // New route to add a note
router.put('/appeals/:userId/review', reviewAppeal); // New route for reviewing appeals

// --- Settings Route ---
router.route('/settings')
    .get(getAppSettings)
    .put(updateAppSettings);

export default router;