// src/services/media-uploader.ts
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { compressMedia } from '@/services/media-compressor';
import * as z from 'zod'; // Import Zod

// Constants (Consider moving to a shared constants file if used elsewhere)
export const MAX_FILE_SIZE = {
  image: 10 * 1024 * 1024, // 10MB for initial upload
  video: 10 * 1024 * 1024, // 10MB
  audio: 5 * 1024 * 1024, // 5MB
};
export const COMPRESSED_COVER_PHOTO_MAX_SIZE_MB = 1; // Compress cover photos to 1MB
export const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
export const ACCEPTED_COVER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Helper to check if running in the browser
const isBrowser = typeof window !== 'undefined';

// --- Define File Schema ---
const fileSchemaClient = z.instanceof(isBrowser ? File : Object, { message: 'Veuillez télécharger un fichier' });
const fileSchemaServer = z.any(); // Fallback for SSR where File is not available
const fileSchema = isBrowser ? fileSchemaClient : fileSchemaServer;

// --- Define and Export Cover Photo Schema ---
export const coverPhotoSchema = fileSchema
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return ACCEPTED_COVER_PHOTO_TYPES.includes(file.type);
        },
        "Type de photo non supporté."
    )
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return file.size <= MAX_FILE_SIZE.image; // Check against initial upload size
        },
        `La photo de couverture initiale ne doit pas dépasser ${MAX_FILE_SIZE.image / 1024 / 1024}Mo.`
    )
    .optional(); // Make cover photo optional

// Helper to get file type category
export const getFileType = (file: File): 'image' | 'video' | 'audio' | 'autre' => {
  if (!file || !file.type) return 'autre';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'autre';
};

/**
 * Uploads a file to Firebase Storage, optionally compressing images.
 *
 * @param file The file to upload.
 * @param partyId The ID of the party/event.
 * @param isCover Whether the file is a cover photo (triggers specific compression).
 * @param onProgress Callback function to report upload progress (0-100 or -1 for error).
 * @returns A promise resolving to the download URL of the uploaded file.
 * @throws An error if the upload fails or preconditions are not met.
 */
export const uploadFile = async (
    file: File,
    partyId: string,
    isCover: boolean = false,
    onProgress?: (progress: number) => void
): Promise<string> => {
    if (!storage) {
        throw new Error("Le service de stockage Firebase n'est pas disponible.");
    }
    if (!partyId) {
        throw new Error("L'ID de la fête est requis pour le téléversement.");
    }
    if (!file) {
        throw new Error("Aucun fichier fourni pour le téléversement.");
    }

    return new Promise(async (resolve, reject) => {
        const fileType = getFileType(file);
        let fileToUpload = file;
        let maxSize = Infinity;
        let targetSizeMBForCompression = 0;

        // Determine max size and compression target
        if (fileType === 'image') {
            maxSize = MAX_FILE_SIZE.image;
            targetSizeMBForCompression = isCover ? COMPRESSED_COVER_PHOTO_MAX_SIZE_MB : MAX_FILE_SIZE.image / (1024 * 1024);
        } else if (fileType === 'video') {
            maxSize = MAX_FILE_SIZE.video;
            targetSizeMBForCompression = MAX_FILE_SIZE.video / (1024 * 1024); // Placeholder, video compression not implemented
        } else if (fileType === 'audio') {
            maxSize = MAX_FILE_SIZE.audio;
            targetSizeMBForCompression = MAX_FILE_SIZE.audio / (1024 * 1024); // Placeholder, audio compression not implemented
        } else {
            console.warn(`Type de fichier non supporté pour la compression : ${file.type}. Téléversement du fichier original.`);
            // Allow a reasonable max size for 'other' types for now, e.g., 50MB
            maxSize = 50 * 1024 * 1024;
        }

        // Initial size check
        if (file.size > maxSize) {
            reject(new Error(`Le fichier initial ${file.name} dépasse la limite de taille autorisée (${(maxSize / 1024 / 1024).toFixed(1)}Mo).`));
            return;
        }

        // Compress image if applicable
        if (fileType === 'image') {
            try {
                console.log(`Compression de l'image ${file.name} (cible ${targetSizeMBForCompression}Mo)...`);
                const compressedResult = await compressMedia(file, { maxSizeMB: targetSizeMBForCompression });
                const compressedBlob = compressedResult.blob;
                fileToUpload = compressedBlob instanceof File ? compressedBlob : new File([compressedBlob], file.name, { type: compressedBlob.type });

                if (fileToUpload.size < file.size) {
                    console.log(`Compression réussie pour ${file.name}, nouvelle taille : ${(fileToUpload.size / 1024 / 1024).toFixed(2)} Mo`);
                } else {
                    console.log(`Compression pour ${file.name} n'a pas réduit la taille. Utilisation du fichier original.`);
                    fileToUpload = file;
                }
            } catch (compressionError) {
                console.warn(`Impossible de compresser l'image ${file.name}:`, compressionError);
                fileToUpload = file; // Proceed with original if compression fails
            }
        }

        // Final size check (especially relevant for compressed images or large 'other' files)
        const finalMaxSizeCheck = isCover && fileType === 'image' ? (COMPRESSED_COVER_PHOTO_MAX_SIZE_MB * 1024 * 1024) : maxSize;
        if (fileToUpload.size > finalMaxSizeCheck) {
            reject(new Error(`Le fichier final ${fileToUpload.name} après traitement dépasse la limite de taille autorisée (${(finalMaxSizeCheck / 1024 / 1024).toFixed(1)}Mo).`));
            return;
        }

        const filePath = isCover
            ? `parties/${partyId}/cover/${Date.now()}_${fileToUpload.name}`
            : `parties/${partyId}/souvenirs/${fileType}s/${Date.now()}_${fileToUpload.name}`; // Changed path for souvenirs
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress?.(progress); // Call progress callback if provided
            },
            (error) => {
                console.error(`Échec du téléversement pour ${fileToUpload.name}:`, error);
                onProgress?.(-1); // Indicate error
                reject(error);
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log(`Fichier ${fileToUpload.name} téléversé avec succès : ${downloadURL}`);
                    onProgress?.(100); // Mark as complete
                    resolve(downloadURL);
                } catch (error) {
                    console.error(`Erreur lors de l'obtention de l'URL de téléchargement pour ${fileToUpload.name}:`, error);
                    reject(error);
                }
            }
        );
    });
};
