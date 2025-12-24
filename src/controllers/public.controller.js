import Complaint from '../models/complaint.model.js';
import User from '../models/user.model.js';
import AppSettings from '../models/settings.model.js';
import { generateCaseRef } from '../utils/helpers.js';
import { notifyAdmins } from '../utils/notification.js';
import crypto from 'crypto';

/**
 * @description Get a paginated list of publicly approved complaints.
 * @route GET /api/v1/public/complaints
 * @access Public
 */
export const getPublicComplaints = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const settings = await AppSettings.findOne();
    if (!settings?.allowPublicView) {
        // If the feature is disabled, return an empty list.
        return res.status(200).json({ complaints: [], currentPage: 1, totalPages: 0 });
    }

    try {
        // Query for complaints that are explicitly marked as public by an admin
        const query = {
            isPublic: true, // Show all published cases, regardless of status
        };

        const complaints = await Complaint.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit) 
            // Select all fields needed for the public card, including new interaction counts
            .populate('complainant', 'avatarUrl fullName') // Populate avatar and name for public cards
            .select('caseRef title status category vendorDetails.name publicNarrative evidenceUrls resolutionStatus createdAt views likes dislikes likedBy dislikedBy complainant')
            .lean();

        const totalComplaints = await Complaint.countDocuments(query);
        const totalPages = Math.ceil(totalComplaints / limit);

        return res.status(200).json({ complaints, currentPage: page, totalPages });

    } catch (error) {
        return res.status(500).json({ message: 'Error fetching public complaints.', error: error.message });
    }
};

/**
 * @description Get a single publicly visible complaint by its ID and increment its view count.
 * @route GET /api/v1/public/complaints/:id
 * @access Public
 */
export const getPublicComplaintById = async (req, res) => {
    try {
        const settings = await AppSettings.findOne();
        if (!settings?.allowPublicView) {
            return res.status(403).json({ message: 'This feature is currently disabled.' });
        }

        const complaint = await Complaint.findOne({ _id: req.params.id, isPublic: true })
            .select('caseRef title category publicNarrative resolutionStatus createdAt views likes viewedBy complainant');

        if (!complaint) {
            return res.status(404).json({ message: 'Public complaint not found.' });
        }

        // --- View Tracking by IP ---
        const ip = req.ip || req.connection.remoteAddress;
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

        const isOwner = req.user?._id.toString() === complaint.complainant.toString();

        // Increment view count only if this IP hasn't viewed it before
        // Note: For production, this array could get large. A more scalable solution
        // might use a separate collection or a Bloom filter.
        // Allow owner to increment view count
        if (!complaint.viewedBy.includes(ipHash) || isOwner) {
            complaint.views = (complaint.views || 0) + 1;
            if (!complaint.viewedBy.includes(ipHash)) complaint.viewedBy.push(ipHash);
            await complaint.save();
        }

        return res.status(200).json({ complaint });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching public complaint.', error: error.message });
    }
};

/**
 * @description Like or unlike a public complaint.
 * @route POST /api/v1/public/complaints/:id/like
 * @access Public
 */
export const likePublicComplaint = async (req, res) => {
    try {
        const settings = await AppSettings.findOne();
        if (!settings?.allowPublicView) {
            return res.status(403).json({ message: 'This feature is currently disabled.' });
        }

        const complaint = await Complaint.findById(req.params.id);

        if (!complaint || !complaint.isPublic) {
            return res.status(404).json({ message: 'Public complaint not found.' });
        }

        // Prioritize user ID for likes, fall back to IP for anonymous users
        let identifier;
        if (req.user?._id) {
            identifier = req.user._id.toString();
        } else {
            const ip = req.ip || req.connection.remoteAddress;
            identifier = crypto.createHash('sha256').update(ip).digest('hex');
        }


        const likedIndex = complaint.likedBy.indexOf(identifier);

        if (likedIndex > -1) {
            // User has already liked, so this is an "unlike" action
            complaint.likes = Math.max(0, (complaint.likes || 0) - 1);
            complaint.likedBy.splice(likedIndex, 1);
        } else {
            // User has not liked yet, so this is a "like" action
            complaint.likes = (complaint.likes || 0) + 1;
            complaint.likedBy.push(identifier);
        }

        await complaint.save();
        return res.status(200).json({ likes: complaint.likes, message: 'Interaction recorded.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error processing like.', error: error.message });
    }
};

