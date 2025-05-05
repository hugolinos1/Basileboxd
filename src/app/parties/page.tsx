'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, firebaseInitialized } from '@/config/firebase';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, CalendarDays, MapPin, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirebase } from '@/context/FirebaseContext'; // Import useFirebase
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
    } else if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
    }
    return null;
}


export default function PartiesListPage() {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { initializationFailed, initializationErrorMessage } = useFirebase(); // Use context for initialization status

  useEffect(() => {
    if (initializationFailed) {
        setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
        setLoading(false);
        return;
    }

    if (!firebaseInitialized || !db) {
        // Wait for initialization or handle case where db is null
        // This might be redundant if initializationFailed covers it, but good as a safeguard
        if (!loading) setLoading(true); // Ensure loading state is true if we're waiting
        return;
    }


    const fetchParties = async () => {
      setLoading(true);
      setError(null);
      try {
        const partiesCollectionRef = collection(db, 'parties');
        // Query parties ordered by creation date descending
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        const partiesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PartyData[];

        setParties(partiesData);

      } catch (fetchError: any) {
        console.error('Erreur lors de la récupération des fêtes :', fetchError);
        setError('Impossible de charger la liste des fêtes.');
      } finally {
        setLoading(false);
      }
    };

    fetchParties();
  }, [firebaseInitialized, initializationFailed, initializationErrorMessage, loading]); // Re-run if initialization status changes


  if (loading) {
    // Enhanced Skeleton Loading State
    return (
      <div className="container mx-auto px-4 py-12">
        <Skeleton className="h-8 w-1/3 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="p-0">
                <Skeleton className="aspect-video w-full" />
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }


  if (error) {
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

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8 text-primary">Tous les Événements</h1>
      {parties.length === 0 ? (
         <p className="text-muted-foreground text-center">Aucun événement trouvé.</p>
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
                    {/* Maybe add participant count or other info here if needed */}
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
