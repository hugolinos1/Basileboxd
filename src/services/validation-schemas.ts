// src/services/validation-schemas.ts
import * as z from 'zod';
import { MAX_FILE_SIZE as MEDIA_UPLOADER_MAX_FILE_SIZE, ACCEPTED_AVATAR_TYPES as MEDIA_UPLOADER_ACCEPTED_AVATAR_TYPES, ACCEPTED_COVER_PHOTO_TYPES as MEDIA_UPLOADER_ACCEPTED_COVER_PHOTO_TYPES } from './media-uploader'; // Import constants from media-uploader

const isBrowser = typeof window !== 'undefined';

const fileSchemaClient = z.instanceof(isBrowser ? File : Object, { message: 'Veuillez télécharger un fichier' });
const fileSchemaServer = z.any(); // Fallback for SSR
const fileSchema = isBrowser ? fileSchemaClient : fileSchemaServer;

// Cover Photo Schema (using constants from media-uploader)
export const coverPhotoSchema = fileSchema
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true; // Pass for non-File types (server-side or already processed)
            return MEDIA_UPLOADER_ACCEPTED_COVER_PHOTO_TYPES.includes(file.type);
        },
        "Type de photo de couverture non supporté."
    )
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return file.size <= MEDIA_UPLOADER_MAX_FILE_SIZE.image; // Check against initial upload size for cover
        },
        `La photo de couverture initiale ne doit pas dépasser ${MEDIA_UPLOADER_MAX_FILE_SIZE.image / 1024 / 1024}Mo.`
    )
    .optional(); // Make cover photo optional


// Avatar Schema (using constants from media-uploader)
export const avatarSchema = fileSchema
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return MEDIA_UPLOADER_ACCEPTED_AVATAR_TYPES.includes(file.type);
        },
        "Type d'avatar non supporté. Formats acceptés : JPG, PNG, WEBP."
    )
    .refine(
        (file) => {
            if (!isBrowser || !(file instanceof File)) return true;
            return file.size <= MEDIA_UPLOADER_MAX_FILE_SIZE.userAvatar;
        },
        `L'avatar ne doit pas dépasser ${MEDIA_UPLOADER_MAX_FILE_SIZE.userAvatar / (1024 * 1024)}Mo.`
    )
    .optional(); // Make avatar optional during form submission if not changing it
