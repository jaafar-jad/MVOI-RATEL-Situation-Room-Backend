import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

const idStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Safely access user ID, providing a fallback.
        const idPrefix = req.user ? req.user._id.toString() : 'unauthenticated';
        return {
            folder: 'advocacy-platform/user-ids',
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
            public_id: `${idPrefix}-${Date.now()}`,
        };
    },
});

const evidenceStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Sanitize the original filename to make it a valid public_id
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9_.]/g, '-');
        const idPrefix = req.params.id || (req.user ? req.user._id.toString() : 'temp');
        return {
            folder: 'advocacy-platform/evidence-files',
            resource_type: 'auto',
            public_id: `${idPrefix}-${sanitizedFilename}-${Date.now()}`,
        };
    },
});

const mvoiEvidenceStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // A simpler public_id for non-user-specific uploads
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9_.]/g, '-');
        return {
            folder: 'advocacy-platform/mvoi-evidence',
            resource_type: 'auto',
            public_id: `mvoi-${sanitizedFilename}-${Date.now()}`,
        };
    },
});

export const uploadIdToCloudinary = multer({ storage: idStorage });

const evidenceFileFilter = (req, file, cb) => {
    // Accept all file types
    cb(null, true);
};

export const uploadEvidenceToCloudinary = multer({ 
    storage: evidenceStorage, 
    fileFilter: evidenceFileFilter,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit per file
});
export const uploadMvoiEvidenceToCloudinary = multer({ 
    storage: mvoiEvidenceStorage, 
    fileFilter: evidenceFileFilter,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit per file
});