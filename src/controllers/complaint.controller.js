import Complaint from '../models/complaint.model.js';
import { generateCaseRef } from '../utils/helpers.js';
import { notifyAdmins } from '../utils/notification.js';
import AppSettings from '../models/settings.model.js';
import cloudinary from '../config/cloudinary.js';

/**
 * @description Submit a new complaint.
 * @route POST /api/v1/complaints
 * @access Private (Verified Users only)
 */
export const createComplaint = async (req, res) => {
    const { type = 'Case' } = req.body; // Default to 'Case' if type is not provided

    // Delegate to the appropriate handler based on the 'type'
    if (type === 'MVOI') {
        return createMvoiApplication(req, res);
    }
    
    return createCase(req, res);
};

/**
 * @description Helper function to create a standard 'Case'.
 */
const createCase = async (req, res) => {
    const { title, category, desiredAction, vendorDetails, narrative, status, evidenceUrls, contactNumber } = req.body;
    const isDraft = status === 'Draft';

    let settings = await AppSettings.findOne();
    if (!settings) settings = await AppSettings.create({}); // Ensure settings exist

    // User must be verified.
    if (req.user.verificationStatus !== 'Verified') {
        return res.status(403).json({ message: 'Forbidden. Your identity must be verified before submitting a complaint.' });
    }

    // For final submission (not a draft), enforce all rules.
    if (!isDraft) {
        if (!title || !category || !desiredAction || !narrative) {
            return res.status(400).json({ message: 'Title, category, desired action, and narrative are required fields.' });
        }
    } else {
        // For drafts, only a title is required to save.
        if (!title) {
            return res.status(400).json({ message: 'A title is required to save a draft.' });
        }
    }

    const MAX_RETRIES = 3;  
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const caseRef = await generateCaseRef();

            const complaintToSave = new Complaint({
                title,
                caseRef,
                type: 'Case', // Explicitly set the type
                complainant: req.user._id,
                contactNumber: contactNumber,
                category,
                desiredAction,
                vendorDetails,
                narrative,
                evidenceUrls: evidenceUrls || [], // Include the evidence URLs from the request
                status: isDraft
                    ? 'Draft'
                    : (settings.autoAcceptComplaints ? 'Approved for Scheduling' : 'Pending Review'),
                statusHistory: [{ status: isDraft ? 'Draft' : 'Pending Review', timestamp: new Date() }],
            });

            const newComplaint = await complaintToSave.save();

            await notifyAdmins(
                `New complaint '${newComplaint.caseRef}' submitted by ${req.user.fullName}.`,
                `/admin/complaint/${newComplaint._id}`
                
            );

            return res.status(201).json({ complaint: newComplaint, message: `Complaint ${isDraft ? 'saved as draft' : 'submitted'} successfully.` });
        } catch (error) {
            if (error.code === 11000 && i < MAX_RETRIES - 1) {
                console.warn(`Duplicate caseRef detected, retrying... (Attempt ${i + 1}/${MAX_RETRIES})`);
                // Continue to next iteration to retry
            } else {
                console.error("CRITICAL: Complaint submission failed with error:", error);
                let errorMessage = 'Error creating complaint.';
                let errorDetails = null;

                if (error.code === 11000) {
                    errorMessage = `Submission failed: A duplicate Case Reference was detected. Please try again.`;
                } else if (error.name === 'ValidationError') {
                    errorMessage = `Submission failed due to invalid data. Details: ${error.message}`;
                    errorDetails = error.errors;
                } else if (error instanceof Error) {
                    errorMessage = `Server Error: ${error.message}`;
                }

                return res.status(500).json({
                    message: errorMessage,
                    error: error.message,
                    details: errorDetails
                });
            }
        }
    }
};

/**
 * @description Submit a new MVOI initiative application by an authenticated user.
 * @route POST /api/v1/complaints/mvoi
 * @access Private (Verified Users only)
 */
