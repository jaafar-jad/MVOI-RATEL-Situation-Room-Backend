import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});

// Verify connection configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('⚠️ SMTP Connection Error:', error.message);
    } else {
        console.log('✅ SMTP Server is ready to take messages');
    }
});

/**
 * Sends an email.
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} html - The HTML body of the email.
 */
export const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"Mvoi-Ratel Situation Room" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`📧 Email sent successfully to ${to}`);
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
        // In a production app, you might want to add more robust error handling or a retry mechanism.
    }
};
