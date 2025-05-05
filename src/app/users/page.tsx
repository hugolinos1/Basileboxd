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
    avatarUrl?: string;
    createdAt?: FirestoreTimestamp | Timestamp;
    // Add placeholders for potential future stats
    eventCount?: number;
    commentCount?: number;
    averageRating?: number;
}

// Helper Functions
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
    const { firebaseInitialized, loading: authLoading, initializationFailed, initializationErrorMessage } = useFirebase();

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

        if (!db) {
            console.error("[UsersListPage useEffect] Firestore 'db' instance is null even though Firebase is initialized. Setting error state.");
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
                // Ensure Firestore rules allow 'list' operation on /users for authenticated users
                const q = query(usersCollectionRef, orderBy('createdAt', 'desc')); // Order by creation date

                console.log("[fetchUsers] Executing Firestore query for users...");
                const querySnapshot = await getDocs(q);
                console.log(`[fetchUsers] Firestore query executed. Found ${querySnapshot.size} user documents.`);

                if (querySnapshot.empty) {
                    console.log("[fetchUsers] No users found in collection.");
                    setUsers([]);
                } else {
                    console.log("[fetchUsers] Mapping user documents to UserData...");
                    const usersData = querySnapshot.docs.map(doc => {
                         const data = doc.data();
                         // Basic validation
                         if (!data.uid || !data.email) {
                             console.warn(`[fetchUsers Mapping] Doc ${doc.id}: uid or email missing. Skipped.`);
                             return null;
                         }
                         // TODO: Fetch stats per user (event count, comment count) - potentially inefficient for many users.
                         // Consider denormalization or fetching stats on the user profile page instead.
                         return {
                            id: doc.id,
                            uid: data.uid,
                            email: data.email,
                            displayName: data.displayName || data.email.split('@')[0], // Fallback display name
                            avatarUrl: data.avatarUrl,
                            createdAt: data.createdAt,
                            // Placeholder stats - replace with actual data if fetched
                            eventCount: data.eventCount || 0, // Assume 0 if not present
                            commentCount: data.commentCount || 0, // Assume 0 if not present
                            averageRating: data.averageRating || 0, // Assume 0 if not present
                         } as UserData;
                    }).filter(user => user !== null) as UserData[];

                    setUsers(usersData);
                     console.log(`[fetchUsers] Users state updated with ${usersData.length} items.`);
                }

            } catch (fetchError: any) {
                console.error('[fetchUsers] Error during Firestore query or mapping:', fetchError);
                let userFriendlyError = 'Impossible de charger la liste des utilisateurs.';
                 if (fetchError instanceof FirestoreError) {
                     // Check specifically for permission errors when trying to list the 'users' collection
                     if (fetchError.code === 'permission-denied' || fetchError.code === 'unauthenticated') {
                         userFriendlyError = 'Permission refusée ou non authentifié pour lister les utilisateurs. Vérifiez les règles de sécurité Firestore pour la collection "users" (`allow list: if request.auth != null;`).';
                         console.error("Firestore Permission Denied or Unauthenticated: Check your security rules for the 'users' collection, specifically the 'list' permission for authenticated users.");
                     } else if (fetchError.code === 'unavailable') {
                         userFriendlyError = 'Service Firestore indisponible. Veuillez réessayer plus tard.';
                     } else {
                         userFriendlyError = `Erreur Firestore (${fetchError.code}): ${fetchError.message}`;
                     }
                 } else {
                     // Keep the original error message if it's not a FirestoreError
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
    }, [firebaseInitialized, authLoading, initializationFailed, initializationErrorMessage]);

    // --- Render Logic ---

    console.log("[UsersListPage Render] Loading:", loading, "Auth Loading:", authLoading, "Error:", error, "Users Count:", users.length, "Firebase Initialized:", firebaseInitialized, "Init Failed:", initializationFailed);

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
        return (
             <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
                 <Alert variant="destructive" className="max-w-lg">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erreur</AlertTitle>
                    <AlertDescription>
                         {displayError}
                         {/* Specific hint for permission errors */}
                         {error.includes("Permission refusée") && (
                            <p className="mt-2 text-xs">
                                Conseil : Vérifiez les règles de sécurité Firestore pour `/users`.
                            </p>
                         )}
                    </AlertDescription>
                 </Alert>
            </div>
        );
    }

    // Display User List only if not loading and no errors
     console.log("[UsersListPage Render] Displaying user list.");
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
                        return (
                            <Link href={`/user/${usr.uid}`} key={usr.id} className="block group">
                                <Card className="p-3 md:p-4 bg-card border border-border/50 hover:bg-secondary/50 hover:border-primary/30 transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        {/* User Info */}
                                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                            <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-border group-hover:border-primary/50 transition-colors">
                                                <AvatarImage src={usr.avatarUrl || undefined} alt={usr.displayName || usr.email} />
                                                <AvatarFallback className="bg-muted text-muted-foreground">
                                                    {getInitials(usr.displayName, usr.email)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-base md:text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                                    {usr.displayName || usr.email.split('@')[0]}
                                                </p>
                                                <p className="text-xs md:text-sm text-muted-foreground truncate">{usr.email}</p>
                                                 {joinDate && (
                                                     <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                         <Calendar className="inline h-3 w-3 mr-1" />
                                                         Inscrit {formatDistanceToNow(joinDate, { addSuffix: true, locale: fr })}
                                                     </p>
                                                 )}
                                            </div>
                                        </div>

                                        {/* Stats (Placeholder - adapt icons/labels) */}
                                        <div className="flex items-center justify-end gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground w-full sm:w-auto mt-2 sm:mt-0">
                                            <div className="flex items-center gap-1" title={`${usr.eventCount || 0} événements participés/créés`}>
                                                 <Users className="h-3.5 w-3.5 text-green-500" />
                                                 <span>{usr.eventCount || 0}</span>
                                            </div>
                                             <div className="flex items-center gap-1" title={`${usr.commentCount || 0} commentaires`}>
                                                 <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                                                 <span>{usr.commentCount || 0}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={`Note moyenne donnée: ${usr.averageRating?.toFixed(1) || 'N/A'}`}>
                                                <Star className="h-3.5 w-3.5 text-yellow-500" />
                                                <span>{usr.averageRating?.toFixed(1) || '-'}</span>
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
