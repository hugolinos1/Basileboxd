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

let firebaseInitialized = false;
let firebaseInitializationError: string | null = null;


// Validate essential config FIRST
if (!firebaseConfig.apiKey) {
    console.error("MISSING FIREBASE API KEY: The NEXT_PUBLIC_FIREBASE_API_KEY environment variable is not set.");
    firebaseInitializationError = "Firebase API key is missing. Please check your environment variables (ensure NEXT_PUBLIC_FIREBASE_API_KEY is set in .env.local) and restart the Next.js development server (npm run dev). If deploying, ensure this variable is set in your deployment environment.";
}
if (!firebaseConfig.projectId && !firebaseInitializationError) { 
    console.warn("Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Some Firebase services might not work correctly.");
    firebaseInitializationError = "Firebase Project ID is missing. Check .env.local.";
}
if (!firebaseConfig.storageBucket && !firebaseInitializationError) {
    console.warn("Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is missing. File uploads will likely fail.");
    firebaseInitializationError = "Firebase Storage Bucket is missing. Check .env.local.";
}


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
        }
        firebaseInitialized = true; 

        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app); 
        console.log("Services Firebase (Auth, Firestore, Storage) initialisés.");

        if (typeof window !== 'undefined') {
            isSupported().then((supported) => {
                if (supported && firebaseConfig.measurementId) {
                    try {
                         analytics = getAnalytics(app!);
                         console.log("Firebase Analytics initialisé.");
                    } catch (analyticsError) {
                        console.warn("L'initialisation de Firebase Analytics a échoué :", analyticsError);
                        analytics = null;
                    }
                }
            }).catch(err => {
                 console.error("Erreur lors de la vérification de la prise en charge de Firebase Analytics :", err);
            });
        }

        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            console.log("Mode développement local détecté. Tentative de connexion aux émulateurs Firebase...");
             try {
                 if (!(window as any).__firebase_emulators_connected) {
                     console.log("Connexion aux émulateurs (Auth: 9099, Firestore: 8080, Storage: 9199)...");
                     connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
                     connectFirestoreEmulator(db, 'localhost', 8080);
                     if (storage) connectStorageEmulator(storage, 'localhost', 9199); 
                     (window as any).__firebase_emulators_connected = true;
                      console.log("Connecté aux émulateurs Firebase.");
                 }
             } catch (emulatorError: any) {
                  console.warn("Erreur de connexion à l'émulateur :", emulatorError.message);
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

/*
Voici les règles de sécurité Firestore recommandées :

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Fonction utilitaire pour vérifier si l'utilisateur est un administrateur
    function isAdmin() {
      // ASSUREZ-VOUS DE REMPLACER PAR L'UID RÉEL DE L'ADMINISTRATEUR
      return request.auth != null && request.auth.uid == '4aqCNYkLwgXpp5kjMnGA6V0bdL52';
    }

    // Règle pour la collection "parties" (Événements)
    match /parties/{partyId} {
      // Lecture : Tout utilisateur (connecté ou non) peut lire les détails d'un événement.
      allow read: if true;

      // Création : Tout utilisateur connecté peut créer un événement.
      // Des validations de base sont incluses.
      allow create: if request.auth != null &&
                       request.resource.data.name is string &&
                       request.resource.data.name.size() > 0 &&
                       request.resource.data.date is timestamp &&
                       request.resource.data.createdBy == request.auth.uid &&
                       request.resource.data.creatorEmail == request.auth.token.email &&
                       request.resource.data.participants is list &&
                       request.auth.uid in request.resource.data.participants;

      // Mise à jour :
      allow update: if request.auth != null &&
                      (
                        // Règle 1: Créateur ou Admin met à jour les détails principaux de l'événement
                        ( (request.auth.uid == resource.data.createdBy || isAdmin()) &&
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['name', 'description', 'date', 'location', 'coverPhotoUrl', 'latitude', 'longitude', 'participants', 'participantEmails', 'mediaItems']) &&
                          (!('name' in request.resource.data.diff(resource.data).affectedKeys()) || (request.resource.data.name is string && request.resource.data.name.size() > 0) ) &&
                          (!('date' in request.resource.data.diff(resource.data).affectedKeys()) || request.resource.data.date is timestamp ) &&
                          request.resource.data.createdBy == resource.data.createdBy &&
                          request.resource.data.creatorEmail == resource.data.creatorEmail
                        ) ||
                        // Règle 2: Tout utilisateur connecté peut ajouter/mettre à jour sa propre note
                        ( request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ratings']) &&
                          request.resource.data.ratings[request.auth.uid] is number &&
                          request.resource.data.ratings[request.auth.uid] >= 0 && request.resource.data.ratings[request.auth.uid] <= 10 &&
                           (
                            (resource.data.ratings == null || !(request.auth.uid in resource.data.ratings.keys())) || 
                            (request.auth.uid in resource.data.ratings.keys() && request.resource.data.ratings[request.auth.uid] != resource.data.ratings[request.auth.uid]) 
                          ) &&
                          resource.data.ratings.keys().removeAll(request.resource.data.ratings.keys()).size() == 0 &&
                          request.resource.data.ratings.keys().removeAll(resource.data.ratings.keys()).hasOnly([request.auth.uid])
                        ) ||
                        // Règle 3: Tout utilisateur connecté peut AJOUTER des souvenirs (mediaItems)
                        (
                          request.auth != null && 
                          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['mediaItems']) &&
                          request.resource.data.mediaItems.size() > resource.data.mediaItems.size()
                        )
                      );

      // Suppression : Seul un admin peut supprimer un événement.
      allow delete: if isAdmin();

      // Sous-collection "comments"
      match /comments/{commentId} {
        // Lecture : Tout utilisateur (connecté ou non) peut lire les commentaires.
        allow read: if true;

        // Création : Tout utilisateur connecté peut créer un commentaire.
        allow create: if request.auth != null &&
                         request.resource.data.userId == request.auth.uid &&
                         request.resource.data.text is string &&
                         request.resource.data.text.size() > 0 &&
                         request.resource.data.partyId == partyId &&
                         request.resource.data.timestamp is timestamp;

        // Mise à jour : L'utilisateur peut mettre à jour le texte de son propre commentaire, ou un admin peut tout mettre à jour.
        allow update: if request.auth != null &&
                         (
                           (request.auth.uid == resource.data.userId &&
                            request.resource.data.diff(resource.data).affectedKeys().hasOnly(['text']) &&
                            request.resource.data.text is string && request.resource.data.text.size() > 0 &&
                            request.resource.data.userId == resource.data.userId &&
                            request.resource.data.partyId == resource.data.partyId &&
                            request.resource.data.timestamp == resource.data.timestamp
                           ) ||
                           isAdmin()
                         );

        // Suppression : L'utilisateur peut supprimer son propre commentaire, ou un admin peut supprimer n'importe quel commentaire.
        allow delete: if request.auth != null &&
                         (request.auth.uid == resource.data.userId || isAdmin());
      }
    }

    // Règle pour la collection "users"
    match /users/{userId} {
      // Lecture : Tout le monde peut lire les profils utilisateurs (y compris non authentifié).
      allow read: if true;

      // Création : Un utilisateur connecté peut créer son propre document de profil.
      allow create: if request.auth != null &&
                       request.auth.uid == userId &&
                       request.resource.data.email == request.auth.token.email &&
                       request.resource.data.uid == request.auth.uid &&
                       request.resource.data.createdAt is timestamp;

      // Mise à jour : Un utilisateur peut mettre à jour son propre profil (certains champs), ou un admin peut tout mettre à jour.
      allow update: if request.auth != null &&
                       (
                         ( request.auth.uid == userId &&
                           request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'pseudo', 'avatarUrl']) &&
                           (!('displayName' in request.resource.data) || request.resource.data.displayName is string) &&
                           (!('pseudo' in request.resource.data) || request.resource.data.pseudo is string) &&
                           (!('avatarUrl' in request.resource.data) || request.resource.data.avatarUrl is string)
                         ) ||
                         isAdmin()
                       ) &&
                       (isAdmin() || (
                           request.resource.data.uid == resource.data.uid &&
                           request.resource.data.email == resource.data.email &&
                           request.resource.data.createdAt == resource.data.createdAt
                       ));

      // Suppression : Seul un admin peut supprimer les documents utilisateurs (à utiliser avec une extrême prudence).
      allow delete: if isAdmin();
    }
    
    // Règles pour la collection "siteConfiguration" (pour l'image Hero)
    match /siteConfiguration/{configDocId} {
      allow read: if true; // Tout le monde peut lire la config (ex: URL de l'image hero)
      allow write: if isAdmin(); // Seul un admin peut modifier la config
    }
  }
}
*/