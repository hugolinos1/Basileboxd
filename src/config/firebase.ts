// src/config/firebase.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate essential config FIRST
if (!firebaseConfig.apiKey) {
    console.error("MISSING FIREBASE API KEY: The NEXT_PUBLIC_FIREBASE_API_KEY environment variable is not set.");
    // Throw a detailed error to guide the user.
    throw new Error("Firebase API key is missing. Please check your environment variables (ensure NEXT_PUBLIC_FIREBASE_API_KEY is set in .env.local) and restart the Next.js development server (npm run dev). If deploying, ensure this variable is set in your deployment environment.");
}
if (!firebaseConfig.projectId) {
    // Warn but don't throw, as some functionalities might still work initially.
    console.warn("Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Some features might not work correctly. Check .env.local and restart the server if needed.");
}


// Initialize Firebase App
// Make sure this runs only once
let app;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
     console.log("Firebase App Initialized successfully.");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    // Prevent further errors by providing dummy objects or re-throwing
    // Depending on how critical Firebase is, you might want to handle this differently
    throw new Error(`Firebase App initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  app = getApp(); // Get the already initialized app
  // console.log("Using existing Firebase App instance."); // Optional: useful for debugging
}


// Initialize services AFTER ensuring app is initialized
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;

try {
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    // console.log("Firebase Auth, Firestore, and Storage services obtained."); // Optional debug log

    // Connect to emulators if running in development mode
    // Check for a specific environment variable or hostname
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log("Attempting to connect to Firebase Emulators...");
         // Ensure emulators are not connected multiple times
         try {
             // Note: Using localhost for emulators. Adjust if your emulators run elsewhere.
            connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
            connectFirestoreEmulator(db, 'localhost', 8080);
            connectStorageEmulator(storage, 'localhost', 9199);
             console.log("Successfully connected to Firebase Emulators (or already connected).");
         } catch (emulatorError: any) {
              // Ignore 'already connected' errors, log others
              if (!emulatorError.message.includes('already connected')) {
                 console.warn("Emulator connection error:", emulatorError.message);
              } else {
                 // console.log("Emulators already connected."); // Can be noisy
              }
         }
    }

} catch (error) {
    console.error("Failed to initialize Firebase services (Auth, Firestore, Storage):", error);
     // Handle cases where services fail to initialize (e.g., due to config issues caught after app init)
     auth = null; // Nullify to prevent usage
     db = null;
     storage = null;
      throw new Error(`Failed to initialize Firebase services: ${error instanceof Error ? error.message : String(error)}`);
}


// Export potentially null services if initialization failed and needs graceful handling elsewhere
// Or ensure they are always valid instances if throwing errors is preferred
export { app, auth, db, storage };
