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
    id?: string; 
    userId: string;
    email: string;
    avatar?: string | null;
    text: string;
    timestamp: Timestamp | FieldValue | Date; 
    partyId?: string; 
    partyName?: string;
    parentId?: string; 
}

export interface PartyData {
    id: string;
    name: string;
    description?: string;
    date: FirestoreTimestamp | Timestamp | Date; 
    location?: string; 
    latitude?: number | null; 
    longitude?: number | null; 
    createdBy: string;
    creatorEmail?: string;
    participants: string[]; 
    participantEmails?: string[]; 
    mediaItems?: MediaItem[]; 
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number }; 
    createdAt?: FirestoreTimestamp | Timestamp | Date; 
    averageRating?: number; 
    comments?: CommentData[]; 
    commentCount?: number;
    // Optional: Could be added to optimize fetching recently commented events
    // lastCommentedAt?: Timestamp | Date; 
}

// --- Helper Functions ---

export const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | FieldValue | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp; 
        if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as any).seconds === 'number') {
            const date = new Date((timestamp as FirestoreTimestamp).seconds * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        if (timestamp instanceof FieldValue) {
            return null; 
        }
        return null;
    } catch (e) {
        return null;
    }
}

export const calculatePartyAverageRating = (party: PartyData): number => {
    if (!party.ratings) return 0;
    const allRatings = Object.values(party.ratings);
    if (allRatings.length === 0) return 0;
    const sum = allRatings.reduce((acc, rating) => acc + (Number(rating) || 0), 0); 
    const averageOutOf10 = sum / allRatings.length;
    return averageOutOf10 / 2; 
};

export const normalizeCityName = (cityName: string | undefined): string => {
  if (!cityName || typeof cityName !== 'string') return '';
  return cityName
    .toLowerCase()
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9\s-]/g, "") 
    .trim();
};


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
