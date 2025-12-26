import Complaint from '../models/complaint.model.js';
import User from '../models/user.model.js';
import { createNotification, notifyAdmins } from '../utils/notification.js';
import { sendEmail } from '../utils/email.js';
import cloudinary from '../config/cloudinary.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import os from 'os-utils';
import AppSettings from '../models/settings.model.js';

/**
 * @description Get key performance indicators (KPIs) for the admin dashboard.
 * @route GET /api/v1/admin/stats/complaints
 * @access Admin/Staff
 */
export const getComplaintStats = async (req, res) => {
    try {
        const totalComplaints = Complaint.countDocuments();
        const pendingReview = Complaint.countDocuments({ status: 'Pending Review' });
        const closedCases = Complaint.countDocuments({ status: 'Closed' });
        const successfulResolutions = Complaint.countDocuments({ status: 'Closed', resolutionStatus: 'Resolved Successfully' });

        const categoryBreakdown = Complaint.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const [
            total,
            pending,
            closed,
            successful,
            categories,
        ] = await Promise.all([
            totalComplaints,
            pendingReview,
            closedCases,
            successfulResolutions,
            categoryBreakdown,
        ]);

        // Calculate resolution rate, avoiding division by zero
        const resolutionRate = closed > 0 ? (successful / closed) * 100 : 0;

        const stats = {
            totalComplaints: total,
            pendingReview: pending,
            closedCases: closed,
            resolutionRate: resolutionRate.toFixed(1), // e.g., "25.5"
            categoryBreakdown: categories,
        };

        return res.status(200).json({
            stats,
            message: 'Admin stats fetched successfully.'
        });

    } catch (error) {
        return res.status(500).json({
            message: 'Error fetching complaint stats.',
            error: error.message
        });
    }
};

/**
 * @description Get all complaints with filtering, searching, and pagination.
 * @route GET /api/v1/admin/complaints
 * @access Admin/Staff
 */
export const getComplaints = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { search, category, desiredAction, status, sortBy, sortOrder, type, recentUploads } = req.query; // Added 'type'
    const skip = (page - 1) * limit;

    try {
        let aggregationPipeline = [];
        const complaintMatchStage = {};

        // --- NEW: Filter by type ('Case' or 'MVOI') ---
        complaintMatchStage.type = type || 'Case'; // Default to 'Case' if no type is specified

        // Filter by status if provided, otherwise fetch all. Defaults to 'Pending Review' if no status is given.
        if (status) {
            if (status.includes(',')) {
                complaintMatchStage.status = { $in: status.split(',') };
            } else {
                complaintMatchStage.status = status;
            }
        } else {
            complaintMatchStage.status = 'Pending Review';
        }

        if (category) {
            complaintMatchStage.category = category;
        }
        if (desiredAction) {
            complaintMatchStage.desiredAction = desiredAction;
        }

        // --- Filter by Recent Uploads (Last 24h) ---
        if (recentUploads === 'true') {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            // Filter complaints created or updated recently
            complaintMatchStage.updatedAt = { $gte: twentyFourHoursAgo };
        }

        // --- Optimized Search Logic ---
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const isCaseRefSearch = /^C-\d{4}-\d{4}$/i.test(search);

            // If the search term is not a case reference, it's likely a user or vendor search.
            // We find matching user IDs first, which is more performant.
            if (!isCaseRefSearch) {
                const matchingUsers = await User.find({ $text: { $search: search } }).select('_id');
                const userIds = matchingUsers.map(u => u._id);

                complaintMatchStage.$or = [
                    { complainant: { $in: userIds } },
                    { 'vendorDetails.name': searchRegex },
                    { caseRef: searchRegex } // Also search caseRef as a fallback
                ];
            } else {
                // If it looks like a case reference, prioritize that search.
                complaintMatchStage.caseRef = searchRegex;
            }
        }

        const sortStage = {};
        sortStage[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

        // --- Build the Aggregation Pipeline ---
        aggregationPipeline = [
            // 1. Filter complaints first - this is the most important optimization.
            { $match: complaintMatchStage },
            // 2. Sort the filtered results.
            { $sort: sortStage },
            // 3. Perform the join ($lookup) on the smaller, filtered dataset.
            {
                $lookup: {
                    from: 'users',
                    localField: 'complainant',
                    foreignField: '_id',
                    as: 'complainantDetails',
                },
            },
            // 4. Deconstruct the complainantDetails array.
            { $unwind: '$complainantDetails' },
            // 5. Use $facet for pagination and getting total count efficiently.
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }],
                },
            },
        ];

        const results = await Complaint.aggregate(aggregationPipeline);

        // The aggregation returns `complainantDetails`. We need to map this back to `complainant`
        // for consistency with other endpoints and frontend expectations.
        const complaints = results[0].data.map(complaint => {
            const { complainantDetails, ...rest } = complaint;
            return {
                ...rest,
                complainant: complainantDetails,
            };
        });
        const totalComplaints = results[0].metadata[0] ? results[0].metadata[0].total : 0;
        const totalPages = Math.ceil(totalComplaints / limit);

        return res.status(200).json({
            complaints,
            currentPage: page,
            totalPages,
            totalComplaints,
            message: 'Complaints fetched successfully.',
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching triage list.', error: error.message });
    }
};

