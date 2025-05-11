// src/components/admin/AdminMediaManagement.tsx
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, arrayRemove, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as LucideImage, Video, Music, Trash2, Loader2, FileText, CalendarDays, User, Link as LinkIcon } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogUITitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle as AlertUITitleComponent } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { PartyData as SharedPartyData, MediaItem as SharedMediaItem } from '@/lib/party-utils';
import { getDateFromTimestamp as sharedGetDateFromTimestamp } from '@/lib/party-utils';
import NextImage from 'next/image'; // Using NextImage for optimized images
import Link from 'next/link';
import { useFirebase } from '@/context/FirebaseContext';

type PartyData = SharedPartyData & { id: string };
type MediaItem = SharedMediaItem;
const getDateFromTimestamp = sharedGetDateFromTimestamp;

interface AdminMediaManagementProps {
  onUpdateCounts: (counts: { media: number }) => void;
}

interface MediaItemWithPartyContext extends MediaItem {
  partyId: string;
  partyName: string;
}

export function AdminMediaManagement({ onUpdateCounts }: AdminMediaManagementProps) {
  const [allMedia, setAllMedia] = useState<MediaItemWithPartyContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAdmin } = useFirebase();

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItemWithPartyContext | null>(null);

  const fetchAllMedia = async () => {
    setLoading(true);
    setError(null);
    if (!db) {
      setError("Firestore n'est pas initialisé.");
      setLoading(false);
      return;
    }
    try {
      const partiesSnapshot = await getDocs(query(collection(db, 'parties'), orderBy('createdAt', 'desc')));
      let fetchedMedia: MediaItemWithPartyContext[] = [];
      partiesSnapshot.forEach(partyDoc => {
        const partyData = partyDoc.data() as PartyData;
        if (partyData.mediaItems && partyData.mediaItems.length > 0) {
          partyData.mediaItems.forEach(media => {
            fetchedMedia.push({
              ...media,
              partyId: partyDoc.id,
              partyName: partyData.name
            });
          });
        }
      });
      // Sort all media items by uploadedAt date, most recent first
      fetchedMedia.sort((a, b) => {
        const timeA = getDateFromTimestamp(a.uploadedAt)?.getTime() || 0;
        const timeB = getDateFromTimestamp(b.uploadedAt)?.getTime() || 0;
        return timeB - timeA;
      });

      setAllMedia(fetchedMedia);
      onUpdateCounts({ media: fetchedMedia.length });

    } catch (e: any) {
      console.error("Erreur chargement médias:", e);
      setError("Impossible de charger les médias. " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMedia();
  }, []);

  const openDeleteDialog = (mediaItem: MediaItemWithPartyContext) => {
    setItemToDelete(mediaItem);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db || !isAdmin) {
      toast({ title: 'Erreur', description: 'Action non autorisée ou données manquantes.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      const partyDocRef = doc(db, 'parties', itemToDelete.partyId);
      // We need the exact object to remove from the array.
      // Firestore's arrayRemove requires the full object to match.
      // If IDs are truly unique, this should be okay.
      // If not, more complex logic would be needed (fetch doc, filter, then update).
      await updateDoc(partyDocRef, {
        mediaItems: arrayRemove(itemToDelete) // This removes the item IF it matches exactly.
      });

      setAllMedia(prev => prev.filter(m => m.id !== itemToDelete.id));
      onUpdateCounts({ media: allMedia.length -1 });
      toast({ title: 'Média supprimé', description: `Le média "${itemToDelete.fileName || itemToDelete.id}" a été supprimé.` });
    } catch (error: any) {
      console.error(`Erreur lors de la suppression du média:`, error);
      toast({ title: 'Erreur de suppression', description: `Impossible de supprimer "${itemToDelete.fileName || itemToDelete.id}". ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const renderMediaIcon = (type: MediaItem['type']) => {
    if (type === 'video') return <Video className="h-6 w-6" />;
    if (type === 'audio') return <Music className="h-6 w-6" />;
    return <LucideImage className="h-6 w-6" />;
  }

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-12 w-12 rounded-md bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32" />
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
          <CardTitle className="text-destructive flex items-center gap-2"><LucideImage className="h-5 w-5" /> Médias (Souvenirs)</CardTitle>
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
          <CardTitle className="flex items-center gap-2"><LucideImage className="h-5 w-5" /> Médias (Souvenirs) ({allMedia.length})</CardTitle>
          <CardDescription>Gérer les photos, vidéos et sons des événements.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {allMedia.length === 0 && <p className="text-sm text-muted-foreground">Aucun média trouvé.</p>}
          {allMedia.map((media) => (
            <div key={media.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30 hover:border-primary/50 transition-colors duration-200">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground overflow-hidden">
                  {media.type === 'image' && media.url ? (
                    <NextImage src={media.url} alt={media.fileName || 'Souvenir'} width={48} height={48} className="object-cover" data-ai-hint="souvenir fête" />
                  ) : (
                    renderMediaIcon(media.type)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" title={media.fileName || media.id}>
                    {media.fileName || media.id}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                    <User className="w-3 h-3"/> {media.uploaderEmail || 'Inconnu'}
                    <span className="mx-1">|</span>
                    <CalendarDays className="w-3 h-3"/> {getDateFromTimestamp(media.uploadedAt)?.toLocaleDateString()}
                    <span className="mx-1">|</span>
                    <LinkIcon className="w-3 h-3"/> <Link href={`/party/${media.partyId}`} className="hover:underline text-primary truncate">{media.partyName}</Link>
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button variant="destructive" size="sm" className="ml-4 flex-shrink-0" onClick={() => openDeleteDialog(media)}>
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
            <AlertDialogUITitle>Êtes-vous sûr de vouloir supprimer ce média ?</AlertDialogUITitle>
            <AlertDialogDescription>
              Fichier : {itemToDelete?.fileName || itemToDelete?.id} <br/>
              Appartenant à l'événement : {itemToDelete?.partyName} <br />
              Cette action est irréversible.
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
