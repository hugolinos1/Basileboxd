// src/lib/party-utils.ts
import { Timestamp, FieldValue } from 'firebase/firestore';

// --- Interfaces (copied from relevant pages) ---
export interface FirestoreTimestamp { seconds: number; nanoseconds: number; }

export interface MediaItem {
    id: string; // Unique ID for the media item
    url: string;
    type: 'image' | 'video' | 'audio' | 'autre';
    uploaderId: string;
    uploaderEmail?: string;
    uploadedAt: Timestamp | FieldValue | Date; // Allow Date for easier handling after conversion & FieldValue for serverTimestamp
    fileName?: string;
}

export interface CommentData {
    id?: string; // Make id optional for new comments before they are saved
    userId: string;
    email: string;
    avatar?: string | null;
    text: string;
    timestamp: Timestamp | FieldValue | Date; // Allow FieldValue for serverTimestamp or Timestamp.now()
    partyId?: string; // partyId can be optional during creation, added before saving
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
    mediaItems?: MediaItem[]; // Changed from mediaUrls to mediaItems
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    // comments subcollection is now handled separately, not as a field in PartyData
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
export const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | FieldValue | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp; // Already a Date
        if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as any).seconds === 'number') {
            const date = new Date((timestamp as FirestoreTimestamp).seconds * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        // FieldValue (like serverTimestamp()) cannot be converted to a Date on the client-side before it's written.
        // If you need to display it immediately, you might need to handle it as "Pending" or similar.
        if (timestamp instanceof FieldValue) {
            // console.warn("Cannot convert FieldValue (serverTimestamp) to Date on client. It will be populated by the server.");
            return null; // Or return a specific indicator like new Date(0) if you need to differentiate
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