/**
 * @description Add or remove a like or dislike from a public complaint.
 * @route POST /api/v1/public/complaints/:id/sentiment
 * @access Public
 */
export const handleSentiment = async (req, res) => {
    const { action } = req.body; // 'like' or 'dislike'
    if (!['LIKE', 'UNLIKE', 'DISLIKE', 'UNDISLIKE'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action specified.' });
    }

    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint || !complaint.isPublic) {
            return res.status(404).json({ message: 'Public complaint not found.' });
        }

        // Prioritize user ID for likes, fall back to IP for anonymous users
        let identifier;
        if (req.user?._id) {
            identifier = req.user._id.toString();
        } else {
            const ip = req.ip || req.connection.remoteAddress;
            identifier = crypto.createHash('sha256').update(ip).digest('hex');
        }

        const hasLiked = complaint.likedBy.includes(identifier);
        const hasDisliked = complaint.dislikedBy.includes(identifier);

        switch (action) {
            case 'LIKE':
                if (!hasLiked) complaint.likedBy.push(identifier);
                if (hasDisliked) complaint.dislikedBy = complaint.dislikedBy.filter(id => id !== identifier);
                break;
            case 'UNLIKE':
                if (hasLiked) complaint.likedBy = complaint.likedBy.filter(id => id !== identifier);
                break;
            case 'DISLIKE':
                if (!hasDisliked) complaint.dislikedBy.push(identifier);
                if (hasLiked) complaint.likedBy = complaint.likedBy.filter(id => id !== identifier);
                break;
            case 'UNDISLIKE':
                if (hasDisliked) complaint.dislikedBy = complaint.dislikedBy.filter(id => id !== identifier);
                break;
        }

        // Recalculate counts based on the array lengths for data integrity
        complaint.likes = complaint.likedBy.length;
        complaint.dislikes = complaint.dislikedBy.length;

        await complaint.save();
        return res.status(200).json({ likes: complaint.likes, dislikes: complaint.dislikes, message: 'Sentiment recorded.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error processing sentiment.', error: error.message });
    }
};

/**
 * @description Get public-facing summary statistics for the landing page.
 * @route GET /api/v1/public/stats
 * @access Public
 */
export const getPublicStats = async (req, res) => {
    try {
        const totalResolvedPromise = Complaint.countDocuments({
            status: 'Closed',
            resolutionStatus: 'Resolved Successfully'
        });

        const totalUsersPromise = User.countDocuments();

        const activeCasesPromise = Complaint.countDocuments({
            status: { $in: ['Pending Review', 'Approved for Scheduling', 'Ongoing', 'Case Active'] }
        });

        const totalClosedPromise = Complaint.countDocuments({ status: 'Closed' });

        const mvoiImpactPromise = Complaint.aggregate([
            { $match: { type: 'MVOI' } },
            { $group: { _id: null, total: { $sum: '$beneficiaryCount' } } }
        ]);

        const [totalResolved, totalUsers, activeCases, totalClosed, mvoiImpactResult] = await Promise.all([
            totalResolvedPromise,
            totalUsersPromise,
            activeCasesPromise,
            totalClosedPromise,
            mvoiImpactPromise
        ]);

        const stats = {
            totalResolved,
            totalUsers,
            activeCases,
            resolutionRate: totalClosed > 0 ? ((totalResolved / totalClosed) * 100).toFixed(1) : "0.0",
            mvoiImpact: mvoiImpactResult[0]?.total || 0
        };

        return res.status(200).json({ stats });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching public stats.', error: error.message });
    }
};

/**
 * @description Get public-facing application settings.
 * @route GET /api/v1/public/settings
 * @access Public
 */
export const getPublicSettings = async (req, res) => {
    try {
        let settings = await AppSettings.findOne().select('allowPublicView maintenanceMode maintenanceScheduledAt maintenanceNotice');
        if (!settings) {
            // If no settings exist, return the default state
            settings = { allowPublicView: false, maintenanceMode: false, maintenanceScheduledAt: null, maintenanceNotice: '' };
        }
        return res.status(200).json({ settings });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching public settings.', error: error.message });
    }
};