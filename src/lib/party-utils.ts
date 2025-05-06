// src/lib/party-utils.ts
import { Timestamp } from 'firebase/firestore';

// --- Interfaces (copied from relevant pages) ---
export interface FirestoreTimestamp { seconds: number; nanoseconds: number; }

export interface CommentData {
    id: string; // Add id field for direct identification
    userId: string;
    email: string;
    avatar?: string | null;
    text: string;
    timestamp: FirestoreTimestamp | Timestamp | Date; // Allow Date for easier handling after conversion
    // Include partyId and partyName if fetching comments across parties
    partyId: string; // Make partyId mandatory for linking
    partyName?: string;
}

export interface PartyData {
    id: string;
    name: string;
    description?: string;
    date: FirestoreTimestamp | Timestamp | Date; // Allow Date
    location?: string;
    createdBy: string;
    creatorEmail?: string;
    participants: string[]; // Array of UIDs
    participantEmails?: string[]; // Array of emails
    mediaUrls?: string[];
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    comments?: CommentData[]; // Use the updated CommentData interface
    createdAt?: FirestoreTimestamp | Timestamp | Date; // Allow Date
    // Optional calculated field (not stored in Firestore directly)
    averageRating?: number;
}

// --- Helper Functions ---

/**
 * Safely converts a Firestore Timestamp or timestamp-like object to a JavaScript Date.
 * Returns null if the input is invalid or conversion fails.
 * @param timestamp The Firestore Timestamp or object to convert.
 * @returns A Date object or null.
 */
export const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp; // Already a Date
        if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
            const date = new Date(timestamp.seconds * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        console.warn("Unrecognized timestamp format:", timestamp);
        return null;
    } catch (e) {
        console.error("Error converting timestamp:", timestamp, e);
        return null;
    }
}

/**
 * Calculates the average rating for a party based on its ratings object.
 * Returns 0 if there are no ratings.
 * @param party The party data object.
 * @returns The average rating (float) or 0.
 */
export const calculatePartyAverageRating = (party: PartyData): number => {
    if (!party.ratings) return 0;
    const allRatings = Object.values(party.ratings);
    if (allRatings.length === 0) return 0;
    const sum = allRatings.reduce((acc, rating) => acc + (rating || 0), 0); // Ensure rating is treated as number
    return sum / allRatings.length;
};
