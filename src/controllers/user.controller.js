import User from '../models/user.model.js';
import AppSettings from '../models/settings.model.js';
import { notifyAdmins, createNotification } from '../utils/notification.js';

/**
 * @description Get the profile of the currently authenticated user.
 * @route GET /api/v1/users/me
 * @access Private
 */
export const getCurrentUser = async (req, res) => {
    // The user object is attached to the request by the verifyJWT middleware.
    // We can just send it back.
    if (req.user.status === 'Suspended' || req.user.status === 'Inactive') {
        return res.status(403).json({ 
            message: 'Your account has been suspended. Please contact support.',
            email: req.user.email 
        });
    }

    return res.status(200).json({ user: req.user, message: "Current user fetched successfully." });
};

/**
 * @description Update non-sensitive details for the authenticated user.
 * @route PUT /api/v1/users/me
 * @access Private
 */
export const updateUserProfile = async (req, res) => {
    const { fullName, contactInfo } = req.body;

    // We only allow updating specific fields to prevent users from changing their role, email, etc.
    const fieldsToUpdate = {};
    if (fullName) fieldsToUpdate.fullName = fullName;
    if (contactInfo) fieldsToUpdate.contactInfo = contactInfo;

    if (Object.keys(fieldsToUpdate).length === 0) {
        return res.status(400).json({ message: "No valid fields provided for update." });
    }

    try {
        const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: fieldsToUpdate }, { new: true, runValidators: true }).select('-refreshToken');

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.status(200).json({ user: updatedUser, message: "Profile updated successfully." });
    } catch (error) {
        return res.status(500).json({ message: "Error updating profile.", error: error.message });
    }
};

/**
 * @description Handle ID document upload.
 * @route POST /api/v1/users/upload-id
 * @access Private
 */
export const uploadIdDocument = async (req, res) => {
    try {
        // The file is uploaded by the multer-storage-cloudinary middleware.
        // The file details, including the secure URL, are in req.file.
        if (!req.file) {
            return res.status(400).json({ message: "ID document file not provided." });
        }

        const placeholderUrl = req.file.path; // This is the secure URL from Cloudinary

        let settings = await AppSettings.findOne();
        if (!settings) settings = await AppSettings.create({}); // Ensure settings exist

        req.user.idDocumentUrl = placeholderUrl;

        if (settings.autoVerifyUsers) {
            req.user.verificationStatus = 'Verified';
            await createNotification(req.user._id, 'Your identity has been verified!', '/complainant/dashboard');
        } else {
            req.user.verificationStatus = 'Pending';
            // Notify admins that a new user needs verification
            await notifyAdmins(
                `${req.user.fullName} has submitted their ID for verification.`,
                '/admin/verification',
                'Admin' // Only notify Admins about sensitive ID verification
            );
        }

        req.user.verificationHistory.push({
            status: req.user.verificationStatus,
            changedBy: req.user._id,
            notes: 'ID Document Uploaded'
        });

        await req.user.save({ validateBeforeSave: false });

        return res.status(200).json({ user: req.user, message: "ID document uploaded. Awaiting verification." });
    } catch (error) {
        console.error("Error in uploadIdDocument:", error);
        return res.status(500).json({ message: "Error uploading ID document.", error: error.message });
    }
};

/**
 * @description Revoke a pending ID submission.
 * @route DELETE /api/v1/users/revoke-id
 * @access Private
 */
export const revokeIdSubmission = async (req, res) => {
    try {
        if (req.user.verificationStatus === 'Verified') {
            return res.status(400).json({ message: 'Cannot revoke ID after verification is complete.' });
        }
        req.user.idDocumentUrl = undefined;
        req.user.verificationHistory.push({
            status: 'Revoked',
            changedBy: req.user._id,
            notes: 'User revoked submission'
        });
        req.user.verificationStatus = 'Not Submitted';
        await req.user.save({ validateBeforeSave: false });
        return res.status(200).json({ user: req.user, message: 'ID submission revoked.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error revoking ID submission.', error: error.message });
    }
};