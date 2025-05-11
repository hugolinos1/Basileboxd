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

const AdminUserManagement = ({ onUpdateCounts }: AdminUserManagementProps) => {
  const { toast } = useToast();
  const { currentUser, isAdmin: currentUserIsAdmin, loading: firebaseLoading } = useFirebase();

  const [users, setUsers] = useState<UserDocData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserDocData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: UserDocData[] = [];
      querySnapshot.forEach((doc) => {
        // Ensure createdAt is handled correctly, even if it's missing in some docs
        const data = doc.data();
        fetchedUsers.push({
          id: doc.id,
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          pseudo: data.pseudo,
          avatarUrl: data.avatarUrl,
          createdAt: data.createdAt,
          isAdmin: data.isAdmin || false, // Assuming isAdmin field exists
        });
      });
      setUsers(fetchedUsers);
      onUpdateCounts({ users: fetchedUsers.length });
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to fetch users. Please try again later.");
      toast({
        title: "Error",
        description: "Could not load user data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, onUpdateCounts]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openDeleteDialog = (user: UserDocData) => {
    if (user.uid === currentUser?.uid) {
      toast({
        title: "Cannot Delete Self",
        description: "You cannot delete your own account from here.",
        variant: "destructive",
      });
      return;
    }
    if (user.isAdmin && !currentUserIsAdmin) {
        toast({
            title: "Permission Denied",
            description: "You do not have permission to delete an admin user.",
            variant: "destructive",
        });
        return;
    }
    setUserToDelete(user);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || !currentUserIsAdmin) {
      toast({
        title: "Error",
        description: "No user selected for deletion or insufficient permissions.",
        variant: "destructive",
      });
      return;
    }
    if (userToDelete.uid === currentUser?.uid) {
      toast({
        title: "Action Not Allowed",
        description: "You cannot delete your own account.",
        variant: "destructive",
      });
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const userDocRef = doc(db, 'users', userToDelete.id);
      await deleteDoc(userDocRef);
      toast({
        title: "User Deleted",
        description: `${userToDelete.displayName || userToDelete.email} has been successfully deleted.`,
      });
      // Refetch users or filter out the deleted user
      const updatedUsers = users.filter(user => user.id !== userToDelete.id);
      setUsers(updatedUsers);
      onUpdateCounts({ users: updatedUsers.length });
    } catch (err) {
      console.error("Error deleting user:", err);
      setError(`Failed to delete user ${userToDelete.displayName || userToDelete.email}.`);
      toast({
        title: "Error Deleting User",
        description: `Could not delete user. ${err instanceof Error ? err.message : ''}`,
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
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage all registered users.</CardDescription>
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
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage all registered users.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertUITitleComponent>Error</AlertUITitleComponent>
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
            <Users className="mr-2 h-6 w-6" /> User Management
          </CardTitle>
          <CardDescription>
            View and manage all registered users in the application. Total users: {users.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-lg">No users found.</p>
              <p className="text-sm">As users register, they will appear here.</p>
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
                        {user.isAdmin && <ShieldCheck className="ml-2 h-5 w-5 text-blue-500" titleAccess="Administrator"/>}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <Mail className="mr-1 h-4 w-4" /> {user.email}
                      </div>
                      {user.createdAt && (
                        <div className="text-xs text-gray-400 flex items-center">
                          <CalendarDays className="mr-1 h-3 w-3" /> Joined: {getDateFromTimestamp(user.createdAt)}
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
                    aria-label={`Delete user ${getDisplayName(user)}`}
                    className="w-full sm:w-auto"
                  >
                    {isDeleting && userToDelete?.id === user.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
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
              <AlertDialogUITitle>Confirm Deletion</AlertDialogUITitle>
              <AlertDialogDescription>
                Are you sure you want to delete the user "{getDisplayName(userToDelete)}"?
                This action cannot be undone and will permanently remove their data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default AdminUserManagement;
