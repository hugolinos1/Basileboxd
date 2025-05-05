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
import { Star, MessageSquare, CalendarDays, Edit2, Loader2, AlertTriangle, ImageIcon, Users } from 'lucide-react'; // Added Users icon
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

// --- Interfaces ---
interface FirestoreTimestamp { seconds: number; nanoseconds: number; }
// Updated UserData interface to match Firestore structure
interface UserData {
    id: string; // Document ID from Firestore (useful if needed later)
    uid: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
    createdAt?: FirestoreTimestamp | Timestamp; // Assuming this field exists in Firestore doc
}
interface PartyData {
    id: string;
    name: string;
    coverPhotoUrl?: string;
    ratings?: { [userId: string]: number };
    date?: FirestoreTimestamp | Timestamp;
    comments?: CommentData[];
    participants?: string[]; // Array of user UIDs
    createdBy: string; // Added createdBy field
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

// Calculate average rating GIVEN BY this specific user across all parties they rated
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

// Calculate the distribution of ratings GIVEN BY this specific user
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

// Helper to calculate overall average rating RECEIVED by a party (across all users)
const calculatePartyAverageRating = (party: PartyData): number => {
    if (!party.ratings) return 0;
    const allRatings = Object.values(party.ratings);
    if (allRatings.length === 0) return 0;
    const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
    return sum / allRatings.length;
};

const getInitials = (name: string | null | undefined, email: string): string => {
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return '?';
};


// --- User Profile Page Component ---
export default function UserProfilePage() {
    const params = useParams();
    const profileUserId = params.id as string; // The ID of the user whose profile we're viewing
    const router = useRouter();
    const { user: currentUser, loading: authLoading, firebaseInitialized } = useFirebase(); // Logged-in user

    const [profileUserData, setProfileUserData] = useState<UserData | null>(null); // Data of the profile being viewed
    const [userParties, setUserParties] = useState<PartyData[]>([]); // Parties created or participated in BY THE PROFILE USER
    const [userComments, setUserComments] = useState<CommentData[]>([]); // Comments made BY THE PROFILE USER
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isOwnProfile = currentUser?.uid === profileUserId;

    useEffect(() => {
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

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            console.log(`[UserProfilePage] Récupération des données pour l'utilisateur ${profileUserId}`);
            try {
                // 1. Fetch Profile User Data from 'users' collection
                const userDocRef = doc(db, 'users', profileUserId);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    console.error(`[UserProfilePage] Utilisateur ${profileUserId} non trouvé dans Firestore.`);
                    throw new Error("Utilisateur non trouvé.");
                }
                const fetchedUserData = { id: userDocSnap.id, ...userDocSnap.data() } as UserData;
                console.log("[UserProfilePage] Données utilisateur récupérées:", fetchedUserData);
                setProfileUserData(fetchedUserData);

                // 2. Fetch Parties where the profile user is a participant
                // We need ALL parties the user participated in to calculate stats accurately.
                const partiesRef = collection(db, 'parties');
                const participatedQuery = query(partiesRef, where('participants', 'array-contains', profileUserId));

                console.log(`[UserProfilePage] Récupération des fêtes pour l'utilisateur ${profileUserId}`);
                const partiesSnapshot = await getDocs(participatedQuery);
                console.log(`[UserProfilePage] ${partiesSnapshot.size} fêtes trouvées.`);

                const partiesData: PartyData[] = partiesSnapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                } as PartyData));
                setUserParties(partiesData); // Store all participated parties

