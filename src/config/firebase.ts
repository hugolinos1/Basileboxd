// src/config/firebase.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Basic validation (Next.js build will also fail if NEXT_PUBLIC vars are missing)
if (!firebaseConfig.apiKey) {
    console.error("Firebase API key is missing. Check NEXT_PUBLIC_FIREBASE_API_KEY in .env.local and restart the server.");
    // Avoid throwing hard error here to prevent crashing the build/app entirely if env vars load slightly late,
    // but be aware Firebase services will fail.
}
if (!firebaseConfig.projectId) {
    console.warn("Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Check .env.local.");
}


// Initialize Firebase App - Ensure this runs only once
let app;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
     console.log("Firebase App Initialized successfully.");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    throw new Error(`Firebase App initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  app = getApp(); // Get the already initialized app
}


// Initialize services AFTER ensuring app is initialized
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let analytics: ReturnType<typeof getAnalytics> | null = null;


try {
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Initialize Analytics only on the client-side if supported
    if (typeof window !== 'undefined') {
        isSupported().then((supported) => {
            if (supported) {
                analytics = getAnalytics(app);
                console.log("Firebase Analytics Initialized.");
            } else {
                console.log("Firebase Analytics is not supported in this environment.");
            }
        });
    }


    // Connect to emulators if running in development mode
    // Check for a specific environment variable or hostname
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log("Attempting to connect to Firebase Emulators...");
         try {
            // Note: Using localhost for emulators. Adjust if your emulators run elsewhere.
            // Ensure they are not connected multiple times - connect functions handle this internally usually
            connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
            connectFirestoreEmulator(db, 'localhost', 8080);
            connectStorageEmulator(storage, 'localhost', 9199);
             console.log("Attempting connection to Firebase Emulators (Auth:9099, Firestore:8080, Storage:9199).");
         } catch (emulatorError: any) {
              // Firebase SDKs usually prevent multiple connections, but log unexpected errors
              if (!emulatorError.message.includes('already connected') && !emulatorError.message.includes('Cannot connect') ) { // Be more specific if needed
                 console.warn("Emulator connection error:", emulatorError.message);
              } else {
                 // console.log("Emulators likely already connected or connection attempt ongoing.");
              }
         }
    }

} catch (error) {
    console.error("Failed to initialize Firebase services (Auth, Firestore, Storage):", error);
     auth = null;
     db = null;
     storage = null;
     analytics = null;
     // Decide if throwing is appropriate or if the app can run without Firebase
     // throw new Error(`Failed to initialize Firebase services: ${error instanceof Error ? error.message : String(error)}`);
}


export { app, auth, db, storage, analytics };
