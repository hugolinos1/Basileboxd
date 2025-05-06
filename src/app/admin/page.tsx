'use client';

import { useEffect, useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, ImageIcon, Video, Music, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
// TODO: Uncomment for Firestore integration
// import { doc, deleteDoc } from 'firebase/firestore';
// import { db } from '@/config/firebase';


// Mock Data Structures - Replace with actual data fetching and types later
interface MockUser { id: string; email: string; createdAt: Date; }
interface MockParty { id: string; name: string; createdBy: string; date: Date; }
interface MockComment { id: string; partyId: string; userId: string; text: string; timestamp: Date; }
interface MockMedia { id: string; partyId: string; url: string; type: 'image' | 'video' | 'audio'; uploadedAt: Date; }


// Initial Mock Data
const initialMockUsers: MockUser[] = [
  { id: 'user1', email: 'test1@example.com', createdAt: new Date() },
  { id: 'user2', email: 'another@test.net', createdAt: new Date(Date.now() - 86400000) },
];
const initialMockParties: MockParty[] = [
  { id: 'partyA', name: 'Admin\'s Test Party', createdBy: 'adminUser', date: new Date() },
  { id: 'partyB', name: 'Beach Bash', createdBy: 'user1', date: new Date(Date.now() - 172800000) },
];
const initialMockComments: MockComment[] = [
    { id: 'cmt1', partyId: 'partyB', userId: 'user2', text: 'Super fête !', timestamp: new Date() },
];
const initialMockMedia: MockMedia[] = [
    { id: 'mediaX', partyId: 'partyA', url: 'https://picsum.photos/200', type: 'image', uploadedAt: new Date() },
];


export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  // State for mock data
  const [usersData, setUsersData] = useState<MockUser[]>(initialMockUsers);
  const [partiesData, setPartiesData] = useState<MockParty[]>(initialMockParties);
  const [commentsData, setCommentsData] = useState<MockComment[]>(initialMockComments);
  const [mediaData, setMediaData] = useState<MockMedia[]>(initialMockMedia);

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: string; id: string; name?: string, collectionName?: string } | null>(null);


  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/'); // Redirect non-admins to home
    }
  }, [user, isAdmin, authLoading, router]);

  const openDeleteDialog = (type: string, id: string, name?: string, collectionName?: string) => {
    setItemToDelete({ type, id, name: name || id, collectionName });
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);

    // TODO: Implement actual Firestore delete operation
    // For now, we'll simulate deletion by updating local state.
    // try {
    //   if (itemToDelete.collectionName && db) { // Ensure db is initialized
    //     await deleteDoc(doc(db, itemToDelete.collectionName, itemToDelete.id));
    //     toast({ title: `${itemToDelete.type} supprimé`, description: `L'élément "${itemToDelete.name}" a été supprimé de Firestore.` });
    //   } else {
    //      throw new Error("Collection name or Firestore instance is missing for actual deletion.");
    //   }
    // } catch (error) {
    //   console.error(`Erreur lors de la suppression de ${itemToDelete.type} de Firestore:`, error);
    //   toast({ title: 'Erreur de suppression', description: `Impossible de supprimer "${itemToDelete.name}" de Firestore.`, variant: 'destructive' });
    //   setIsDeleting(false);
    //   setDialogOpen(false);
    //   setItemToDelete(null);
    //   return;
    // }

    // Simulate deletion from local mock data
    setTimeout(() => { // Simulate async operation
        switch (itemToDelete.type) {
        case 'Utilisateur':
            setUsersData(prev => prev.filter(u => u.id !== itemToDelete.id));
            break;
        case 'Fête':
            setPartiesData(prev => prev.filter(p => p.id !== itemToDelete.id));
            break;
        case 'Commentaire':
            setCommentsData(prev => prev.filter(c => c.id !== itemToDelete.id));
            break;
        case 'Média':
            setMediaData(prev => prev.filter(m => m.id !== itemToDelete.id));
            break;
        }
        toast({ title: `${itemToDelete.type} supprimé (simulation)`, description: `L'élément "${itemToDelete.name}" a été retiré de la liste.` });
        setIsDeleting(false);
        setDialogOpen(false);
        setItemToDelete(null);
    }, 500);
  };


  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Vérification des permissions...</div>;
  }

  if (!isAdmin) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Accès refusé. Redirection...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
        <Badge variant="destructive"><ShieldAlert className="w-4 h-4 mr-1" /> Accès Admin</Badge>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

         {/* Users Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Utilisateurs ({usersData.length})</CardTitle>
            <CardDescription>Gérer les utilisateurs de l'application.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {usersData.map((u) => (
                <div key={u.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                    <div>
                        <p className="text-sm font-medium">{u.email}</p>
                        <p className="text-xs text-muted-foreground">Inscrit le: {u.createdAt.toLocaleDateString()}</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Utilisateur', u.id, u.email, 'users')}>
                        <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                    </Button>
                </div>
             ))}
            </CardContent>
        </Card>

         {/* Parties Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Fêtes ({partiesData.length})</CardTitle>
            <CardDescription>Gérer les entrées de fêtes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {partiesData.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                    <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Date : {p.date.toLocaleDateString()} | Par : {p.createdBy}</p>
                    </div>
                     <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Fête', p.id, p.name, 'parties')}>
                        <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                     </Button>
                </div>
             ))}
            </CardContent>
        </Card>

         {/* Comments Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Commentaires ({commentsData.length})</CardTitle>
            <CardDescription>Modérer les commentaires.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {commentsData.map((c) => (
                 <div key={c.id} className="flex justify-between items-start p-2 bg-secondary rounded-md">
                     <div className="flex-1 mr-4">
                        <p className="text-sm italic">"{c.text}"</p>
                        <p className="text-xs text-muted-foreground">
                            Sur la Fête : {partiesData.find(p => p.id === c.partyId)?.name || c.partyId} | Par : {usersData.find(u => u.id === c.userId)?.email || c.userId} | Le : {c.timestamp.toLocaleString()}
                        </p>
                    </div>
                     <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Commentaire', c.id, `Commentaire de ${c.userId} sur ${c.partyId}`, `parties/${c.partyId}/comments`)}> {/* Example: Subcollection path */}
                        <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                     </Button>
                 </div>
             ))}
            </CardContent>
        </Card>

        {/* Media Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Médias ({mediaData.length})</CardTitle>
            <CardDescription>Gérer les médias téléchargés.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {mediaData.map((m) => (
                 <div key={m.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                     <div className="flex items-center gap-2">
                         {m.type === 'image' && <ImageIcon className="w-4 h-4 text-muted-foreground"/>}
                         {m.type === 'video' && <Video className="w-4 h-4 text-muted-foreground"/>}
                         {m.type === 'audio' && <Music className="w-4 h-4 text-muted-foreground"/>}
                         <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline max-w-xs">{m.url.substring(m.url.lastIndexOf('/')+1)}</a>
                         <p className="text-xs text-muted-foreground">(Fête : {partiesData.find(p => p.id === m.partyId)?.name || m.partyId})</p>
                     </div>
                     <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Média', m.id, m.url.substring(m.url.lastIndexOf('/')+1), `parties/${m.partyId}/media`)}> {/* Example: Subcollection or update logic */}
                        <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                     </Button>
                 </div>
             ))}
            </CardContent>
        </Card>

      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr de vouloir supprimer cet élément ?</AlertDialogTitle>
            <AlertDialogDescription>
              Type : {itemToDelete?.type} <br />
              Nom/ID : {itemToDelete?.name} <br />
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)} disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
