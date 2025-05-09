// src/services/media-uploader.ts
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { compressMedia } from '@/services/media-compressor';
// Constants from this file are now primary, validation-schemas will import from here if needed for its own definitions.

export const MAX_FILE_SIZE = {
  image: 10 * 1024 * 1024, // 10MB for initial upload (cover or souvenir)
  video: 10 * 1024 * 1024, // 10MB
  audio: 5 * 1024 * 1024, // 5MB
  userAvatar: 5 * 1024 * 1024, // 5MB for avatars
};
export const COMPRESSED_COVER_PHOTO_MAX_SIZE_MB = 1; // Compress cover photos to 1MB
export const COMPRESSED_AVATAR_MAX_SIZE_MB = 0.5; // Compress avatars to 0.5MB

export const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
export const ACCEPTED_COVER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];


// Helper to get file type category
export const getFileType = (file: File): 'image' | 'video' | 'audio' | 'userAvatar' | 'autre' => {
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
 * @param itemId The ID of the party/event or user UID for avatars.
 * @param isCover DEPRECATED - use uploadType instead. Kept for backward compatibility if still used.
 * @param onProgress Callback function to report upload progress (0-100 or -1 for error).
 * @param uploadType Type of upload: 'coverPhoto', 'souvenir', or 'userAvatar'.
 * @returns A promise resolving to the download URL of the uploaded file.
 * @throws An error if the upload fails or preconditions are not met.
 */
export const uploadFile = async (
    file: File,
    itemId: string, // Can be partyId or userId
    isCover: boolean = false, // DEPRECATED, use uploadType.
    onProgress?: (progress: number) => void,
    uploadType: 'coverPhoto' | 'souvenir' | 'userAvatar' = 'souvenir'
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
        const localFileType = getFileType(file);
        let fileToUpload = file;
        let initialMaxSize = Infinity;
        let targetSizeMBForCompression = 0;
        let filePath = '';

        // Determine max size, compression target, and file path based on uploadType
        if (uploadType === 'coverPhoto' && localFileType === 'image') {
            initialMaxSize = MAX_FILE_SIZE.image;
            targetSizeMBForCompression = COMPRESSED_COVER_PHOTO_MAX_SIZE_MB;
            filePath = `parties/${itemId}/cover/${Date.now()}_${fileToUpload.name}`;
        } else if (uploadType === 'userAvatar' && localFileType === 'image') {
            initialMaxSize = MAX_FILE_SIZE.userAvatar;
            targetSizeMBForCompression = COMPRESSED_AVATAR_MAX_SIZE_MB;
            filePath = `userAvatars/${itemId}/${Date.now()}_${fileToUpload.name}`;
        } else if (uploadType === 'souvenir') {
            if (localFileType === 'image') {
                initialMaxSize = MAX_FILE_SIZE.image;
                // For souvenirs, we might want less aggressive compression or none by default
                // targetSizeMBForCompression = MAX_FILE_SIZE.image / (1024*1024); // Example: compress to initial max size
            } else if (localFileType === 'video') {
                initialMaxSize = MAX_FILE_SIZE.video;
            } else if (localFileType === 'audio') {
                initialMaxSize = MAX_FILE_SIZE.audio;
            } else {
                initialMaxSize = 50 * 1024 * 1024; // Default for 'autre'
            }
            filePath = `parties/${itemId}/souvenirs/${localFileType}s/${Date.now()}_${fileToUpload.name}`;
        } else {
            reject(new Error(`Type de téléversement ou type de fichier non supporté: ${uploadType}, ${localFileType}`));
            return;
        }


        // Initial size check against the category's max initial size
        if (file.size > initialMaxSize) {
            reject(new Error(`Le fichier initial ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}Mo) dépasse la limite de taille autorisée pour cette catégorie (${(initialMaxSize / 1024 / 1024).toFixed(1)}Mo).`));
            return;
        }

        // Compress image if applicable and targetSizeMBForCompression is set > 0
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
                    fileToUpload = file; // Revert to original if compression didn't help or made it larger
                }
            } catch (compressionError) {
                console.warn(`Impossible de compresser l'image ${file.name}:`, compressionError);
                fileToUpload = file; // Fallback to original
            }
        }

        // Final size check (for cover photos and avatars, this ensures they meet compressed size limits if compression was applied)
        let finalMaxSizeBytes = initialMaxSize; // Default to initial max size
        if (uploadType === 'coverPhoto' && localFileType === 'image') {
            finalMaxSizeBytes = COMPRESSED_COVER_PHOTO_MAX_SIZE_MB * 1024 * 1024;
        } else if (uploadType === 'userAvatar' && localFileType === 'image') {
            finalMaxSizeBytes = COMPRESSED_AVATAR_MAX_SIZE_MB * 1024 * 1024;
        }
        // For souvenirs, the finalMaxSizeBytes remains initialMaxSize as per current logic, unless specific souvenir compression limits are set.


        if (fileToUpload.size > finalMaxSizeBytes) {
            reject(new Error(`Le fichier final ${fileToUpload.name} (${(fileToUpload.size / 1024 / 1024).toFixed(1)}Mo) après traitement dépasse la limite de taille autorisée (${(finalMaxSizeBytes / 1024 / 1024).toFixed(1)}Mo).`));
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
