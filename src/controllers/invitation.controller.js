import Complaint from '../models/complaint.model.js';
import { createNotification, notifyAdmins } from '../utils/notification.js';

/**
 * @description Respond to a scheduling invitation.
 * @route PUT /api/v1/invitations/:complaintId/respond
 * @access Private (Complainant only)
 */
export const respondToInvitation = async (req, res) => {
    const { complaintId } = req.params;
    const { response, proposedDate, proposedTime, reason } = req.body; // response can be 'Accepted' or 'Rejected'

    if (!response || !['Accepted', 'Rejected'].includes(response)) {
        return res.status(400).json({ message: 'A valid response ("Accepted" or "Rejected") is required.' });
    }

    if (response === 'Rejected' && (!proposedDate || !proposedTime)) {
        return res.status(400).json({ message: 'A proposed date and time are required when rejecting.' });
    }

    try {
        const complaint = await Complaint.findById(complaintId);

        if (!complaint || !complaint.invitation) {
            return res.status(404).json({ message: 'Complaint or invitation not found.' });
        }

        // Authorization: Only the complainant can respond.
        if (complaint.complainant.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to respond to this invitation.' });
        }

        complaint.invitation.userResponse = {
            status: response,
            proposedDate: response === 'Rejected' ? new Date(proposedDate) : undefined,
            proposedTime: response === 'Rejected' ? proposedTime : undefined,
            reason: response === 'Rejected' ? reason : undefined,
        };

        // If user accepts, change status to Ongoing
        if (response === 'Accepted') {
            complaint.status = 'Ongoing';
            complaint.statusHistory.push({ status: 'Ongoing', timestamp: new Date(), notes: 'Complainant accepted the scheduled meeting.' });
        }

        await complaint.save();

        if (response === 'Accepted') {
            await notifyAdmins(`Invitation for case ${complaint.caseRef} has been accepted by the user.`, `/admin/complaint/${complaint._id}`);
        } else { 
            await notifyAdmins(`User proposed an alternative time for case ${complaint.caseRef}. Review required.`, `/admin/complaint/${complaint._id}`);
        }

        await createNotification(complaint.complainant, `Your response for case ${complaint.caseRef} has been recorded.`, `/complainant/complaint/${complaint._id}`);

        return res.status(200).json({ complaint, message: 'Your response has been successfully submitted.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error responding to invitation.', error: error.message });
    }
};
