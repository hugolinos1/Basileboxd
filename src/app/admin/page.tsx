// src/app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, ImageIcon, Video, Music, Trash2, Loader2, User, Users, MessageSquare, Image as LucideImage, FileText } from 'lucide-react';
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
import { collection, getDocs, doc, deleteDoc, Timestamp, query, orderBy, updateDoc, arrayRemove, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Alert, AlertDescription, AlertTitle as AlertUITitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PartyData as SharedPartyData, CommentData as SharedCommentData, getDateFromTimestamp as sharedGetDateFromTimestamp } from '@/lib/party-utils';

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

// Use SharedPartyData and SharedCommentData for consistency
type PartyData = SharedPartyData & { id: string }; // Ensure id is present
type CommentData = SharedCommentData & { id: string, partyName?: string }; // Ensure id and partyName are present

interface MediaData {
  id: string; // Can be the URL itself if unique, or a generated ID
  partyId: string;
  partyName?: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'autre';
  uploadedAt: Timestamp | Date; // Or use party's createdAt as fallback
  fileName?: string;
}

// Use shared date conversion utility
const getDateFromTimestamp = sharedGetDateFromTimestamp;


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
  const [itemToDelete, setItemToDelete] = useState<{ type: string; id: string; name?: string, partyId?: string } | null>(null);


  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast({ title: 'Accès Refusé', description: 'Vous n\'êtes pas autorisé à accéder à cette page.', variant: 'destructive' });
      router.push('/');
    }
  }, [user, isAdmin, authLoading, router, toast]);


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

    const fetchPartiesAndSubCollections = async () => {
        setLoadingParties(true); setErrorParties(null);
        setLoadingComments(true); setErrorComments(null);
        setLoadingMedia(true); setErrorMedia(null);

        try {
            const partiesCollectionRef = collection(db, 'parties');
            const partiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'));
            const partiesSnapshot = await getDocs(partiesQuery);
            
            const fetchedParties: PartyData[] = [];
            const allComments: CommentData[] = [];
            const allMedia: MediaData[] = [];
            let mediaIdCounter = 0;

            for (const partyDoc of partiesSnapshot.docs) {
                const partyData = { id: partyDoc.id, ...partyDoc.data() } as PartyData;
                fetchedParties.push(partyData);

                // Fetch comments for this party (assuming subcollection)
                const commentsRef = collection(db, 'parties', partyDoc.id, 'comments');
                const commentsSnapshot = await getDocs(query(commentsRef, orderBy('timestamp', 'desc')));
                commentsSnapshot.forEach(commentDoc => {
                    allComments.push({
                        id: commentDoc.id,
                        partyId: partyDoc.id, // Ensure partyId is set
                        partyName: partyData.name,
                        ...(commentDoc.data() as Omit<CommentData, 'id' | 'partyId' | 'partyName'>)
                    });
                });

                // Process media for this party (from mediaUrls array)
                if (partyData.mediaUrls && Array.isArray(partyData.mediaUrls)) {
                    partyData.mediaUrls.forEach(url => {
                        const fileExtension = url.substring(url.lastIndexOf('.') + 1).toLowerCase();
                        let type: MediaData['type'] = 'autre';
                        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) type = 'image';
                        else if (['mp4', 'mov', 'avi', 'webm'].includes(fileExtension)) type = 'video';
                        else if (['mp3', 'wav', 'ogg', 'aac'].includes(fileExtension)) type = 'audio';
                        
                        const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
                        allMedia.push({
                            id: `media-${partyDoc.id}-${fileName}-${mediaIdCounter++}`, // More unique ID
                            partyId: partyDoc.id,
                            partyName: partyData.name,
                            url: url,
                            type: type,
                            uploadedAt: partyData.createdAt || new Date(), // Fallback
                            fileName: fileName,
                        });
                    });
                }
            }

            setPartiesData(fetchedParties);
            setCommentsData(allComments);
            setMediaData(allMedia);

        } catch (e: any)  {
            console.error("Erreur chargement fêtes ou sous-collections:", e);
            setErrorParties("Impossible de charger les fêtes. " + e.message);
            setErrorComments("Impossible de charger les commentaires. " + e.message);
            setErrorMedia("Impossible de charger les médias. " + e.message);
        } finally {
            setLoadingParties(false);
            setLoadingComments(false);
            setLoadingMedia(false);
        }
    };

    fetchUsers();
    fetchPartiesAndSubCollections();

  }, [firebaseInitialized, db, isAdmin]);

  const openDeleteDialog = (type: string, id: string, name?: string, partyId?: string) => {
    setItemToDelete({ type, id, name: name || id, partyId });
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !db) return;
    setIsDeleting(true);

    try {
        const { type, id, partyId, name } = itemToDelete;
        let docRef;

        if (type === 'Utilisateur') {
            docRef = doc(db, 'users', id);
            await deleteDoc(docRef);
            setUsersData(prev => prev.filter(u => u.id !== id));
        } else if (type === 'Fête') {
            // Delete party and its comments subcollection
            const partyDocRef = doc(db, 'parties', id);
            const commentsRef = collection(db, 'parties', id, 'comments');
            const commentsSnapshot = await getDocs(commentsRef);
            
            const batch = writeBatch(db);
            commentsSnapshot.forEach(commentDoc => {
                batch.delete(doc(commentsRef, commentDoc.id));
            });
            batch.delete(partyDocRef); // Delete the party document itself
            await batch.commit();

            setPartiesData(prev => prev.filter(p => p.id !== id));
            setCommentsData(prev => prev.filter(c => c.partyId !== id));
            setMediaData(prev => prev.filter(m => m.partyId !== id)); // Media is array on party, so it's gone with party
        } else if (type === 'Commentaire' && partyId) {
            docRef = doc(db, 'parties', partyId, 'comments', id);
            await deleteDoc(docRef);
            setCommentsData(prev => prev.filter(c => c.id !== id));
        } else if (type === 'Média' && partyId) {
            // Media is stored as an array `mediaUrls` on the party document.
            // We need to remove the specific URL from this array.
            const partyDocRef = doc(db, 'parties', partyId);
            const mediaUrlToRemove = mediaData.find(m => m.id === id)?.url;
            if (mediaUrlToRemove) {
                await updateDoc(partyDocRef, {
                    mediaUrls: arrayRemove(mediaUrlToRemove)
                });
                setMediaData(prev => prev.filter(m => m.id !== id));
                 // Also update the party in partiesData to reflect the change locally
                 setPartiesData(prev => prev.map(p => {
                     if (p.id === partyId) {
                         return { ...p, mediaUrls: (p.mediaUrls || []).filter(url => url !== mediaUrlToRemove) };
                     }
                     return p;
                 }));
            } else {
                throw new Error("URL du média non trouvée pour la suppression.");
            }
        } else {
             throw new Error("Type de suppression ou informations d'identification non valides.");
        }

        toast({ title: `${type} supprimé`, description: `L'élément "${name}" a été supprimé.` });
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
                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Utilisateur', u.id, u.displayName || u.email)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                        </Button>
                    </div>
                 ))}
                </CardContent>
            </Card>
        )}

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
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Fête', p.id, p.name)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                         </Button>
                    </div>
                 ))}
                </CardContent>
            </Card>
        )}

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
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Commentaire', c.id, `Commentaire de ${c.email}`, c.partyId )}>
                            <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                         </Button>
                     </div>
                 ))}
                </CardContent>
            </Card>
        )}

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
                             {m.type === 'autre' && <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0"/>}
                             <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline max-w-xs">{m.fileName || m.url.substring(m.url.lastIndexOf('/')+1)}</a>
                             <p className="text-xs text-muted-foreground truncate">(Fête : {m.partyName || m.partyId})</p>
                         </div>
                         <Button variant="destructive" size="sm" onClick={() => openDeleteDialog('Média', m.id, m.fileName || m.url.substring(m.url.lastIndexOf('/')+1), m.partyId )}>
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
              {itemToDelete?.type === 'Fête' && "La suppression d'une fête entraînera la suppression de tous ses commentaires et médias associés."}
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
