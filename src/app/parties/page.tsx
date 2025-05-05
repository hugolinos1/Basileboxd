'use client';

import { useState, useEffect, useMemo } from 'react'; // Added useMemo
import { collection, getDocs, query, orderBy, Timestamp, FirestoreError } from 'firebase/firestore';
import { db } from '@/config/firebase'; // Import db directly
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, CalendarDays, MapPin, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirebase } from '@/context/FirebaseContext';
import { Skeleton } from '@/components/ui/skeleton';

interface FirestoreTimestamp {
    seconds: number;
    nanoseconds: number;
}

interface PartyData {
    id: string;
    name: string;
    description?: string;
    date: FirestoreTimestamp | Timestamp; // Allow both types
    location?: string;
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    comments?: Comment[]; // Add comments field
    createdAt: FirestoreTimestamp | Timestamp;
}

// Added Comment interface (assuming similar structure as in party/[id]/page.tsx)
interface Comment {
    userId: string;
    email: string;
    avatar?: string;
    text: string;
    timestamp: FirestoreTimestamp | Timestamp;
}


// Helper to calculate average rating
const calculateAverageRating = (ratings: { [userId: string]: number } | undefined): number => {
  if (!ratings) return 0;
  const allRatings = Object.values(ratings);
  if (allRatings.length === 0) return 0;
  const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
  return sum / allRatings.length;
};

// Helper to safely convert timestamp
const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | undefined): Date | null => {
    if (!timestamp) {
        // console.warn("getDateFromTimestamp: Timestamp is undefined or null."); // Less verbose
        return null;
    }
    try {
        if (timestamp instanceof Timestamp) {
            return timestamp.toDate();
        } else if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') { // Check if it's a FirestoreTimestamp-like object
             const date = new Date(timestamp.seconds * 1000);
             if (isNaN(date.getTime())) {
                 console.warn("getDateFromTimestamp: Invalid date created from timestamp object:", timestamp);
                 return null;
             }
             return date;
        } else {
             // console.warn("getDateFromTimestamp: Unrecognized timestamp format:", timestamp); // Less verbose
            return null;
        }
    } catch (e) {
        console.error("getDateFromTimestamp: Error converting timestamp to Date:", timestamp, e);
        return null;
    }
}


