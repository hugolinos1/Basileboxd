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
    if (!timestamp) {
        console.warn("getDateFromTimestamp: Timestamp is undefined or null.");
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
             console.warn("getDateFromTimestamp: Unrecognized timestamp format:", timestamp);
            return null;
        }
    } catch (e) {
        console.error("getDateFromTimestamp: Error converting timestamp to Date:", timestamp, e);
        return null;
    }
}


export default function PartiesListPage() {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { firebaseInitialized, initializationFailed, initializationErrorMessage } = useFirebase(); // Use context for initialization status

  useEffect(() => {
    console.log("[PartiesListPage useEffect] Déclenché. Firebase Initialisé:", firebaseInitialized, "Échec Init:", initializationFailed);

    if (initializationFailed) {
        console.error("[PartiesListPage useEffect] Échec de l'initialisation de Firebase. Définition de l'état d'erreur.");
        setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
        setLoading(false);
        return;
    }

    if (!firebaseInitialized) {
        console.log("[PartiesListPage useEffect] Firebase pas encore initialisé, en attente...");
        setLoading(true); // Garder le chargement pendant l'attente
        return;
    }

    if (!db) {
        console.error("[PartiesListPage useEffect] Instance Firestore 'db' est nulle même si Firebase est initialisé. Définition de l'état d'erreur.");
        setError("La base de données Firestore n'est pas disponible.");
        setLoading(false);
        return;
    }

    const fetchParties = async () => {
      console.log("[fetchParties] Début de la récupération. loading=true, error=null.");
      setLoading(true);
      setError(null); // Réinitialiser l'erreur avant *cette* tentative de récupération

      try {
        console.log("[fetchParties] Accès à la collection Firestore 'parties'...");
        const partiesCollectionRef = collection(db, 'parties');
        const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));

        console.log("[fetchParties] Exécution de la requête Firestore...");
        const querySnapshot = await getDocs(q);
        console.log(`[fetchParties] Requête Firestore exécutée. Trouvé ${querySnapshot.size} documents. Est vide: ${querySnapshot.empty}`);

        if (querySnapshot.empty) {
            console.log("[fetchParties] Aucune fête trouvée dans la collection.");
            setParties([]);
        } else {
            console.log("[fetchParties] Mappage des documents vers PartyData...");
            const partiesData = querySnapshot.docs.map(doc => {
                 const data = doc.data();
                 console.log(`[fetchParties Mapping] ID Doc: ${doc.id}, Données brutes:`, JSON.stringify(data, null, 2)); // Log raw data more clearly

                 // Validation plus robuste
                 if (!data.name || typeof data.name !== 'string') {
                    console.warn(`[fetchParties Mapping] Document ${doc.id} : champ 'name' manquant ou invalide. Ignoré.`);
                    return null;
                 }
                 if (!data.date || (typeof data.date !== 'object')) { // Check if date exists and is an object (Timestamp or FirestoreTimestamp)
                    console.warn(`[fetchParties Mapping] Document ${doc.id} : champ 'date' manquant ou invalide. Ignoré.`);
                    return null;
                 }
                  if (!data.createdAt || (typeof data.createdAt !== 'object')) { // Check createdAt similarly
                    console.warn(`[fetchParties Mapping] Document ${doc.id} : champ 'createdAt' manquant ou invalide. Ignoré.`);
                    return null;
                 }

                  // Tentative de conversion de date avec gestion d'erreur
                  const partyDate = getDateFromTimestamp(data.date);
                  if (!partyDate) {
                       console.warn(`[fetchParties Mapping] Document ${doc.id} : impossible de convertir 'date'. Ignoré.`);
                       return null;
                  }
                 const createdAtDate = getDateFromTimestamp(data.createdAt);
                 if (!createdAtDate) {
                      console.warn(`[fetchParties Mapping] Document ${doc.id} : impossible de convertir 'createdAt'. Ignoré.`);
                      return null;
                 }


                 // Créer l'objet PartyData final
                 const partyObject: PartyData = {
                     id: doc.id,
                     name: data.name,
                     description: data.description || undefined,
                     date: data.date, // Garder le format original pour le moment, la conversion a été validée
                     location: data.location || undefined,
                     coverPhotoUrl: data.coverPhotoUrl || undefined,
                     ratings: data.ratings || {},
                     createdAt: data.createdAt, // Garder le format original
                 };
                  console.log(`[fetchParties Mapping] Document ${doc.id} mappé avec succès :`, partyObject);
                 return partyObject;

            }).filter(party => party !== null) as PartyData[]; // Filtrer les documents ignorés

            console.log("[fetchParties] Données des fêtes mappées:", partiesData);
            setParties(partiesData);
            console.log(`[fetchParties] État des fêtes mis à jour avec ${partiesData.length} éléments.`);
        }

      } catch (fetchError: any) {
        console.error('[fetchParties] Erreur lors de la requête Firestore ou du mappage:', fetchError);
         let userFriendlyError = 'Impossible de charger la liste des fêtes.';
         if (fetchError instanceof FirestoreError) {
             if (fetchError.code === 'permission-denied') {
                 userFriendlyError = 'Permission refusée. Vérifiez les règles de sécurité Firestore pour la collection "parties".';
                 console.error("Permission Firestore refusée : Vérifiez vos règles de sécurité pour la collection 'parties'.");
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
        setParties([]); // Assurer que l'état des fêtes est vide en cas d'erreur
      } finally {
        console.log("[fetchParties] Tentative de récupération terminée. loading=false.");
        setLoading(false);
      }
    };

    fetchParties();

  }, [firebaseInitialized, initializationFailed, initializationErrorMessage]); // Dépendances


  // --- Logique de Rendu ---

  console.log("[PartiesListPage Rendu] Chargement:", loading, "Erreur:", error, "Nombre de fêtes:", parties.length, "Firebase Initialisé:", firebaseInitialized, "Échec Init:", initializationFailed);


    // Afficher Skeleton uniquement si chargement en cours ET l'initialisation n'a *pas* échoué
    if (loading && !initializationFailed) {
      console.log("[PartiesListPage Rendu] Affichage du Skeleton Loader.");
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

  // Afficher l'alerte d'erreur si l'initialisation a échoué OU une erreur de récupération s'est produite
  if (initializationFailed || error) {
     const displayError = initializationFailed ? (initializationErrorMessage || "Échec de l'initialisation de Firebase.") : (error || "Une erreur inconnue est survenue.");
     console.log("[PartiesListPage Rendu] Affichage de l'Alerte d'Erreur:", displayError);
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

  // Afficher la liste des fêtes uniquement si *pas* en chargement et *aucune* erreur
  console.log("[PartiesListPage Rendu] Affichage de la liste des fêtes.");
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
            // Conversion sécurisée de la date ici dans le map
            const partyDate: Date | null = getDateFromTimestamp(party.date);
            const averageRating = calculateAverageRating(party.ratings);

            // Log pour vérifier les données de chaque fête avant de l'afficher
            console.log(`[PartiesListPage Rendu - map] Affichage de la fête: ${party.id}, Nom: ${party.name}, Date Obj:`, partyDate, "URL Couverture:", party.coverPhotoUrl);

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
                           onError={(e) => console.error(`Erreur de chargement de l'image pour la fête ${party.id}: ${party.coverPhotoUrl}`, e)}
                          data-ai-hint="couverture fête événement"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                           <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}
                       {/* Badge de Note */}
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
                    {/* Optionnel: Ajouter la date de création ou d'autres méta-données */}
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