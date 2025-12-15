export interface User {
    _id: string;
    email: string;
    fullName: string;
    role: 'User' | 'Admin' | 'Staff';
    verificationStatus: 'Not Submitted' | 'Pending' | 'Verified' | 'Rejected';
    contactInfo?: {
        phone?: string;
        address?: string;
    };
    idDocumentUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Complaint {
    _id: string;
    caseRef: string;
    complainant: string; // User ID
    category: 'Vendor & Service Issues' | 'Peer-to-Peer Disputes' | 'Oppression/Harassment' | 'Financial Fraud/Scam';
    desiredAction: 'Mediation/Internal Settlement' | 'Formal Legal Support/Court Action' | 'Public Resolution/Exposure';
    vendorDetails?: {
        name?: string;
        contact?: string;
        socialMedia?: string;
    };
    status: 'Draft' | 'Pending Review' | 'Approved for Scheduling' | 'Rejected' | 'Case Active' | 'Closed';
    narrative: string;
    evidenceUrls: string[];
    invitation?: {
        date: string;
        time: string;
        location: string;
        contactNumber?: string;
    };
    notes: Note[];
    createdAt: string;
    updatedAt: string;
}

export interface PartialUser {
    _id: string;
    fullName: string;
    email: string;
}

export interface Note {
    _id: string;
    content: string;
    author: PartialUser; // Author will be a populated user object
    visibility: 'Admin Only' | 'User Visible';
    createdAt: string;
}
