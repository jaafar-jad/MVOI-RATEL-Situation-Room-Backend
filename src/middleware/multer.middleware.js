import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

const idStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'advocacy-platform/user-ids',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
        // public_id can be customized to avoid name conflicts
        public_id: (req, file) => `${req.user._id}-${Date.now()}`,
    },
});

const evidenceStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'advocacy-platform/evidence-files',
        resource_type: 'auto',
        public_id: (req, file) => {
            // Sanitize the original filename to make it a valid public_id
            const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9_.]/g, '-');
            return `${req.params.id}-${sanitizedFilename}-${Date.now()}`;
        },
    },
});

export const uploadIdToCloudinary = multer({ storage: idStorage });

const evidenceFileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/avif',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv',
        'application/json',
        'video/mp4',
        'video/quicktime',
        'audio/mpeg',
        'audio/wav'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only specific image, document, audio, and video files are allowed.`), false);
    }
};

export const uploadEvidenceToCloudinary = multer({ storage: evidenceStorage, fileFilter: evidenceFileFilter });