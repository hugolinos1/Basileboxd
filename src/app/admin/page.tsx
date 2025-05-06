// src/app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, ImageIcon, Video, Music, Trash2, Loader2, User, Users, MessageSquare, Image as LucideImage } from 'lucide-react';
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
import { collection, getDocs, doc, deleteDoc, Timestamp, query, orderBy, getDoc, collectionGroup } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Alert, AlertDescription, AlertTitle as AlertUITitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

// --- Interfaces for Firestore Data ---
interface UserData {
  id: string; // Document ID
  uid: string;
  email: string;
  displayName?: string;
  pseudo?: string;
  avatarUrl?: string;
  createdAt?: Timestamp | Date;
}

interface PartyData {
  id: string; // Document ID
  name: string;
  description?: string;
  date: Timestamp | Date;
  location?: string;
  createdBy: string;
  creatorEmail?: string;
  participants: string[];
  participantEmails?: string[];
  mediaUrls?: string[];
  coverPhotoUrl?: string;
  ratings?: { [userId: string]: number };
  comments?: CommentData[]; // Comments can be a subcollection or an array
  createdAt: Timestamp | Date;
}

interface CommentData {
  id: string; // Document ID
  partyId: string; // ID of the party this comment belongs to
  partyName?: string; // Name of the party for display
  userId: string;
  email: string;
  avatar?: string | null;
  text: string;
  timestamp: Timestamp | Date;
}

interface MediaData {
  id: string; // Document ID (if media are individual docs)
  partyId: string; // ID of the party this media belongs to
  partyName?: string; // Name of the party for display
  url: string;
  type: 'image' | 'video' | 'audio' | 'autre';
  uploadedAt: Timestamp | Date; // Assuming a field like this exists
  fileName?: string; // Optional: if you store file names
}

// Helper to convert Firestore timestamp to Date
const getDateFromTimestamp = (timestamp: Timestamp | Date | undefined): Date | null => {
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return null;
};


