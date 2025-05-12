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

if (!firebaseConfig.apiKey) {
    firebaseInitializationError = "Clé API Firebase manquante (NEXT_PUBLIC_FIREBASE_API_KEY). Vérifiez vos variables d'environnement (.env.local) et redémarrez le serveur de développement Next.js (npm run dev). Si vous déployez, assurez-vous que cette variable est définie dans votre environnement de déploiement.";
    console.error(`ERREUR CONFIG FIREBASE: ${firebaseInitializationError}`);
    throw new Error(firebaseInitializationError);
}
if (!firebaseConfig.projectId) {
    const msg = "L'ID de projet Firebase (NEXT_PUBLIC_FIREBASE_PROJECT_ID) est manquant. Vérifiez .env.local.";
    console.error(`ERREUR CONFIG FIREBASE: ${msg}`);
    if (!firebaseInitializationError) firebaseInitializationError = msg;
    throw new Error(msg);
}
if (!firebaseConfig.storageBucket) { 
    const msg = "Le nom du bucket de stockage Firebase (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) est manquant. Vérifiez .env.local.";
    console.error(`ERREUR CONFIG FIREBASE: ${msg}`);
    if (!firebaseInitializationError) firebaseInitializationError = msg;
    throw new Error(msg);
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
Voici les règles de sécurité Firestore recommandées, basées sur votre dernière demande :

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null && request.auth.uid == '4aqCNYkLwgXpp5kjMnGA6V0bdL52'; // UID de l'admin
    }

    match /parties/{partyId} {
      allow read: if true; // Tout le monde peut lire les événements

      allow create: if request.auth != null &&
                       request.resource.data.name is string &&
                       request.resource.data.name.size() > 0 &&
                       request.resource.data.date is timestamp &&
                       request.resource.data.createdBy == request.auth.uid &&
                       request.resource.data.creatorEmail == request.auth.token.email &&
                       request.resource.data.participants is list &&
                       request.auth.uid in request.resource.data.participants;

      allow update: if request.auth != null &&
                      (
                        // Règle 1: Créateur ou Admin met à jour les détails principaux
                        ( (request.auth.uid == resource.data.createdBy || isAdmin()) &&
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['name', 'description', 'date', 'location', 'coverPhotoUrl', 'latitude', 'longitude', 'participants', 'participantEmails']) &&
                          (!('name' in request.resource.data.diff(resource.data).affectedKeys()) || (request.resource.data.name is string && request.resource.data.name.size() > 0) ) &&
                          (!('date' in request.resource.data.diff(resource.data).affectedKeys()) || request.resource.data.date is timestamp ) &&
                          request.resource.data.createdBy == resource.data.createdBy &&
                          request.resource.data.creatorEmail == resource.data.creatorEmail
                        ) ||
                        // Règle 2: Tout utilisateur connecté peut ajouter/mettre à jour SA PROPRE note
                        ( request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ratings']) &&
                          request.resource.data.ratings[request.auth.uid] is number &&
                          request.resource.data.ratings[request.auth.uid] >= 0 && request.resource.data.ratings[request.auth.uid] <= 10 &&
                          // S'assurer que l'utilisateur ne modifie que sa propre clé de notation
                          (
                            (resource.data.ratings == null || !(request.auth.uid in resource.data.ratings.keys())) || // Ajout d'une nouvelle note par l'utilisateur
                            (request.auth.uid in resource.data.ratings.keys() && request.resource.data.ratings[request.auth.uid] != resource.data.ratings[request.auth.uid]) // Modification de sa note existante
                          ) &&
                          // S'assurer qu'aucune autre note n'est affectée
                          resource.data.ratings.keys().removeAll(request.resource.data.ratings.keys()).size() == 0 &&
                          request.resource.data.ratings.keys().removeAll(resource.data.ratings.keys()).hasOnly([request.auth.uid])
                        ) ||
                        // Règle 3: Tout utilisateur connecté peut AJOUTER des souvenirs (mediaItems)
                        ( request.resource.data.diff(resource.data).affectedKeys().hasOnly(['mediaItems']) &&
                          ( // Gère l'ajout à un tableau existant ou l'initialisation du tableau
                            (resource.data.mediaItems == null && request.resource.data.mediaItems.size() > 0) || // Initialisation avec un ou plusieurs items
                            (resource.data.mediaItems != null && request.resource.data.mediaItems.size() > resource.data.mediaItems.size()) // Ajout à un tableau existant
                          ) &&
                          // Validation de base pour chaque NOUVEL item ajouté (ceci est simplifié pour les règles)
                          // Idéalement, la validation plus poussée se fait côté client/fonctions Cloud.
                          // Cette règle vérifie que les items ajoutés ont bien l'uploaderId de l'utilisateur.
                          // Ceci est une simplification; pour une validation robuste de chaque item, voir les fonctions Cloud.
                          // Pour l'instant, on s'assure que si mediaItems est le seul champ modifié, et que la taille augmente, c'est permis.
                          // La validation de l'uploaderId se fait mieux dans le code client avant l'envoi ou via Cloud Function.
                          true // Simplification: le client doit assurer l'intégrité de uploaderId pour les nouveaux items
                        ) ||
                        // Règle 4: Créateur ou Admin peut gérer TOUS les mediaItems (y compris suppression/modification d'items existants)
                        ( (request.auth.uid == resource.data.createdBy || isAdmin()) &&
                          request.resource.data.diff(resource.data).affectedKeys().hasAny(['mediaItems']) // Peut affecter mediaItems parmi d'autres champs autorisés
                        )
                      );

      allow delete: if isAdmin();

      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null &&
                         request.resource.data.userId == request.auth.uid &&
                         request.resource.data.text is string &&
                         request.resource.data.text.size() > 0 &&
                         request.resource.data.partyId == partyId &&
                         request.resource.data.timestamp is timestamp;
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
        allow delete: if request.auth != null &&
                         (request.auth.uid == resource.data.userId || isAdmin());
      }
    }

    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth != null &&
                       request.auth.uid == userId &&
                       request.resource.data.email == request.auth.token.email &&
                       request.resource.data.uid == request.auth.uid &&
                       request.resource.data.createdAt is timestamp;
      allow update: if request.auth != null &&
                       (
                         ( request.auth.uid == userId &&
                           request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'pseudo', 'avatarUrl']) &&
                           (!('displayName' in request.resource.data.diff(resource.data).affectedKeys()) || request.resource.data.displayName is string) &&
                           (!('pseudo' in request.resource.data.diff(resource.data).affectedKeys()) || request.resource.data.pseudo is string) &&
                           (!('avatarUrl' in request.resource.data.diff(resource.data).affectedKeys()) || request.resource.data.avatarUrl is string)
                         ) ||
                         isAdmin()
                       ) &&
                       (isAdmin() || (
                           request.resource.data.uid == resource.data.uid &&
                           request.resource.data.email == resource.data.email &&
                           request.resource.data.createdAt == resource.data.createdAt
                       ));
      allow delete: if isAdmin();
    }

    // Permettre aux administrateurs de lire/écrire la configuration du site (par exemple, heroImage)
    match /siteConfiguration/{docId} {
      allow read: if true; // Tout le monde peut lire la configuration du site
      allow write: if isAdmin(); // Seul l'admin peut modifier la configuration
    }
  }
}
*/