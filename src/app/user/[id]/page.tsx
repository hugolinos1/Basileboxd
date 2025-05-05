// src/app/user/[id]/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import Image from 'next/image';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, MessageSquare, CalendarDays, Edit2, Loader2, AlertTriangle, ImageIcon } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

// --- Interfaces ---
interface FirestoreTimestamp { seconds: number; nanoseconds: number; }
interface UserData {
    uid: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
    createdAt?: FirestoreTimestamp | Timestamp;
}
interface PartyData {
    id: string;
    name: string;
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    date?: FirestoreTimestamp | Timestamp;
    comments?: CommentData[];
    participants?: string[]; // Array of user UIDs
    createdAt?: FirestoreTimestamp | Timestamp;
}
interface CommentData {
    userId: string;
    partyId: string; // Add partyId to comment data structure
    partyName: string; // Add partyName for display
    text: string;
    timestamp: FirestoreTimestamp | Timestamp;
}

// --- Helper Functions ---
const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
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
    // Assign colors after counting
     return counts.map(c => ({ ...c, fill: "hsl(var(--primary))" }));
};


// --- User Profile Page Component ---
export default function UserProfilePage() {
    const params = useParams();
    const userId = params.id as string;
    const router = useRouter();
    const { user: currentUser, loading: authLoading, firebaseInitialized } = useFirebase();

    const [userData, setUserData] = useState<UserData | null>(null);
    const [userParties, setUserParties] = useState<PartyData[]>([]); // Parties created or participated in
    const [userComments, setUserComments] = useState<CommentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseInitialized || authLoading) {
            setLoading(true);
            return;
        }
        if (!userId) {
            setError("ID utilisateur manquant.");
            setLoading(false);
            return;
        }
        if (!db) {
            setError("Base de données indisponible.");
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Fetch User Data
                const userDocRef = doc(db, 'users', userId);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    throw new Error("Utilisateur non trouvé.");
                }
                const fetchedUserData = userDocSnap.data() as UserData;
                setUserData(fetchedUserData);

                // 2. Fetch User's Parties (created or participated) & Comments
                const partiesRef = collection(db, 'parties');
                // Query for parties where user is a participant OR creator
                 const participatedQuery = query(partiesRef, where('participants', 'array-contains', userId));
                 // const createdQuery = query(partiesRef, where('createdBy', '==', userId)); // Included in participant query

                const partiesSnapshot = await getDocs(participatedQuery);
                const partiesData: PartyData[] = partiesSnapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                } as PartyData));
                setUserParties(partiesData);

                 // 3. Fetch User's Comments (Efficiently - Iterate through fetched parties)
                const commentsData: CommentData[] = [];
                partiesData.forEach(party => {
                    if (party.comments) {
                         party.comments.forEach(comment => {
                            if (comment.userId === userId) {
                                commentsData.push({
                                    ...comment,
                                    partyId: party.id, // Add partyId
                                    partyName: party.name // Add partyName
                                });
                            }
                         });
                    }
                });
                 // Sort comments by timestamp descending
                 commentsData.sort((a, b) => {
                     const timeA = getDateFromTimestamp(a.timestamp)?.getTime() || 0;
                     const timeB = getDateFromTimestamp(b.timestamp)?.getTime() || 0;
                     return timeB - timeA;
                 });
                 setUserComments(commentsData);


            } catch (err: any) {
                console.error("Erreur lors de la récupération des données utilisateur:", err);
                setError(err.message || "Impossible de charger le profil.");
                setUserData(null); // Reset data on error
                setUserParties([]);
                setUserComments([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

    }, [userId, firebaseInitialized, authLoading]); // Add authLoading dependency

    // --- Memoized Calculations ---
    const stats = useMemo(() => {
        if (!userData || !userParties) return { eventCount: 0, commentCount: 0, averageRating: 0 };
        const avgRating = calculateAverageRatingGiven(userParties, userId);
        return {
            eventCount: userParties.length,
            commentCount: userComments.length,
            averageRating: avgRating,
        };
    }, [userData, userParties, userComments, userId]);

     const ratingDistribution = useMemo(() => {
        if (!userParties || !userId) return [];
         return calculateRatingDistribution(userParties, userId);
    }, [userParties, userId]);

     const topRatedParties = useMemo(() => {
        return [...userParties].sort((a, b) => {
            const avgA = calculateAverageRatingGiven([a], userId); // Recalculate for single party if needed or use precalculated overall rating
             const avgB = calculateAverageRatingGiven([b], userId);
            // A more robust way: calculate overall average rating for each party
            const overallAvgA = calculateAverageRatingGiven([a], a.id); // Assuming this calculates for all users
            const overallAvgB = calculateAverageRatingGiven([b], b.id);
             return overallAvgB - overallAvgA; // Sort descending by overall average
        }).slice(0, 4);
    }, [userParties, userId]); // Add userId dependency

    const recentParties = useMemo(() => {
        return [...userParties].sort((a, b) => {
            const timeA = getDateFromTimestamp(a.createdAt ?? a.date)?.getTime() || 0;
            const timeB = getDateFromTimestamp(b.createdAt ?? b.date)?.getTime() || 0;
            return timeB - timeA; // Sort descending by creation/event date
        }).slice(0, 4);
    }, [userParties]);


    // --- Chart Config ---
     const chartConfig = {
        votes: { label: "Votes", color: "hsl(var(--primary))" },
     } satisfies ChartConfig

    // --- Render Logic ---
    if (loading) {
        return (
            <div className="container mx-auto max-w-6xl px-4 py-8">
                 {/* Skeleton Header */}
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
                 {/* Skeleton Body */}
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

    if (!userData) {
        return <div className="container mx-auto px-4 py-12 text-center">Utilisateur non trouvé.</div>;
    }

    const joinDate = getDateFromTimestamp(userData.createdAt);

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            {/* User Header */}
            <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mb-8 border-b border-border pb-8">
                <Avatar className="h-24 w-24 md:h-32 md:w-32 border-2 border-primary relative group">
                    <AvatarImage src={userData.avatarUrl || undefined} alt={userData.displayName || userData.email} />
                    <AvatarFallback className="text-4xl bg-muted">{userData.displayName?.[0]?.toUpperCase() ?? userData.email[0].toUpperCase()}</AvatarFallback>
                    {/* Edit button - only visible to the logged-in user viewing their own profile */}
                     {currentUser?.uid === userId && (
                        <button className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer">
                            <Edit2 className="h-8 w-8 text-white" />
                            <span className="sr-only">Modifier photo</span>
                            {/* TODO: Add Dialog/Modal for upload */}
                        </button>
                     )}
                </Avatar>
                <div className="flex-1 space-y-1 text-center md:text-left">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">{userData.displayName || userData.email.split('@')[0]}</h1>
                    <p className="text-sm text-muted-foreground">{userData.email}</p>
                     {joinDate && <p className="text-xs text-muted-foreground">Membre depuis {formatDistanceToNow(joinDate, { addSuffix: true, locale: fr })}</p>}
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
                        <p className="text-xl md:text-2xl font-bold text-primary">{stats.averageRating.toFixed(1)} ★</p>
                        <p className="text-xs text-muted-foreground uppercase">Note Moy.</p>
                    </div>
                </div>
            </div>

            {/* User Content Sections */}
            <Tabs defaultValue="activity" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6 bg-secondary">
                    <TabsTrigger value="activity" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Activité Récente</TabsTrigger>
                    <TabsTrigger value="top-rated" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Mieux Notés</TabsTrigger>
                    <TabsTrigger value="comments" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Commentaires</TabsTrigger>
                    <TabsTrigger value="stats" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Statistiques</TabsTrigger>
                </TabsList>

                {/* Activité Récente */}
                <TabsContent value="activity">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>4 Derniers Événements Participés</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recentParties.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {recentParties.map(party => (
                                        <Link href={`/party/${party.id}`} key={party.id} className="block group">
                                            <Card className="overflow-hidden h-full bg-secondary hover:border-primary/50">
                                                <div className="aspect-video relative w-full bg-muted">
                                                   {party.coverPhotoUrl ? (
                                                        <Image src={party.coverPhotoUrl} alt={party.name} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform"/>
                                                   ) : (
                                                       <div className="flex items-center justify-center h-full"> <ImageIcon className="h-10 w-10 text-muted-foreground/50"/></div>
                                                   )}
                                                </div>
                                                <CardContent className="p-3">
                                                     <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary">{party.name}</p>
                                                     {getDateFromTimestamp(party.date) && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1"/> {format(getDateFromTimestamp(party.date)!, 'P', { locale: fr })}</p>}
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

                 {/* Mieux Notés */}
                <TabsContent value="top-rated">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>4 Événements Mieux Notés (par l'utilisateur)</CardTitle>
                         </CardHeader>
                         <CardContent>
                             {topRatedParties.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {topRatedParties.map(party => (
                                        <Link href={`/party/${party.id}`} key={party.id} className="block group">
                                            <Card className="overflow-hidden h-full bg-secondary hover:border-primary/50">
                                                <div className="aspect-video relative w-full bg-muted">
                                                   {party.coverPhotoUrl ? (
                                                        <Image src={party.coverPhotoUrl} alt={party.name} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform"/>
                                                   ) : (
                                                       <div className="flex items-center justify-center h-full"> <ImageIcon className="h-10 w-10 text-muted-foreground/50"/></div>
                                                   )}
                                                     {/* Display user's rating for this party */}
                                                     {party.ratings?.[userId] && (
                                                         <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center space-x-1">
                                                            <Star className="h-3 w-3 text-yellow-400 fill-current" />
                                                            <span>{party.ratings[userId].toFixed(1)}</span>
                                                        </div>
                                                     )}
                                                </div>
                                                <CardContent className="p-3">
                                                     <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary">{party.name}</p>
                                                     {getDateFromTimestamp(party.date) && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1"/> {format(getDateFromTimestamp(party.date)!, 'P', { locale: fr })}</p>}
                                                </CardContent>
                                            </Card>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm text-center py-4">Aucun événement noté pour le moment.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Commentaires */}
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
                                        <div key={index} className="p-3 bg-secondary/50 rounded-md border border-border/30">
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

                 {/* Statistiques */}
                 <TabsContent value="stats">
                     <Card className="bg-card border-border">
                         <CardHeader>
                            <CardTitle>Répartition des Notes Données</CardTitle>
                             <CardDescription>Distribution des notes attribuées par {userData.displayName || userData.email.split('@')[0]}.</CardDescription>
                         </CardHeader>
                         <CardContent className="pl-2">
                              {stats.averageRating > 0 ? (
                                  <ChartContainer config={chartConfig} className="h-[150px] w-full">
                                     <BarChart accessibilityLayer data={ratingDistribution} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
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
    