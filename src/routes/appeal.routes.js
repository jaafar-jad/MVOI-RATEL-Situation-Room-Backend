import { Router } from 'express';
import { submitAppeal } from '../controllers/appeal.controller.js';

const router = Router();

// This is a public-facing route for submitting appeals.
router.post('/', submitAppeal);

export default router;

