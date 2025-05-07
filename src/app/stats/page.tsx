// src/app/stats/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle as AlertUITitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Users, Image as ImageIcon, CalendarCheck2, Star, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import type { PartyData as SharedPartyData } from '@/lib/party-utils';
// calculatePartyAverageRating is not used here, getDateFromTimestamp might be if displaying dates
import { StatCard } from '@/components/stats/StatCard';
import { GlobalRatingDistributionChart } from '@/components/stats/GlobalRatingDistributionChart';
import dynamic from 'next/dynamic'; // Import dynamic for client-side map rendering

type PartyData = SharedPartyData & { id: string };

interface StatsData {
  numberOfEvents: number;
  numberOfUsers: number;
  numberOfSouvenirs: number;
  averageGlobalRating: number;
  allParties: PartyData[]; 
}

// Dynamically import the EventMap component to ensure it only runs on the client-side
const EventMapWithNoSSR = dynamic(() => 
  import('@/components/stats/EventMap').then(mod => mod.EventMap), 
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground"><MapPin className="h-12 w-12 mr-2 animate-pulse" />Chargement de la carte...</div> }
);

export default function StatisticsPage() {
  const { firebaseInitialized, loading: authLoading } = useFirebase();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseInitialized || authLoading) {
      return;
    }
    if (!db) {
      setError("La base de données Firestore n'est pas disponible.");
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const partiesCollectionRef = collection(db, 'parties');
        const usersCollectionRef = collection(db, 'users');

        const [partiesSnapshot, usersSnapshot] = await Promise.all([
          getDocs(query(partiesCollectionRef, orderBy('createdAt', 'desc'))),
          getDocs(usersCollectionRef),
        ]);

        const fetchedParties: PartyData[] = partiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartyData));
        const numberOfUsers = usersSnapshot.size;

        let numberOfSouvenirs = 0;
        let totalRatingSum = 0;
        let totalRatingsCount = 0;

        fetchedParties.forEach(party => {
          numberOfSouvenirs += (party.mediaItems?.length || 0);
          if (party.ratings) {
            const partyRatings = Object.values(party.ratings);
            partyRatings.forEach(rating => {
              totalRatingSum += rating;
              totalRatingsCount++;
            });
          }
        });
        
        // Ratings are on a 0-10 scale, average should be /10, then /2 for /5 display
        const averageGlobalRating = totalRatingsCount > 0 ? (totalRatingSum / totalRatingsCount / 2) : 0;


        setStats({
          numberOfEvents: fetchedParties.length,
          numberOfUsers: numberOfUsers,
          numberOfSouvenirs: numberOfSouvenirs,
          averageGlobalRating: averageGlobalRating,
          allParties: fetchedParties,
        });

      } catch (e: any) {
        console.error("Erreur lors de la récupération des statistiques:", e);
        setError("Impossible de charger les statistiques. " + e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [firebaseInitialized, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Skeleton className="h-8 w-1/3 mb-8 bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-6 w-6 rounded-sm" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-1/3 mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card border-border"><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
            <Card className="bg-card border-border"><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertUITitle>Erreur</AlertUITitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Aucune statistique à afficher pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <BarChart3 className="h-7 w-7" /> Statistiques Générales
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title="Nombre d'Events" value={stats.numberOfEvents} icon={CalendarCheck2} />
        <StatCard title="Nombre de Membres" value={stats.numberOfUsers} icon={Users} />
        <StatCard title="Nombre de Souvenirs" value={stats.numberOfSouvenirs} icon={ImageIcon} />
        <StatCard title="Note Moyenne Globale" value={`${stats.averageGlobalRating.toFixed(1)} / 5`} icon={Star} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-card border-border shadow-lg">
          <CardHeader>
            <CardTitle>Répartition des Notes Globales</CardTitle>
            <CardDescription>Distribution de toutes les notes attribuées aux événements (échelle 0.5 - 5).</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px]">
            {stats.allParties.length > 0 ? (
              <GlobalRatingDistributionChart allParties={stats.allParties} />
            ) : (
              <p className="text-muted-foreground text-center py-10">Pas assez de données pour afficher la répartition des notes.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Carte des Événements</CardTitle>
            <CardDescription>Visualisation géographique des événements.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px] p-0 rounded-b-lg overflow-hidden"> {/* Adjusted padding and overflow */}
            {stats.allParties.length > 0 ? (
                <EventMapWithNoSSR parties={stats.allParties} />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-muted">
                    <MapPin className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Aucun événement avec localisation</p>
                    <p className="text-sm">Ajoutez des lieux à vos événements pour les afficher ici.</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
