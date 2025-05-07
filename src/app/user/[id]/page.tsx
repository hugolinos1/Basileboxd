// src/app/user/[id]/page.tsx
'use client';

import { useEffect, useState, useMemo, ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy, Timestamp, updateDoc, collectionGroup } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import Image from 'next/image';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, MessageSquare, CalendarDays, Edit2, Loader2, AlertTriangle, ImageIcon, Users, Edit3, Upload, X } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { uploadFile, ACCEPTED_COVER_PHOTO_TYPES, MAX_FILE_SIZE as MEDIA_MAX_FILE_SIZE } from '@/services/media-uploader';
import { coverPhotoSchema } from '@/services/validation-schemas';
import type { PartyData as SharedPartyData, CommentData as SharedCommentData } from '@/lib/party-utils';


// --- Interfaces ---
interface FirestoreTimestamp { seconds: number; nanoseconds: number; }

interface UserData {
    id: string;
    uid: string;
    email: string;
    displayName?: string;
    pseudo?: string;
    avatarUrl?: string;
    createdAt?: FirestoreTimestamp | Timestamp | Date;
    eventCount: number;
    commentCount: number;
    averageRatingGiven: number;
}

type PartyData = SharedPartyData & { id: string, createdBy: string };
type CommentData = SharedCommentData & { partyName?: string };


// --- Helper Functions ---
const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp;
        if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
            const date = new Date(timestamp.seconds * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        return null;
    } catch (e) { console.error("Erreur conversion timestamp:", timestamp, e); return null; }
}

const calculateAverageRatingGiven = (parties: PartyData[], userId: string): number => {
    let totalRating = 0;
    let ratingCount = 0;
    parties.forEach(party => {
        if (party.ratings && party.ratings[userId] !== undefined) {
            totalRating += party.ratings[userId];
            ratingCount++;
        }
    });
    return ratingCount > 0 ? totalRating / ratingCount : 0;
};

const calculateRatingDistribution = (parties: PartyData[], userId: string): { rating: number; votes: number; fill: string }[] => {
    const counts: { rating: number; votes: number; fill: string }[] = Array.from({ length: 10 }, (_, i) => ({ rating: (i + 1) * 0.5, votes: 0, fill: '' }));
    parties.forEach(party => {
        const userRating = party.ratings?.[userId];
        if (userRating !== undefined) {
             const index = Math.round(userRating * 2) - 1;
             if (index >= 0 && index < 10) {
                counts[index].votes++;
            }
        }
    });
     return counts.map(c => ({ ...c, fill: "hsl(var(--primary))" }));
};

const calculatePartyAverageRating = (party: PartyData): number => {
    if (!party.ratings) return 0;
    const allRatings = Object.values(party.ratings);
    if (allRatings.length === 0) return 0;
    const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
    return sum / allRatings.length;
};

const getInitials = (name: string | null | undefined, email: string): string => {
    if (name && name.length > 0) return name.charAt(0).toUpperCase();
    if (email && email.length > 0) return email.charAt(0).toUpperCase();
    return '?';
};