export default function PartiesListPage() {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  // Use context for initialization status AND actual user loading state
  const { firebaseInitialized, initializationFailed, initializationErrorMessage, loading: userLoading } = useFirebase();

  useEffect(() => {
    console.log("[PartiesListPage useEffect] State Check - Initialized:", firebaseInitialized, "Init Failed:", initializationFailed, "User Loading:", userLoading);

    // If Firebase init failed, set error and stop loading
    if (initializationFailed) {
      console.error("[PartiesListPage useEffect] Firebase initialization failed. Setting error state.");
      setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
      setLoading(false);
      return;
    }

    // If Firebase is not yet initialized OR user state is still loading, keep showing loader
    if (!firebaseInitialized || userLoading) {
      console.log("[PartiesListPage useEffect] Waiting for Firebase init and user auth state...");
      setLoading(true); // Ensure loading stays true while waiting
      return;
    }

    // --- Firebase is initialized and auth state is known ---

    if (!db) {
        console.error("[PartiesListPage useEffect] Firestore 'db' instance is null even though Firebase is initialized. Setting error state.");
        setError("La base de données Firestore n'est pas disponible.");
        setLoading(false);
        return;
    }

    const fetchParties = async () => {
      console.log("[fetchParties] Starting fetch. setLoading(true), setError(null).");
      // Keep loading true as fetch starts, reset error for *this* attempt
      setLoading(true);
      setError(null);

      try {
        console.log("[fetchParties] Accessing Firestore collection 'parties'...");
        const partiesCollectionRef = collection(db, 'parties');
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc')); // Order by creation time descending

        console.log("[fetchParties] Executing Firestore query...");
        const querySnapshot = await getDocs(q);
        console.log(`[fetchParties] Firestore query executed. Found ${querySnapshot.size} documents. Is empty: ${querySnapshot.empty}`);

        if (querySnapshot.empty) {
            console.log("[fetchParties] No parties found in collection.");
            setParties([]);
        } else {
            console.log("[fetchParties] Mapping documents to PartyData...");
            const partiesData = querySnapshot.docs.map(doc => {
                 const data = doc.data();
                 // console.log(`[fetchParties Mapping] Doc ID: ${doc.id}, Raw data:`, JSON.stringify(data, null, 2)); // Verbose log

                 // Robust validation
                 if (!data.name || typeof data.name !== 'string') {
                    console.warn(`[fetchParties Mapping] Doc ${doc.id}: missing or invalid 'name' field. Skipping.`);
                    return null;
                 }
                 if (!data.date || (typeof data.date !== 'object')) {
                    console.warn(`[fetchParties Mapping] Doc ${doc.id}: missing or invalid 'date' field. Skipping.`);
                    return null;
                 }
                  if (!data.createdAt || (typeof data.createdAt !== 'object')) {
                    console.warn(`[fetchParties Mapping] Doc ${doc.id}: missing or invalid 'createdAt' field. Skipping.`);
                    return null;
                 }

                  // Attempt date conversion with error handling
                  const partyDate = getDateFromTimestamp(data.date);
                  if (!partyDate) {
                       console.warn(`[fetchParties Mapping] Doc ${doc.id}: could not convert 'date'. Skipping.`);
                       return null;
                  }
                 const createdAtDate = getDateFromTimestamp(data.createdAt);
                 if (!createdAtDate) {
                      console.warn(`[fetchParties Mapping] Doc ${doc.id}: could not convert 'createdAt'. Skipping.`);
                      return null;
                 }

                 // Create final PartyData object
                 const partyObject: PartyData = {
                     id: doc.id,
                     name: data.name,
                     description: data.description || undefined,
                     date: data.date, // Keep original format for now, conversion was validated
                     location: data.location || undefined,
                     coverPhotoUrl: data.coverPhotoUrl || undefined,
                     ratings: data.ratings || {},
                     comments: data.comments || [], // Include comments
                     createdAt: data.createdAt, // Keep original format
                 };
                  // console.log(`[fetchParties Mapping] Doc ${doc.id} mapped successfully:`, partyObject); // Verbose log
                 return partyObject;

            }).filter(party => party !== null) as PartyData[]; // Filter out skipped documents

            console.log("[fetchParties] Mapped parties data:", partiesData);
            setParties(partiesData);
            console.log(`[fetchParties] Parties state updated with ${partiesData.length} items.`);
        }

      } catch (fetchError: any) {
        console.error('[fetchParties] Error during Firestore query or mapping:', fetchError);
         let userFriendlyError = 'Impossible de charger la liste des fêtes.';
         if (fetchError instanceof FirestoreError) {
             if (fetchError.code === 'permission-denied') {
                 userFriendlyError = 'Permission refusée. Vérifiez les règles de sécurité Firestore pour la collection "parties".';
                 console.error("Firestore Permission Denied: Check your security rules for the 'parties' collection.");
             } else if (fetchError.code === 'unauthenticated') {
                 userFriendlyError = 'Non authentifié. Veuillez vous connecter.';
             } else if (fetchError.code === 'unavailable') {
                  userFriendlyError = 'Service Firestore indisponible. Veuillez réessayer plus tard.';
             } else {
                  userFriendlyError = `Erreur Firestore (${fetchError.code}): ${fetchError.message}`;
             }
         } else {
             userFriendlyError = `Erreur inattendue: ${fetchError.message}`;
         }
        setError(userFriendlyError);
        setParties([]); // Ensure parties state is empty on error
      } finally {
        console.log("[fetchParties] Fetch attempt finished. setLoading(false).");
        setLoading(false); // Fetch is complete (success or error)
      }
    };

    // Only fetch if Firebase is initialized and auth state is known
     fetchParties();


  }, [firebaseInitialized, initializationFailed, initializationErrorMessage, userLoading]); // Dependencies


  // --- Render Logic ---

  console.log("[PartiesListPage Render] Loading:", loading, "Error:", error, "Parties Count:", parties.length, "Firebase Initialized:", firebaseInitialized, "Init Failed:", initializationFailed);

  // Show Skeleton Loader if EITHER context is loading OR page is fetching data
  if (loading) {
    console.log("[PartiesListPage Render] Displaying Skeleton Loader.");
    return (
      <div className="container mx-auto px-4 py-12">
        <Skeleton className="h-8 w-1/3 mb-8 bg-muted" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden bg-card border border-border/50">
              <CardHeader className="p-0">
                <Skeleton className="aspect-video w-full bg-muted" />
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4 bg-muted" />
                <Skeleton className="h-4 w-1/2 bg-muted" />
                <Skeleton className="h-4 w-1/3 bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Show Error Alert if initialization failed OR a fetch error occurred
  if (initializationFailed || error) {
     const displayError = initializationFailed ? (initializationErrorMessage || "Échec de l'initialisation de Firebase.") : (error || "Une erreur inconnue est survenue.");
     console.log("[PartiesListPage Render] Displaying Error Alert:", displayError);
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
           <AlertTitle>Erreur{initializationFailed ? " d'Initialisation" : ""}</AlertTitle>
           <AlertDescription>
                {displayError}
                {initializationFailed && <p className="mt-2 text-xs">Assurez-vous que les variables d'environnement sont correctes et que le serveur a été redémarré.</p>}
            </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Display Party List only if not loading and no errors
  console.log("[PartiesListPage Render] Displaying party list.");
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8 text-primary">Tous les Événements</h1>
      {parties.length === 0 ? (
         <div className="text-center py-10">
             <p className="text-muted-foreground text-lg">Aucun événement trouvé pour le moment.</p>
             <p className="text-muted-foreground mt-2">Soyez le premier à <Link href="/events/create" className="text-primary hover:underline">créer un événement</Link> !</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {parties.map((party) => {
            // Safe date conversion within the map
            const partyDate: Date | null = getDateFromTimestamp(party.date);
            const averageRating = calculateAverageRating(party.ratings);
            const commentCount = party.comments?.length || 0; // Count comments

            // Log each party's data before rendering
            // console.log(`[PartiesListPage Render - map] Rendering party: ${party.id}, Name: ${party.name}, Date Obj:`, partyDate, "Cover URL:", party.coverPhotoUrl);

            return (
              <Link href={`/party/${party.id}`} key={party.id} className="block group">
                <Card className="bg-card border border-border/50 overflow-hidden h-full flex flex-col hover:shadow-lg hover:border-primary/50 transition-all duration-300">
                  <CardHeader className="p-0 relative">
                    <div className="aspect-video relative w-full bg-muted">
                      {party.coverPhotoUrl ? (
                        <Image
                          src={party.coverPhotoUrl}
                          alt={`Couverture ${party.name}`}
                          layout="fill"
                          objectFit="cover"
                          className="transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          loading="lazy"
                           onError={(e) => console.error(`Error loading image for party ${party.id}: ${party.coverPhotoUrl}`, e)}
                           unoptimized={party.coverPhotoUrl.includes('localhost')} // Add this if using local emulator URLs
                          data-ai-hint="couverture fête événement"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                           <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}
                       {/* Rating Badge */}
                       {averageRating > 0 && (
                         <Badge variant="secondary" className="absolute top-2 right-2 backdrop-blur-sm bg-black/50 border-white/20 text-sm px-2 py-0.5">
                            <Star className="h-3 w-3 text-yellow-400 fill-current mr-1" />
                            {averageRating.toFixed(1)}
                         </Badge>
                       )}
                       {/* Comment Count Badge (Optional) */}
                       {commentCount > 0 && (
                            <Badge variant="secondary" className="absolute bottom-2 left-2 backdrop-blur-sm bg-black/50 border-white/20 text-xs px-1.5 py-0.5">
                                {commentCount} {commentCount > 1 ? 'commentaires' : 'commentaire'}
                            </Badge>
                       )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold leading-tight mb-2 truncate group-hover:text-primary transition-colors">
                        {party.name || "Événement sans nom"} {/* Fallback */}
                      </CardTitle>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {partyDate ? (
                            <p className="flex items-center gap-1.5">
                                <CalendarDays className="h-3 w-3" /> {format(partyDate, 'P', { locale: fr })}
                            </p>
                        ) : (
                            <p className="flex items-center gap-1.5 text-destructive">
                                <CalendarDays className="h-3 w-3" /> Date invalide
                            </p>
                        )}
                        {party.location && (
                            <p className="flex items-center gap-1.5">
                                <MapPin className="h-3 w-3" /> {party.location}
                            </p>
                        )}
                      </div>
                    </div>
                     {/* Optional: Created Date */}
                    {/* <p className="text-xs text-muted-foreground/70 mt-2">Créé le {party.createdAt ? format(getDateFromTimestamp(party.createdAt)!, 'Pp', { locale: fr }) : 'N/A'}</p> */}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
