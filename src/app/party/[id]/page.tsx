// src/app/party/[id]/page.tsx
'use client';

import { useEffect, useState, useMemo, useRef, ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
// Import necessary Firestore functions, including FieldValue
import { doc, getDoc, updateDoc, arrayUnion, Timestamp, onSnapshot, FieldValue, collection, query, where, getDocs, writeBatch, limit, serverTimestamp, collectionGroup } from 'firebase/firestore'; // Import serverTimestamp
import { db, storage } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { format, formatDistanceToNow } from 'date-fns'; // Import formatDistanceToNow
import { fr } from 'date-fns/locale';
import { Star, Send, User, MapPin, CalendarDays, Image as ImageIcon, Video, Music, Loader2, AlertTriangle, Upload, Edit2, X, File as FileIcon, UserPlus } from 'lucide-react'; // Added FileIcon and UserPlus
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import ReactPlayer from 'react-player/lazy';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import type { ChartConfig } from "@/components/ui/chart"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
// Import centralized uploader and helpers
import {
  uploadFile,
  getFileType,
  ACCEPTED_MEDIA_TYPES,
  ACCEPTED_COVER_PHOTO_TYPES,
  MAX_FILE_SIZE,
  COMPRESSED_COVER_PHOTO_MAX_SIZE_MB,
} from '@/services/media-uploader';
import { coverPhotoSchema } from '@/services/validation-schemas'; 
import { Skeleton } from '@/components/ui/skeleton'; 
import { Combobox } from '@/components/ui/combobox'; // Import Combobox

// --- Interfaces ---
interface FirestoreTimestamp { seconds: number; nanoseconds: number; }

interface Comment {
    userId: string;
    email: string;
    avatar?: string | null;
    text: string;
    timestamp: Timestamp | FirestoreTimestamp | Date | FieldValue; 
}
interface MediaItem { url: string; type: 'image' | 'video' | 'audio' | 'autre'; }
interface PartyData {
    id: string;
    name: string;
    description: string;
    date: FirestoreTimestamp | Timestamp;
    location: string;
    createdBy: string;
    creatorEmail: string;
    participants: string[]; // Array of UIDs
    participantEmails?: string[]; // Array of emails
    mediaUrls: string[];
    coverPhotoUrl?: string;
    ratings: { [userId: string]: number };
    comments: Comment[]; // Use the Comment type defined above
    createdAt: FirestoreTimestamp | Timestamp;
}
// Interface for User data fetched from Firestore 'users' collection
interface UserProfile {
    id: string; // Document ID
    uid: string;
    email: string;
    displayName?: string;
    pseudo?: string;
    avatarUrl?: string;
}


// --- Helper Functions ---


// --- Composants ---

// StarRating (inchangé)
const StarRating = ({ totalStars = 5, rating, onRate, disabled = false, size = 'h-6 w-6' }: { totalStars?: number, rating: number, onRate: (rating: number) => void, disabled?: boolean, size?: string }) => {
  const [hoverRating, setHoverRating] = useState(0);
  return ( <div className={`flex space-x-1 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}> {[...Array(totalStars)].map((_, index) => { const starValue = index + 1; const isHalf = starValue - 0.5 === (hoverRating || rating); const filled = starValue <= (hoverRating || rating); return ( <Star key={index} className={cn( size, 'transition-colors duration-150', filled ? 'text-yellow-400 fill-current' : 'text-gray-600', !disabled && 'hover:text-yellow-300', isHalf && 'text-yellow-400' )} onClick={() => !disabled && onRate(starValue)} onMouseEnter={() => !disabled && setHoverRating(starValue)} onMouseLeave={() => !disabled && setHoverRating(0)} /> ); })} </div> );
};

// RatingDistributionChart (inchangé)
const RatingDistributionChart = ({ ratings }: { ratings: { [userId: string]: number } }) => {
  const ratingCounts = useMemo(() => { const counts: { rating: number; votes: number; fill: string }[] = Array.from({ length: 10 }, (_, i) => ({ rating: (i + 1) * 0.5, votes: 0, fill: '' })); Object.values(ratings).forEach(rating => { const index = Math.round(rating * 2) - 1; if (index >= 0 && index < 10) { counts[index].votes++; } }); return counts.map(c => ({ ...c, fill: "hsl(var(--primary))" })); }, [ratings]);
  const totalVotes = useMemo(() => Object.keys(ratings).length, [ratings]);
  const chartConfig = { votes: { label: "Votes", color: "hsl(var(--primary))", }, } satisfies ChartConfig
  if (totalVotes === 0) { return <p className="text-sm text-muted-foreground text-center py-4">Pas encore de notes.</p>; }
  return ( <div className="w-full"> <div className="flex justify-between items-center mb-2 px-1"> <p className="text-sm font-medium text-muted-foreground">Répartition</p> <p className="text-sm font-medium text-muted-foreground">{totalVotes} vote{totalVotes > 1 ? 's' : ''}</p> </div> <ChartContainer config={chartConfig} className="h-[100px] w-full"> <BarChart accessibilityLayer data={ratingCounts} margin={{ top: 5, right: 5, left: -30, bottom: -10 }} barCategoryGap={2} > <XAxis dataKey="rating" tickLine={false} axisLine={false} tickMargin={4} tickFormatter={(value) => value % 1 === 0 ? `${value}.0` : `${value}`} fontSize={10} interval={1} /> <YAxis hide={true} /> <RechartsTooltip cursor={false} content={<ChartTooltipContent hideLabel hideIndicator />} formatter={(value, name, props) => [`${value} votes`, `${props.payload.rating} étoiles`]} /> <Bar dataKey="votes" radius={2} /> </BarChart> </ChartContainer> <div className="flex justify-between items-center mt-1 px-1"> <Star className="h-4 w-4 text-yellow-400 fill-current" /> <Star className="h-4 w-4 text-yellow-400 fill-current" /> <Star className="h-4 w-4 text-yellow-400 fill-current" /> <Star className="h-4 w-4 text-yellow-400 fill-current" /> <Star className="h-4 w-4 text-yellow-400 fill-current" /> </div> </div> );
};

// --- Composant Principal ---
export default function PartyDetailsPage() {
  const params = useParams();
  const partyId = params.id as string;
  const router = useRouter();
  const { user, firebaseInitialized, loading: userLoading, initializationFailed, initializationErrorMessage, isAdmin } = useFirebase();
  const { toast } = useToast();

  const [party, setParty] = useState<PartyData | null>(null);
  const [commentsData, setCommentsData] = useState<Comment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]); // State to store all users for Combobox
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [userRating, setUserRating] = useState<number>(0);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [showAddSouvenirDialog, setShowAddSouvenirDialog] = useState(false);
  const [souvenirFiles, setSouvenirFiles] = useState<File[]>([]);
  const [souvenirPreviews, setSouvenirPreviews] = useState<string[]>([]);
  const [souvenirUploadProgress, setSouvenirUploadProgress] = useState<Record<string, number>>({});
  const [isUploadingSouvenirs, setIsUploadingSouvenirs] = useState(false);
  const [showEditCoverDialog, setShowEditCoverDialog] = useState(false);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [newCoverPreview, setNewCoverPreview] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [showAddParticipantDialog, setShowAddParticipantDialog] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [showEditPartyNameDialog, setShowEditPartyNameDialog] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [isUpdatingPartyName, setIsUpdatingPartyName] = useState(false);


  const isCreator = useMemo(() => user && party && user.uid === party.createdBy, [user, party]);
  const canManageParticipants = useMemo(() => user && party && (user.uid === party.createdBy || isAdmin), [user, party, isAdmin]);


  const participantColors = [ 'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-600', 'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600', ];
  const getInitials = (email: string | null | undefined): string => { if (!email) return '?'; const parts = email.split('@')[0]; return parts[0]?.toUpperCase() || '?'; };

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

  // --- Effects ---
  useEffect(() => {
    if (!firebaseInitialized || userLoading) {
       console.log("[PartyDetailsPage] En attente de l'init/auth Firebase...");
       setPageLoading(true);
       return;
    }

     if (initializationFailed) {
         console.error("[PartyDetailsPage] Echec init Firebase:", initializationErrorMessage);
         setError(initializationErrorMessage || "Échec de l'initialisation de Firebase.");
         setPageLoading(false);
         return;
     }

    if (!partyId) { setError("ID de la fête manquant."); setPageLoading(false); return; }
    if (!db) { setError("La base de données Firestore n'est pas disponible."); setPageLoading(false); return; }

    console.log(`[PartyDetailsPage] Initialisé. Mise en place du listener snapshot pour la fête ${partyId}`);
    setPageLoading(true);
    setError(null);
    const partyDocRef = doc(db, 'parties', partyId);

    const unsubscribeParty = onSnapshot(partyDocRef, (docSnap) => {
      if (docSnap.exists()) {
        console.log(`[PartyDetailsPage] Snapshot reçu pour ${partyId}.`);
        const data = { id: docSnap.id, ...docSnap.data() } as PartyData;
        setParty(data);
        setNewPartyName(data.name); // Initialize newPartyName with current party name
        calculateAndSetAverageRating(data.ratings);
        if (user && data.ratings && data.ratings[user.uid]) {
            setUserRating(data.ratings[user.uid]);
        } else {
            setUserRating(0);
        }
        // Comments are now handled by a separate listener
        setPageLoading(false); // Potentially set loading false earlier if party data is enough
      } else {
        console.log(`[PartyDetailsPage] Document ${partyId} n'existe pas.`);
        setError('Fête non trouvée.');
        setParty(null);
        setPageLoading(false);
      }
    }, (snapshotError: any) => {
        console.error('[PartyDetailsPage] Erreur listener snapshot fête:', snapshotError);
         let userFriendlyError = 'Impossible de charger les détails de la fête en temps réel.';
         if (snapshotError.code === 'permission-denied') {
             userFriendlyError = 'Permission refusée. Vérifiez les règles Firestore pour la collection "parties".';
              console.error("Firestore Permission Denied: Check your security rules for the 'parties' collection.");
         } else if (snapshotError.code === 'unauthenticated') {
              userFriendlyError = 'Non authentifié.';
         }
         setError(userFriendlyError);
        setPageLoading(false);
    });
    
    // Listener for comments subcollection
    const commentsRef = collection(db, 'parties', partyId, 'comments');
    const commentsQuery = query(commentsRef, orderBy('timestamp', 'desc'));
    
    const unsubscribeComments = onSnapshot(commentsQuery, (querySnapshot) => {
        console.log(`[PartyDetailsPage] Snapshot reçu pour les commentaires de ${partyId}. Nombre de commentaires: ${querySnapshot.size}`);
        const fetchedComments: Comment[] = [];
        querySnapshot.forEach((doc) => {
            fetchedComments.push({ id: doc.id, ...doc.data() } as Comment);
        });
        setCommentsData(fetchedComments);
        setPageLoading(false); // Set loading false after comments are also fetched
    }, (snapshotError: any) => {
         console.error('[PartyDetailsPage] Erreur listener snapshot commentaires:', snapshotError);
         let userFriendlyError = 'Impossible de charger les commentaires en temps réel.';
         if (snapshotError.code === 'permission-denied') {
             userFriendlyError = 'Permission refusée. Vérifiez les règles de sécurité Firestore pour la sous-collection "comments".';
              console.error("Firestore Permission Denied: Check your security rules for the 'comments' subcollection.");
         } else if (snapshotError.code === 'unauthenticated') {
             userFriendlyError = 'Non authentifié. Veuillez vous connecter pour voir les commentaires.';
         }
         setError(userFriendlyError); // Show error, but party data might still be valid
         setPageLoading(false);
    });


    return () => {
        console.log(`[PartyDetailsPage] Nettoyage des listeners snapshot pour ${partyId}`);
        unsubscribeParty();
        unsubscribeComments();
    }

  }, [partyId, user, firebaseInitialized, userLoading, initializationFailed, initializationErrorMessage]); 

  // Fetch all users for participant Combobox
   useEffect(() => {
    const fetchAllUsers = async () => {
        if (!db) {
             console.log("[PartyDetailsPage - fetchAllUsers] DB pas prêt. Attente...");
             return;
        }
        console.log("[PartyDetailsPage - fetchAllUsers] Récupération de tous les utilisateurs...");
        try {
            const usersCollectionRef = collection(db, 'users');
            const usersSnapshot = await getDocs(usersCollectionRef);
            const fetchedUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setAllUsers(fetchedUsers);
             console.log("[PartyDetailsPage - fetchAllUsers] Utilisateurs récupérés:", fetchedUsers.length, fetchedUsers.map(u => u.uid));
        } catch (error) {
            console.error("[PartyDetailsPage - fetchAllUsers] Erreur lors de la récupération de tous les utilisateurs:", error);
            toast({ title: "Erreur Utilisateurs", description: "Impossible de charger la liste des utilisateurs pour l'ajout.", variant: "destructive" });
        }
    };

    if (firebaseInitialized && db) {
        fetchAllUsers();
    }
   }, [firebaseInitialized, db, toast]);

   useEffect(() => {
        return () => {
            souvenirPreviews.forEach(URL.revokeObjectURL);
            if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
        }
   }, [souvenirPreviews, newCoverPreview]);


  // --- Helper Functions ---
  const calculateAndSetAverageRating = (ratings: { [userId: string]: number } | undefined) => {
    if (!ratings) { setAverageRating(0); return; }
    const allRatings = Object.values(ratings);
    if (allRatings.length === 0) { setAverageRating(0); return; }
    const sum = allRatings.reduce((acc, rating) => acc + (rating || 0), 0);
    setAverageRating(sum / allRatings.length);
  };

  const renderMedia = (url: string, index: number) => {
     const onError = (e: any) => { console.error(`Erreur média ${url}:`, e); setPlayerError(`Erreur chargement média`); }
     const isVideo = /\.(mp4|mov|avi|webm)$/i.test(url) || url.includes('video') || url.includes('youtube.com') || url.includes('vimeo.com');
     const isAudio = /\.(mp3|wav|ogg|aac)$/i.test(url) || url.includes('audio');
     const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('image');

     if (isVideo) { return ( <div key={index} className="aspect-video bg-black rounded-lg overflow-hidden relative shadow-md"> {playerError && <div className="absolute inset-0 flex items-center justify-center bg-muted text-destructive-foreground p-4 text-center">Erreur chargement vidéo</div>} <ReactPlayer url={url} controls width="100%" height="100%" onError={onError} className="absolute top-0 left-0" config={{ file: { attributes: { controlsList: 'nodownload' } } }} /> </div> ); }
     else if (isAudio) { return ( <div key={index} className="w-full bg-card p-3 rounded-lg shadow"> <ReactPlayer url={url} controls width="100%" height="40px" onError={onError}/> {playerError && <p className="text-destructive text-xs mt-1">Erreur chargement audio</p>} </div> ); }
     else if (isImage) { return ( <div key={index} className="relative aspect-square w-full overflow-hidden rounded-lg shadow-md group"> <Image src={url} alt={`Souvenir ${index + 1}`} layout="fill" objectFit="cover" className="transition-transform duration-300 group-hover:scale-105" loading="lazy" onError={onError} data-ai-hint="souvenir fête photo" /> {playerError && <div className="absolute inset-0 flex items-center justify-center bg-muted text-destructive-foreground p-4 text-center">Erreur chargement image</div>} </div> ); }
     return ( <div key={index} className="bg-secondary rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground shadow"> <FileIcon className="h-4 w-4" /> <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate"> Média {index + 1} </a> </div> );
   };

  // --- Event Handlers ---

  const handleRateParty = async (newRating: number) => {
     if (!user || !party || !db || !firebaseInitialized) { toast({ title: 'Erreur', description: 'Impossible de noter pour le moment.', variant: 'destructive' }); return; }
     setIsRating(true);
     try {
         const partyDocRef = doc(db, 'parties', party.id);
         await updateDoc(partyDocRef, {
             [`ratings.${user.uid}`]: newRating
         });
         toast({ title: 'Note envoyée', description: `Vous avez noté cette fête ${newRating} étoiles.` });
     } catch (rateError: any) {
         console.error("Erreur note:", rateError);
         let description = rateError.message || 'Impossible d\'envoyer la note.';
         if (rateError.code === 'permission-denied') {
            description = 'Permissions insuffisantes pour noter cet événement.';
         }
         toast({ title: 'Erreur', description: description, variant: 'destructive' });
     } finally {
         setIsRating(false);
     }
  };

  const handleAddComment = async () => {
    if (!user || !party || !comment.trim() || !db || !firebaseInitialized) {
      toast({ title: 'Erreur', description: 'Impossible d\'ajouter un commentaire.', variant: 'destructive' });
      return;
    }
    setIsSubmittingComment(true);
    try {
      const commentsCollectionRef = collection(db, 'parties', party.id, 'comments');
      const newCommentData: Omit<Comment, 'id'> = { // Omit id as it will be auto-generated
        userId: user.uid,
        email: user.email || 'anonyme',
        avatar: user.photoURL ?? null,
        text: comment.trim(),
        timestamp: serverTimestamp(),
        partyId: party.id, // ensure partyId is included
      };

      await addDoc(commentsCollectionRef, newCommentData);

      setComment('');
      toast({ title: 'Commentaire ajouté' });
    } catch (commentError: any) {
        console.error('Erreur commentaire:', commentError);
        let errorMessage = commentError.message || 'Impossible d\'ajouter le commentaire.';
        if (commentError.code === 'invalid-argument') {
            if (commentError.message?.includes('Unsupported field value')) {
                errorMessage = "Une valeur invalide a été envoyée. Veuillez réessayer.";
            } else if (commentError.message?.includes('serverTimestamp')) {
                errorMessage = "Erreur de timestamp serveur. Réessayez.";
            }
        } else if (commentError.code === 'permission-denied') {
            errorMessage = "Permission refusée. Vous ne pouvez peut-être pas commenter cet événement.";
        }
        toast({ title: 'Erreur', description: errorMessage, variant: 'destructive' });
    } finally {
        setIsSubmittingComment(false);
    }
};




  // --- Souvenir Upload Handlers ---
    const handleSouvenirFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newFilesArray = Array.from(files);
            const validNewFiles: File[] = [];
            const newPreviews: string[] = [];

            newFilesArray.forEach(file => {
                 if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
                     toast({ title: `Type non supporté : ${file.name}`, description: `Type ${file.type} non accepté.`, variant: 'destructive' });
                     return;
                 }
                 const fileType = getFileType(file);
                 let maxSize = 0;
                 if (fileType === 'image') maxSize = MAX_FILE_SIZE.image;
                 else if (fileType === 'video') maxSize = MAX_FILE_SIZE.video;
                 else if (fileType === 'audio') maxSize = MAX_FILE_SIZE.audio;

                 if (maxSize > 0 && file.size > maxSize) {
                      toast({ title: `Fichier trop volumineux : ${file.name}`, description: `La taille dépasse la limite de ${(maxSize / 1024 / 1024).toFixed(1)}Mo.`, variant: 'destructive' });
                      return;
                 }
                validNewFiles.push(file);
                newPreviews.push(URL.createObjectURL(file));
            });

            setSouvenirFiles(prev => [...prev, ...validNewFiles]);
            setSouvenirPreviews(prev => [...prev, ...newPreviews]);

             if(event.target) event.target.value = '';
        }
    };

    const removeSouvenirFile = (index: number) => {
        const fileToRemove = souvenirFiles[index];
        setSouvenirFiles(prev => prev.filter((_, i) => i !== index));
        const previewUrl = souvenirPreviews[index];
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSouvenirPreviews(prev => prev.filter((_, i) => i !== index));
        if (fileToRemove?.name && souvenirUploadProgress[fileToRemove.name] !== undefined) {
             setSouvenirUploadProgress(prev => {
                 const newProgress = { ...prev };
                 delete newProgress[fileToRemove.name];
                 return newProgress;
             });
         }
    };

    const handleUploadSouvenirs = async () => {
        if (!user || !party || souvenirFiles.length === 0) return;
        setIsUploadingSouvenirs(true);
        setSouvenirUploadProgress({});

        const uploadPromises = souvenirFiles.map(file =>
            uploadFile(
                file,
                party.id,
                false,
                (progress) => setSouvenirUploadProgress(prev => ({ ...prev, [file.name]: progress }))
            ).then(url => ({ url, file }))
             .catch(error => {
                 console.error(`Échec téléversement ${file.name}:`, error);
                 setSouvenirUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
                 toast({ title: `Échec téléversement ${file.name}`, description: error.message, variant: 'destructive' });
                 return null;
             })
        );

        try {
            const results = await Promise.all(uploadPromises);
            const successfulUploadUrls = results.filter(r => r !== null).map(r => r!.url);

            if (successfulUploadUrls.length > 0) {
                const partyDocRef = doc(db, 'parties', party.id);
                await updateDoc(partyDocRef, {
                    mediaUrls: arrayUnion(...successfulUploadUrls)
                });
                toast({ title: 'Souvenirs ajoutés !', description: `${successfulUploadUrls.length} fichier(s) ajouté(s) à l'événement.` });
            }

            if (successfulUploadUrls.length < souvenirFiles.length) {
                 toast({ title: 'Certains téléversements ont échoué', variant: 'warning' });
            }

            setShowAddSouvenirDialog(false);
            setSouvenirFiles([]);
            setSouvenirPreviews(prev => { prev.forEach(URL.revokeObjectURL); return []; });
            setSouvenirUploadProgress({});

        } catch (error: any) {
            console.error("Erreur lors de la mise à jour de Firestore avec les URLs des souvenirs:", error);
            toast({ title: 'Erreur Firestore', description: "Impossible de sauvegarder les liens des souvenirs.", variant: 'destructive' });
        } finally {
            setIsUploadingSouvenirs(false);
        }
    };

     // --- Edit Cover Photo Handlers ---
    const handleNewCoverFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const isBrowser = typeof window !== 'undefined';
        const file = event.target.files?.[0];
        if (file) {
            const validationResult = isBrowser && file instanceof File ? coverPhotoSchema.safeParse(file) : { success: true };
            if (validationResult.success) {
                setNewCoverFile(file);
                if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
                setNewCoverPreview(URL.createObjectURL(file));
            } else {
                const errorMessage = (validationResult as any).error?.errors[0]?.message || 'Fichier invalide.';
                toast({ title: "Erreur Photo de Couverture", description: errorMessage, variant: "destructive" });
                setNewCoverFile(null);
                if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
                setNewCoverPreview(null);
            }
        } else {
             setNewCoverFile(null);
             if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
             setNewCoverPreview(null);
        }
        if (event.target) event.target.value = '';
    };

    const handleUpdateCoverPhoto = async () => {
        if (!user || !party || !newCoverFile || !db) {
            toast({ title: 'Erreur', description: 'Impossible de mettre à jour la photo pour le moment.', variant: 'destructive' });
            return;
        }
        setIsUploadingCover(true);

        try {
            console.log("Téléversement de la nouvelle photo de couverture...");
            const newCoverUrl = await uploadFile(newCoverFile, party.id, true, (progress) => {
                console.log(`Progression couverture : ${progress}%`);
            });

            const partyDocRef = doc(db, 'parties', party.id);
            await updateDoc(partyDocRef, {
                coverPhotoUrl: newCoverUrl
            });

            toast({ title: 'Photo de couverture mise à jour !' });
            setNewCoverFile(null);
            if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
            setNewCoverPreview(null);
            setShowEditCoverDialog(false);

        } catch (error: any) {
            console.error("Erreur lors de la mise à jour de la photo de couverture:", error);
             let userFriendlyError = "Impossible de mettre à jour la photo de couverture.";
            if (error.message?.includes('storage/unauthorized') || error.code === 'permission-denied') {
                userFriendlyError = "Permission refusée. Vérifiez les règles de sécurité.";
            } else if (error.message?.includes('storage/object-not-found')) {
                userFriendlyError = "Le fichier d'origine est introuvable.";
            } else {
                 userFriendlyError = error.message || userFriendlyError;
            }
            toast({ title: 'Échec de la mise à jour', description: userFriendlyError, variant: 'destructive' });
        } finally {
            setIsUploadingCover(false);
        }
    };

    // --- Add Participant Handler ---
    const handleAddParticipant = async (selectedUserId: string | null) => {
        console.log("[handleAddParticipant] Début. Utilisateur sélectionné:", selectedUserId);
        console.log("[handleAddParticipant] Utilisateur actuel (currentUser):", user?.email);
        console.log("[handleAddParticipant] Détails de l'événement (party):", party);
        console.log("[handleAddParticipant] Liste de tous les utilisateurs (allUsers):", allUsers);
        console.log("[handleAddParticipant] Peut gérer les participants (canManageParticipants):", canManageParticipants);
        console.log("[handleAddParticipant] DB initialisé:", !!db);


        if (!user || !party || !canManageParticipants || !db || !selectedUserId) {
            toast({ title: 'Erreur', description: 'Permissions insuffisantes ou utilisateur non sélectionné.', variant: 'destructive' });
             console.error("[handleAddParticipant] Préconditions non remplies:", {user:!!user, party:!!party, canManageParticipants, db:!!db, selectedUserId});
            return;
        }

        setIsAddingParticipant(true);
        console.log("[handleAddParticipant] Recherche de l'utilisateur dans `allUsers`. UID recherché:", selectedUserId);
        console.log("[handleAddParticipant] `allUsers` actuellement:", allUsers.map(u => u.uid)); // Log only UIDs for brevity
        const userToAdd = allUsers.find(u => u.uid === selectedUserId);
        console.log("[handleAddParticipant] Utilisateur trouvé dans allUsers:", userToAdd);


        if (!userToAdd) {
            toast({ title: 'Utilisateur non trouvé', description: 'Impossible de trouver les détails de l\'utilisateur sélectionné.', variant: 'destructive' });
            console.error("[handleAddParticipant] Utilisateur non trouvé dans la liste allUsers. UID recherché:", selectedUserId);
            setIsAddingParticipant(false);
            return;
        }
        
        const emailToAdd = userToAdd.email.toLowerCase();

         if (party.participantEmails?.map(e => e.toLowerCase()).includes(emailToAdd)) {
            toast({ title: 'Info', description: `${userToAdd.pseudo || userToAdd.displayName || userToAdd.email} est déjà participant.`, variant: 'default' });
            console.log("[handleAddParticipant] L'utilisateur est déjà participant:", userToAdd.email);
            setIsAddingParticipant(false);
            setShowAddParticipantDialog(false);
            return;
         }

        try {
             console.log("[handleAddParticipant] Tentative de mise à jour de Firestore pour ajouter le participant...");
             const partyDocRef = doc(db, 'parties', party.id);
             await updateDoc(partyDocRef, {
                 participants: arrayUnion(userToAdd.uid), // Add UID
                 participantEmails: arrayUnion(userToAdd.email) // Add email
             });

             toast({ title: 'Participant ajouté', description: `${userToAdd.pseudo || userToAdd.displayName || userToAdd.email} a été ajouté à l'événement.` });
             console.log("[handleAddParticipant] Participant ajouté avec succès:", userToAdd.email);
             setShowAddParticipantDialog(false);

        } catch (error: any) {
             console.error("[handleAddParticipant] Erreur lors de l'ajout du participant à Firestore:", error);
              let userFriendlyError = "Impossible d'ajouter le participant.";
              if (error.code === 'permission-denied') {
                   userFriendlyError = "Permission refusée. Vérifiez les règles Firestore.";
              }
             toast({ title: 'Erreur', description: userFriendlyError, variant: 'destructive' });
        } finally {
            console.log("[handleAddParticipant] Fin.");
            setIsAddingParticipant(false);
        }
    };

    const handleUpdatePartyName = async () => {
        if (!user || !party || !isCreator || !db || !newPartyName.trim()) {
            toast({ title: 'Erreur', description: 'Impossible de mettre à jour le nom pour le moment.', variant: 'destructive' });
            return;
        }
        setIsUpdatingPartyName(true);
        try {
            const partyDocRef = doc(db, 'parties', party.id);
            await updateDoc(partyDocRef, {
                name: newPartyName.trim()
            });
            toast({ title: 'Nom de l\'événement mis à jour !' });
            setShowEditPartyNameDialog(false);
        } catch (error: any) {
            console.error("Erreur lors de la mise à jour du nom de l'événement:", error);
            toast({ title: 'Échec de la mise à jour', description: "Impossible de mettre à jour le nom de l'événement.", variant: 'destructive' });
        } finally {
            setIsUpdatingPartyName(false);
        }
    };

    const comboboxOptions = allUsers
    .filter(u => !party?.participants.includes(u.uid)) // Filter out existing participants
    .map(u => ({
        value: u.uid,
        label: u.pseudo || u.displayName || u.email || u.uid,
    }));


  // --- Render Logic ---
  const showSkeleton = pageLoading || userLoading;

  if (showSkeleton) {
    return (
        <div className="container mx-auto px-4 py-12">
            <Card className="bg-card border border-border overflow-hidden shadow-lg">
                <CardHeader className="p-0">
                    <Skeleton className="h-48 md:h-64 lg:h-80 w-full bg-muted" />
                </CardHeader>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                    <div className="lg:col-span-2 border-r-0 lg:border-r border-border/50">
                        <CardContent className="p-4 md:p-6">
                            <Skeleton className="h-6 w-1/3 mb-4" />
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-lg bg-muted" />)}
                            </div>
                        </CardContent>
                        <CardContent className="p-4 md:p-6 border-t border-border/50">
                             <Skeleton className="h-6 w-1/4 mb-5" />
                            <div className="space-y-6">
                                 <div className="flex items-start space-x-3">
                                     <Skeleton className="h-9 w-9 rounded-full mt-1" />
                                    <div className="flex-1 space-y-2">
                                         <Skeleton className="h-20 w-full" />
                                         <Skeleton className="h-8 w-24" />
                                    </div>
                                 </div>
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        </CardContent>
                    </div>
                     <div className="lg:col-span-1">
                         <CardContent className="p-4 md:p-6">
                              <Skeleton className="h-6 w-1/4 mb-4" />
                              <Skeleton className="h-20 w-full rounded-lg" />
                         </CardContent>
                         <CardContent className="p-4 md:p-6 border-t border-border/50">
                            <Skeleton className="h-24 w-full" />
                         </CardContent>
                         <CardContent className="p-4 md:p-6 border-t border-border/50">
                              <Skeleton className="h-6 w-1/3 mb-4" />
                              <div className="space-y-3">
                                 <Skeleton className="h-8 w-full rounded-md" />
                                 <Skeleton className="h-8 w-full rounded-md" />
                                 <Skeleton className="h-8 w-full rounded-md" />
                              </div>
                         </CardContent>
                     </div>
                </div>
            </Card>
        </div>
    );
  }

  if (error || initializationFailed) {
     const displayError = error || initializationErrorMessage || "Une erreur inconnue est survenue.";
     return (
         <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
             <Alert variant="destructive" className="max-w-lg">
                 <AlertTriangle className="h-4 w-4" />
                 <AlertTitle>Erreur</AlertTitle>
                 <AlertDescription>{displayError}</AlertDescription>
             </Alert>
         </div>
     );
  }

  if (!party) { return <div className="container mx-auto px-4 py-12 text-center">Fête non trouvée.</div>; }

  const partyDate = getDateFromTimestamp(party.date);

    // Use commentsData from state, which is updated by the snapshot listener
    const sortedComments = [...commentsData].sort((a, b) => {
        const timeA = getDateFromTimestamp(a.timestamp)?.getTime() || 0;
        const timeB = getDateFromTimestamp(b.timestamp)?.getTime() || 0;
        return timeB - timeA;
    });


  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <Card className="bg-card border border-border overflow-hidden shadow-lg">
        {/* Header Section */}
        <CardHeader className="p-0 relative border-b border-border/50">
           <div className="relative h-48 md:h-64 lg:h-80 w-full group">
               {party.coverPhotoUrl ? (
                   <Image src={party.coverPhotoUrl} alt={`Couverture ${party.name}`} layout="fill" objectFit="cover" quality={80} priority data-ai-hint="fête couverture événement" />
               ) : (
                   <div className="absolute inset-0 bg-gradient-to-br from-secondary via-muted to-secondary flex items-center justify-center"> <ImageIcon className="h-16 w-16 text-muted-foreground/50" /> </div>
               )}
                {(isCreator || isAdmin) && (
                    <Dialog open={showEditCoverDialog} onOpenChange={setShowEditCoverDialog}>
                        <DialogTrigger asChild>
                             <Button variant="secondary" size="icon" className="absolute top-4 left-4 z-10 h-8 w-8 bg-black/50 hover:bg-black/70 border-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                 <Edit2 className="h-4 w-4 text-white" />
                                 <span className="sr-only">Modifier la couverture</span>
                             </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Modifier la Photo de Couverture</DialogTitle>
                                <DialogDescription> Choisissez une nouvelle image pour l'événement. Max {MAX_FILE_SIZE.image / 1024 / 1024}Mo initial, sera compressée à {COMPRESSED_COVER_PHOTO_MAX_SIZE_MB}Mo. </DialogDescription>
                            </DialogHeader>
                             <div className="grid gap-4 py-4">
                                <Input id="new-cover-input" type="file" accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')} onChange={handleNewCoverFileChange} className="col-span-3" />
                                 {newCoverPreview && (
                                     <div className="relative aspect-video w-full border rounded mt-2 bg-muted">
                                         <Image src={newCoverPreview} alt="Aperçu nouvelle couverture" layout="fill" objectFit="contain" />
                                          <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full z-10" onClick={() => { setNewCoverFile(null); if(newCoverPreview) URL.revokeObjectURL(newCoverPreview); setNewCoverPreview(null); }}> <X className="h-3 w-3" /> </Button>
                                     </div>
                                 )}
                             </div>
                            <DialogFooter>
                                 <DialogClose asChild>
                                     <Button type="button" variant="outline">Annuler</Button>
                                 </DialogClose>
                                 <Button type="button" onClick={handleUpdateCoverPhoto} disabled={!newCoverFile || isUploadingCover}>
                                     {isUploadingCover ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                     Mettre à jour
                                 </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white z-10">
                    <div className="flex items-center">
                        <CardTitle className="text-2xl md:text-4xl font-bold mb-1 text-shadow"> {party.name} </CardTitle>
                        {isCreator && (
                            <Dialog open={showEditPartyNameDialog} onOpenChange={setShowEditPartyNameDialog}>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="ml-2 text-white hover:text-gray-300 h-7 w-7 p-1">
                                        <Edit2 className="h-4 w-4" />
                                        <span className="sr-only">Modifier le nom</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Modifier le Nom de l'Événement</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <Input 
                                            id="new-party-name" 
                                            value={newPartyName}
                                            onChange={(e) => setNewPartyName(e.target.value)} 
                                            className="col-span-3"
                                        />
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
                                        <Button type="button" onClick={handleUpdatePartyName} disabled={!newPartyName.trim() || isUpdatingPartyName}>
                                            {isUpdatingPartyName ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                            Sauvegarder
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                    <CardDescription className="text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                       {partyDate && <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/> {format(partyDate, 'PPP', { locale: fr })} ({formatDistanceToNow(partyDate, { addSuffix: true, locale: fr })})</span>}
                       {party.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/> {party.location}</span>}
                       <span className="flex items-center gap-1.5"><User className="h-4 w-4"/> Créé par {party.creatorEmail || 'Inconnu'}</span>
                    </CardDescription>
                     {party.description && ( <p className="mt-3 text-sm text-gray-200 line-clamp-2">{party.description}</p> )}
                </div>
                 <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                     <Badge variant="secondary" className="backdrop-blur-sm bg-black/50 border-white/20 text-base px-3 py-1">
                         <Star className="h-4 w-4 text-yellow-400 fill-current mr-1.5" /> {averageRating.toFixed(1)} <span className="text-xs text-muted-foreground ml-1">/ 5</span>
                     </Badge>
                 </div>
           </div>
        </CardHeader>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
             {/* Left Column (Span 2): Media & Comments */}
             <div className="lg:col-span-2 border-r-0 lg:border-r border-border/50">
                {/* Media Section */}
                <CardContent className="p-4 md:p-6">
                    <div className="flex justify-between items-center mb-4">
                         <h3 className="text-xl font-semibold text-foreground">Souvenirs ({party.mediaUrls?.length || 0})</h3>
                         {user && (
                            <Dialog open={showAddSouvenirDialog} onOpenChange={setShowAddSouvenirDialog}>
                                <DialogTrigger asChild>
                                     <Button variant="outline" size="sm"> <Upload className="mr-2 h-4 w-4" /> Ajouter des souvenirs </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]">
                                    <DialogHeader>
                                         <DialogTitle>Ajouter des Souvenirs</DialogTitle>
                                         <DialogDescription> Téléversez des photos, vidéos ou sons pour cet événement. </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <Input id="souvenir-upload-input" type="file" multiple accept={ACCEPTED_MEDIA_TYPES.join(',')} onChange={handleSouvenirFileChange} className="col-span-3" />
                                         {souvenirFiles.length > 0 && (
                                             <div className="space-y-3 mt-4 max-h-60 overflow-y-auto border p-3 rounded-md">
                                                  <p className="text-sm font-medium">Fichiers à téléverser :</p>
                                                 <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                                     {souvenirFiles.map((file, index) => {
                                                         const previewUrl = souvenirPreviews[index];
                                                         const progress = souvenirUploadProgress[file.name];
                                                          const fileTypeIcon = getFileType(file);
                                                         return (
                                                             <div key={index} className="relative group border rounded-md p-2 bg-secondary/50 text-center">
                                                                  {previewUrl && file.type.startsWith('image/') ? (
                                                                      <Image src={previewUrl} alt={`Aperçu ${file.name}`} width={60} height={60} className="rounded object-cover mx-auto h-14 w-14 mb-1" />
                                                                  ) : (
                                                                      <div className="h-14 w-14 flex items-center justify-center bg-muted rounded mx-auto text-muted-foreground mb-1">
                                                                          {fileTypeIcon === 'video' && <Video className="h-6 w-6" />}
                                                                          {fileTypeIcon === 'audio' && <Music className="h-6 w-6" />}
                                                                          {fileTypeIcon === 'autre' && <FileIcon className="h-6 w-6" />}
                                                                      </div>
                                                                  )}
                                                                  <p className="text-xs text-muted-foreground truncate">{file.name}</p>
                                                                   {progress !== undefined && progress >= 0 && progress < 100 && <Progress value={progress} className="h-1 w-full mt-1" />}
                                                                   {progress === 100 && <p className="text-xs text-green-500 mt-1">OK</p>}
                                                                   {progress === -1 && <p className="text-xs text-destructive mt-1">Échec</p>}
                                                                  <Button type="button" variant="destructive" size="icon" className="absolute -top-1 -right-1 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity rounded-full z-10" onClick={() => removeSouvenirFile(index)} disabled={isUploadingSouvenirs}> <X className="h-2 w-2" /> </Button>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                             </div>
                                         )}
                                    </div>
                                    <DialogFooter>
                                         <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
                                         <Button type="button" onClick={handleUploadSouvenirs} disabled={souvenirFiles.length === 0 || isUploadingSouvenirs}>
                                             {isUploadingSouvenirs ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                             Téléverser ({souvenirFiles.length})
                                         </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                         )}
                     </div>
                    {party.mediaUrls && party.mediaUrls.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4"> {party.mediaUrls.map(renderMedia)} </div>
                    ) : ( <p className="text-muted-foreground text-sm">Aucun souvenir importé.</p> )}
                </CardContent>

                 {/* Comments Section */}
                 <CardContent className="p-4 md:p-6 border-t border-border/50">
                    <h3 className="text-xl font-semibold mb-5 text-foreground">Commentaires ({sortedComments.length})</h3>
                    <div className="space-y-6">
                       {user && (
                        <div className="flex items-start space-x-3">
                            <Avatar className="h-9 w-9 border mt-1"> <AvatarImage src={user.photoURL || undefined} alt={user.email || ''}/> <AvatarFallback>{getInitials(user.email)}</AvatarFallback> </Avatar>
                            <div className="flex-1">
                                <Textarea placeholder="Votre commentaire..." value={comment} onChange={(e) => setComment(e.target.value)} className="w-full mb-2 bg-input border-border focus:bg-background focus:border-primary" rows={3} />
                                <div className="flex gap-2">
                                    <Button onClick={handleAddComment} disabled={!comment.trim() || isSubmittingComment} size="sm" className="bg-primary hover:bg-primary/90"> {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Commenter </Button>
                                    
                                </div>
                            </div>
                        </div>
                       )}
                       {!user && ( <p className="text-muted-foreground text-sm"> <button onClick={() => router.push('/auth')} className="text-primary hover:underline font-medium">Connectez-vous</button> pour commenter ou noter. </p> )}
                       {sortedComments.length > 0 ? (
                        <div className="space-y-4">
                            {sortedComments.map((cmt, index) => {
                                const commentDate = getDateFromTimestamp(cmt.timestamp); // Accepts Date objects now
                                return (
                                    <div key={index} className="flex items-start space-x-3">
                                        <Avatar className="h-8 w-8 border"> <AvatarImage src={cmt.avatar || undefined} alt={cmt.email}/> <AvatarFallback className="text-xs">{getInitials(cmt.email)}</AvatarFallback> </Avatar>
                                        <div className="flex-1 bg-secondary/50 p-3 rounded-lg border border-border/30">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-xs font-medium text-foreground">{cmt.email}</p>
                                             {commentDate && <p className="text-xs text-muted-foreground"> {format(commentDate, 'PPp', { locale: fr })} </p>}
                                        </div>
                                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{cmt.text}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                       ) : ( <p className="text-muted-foreground text-center text-sm py-4">{user ? "Soyez le premier à commenter !" : "Aucun commentaire pour le moment."}</p> )}
                    </div>
                 </CardContent>
             </div>

             {/* Right Column (Span 1): Rating & Participants */}
             <div className="lg:col-span-1">
                 <CardContent className="p-4 md:p-6"> <h3 className="text-xl font-semibold mb-4 text-foreground">Votre Note</h3> <div className="flex flex-col items-center gap-3 bg-secondary/30 border border-border/50 p-4 rounded-lg"> <StarRating rating={userRating} onRate={handleRateParty} disabled={!user || isRating} size="h-8 w-8" /> {isRating && <span className="text-xs text-muted-foreground">Envoi...</span>} {!user && <span className="text-xs text-muted-foreground mt-1">Connectez-vous pour noter</span>} {user && userRating > 0 && <span className="text-xs text-muted-foreground mt-1">Votre note : {userRating}/5</span>} {user && userRating === 0 && <span className="text-xs text-muted-foreground mt-1">Donnez une note !</span>} </div> </CardContent>
                 <CardContent className="p-4 md:p-6 border-t border-border/50"> <RatingDistributionChart ratings={party.ratings || {}} /> </CardContent>
                 <CardContent className="p-4 md:p-6 border-t border-border/50">
                      <div className="flex justify-between items-center mb-4">
                           <h3 className="text-xl font-semibold text-foreground">Participants ({party.participantEmails?.length || 1})</h3>
                            {canManageParticipants && (
                                <Dialog open={showAddParticipantDialog} onOpenChange={setShowAddParticipantDialog}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm"> <UserPlus className="mr-2 h-4 w-4" /> Ajouter </Button>
                                    </DialogTrigger>
                                     <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Ajouter un Participant</DialogTitle>
                                            <DialogDescription> Sélectionnez un utilisateur dans la liste pour l'ajouter à l'événement. </DialogDescription>
                                        </DialogHeader>
                                         <div className="grid gap-4 py-4">
                                             <Combobox
                                                options={comboboxOptions}
                                                onSelect={(userId) => {
                                                    if (userId) handleAddParticipant(userId);
                                                }}
                                                placeholder="Rechercher un utilisateur..."
                                                searchPlaceholder="Tapez un nom ou email..."
                                                emptyPlaceholder="Aucun utilisateur disponible ou tous déjà ajoutés."
                                                triggerIcon={<UserPlus className="mr-2 h-4 w-4" />}
                                            />
                                         </div>
                                        <DialogFooter>
                                             <DialogClose asChild>
                                                 <Button type="button" variant="outline">Annuler</Button>
                                             </DialogClose>
                                             {/* Le bouton "Ajouter" n'est plus nécessaire ici car la sélection dans Combobox déclenche l'ajout */}
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                      </div>
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                         {(party.participantEmails || [party.creatorEmail]).map((email, index) => (
                            <div key={email || index} className="flex items-center space-x-3 p-2 rounded-md hover:bg-secondary/50">
                                <Avatar className="h-8 w-8 border">
                                     <AvatarFallback className={`${participantColors[index % participantColors.length]} text-primary-foreground text-xs`}> {getInitials(email)} </AvatarFallback>
                                 </Avatar>
                                 <span className="text-sm font-medium text-foreground truncate">{email || 'Créateur'}</span>
                                 {email === party.creatorEmail && <Badge variant="outline" className="text-xs ml-auto">Créateur</Badge>}
                            </div>
                         ))}
                      </div>
                 </CardContent>
             </div>
        </div>

      </Card>
    </div>
  );
}

// Helper pour les noms de classe (à conserver)
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}



    
    