// --- User Profile Page Component ---
export default function UserProfilePage() {
    const params = useParams();
    const profileUserId = params.id as string;
    const router = useRouter();
    const { user: currentUser, loading: authLoading, firebaseInitialized, isAdmin, initializationFailed, initializationErrorMessage } = useFirebase();
    const { toast } = useToast();

    const [profileUserData, setProfileUserData] = useState<UserData | null>(null);
    const [userParties, setUserParties] = useState<PartyData[]>([]);
    const [userComments, setUserComments] = useState<CommentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showEditAvatarDialog, setShowEditAvatarDialog] = useState(false);
    const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
    const [newAvatarPreview, setNewAvatarPreview] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);


    const isOwnProfileOrAdmin = useMemo(() => {
        if (!currentUser || !profileUserData) return false;
        return currentUser.uid === profileUserId || isAdmin;
    }, [currentUser, profileUserId, isAdmin, profileUserData]);

    useEffect(() => {
        if (initializationFailed) {
            setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
            setLoading(false);
            return;
        }

        if (!firebaseInitialized || authLoading) {
            setLoading(true);
            return;
        }
        if (!profileUserId) {
            setError("ID utilisateur manquant.");
            setLoading(false);
            return;
        }
        if (!db) {
            setError("Base de données indisponible.");
            setLoading(false);
            return;
        }

        console.log(`[UserProfilePage useEffect] Fetching data for profileUserId: ${profileUserId}`);

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const userDocRef = doc(db, 'users', profileUserId);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    // console.warn(`[UserProfilePage fetchData] Utilisateur non trouvé pour l'ID: ${profileUserId}`); // Changed to warn
                    setError("Utilisateur non trouvé."); 
                    setProfileUserData(null); 
                    setLoading(false);
                    return;
                }
                const fetchedUser = { id: userDocSnap.id, ...userDocSnap.data() } as Omit<UserData, 'eventCount' | 'commentCount' | 'averageRatingGiven'>;

                const partiesRef = collection(db, 'parties');
                const createdPartiesQuery = query(partiesRef, where('createdBy', '==', profileUserId));
                const participatedPartiesQuery = query(partiesRef, where('participants', 'array-contains', profileUserId));

                const [createdPartiesSnapshot, participatedPartiesSnapshot] = await Promise.all([
                    getDocs(createdPartiesQuery),
                    getDocs(participatedPartiesQuery)
                ]);

                const createdParties = createdPartiesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
                const participatedParties = participatedPartiesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
                
                const allUserPartiesMap = new Map<string, PartyData>();
                createdParties.forEach(party => allUserPartiesMap.set(party.id, party));
                participatedParties.forEach(party => allUserPartiesMap.set(party.id, party));
                const partiesData = Array.from(allUserPartiesMap.values());


                const commentsCollectionRef = collectionGroup(db, 'comments');
                const commentsQuery = query(commentsCollectionRef, where('userId', '==', profileUserId), orderBy('timestamp', 'desc'));
                const commentsSnapshot = await getDocs(commentsQuery);
                const commentsDataPromises = commentsSnapshot.docs.map(async (commentDoc) => {
                    const commentData = commentDoc.data() as Omit<CommentData, 'partyName'>;
                    const partyDocRef = commentDoc.ref.parent.parent; 
                    if (partyDocRef) {
                        const partySnap = await getDoc(partyDocRef);
                        if (partySnap.exists()) {
                            return { ...commentData, id: commentDoc.id, partyId: partySnap.id, partyName: partySnap.data()?.name || 'Événement inconnu' } as CommentData;
                        }
                    }
                    return { ...commentData, id: commentDoc.id, partyId: 'unknown', partyName: 'Événement inconnu' } as CommentData;
                });
                const resolvedCommentsData = await Promise.all(commentsDataPromises);

                setProfileUserData({
                    ...fetchedUser,
                    eventCount: partiesData.length,
                    commentCount: resolvedCommentsData.length,
                    averageRatingGiven: calculateAverageRatingGiven(partiesData, profileUserId),
                });
                setUserParties(partiesData);
                setUserComments(resolvedCommentsData);

            } catch (err: any) {
                console.error("Erreur lors de la récupération des données utilisateur:", err);
                 let userFriendlyError = err.message || "Impossible de charger le profil.";
                  if (err.code === 'permission-denied') {
                     userFriendlyError = "Permission refusée. Vérifiez les règles Firestore.";
                 } else if (err.message?.includes('collectionGroup') && err.message?.includes('index')) {
                     userFriendlyError = "Index Firestore manquant pour la requête collectionGroup sur 'comments'. Veuillez créer cet index dans votre console Firebase.";
                     console.error("INDEX REQUIRED for collectionGroup query on 'comments': The query requires an index. You can create it here: ... (Firebase should provide a link in the detailed error in browser console or Firebase console)");
                 }
                setError(userFriendlyError);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [profileUserId, firebaseInitialized, authLoading, initializationFailed, initializationErrorMessage]);

    const handleNewAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const isBrowser = typeof window !== 'undefined';
        const file = event.target.files?.[0];
        if (file) {
            const validationResult = isBrowser && file instanceof File ? coverPhotoSchema.safeParse(file) : { success: true }; 
            if (validationResult.success) {
                setNewAvatarFile(file);
                if (newAvatarPreview) URL.revokeObjectURL(newAvatarPreview);
                setNewAvatarPreview(URL.createObjectURL(file));
            } else {
                const errorMessage = (validationResult as any).error?.errors[0]?.message || 'Fichier invalide.';
                toast({ title: "Erreur Photo de Profil", description: errorMessage, variant: "destructive" });
                setNewAvatarFile(null);
                if (newAvatarPreview) URL.revokeObjectURL(newAvatarPreview);
                setNewAvatarPreview(null);
            }
        } else {
             setNewAvatarFile(null);
             if (newAvatarPreview) URL.revokeObjectURL(newAvatarPreview);
             setNewAvatarPreview(null);
        }
        if (event.target) event.target.value = '';
    };

    const handleUpdateAvatar = async () => {
        console.log("[handleUpdateAvatar] Current User UID:", currentUser?.uid);
        console.log("[handleUpdateAvatar] Profile User ID:", profileUserId);
        console.log("[handleUpdateAvatar] New Avatar File:", newAvatarFile);
        console.log("[handleUpdateAvatar] DB instance:", db);
        console.log("[handleUpdateAvatar] Profile User Data:", profileUserData);


        if (!currentUser || !newAvatarFile || !db || !profileUserId) { 
            toast({ title: 'Erreur', description: 'Impossible de mettre à jour l\'avatar pour le moment. Vérifiez les informations et la connexion.', variant: 'destructive' });
            return;
        }
        setIsUploadingAvatar(true);
        setAvatarUploadProgress(0);

        try {
            
            const userDocRef = doc(db, 'users', profileUserId); 
            console.log("Mise à jour de l'avatar pour l'utilisateur UID:", profileUserId);
            console.log("Référence du document Firestore :", userDocRef.path);

            const newAvatarUrl = await uploadFile(newAvatarFile, profileUserId, false, (progress) => {
                setAvatarUploadProgress(progress);
            }, 'userAvatar'); 

            await updateDoc(userDocRef, { avatarUrl: newAvatarUrl });

            toast({ title: 'Avatar mis à jour !' });
            
            setProfileUserData(prev => prev ? { ...prev, avatarUrl: newAvatarUrl } : null);
            setNewAvatarFile(null);
            if (newAvatarPreview) URL.revokeObjectURL(newAvatarPreview);
            setNewAvatarPreview(null);
            setShowEditAvatarDialog(false);

        } catch (error: any) {
            console.error("Erreur lors de la mise à jour de l'avatar:", error);
            let userFriendlyError = "Impossible de mettre à jour l'avatar.";
            if (error.message?.includes('storage/unauthorized') || error.code === 'permission-denied') {
                userFriendlyError = "Permission refusée. Vérifiez les règles de sécurité.";
            } else if (error.message?.includes('Firebase Storage: User does not have permission to access')) {
                userFriendlyError = `Permission refusée par Firebase Storage. Vérifiez les règles de Storage. Détails: ${error.message}`;
            }
            toast({ title: 'Échec de la mise à jour', description: userFriendlyError, variant: 'destructive' });
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    useEffect(() => {
        return () => {
            if (newAvatarPreview) URL.revokeObjectURL(newAvatarPreview);
        };
    }, [newAvatarPreview]);


    const stats = useMemo(() => {
        if (!profileUserData) return { eventCount: 0, commentCount: 0, averageRatingGiven: 0 };
        return {
            eventCount: profileUserData.eventCount,
            commentCount: profileUserData.commentCount,
            averageRatingGiven: profileUserData.averageRatingGiven,
        };
    }, [profileUserData]);

     const ratingDistributionGiven = useMemo(() => {
        if (!userParties || !profileUserId) return [];
         return calculateRatingDistribution(userParties, profileUserId);
    }, [userParties, profileUserId]);

     const topRatedCreatedParties = useMemo(() => {
        return userParties
            .filter(party => party.createdBy === profileUserId)
            .sort((a, b) => calculatePartyAverageRating(b) - calculatePartyAverageRating(a))
            .slice(0, 4);
    }, [userParties, profileUserId]);

    const recentParticipatedParties = useMemo(() => {
        return [...userParties].sort((a, b) => {
            const timeA = getDateFromTimestamp(a.date ?? a.createdAt)?.getTime() || 0;
            const timeB = getDateFromTimestamp(b.date ?? b.createdAt)?.getTime() || 0;
            return timeB - timeA;
        }).slice(0, 4);
    }, [userParties]);


     const chartConfig = {
        votes: { label: "Votes", color: "hsl(var(--primary))" },
     } satisfies ChartConfig

    if (loading) {
        return (
            <div className="container mx-auto max-w-6xl px-4 py-8">
                 <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mb-8 border-b border-border pb-8">
                    <Skeleton className="h-24 w-24 md:h-32 md:w-32 rounded-full bg-muted" />
                    <div className="flex-1 space-y-3 text-center md:text-left">
                        <Skeleton className="h-7 w-48 md:w-64 bg-muted mx-auto md:mx-0" />
                        <Skeleton className="h-4 w-56 md:w-72 bg-muted mx-auto md:mx-0" />
                         <Skeleton className="h-4 w-32 bg-muted mx-auto md:mx-0" />
                    </div>
                    <div className="flex gap-4 md:gap-8 text-center">
                        <div><Skeleton className="h-6 w-10 bg-muted mx-auto mb-1" /><Skeleton className="h-3 w-12 bg-muted mx-auto" /></div>
                        <div><Skeleton className="h-6 w-10 bg-muted mx-auto mb-1" /><Skeleton className="h-3 w-16 bg-muted mx-auto" /></div>
                        <div><Skeleton className="h-6 w-10 bg-muted mx-auto mb-1" /><Skeleton className="h-3 w-14 bg-muted mx-auto" /></div>
                    </div>
                </div>
                <Skeleton className="h-96 w-full bg-muted" />
            </div>
        );
    }

    if (error) {
        return (
             <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
                 <Alert variant="destructive" className="max-w-lg">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erreur</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                 </Alert>
            </div>
        );
    }

    if (!profileUserData) { 
        return <div className="container mx-auto px-4 py-12 text-center">Utilisateur non trouvé ou profil inaccessible.</div>;
    }

    const joinDate = getDateFromTimestamp(profileUserData.createdAt);
    const displayUsername = profileUserData.pseudo || profileUserData.displayName || profileUserData.email.split('@')[0];

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mb-8 border-b border-border pb-8">
                <Avatar className="h-24 w-24 md:h-32 md:w-32 border-2 border-primary relative group">
                    <AvatarImage src={profileUserData.avatarUrl || undefined} alt={displayUsername} />
                    <AvatarFallback className="text-4xl bg-muted">{getInitials(displayUsername, profileUserData.email)}</AvatarFallback>
                     {isOwnProfileOrAdmin && (
                        <Dialog open={showEditAvatarDialog} onOpenChange={setShowEditAvatarDialog}>
                            <DialogTrigger asChild>
                                <button className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer">
                                    <Edit3 className="h-8 w-8 text-white" />
                                    <span className="sr-only">Modifier photo</span>
                                </button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Modifier l'Avatar</DialogTitle>
                                    <DialogDescription>Choisissez une nouvelle image de profil. Max {MEDIA_MAX_FILE_SIZE.userAvatar / (1024*1024)}Mo, sera compressée si besoin.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <Input id="new-avatar-input" type="file" accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')} onChange={handleNewAvatarFileChange} className="col-span-3" />
                                    {newAvatarPreview && (
                                        <div className="relative aspect-square w-32 h-32 mx-auto border rounded-full mt-2 bg-muted overflow-hidden">
                                            <Image src={newAvatarPreview} alt="Aperçu nouvel avatar" layout="fill" objectFit="cover" />
                                            <Button variant="destructive" size="icon" className="absolute top-0 right-0 h-6 w-6 rounded-full z-10 text-xs" onClick={() => { setNewAvatarFile(null); if(newAvatarPreview) URL.revokeObjectURL(newAvatarPreview); setNewAvatarPreview(null); }}> <X className="h-3 w-3" /> </Button>
                                        </div>
                                    )}
                                    {isUploadingAvatar && avatarUploadProgress > 0 && avatarUploadProgress < 100 && (
                                        <Progress value={avatarUploadProgress} className="h-2 w-full mt-2" />
                                    )}
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
                                    <Button type="button" onClick={handleUpdateAvatar} disabled={!newAvatarFile || isUploadingAvatar}>
                                        {isUploadingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4" />}
                                        Mettre à jour
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                     )}
                </Avatar>
                <div className="flex-1 space-y-1 text-center md:text-left">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">{displayUsername}</h1>
                     {profileUserData.pseudo && profileUserData.pseudo !== (profileUserData.displayName || profileUserData.email.split('@')[0]) && (
                         <p className="text-lg text-primary">{profileUserData.pseudo}</p>
                     )}
                    <p className="text-sm text-muted-foreground">{profileUserData.email}</p>
                     {joinDate && <p className="text-xs text-muted-foreground">Membre depuis {formatDistanceToNow(joinDate, { addSuffix: true, locale: fr })}</p>}
                     {isOwnProfileOrAdmin && ( 
                         <Button variant="outline" size="sm" className="mt-2" onClick={() => router.push('/settings/profile')}>
                             <Edit2 className="mr-2 h-3 w-3" /> Modifier le profil
                         </Button>
                      )}
                </div>
                <div className="flex gap-4 md:gap-8 text-center">
                    <div>
                        <p className="text-xl md:text-2xl font-bold text-primary">{stats.eventCount}</p>
                        <p className="text-xs text-muted-foreground uppercase">Événements</p>
                    </div>
                    <div>
                        <p className="text-xl md:text-2xl font-bold text-primary">{stats.commentCount}</p>
                        <p className="text-xs text-muted-foreground uppercase">Commentaires</p>
                    </div>
                     <div>
                        <p className="text-xl md:text-2xl font-bold text-primary">{stats.averageRatingGiven.toFixed(1)} ★</p>
                        <p className="text-xs text-muted-foreground uppercase">Note Moy.</p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="activity" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6 bg-secondary">
                    <TabsTrigger value="activity" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Activité Récente</TabsTrigger>
                    <TabsTrigger value="top-rated" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Mieux Notés</TabsTrigger>
                    <TabsTrigger value="comments" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Commentaires</TabsTrigger>
                    <TabsTrigger value="stats" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Statistiques</TabsTrigger>
                </TabsList>

                <TabsContent value="activity">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>4 Derniers Événements Participés</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recentParticipatedParties.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {recentParticipatedParties.map(party => (
                                        <Link href={`/party/${party.id}`} key={party.id} className="block group">
                                            <Card className="overflow-hidden h-full bg-secondary hover:border-primary/50">
                                                <div className="aspect-video relative w-full bg-muted">
                                                   {party.coverPhotoUrl ? (
                                                        <Image src={party.coverPhotoUrl} alt={party.name} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform" data-ai-hint="fête evenement" />
                                                   ) : (
                                                       <div className="flex items-center justify-center h-full"> <ImageIcon className="h-10 w-10 text-muted-foreground/50"/></div>
                                                   )}
                                                </div>
                                                <CardContent className="p-3">
                                                     <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary">{party.name}</p>
                                                     {getDateFromTimestamp(party.date ?? party.createdAt) && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1"/> {format(getDateFromTimestamp(party.date ?? party.createdAt)!, 'P', { locale: fr })}</p>}
                                                </CardContent>
                                            </Card>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm text-center py-4">Aucune activité récente.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="top-rated">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>4 Événements Créés Mieux Notés</CardTitle>
                             <CardDescription>Les événements créés par cet utilisateur, triés par leur note moyenne globale.</CardDescription>
                         </CardHeader>
                         <CardContent>
                             {topRatedCreatedParties.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {topRatedCreatedParties.map(party => {
                                         const overallAvg = calculatePartyAverageRating(party);
                                        return (
                                             <Link href={`/party/${party.id}`} key={party.id} className="block group">
                                                 <Card className="overflow-hidden h-full bg-secondary hover:border-primary/50">
                                                     <div className="aspect-video relative w-full bg-muted">
                                                        {party.coverPhotoUrl ? (
                                                             <Image src={party.coverPhotoUrl} alt={party.name} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform" data-ai-hint="fête populaire" />
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full"> <ImageIcon className="h-10 w-10 text-muted-foreground/50"/></div>
                                                        )}
                                                          {overallAvg > 0 && (
                                                              <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center space-x-1">
                                                                 <Star className="h-3 w-3 text-yellow-400 fill-current" />
                                                                 <span>{overallAvg.toFixed(1)}</span>
                                                             </div>
                                                          )}
                                                     </div>
                                                     <CardContent className="p-3">
                                                          <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary">{party.name}</p>
                                                          {getDateFromTimestamp(party.date ?? party.createdAt) && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1"/> {format(getDateFromTimestamp(party.date ?? party.createdAt)!, 'P', { locale: fr })}</p>}
                                                     </CardContent>
                                                 </Card>
                                             </Link>
                                         );
                                    })}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm text-center py-4">Cet utilisateur n'a pas encore créé d'événements ou aucun n'a été noté.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="comments">
                     <Card className="bg-card border-border">
                         <CardHeader>
                             <CardTitle>Tous les Commentaires ({userComments.length})</CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                             {userComments.length > 0 ? (
                                userComments.map((comment, index) => {
                                     const commentDate = getDateFromTimestamp(comment.timestamp);
                                    return (
                                        <div key={comment.id || index} className="p-3 bg-secondary/50 rounded-md border border-border/30">
                                             <p className="text-sm text-foreground/90 mb-1 italic">"{comment.text}"</p>
                                             <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                 <span>Sur : <Link href={`/party/${comment.partyId}`} className="text-primary hover:underline">{comment.partyName || 'Événement supprimé'}</Link></span>
                                                 {commentDate && <span>{formatDistanceToNow(commentDate, { addSuffix: true, locale: fr })}</span>}
                                             </div>
                                        </div>
                                    );
                                })
                             ) : (
                                 <p className="text-muted-foreground text-sm text-center py-4">Aucun commentaire pour le moment.</p>
                             )}
                         </CardContent>
                     </Card>
                </TabsContent>

                 <TabsContent value="stats">
                     <Card className="bg-card border-border">
                         <CardHeader>
                            <CardTitle>Répartition des Notes Données</CardTitle>
                             <CardDescription>Distribution des notes attribuées par {displayUsername}.</CardDescription>
                         </CardHeader>
                         <CardContent className="pl-2">
                              {stats.averageRatingGiven > 0 ? (
                                  <ChartContainer config={chartConfig} className="h-[150px] w-full">
                                     <BarChart accessibilityLayer data={ratingDistributionGiven} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                                          <XAxis dataKey="rating" tickLine={false} tickMargin={10} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={12} interval={1} tickFormatter={(value) => `${value}`} />
                                         <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={12} width={30} />
                                         <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel hideIndicator />} formatter={(value, name, props) => [`${value} votes`, `${props.payload.rating} étoiles`]} />
                                         <Bar dataKey="votes" fill="var(--color-votes)" radius={4} />
                                     </BarChart>
                                 </ChartContainer>
                             ) : (
                                 <p className="text-muted-foreground text-sm text-center py-4">Aucune note attribuée pour afficher les statistiques.</p>
                             )}
                         </CardContent>
                     </Card>
                 </TabsContent>
            </Tabs>
        </div>
    );
}
