// src/app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Users, MessageSquare, Image as LucideImage, FileText, CalendarDays, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Loader2 } from 'lucide-react';
import { AdminUserManagement } from '@/components/admin/AdminUserManagement';
import { AdminEventManagement } from '@/components/admin/AdminEventManagement';
import { AdminCommentManagement } from '@/components/admin/AdminCommentManagement';
import { AdminMediaManagement } from '@/components/admin/AdminMediaManagement';
import { AdminHeroImageManagement } from '@/components/admin/AdminHeroImageManagement';


export default function AdminPage() {
  const { user, isAdmin, loading: authLoading, firebaseInitialized } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [counts, setCounts] = useState({ users: 0, events: 0, comments: 0, media: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);


  useEffect(() => {
    // Attendre que l'état d'authentification et l'initialisation de Firebase soient terminés
    if (!authLoading && firebaseInitialized) {
      setInitialLoadComplete(true); // Marquage que la vérification initiale est terminée
      if (!isAdmin) {
        toast({ title: 'Accès Refusé', description: "Vous n'êtes pas autorisé à accéder à cette page.", variant: 'destructive' });
        router.push('/');
      }
    }
  }, [user, isAdmin, authLoading, router, toast, firebaseInitialized]);


  const updateCounts = (newCounts: Partial<typeof counts>) => {
    setCounts(prev => ({ ...prev, ...newCounts }));
  };

  useEffect(() => {
    // Charger les comptes initiaux seulement si l'utilisateur est admin et que firebase est prêt
    if(isAdmin && firebaseInitialized && db) {
        const fetchInitialCounts = async () => {
            setLoadingCounts(true);
            try {
                const usersSnap = await getDocs(collection(db, 'users'));
                const partiesSnap = await getDocs(collection(db, 'parties'));
                let commentsCount = 0;
                let mediaCount = 0;

                for (const partyDoc of partiesSnap.docs) {
                    const commentsRef = collection(db, 'parties', partyDoc.id, 'comments');
                    const commentsSnap = await getDocs(commentsRef);
                    commentsCount += commentsSnap.size;
                    mediaCount += (partyDoc.data().mediaItems?.length || 0);
                }
                setCounts({
                    users: usersSnap.size,
                    events: partiesSnap.size,
                    comments: commentsCount,
                    media: mediaCount
                });
            } catch (error) {
                console.error("Erreur chargement des comptes initiaux:", error);
                toast({title: "Erreur de comptage", description: "Impossible de charger les statistiques initiales.", variant: "destructive"});
            } finally {
                setLoadingCounts(false);
            }
        };
        fetchInitialCounts();
    } else if (initialLoadComplete && !isAdmin) {
        // Si la vérification initiale est terminée et l'utilisateur n'est PAS admin
        setLoadingCounts(false); // Arrêter le chargement des compteurs, car il n'y a rien à charger
    } else if (!firebaseInitialized && !authLoading) {
        // Si Firebase n'est pas initialisé et que l'auth n'est pas en cours de chargement (ex: erreur Firebase)
        setLoadingCounts(false);
    }
  }, [isAdmin, firebaseInitialized, toast, authLoading, initialLoadComplete]);


  // Afficher le loader tant que l'état d'auth/firebase n'est pas résolu OU si l'admin charge les compteurs
  if (authLoading || !firebaseInitialized || (isAdmin && loadingCounts && !initialLoadComplete) || (!initialLoadComplete && !isAdmin) ) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /> Chargement de la page Admin...</div>;
  }

  // Si après le chargement initial, l'utilisateur n'est pas admin, afficher l'accès refusé.
  if (!isAdmin) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Accès refusé. Redirection...</div>;
  }


  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
        <Badge variant="destructive"><ShieldAlert className="w-4 h-4 mr-1" /> Accès Admin</Badge>
      </div>

      {/* Section Récapitulatif */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.users}</div>
          </CardContent>
        </Card>
         <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Events</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.events}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commentaires</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.comments}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Médias (Souvenirs)</CardTitle>
            <LucideImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.media}</div>
          </CardContent>
        </Card>
      </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AdminUserManagement onUpdateCounts={updateCounts} />
        <AdminEventManagement onUpdateCounts={updateCounts} />
        <AdminCommentManagement onUpdateCounts={updateCounts} />
        <AdminMediaManagement onUpdateCounts={updateCounts} />
        <div className="lg:col-span-2">
          <AdminHeroImageManagement />
        </div>
      </div>
    </div>
  );
}