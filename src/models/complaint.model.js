import mongoose from 'mongoose';

const statusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    notes: String, // Optional notes, e.g., vetting notes for rejection.
});

const noteSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    visibility: {
        type: String,
        enum: ['Admin Only', 'User Visible'],
        default: 'Admin Only',
    },
}, {
    timestamps: true,
});

const complaintSchema = new mongoose.Schema(
    {
        caseRef: {
            type: String,
            unique: true,
            required: [true, 'A case reference is required.'],
            index: true,
        },
        title: {
            type: String, 
            required: [true, 'A complaint title is required.'],
            trim: true,
        },
        contactNumber: {
            type: String,
        },
        complainant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        category: {
            type: String,
            // required: [true, 'Complaint category is required.'], // Made optional for drafts
            enum: [
                'Vendor & Service Issues',
                'Peer-to-Peer Disputes',
                'Oppression/Harassment',
                'Financial Fraud/Scam',
            ],
        },
        desiredAction: {
            type: String,
            // required: [true, 'Desired action is required.'], // Made optional for drafts
            enum: [
                'Mediation/Internal Settlement',
                'Formal Legal Support/Court Action',
                'Public Resolution/Exposure',
            ],
        },
        vendorDetails: {
            name: String,
            contact: String,
            socialMedia: String,
        },
        status: {
            type: String,
            enum: ['Draft', 'Pending Review', 'Approved for Scheduling', 'Ongoing', 'Rejected', 'Case Active', 'Closed'],
            default: 'Pending Review',
        },
        narrative: {
            type: String,
            // required: [true, 'A detailed narrative is required.'], // Made optional for drafts
        },
        evidenceUrls: [String],
        statusHistory: [statusHistorySchema],
        invitation: {
            date: Date,
            time: String,
            location: String,
            userResponse: {
                status: { type: String, enum: ['Accepted', 'Rejected', 'Pending'] },
                proposedDate: Date,
                proposedTime: String,
                reason: String,
            }
        },
        notes: [noteSchema], // Replaced vettingNotes with a notes array
        resolutionStatus: {
            type: String,
            enum: ['Resolved Successfully', 'Unresolved', 'Cancelled by User'],
            // This field is only set when the case status is 'Closed'
        },
        // --- Fields for Public Feed ---
        publicNarrative: {
            type: String, // A sanitized, admin-approved version of the narrative for public view
        },
        isPublic: {
            type: Boolean,
            default: false,
            index: true, // Index for efficient querying of public complaints
        },
        // --- Fields for Public Interaction ---
        views: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        dislikes: { type: Number, default: 0 },
        likedBy: [{ type: String }], // Stores hashed IPs
        dislikedBy: [{ type: String }], // Stores user IDs or hashed IPs
        viewedBy: [{ type: String }], // Stores hashed IPs of viewers
    },
    { timestamps: true }
);

const Complaint = mongoose.model('Complaint', complaintSchema);

export default Complaint;
