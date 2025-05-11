// src/components/admin/AdminCommentManagement.tsx
'use client';

import { useEffect, useState } from 'react';
import { collectionGroup, getDocs, doc, deleteDoc, orderBy, Timestamp, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Trash2, Loader2, User, CalendarDays, FileText } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogUITitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle as AlertUITitleComponent } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommentData as SharedCommentData } from '@/lib/party-utils';
import { getDateFromTimestamp as sharedGetDateFromTimestamp } from '@/lib/party-utils';
import Link from 'next/link';
import { useFirebase } from '@/context/FirebaseContext';

type CommentData = SharedCommentData & { id: string, partyId: string }; // Ensure partyId is present for linking
const getDateFromTimestamp = sharedGetDateFromTimestamp;

interface AdminCommentManagementProps {
  onUpdateCounts: (counts: { comments: number }) => void;
}

export function AdminCommentManagement({ onUpdateCounts }: AdminCommentManagementProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAdmin, firebaseInitialized, loading: authLoading } = useFirebase(); // Added firebaseInitialized and authLoading

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CommentData | null>(null);

  const fetchComments = async () => {
    setLoading(true);
    setError(null);
    if (!db) {
      setError("Firestore n'est pas initialisé.");
      setLoading(false);
      return;
    }
    try {
      const commentsQuery = query(collectionGroup(db, 'comments'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(commentsQuery);
      const fetchedComments = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const partyId = docSnap.ref.parent.parent?.id || 'unknown';
        return { id: docSnap.id, partyId, ...data } as CommentData;
      });
      setComments(fetchedComments);
      onUpdateCounts({ comments: fetchedComments.length });
    } catch (e: any) {
      console.error("Erreur chargement commentaires:", e);
      let userFriendlyError = "Impossible de charger les commentaires. ";
       if (e.code === 'permission-denied' || e.message?.includes('permission-denied') || e.message?.includes('insufficient permissions')) {
           userFriendlyError += "Permission refusée. Vérifiez les règles Firestore pour le groupe de collection 'comments'.";
       } else if (e.message?.includes('requires an index')) {
           userFriendlyError += "Un index Firestore est requis. " + e.message;
       } else {
           userFriendlyError += e.message;
       }
      setError(userFriendlyError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && firebaseInitialized) { // Wait for auth state and firebase init
        if (isAdmin && db) {
            fetchComments();
        } else if (!isAdmin) {
            setError("Accès non autorisé à la gestion des commentaires.");
            setLoading(false);
        } else if (!db) {
            setError("Firestore n'est pas initialisé pour la gestion des commentaires.");
            setLoading(false);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, db, firebaseInitialized, authLoading]); // Added firebaseInitialized and authLoading

  const openDeleteDialog = (comment: CommentData) => {
    setItemToDelete(comment);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db || !isAdmin) {
      toast({ title: 'Erreur', description: 'Action non autorisée ou données manquantes.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      const commentDocRef = doc(db, 'parties', itemToDelete.partyId, 'comments', itemToDelete.id);
      await deleteDoc(commentDocRef);

      setComments(prev => prev.filter(c => c.id !== itemToDelete.id));
      onUpdateCounts({ comments: comments.length - 1 });
      toast({ title: 'Commentaire supprimé', description: `Le commentaire a été supprimé.` });
    } catch (error: any) {
      console.error(`Erreur lors de la suppression du commentaire:`, error);
      toast({ title: 'Erreur de suppression', description: `Impossible de supprimer le commentaire. ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDialogOpen(false);
      setItemToDelete(null);
    }
  };
  
  if (loading || authLoading) { // Consider authLoading as well for initial load state
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-9 w-24 ml-4" />
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
          <CardTitle className="text-destructive flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Commentaires</CardTitle>
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
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Commentaires ({comments.length})</CardTitle>
          <CardDescription>Gérer les commentaires des utilisateurs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {comments.length === 0 && <p className="text-sm text-muted-foreground">Aucun commentaire trouvé.</p>}
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start justify-between p-3 bg-secondary rounded-lg border border-border/30 hover:border-primary/50 transition-colors duration-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate italic">"{comment.text}"</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <User className="w-3 h-3"/> Par : {comment.email}
                  <span className="mx-1">|</span>
                  <CalendarDays className="w-3 h-3"/> Le : {getDateFromTimestamp(comment.timestamp)?.toLocaleDateString()}
                  <span className="mx-1">|</span>
                  <FileText className="w-3 h-3"/> Sur : <Link href={`/party/${comment.partyId}`} className="hover:underline text-primary">{comment.partyName || comment.partyId}</Link>
                </p>
              </div>
              {isAdmin && (
                <Button variant="destructive" size="sm" className="ml-4 flex-shrink-0" onClick={() => openDeleteDialog(comment)}>
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
            <AlertDialogUITitle>Êtes-vous sûr de vouloir supprimer ce commentaire ?</AlertDialogUITitle>
            <AlertDialogDescription>
              Texte : "{itemToDelete?.text.substring(0, 100)}{itemToDelete && itemToDelete.text.length > 100 ? '...' : ''}" <br />
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
