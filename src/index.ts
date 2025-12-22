export interface User {
    _id: string;
    oauthId?: string;
    email: string;
    fullName: string;
    role: 'User' | 'Admin' | 'Staff';
    status: 'Active' | 'Inactive' | 'Suspended';
    verificationStatus: 'Not Submitted' | 'Pending' | 'Verified' | 'Rejected';
    contactInfo?: {
        phone?: string;
        address?: string;
    };
    idDocumentUrl?: string;
    avatarUrl?: string;
    lastLogin?: string;
    refreshToken?: string;
    appealReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Complaint {
    _id: string;
    caseRef: string;
    title: string;
    contactNumber?: string;
    complainant: string | PartialUser; // Can be just ID or populated
    type: 'Case' | 'MVOI';
    category?: 'Vendor & Service Issues' | 'Peer-to-Peer Disputes' | 'Oppression/Harassment' | 'Financial Fraud/Scam';
    desiredAction?: 'Mediation/Internal Settlement' | 'Formal Legal Support/Court Action' | 'Public Resolution/Exposure';
    vendorDetails?: {
        name?: string;
        contact?: string;
        socialMedia?: string;
    };
    status: 'Draft' | 'Pending Review' | 'Approved for Scheduling' | 'Ongoing' | 'Rejected' | 'Case Active' | 'Closed';
    narrative?: string;
    evidenceUrls: string[];
    statusHistory: {
        status: string;
        timestamp: string;
        notes?: string;
    }[];
    invitation?: {
        date: string;
        time: string;
        location: string;
        userResponse?: {
            status: 'Accepted' | 'Rejected' | 'Pending';
            proposedDate?: string;
            proposedTime?: string;
            reason?: string;
        }
    };
    notes: Note[];
    resolutionStatus?: 'Resolved Successfully' | 'Unresolved' | 'Cancelled by User';
    initiativeCategory?: 'Clean Water (Borehole)' | 'Education (School Aid)' | 'Disaster Relief' | 'Skills Acquisition (Handwork)';
    applicantType?: 'Individual' | 'Community';
    locationDetails?: { state: string; lga: string; community: string; };
    beneficiaryCount?: number;
    publicNarrative?: string;
    isPublic?: boolean;
    views?: number;
    likes?: number;
    dislikes?: number;
    likedBy?: string[];
    dislikedBy?: string[];
    createdAt: string;
    updatedAt: string;
}

export interface PartialUser {
    _id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
}

export interface Note {
    _id: string;
    content: string;
    author: PartialUser; // Author will be a populated user object
    visibility: 'Admin Only' | 'User Visible';
    createdAt: string;
}
