// src/components/admin/AdminUserManagement.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Trash2, Loader2, Mail, UserCircle, CalendarDays, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
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
  isAdmin?: boolean; // Add isAdmin to check if the user is an admin
}

interface AdminUserManagementProps {
  onUpdateCounts: (counts: { users: number }) => void;
}

export function AdminUserManagement({ onUpdateCounts }: AdminUserManagementProps) {
  const { toast } = useToast();
  const { user: currentUser, isAdmin: currentUserIsAdmin, loading: firebaseLoading, firebaseInitialized } = useFirebase();

  const [users, setUsers] = useState<UserDocData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserDocData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!db) {
        setError("Firestore n'est pas initialisé.");
        setLoading(false);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: UserDocData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedUsers.push({
          id: doc.id,
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          pseudo: data.pseudo,
          avatarUrl: data.avatarUrl,
          createdAt: data.createdAt,
          isAdmin: data.isAdmin || false,
        });
      });
      setUsers(fetchedUsers);
      onUpdateCounts({ users: fetchedUsers.length });
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError("Impossible de charger les utilisateurs. " + err.message);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données utilisateurs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, onUpdateCounts]);

  useEffect(() => {
    if (firebaseInitialized && !firebaseLoading) {
      fetchUsers();
    }
  }, [fetchUsers, firebaseInitialized, firebaseLoading]);

  const openDeleteDialog = (user: UserDocData) => {
    if (user.uid === currentUser?.uid) {
      toast({
        title: "Impossible de se supprimer",
        description: "Vous ne pouvez pas supprimer votre propre compte depuis ce panneau.",
        variant: "destructive",
      });
      return;
    }
    if (user.isAdmin && !currentUserIsAdmin) {
        toast({
            title: "Permission Refusée",
            description: "Vous n'avez pas la permission de supprimer un administrateur.",
            variant: "destructive",
        });
        return;
    }
    setUserToDelete(user);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || !currentUserIsAdmin) {
      toast({
        title: "Erreur",
        description: "Aucun utilisateur sélectionné ou permissions insuffisantes.",
        variant: "destructive",
      });
      setIsDeleting(false);
      setUserToDelete(null);
      return;
    }
    if (userToDelete.uid === currentUser?.uid) {
      toast({
        title: "Action Non Autorisée",
        description: "Vous ne pouvez pas supprimer votre propre compte.",
        variant: "destructive",
      });
      setIsDeleting(false);
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const userDocRef = doc(db, 'users', userToDelete.id);
      await deleteDoc(userDocRef);
      toast({
        title: "Utilisateur Supprimé",
        description: `${getDisplayName(userToDelete)} a été supprimé avec succès.`,
      });
      const updatedUsers = users.filter(user => user.id !== userToDelete.id);
      setUsers(updatedUsers);
      onUpdateCounts({ users: updatedUsers.length });
    } catch (err) {
      console.error("Error deleting user:", err);
      setError(`Impossible de supprimer l'utilisateur ${getDisplayName(userToDelete)}.`);
      toast({
        title: "Erreur de Suppression",
        description: `Impossible de supprimer l'utilisateur. ${err instanceof Error ? err.message : ''}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setUserToDelete(null);
    }
  };

  const getDisplayName = (user: UserDocData) => {
    return user.displayName || user.pseudo || user.email.split('@')[0] || 'N/A';
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };


  if (loading || firebaseLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-4 border rounded-md">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-5 w-5" /> Utilisateurs</CardTitle>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-6 w-6" /> Utilisateurs ({users.length})
          </CardTitle>
          <CardDescription>
            Gérer tous les utilisateurs enregistrés dans l'application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-96 overflow-y-auto">
          {users.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-lg">Aucun utilisateur trouvé.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <Card key={user.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-4 mb-3 sm:mb-0">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatarUrl} alt={getDisplayName(user)} />
                      <AvatarFallback>{getInitials(getDisplayName(user))}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold flex items-center">
                        {getDisplayName(user)}
                        {user.isAdmin && <ShieldCheck className="ml-2 h-5 w-5 text-blue-500" titleAccess="Administrateur"/>}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <Mail className="mr-1 h-4 w-4" /> {user.email}
                      </div>
                      {user.createdAt && (
                        <div className="text-xs text-gray-400 flex items-center">
                          <CalendarDays className="mr-1 h-3 w-3" /> Rejoint le: {getDateFromTimestamp(user.createdAt) ? format(getDateFromTimestamp(user.createdAt)!, 'P', { locale: fr }) : 'N/A'}
                        </div>
                      )}
                       <div className="text-xs text-gray-400 flex items-center">
                          <UserCircle className="mr-1 h-3 w-3" /> UID: {user.uid}
                        </div>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openDeleteDialog(user)}
                    disabled={!currentUserIsAdmin || isDeleting || user.uid === currentUser?.uid || (user.isAdmin && !currentUserIsAdmin)}
                    aria-label={`Supprimer l'utilisateur ${getDisplayName(user)}`}
                    className="w-full sm:w-auto"
                  >
                    {isDeleting && userToDelete?.id === user.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Supprimer
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {userToDelete && (
        <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogUITitle>Confirmer la Suppression</AlertDialogUITitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'utilisateur "{getDisplayName(userToDelete)}"?
                Cette action est irréversible et supprimera définitivement ses données.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
