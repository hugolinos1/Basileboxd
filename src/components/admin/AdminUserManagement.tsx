// src/components/admin/AdminUserManagement.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Trash2, Loader2, Mail, UserCircle, CalendarDays, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
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
  isAdmin?: boolean;
}

const AdminUserManagement = () => {
  const [users, setUsers] = useState<UserDocData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user: currentUser } = useFirebase(); // Assuming user object has uid

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserDocData | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const usersCollection = collection(db, 'users');
      const q = query(usersCollection, orderBy('createdAt', 'desc'));
      const usersSnapshot = await getDocs(q);
      const usersList = usersSnapshot.docs.map(docSnapshot => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<UserDocData, 'id'>),
      }));
      setUsers(usersList);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      const errorMessage = err.message || "Une erreur inconnue est survenue.";
      setError(`Erreur lors de la récupération des utilisateurs: ${errorMessage}. Vérifiez la console et les règles Firestore.`);
      toast({
        title: "Erreur de chargement",
        description: "Impossible de charger la liste des utilisateurs.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openDeleteConfirmation = (user: UserDocData) => {
    if (currentUser && user.uid === currentUser.uid) {
      toast({
        title: "Opération non autorisée",
        description: "Vous ne pouvez pas supprimer votre propre compte.",
        variant: "destructive",
      });
      return;
    }
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    // Prevent deletion if current user is not available (should not happen if page is protected)
    if (!currentUser) {
        toast({
            title: "Erreur d'authentification",
            description: "Utilisateur actuel non identifié. Impossible de supprimer.",
            variant: "destructive",
        });
        setShowDeleteConfirm(false);
        setUserToDelete(null);
        return;
    }

    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      toast({
        title: "Utilisateur supprimé",
        description: `L'utilisateur ${userToDelete.displayName || userToDelete.email} a été supprimé avec succès.`,
      });
      setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDelete.id));
    } catch (err: any) {
      console.error("Error deleting user:", err);
      let description = "Impossible de supprimer l'utilisateur.";
      if (err.code === 'permission-denied') {
        description = "Permission refusée. Vérifiez que votre compte a les droits d'administration nécessaires et que l'UID de l'admin est correct dans les règles Firestore.";
      } else {
        description = `Une erreur est survenue: ${err.message}`;
      }
      toast({
        title: "Erreur de suppression",
        description,
        variant: "destructive",
      });
      setError(`Erreur lors de la suppression de l'utilisateur. ${description}`);
    } finally {
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gestion des Utilisateurs</CardTitle>
          <CardDescription>Chargement de la liste des utilisateurs...</CardDescription>
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
          <CardTitle>Gestion des Utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertUITitleComponent>Erreur</AlertUITitleComponent>
            <AlertDescription>{error} Veuillez réessayer ou contacter le support si le problème persiste.</AlertDescription>
          </Alert>
          <Button onClick={fetchUsers} className="mt-4">Réessayer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Gestion des Utilisateurs</CardTitle>
          <CardDescription>
            Liste de tous les utilisateurs enregistrés. Vous pouvez voir leurs informations et supprimer des comptes.
            {users.length === 0 && !isLoading && " Aucun utilisateur trouvé."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="space-y-4">
              {users.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-md hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-4 mb-2 sm:mb-0">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />
                      <AvatarFallback>
                        {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : user.email.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium leading-none flex items-center">
                        {user.displayName || user.pseudo || 'Nom non défini'}
                        {user.isAdmin && <ShieldCheck className="h-4 w-4 ml-2 text-green-500" titleAccess="Administrateur" />}
                        {currentUser && user.uid === currentUser.uid && <ShieldAlert className="h-4 w-4 ml-2 text-blue-500" titleAccess="Votre compte" />}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <Mail className="h-3 w-3 mr-1" /> {user.email}
                      </p>
                      {user.createdAt && (
                        <p className="text-xs text-muted-foreground flex items-center mt-1">
                          <CalendarDays className="h-3 w-3 mr-1" />
                          Inscrit le: {format(getDateFromTimestamp(user.createdAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                        </p>
                      )}
                       <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <UserCircle className="h-3 w-3 mr-1" /> UID: {user.uid}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openDeleteConfirmation(user)}
                    disabled={currentUser?.uid === user.uid}
                    aria-label={`Supprimer l'utilisateur ${user.displayName || user.email}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer
                  </Button>
                </div>
              ))}
            </div>
          ) : (
             !isLoading && <p>Aucun utilisateur à afficher pour le moment.</p>
          )}
        </CardContent>
      </Card>

      {userToDelete && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogUITitle>Confirmer la suppression</AlertDialogUITitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'utilisateur {userToDelete.displayName || userToDelete.email}?
                {userToDelete.isAdmin && <strong className="block mt-2 text-red-600">Attention : Cet utilisateur est un administrateur.</strong>}
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setUserToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default AdminUserManagement;
