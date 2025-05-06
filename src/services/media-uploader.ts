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
  userAvatar: 5 * 1024 * 1024, // 5MB for avatars
};
export const COMPRESSED_COVER_PHOTO_MAX_SIZE_MB = 1; // Compress cover photos to 1MB
export const COMPRESSED_AVATAR_MAX_SIZE_MB = 0.5; // Compress avatars to 0.5MB

export const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
export const ACCEPTED_COVER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];


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
            return file.size <= MAX_FILE_SIZE.image; // Check against initial upload size for cover
        },
        `La photo de couverture initiale ne doit pas dépasser ${MAX_FILE_SIZE.image / 1024 / 1024}Mo.`
    )
    .optional();

// --- Define and Export Avatar Schema ---
export const avatarSchema = fileSchema
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return ACCEPTED_AVATAR_TYPES.includes(file.type);
        },
        "Type d'avatar non supporté."
    )
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return file.size <= MAX_FILE_SIZE.userAvatar; // Check against initial upload size for avatar
        },
        `L'avatar initial ne doit pas dépasser ${MAX_FILE_SIZE.userAvatar / (1024 * 1024)}Mo.`
    )
    .optional();


// Helper to get file type category
export const getFileType = (file: File): 'image' | 'video' | 'audio' | 'userAvatar' | 'autre' => {
  if (!file || !file.type) return 'autre';
  if (file.type.startsWith('image/')) return 'image'; // Generic image, could be cover or souvenir
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'autre';
};

/**
 * Uploads a file to Firebase Storage, optionally compressing images.
 *
 * @param file The file to upload.
 * @param itemId The ID of the party/event or user UID for avatars.
 * @param isCover Whether the file is a cover photo (triggers specific compression).
 * @param onProgress Callback function to report upload progress (0-100 or -1 for error).
 * @param uploadType Type of upload: 'coverPhoto', 'souvenir', or 'userAvatar'.
 * @returns A promise resolving to the download URL of the uploaded file.
 * @throws An error if the upload fails or preconditions are not met.
 */
export const uploadFile = async (
    file: File,
    itemId: string, // Can be partyId or userId
    isCover: boolean = false, // Kept for backward compatibility for cover photos, but uploadType is more specific
    onProgress?: (progress: number) => void,
    uploadType: 'coverPhoto' | 'souvenir' | 'userAvatar' = 'souvenir' // Default to souvenir
): Promise<string> => {
    if (!storage) {
        throw new Error("Le service de stockage Firebase n'est pas disponible.");
    }
    if (!itemId) {
        throw new Error("L'ID de l'élément (fête/utilisateur) est requis pour le téléversement.");
    }
    if (!file) {
        throw new Error("Aucun fichier fourni pour le téléversement.");
    }

    return new Promise(async (resolve, reject) => {
        const localFileType = getFileType(file); // This gives 'image', 'video', etc.
        let fileToUpload = file;
        let maxSize = Infinity;
        let targetSizeMBForCompression = 0;
        let filePath = '';

        // Determine max size, compression target, and file path based on uploadType
        if (uploadType === 'coverPhoto' && localFileType === 'image') {
            maxSize = MAX_FILE_SIZE.image;
            targetSizeMBForCompression = COMPRESSED_COVER_PHOTO_MAX_SIZE_MB;
            filePath = `parties/${itemId}/cover/${Date.now()}_${fileToUpload.name}`;
        } else if (uploadType === 'userAvatar' && localFileType === 'image') {
            maxSize = MAX_FILE_SIZE.userAvatar;
            targetSizeMBForCompression = COMPRESSED_AVATAR_MAX_SIZE_MB;
            filePath = `userAvatars/${itemId}/${Date.now()}_${fileToUpload.name}`;
        } else if (uploadType === 'souvenir') {
            if (localFileType === 'image') {
                maxSize = MAX_FILE_SIZE.image;
                targetSizeMBForCompression = MAX_FILE_SIZE.image / (1024*1024); // Less aggressive compression for souvenirs
            } else if (localFileType === 'video') {
                maxSize = MAX_FILE_SIZE.video;
                // Video compression not implemented yet
            } else if (localFileType === 'audio') {
                maxSize = MAX_FILE_SIZE.audio;
                // Audio compression not implemented yet
            } else {
                maxSize = 50 * 1024 * 1024; // Default for 'autre'
            }
            filePath = `parties/${itemId}/souvenirs/${localFileType}s/${Date.now()}_${fileToUpload.name}`;
        } else {
            reject(new Error(`Type de téléversement ou type de fichier non supporté: ${uploadType}, ${localFileType}`));
            return;
        }


        // Initial size check
        if (file.size > maxSize) {
            reject(new Error(`Le fichier initial ${file.name} dépasse la limite de taille autorisée (${(maxSize / 1024 / 1024).toFixed(1)}Mo).`));
            return;
        }

        // Compress image if applicable and targetSizeMB is set
        if (localFileType === 'image' && targetSizeMBForCompression > 0) {
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
                fileToUpload = file;
            }
        }

        // Final size check
        const finalMaxSizeCheck = (uploadType === 'coverPhoto' && localFileType === 'image')
            ? (COMPRESSED_COVER_PHOTO_MAX_SIZE_MB * 1024 * 1024)
            : (uploadType === 'userAvatar' && localFileType === 'image')
            ? (COMPRESSED_AVATAR_MAX_SIZE_MB * 1024 * 1024)
            : maxSize;

        if (fileToUpload.size > finalMaxSizeCheck) {
            reject(new Error(`Le fichier final ${fileToUpload.name} après traitement dépasse la limite de taille autorisée (${(finalMaxSizeCheck / 1024 / 1024).toFixed(1)}Mo).`));
            return;
        }

        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress?.(progress);
            },
            (error) => {
                console.error(`Échec du téléversement pour ${fileToUpload.name}:`, error);
                onProgress?.(-1);
                reject(error);
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log(`Fichier ${fileToUpload.name} téléversé avec succès : ${downloadURL}`);
                    onProgress?.(100);
                    resolve(downloadURL);
                } catch (error) {
                    console.error(`Erreur lors de l'obtention de l'URL de téléchargement pour ${fileToUpload.name}:`, error);
                    reject(error);
                }
            }
        );
    });
};
