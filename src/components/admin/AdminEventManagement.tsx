// src/components/admin/AdminEventManagement.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, writeBatch, query, orderBy, Timestamp, collectionGroup } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Users, CalendarDays, Image as LucideImage, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogUITitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle as AlertUITitleComponent } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { PartyData as SharedPartyData } from '@/lib/party-utils';
import { getDateFromTimestamp as sharedGetDateFromTimestamp } from '@/lib/party-utils';
import NextImage from 'next/image';
import { useFirebase } from '@/context/FirebaseContext';

type PartyData = SharedPartyData & { id: string };
const getDateFromTimestamp = sharedGetDateFromTimestamp;

interface AdminEventManagementProps {
  onUpdateCounts: (counts: { events: number; comments: number; media: number }) => void;
}

export function AdminEventManagement({ onUpdateCounts }: AdminEventManagementProps) {
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAdmin, firebaseInitialized, loading: authLoading, user } = useFirebase();

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PartyData | null>(null);

  const fetchParties = useCallback(async () => {
    console.log("[AdminEventManagement] fetchParties called. isAdmin:", isAdmin, "db available:", !!db);
    setLoading(true);
    setError(null);
    if (!db) {
      setError("Firestore n'est pas initialisé.");
      setLoading(false);
      console.error("[AdminEventManagement] Firestore 'db' instance is null.");
      return;
    }
    try {
      const partiesCollectionRef = collection(db, 'parties');
      // Temporairement commenter orderBy pour tester
      // const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
      const q = query(partiesCollectionRef); // Requête simplifiée
      console.log("[AdminEventManagement] Executing Firestore query for parties...");
      const querySnapshot = await getDocs(q);
      console.log(`[AdminEventManagement] Firestore query executed. Found ${querySnapshot.size} party documents.`);

      if (querySnapshot.empty) {
        console.log("[AdminEventManagement] No parties found in 'parties' collection.");
        setParties([]);
      } else {
        const fetchedParties = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
        console.log(`[AdminEventManagement] Mapped parties data: ${fetchedParties.length} items.`);
        setParties(fetchedParties);
      }
      
      // Recalculer les totaux même si la liste des fêtes est vide (pour mettre à jour à 0 si besoin)
      let totalComments = 0;
      let totalMedia = 0;
      const allFetchedPartiesForCounts = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));

      for (const party of allFetchedPartiesForCounts) {
        const commentsSnapshot = await getDocs(collection(db, 'parties', party.id, 'comments'));
        totalComments += commentsSnapshot.size;
        totalMedia += (party.mediaItems?.length || 0);
      }
      console.log(`[AdminEventManagement] Updating counts: events=${allFetchedPartiesForCounts.length}, comments=${totalComments}, media=${totalMedia}`);
      onUpdateCounts({ events: allFetchedPartiesForCounts.length, comments: totalComments, media: totalMedia });

    } catch (e: any) {
      console.error("[AdminEventManagement] Erreur chargement fêtes:", e);
      let userFriendlyError = "Impossible de charger les événements. ";
      if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('insufficient permissions')) {
          userFriendlyError += "Permission refusée. Vérifiez les règles Firestore pour la collection 'parties'.";
           console.error("[AdminEventManagement] Firestore Permission Denied. Details:", e);
      } else if (e.message?.includes('requires an index')) {
          userFriendlyError += "Un index Firestore est requis. Veuillez vérifier la console Firebase pour le créer. Détails: " + e.message;
           console.error("[AdminEventManagement] Firestore Index Missing. Details:", e);
      } else {
          userFriendlyError += e.message;
      }
      setError(userFriendlyError);
    } finally {
      setLoading(false);
      console.log("[AdminEventManagement] fetchParties finished.");
    }
  }, [onUpdateCounts, isAdmin]); // Ajout de isAdmin comme dépendance de useCallback


  useEffect(() => {
    console.log("[AdminEventManagement useEffect] State Check - Initialized:", firebaseInitialized, "Auth Loading:", authLoading, "Is Admin:", isAdmin, "User:", !!user);
    if (firebaseInitialized && !authLoading) { // Wait for auth state and firebase init
        if (isAdmin && db) {
            console.log("[AdminEventManagement useEffect] Admin and DB ready, calling fetchParties.");
            fetchParties();
        } else if (!isAdmin && user) { // User is logged in but not admin
            console.warn("[AdminEventManagement useEffect] User is not admin.");
            setError("Accès non autorisé à la gestion des événements.");
            setLoading(false);
        } else if (!user && !authLoading) { // User is not logged in
             console.warn("[AdminEventManagement useEffect] User not logged in.");
             setError("Veuillez vous connecter pour accéder à cette section.");
             setLoading(false);
        } else if (!db) {
            console.error("[AdminEventManagement useEffect] Firestore 'db' instance is null when trying to fetch parties.");
            setError("Firestore n'est pas initialisé pour la gestion des événements.");
            setLoading(false);
        }
    } else {
        console.log("[AdminEventManagement useEffect] Waiting for Firebase init or auth state.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, firebaseInitialized, authLoading, user]); // fetchParties est maintenant stable grâce à useCallback


  const openDeleteDialog = (party: PartyData) => {
    setItemToDelete(party);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db || !isAdmin) {
      toast({ title: 'Erreur', description: 'Action non autorisée ou données manquantes.', variant: 'destructive' });
      setIsDeleting(false);
      setDialogOpen(false);
      setItemToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      const partyDocRef = doc(db, 'parties', itemToDelete.id);
      
      const commentsRef = collection(db, 'parties', itemToDelete.id, 'comments');
      const commentsSnapshot = await getDocs(commentsRef);
      
      const batch = writeBatch(db);
      commentsSnapshot.forEach(commentDoc => {
        batch.delete(commentDoc.ref);
      });
      
      batch.delete(partyDocRef);
      
      await batch.commit();

      const updatedParties = parties.filter(p => p.id !== itemToDelete.id);
      setParties(updatedParties);
      
      // Recalculer les compteurs globaux de commentaires et médias
      let totalCommentsAfterDelete = 0;
      let totalMediaAfterDelete = 0;
      for (const party of updatedParties) { // Itérer sur les fêtes restantes
        const remainingCommentsSnap = await getDocs(collection(db, 'parties', party.id, 'comments'));
        totalCommentsAfterDelete += remainingCommentsSnap.size;
        totalMediaAfterDelete += (party.mediaItems?.length || 0);
      }

      onUpdateCounts({ events: updatedParties.length, comments: totalCommentsAfterDelete, media: totalMediaAfterDelete });
      
      toast({ title: 'Événement supprimé', description: `L'événement "${itemToDelete.name}" et ses données associées ont été supprimés.` });
    } catch (error: any) {
      console.error(`Erreur lors de la suppression de l'événement:`, error);
      toast({ title: 'Erreur de suppression', description: `Impossible de supprimer "${itemToDelete.name}". ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDialogOpen(false);
      setItemToDelete(null);
    }
  };

  if (loading || authLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-16 w-16 rounded-md bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertUITitleComponent>Erreur de Chargement</AlertUITitleComponent>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Events ({parties.length})</CardTitle>
          <CardDescription>Gérer les entrées d'événements.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {parties.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement trouvé.</p>}
          {parties.map((party) => (
            <div key={party.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30 hover:border-primary/50 transition-colors duration-200">
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                {party.coverPhotoUrl ? (
                  <NextImage src={party.coverPhotoUrl} alt={party.name} width={64} height={64} className="h-16 w-16 rounded-md object-cover bg-muted" data-ai-hint="événement fête"/>
                ) : (
                  <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                    <LucideImage className="h-8 w-8" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" title={party.name}>{party.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="w-3 h-3"/> Date : {getDateFromTimestamp(party.date)?.toLocaleDateString()} | Par : {party.creatorEmail || party.createdBy}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button variant="destructive" size="sm" className="ml-4 flex-shrink-0" onClick={() => openDeleteDialog(party)}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogUITitle>Êtes-vous sûr de vouloir supprimer cet événement ?</AlertDialogUITitle>
            <AlertDialogDescription>
              Nom : {itemToDelete?.name} <br />
              La suppression d'un événement entraînera la suppression de tous ses commentaires et médias associés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)} disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting || !isAdmin} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
