import Counter from '../models/counter.model.js';

/**
 * Generates a unique case reference number atomically using a Counter model.
 * This prevents concurrent submissions from failing due to duplicate caseRefs.
 * Format: C-YYYY-NNNN (e.g., C-2025-0064)
 * @returns {Promise<string>} The generated case reference number.
 */
export const generateCaseRef = async () => {
    const currentYear = new Date().getFullYear();
    const counterId = `caseRef_${currentYear}`;

    // Atomically increment the sequence number for the current year.
    // MongoDB ensures this operation (read, update, write) is done in one step,
    // preventing race conditions.
    const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        {
            new: true,   // Return the document AFTER the increment
            upsert: true // Create the document if it doesn't exist
        }
    );

    const sequenceNumber = counter.seq;

    // Format the sequence number to be 4 digits with leading zeros
    const paddedSequence = String(sequenceNumber).padStart(4, '0');

    return `C-${currentYear}-${paddedSequence}`;
};
