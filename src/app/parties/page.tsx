// src/app/parties/page.tsx
'use client';

import { useState, useEffect } from 'react';
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
    createdAt: FirestoreTimestamp | Timestamp;
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
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) { // Check if it's a FirestoreTimestamp-like object
        // Guard against invalid date values
        try {
             const date = new Date(timestamp.seconds * 1000);
             // Check if the date is valid
             if (!isNaN(date.getTime())) {
                 return date;
             }
             console.warn("getDateFromTimestamp: Invalid date created from timestamp object:", timestamp);
             return null;
        } catch (e) {
            console.error("getDateFromTimestamp: Error creating date from timestamp object:", timestamp, e);
            return null;
        }
    }
     console.warn("getDateFromTimestamp: Unrecognized timestamp format:", timestamp);
    return null;
}


export default function PartiesListPage() {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { firebaseInitialized, initializationFailed, initializationErrorMessage } = useFirebase(); // Use context for initialization status

  useEffect(() => {
    console.log("[PartiesListPage useEffect] Triggered. Firebase Initialized:", firebaseInitialized, "Init Failed:", initializationFailed);

    // Immediately set error and stop loading if Firebase init failed on context level
    if (initializationFailed) {
        console.error("[PartiesListPage useEffect] Firebase initialization failed. Setting error state.");
        setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
        setLoading(false);
        return;
    }

    // Wait for Firebase to be initialized before attempting to fetch
    if (!firebaseInitialized) {
        console.log("[PartiesListPage useEffect] Firebase not yet initialized, waiting...");
        setLoading(true); // Keep loading while waiting
        return;
    }

    // Check if db is available (it should be if firebaseInitialized is true, but double-check)
    if (!db) {
        console.error("[PartiesListPage useEffect] Firestore 'db' instance is null even though Firebase is initialized. Setting error state.");
        setError("La base de données Firestore n'est pas disponible.");
        setLoading(false);
        return;
    }

    const fetchParties = async () => {
      // Don't fetch if already in an error state from this component's perspective
      // if (error) {
      //     console.log("[fetchParties] Skipping fetch because error state is set:", error);
      //     return;
      // }

      console.log("[fetchParties] Starting fetch. Setting loading=true, error=null.");
      setLoading(true);
      setError(null); // Reset error before *this* fetch attempt

      try {
        console.log("[fetchParties] Accessing Firestore collection 'parties'...");
        const partiesCollectionRef = collection(db, 'parties');
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));

        console.log("[fetchParties] Executing Firestore query...");
        const querySnapshot = await getDocs(q);
        console.log(`[fetchParties] Firestore query executed. Found ${querySnapshot.size} documents. Is empty: ${querySnapshot.empty}`);

        if (querySnapshot.empty) {
            console.log("[fetchParties] No parties found in the collection.");
            setParties([]); // Ensure state is empty array if no documents
        } else {
            console.log("[fetchParties] Mapping documents to PartyData...");
            const partiesData = querySnapshot.docs.map(doc => {
                 const data = doc.data();
                 console.log(`[fetchParties Mapping] Doc ID: ${doc.id}, Data:`, data); // Log individual doc data
                 // Basic validation for critical fields during mapping
                 if (!data.name || !data.date || !data.createdAt) {
                    console.warn(`[fetchParties Mapping] Document ${doc.id} is missing critical fields (name, date, or createdAt). Skipping.`);
                    return null; // Skip this document if essential data is missing
                 }
                 return {
                     id: doc.id,
                     ...data,
                 } as PartyData;
            }).filter(party => party !== null) as PartyData[]; // Filter out skipped documents

            console.log("[fetchParties] Mapped parties data:", partiesData); // Log the final mapped data
            setParties(partiesData);
            console.log(`[fetchParties] Parties state updated with ${partiesData.length} items.`);
        }

      } catch (fetchError: any) {
        console.error('[fetchParties] Error during Firestore query or mapping:', fetchError);
         // Provide more specific error messages if possible
         let userFriendlyError = 'Impossible de charger la liste des fêtes.';
         if (fetchError instanceof FirestoreError) {
             if (fetchError.code === 'permission-denied') {
                 userFriendlyError = 'Permission refusée. Vérifiez les règles de sécurité Firestore.';
                 console.error("Firestore Permission Denied: Check your security rules for the 'parties' collection.");
             } else if (fetchError.code === 'unauthenticated') {
                 userFriendlyError = 'Non authentifié. Veuillez vous connecter.';
             } else if (fetchError.code === 'unavailable') {
                  userFriendlyError = 'Service Firestore indisponible. Veuillez réessayer plus tard.';
             }
         }
        setError(userFriendlyError);
        setParties([]); // Ensure parties state is empty on error
      } finally {
        console.log("[fetchParties] Fetch attempt finished. Setting loading=false.");
        setLoading(false); // Ensure loading is set to false regardless of success or failure
      }
    };

    fetchParties();

    // Dependency array: Fetch only when Firebase initialization status changes and is successful.
    // Removed 'error' dependency to prevent potential re-fetch loops if setError itself caused a re-render triggering the effect.
  }, [firebaseInitialized, initializationFailed, initializationErrorMessage]);


  // --- Render Logic ---

  console.log("[PartiesListPage Render] Loading:", loading, "Error:", error, "Parties Count:", parties.length, "Firebase Initialized:", firebaseInitialized, "Init Failed:", initializationFailed);


    // Render Skeleton only if loading and initialization has *not* failed
    if (loading && !initializationFailed) {
      console.log("[PartiesListPage Render] Rendering Skeleton Loader.");
      return (
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-1/3 mb-8 bg-muted" /> {/* Use muted for skeleton */}
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

  // Render Error Alert if either initialization failed OR a fetch error occurred
  if (initializationFailed || error) {
     const displayError = initializationFailed ? (initializationErrorMessage || "Échec de l'initialisation de Firebase.") : (error || "Une erreur inconnue est survenue.");
     console.log("[PartiesListPage Render] Rendering Error Alert:", displayError);
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
           <AlertTitle>Erreur{initializationFailed ? " d'Initialisation" : ""}</AlertTitle>
           <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Render Parties List only if *not* loading and *no* errors
  console.log("[PartiesListPage Render] Rendering parties list.");
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
            // Safely get the date, handle potential nulls
            let partyDate: Date | null = null;
             try {
                 partyDate = getDateFromTimestamp(party.date);
             } catch(e) {
                  console.error(`Error parsing date for party ${party.id}:`, party.date, e);
             }

            const averageRating = calculateAverageRating(party.ratings);

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
                          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" // Example sizes, adjust as needed
                          loading="lazy"
                           onError={(e) => console.error(`Error loading image for party ${party.id}: ${party.coverPhotoUrl}`, e)}
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
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold leading-tight mb-2 truncate group-hover:text-primary transition-colors">
                        {party.name || "Événement sans nom"} {/* Fallback for name */}
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
                    {/* Optional: Add created date or other meta */}
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
