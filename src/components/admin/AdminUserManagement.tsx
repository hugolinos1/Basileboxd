// src/components/admin/AdminUserManagement.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Trash2, Loader2, Mail, UserCircle, CalendarDays, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogUITitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle as AlertUITitleComponent } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirebase } from '@/context/FirebaseContext';
import { getDateFromTimestamp as sharedGetDateFromTimestamp } from '@/lib/party-utils';

const getDateFromTimestamp = sharedGetDateFromTimestamp;

interface UserDocData {
  id: string; // Firestore document ID
  uid: string;
  email: string;
  displayName?: string;
  pseudo?: string;
  avatarUrl?: string;
  createdAt?: Timestamp;
}

interface AdminUserManagementProps {
  onUpdateCounts: (counts: { users: number }) => void;
}

export function AdminUserManagement({ onUpdateCounts }: AdminUserManagementProps) {
  const [users, setUsers] = useState<UserDocData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAdmin, firebaseInitialized, loading: authLoading, user: adminUser } = useFirebase();

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<UserDocData | null>(null);

  const getInitials = (name: string | null | undefined, email: string): string => {
    if (name && name.length > 0) return name.charAt(0).toUpperCase();
    if (email && email.length > 0) return email.charAt(0).toUpperCase();
    return '?';
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!db) {
      setError("Firestore n'est pas initialisé.");
      setLoading(false);
      return;
    }
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedUsers = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as UserDocData));
      setUsers(fetchedUsers);
      onUpdateCounts({ users: fetchedUsers.length });
    } catch (e: any) {
      console.error("Erreur chargement utilisateurs:", e);
      let userFriendlyError = "Impossible de charger les utilisateurs. ";
      if (e.code === 'permission-denied') {
          userFriendlyError += "Permission refusée. Vérifiez les règles Firestore pour la collection 'users'.";
      } else if (e.message?.includes('requires an index')) {
          userFriendlyError += "Un index Firestore est requis. " + e.message;
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
            fetchUsers();
        } else if (!isAdmin && adminUser) {
            setError("Accès non autorisé à la gestion des utilisateurs.");
            setLoading(false);
        }  else if (!db) {
            setError("Firestore n'est pas initialisé pour la gestion des utilisateurs.");
            setLoading(false);
        }
    }
  }, [isAdmin, firebaseInitialized, authLoading, adminUser, fetchUsers]);

  const openDeleteDialog = (userToDelete: UserDocData) => {
    if (adminUser && userToDelete.uid === adminUser.uid) {
      toast({ title: "Action impossible", description: "Vous ne pouvez pas supprimer votre propre compte administrateur.", variant: "warning" });
      return;
    }
    setItemToDelete(userToDelete);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db || !isAdmin) {
      toast({ title: 'Erreur', description: 'Action non autorisée ou données manquantes.', variant: 'destructive' });
      setIsDeleting(false);
      setDialogOpen(false);
      return;
    }
    setIsDeleting(true);
    try {
      // 1. Supprimer le document utilisateur de Firestore
      const userDocRef = doc(db, 'users', itemToDelete.uid); // Utiliser l'UID pour le document ID
      await deleteDoc(userDocRef);
      
      // 2. TODO IMPORTANT: Supprimer l'utilisateur de Firebase Authentication
      // Cela DOIT être fait côté serveur avec Firebase Admin SDK (par exemple, via une Cloud Function).
      // Le SDK client ne permet pas de supprimer d'autres utilisateurs.
      console.warn(`Document Firestore pour ${itemToDelete.email} (UID: ${itemToDelete.uid}) supprimé. Veuillez supprimer manuellement l'utilisateur de Firebase Authentication ou implémenter une Cloud Function.`);
      toast({
        title: 'Document utilisateur supprimé de Firestore',
        description: `Les données de ${itemToDelete.email} ont été retirées de la base de données. N'oubliez pas de supprimer le compte d'authentification.`,
        variant: 'default',
        duration: 7000,
      });


      const updatedUsers = users.filter(u => u.uid !== itemToDelete.uid);
      setUsers(updatedUsers);
      onUpdateCounts({ users: updatedUsers.length });
      
    } catch (error: any) {
      console.error(`Erreur lors de la suppression de l'utilisateur Firestore:`, error);
      toast({ title: 'Erreur de suppression Firestore', description: `Impossible de supprimer les données de "${itemToDelete.email}" de Firestore. ${error.message}`, variant: 'destructive' });
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
          <CardTitle><Skeleton className="h-6 w-3/4" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-full" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded-full bg-muted" />
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
          <CardTitle className="text-destructive flex items-center gap-2"><Users className="h-5 w-5" /> Utilisateurs</CardTitle>
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
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Utilisateurs ({users.length})</CardTitle>
          <CardDescription>Gérer les comptes utilisateurs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {users.length === 0 && <p className="text-sm text-muted-foreground">Aucun utilisateur trouvé.</p>}
          {users.map((userDoc) => {
            const joinDate = getDateFromTimestamp(userDoc.createdAt);
            const displayName = userDoc.pseudo || userDoc.displayName || userDoc.email.split('@')[0];
            return (
                <div key={userDoc.uid} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border/30 hover:border-primary/50 transition-colors duration-200">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Avatar className="h-10 w-10 border">
                    <AvatarImage src={userDoc.avatarUrl || undefined} alt={displayName} data-ai-hint="utilisateur avatar"/>
                    <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(displayName, userDoc.email)}
                    </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={displayName}>{displayName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3"/> {userDoc.email}
                    </p>
                    {joinDate && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3"/> Inscrit le : {joinDate.toLocaleDateString()}
                        </p>
                    )}
                    </div>
                </div>
                {isAdmin && adminUser && userDoc.uid !== adminUser.uid && (
                    <Button variant="destructive" size="sm" className="ml-4 flex-shrink-0" onClick={() => openDeleteDialog(userDoc)}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
                    </Button>
                )}
                </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogUITitle>Êtes-vous sûr de vouloir supprimer cet utilisateur ?</AlertDialogUITitle>
            <AlertDialogDescription>
              Utilisateur : {itemToDelete?.email} (Pseudo: {itemToDelete?.pseudo || itemToDelete?.displayName || 'N/A'}) <br />
              La suppression du document Firestore ne supprime PAS le compte d'authentification Firebase. Cette action devra être effectuée manuellement ou via une fonction backend.
              Cette action est irréversible pour les données Firestore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)} disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting || !isAdmin} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Supprimer de Firestore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
