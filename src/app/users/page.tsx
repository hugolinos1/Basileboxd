'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, Timestamp, FirestoreError } from 'firebase/firestore';
import { db } from '@/config/firebase';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Calendar, Users, MessageSquare, Star } from 'lucide-react';
import { useFirebase } from '@/context/FirebaseContext';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// --- Interfaces ---
interface FirestoreTimestamp { seconds: number; nanoseconds: number; }
interface UserData {
    id: string; // Document ID from Firestore
    uid: string;
    email: string;
    displayName?: string;
    pseudo?: string; // Added pseudo
    avatarUrl?: string;
    createdAt?: FirestoreTimestamp | Timestamp | Date; // Allow Date type as well after conversion
    // Add fields for stats (might be populated by backend functions later)
    eventCount?: number;
    commentCount?: number;
    averageRatingGiven?: number; // Renamed to reflect what's calculated on profile page
}

// Helper Functions
const getDateFromTimestamp = (timestamp: FirestoreTimestamp | Timestamp | Date | undefined): Date | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof Timestamp) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp; // Already a Date object
        if (typeof timestamp === 'object' && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
            const date = new Date(timestamp.seconds * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        return null;
    } catch (e) { console.error("Erreur conversion timestamp:", timestamp, e); return null; }
}

const getInitials = (name: string | null | undefined, email: string): string => {
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return '?';
};


