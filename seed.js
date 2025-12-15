import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import User from './src/models/user.model.js';
import Complaint from './src/models/complaint.model.js';
import { generateCaseRef } from './src/utils/helpers.js';
import AppSettings from './models/settings.model.js';

dotenv.config();

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const sampleCategories = [
    'Vendor & Service Issues',
    'Peer-to-Peer Disputes',
    'Oppression/Harassment',
    'Financial Fraud/Scam',
];
const sampleActions = [
    'Mediation/Internal Settlement',
    'Formal Legal Support/Court Action',
    'Public Resolution/Exposure',
];
const sampleVendors = [
    { name: 'Quantum Gadgets Inc.', contact: 'support@quantumgadgets.com' },
    { name: 'Starlight Apparel', contact: 'help@starlightapparel.co' },
    { name: 'Gourmet Delivered', contact: 'orders@gourmetdelivered.net' },
    { name: 'Digital Fortress Solutions', contact: 'security@df.solutions' },
];
// Create default app settings if they don't exist
        let settings = await AppSettings.findOne();
        if (!settings) {
            await AppSettings.create({
                autoVerifyUsers: false, // Default to manual review
                autoAcceptComplaints: false, // Default to manual acceptance
            });
            console.log('Default app settings created.');
        }


const seedData = async () => {
    await connectDB();

    try {
        // --- 1. Create a Verified Test User ---
        // We'll use an email to find if the user already exists.
        let testUser = await User.findOne({ email: 'testuser@example.com' });

        if (!testUser) {
            console.log('Creating a new verified test user...');
            testUser = await User.create({
                email: 'testuser@example.com',
                fullName: 'Test User',
                oauthId: `test-oauth-id-${Date.now()}`, // Ensure it's unique
                verificationStatus: 'Verified', // User must be 'Verified' to create a complaint
            });
            console.log('✅ Test user created successfully.');
        } else {
            console.log('ℹ️ Test user already exists.');
        }

        // --- 2. Create 40 Complaints for the Test User ---
        console.log('Seeding 40 new complaints...');
        for (let i = 0; i < 40; i++) {
            const caseRef = await generateCaseRef();
            const complaintData = {
                caseRef: caseRef,
                complainant: testUser._id,
                category: getRandomItem(sampleCategories),
                desiredAction: getRandomItem(sampleActions),
                vendorDetails: getRandomItem(sampleVendors),
                narrative: `This is a sample seeded complaint (${i + 1}/40). The issue occurred with ${getRandomItem(sampleVendors).name
                    }. The product was either defective, not delivered, or the service was unsatisfactory. I am seeking a resolution.`,
                status: 'Pending Review',
            };

            await Complaint.create(complaintData);
            process.stdout.write(`✅ Complaint ${i + 1}/40 seeded...\r`);
        }

        console.log('\n✅ All 40 complaints seeded successfully!');

    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
};

seedData();
