// src/components/admin/AdminEventManagement.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, writeBatch, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Users, CalendarDays, Image as LucideImage } from 'lucide-react';
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
  const { isAdmin, firebaseInitialized, loading: authLoading } = useFirebase();

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchParties = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!db) {
      setError("Firestore n'est pas initialisé.");
      setLoading(false);
      return;
    }
    try {
      const partiesCollectionRef = collection(db, 'parties');
      const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedParties = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
      setParties(fetchedParties);

      let totalComments = 0;
      let totalMedia = 0;
      for (const party of fetchedParties) {
        const commentsRef = collection(db, 'parties', party.id, 'comments');
        const commentsSnapshot = await getDocs(commentsRef);
        totalComments += commentsSnapshot.size;
        totalMedia += (party.mediaItems?.length || 0);
      }
      onUpdateCounts({ events: fetchedParties.length, comments: totalComments, media: totalMedia });

    } catch (e: any) {
      console.error("Erreur chargement fêtes:", e);
      let userFriendlyError = "Impossible de charger les événements. ";
      if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('insufficient permissions')) {
          userFriendlyError += "Permission refusée. Vérifiez les règles Firestore pour la collection 'parties'.";
      } else if (e.message?.includes('requires an index')) {
          userFriendlyError += "Un index Firestore est requis pour trier les événements par date de création. Veuillez créer cet index dans la console Firebase.";
      } else {
          userFriendlyError += e.message;
      }
      setError(userFriendlyError);
    } finally {
      setLoading(false);
    }
  }, [onUpdateCounts]);


  useEffect(() => {
    if (firebaseInitialized && !authLoading) {
        if (isAdmin && db) {
            fetchParties();
        } else if (!isAdmin) {
            setError("Accès non autorisé à la gestion des événements.");
            setLoading(false);
        } else if (!db) {
            setError("Firestore n'est pas initialisé pour la gestion des événements.");
            setLoading(false);
        }
    }
  }, [fetchParties, isAdmin, firebaseInitialized, authLoading]);


  const openDeleteDialog = (id: string, name: string) => {
    setItemToDelete({ id, name });
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db || !isAdmin) {
      toast({ title: 'Erreur', description: 'Action non autorisée ou données manquantes.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      const partyDocRef = doc(db, 'parties', itemToDelete.id);
      const commentsRef = collection(db, 'parties', itemToDelete.id, 'comments');
      const commentsSnapshot = await getDocs(commentsRef);

      const batch = writeBatch(db);
      commentsSnapshot.forEach(commentDoc => {
        batch.delete(doc(commentsRef, commentDoc.id));
      });
      batch.delete(partyDocRef);
      await batch.commit();

      const updatedParties = parties.filter(p => p.id !== itemToDelete.id);
      setParties(updatedParties);
      
      let totalComments = 0;
      let totalMedia = 0;
      for (const party of updatedParties) {
        const commentsSnapshot = await getDocs(collection(db, 'parties', party.id, 'comments'));
        totalComments += commentsSnapshot.size;
        totalMedia += (party.mediaItems?.length || 0);
      }
      onUpdateCounts({ events: updatedParties.length, comments: totalComments, media: totalMedia });
      
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
          <CardTitle className="text-destructive flex items-center gap-2"><Users className="h-5 w-5" /> Events</CardTitle>
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
              <div className="flex items-center space-x-4">
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
                <Button variant="destructive" size="sm" className="ml-4 flex-shrink-0" onClick={() => openDeleteDialog(party.id, party.name)}>
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