/**
 * @description Get all users with 'Pending' verification status.
 * @route GET /api/v1/admin/users-to-verify
 * @access Admin/Staff
 */
export const getUsersToVerify = async (req, res) => {
    try {
        // This can be a simple query as it's for a specific dashboard widget/page.
        // The more complex getAllUsers can be used for the main User Management table.
        const usersToVerify = await User.find({ verificationStatus: 'Pending' })
            .select('-password -refreshToken') // Exclude sensitive data
            .sort({ updatedAt: -1 }); // Show most recently submitted first

        return res.status(200).json({ users: usersToVerify });
    } catch (error) {
        return res.status(500).json({
            message: 'Error fetching users pending verification.',
            error: error.message
        });
    }
};

/**
 * @description Update a user's verification status and notify them.
 * @route PUT /api/v1/admin/verify-user/:userId
 * @access Admin/Staff
 */
export const verifyUser = async (req, res) => {
    const { status } = req.body; // Expects 'Verified', 'Rejected', or 'Not Submitted' (for revoking)
    if (!['Verified', 'Rejected', 'Pending', 'Not Submitted'].includes(status)) {
        return res.status(400).json({ message: "Invalid status provided." });
    }

    try {
        const user = await User.findByIdAndUpdate(
            req.params.userId, 
            { 
                verificationStatus: status,
                $push: {
                    verificationHistory: {
                        status: status,
                        changedBy: req.user._id,
                        notes: `Admin verification update: ${status}`
                    }
                }
            }, 
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // --- New Feature: Notify user of verification status change ---
        const emailSubject = `Your Identity Verification Status has been Updated`;
        const emailHtml = `
            <h1>Identity Verification Update</h1>
            <p>Dear ${user.fullName},</p>
            <p>An administrator has reviewed your submitted ID document. Your new verification status is: <strong>${status}</strong>.</p>
            ${status === 'Verified'
                ? '<p>You can now proceed to submit complaints on the platform.</p>'
                : '<p>Your verification was not approved at this time. You may try re-uploading a clearer document if you wish.</p>'
            }
            <p>Thank you for using our platform.</p>
        `;
        await sendEmail(user.email, emailSubject, emailHtml);
        // --- End of New Feature ---
        
        // Create an in-app notification for the user
        await createNotification(
            user._id,
            `Your identity verification has been ${status.toLowerCase()}.`
        );

        return res.status(200).json({ user, message: `User verification status updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating user verification.', error: error.message });
    }
};

/**
 * @description Update a complaint's status (Reject only).
 * @route PUT /api/v1/admin/vet-case/:caseId
 * @access Admin/Staff
 */
export const vetCase = async (req, res) => {
    const { status, noteContent } = req.body; // Changed from vettingNotes to noteContent

    const allowedStatuses = ['Approved for Scheduling', 'Rejected'];

    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ message: `Invalid status provided. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    // Vetting notes are only required for rejection.
    if (status === 'Rejected' && !noteContent) {
        return res.status(400).json({ message: 'Vetting notes are required when rejecting a case.' });
    }

    try {
        const complaint = await Complaint.findById(req.params.caseId).populate('complainant', 'email fullName').populate('notes.author', 'fullName');

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        complaint.status = status;
        
        // If a note was provided during vetting (required for rejection), add it to the notes array.
        if (status === 'Rejected' && noteContent) {
            complaint.notes.push({
                content: noteContent,
                author: req.user._id,
                visibility: 'User Visible', // Notes added during rejection are intended for the user.
            });
        }

        await complaint.save();

        // --- Notify user of case rejection ---
        if (status === 'Rejected') {
            // Find the note that was just added to be sent to the user
            const userVisibleNote = complaint.notes
                .filter(note => note.visibility === 'User Visible')
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            const rejectionNoteContent = userVisibleNote ? userVisibleNote.content : 'Please review your complaint for completeness.';

            const emailSubject = `Update on Your Complaint: ${complaint.caseRef}`;
            const emailHtml = `
                <h1>Complaint Status Update</h1>
                <p>Dear ${complaint.complainant.fullName},</p>
                <p>Your complaint (Ref: <strong>${complaint.caseRef}</strong>) has been reviewed and unfortunately could not be approved at this time.</p>
                <p><strong>Admin Notes:</strong> ${rejectionNoteContent}</p>
                <p>Please review the notes and feel free to reach out if you have further questions.</p>
            `;
            await sendEmail(complaint.complainant.email, emailSubject, emailHtml);

            // Create an in-app notification with the rejection note
            await createNotification(
                complaint.complainant._id,
                `Your complaint '${complaint.title}' was rejected. Notes: ${rejectionNoteContent.substring(0, 100)}...`,
                `/complainant/complaint/${complaint._id}`
            );
        } else if (status === 'Approved for Scheduling') {
            await createNotification(
                complaint.complainant._id,
                `Good news! Your complaint '${complaint.caseRef}' has been approved for scheduling.`,
                `/complainant/complaint/${complaint._id}`
            );
        }

        return res.status(200).json({ complaint, message: `Case status updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error vetting case.', error: error.message });
    }
};

/**
 * @description Schedule an approved complaint and notify the user.
 * @route PUT /api/v1/admin/schedule-case/:caseId
 * @access Admin/Staff
 */
export const scheduleCase = async (req, res) => {
    const { date, time, location } = req.body;

    if (!date || !time || !location) {
        return res.status(400).json({ message: 'Date, time, and location are required for scheduling.' });
    }

    try {
        // Populate complainant details to get their email and name
        const complaint = await Complaint.findById(req.params.caseId).populate('complainant', 'email fullName');
        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Ensure the case is in a state that can be scheduled
        if (!['Pending Review', 'Approved for Scheduling'].includes(complaint.status)) {
            return res.status(409).json({ message: `Cannot schedule case. Current status is '${complaint.status}'.` });
        }

        // Update status and add invitation details
        complaint.status = 'Approved for Scheduling';
        complaint.invitation = { date: new Date(date), time, location };
        await complaint.save();

        // Send an email notification to the user
        const complainantEmail = complaint.complainant.email;
        const complainantName = complaint.complainant.fullName;
        const emailSubject = `ACTION REQUIRED: Your Case Has Been Scheduled (${complaint.caseRef})`;
        const emailHtml = `
            <h1>Case Scheduled</h1>
            <p>Dear ${complainantName},</p>
            <p>Your complaint (Ref: <strong>${complaint.caseRef}</strong>) has been approved and a formal meeting has been scheduled.</p>
            <h3>Invitation Details:</h3>
            <p>
                <strong>Date:</strong> ${new Date(date).toLocaleDateString()}<br>
                <strong>Time:</strong> ${time}<br>
                <strong>Location/Method:</strong> ${location}
            </p>
            <p>Please log in to your dashboard to confirm these details. Your timely response is appreciated.</p>
        `;
        await sendEmail(complainantEmail, emailSubject, emailHtml);

        // Create an in-app notification
        await createNotification(
            complaint.complainant._id,
            `Action Required: Your case '${complaint.caseRef}' has been scheduled.`,
            `/complainant/complaint/${complaint._id}` // Ensure the ID is in the link
        );

        return res.status(200).json({ complaint, message: 'Case has been successfully scheduled.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error scheduling case.', error: error.message });
    }
};

/**
 * @description Admin responds to a user's proposed alternative meeting time.
 * @route PUT /api/v1/admin/invitation-response/:complaintId
 * @access Admin/Staff
 */
export const respondToUserProposal = async (req, res) => {
    const { complaintId } = req.params;
    const { adminResponse, message } = req.body; // adminResponse can be 'Accepted' or 'Rejected'

    if (!adminResponse || !['Accepted', 'Rejected'].includes(adminResponse)) {
        return res.status(400).json({ message: 'A valid response ("Accepted" or "Rejected") is required.' });
    }

    try {
        const complaint = await Complaint.findById(complaintId).populate('complainant', 'fullName email');

        if (!complaint || !complaint.invitation || !complaint.invitation.userResponse) {
            return res.status(404).json({ message: 'No user proposal found for this complaint.' });
        }

        if (adminResponse === 'Accepted') {
            // Update the main invitation details with the user's proposal
            complaint.invitation.date = complaint.invitation.userResponse.proposedDate;
            complaint.invitation.time = complaint.invitation.userResponse.proposedTime;
            // Clear the user response as it has been actioned
            complaint.invitation.userResponse = undefined;
            // Set status to Ongoing
            complaint.status = 'Ongoing';
            complaint.statusHistory.push({ status: 'Scheduled', timestamp: new Date(), notes: 'Admin accepted user\'s proposed time.' });

            await createNotification(
                complaint.complainant._id,
                `Your proposed time for case ${complaint.caseRef} has been accepted.`,
                `/complainant/complaint/${complaint._id}`
            );
        } else { // Rejected
            // Clear the user response and notify them to await a new schedule
            complaint.invitation.userResponse = undefined;
            complaint.statusHistory.push({ status: 'Approved for Scheduling', timestamp: new Date(), notes: `Admin rejected user's proposed time. Reason: ${message}` });

            await createNotification(
                complaint.complainant._id,
                `Your proposed time for case ${complaint.caseRef} was not feasible. An admin will propose a new time shortly. Reason: ${message}`,
                `/complainant/complaint/${complaint._id}`
            );
        }

        await complaint.save();
        return res.status(200).json({ complaint, message: `Admin response recorded. User has been notified.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error responding to user proposal.', error: error.message });
    }
};

/**
 * @description Review an account appeal and either accept (reactivate) or reject it.
 * @route PUT /api/v1/admin/appeals/:userId/review
 * @access Admin only
 */
export const reviewAppeal = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. You do not have permission to review appeals.' });
    }

    const { userId } = req.params;
    const { action, reason } = req.body; // action: 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action specified. Must be "accept" or "reject".' });
    }

    try {
        const userToUpdate = await User.findById(userId);
        if (!userToUpdate) {
            return res.status(404).json({ message: 'User not found.' });
        }

        let notificationMessage = '';
        let responseMessage = '';

        if (action === 'accept') {
            userToUpdate.status = 'Active';
            userToUpdate.appealReason = undefined; // Clear the appeal reason
            notificationMessage = 'Your account appeal has been accepted. Your access has been restored.';
            responseMessage = `User ${userToUpdate.fullName} has been reactivated.`;
            
            userToUpdate.statusHistory.push({
                status: 'Active',
                changedBy: req.user._id,
                reason: 'Appeal Accepted'
            });
        } else { // reject
            notificationMessage = `Your account appeal has been reviewed and was not approved. Reason: ${reason || 'No reason provided.'}`;
            responseMessage = `Appeal for ${userToUpdate.fullName} has been rejected.`;
            
            userToUpdate.statusHistory.push({
                status: userToUpdate.status, // Status likely remains Suspended/Inactive
                changedBy: req.user._id,
                reason: `Appeal Rejected: ${reason || 'No reason provided'}`
            });
        }

        await userToUpdate.save();
        await createNotification(userToUpdate._id, notificationMessage, '/complainant/dashboard');
        await sendEmail(userToUpdate.email, 'Update on Your Account Appeal', `<p>${notificationMessage}</p>`);
        return res.status(200).json({ user: userToUpdate, message: responseMessage });
    } catch (error) {
        return res.status(500).json({ message: 'Error reviewing appeal.', error: error.message });
    }
};
/**
 * @description Revert a case from 'Approved for Scheduling' back to 'Pending Review'.
 * @route PUT /api/v1/admin/revert-case/:caseId
 * @access Admin/Staff
 */
export const revertCaseToPending = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.caseId);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Allow reverting from 'Approved for Scheduling' or 'Rejected'
        if (!['Approved for Scheduling', 'Rejected'].includes(complaint.status)) {
            return res.status(409).json({ message: `Cannot revert case. Current status is '${complaint.status}'.` });
        }

        // Update status, add to history, and clear invitation details
        complaint.status = 'Pending Review';
        complaint.statusHistory.push({
            status: 'Pending Review',
            timestamp: new Date(),
            notes: `Case reverted by admin ${req.user.fullName}.`,
        });

        // Clear data associated with the previous status
        if (complaint.status === 'Approved for Scheduling') {
            complaint.invitation = undefined;
        } 
        // We no longer clear notes on revert, to preserve history.
        await complaint.save();

        // Notify the user that their case status has changed.
        await createNotification(complaint.complainant, `An update on your case '${complaint.caseRef}': It has been returned to 'Pending Review' by an administrator.`, `/complainant/complaint/${complaint._id}`);

        return res.status(200).json({ complaint, message: 'Case has been reverted to Pending Review.' });
    } catch (error) { 
        return res.status(500).json({ message: 'Error reverting case.', error: error.message });
    }
};
/**
 * @description Close a case and set its final resolution status.
 * @route PUT /api/v1/admin/close-case/:caseId
 * @access Admin/Staff
 */
export const closeCase = async (req, res) => {
    const { resolutionStatus } = req.body;
    const validStatuses = ['Resolved Successfully', 'Unresolved', 'Cancelled by User'];

    if (!resolutionStatus || !validStatuses.includes(resolutionStatus)) {
        return res.status(400).json({ message: 'A valid resolution status is required.' });
    }

    try {
        const complaint = await Complaint.findById(req.params.caseId).populate('complainant', 'fullName');
        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        complaint.status = 'Closed';
        complaint.resolutionStatus = resolutionStatus;
        await complaint.save();

        // Create an in-app notification for the user
        await createNotification(
            complaint.complainant._id,
            `Your case '${complaint.caseRef}' has been closed. Final status: ${resolutionStatus}.`
        );

        // Optional: Send an email notification to the user that their case is closed.

        return res.status(200).json({ complaint, message: `Case has been closed with status: ${resolutionStatus}` });

    } catch (error) {
        return res.status(500).json({ message: 'Error closing case.', error: error.message });
    }
};

/**
 * @description Bulk delete complaints.
 * @route DELETE /api/v1/admin/complaints/bulk
 * @access Admin/Staff
 */
export const bulkDeleteComplaints = async (req, res) => {
    const { complaintIds } = req.body;

    if (!Array.isArray(complaintIds) || complaintIds.length === 0) {
        return res.status(400).json({ message: 'An array of complaintIds is required.' });
    }

    try {
        // Find all complaints to get their evidence URLs for deletion from Cloudinary
        const complaintsToDelete = await Complaint.find({ _id: { $in: complaintIds } });

        if (complaintsToDelete.length === 0) {
            return res.status(404).json({ message: 'No matching complaints found for deletion.' });
        }

        // Collect all evidence URLs and delete them from Cloudinary
        const evidenceUrls = complaintsToDelete.flatMap(c => c.evidenceUrls || []);
        if (evidenceUrls.length > 0) {
            // Correctly extract the public_id from the full Cloudinary URL.
            // The public_id is the part of the path after '/upload/' and before the file extension.
            // Example URL: https://res.cloudinary.com/<cloud_name>/image/upload/v12345/advocacy-platform/evidence-files/some-id.jpg
            // We need to extract: "advocacy-platform/evidence-files/some-id"
            const publicIds = evidenceUrls.map(url => url.split('/upload/')[1].split('/').slice(1).join('/').split('.')[0]);

            // Cloudinary's delete_resources can handle up to 100 public_ids at a time.
            // For a production app with more, you'd chunk this into multiple requests.
            await cloudinary.api.delete_resources(publicIds, { resource_type: 'image' });
        }

        // Delete the complaints from the database
        await Complaint.deleteMany({ _id: { $in: complaintIds } });

        return res.status(200).json({ message: `${complaintsToDelete.length} complaints deleted successfully.` });

    } catch (error) {
        return res.status(500).json({ message: 'Error during bulk deletion.', error: error.message });
    }
};


/**
 * @description Admin updates any detail of a complaint, including publishing it.
 * @route PUT /api/v1/admin/complaint/:id/details
 * @access Admin/Staff
 */
export const updateComplaintDetails = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Sanitize updateData to prevent unwanted field updates like status, complainant, etc.
    const allowedUpdates = [
        'title', 'category', 'desiredAction', 'narrative', 
        'publicNarrative', 'isPublic', 'vendorDetails', 
        'initiativeCategory', 'applicantType', 'locationDetails', 'beneficiaryCount'
    ];
    const finalUpdateData = {};
    for (const key of allowedUpdates) {
        // Check for undefined to allow setting boolean `isPublic` to false
        if (updateData[key] !== undefined) {
            finalUpdateData[key] = updateData[key];
        }
    }

    if (Object.keys(finalUpdateData).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    try {
        const complaint = await Complaint.findByIdAndUpdate(id, { $set: finalUpdateData }, { new: true });

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        return res.status(200).json({ complaint, message: 'Complaint details updated successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating complaint details.', error: error.message });
    }
};

/**
 * @description Add a new note to a complaint.
 * @route POST /api/v1/admin/complaint/:caseId/notes
 * @access Admin/Staff
 */
export const addNote = async (req, res) => {
    const { content, visibility } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ message: 'Note content cannot be empty.' });
    }
    if (!['Admin Only', 'User Visible'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid note visibility.' });
    }

    try {
        let complaint = await Complaint.findById(req.params.caseId);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        complaint.notes.push({ content, author: req.user._id, visibility });
        const savedComplaint = await complaint.save();

        // Populate the author details on the newly saved complaint object before sending it back
        const updatedComplaint = await savedComplaint.populate({
            path: 'notes',
            populate: { path: 'author', select: 'fullName' }
        });

        return res.status(201).json({ complaint: updatedComplaint, message: 'Note added successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error adding note.', error: error.message });
    }
};

/**
 * @description Get all users with filtering and pagination for the UMC.
 * @route GET /api/v1/admin/users
 * @access Admin/Staff
 */
export const getAllUsers = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const { search, role, verificationStatus, status, sortBy, sortOrder, recentUploads } = req.query;
    const skip = (page - 1) * limit;

    try {
        const matchStage = {};

        // Apply filters
        if (role) matchStage.role = role;
        if (verificationStatus) matchStage.verificationStatus = verificationStatus;
        if (status) matchStage.status = status;

        // --- Filter by Recent ID Uploads (Last 24h) ---
        if (recentUploads === 'true') {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            matchStage.updatedAt = { $gte: twentyFourHoursAgo };
            matchStage.idDocumentUrl = { $exists: true, $ne: null }; // Ensure they actually have a doc
        }

        // --- ROBUST PARTIAL SEARCH LOGIC ---
        if (search) {
            // Creating a case-insensitive regex for partial matches
            const searchRegex = new RegExp(search, 'i');
            
            matchStage.$or = [
                { fullName: { $regex: searchRegex } },
                { email: { $regex: searchRegex } }
            ];
        }

        const sortStage = {};
        sortStage[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

        // Fetch users
        const users = await User.find(matchStage)
            .select('-refreshToken -password') // Exclude sensitive data
            .sort(sortStage)
            .skip(skip)
            .limit(limit);

        const totalUsers = await User.countDocuments(matchStage);
        const totalPages = Math.ceil(totalUsers / limit);

        return res.status(200).json({
            users,
            currentPage: page,
            totalPages,
            totalUsers,
        });

    } catch (error) {
        return res.status(500).json({ 
            message: 'Error fetching users.', 
            error: error.message 
        });
    }
};

/**
 * @description Update a user's role.
 * @route PUT /api/v1/admin/user-role/:userId
 * @access Admin only
 */
export const updateUserRole = async (req, res) => {
    // PRD: Only Admins can change roles.
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. You do not have permission to change user roles.' });
    }

    const { role } = req.body;
    if (!['User', 'Staff', 'Admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified.' });
    }

    try {
        const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        return res.status(200).json({ user, message: `User role updated to ${role}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating user role.', error: error.message });
    }
};

/**
 * @description Update a user's account status (Active, Inactive, Suspended).
 * @route PUT /api/v1/admin/user-status/:userId
 * @access Admin/Staff
 */
export const updateUserStatus = async (req, res) => {
    const { status } = req.body;
    if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status specified.' });
    }

    try {
        const userToUpdate = await User.findById(req.params.userId);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found.' });

        // PRD: Staff cannot manage other Admins or Staff
        if (req.user.role === 'Staff' && userToUpdate.role !== 'User') {
            return res.status(403).json({ message: 'Forbidden. Staff can only manage Users.' });
        }

        userToUpdate.status = status;
        
        // If suspending or deactivating, force logout by clearing refresh token
        if (status === 'Inactive' || status === 'Suspended') {
            userToUpdate.refreshToken = null;
        }

        userToUpdate.statusHistory.push({
            status,
            changedBy: req.user._id,
            reason: 'Manual Status Update'
        });

        await userToUpdate.save();

        return res.status(200).json({ user: userToUpdate, message: `User status updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating user status.', error: error.message });
    }
};

/**
 * @description Get a single user by ID for the detail view.
 * @route GET /api/v1/admin/users/:userId
 * @access Admin/Staff
 */
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-refreshToken -password')
            .populate('verificationHistory.changedBy', 'fullName email');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        return res.status(200).json({ user });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching user details.', error: error.message });
    }
};

/**
 * @description Create a new Staff account.
 * @route POST /api/v1/admin/users/create-staff
 * @access Admin only
 */
export const createStaffAccount = async (req, res) => {
    // PRD: Only Admins can create staff.
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. You do not have permission to create staff accounts.' });
    }

    const { fullName, email } = req.body;
    if (!fullName || !email) {
        return res.status(400).json({ message: 'Full name and email are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'A user with this email already exists.' });
        }

        const newUser = await User.create({
            fullName,
            email,
            role: 'Staff',
            verificationStatus: 'Verified', // Staff are implicitly verified
        });

        // Send an email to the new staff member directing them to login via Google
        const emailSubject = 'Your New Staff Account has been Created';
        const loginUrl = 'https://mvoi-ratel-situation-room.vercel.app/';
        const emailHtml = `
            <h1>Welcome to the Team!</h1>
            <p>Hello ${fullName},</p>
            <p>An administrator has created a staff account for you on the Mvoi-Ratel Situation Room.</p>
            <p>Please log in by clicking the link below and selecting <strong>"Sign in with Google"</strong> using this email address (${email}).</p>
            <p><a href="${loginUrl}" style="background-color: #2DD4BF; color: #000; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 5px;">Access Dashboard</a></p>
            <p>Or visit: <a href="${loginUrl}">${loginUrl}</a></p>
        `;
        await sendEmail(email, emailSubject, emailHtml);

        const userResponse = { ...newUser.toObject() };
        delete userResponse.refreshToken;

        return res.status(201).json({ user: userResponse, message: 'Staff account created successfully. An email has been sent with login instructions.' });

    } catch (error) {
        return res.status(500).json({ message: 'Error creating staff account.', error: error.message });
    }
};

/**
 * @description Bulk update status for multiple users.
 * @route PUT /api/v1/admin/users/bulk-status
 * @access Admin only
 */
export const bulkUpdateUserStatus = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. You do not have permission to perform bulk actions.' });
    }

    const { userIds, status } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'An array of userIds is required.' });
    }

    if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status specified.' });
    }

    try {
        const updateOps = { 
            $set: { status: status },
            $push: {
                statusHistory: {
                    status: status,
                    changedBy: req.user._id,
                    reason: 'Bulk Status Update',
                    timestamp: new Date()
                }
            }
        };
        
        // If suspending or deactivating, force logout by clearing refresh tokens
        if (status === 'Inactive' || status === 'Suspended') {
            updateOps.$set.refreshToken = null;
        }

        const result = await User.updateMany(
            { _id: { $in: userIds } },
            updateOps
        );

        return res.status(200).json({ message: `${result.modifiedCount} users updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error during bulk user status update.', error: error.message });
    }
};

/**
 * @description Bulk verify users.
 * @route PUT /api/v1/admin/users/bulk-verify
 * @access Admin/Staff
 */
export const bulkVerifyUsers = async (req, res) => {
    const { userIds, status } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'An array of userIds is required.' });
    }

    if (!['Verified', 'Rejected', 'Pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status specified.' });
    }

    try {
        const updateOps = { 
            $set: { verificationStatus: status },
            $push: {
                verificationHistory: {
                    status: status,
                    changedBy: req.user._id,
                    notes: `Bulk Verification: ${status}`,
                    timestamp: new Date()
                }
            }
        };

        const result = await User.updateMany({ _id: { $in: userIds } }, updateOps);
        return res.status(200).json({ message: `${result.modifiedCount} users verification status updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error during bulk verification.', error: error.message });
    }
};

/**
 * @description Get all users who have submitted an appeal.
 * @route GET /api/v1/admin/users/appeals
 * @access Admin only
 */
export const getAppealingUsers = async (req, res) => {
    try {
        const appealingUsers = await User.find({ appealReason: { $exists: true, $ne: '' } })
            .select('fullName email role status appealReason')
            .sort({ updatedAt: -1 });
        return res.status(200).json({ users: appealingUsers });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching appealing users.', error: error.message });
    }
};

/**
 * @description Bulk delete users.
 * @route DELETE /api/v1/admin/users/bulk
 * @access Admin only
 */
export const bulkDeleteUsers = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. You do not have permission to delete users.' });
    }

    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'An array of userIds is required.' });
    }

    try {
        await User.deleteMany({ _id: { $in: userIds } });
        return res.status(200).json({ message: `${userIds.length} users deleted successfully.` });
    } catch (error) {
        return res.status(500).json({ message: 'Error during bulk user deletion.', error: error.message });
    }
};

/**
 * @description Get user-related statistics for the UMC.
 * @route GET /api/v1/admin/stats/users
 * @access Admin/Staff
 */
export const getUserStats = async (req, res) => {
    try {
        const totalUsers = User.countDocuments();
        const pendingVerification = User.countDocuments({ verificationStatus: 'Pending' });
        const userRoleBreakdown = User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const [users, verifications, roles] = await Promise.all([
            totalUsers,
            pendingVerification,
            userRoleBreakdown
        ]);

        const stats = {
            totalUsers: users,
            pendingVerification: verifications,
            userRoleBreakdown: roles,
        };

        return res.status(200).json({ stats, message: 'User stats fetched successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching user stats.', error: error.message });
    }
};

/**
 * @description Get daily active user counts for the last 30 days.
 * @route GET /api/v1/admin/stats/daily-active-users
 * @access Admin/Staff
 */
export const getDailyActiveUsers = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyActiveUsers = await User.aggregate([
            {
                $match: {
                    lastLogin: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastLogin" } },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 } // Sort by date ascending
            },
            {
                $project: {
                    date: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);

        return res.status(200).json({ dailyActiveUsers });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching daily active users.', error: error.message });
    }
};

/**
 * @description Get comprehensive analytics for the platform.
 * @route GET /api/v1/admin/analytics
 * @access Admin/Staff
 */
export const getAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const dateFilter = {};

        if (startDate && endDate) {
            // Add a day to endDate to make the range inclusive for $lt
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            dateFilter.createdAt = { $gte: new Date(startDate), $lt: end };
        }

        // Complaint Stats
        const totalComplaintsPromise = Complaint.countDocuments(dateFilter);
        const pendingReviewPromise = Complaint.countDocuments({ ...dateFilter, status: 'Pending Review' });
        const closedCasesPromise = Complaint.countDocuments({ ...dateFilter, status: 'Closed' });
        const successfulResolutionsPromise = Complaint.countDocuments({ ...dateFilter, status: 'Closed', resolutionStatus: 'Resolved Successfully' });
        const categoryBreakdownPromise = Complaint.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // User Stats - These are platform-wide and not affected by the date filter.
        const totalUsersPromise = User.countDocuments();
        const pendingVerificationPromise = User.countDocuments({ verificationStatus: 'Pending' });
        const userRoleBreakdownPromise = User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Daily Active Users
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dailyActiveUsersPromise = User.aggregate([
            // This is a trailing 30-day metric, independent of the date filter
            { $match: { lastLogin: { $gte: thirtyDaysAgo } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastLogin" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
            { $project: { date: '$_id', count: 1, _id: 0 } }
        ]);

        // New Users This Month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const newUsersThisMonthPromise = User.countDocuments({ createdAt: { $gte: startOfMonth } });

        // --- NEW: Average Time to First Action ---
        const avgTimeToActionPromise = Complaint.aggregate([
            { $match: { ...dateFilter, status: { $ne: 'Pending Review' } } },
            { $project: { timeToAction: { $subtract: ['$updatedAt', '$createdAt'] } } },
            { $group: { _id: null, avgTime: { $avg: '$timeToAction' } } }
        ]);

        // --- NEW: Resolution Timeline ---
        const resolutionTimelinePromise = Complaint.aggregate([
            { $match: { ...dateFilter, status: 'Closed' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$updatedAt' } },
                    resolved: { $sum: { $cond: [{ $eq: ['$resolutionStatus', 'Resolved Successfully'] }, 1, 0] } },
                    unresolved: { $sum: { $cond: [{ $ne: ['$resolutionStatus', 'Resolved Successfully'] }, 1, 0] } }
                }
            },
            { $project: { date: '$_id', resolved: 1, unresolved: 1, _id: 0 } },
            { $sort: { date: 1 } }
        ]);

        const [
            totalComplaints,
            pendingReview,
            closedCases,
            successfulResolutions,
            categoryBreakdown,
            totalUsers,
            pendingVerification,
            userRoleBreakdown,
            dailyActiveUsers,
            newUsersThisMonth,
            avgTimeResults,
            resolutionTimeline
        ] = await Promise.all([
            totalComplaintsPromise,
            pendingReviewPromise,
            closedCasesPromise,
            successfulResolutionsPromise,
            categoryBreakdownPromise,
            totalUsersPromise,
            pendingVerificationPromise,
            userRoleBreakdownPromise,
            dailyActiveUsersPromise,
            newUsersThisMonthPromise,
            avgTimeToActionPromise,
            resolutionTimelinePromise,
        ]);

        const resolutionRate = closedCases > 0 ? (successfulResolutions / closedCases) * 100 : 0;

        // Convert average time from milliseconds to hours
        const avgTimeInMs = avgTimeResults[0]?.avgTime || 0;
        const avgTimeInHours = (avgTimeInMs / (1000 * 60 * 60)).toFixed(1);

        const analytics = {
            complaintStats: {
                total: totalComplaints,
                pending: pendingReview,
                closed: closedCases,
                successful: successfulResolutions,
                resolutionRate: resolutionRate.toFixed(1),
                byCategory: categoryBreakdown,
                avgTimeToFirstAction: avgTimeInHours,
            },
            userStats: { total: totalUsers, pendingVerification: pendingVerification, byRole: userRoleBreakdown, newThisMonth: newUsersThisMonth },
            activityStats: { dailyActiveUsers, resolutionTimeline },
        };

        return res.status(200).json({
            analytics,
            message: 'Platform analytics fetched successfully.'
        });

    } catch (error) {
        return res.status(500).json({ message: 'Error fetching platform analytics.', error: error.message });
    }
};

/**
 * @description Get the current application settings.
 * @route GET /api/v1/admin/settings
 * @access Admin only
 */
export const getAppSettings = async (req, res) => {
    try {
        let settings = await AppSettings.findOne();
        if (!settings) {
            // If no settings exist, create them with defaults
            settings = await AppSettings.create({
                autoVerifyUsers: false,
                autoAcceptComplaints: false,
            });
        }
        res.status(200).json({ settings });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching app settings.', error: error.message });
    }
};

/**
 * @description Update the application settings.
 * @route PUT /api/v1/admin/settings
 * @access Admin only
 */
export const updateAppSettings = async (req, res) => {
    const { autoVerifyUsers, autoAcceptComplaints, allowPublicView } = req.body;

    try {
        const updateData = {};
        if (autoVerifyUsers !== undefined) updateData.autoVerifyUsers = autoVerifyUsers;
        if (autoAcceptComplaints !== undefined) updateData.autoAcceptComplaints = autoAcceptComplaints;
        if (allowPublicView !== undefined) updateData.allowPublicView = allowPublicView;

        const settings = await AppSettings.findOneAndUpdate({}, updateData, {
            new: true,
            upsert: true // Create if it doesn't exist
        });
        res.status(200).json({ settings, message: 'Settings updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating app settings.', error: error.message });
    }
};

/**
 * @description Get aggregated system logs (audit trail) for export.
 * @route GET /api/v1/admin/logs
 * @access Admin only
 */
export const getSystemLogs = async (req, res) => {
    const { startDate, endDate } = req.query;

    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. Only Admins can access system logs.' });
    }

    try {
        const dateFilter = {};
        if (startDate) {
            dateFilter.$gte = new Date(startDate);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include the whole end day
            dateFilter.$lte = end;
        }

        const complaintMatch = {};
        if (Object.keys(dateFilter).length > 0) {
            complaintMatch['statusHistory.timestamp'] = dateFilter;
        }

        // 1. Aggregate Complaint History
        const complaintLogs = await Complaint.aggregate([
            { $unwind: '$statusHistory' },
            { $match: complaintMatch },
            { $project: {
                type: 'Complaint Update',
                reference: '$caseRef',
                action: '$statusHistory.status',
                timestamp: '$statusHistory.timestamp',
                details: '$statusHistory.notes',
                _id: 0
            }}
        ]);

        const userMatch = {};
        if (Object.keys(dateFilter).length > 0) {
            userMatch['verificationHistory.timestamp'] = dateFilter;
        }

        // 2. Aggregate User Verification History
        const userLogs = await User.aggregate([
            { $unwind: '$verificationHistory' },
            { $match: userMatch },
            { $project: {
                type: 'Identity Verification',
                reference: '$email',
                action: '$verificationHistory.status',
                timestamp: '$verificationHistory.timestamp',
                details: '$verificationHistory.notes',
                _id: 0
            }}
        ]);

        // 3. Combine and Sort
        const logs = [...complaintLogs, ...userLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 2000);

        return res.status(200).json({ logs });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching system logs.', error: error.message });
    }
};

/**
 * @description Get current server CPU load.
 * @route GET /api/v1/admin/server-load
 * @access Admin only
 */
export const getServerLoad = async (req, res) => {
    try {
        os.cpuUsage((v) => {
            return res.status(200).json({ serverLoad: (v * 100).toFixed(2) });
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching server load.', error: error.message });
    }
};
