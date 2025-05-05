'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
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
        return new Date(timestamp.seconds * 1000);
    }
    return null;
}


export default function PartiesListPage() {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { firebaseInitialized, initializationFailed, initializationErrorMessage } = useFirebase(); // Use context for initialization status

  useEffect(() => {
    console.log("PartiesList useEffect triggered. Firebase Initialized:", firebaseInitialized, "Initialization Failed:", initializationFailed);

    // Exit early if Firebase initialization failed
    if (initializationFailed) {
        console.error("Firebase initialization failed in useEffect. Setting error state.");
        setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
        setLoading(false);
        return;
    }

    // Wait for Firebase to be initialized
    if (!firebaseInitialized) {
        console.log("Firebase not yet initialized, waiting...");
        setLoading(true); // Ensure loading is true while waiting
        return;
    }

    // Check if db is available
    if (!db) {
        console.error("Firestore 'db' instance is null even though Firebase is initialized. Setting error state.");
        setError("La base de données Firestore n'est pas disponible.");
        setLoading(false);
        return;
    }


    const fetchParties = async () => {
      // Already loading or error occurred, no need to fetch again unnecessarily
      if (error && !loading) {
          console.log("Error state exists and not loading, skipping fetch.");
          return;
       }

      console.log("Setting loading state to true and resetting error before fetch.");
      setLoading(true); // Set loading true at the start of fetch attempt
      setError(null); // Reset error before fetching

      try {
        console.log("Fetching parties from Firestore...");
        const partiesCollectionRef = collection(db, 'parties');
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        console.log(`Firestore query executed. Found ${querySnapshot.size} documents. Is empty: ${querySnapshot.empty}`);

        const partiesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PartyData[];

        console.log("Mapped parties data:", partiesData); // Log the data retrieved

        setParties(partiesData);
        console.log(`Parties state updated with ${partiesData.length} items.`);

      } catch (fetchError: any) {
        console.error('Erreur lors de la récupération des fêtes:', fetchError);
        setError('Impossible de charger la liste des fêtes.');
        setParties([]); // Ensure parties state is empty on error
      } finally {
        console.log("Setting loading state to false in finally block.");
        setLoading(false); // Set loading false after fetch attempt (success or failure)
      }
    };

    fetchParties();

    // Dependency array: only re-run when initialization status changes
  }, [firebaseInitialized, initializationFailed, initializationErrorMessage, error]); // Keep error dependency


  // --- Render Logic ---

  console.log("Rendering PartiesListPage. Loading:", loading, "Error:", error, "Parties Count:", parties.length);

  if (loading) {
    // Render Skeleton Loading State only if not failed
    if (initializationFailed) {
        // If initialization failed, the error component will be rendered below.
        return null;
    }
    console.log("Rendering Skeleton Loader.");
    return (
      <div className="container mx-auto px-4 py-12">
        <Skeleton className="h-8 w-1/3 mb-8" />
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


  if (error) {
    console.log("Rendering Error Alert:", error);
    // Render Error Alert
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Render Parties List
  console.log("Rendering parties list.");
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8 text-primary">Tous les Événements</h1>
      {parties.length === 0 ? (
         <p className="text-muted-foreground text-center">Aucun événement trouvé pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {parties.map((party) => {
            const partyDate = getDateFromTimestamp(party.date);
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
                        {party.name}
                      </CardTitle>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {partyDate && (
                            <p className="flex items-center gap-1.5">
                                <CalendarDays className="h-3 w-3" /> {format(partyDate, 'P', { locale: fr })}
                            </p>
                        )}
                        {party.location && (
                            <p className="flex items-center gap-1.5">
                                <MapPin className="h-3 w-3" /> {party.location}
                            </p>
                        )}
                      </div>
                    </div>
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