// --- Users List Page Component ---
export default function UsersListPage() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true); // Combined loading state
    const [error, setError] = useState<string | null>(null);
    // Use context for Firebase status and auth loading
    const { user: currentUser, firebaseInitialized, loading: authLoading, initializationFailed, initializationErrorMessage } = useFirebase();

    useEffect(() => {
        console.log("[UsersListPage useEffect] State Check - Initialized:", firebaseInitialized, "Init Failed:", initializationFailed, "Auth Loading:", authLoading);

        // If Firebase init failed, set error and stop loading
        if (initializationFailed) {
          console.error("[UsersListPage useEffect] Firebase initialization failed. Setting error state.");
          setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
          setLoading(false);
          return;
        }

        // If Firebase is not yet initialized OR user auth state is still loading, keep showing loader
        if (!firebaseInitialized || authLoading) {
          console.log("[UsersListPage useEffect] Waiting for Firebase init and user auth state...");
          setLoading(true); // Ensure loading stays true while waiting
          return;
        }

        // --- Firebase is initialized and auth state is known ---

         // Check if user is authenticated (required for listing users according to common rules)
         if (!currentUser) {
             console.log("[UsersListPage useEffect] User not authenticated. Cannot fetch user list.");
             //setError("Veuillez vous connecter pour voir la liste des utilisateurs."); // Uncomment if you want to show an error instead
             setUsers([]); // Ensure user list is empty
             setLoading(false);
             return;
         }

        if (!db) {
            console.error("[UsersListPage useEffect] Firestore 'db' instance is null. Setting error state.");
            setError("La base de données Firestore n'est pas disponible.");
            setLoading(false);
            return;
        }

        const fetchUsers = async () => {
            console.log("[fetchUsers] Starting user fetch. setLoading(true), setError(null).");
            setLoading(true); // Keep loading true as fetch starts
            setError(null); // Reset error for this attempt

            try {
                const usersCollectionRef = collection(db, 'users');
                 // Querying the users collection. Ensure Firestore rules allow this.
                // Ordering by 'createdAt' descending. Ensure this field exists and is indexed.
                const q = query(usersCollectionRef, orderBy('createdAt', 'desc')); // Try ordering again

                console.log("[fetchUsers] Executing Firestore query for users collection...");
                const querySnapshot = await getDocs(q);
                console.log(`[fetchUsers] Firestore query executed. Found ${querySnapshot.size} documents.`); // Log snapshot size BEFORE mapping

                if (querySnapshot.empty) {
                    console.log("[fetchUsers] No users found in 'users' collection.");
                    setUsers([]);
                } else {
                    console.log("[fetchUsers] Mapping user documents to UserData...");
                    const usersData = querySnapshot.docs.map(doc => {
                         const data = doc.data();
                         // console.log(`[fetchUsers Mapping] Doc ID: ${doc.id}, Raw data:`, JSON.stringify(data)); // Verbose log

                         // Basic validation
                         if (!data.uid || !data.email) {
                             console.warn(`[fetchUsers Mapping] Doc ${doc.id}: uid or email missing. Skipped. Data:`, data);
                             return null;
                         }
                         // Use validated/converted timestamp or undefined
                         const createdAtTimestamp = getDateFromTimestamp(data.createdAt);

                         const userDataObject: UserData = {
                            id: doc.id,
                            uid: data.uid,
                            email: data.email,
                            displayName: data.displayName || data.email.split('@')[0], // Fallback display name
                            pseudo: data.pseudo, // Include pseudo
                            avatarUrl: data.avatarUrl,
                            createdAt: createdAtTimestamp || undefined, // Use the validated/converted timestamp or undefined
                            // Retrieve stats if they exist, otherwise default to 0
                            eventCount: data.eventCount || 0,
                            commentCount: data.commentCount || 0,
                            averageRatingGiven: data.averageRatingGiven || 0, // Use the correct field name
                         };
                         // console.log(`[fetchUsers Mapping] Doc ${doc.id} mapped successfully:`, userDataObject);
                         return userDataObject;
                    }).filter(user => user !== null) as UserData[]; // Filter out nulls from validation failures

                     // Sort by createdAt DESCENDING *after* fetching and mapping
                     // Firestore should handle sorting now with the orderBy clause, but this client-side sort is a fallback
                    usersData.sort((a, b) => {
                        const timeA = getDateFromTimestamp(a.createdAt)?.getTime() || 0;
                        const timeB = getDateFromTimestamp(b.createdAt)?.getTime() || 0;
                        return timeB - timeA;
                    });

                    console.log(`[fetchUsers] Mapped users data (after filter and sort): ${usersData.length} items`); // Log the mapped data AFTER filtering
                    setUsers(usersData);
                    console.log(`[fetchUsers] Users state updated with ${usersData.length} items.`);
                }

            } catch (fetchError: any) {
                console.error('[fetchUsers] Error during Firestore query or mapping:', fetchError);
                let userFriendlyError = "Impossible de charger la liste des utilisateurs.";
                 if (fetchError instanceof FirestoreError) {
                      if (fetchError.code === 'permission-denied' || fetchError.code === 'unauthenticated') {
                          userFriendlyError = "Permission refusée pour lister les utilisateurs. Vérifiez les règles Firestore.";
                          console.error("Firestore Permission Denied: Check your security rules for the 'users' collection. Ensure authenticated users have 'list' or 'get' permission.");
                     } else if (fetchError.code === 'unavailable') {
                         userFriendlyError = 'Service Firestore indisponible. Veuillez réessayer plus tard.';
                     } else if (fetchError.code === 'failed-precondition' && fetchError.message.includes('index')) {
                          userFriendlyError = "Index Firestore manquant pour la requête. Vérifiez la console Firebase pour créer l'index requis (probablement sur le champ 'createdAt' de la collection 'users').";
                          console.error("Firestore Index Missing: The query requires an index (likely on 'createdAt' desc). Check the Firebase console error message for a link to create it automatically.");
                     }
                      else {
                         userFriendlyError = `Erreur Firestore (${fetchError.code}): ${fetchError.message}`;
                     }
                 } else {
                     userFriendlyError = `Erreur inattendue: ${fetchError.message}`;
                 }
                setError(userFriendlyError);
                setUsers([]); // Ensure users state is empty on error
            } finally {
                 console.log("[fetchUsers] Fetch attempt finished. setLoading(false).");
                setLoading(false); // Fetch is complete (success or error)
            }
        };

        fetchUsers();

    // Include all dependencies that trigger re-fetching or state checks
    }, [firebaseInitialized, authLoading, initializationFailed, initializationErrorMessage, currentUser]);

    // --- Render Logic ---

    console.log("[UsersListPage Render] Loading:", loading, "Auth Loading:", authLoading, "Error:", error, "Users Count:", users.length, "Firebase Initialized:", firebaseInitialized, "Init Failed:", !!initializationFailed);

    // Show Skeleton Loader if EITHER context is loading OR page is fetching data
    if (loading) {
        console.log("[UsersListPage Render] Displaying Skeleton Loader.");
        return (
            <div className="container mx-auto px-4 py-12">
                <Skeleton className="h-8 w-1/3 mb-8 bg-muted" />
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Card key={i} className="p-4 bg-card border border-border/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="h-12 w-12 rounded-full bg-muted" />
                                    <div className="space-y-1">
                                        <Skeleton className="h-5 w-32 bg-muted" />
                                        <Skeleton className="h-4 w-40 bg-muted" />
                                    </div>
                                </div>
                                {/* Skeleton for stats */}
                                <div className="hidden md:flex items-center gap-6 text-sm">
                                     <Skeleton className="h-5 w-16 bg-muted" />
                                     <Skeleton className="h-5 w-16 bg-muted" />
                                     <Skeleton className="h-5 w-16 bg-muted" />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    // Show Error Alert if initialization failed OR a fetch error occurred
    if (error) { // Covers both initialization errors and fetch errors
         const displayError = error; // Error state now holds the specific message
        // Note: Removed console.error here, Alert component handles display
        return (
             <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
                 <Alert variant="destructive" className="max-w-lg">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erreur</AlertTitle>
                    <AlertDescription>
                         {displayError}
                         {/* Specific hints based on error */}
                         {(error.includes("Permission refusée") || error.includes("unauthenticated")) && (
                            <p className="mt-2 text-xs">
                                Conseil : Vérifiez que vous êtes connecté et que les règles de sécurité Firestore pour la collection `/users` autorisent l'opération `list` ou `get` pour les utilisateurs authentifiés (ex: `allow read: if request.auth != null;`).
                            </p>
                         )}
                          {(error.includes("Index Firestore manquant")) && (
                             <p className="mt-2 text-xs">
                                 Conseil : La requête nécessite un index Firestore. Ouvrez la console Firebase, allez dans Firestore Database -&gt; Index, et créez l'index composite suggéré dans les messages d'erreur de la console Firebase (Collection='users', Field='createdAt', Order='Descending').
                             </p>
                          )}
                          {initializationFailed && (
                            <p className="mt-2 text-xs">
                                Assurez-vous que les variables d'environnement Firebase sont correctement définies et que le serveur de développement a été redémarré.
                            </p>
                         )}
                    </AlertDescription>
                 </Alert>
            </div>
        );
    }

     // Handle case where user is not logged in (and fetch wasn't attempted or returned empty due to rules)
     if (!currentUser && !loading && !error) {
         return (
             <div className="container mx-auto px-4 py-12 text-center">
                 <p className="text-muted-foreground text-lg">Veuillez vous <Link href="/auth" className="text-primary hover:underline">connecter</Link> pour voir la liste des utilisateurs.</p>
             </div>
         );
     }


    // Display User List only if not loading and no errors
     console.log("[UsersListPage Render] Displaying user list. Actual users in state:", users); // Log actual state data
    return (
        <div className="container mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8 text-primary flex items-center gap-2">
                <Users className="h-7 w-7" /> Utilisateurs ({users.length})
            </h1>
            {users.length === 0 ? (
                <p className="text-muted-foreground text-center py-10">Aucun utilisateur trouvé.</p>
            ) : (
                <div className="space-y-3">
                    {users.map((usr) => {
                        const joinDate = getDateFromTimestamp(usr.createdAt);
                        // Use pseudo if available, otherwise displayName, otherwise fallback
                        const displayUsername = usr.pseudo || usr.displayName || usr.email.split('@')[0];
                        // Calculate average rating safely
                        const avgRating = usr.averageRatingGiven ? usr.averageRatingGiven.toFixed(1) : '-';
                        const eventCount = usr.eventCount ?? 0; // Use nullish coalescing for default 0
                        const commentCount = usr.commentCount ?? 0; // Use nullish coalescing for default 0

                        return (
                            <Link href={`/user/${usr.uid}`} key={usr.id} className="block group">
                                <Card className="p-3 md:p-4 bg-card border border-border/50 hover:bg-secondary/50 hover:border-primary/30 transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        {/* User Info */}
                                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                            <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-border group-hover:border-primary/50 transition-colors">
                                                <AvatarImage src={usr.avatarUrl || undefined} alt={displayUsername} />
                                                <AvatarFallback className="bg-muted text-muted-foreground">
                                                    {getInitials(displayUsername, usr.email)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-base md:text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                                    {displayUsername}
                                                </p>
                                                <p className="text-xs md:text-sm text-muted-foreground truncate">{usr.email}</p>
                                                 {joinDate ? (
                                                     <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                         <Calendar className="inline h-3 w-3 mr-1" />
                                                         Inscrit {formatDistanceToNow(joinDate, { addSuffix: true, locale: fr })}
                                                     </p>
                                                 ) : (
                                                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                                                         <Calendar className="inline h-3 w-3 mr-1" />
                                                         Date d'inscription inconnue
                                                      </p>
                                                 )}
                                            </div>
                                        </div>

                                        {/* Stats - Use fetched data with defaults */}
                                        <div className="flex items-center justify-end gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground w-full sm:w-auto mt-2 sm:mt-0">
                                            <div className="flex items-center gap-1" title={`${eventCount} événements participés/créés`}>
                                                 <Users className="h-3.5 w-3.5 text-green-500" />
                                                 <span>{eventCount}</span>
                                            </div>
                                             <div className="flex items-center gap-1" title={`${commentCount} commentaires`}>
                                                 <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                                                 <span>{commentCount}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={`Note moyenne donnée: ${avgRating}`}>
                                                <Star className="h-3.5 w-3.5 text-yellow-500" />
                                                <span>{avgRating}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

