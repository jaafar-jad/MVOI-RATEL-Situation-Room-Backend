import { Router } from 'express';
import { getPublicComplaints, getPublicStats, getPublicComplaintById, handleSentiment, getPublicSettings  } from '../controllers/public.controller.js';

const router = Router();

// This is a public-facing route, no authentication is required.
router.get('/complaints', getPublicComplaints);
router.get('/complaints/:id', getPublicComplaintById);
router.post('/complaints/:id/sentiment', handleSentiment); // New sentiment route
router.get('/settings', getPublicSettings); // New public settings route
router.get('/stats', getPublicStats);

export default router;
