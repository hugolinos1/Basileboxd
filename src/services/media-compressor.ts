import imageCompression from 'browser-image-compression';

/**
 * Represents the result of a media compression operation.
 */
export interface CompressionResult {
  /**
   * The compressed media file as a Blob or File.
   */
  blob: Blob | File; // Allow File type as well

  /**
   * The new file name of the compressed media.
   */
  fileName: string;
}

/**
 * Compresses media files (images initially) to reduce their size.
 *
 * @param file The media file to compress.
 * @param options An object specifying compression options (e.g., max size).
 * @returns A promise that resolves to a CompressionResult.
 */
export async function compressMedia(file: File, options: { maxSizeMB: number }): Promise<CompressionResult> {

  if (file.type.startsWith('image/')) {
    console.log(`Attempting to compress image: ${file.name}, original size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    const compressionOptions = {
      maxSizeMB: options.maxSizeMB,
      maxWidthOrHeight: 1920, // Optional: Limit image dimensions
      useWebWorker: true, // Use web workers for better performance
      // initialQuality: 0.7 // Optional: Set initial quality
    };

    try {
      const compressedFile = await imageCompression(file, compressionOptions);
      console.log(`Compressed image: ${compressedFile.name}, new size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

       // Ensure the compressed file is smaller, otherwise return original
        if (compressedFile.size < file.size) {
           return {
             blob: compressedFile,
             fileName: compressedFile.name, // browser-image-compression keeps the name
           };
        } else {
             console.log(`Compressed size (${(compressedFile.size / 1024 / 1024).toFixed(2)} MB) is not smaller than original. Returning original file.`);
              return {
                blob: file,
                fileName: file.name,
            };
        }
    } catch (error) {
      console.error('Image compression error:', error);
      // Fallback to original file if compression fails
       return {
         blob: file,
         fileName: file.name,
       };
    }
  } else if (file.type.startsWith('video/')) {
      // TODO: Implement video compression (e.g., using ffmpeg.wasm or a server-side solution)
      console.warn('Video compression not implemented yet, returning original file.');
        return {
            blob: file,
            fileName: file.name,
        };
  } else if (file.type.startsWith('audio/')) {
       // TODO: Implement audio compression
        console.warn('Audio compression not implemented yet, returning original file.');
         return {
            blob: file,
            fileName: file.name,
        };
  }


  // For unsupported types, return the original file
  console.warn(`Unsupported file type for compression: ${file.type}. Returning original file.`);
  return {
    blob: file,
    fileName: file.name,
  };
}