const createMvoiApplication = async (req, res) => {
    const {
        title,
        applicantType,
        initiativeCategory,
        locationDetails,
        beneficiaryCount,
        narrative,
        applicantName,
        applicantEmail,
        applicantPhone,
        evidenceUrls,
        status,
    } = req.body;

    const isDraft = status === 'Draft';

    // Basic validation
    if (!isDraft) {
        if (!title || !initiativeCategory || !narrative) {
            return res.status(400).json({ message: 'Title, category, and narrative are required.' });
        }
    
        if (!applicantName || !applicantEmail || !applicantPhone) {
            return res.status(400).json({ message: 'Applicant contact details (name, email, phone) are required.' });
        }
    } else {
        if (!title) {
            return res.status(400).json({ message: 'A title is required to save a draft.' });
        }
    }

    // User must be verified to submit an MVOI application
    if (req.user.verificationStatus !== 'Verified') {
        return res.status(403).json({ message: 'Forbidden. Your identity must be verified before submitting an application.' });
    }

    try {
        const caseRef = await generateCaseRef();

        const mvoiApplication = new Complaint({
            caseRef,
            title,
            type: 'MVOI',
            narrative,
            initiativeCategory,
            applicantType,
            locationDetails,
            beneficiaryCount,
            evidenceUrls: evidenceUrls || [],
            complainant: req.user._id, // Attach the logged-in user
            // Storing separate MVOI contact info in the vendorDetails field for schema simplicity
            vendorDetails: {
                name: applicantName, contact: `${applicantEmail}, ${applicantPhone}`
            },
            status: isDraft ? 'Draft' : 'Pending Review',
            statusHistory: [{ status: isDraft ? 'Draft' : 'Pending Review', timestamp: new Date() }],
        });

        await mvoiApplication.save();

        await notifyAdmins(
            `New MVOI ${isDraft ? 'draft' : 'application'} '${caseRef}' submitted for ${initiativeCategory} by ${req.user.fullName}.`,
            `/admin/complaint/${mvoiApplication._id}`
        );

        return res.status(201).json({ complaint: mvoiApplication, message: 'Your application has been submitted successfully.' });
    } catch (error) {
        console.error('Error creating MVOI application:', error);
        return res.status(500).json({ message: 'Failed to submit application.', error: error.message });
    }
};


/**
 * @description Get all complaints for the authenticated user.
 * @route GET /api/v1/complaints
 * @access Private
 */
export const getUserComplaints = async (req, res) => {
    const { status } = req.query;

    const query = { complainant: req.user._id };

    if (status && status !== 'All') {
        query.status = status;
    }

    try {
        // Fetch all complaints matching the query, sorted by most recently updated.
        // Pagination and further sorting will be handled on the client-side.
        const complaints = await Complaint.find(query)
            .sort({ updatedAt: -1 });

        // The response no longer includes pagination details.
        return res.status(200).json({ complaints, message: 'User complaints fetched successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching complaints.', error: error.message });
    }
};

/**
 * @description Get a single complaint by its ID.
 * @route GET /api/v1/complaints/:id
 * @access Private (Owner, Admin, or Staff)
 */
export const getComplaintById = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id)
            .populate('complainant', 'fullName email role') // Populate complainant details
            .populate({
                path: 'notes',
                populate: {
                    path: 'author',
                    select: 'fullName' // Populate the author within each note
                }
            });

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Check for authorization: user must be the owner or an admin/staff member.
        const isOwner = complaint.complainant._id.toString() === req.user._id.toString();
        const isAdminOrStaff = ['Admin', 'Staff'].includes(req.user.role);

        if (!isOwner && !isAdminOrStaff) {
            return res.status(403).json({ message: 'Forbidden. You are not authorized to view this complaint.' });
        }

        return res.status(200).json({ complaint, message: 'Complaint details fetched successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching complaint details.', error: error.message });
    }
};

/**
 * @description Upload evidence files for a complaint.
 * @route POST /api/v1/complaints/:id/upload-evidence
 * @access Private (Owner only)
 */
export const uploadEvidence = async (req, res) => {
    // Files are uploaded by the multer-storage-cloudinary middleware.
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No evidence files provided.' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });

    // Per PRD, only the owner can upload evidence.
    if (complaint.complainant.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Forbidden. You can only add evidence to your own complaints.' });
    }

    // Get the secure URLs from the files uploaded to Cloudinary
    const evidenceUrls = req.files.map(file => file.path);

    complaint.evidenceUrls.push(...evidenceUrls);
    await complaint.save();

    return res.status(200).json({ complaint, message: 'Evidence uploaded successfully.' });
};

