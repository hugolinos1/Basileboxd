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
    parentId?: string; // ID of the comment this is a reply to
}

export interface PartyData {
    id: string;
    name: string;
    description?: string;
    date: FirestoreTimestamp | Timestamp | Date; // Allow Date
    location?: string; 
    latitude?: number | null; 
    longitude?: number | null; 
    createdBy: string;
    creatorEmail?: string;
    participants: string[]; // Array of UIDs
    participantEmails?: string[]; // Array of emails
    mediaItems?: MediaItem[]; 
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number }; // Ratings are 0-10
    createdAt?: FirestoreTimestamp | Timestamp | Date; // Allow Date
    averageRating?: number; // Calculated average, scale 0-5 for display
    comments?: CommentData[]; // Updated to use CommentData type for consistency
    commentCount?: number; // Optional: direct count of comments for efficiency in list views
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


// --- Geocoding Helper ---
export const geocodeCity = async (cityName: string): Promise<{ lat: number; lon: number } | null> => {
  if (!cityName) return null;
  const normalizedCity = normalizeCityName(cityName); 
  if (!normalizedCity) return null;

  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)', 
        'Accept-Language': 'fr,en;q=0.9'
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
      console.error(`[geocodeCity] Erreur API Nominatim: ${response.status} pour la ville: ${cityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}. Détails: ${errorText}`);
      return null;
    }
    
    let data;
    try {
        data = await response.json();
    } catch (jsonError: any) {
        console.error(`[geocodeCity] Erreur de parsing JSON pour ${cityName}. URL: ${apiUrl}. Erreur: `, jsonError);
        const rawResponse = await response.text().catch(() => "Impossible de lire la réponse brute après l'erreur JSON");
        console.log(`[geocodeCity] Réponse brute de l'API pour ${normalizedCity}:`, rawResponse);
        return null;
    }

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
       if (!isNaN(lat) && !isNaN(lon)) {
        return { lat, lon };
      } else {
        console.warn(`[geocodeCity] Coordonnées invalides (NaN) pour ${cityName}. Lat: ${data[0].lat}, Lon: ${data[0].lon}.`);
      }
    }
    console.warn(`[geocodeCity] Aucune coordonnée trouvée ou structure de réponse inattendue pour: ${cityName} (normalisé: ${normalizedCity}). Réponse API:`, data);
    return null;
  } catch (error) {
    console.error(`[geocodeCity] Erreur inattendue pendant le géocodage pour: ${cityName}. URL: ${apiUrl}`, error);
    return null;
  }
};