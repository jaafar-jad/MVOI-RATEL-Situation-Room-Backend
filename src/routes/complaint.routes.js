import { Router } from 'express';
import { createComplaint, getUserComplaints, getComplaintById, uploadEvidence, updateComplaint, deleteComplaint, deleteEvidence, getComplaintStats } from '../controllers/complaint.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { uploadEvidenceToCloudinary, uploadMvoiEvidenceToCloudinary } from '../middleware/multer.middleware.js';

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

// Use the more specific uploader for existing complaints where we have a complaint ID
const caseUploadMiddleware = uploadEvidenceToCloudinary.array('evidenceFiles', 50);
// Use the more generic uploader for new complaints where we don't have a complaint ID yet
const genericUploadMiddleware = uploadMvoiEvidenceToCloudinary.array('evidenceFiles', 50);

// New dedicated route for pre-uploading evidence before complaint creation
router.route('/upload-evidence-only').post((req, res) => {
    genericUploadMiddleware(req, res, function (err) {
        if (err) {
            // This will catch errors from the fileFilter (like invalid file type)
            // and other Multer errors, returning a clean 400 response.
            return res.status(400).json({ message: err.message });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No evidence files provided.' });
        }
        const evidenceUrls = req.files.map(file => file.path);
        return res.status(200).json({ evidenceUrls });
    });
});

router.route('/:id/upload-evidence')
    .post((req, res, next) => {
        caseUploadMiddleware(req, res, function (err) {
            if (err) return res.status(400).json({ message: err.message });
            next();
        });
    }, uploadEvidence);

router.route('/:id/evidence')
    .delete(deleteEvidence); // New route to delete evidence

export default router;