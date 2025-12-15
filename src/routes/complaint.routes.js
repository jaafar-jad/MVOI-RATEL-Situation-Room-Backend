import { Router } from 'express';
import { createComplaint, getUserComplaints, getComplaintById, uploadEvidence, updateComplaint, deleteComplaint, deleteEvidence, getComplaintStats } from '../controllers/complaint.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { uploadEvidenceToCloudinary } from '../middleware/multer.middleware.js';

const router = Router();

// Protect all complaint routes
router.use(verifyJWT);

router.route('/stats').get(getComplaintStats);

router.route('/')
    .post(createComplaint)
    .get(getUserComplaints);

router.route('/:id')
 .get(getComplaintById)
    .put(updateComplaint)
    .delete(deleteComplaint);

// New dedicated route for pre-uploading evidence before complaint creation
router.route('/upload-evidence-only').post(uploadEvidenceToCloudinary.array('evidenceFiles', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No evidence files provided.' });
    }
    const evidenceUrls = req.files.map(file => file.path);
    return res.status(200).json({ evidenceUrls });
});

router.route('/:id/upload-evidence')
    .post(uploadEvidenceToCloudinary.array('evidenceFiles', 10), uploadEvidence); // 'evidenceFiles' is the field name, limit to 10 files

router.route('/:id/evidence')
    .delete(deleteEvidence); // New route to delete evidence

export default router;