/**
 * @description Update a complaint.
 * @route PUT /api/v1/complaints/:id
 * @access Private (Owner only)
 */
export const updateComplaint = async (req, res) => {
    const { title, category, desiredAction, vendorDetails, narrative, contactNumber } = req.body;

    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Authorization: Only owner can edit, and only if status is 'Draft', 'Pending Review', or 'Rejected'
        if (complaint.complainant.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Forbidden. You are not authorized to edit this complaint.' });
        }
        if (!['Draft', 'Pending Review', 'Rejected'].includes(complaint.status)) {
            return res.status(403).json({ message: `Forbidden. Cannot edit a complaint with status "${complaint.status}".` });
        }

        const wasRejected = complaint.status === 'Rejected';

        // Update fields
        complaint.title = title || complaint.title;
        complaint.category = category || complaint.category;
        complaint.desiredAction = desiredAction || complaint.desiredAction;
        complaint.vendorDetails = vendorDetails || complaint.vendorDetails;
        complaint.narrative = narrative || complaint.narrative;
        complaint.contactNumber = contactNumber || complaint.contactNumber;

        // If the complaint was rejected, editing and saving it again should resubmit it for review.
        if (wasRejected) {
            complaint.status = 'Pending Review';
            complaint.statusHistory.push({
                status: 'Pending Review',
                timestamp: new Date(),
                notes: 'Complaint was edited and resubmitted by the user after rejection.',
            });
            await notifyAdmins(
                `Case ${complaint.caseRef} was resubmitted by the user after rejection.`,
                `/admin/complaint/${complaint._id}`
            );
        }

        const updatedComplaint = await complaint.save();

        const message = wasRejected ? 'Complaint resubmitted successfully.' : 'Complaint updated successfully.';
        return res.status(200).json({ complaint: updatedComplaint, message });

    } catch (error) {
        return res.status(500).json({ message: 'Error updating complaint.', error: error.message });
    }
};

/**
 * @description Delete a complaint.
 * @route DELETE /api/v1/complaints/:id
 * @access Private (Owner only)
 */
export const deleteComplaint = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Authorization: Only owner can delete
        if (complaint.complainant.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Forbidden. You are not authorized to delete this complaint.' });
        }

        await complaint.deleteOne();

        return res.status(200).json({ message: 'Complaint deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting complaint.', error: error.message });
    }
};

/**
 * @description Delete a single evidence file from a complaint.
 * @route DELETE /api/v1/complaints/:id/evidence
 * @access Private (Owner only)
 */
export const deleteEvidence = async (req, res) => {
    const { fileUrl } = req.body;

    if (!fileUrl) {
        return res.status(400).json({ message: 'File URL is required.' });
    }

    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        // Authorization: Only owner can delete evidence
        if (complaint.complainant.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Forbidden. You are not authorized to modify this complaint.' });
        }

        // Remove the file URL from the complaint document
        complaint.evidenceUrls = complaint.evidenceUrls.filter(url => url !== fileUrl);
        await complaint.save();

        // Extract public_id from URL and delete from Cloudinary
        const publicId = fileUrl.split('/').pop().split('.')[0];
        // The folder must be included for deletion to work
        const fullPublicId = `advocacy-platform/evidence-files/${publicId}`;
        await cloudinary.uploader.destroy(fullPublicId, { resource_type: 'auto' });

        return res.status(200).json({ message: 'Evidence file deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting evidence.', error: error.message });
    }
};

/**
 * @description Get statistics for the authenticated user's complaints.
 * @route GET /api/v1/complaints/stats
 * @access Private
 */
export const getComplaintStats = async (req, res) => {
    try {
        const stats = await Complaint.aggregate([
            {
                $match: { complainant: req.user._id }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$count' },
                    statuses: { $push: { status: '$_id', count: '$count' } }
                }
            },
            {
                $project: {
                    _id: 0,
                    total: 1,
                    statuses: { $arrayToObject: { $map: { input: '$statuses', as: 's', in: ['$$s.status', '$$s.count'] } } }
                }
            }
        ]);

        return res.status(200).json({ stats: stats[0] || { total: 0, statuses: {} }, message: 'Complaint statistics fetched successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching complaint statistics.', error: error.message });
    }
};