                 // 3. Extract User's Comments from the fetched parties data
                 console.log(`[UserProfilePage] Extraction des commentaires pour l'utilisateur ${profileUserId}`);
                const commentsData: CommentData[] = [];
                partiesData.forEach(party => {
                    if (party.comments) {
                         party.comments.forEach(comment => {
                            if (comment.userId === profileUserId) {
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
                 console.log(`[UserProfilePage] ${commentsData.length} commentaires trouvés pour l'utilisateur.`);
                 setUserComments(commentsData);


            } catch (err: any) {
                console.error("Erreur lors de la récupération des données utilisateur:", err);
                 let userFriendlyError = err.message || "Impossible de charger le profil.";
                  if (err instanceof FirestoreError && err.code === 'permission-denied') {
                     userFriendlyError = "Permission refusée. Vérifiez les règles Firestore.";
                 }
                setError(userFriendlyError);
                setProfileUserData(null); // Reset data on error
                setUserParties([]);
                setUserComments([]);
            } finally {
                console.log("[UserProfilePage] Récupération des données terminée.");
                setLoading(false);
            }
        };

        fetchData();

    }, [profileUserId, firebaseInitialized, authLoading]); // Re-run if profileUserId changes or Firebase init status changes

    // --- Memoized Calculations ---
    const stats = useMemo(() => {
        if (!profileUserData || !userParties) return { eventCount: 0, commentCount: 0, averageRatingGiven: 0 };
        const avgRatingGiven = calculateAverageRatingGiven(userParties, profileUserId);
        return {
            eventCount: userParties.length, // Total parties participated in/created
            commentCount: userComments.length,
            averageRatingGiven: avgRatingGiven, // Average rating this user GAVE
        };
    }, [profileUserData, userParties, userComments, profileUserId]); // Depend on profileUserId

     const ratingDistributionGiven = useMemo(() => {
        if (!userParties || !profileUserId) return [];
         return calculateRatingDistribution(userParties, profileUserId); // Distribution of ratings GIVEN by this user
    }, [userParties, profileUserId]); // Depend on profileUserId

     // Parties CREATED by this user, sorted by overall average rating (descending)
     const topRatedCreatedParties = useMemo(() => {
        return userParties
            .filter(party => party.createdBy === profileUserId) // Filter for created parties
            .sort((a, b) => {
                const overallAvgA = calculatePartyAverageRating(a);
                const overallAvgB = calculatePartyAverageRating(b);
                return overallAvgB - overallAvgA; // Sort descending by overall average
            })
            .slice(0, 4);
    }, [userParties, profileUserId]); // Depend on profileUserId

    // Parties PARTICIPATED IN (including created), sorted by date (descending)
    const recentParticipatedParties = useMemo(() => {
        return [...userParties].sort((a, b) => {
            const timeA = getDateFromTimestamp(a.date ?? a.createdAt)?.getTime() || 0; // Use event date primarily
            const timeB = getDateFromTimestamp(b.date ?? b.createdAt)?.getTime() || 0;
            return timeB - timeA; // Sort descending by event date
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

    if (!profileUserData) {
        // This case should be covered by the error state if fetch failed,
        // but good to have a fallback.
        return <div className="container mx-auto px-4 py-12 text-center">Utilisateur non trouvé.</div>;
    }

    const joinDate = getDateFromTimestamp(profileUserData.createdAt);

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            {/* User Header */}
            <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mb-8 border-b border-border pb-8">
                <Avatar className="h-24 w-24 md:h-32 md:w-32 border-2 border-primary relative group">
                    <AvatarImage src={profileUserData.avatarUrl || undefined} alt={profileUserData.displayName || profileUserData.email} />
                    <AvatarFallback className="text-4xl bg-muted">{getInitials(profileUserData.displayName, profileUserData.email)}</AvatarFallback>
                    {/* Edit button - only visible to the logged-in user viewing their own profile */}
                     {isOwnProfile && (
                        <button className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer">
                            <Edit2 className="h-8 w-8 text-white" />
                            <span className="sr-only">Modifier photo</span>
                            {/* TODO: Add Dialog/Modal for upload */}
                        </button>
                     )}
                </Avatar>
                <div className="flex-1 space-y-1 text-center md:text-left">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">{profileUserData.displayName || profileUserData.email.split('@')[0]}</h1>
                    <p className="text-sm text-muted-foreground">{profileUserData.email}</p>
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
                        <p className="text-xl md:text-2xl font-bold text-primary">{stats.averageRatingGiven.toFixed(1)} ★</p>
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

                {/* Activité Récente (Last Participated Parties) */}
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

                 {/* Mieux Notés (Top Rated CREATED Parties) */}
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
                                         const overallAvg = calculatePartyAverageRating(party); // Calculate overall average
                                        return (
                                             <Link href={`/party/${party.id}`} key={party.id} className="block group">
                                                 <Card className="overflow-hidden h-full bg-secondary hover:border-primary/50">
                                                     <div className="aspect-video relative w-full bg-muted">
                                                        {party.coverPhotoUrl ? (
                                                             <Image src={party.coverPhotoUrl} alt={party.name} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform"/>
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full"> <ImageIcon className="h-10 w-10 text-muted-foreground/50"/></div>
                                                        )}
                                                          {/* Display OVERALL average rating for the party */}
                                                          {overallAvg > 0 && (
                                                              <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center space-x-1">
                                                                 <Star className="h-3 w-3 text-yellow-400 fill-current" />
                                                                 <span>{overallAvg.toFixed(1)}</span>
                                                             </div>
                                                          )}
                                                     </div>
                                                     <CardContent className="p-3">
                                                          <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary">{party.name}</p>
                                                          {getDateFromTimestamp(party.date) && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1"/> {format(getDateFromTimestamp(party.date)!, 'P', { locale: fr })}</p>}
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
                             <CardDescription>Distribution des notes attribuées par {profileUserData.displayName || profileUserData.email.split('@')[0]}.</CardDescription>
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