export default function AdminPage() {
  const { user, isAdmin, loading: authLoading, firebaseInitialized } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [usersData, setUsersData] = useState<UserData[]>([]);
  const [partiesData, setPartiesData] = useState<PartyData[]>([]);
  const [commentsData, setCommentsData] = useState<CommentData[]>([]);
  const [mediaData, setMediaData] = useState<MediaData[]>([]);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingParties, setLoadingParties] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(true);

  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [errorParties, setErrorParties] = useState<string | null>(null);
  const [errorComments, setErrorComments] = useState<string | null>(null);
  const [errorMedia, setErrorMedia] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: string; id: string; name?: string, collectionPath?: string, subCollectionPartyId?: string } | null>(null);


  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast({ title: 'Accès Refusé', description: 'Vous n\'êtes pas autorisé à accéder à cette page.', variant: 'destructive' });
      router.push('/');
    }
  }, [user, isAdmin, authLoading, router, toast]);


  // --- Data Fetching Effects ---
  useEffect(() => {
    if (!firebaseInitialized || !db || !isAdmin) return;

    const fetchUsers = async () => {
      setLoadingUsers(true); setErrorUsers(null);
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedUsers = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as UserData));
        setUsersData(fetchedUsers);
      } catch (e: any) {
        console.error("Erreur chargement utilisateurs:", e);
        setErrorUsers("Impossible de charger les utilisateurs. " + e.message);
      } finally {
        setLoadingUsers(false);
      }
    };

    const fetchParties = async () => {
        setLoadingParties(true); setErrorParties(null);
        try {
            const partiesCollectionRef = collection(db, 'parties');
            const q = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const fetchedParties = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
            setPartiesData(fetchedParties);

            // After fetching parties, fetch their comments and media
            fetchAllComments(fetchedParties);
            fetchAllMedia(fetchedParties);

        } catch (e: any)  {
            console.error("Erreur chargement fêtes:", e);
            setErrorParties("Impossible de charger les fêtes. " + e.message);
        } finally {
            setLoadingParties(false);
        }
    };

    // Helper to fetch all comments from all parties (if comments are subcollections)
    const fetchAllComments = async (currentParties: PartyData[]) => {
        setLoadingComments(true); setErrorComments(null);
        const allComments: CommentData[] = [];
        try {
            for (const party of currentParties) {
                const commentsRef = collection(db, 'parties', party.id, 'comments'); // Assuming 'comments' is a subcollection
                const commentsSnapshot = await getDocs(query(commentsRef, orderBy('timestamp', 'desc')));
                commentsSnapshot.forEach(commentDoc => {
                    allComments.push({
                        id: commentDoc.id,
                        partyId: party.id,
                        partyName: party.name,
                        ...(commentDoc.data() as Omit<CommentData, 'id' | 'partyId' | 'partyName'>)
                    });
                });
            }
            setCommentsData(allComments);
        } catch (e: any) {
            console.error("Erreur chargement commentaires:", e);
            setErrorComments("Impossible de charger tous les commentaires. " + e.message);
        } finally {
            setLoadingComments(false);
        }
    };

    // Helper to fetch all media (assuming mediaUrls is an array on the party doc for now)
    // If media items are separate documents in a subcollection, this needs to be adjusted like comments.
    const fetchAllMedia = async (currentParties: PartyData[]) => {
        setLoadingMedia(true); setErrorMedia(null);
        const allMedia: MediaData[] = [];
         let mediaIdCounter = 0; // Simple counter for unique IDs if media URLs don't have them
        try {
            for (const party of currentParties) {
                if (party.mediaUrls && Array.isArray(party.mediaUrls)) {
                    party.mediaUrls.forEach(url => {
                        // Infer type from URL or add a 'type' field if stored
                        const fileExtension = url.substring(url.lastIndexOf('.') + 1).toLowerCase();
                        let type: MediaData['type'] = 'autre';
                        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) type = 'image';
                        else if (['mp4', 'mov', 'avi', 'webm'].includes(fileExtension)) type = 'video';
                        else if (['mp3', 'wav', 'ogg', 'aac'].includes(fileExtension)) type = 'audio';

                        allMedia.push({
                            id: `media-${party.id}-${mediaIdCounter++}`, // Generate a somewhat unique ID
                            partyId: party.id,
                            partyName: party.name,
                            url: url,
                            type: type,
                            // uploadedAt needs to come from Firestore if stored, otherwise use party's createdAt
                            uploadedAt: party.createdAt || new Date(),
                            fileName: url.substring(url.lastIndexOf('/') + 1).split('?')[0] // Extract filename
                        });
                    });
                }
            }
            setMediaData(allMedia);
        } catch (e: any) {
            console.error("Erreur chargement médias:", e);
            setErrorMedia("Impossible de charger tous les médias. " + e.message);
        } finally {
            setLoadingMedia(false);
        }
    };

    fetchUsers();
    fetchParties();

  }, [firebaseInitialized, db, isAdmin]);


  const openDeleteDialog = (type: string, id: string, name?: string, collectionPath?: string, subCollectionPartyId?: string) => {
    setItemToDelete({ type, id, name: name || id, collectionPath, subCollectionPartyId });
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !itemToDelete.collectionPath || !db) return;
    setIsDeleting(true);

    try {
        let docRefPath;
        if (itemToDelete.subCollectionPartyId) { // Deleting from a subcollection
             docRefPath = doc(db, itemToDelete.collectionPath, itemToDelete.subCollectionPartyId, itemToDelete.type.toLowerCase() + 's', itemToDelete.id);
             if (itemToDelete.type === 'Commentaire') {
                 docRefPath = doc(db, 'parties', itemToDelete.subCollectionPartyId, 'comments', itemToDelete.id);
             } else if (itemToDelete.type === 'Média') {
                // For media stored as URLs in party.mediaUrls, we need to update the party document
                // This assumes media is an array of URLs. If it's a subcollection, use logic similar to comments.
                const partyDocRef = doc(db, 'parties', itemToDelete.subCollectionPartyId);
                const partySnap = await getDoc(partyDocRef);
                if (partySnap.exists()) {
                    const partyData = partySnap.data() as PartyData;
                    const updatedMediaUrls = (partyData.mediaUrls || []).filter(url => !url.includes(itemToDelete.id)); // Assuming ID is part of URL or filename
                    await updateDoc(partyDocRef, { mediaUrls: updatedMediaUrls });
                } else {
                    throw new Error("Document Fête parent non trouvé pour la suppression du média.");
                }
                 // Simulate local state update for media array
                 setMediaData(prev => prev.filter(m => m.id !== itemToDelete.id));
                 toast({ title: `${itemToDelete.type} supprimé`, description: `L'élément "${itemToDelete.name}" a été supprimé.` });
                 setIsDeleting(false);
                 setDialogOpen(false);
                 setItemToDelete(null);
                 return;
            }
        } else { // Deleting from a top-level collection
            docRefPath = doc(db, itemToDelete.collectionPath, itemToDelete.id);
        }

        await deleteDoc(docRefPath);

        // Update local state after successful deletion
        switch (itemToDelete.type) {
            case 'Utilisateur': setUsersData(prev => prev.filter(u => u.id !== itemToDelete.id)); break;
            case 'Fête':
                setPartiesData(prev => prev.filter(p => p.id !== itemToDelete.id));
                // Also remove associated comments and media from local state if a party is deleted
                setCommentsData(prev => prev.filter(c => c.partyId !== itemToDelete.id));
                setMediaData(prev => prev.filter(m => m.partyId !== itemToDelete.id));
                break;
            case 'Commentaire': setCommentsData(prev => prev.filter(c => c.id !== itemToDelete.id)); break;
            // Media deletion handled above for array type, adjust if subcollection.
        }

        toast({ title: `${itemToDelete.type} supprimé`, description: `L'élément "${itemToDelete.name}" a été supprimé.` });
    } catch (error: any) {
        console.error(`Erreur lors de la suppression de ${itemToDelete.type}:`, error);
        toast({ title: 'Erreur de suppression', description: `Impossible de supprimer "${itemToDelete.name}". ${error.message}`, variant: 'destructive' });
    } finally {
        setIsDeleting(false);
        setDialogOpen(false);
        setItemToDelete(null);
    }
  };


  if (authLoading || !firebaseInitialized) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /> Chargement...</div>;
  }

  if (!isAdmin) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Accès refusé. Redirection...</div>;
  }

  const renderSkeletonCard = (title: string, description: string) => (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
        <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center p-2 bg-secondary rounded-md">
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const renderErrorCard = (title: string, errorMsg: string | null) => (
    <Card className="bg-card border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertUITitle>Erreur de Chargement</AlertUITitle>
          <AlertDescription>{errorMsg || "Une erreur inconnue est survenue."}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
        <Badge variant="destructive"><ShieldAlert className="w-4 h-4 mr-1" /> Accès Admin</Badge>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Users Management */}
        {loadingUsers ? renderSkeletonCard("Utilisateurs", "Chargement des utilisateurs...") : errorUsers ? renderErrorCard("Utilisateurs", errorUsers) : (
            <Card className="bg-card border-border">
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Utilisateurs ({usersData.length})</CardTitle>
                <CardDescription>Gérer les utilisateurs de l'application.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                 {usersData.length === 0 && <p className="text-sm text-muted-foreground">Aucun utilisateur trouvé.</p>}
                 {usersData.map((u) => (
                    <div key={u.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                        <div>
                            <p className="text-sm font-medium">{u.displayName || u.pseudo || u.email}</p>
                            <p className="text-xs text-muted-foreground">Email: {u.email} | Inscrit le: {u.createdAt ? getDateFromTimestamp(u.createdAt)?.toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Utilisateur', u.id, u.displayName || u.email, 'users')}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                        </Button>
                    </div>
                 ))}
                </CardContent>
            </Card>
        )}


         {/* Parties Management */}
         {loadingParties ? renderSkeletonCard("Fêtes", "Chargement des fêtes...") : errorParties ? renderErrorCard("Fêtes", errorParties) : (
            <Card className="bg-card border-border">
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Fêtes ({partiesData.length})</CardTitle>
                <CardDescription>Gérer les entrées de fêtes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                 {partiesData.length === 0 && <p className="text-sm text-muted-foreground">Aucune fête trouvée.</p>}
                 {partiesData.map((p) => (
                    <div key={p.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                        <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">Date : {getDateFromTimestamp(p.date)?.toLocaleDateString()} | Par : {p.creatorEmail || p.createdBy}</p>
                        </div>
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Fête', p.id, p.name, 'parties')}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                         </Button>
                    </div>
                 ))}
                </CardContent>
            </Card>
        )}


         {/* Comments Management */}
        {loadingComments ? renderSkeletonCard("Commentaires", "Chargement des commentaires...") : errorComments ? renderErrorCard("Commentaires", errorComments) : (
            <Card className="bg-card border-border">
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Commentaires ({commentsData.length})</CardTitle>
                <CardDescription>Modérer les commentaires.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {commentsData.length === 0 && <p className="text-sm text-muted-foreground">Aucun commentaire trouvé.</p>}
                 {commentsData.map((c) => (
                     <div key={c.id} className="flex justify-between items-start p-2 bg-secondary rounded-md">
                         <div className="flex-1 mr-4">
                            <p className="text-sm italic">"{c.text}"</p>
                            <p className="text-xs text-muted-foreground">
                                Sur : {c.partyName || c.partyId} | Par : {c.email || c.userId} | Le : {getDateFromTimestamp(c.timestamp)?.toLocaleString()}
                            </p>
                        </div>
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Commentaire', c.id, `Commentaire de ${c.email}`, `parties`, c.partyId )}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                         </Button>
                     </div>
                 ))}
                </CardContent>
            </Card>
        )}


        {/* Media Management */}
        {loadingMedia ? renderSkeletonCard("Médias", "Chargement des médias...") : errorMedia ? renderErrorCard("Médias", errorMedia) : (
            <Card className="bg-card border-border">
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><LucideImage className="h-5 w-5" /> Médias ({mediaData.length})</CardTitle>
                <CardDescription>Gérer les médias téléchargés.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {mediaData.length === 0 && <p className="text-sm text-muted-foreground">Aucun média trouvé.</p>}
                 {mediaData.map((m) => (
                     <div key={m.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                         <div className="flex items-center gap-2 overflow-hidden">
                             {m.type === 'image' && <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0"/>}
                             {m.type === 'video' && <Video className="w-4 h-4 text-muted-foreground flex-shrink-0"/>}
                             {m.type === 'audio' && <Music className="w-4 h-4 text-muted-foreground flex-shrink-0"/>}
                             <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline max-w-xs">{m.fileName || m.url.substring(m.url.lastIndexOf('/')+1)}</a>
                             <p className="text-xs text-muted-foreground truncate">(Fête : {m.partyName || m.partyId})</p>
                         </div>
                          {/* Media stored as array on party doc, deletion needs to update party */}
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Média', m.fileName || m.url, m.fileName || m.url.substring(m.url.lastIndexOf('/')+1), 'parties', m.partyId )}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                         </Button>
                     </div>
                 ))}
                </CardContent>
            </Card>
        )}

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
