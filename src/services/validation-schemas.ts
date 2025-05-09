// src/services/validation-schemas.ts
import * as z from 'zod';
import { MAX_FILE_SIZE } from './media-uploader'; // Import only necessary constants

const isBrowser = typeof window !== 'undefined';

const fileSchemaClient = z.instanceof(isBrowser ? File : Object, { message: 'Veuillez télécharger un fichier' });
const fileSchemaServer = z.any(); // Fallback for SSR
const fileSchema = isBrowser ? fileSchemaClient : fileSchemaServer;

// Define and Export ACCEPTED_COVER_PHOTO_TYPES locally
export const ACCEPTED_COVER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
