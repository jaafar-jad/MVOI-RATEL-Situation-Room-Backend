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
            required: [true, 'A title for the case or initiative is required.'],
            trim: true,
        },
        contactNumber: {
            type: String,
        },
        complainant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            // required: true, // Made optional to support anonymous MVOI submissions
        },
        type: {
            type: String,
            enum: ['Case', 'MVOI'],
            default: 'Case',
            required: true,
        },
        category: {
            type: String,
            required: function() {
                // Only required if the type is 'Case'
                return this.type === 'Case';
            },
            enum: [
                'Vendor & Service Issues',
                'Peer-to-Peer Disputes',
                'Oppression/Harassment',
                'Financial Fraud/Scam',
            ],
        },
        desiredAction: {
            type: String,
            required: function() {
                // Only required if the type is 'Case'
                return this.type === 'Case';
            },
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
            required: function() {
                return this.type === 'Case';
            },
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
        // --- NEW: Fields for MVOI Initiatives ---
        initiativeCategory: {
            type: String,
            enum: ['Clean Water (Borehole)', 'Education (School Aid)', 'Disaster Relief', 'Skills Acquisition (Handwork)'],
        },
        applicantType: {
            type: String,
            enum: ['Individual', 'Community'],
        },
        locationDetails: {
            state: String,
            lga: String,
            community: String,
        },
        beneficiaryCount: {
            type: Number,
        },
        // --- END NEW ---

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
