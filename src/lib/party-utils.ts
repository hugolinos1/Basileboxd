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
    latitude?: number | null; // Added latitude
    longitude?: number | null; // Added longitude
    createdBy: string;
    creatorEmail?: string;
    participants: string[]; // Array of UIDs
    participantEmails?: string[]; // Array of emails
    mediaItems?: MediaItem[]; 
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number }; // Ratings are 0-10
    createdAt?: FirestoreTimestamp | Timestamp | Date; // Allow Date
    averageRating?: number; // Calculated average, scale 0-5 for display
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
        if (timestamp instanceof FieldValue) {
            // serverTimestamp() is a FieldValue, can't be converted on client before write
            // console.warn("Cannot convert serverTimestamp FieldValue to Date on client-side.");
            return null; 
        }
        // console.warn("Unrecognized timestamp format:", timestamp);
        return null;
    } catch (e) {
        // console.error("Error converting timestamp:", timestamp, e);
        return null;
    }
}

/**
 * Calculates the average rating for a party based on its ratings object (0-10 scale).
 * Then converts this average to a 0-5 scale for display.
 * Returns 0 if there are no ratings.
 * @param party The party data object.
 * @returns The average rating (float) on a 0-5 scale or 0.
 */
export const calculatePartyAverageRating = (party: PartyData): number => {
    if (!party.ratings) return 0;
    const allRatings = Object.values(party.ratings);
    if (allRatings.length === 0) return 0;
    const sum = allRatings.reduce((acc, rating) => acc + (Number(rating) || 0), 0); // Ensure rating is a number
    const averageOutOf10 = sum / allRatings.length;
    return averageOutOf10 / 2; // Convert to 0-5 scale
};

// Helper to normalize city names (client-side and server-side if needed)
export const normalizeCityName = (cityName: string | undefined): string => {
  if (!cityName || typeof cityName !== 'string') return '';
  return cityName
    .toLowerCase()
    .normalize("NFD") // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric (except space/hyphen)
    .trim();
};
