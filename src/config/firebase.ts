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
    console.error("CLÉ API FIREBASE MANQUANTE : La variable d'environnement NEXT_PUBLIC_FIREBASE_API_KEY n'est pas définie.");
    // Ne pas lever d'erreur côté client pour éviter le crash de l'application
    // FirebaseProvider gérera l'état non initialisé.
    // Des vérifications côté serveur pourraient toujours être appropriées ailleurs si nécessaire.
}
if (!firebaseConfig.projectId) {
    // Avertir mais ne pas lever d'erreur, car certaines fonctionnalités pourraient encore fonctionner initialement.
    console.warn("L'ID de projet Firebase (NEXT_PUBLIC_FIREBASE_PROJECT_ID) est manquant. Vérifiez .env.local.");
}


// Initialize Firebase App - Ensure this runs only once
let app: ReturnType<typeof initializeApp> | null = null;
// Check if the default app is already initialized
if (!getApps().some(existingApp => existingApp.name === '[DEFAULT]')) {
  try {
    // Only initialize if essential config is present
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        app = initializeApp(firebaseConfig);
        console.log("Application Firebase initialisée avec succès.");
    } else {
        console.error("L'application Firebase ne peut pas être initialisée en raison d'une configuration manquante (apiKey ou projectId).");
        app = null;
    }
  } catch (error) {
    console.error("L'initialisation de Firebase a échoué :", error);
    // Allow app to continue running, but Firebase services will be null
    app = null;
  }
} else {
  app = getApp(); // Get the already initialized default app
  // console.log("Application Firebase déjà initialisée."); // Less verbose logging
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
                         analytics = getAnalytics(app!); // Use non-null assertion as app is checked
                         console.log("Firebase Analytics initialisé.");
                    } catch (analyticsError) {
                        console.warn("L'initialisation de Firebase Analytics a échoué :", analyticsError);
                        analytics = null;
                    }

                } else if (!firebaseConfig.measurementId) {
                     // console.log("Firebase Analytics désactivé : NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID non défini."); // Less verbose
                }
                 else {
                    // console.log("Firebase Analytics n'est pas pris en charge dans cet environnement."); // Less verbose
                }
            }).catch(err => {
                 console.error("Erreur lors de la vérification de la prise en charge de Firebase Analytics :", err);
            });
        }


        // Connect to emulators if running in development mode
        // Check for a specific environment variable or hostname
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            console.log("Tentative de connexion aux émulateurs Firebase...");
             try {
                // Note: Using localhost for emulators. Adjust if your emulators run elsewhere.
                // Ensure they are not connected multiple times - connect functions handle this internally usually
                 if (auth && !(auth as any)._emulator?.options) { // Heuristic check if already connected
                    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
                 }
                 if (db && !(db as any)._databaseId) { // Heuristic check if already connected
                    connectFirestoreEmulator(db, 'localhost', 8080);
                 }
                if (storage && !(storage as any)._bucket?.domain) { // Heuristic check
                   connectStorageEmulator(storage, 'localhost', 9199);
                 }
                 console.log("Tentative de connexion aux émulateurs Firebase (Auth:9099, Firestore:8080, Storage:9199). Vérifiez la console pour les confirmations.");
             } catch (emulatorError: any) {
                  // Firebase SDKs usually prevent multiple connections, but log unexpected errors
                  if (!emulatorError.message.includes('already connected') && !emulatorError.message.includes('Cannot connect') ) { // Be more specific if needed
                     console.warn("Erreur de connexion à l'émulateur :", emulatorError.message);
                  } else {
                     // console.log("Émulateurs probablement déjà connectés ou tentative de connexion en cours.");
                  }
             }
        }

    } catch (serviceError) {
        console.error("Échec de l'initialisation des services Firebase (Auth, Firestore, Storage) :", serviceError);
         auth = null;
         db = null;
         storage = null;
         analytics = null;
    }
} else {
     console.error("L'application Firebase n'a pas pu être initialisée. Les services Firebase (Auth, Firestore, Storage, Analytics) ne seront pas disponibles.");
}


export { app, auth, db, storage, analytics };
