// src/config/firebase.ts
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Flag to indicate if initialization was successful
let firebaseInitialized = false;
let firebaseInitializationError: string | null = null;

// Validate essential config FIRST
if (!firebaseConfig.apiKey) {
    firebaseInitializationError = "Clé API Firebase manquante (NEXT_PUBLIC_FIREBASE_API_KEY). Vérifiez les variables d'environnement.";
    console.error(`ERREUR CONFIG FIREBASE: ${firebaseInitializationError}`);
}
if (!firebaseConfig.projectId) {
    const msg = "L'ID de projet Firebase (NEXT_PUBLIC_FIREBASE_PROJECT_ID) est manquant. Vérifiez .env.local.";
    console.error(`ERREUR CONFIG FIREBASE: ${msg}`);
    if (!firebaseInitializationError) firebaseInitializationError = msg;
}
if (!firebaseConfig.storageBucket) { // Added check for storageBucket
    const msg = "Le nom du bucket de stockage Firebase (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) est manquant. Vérifiez .env.local.";
    console.error(`ERREUR CONFIG FIREBASE: ${msg}`);
    if (!firebaseInitializationError) firebaseInitializationError = msg;
}


// Initialize Firebase App - Ensure this runs only once
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

if (!firebaseInitializationError) {
    try {
        if (!getApps().length) {
            app = initializeApp(firebaseConfig);
            console.log("Application Firebase initialisée.");
        } else {
            app = getApp();
            // console.log("Application Firebase déjà initialisée."); // Less verbose
        }
        firebaseInitialized = true; // Mark as initialized successfully

        // Initialize services only if app was initialized successfully
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app); // storage will be initialized if storageBucket is present
        console.log("Services Firebase (Auth, Firestore, Storage) initialisés.");

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
                     // console.log("Firebase Analytics désactivé : NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID non défini.");
                }
                 else {
                    // console.log("Firebase Analytics n'est pas pris en charge dans cet environnement.");
                }
            }).catch(err => {
                 console.error("Erreur lors de la vérification de la prise en charge de Firebase Analytics :", err);
            });
        }

        // Connect to emulators if running in development mode
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            console.log("Mode développement local détecté. Tentative de connexion aux émulateurs Firebase...");
             try {
                 if (!(window as any).__firebase_emulators_connected) {
                     console.log("Connexion aux émulateurs (Auth: 9099, Firestore: 8080, Storage: 9199)...");
                     connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
                     connectFirestoreEmulator(db, 'localhost', 8080);
                     if (storage) connectStorageEmulator(storage, 'localhost', 9199); // Check if storage is initialized
                     (window as any).__firebase_emulators_connected = true;
                      console.log("Connecté aux émulateurs Firebase.");
                 } else {
                    // console.log("Émulateurs déjà connectés dans ce cycle.");
                 }

             } catch (emulatorError: any) {
                  console.warn("Erreur de connexion à l'émulateur (peut être normal si déjà connecté) :", emulatorError.message);
             }
        }

    } catch (error) {
        console.error("L'initialisation de Firebase a ÉCHOUÉ :", error);
        firebaseInitializationError = `L'initialisation de Firebase a échoué : ${(error as Error).message}`;
        app = null;
        auth = null;
        db = null;
        storage = null;
        analytics = null;
        firebaseInitialized = false;
    }
} else {
     console.error("L'application Firebase n'a pas pu être initialisée en raison d'erreurs de configuration. Les services Firebase ne seront pas disponibles.");
     firebaseInitialized = false;
}


export { app, auth, db, storage, analytics, firebaseInitialized, firebaseInitializationError };
