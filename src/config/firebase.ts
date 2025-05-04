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

// Validate essential config FIRST
if (!firebaseConfig.apiKey) {
    console.error("MISSING FIREBASE API KEY: The NEXT_PUBLIC_FIREBASE_API_KEY environment variable is not set.");
    // Removed the throw new Error to prevent crashing the app. Console error is sufficient.
    // Consider adding alternative behavior here if needed, like disabling Firebase features.
}
if (!firebaseConfig.projectId) {
    // Warn but don't throw, as some functionalities might still work initially.
    console.warn("Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Check .env.local.");
}


// Initialize Firebase App - Ensure this runs only once
let app;
// Check if the default app is already initialized
if (!getApps().some(existingApp => existingApp.name === '[DEFAULT]')) {
  try {
    app = initializeApp(firebaseConfig);
    console.log("Firebase App Initialized successfully.");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    // Allow app to continue running, but Firebase services will be null
    app = null;
  }
} else {
  app = getApp(); // Get the already initialized default app
  console.log("Firebase App already initialized.");
}


// Initialize services only if app was initialized successfully
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let analytics: ReturnType<typeof getAnalytics> | null = null;

if (app) {
    try {
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);

        // Initialize Analytics only on the client-side if supported
        if (typeof window !== 'undefined') {
            isSupported().then((supported) => {
                if (supported && firebaseConfig.measurementId) {
                    try {
                         analytics = getAnalytics(app);
                         console.log("Firebase Analytics Initialized.");
                    } catch (analyticsError) {
                        console.warn("Firebase Analytics initialization failed:", analyticsError);
                        analytics = null;
                    }

                } else if (!firebaseConfig.measurementId) {
                     console.log("Firebase Analytics disabled: NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID not set.");
                }
                 else {
                    console.log("Firebase Analytics is not supported in this environment.");
                }
            }).catch(err => {
                 console.error("Error checking Firebase Analytics support:", err);
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

    } catch (serviceError) {
        console.error("Failed to initialize Firebase services (Auth, Firestore, Storage):", serviceError);
         auth = null;
         db = null;
         storage = null;
         analytics = null;
    }
} else {
     console.error("Firebase App failed to initialize. Firebase services (Auth, Firestore, Storage, Analytics) will not be available.");
}


export { app, auth, db, storage, analytics };
