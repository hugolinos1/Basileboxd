'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, Timestamp, FirestoreError } from 'firebase/firestore';
import { db } from '@/config/firebase';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, CalendarDays, MapPin, Image as ImageIcon, Loader2, AlertTriangle, PlusCircle, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirebase } from '@/context/FirebaseContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation'; // Import useSearchParams

interface FirestoreTimestamp {
    seconds: number;
    nanoseconds: number;
}

interface PartyData {
    id: string;
    name: string;
    description?: string;
    date: FirestoreTimestamp | Timestamp;
    location?: string;
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    comments?: Comment[];
    createdAt: FirestoreTimestamp | Timestamp;
}

interface Comment {
    userId: string;
    email: string;
    avatar?: string;
    text: string;
    timestamp: FirestoreTimestamp | Timestamp;
}

const calculateAverageRating = (ratings: { [userId: string]: number } | undefined): number => {
  if (!ratings) return 0;
  const allRatings = Object.values(ratings);
  if (allRatings.length === 0) return 0;
  const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
  return sum / allRatings.length;
};

const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
             const date = new Date(timestamp.seconds * 1000);
             return isNaN(date.getTime()) ? null : date;
        } else if (timestamp instanceof Date) return timestamp;
        return null;
    } catch (e) {
        console.error("getDateFromTimestamp: Error converting timestamp to Date:", timestamp, e);
        return null;
    }
}

export default function PartiesListPage() {
  const [allParties, setAllParties] = useState<PartyData[]>([]);
  const [filteredParties, setFilteredParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, firebaseInitialized, initializationFailed, initializationErrorMessage, loading: userLoading } = useFirebase();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q');

  useEffect(() => {
    if (initializationFailed) {
      setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
      setLoading(false);
      return;
    }

    if (!firebaseInitialized || userLoading) {
      setLoading(true);
      return;
    }

    if (!db) {
        setError("La base de données Firestore n'est pas disponible.");
        setLoading(false);
        return;
    }

    const fetchParties = async () => {
      setLoading(true);
      setError(null);
      try {
        const partiesCollectionRef = collection(db, 'parties');
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            setAllParties([]);
        } else {
            const partiesData = querySnapshot.docs.map(doc => {
                 const data = doc.data();
                 if (!data.name || typeof data.name !== 'string' || !data.date || (typeof data.date !== 'object') || !data.createdAt || (typeof data.createdAt !== 'object')) {
                    return null;
                 }
                 const partyObject: PartyData = {
                     id: doc.id,
                     name: data.name,
                     description: data.description || undefined,
                     date: data.date,
                     location: data.location || undefined,
                     coverPhotoUrl: data.coverPhotoUrl || undefined,
                     ratings: data.ratings || {},
                     comments: data.comments || [],
                     createdAt: data.createdAt,
                 };
                 return partyObject;
            }).filter(party => party !== null) as PartyData[];
            setAllParties(partiesData);
        }
      } catch (fetchError: any) {
         let userFriendlyError = 'Impossible de charger la liste des fêtes.';
         if (fetchError instanceof FirestoreError) {
             if (fetchError.code === 'permission-denied') {
                 userFriendlyError = 'Permission refusée. Vérifiez les règles de sécurité Firestore pour la collection "parties".';
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
        setAllParties([]);
      } finally {
        setLoading(false);
      }
    };
    fetchParties();
  }, [firebaseInitialized, initializationFailed, initializationErrorMessage, userLoading]);

  useEffect(() => {
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      setFilteredParties(
        allParties.filter(party =>
          party.name.toLowerCase().includes(lowercasedQuery) ||
          (party.description && party.description.toLowerCase().includes(lowercasedQuery)) ||
          (party.location && party.location.toLowerCase().includes(lowercasedQuery))
        )
      );
    } else {
      setFilteredParties(allParties);
    }
  }, [searchQuery, allParties]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex justify-between items-center mb-8">
            <Skeleton className="h-8 w-1/3 bg-muted" />
            <Skeleton className="h-9 w-36 bg-muted" />
        </div>
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
     const displayError = error;
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
           <AlertTitle>Erreur</AlertTitle>
           <AlertDescription>
                {displayError}
                {error?.includes("Permission refusée") && (
                    <p className="mt-2 text-xs">
                       Conseil : Vérifiez que vous êtes connecté et que les règles de sécurité Firestore pour la collection `/parties` autorisent l'opération `list` ou `get`.
                    </p>
                )}
            </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-primary flex items-center">
              {searchQuery ? <Search className="mr-2 h-7 w-7"/> : null}
              {searchQuery ? `Résultats pour "${searchQuery}"` : "Tous les Événements"}
            </h1>
             {user && (
                <Link href="/events/create" passHref>
                    <Button>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Créer un Event
                    </Button>
                </Link>
             )}
        </div>
      {filteredParties.length === 0 ? (
         <div className="text-center py-10">
             <p className="text-muted-foreground text-lg">
               {searchQuery ? `Aucun événement trouvé pour "${searchQuery}".` : "Aucun événement trouvé pour le moment."}
             </p>
              {user && (
                 <p className="text-muted-foreground mt-2">Soyez le premier à <Link href="/events/create" className="text-primary hover:underline">créer un événement</Link> !</p>
              )}
              {!user && (
                 <p className="text-muted-foreground mt-2"><Link href="/auth" className="text-primary hover:underline">Connectez-vous</Link> pour voir ou créer des événements.</p>
              )}
         </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredParties.map((party) => {
            const partyDate: Date | null = getDateFromTimestamp(party.date);
            const averageRating = calculateAverageRating(party.ratings);
            const commentCount = party.comments?.length || 0;
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
                           unoptimized={party.coverPhotoUrl.includes('localhost') || !party.coverPhotoUrl.startsWith('https')}
                          data-ai-hint="couverture fête événement"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                           <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}
                       {averageRating > 0 && (
                         <Badge variant="secondary" className="absolute top-2 right-2 backdrop-blur-sm bg-black/50 border-white/20 text-sm px-2 py-0.5">
                            <Star className="h-3 w-3 text-yellow-400 fill-current mr-1" />
                            {averageRating.toFixed(1)}
                         </Badge>
                       )}
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
                        {party.name || "Événement sans nom"}
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
