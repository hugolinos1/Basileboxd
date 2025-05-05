// src/app/party/[id]/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Star, Send, User, MapPin, CalendarDays, Image as ImageIcon, Video, Music, Loader2, AlertTriangle } from 'lucide-react';
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
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart"


interface FirestoreTimestamp {
    seconds: number;
    nanoseconds: number;
}

interface Comment {
    userId: string;
    email: string;
    avatar?: string;
    text: string;
    timestamp: FirestoreTimestamp | Timestamp; // Allow both types for optimistic update
}

interface PartyData {
    id: string;
    name: string;
    description: string;
    date: FirestoreTimestamp;
    location: string;
    createdBy: string;
    creatorEmail: string;
    participants: string[];
    participantEmails?: string[];
    mediaUrls: string[];
    coverPhotoUrl?: string; // Add cover photo URL
    ratings: { [userId: string]: number };
    comments: Comment[];
    createdAt: FirestoreTimestamp;
}

// Star Rating Component
const StarRating = ({ totalStars = 5, rating, onRate, disabled = false, size = 'h-6 w-6' }: { totalStars?: number, rating: number, onRate: (rating: number) => void, disabled?: boolean, size?: string }) => {
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div className={`flex space-x-1 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      {[...Array(totalStars)].map((_, index) => {
        const starValue = index + 1;
        const isHalf = starValue - 0.5 === (hoverRating || rating);
        const filled = starValue <= (hoverRating || rating);

        return (
          <Star
            key={index}
            className={cn(
              size,
              'transition-colors duration-150',
              filled ? 'text-yellow-400 fill-current' : 'text-gray-600',
              !disabled && 'hover:text-yellow-300',
              // Basic half-star simulation - adjust fill/stroke if needed
              isHalf && 'text-yellow-400' // Keep yellow, maybe use clip-path in CSS if complex needed
            )}
            onClick={() => !disabled && onRate(starValue)} // Rate full stars for now
            onMouseEnter={() => !disabled && setHoverRating(starValue)}
            onMouseLeave={() => !disabled && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
};


// Rating Distribution Chart Component
const RatingDistributionChart = ({ ratings }: { ratings: { [userId: string]: number } }) => {

  const ratingCounts = useMemo(() => {
    const counts: { rating: number; votes: number }[] = Array.from({ length: 10 }, (_, i) => ({
      rating: (i + 1) * 0.5,
      votes: 0,
    }));

    Object.values(ratings).forEach(rating => {
      const index = Math.round(rating * 2) - 1; // Map 0.5 to index 0, 1.0 to index 1, ..., 5.0 to index 9
      if (index >= 0 && index < 10) {
        counts[index].votes++;
      }
    });
    return counts.map(c => ({ ...c, fill: "hsl(var(--primary))" })); // Use primary color
  }, [ratings]);

  const totalVotes = useMemo(() => Object.keys(ratings).length, [ratings]);

  const chartConfig = {
    votes: {
      label: "Votes",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig

  if (totalVotes === 0) {
     return <p className="text-sm text-muted-foreground text-center py-4">Pas encore de notes.</p>;
  }

  return (
    <div className="w-full">
        <div className="flex justify-between items-center mb-2 px-1">
            <p className="text-sm font-medium text-muted-foreground">Répartition des notes</p>
            <p className="text-sm font-medium text-muted-foreground">{totalVotes} vote{totalVotes > 1 ? 's' : ''}</p>
        </div>
        <ChartContainer config={chartConfig} className="h-[100px] w-full">
            <BarChart
                accessibilityLayer
                data={ratingCounts}
                margin={{ top: 5, right: 5, left: -30, bottom: -10 }} // Adjust margins
                barCategoryGap={2} // Smaller gap between bars
            >
                <XAxis
                    dataKey="rating"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    tickFormatter={(value) => value % 1 === 0 ? `${value}.0` : `${value}`} // Format ticks like 1.0, 1.5, 2.5, etc.
                    fontSize={10} // Smaller font size for ticks
                    interval={1} // Show ticks for 0.5, 1.5, 2.5, etc.
                />
                 <YAxis hide={true} /> {/* Hide Y axis */}
                 <RechartsTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel hideIndicator />}
                    formatter={(value, name, props) => [`${value} votes`, `${props.payload.rating} étoiles`]}
                />
                <Bar dataKey="votes" radius={2} />
            </BarChart>
        </ChartContainer>
         <div className="flex justify-between items-center mt-1 px-1">
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
         </div>
    </div>
  );
};



export default function PartyDetailsPage() {
  const params = useParams();
  const partyId = params.id as string;
  const router = useRouter();
  const { user, firebaseInitialized } = useFirebase(); // Ensure firebaseInitialized is used
  const { toast } = useToast();

  const [party, setParty] = useState<PartyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [userRating, setUserRating] = useState<number>(0);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Participant Colors (copied from create page)
    const participantColors = [
      'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-600',
      'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
    ];

    const getInitials = (email: string | null | undefined): string => {
        if (!email) return '?';
        const parts = email.split('@')[0];
        return parts[0]?.toUpperCase() || '?';
    };

  useEffect(() => {
    if (!partyId || !firebaseInitialized) { // Check if Firebase is ready
        if (!partyId) setError("ID de la fête manquant.");
        else setError("Firebase non initialisé.");
        setLoading(false);
        return;
    }
     if (!db) {
         setError("La base de données Firestore n'est pas disponible.");
         setLoading(false);
         return;
     }

    const fetchParty = async () => {
      setLoading(true);
      setError(null); // Reset error on new fetch
      try {
        const partyDocRef = doc(db, 'parties', partyId);
        const partyDocSnap = await getDoc(partyDocRef);

        if (partyDocSnap.exists()) {
          const data = { id: partyDocSnap.id, ...partyDocSnap.data() } as PartyData;
          setParty(data);
          calculateAverageRating(data.ratings);
          if (user && data.ratings[user.uid]) {
            setUserRating(data.ratings[user.uid]);
          } else {
              setUserRating(0);
          }
        } else {
          setError('Fête non trouvée.');
          toast({ title: 'Erreur', description: 'Fête non trouvée.', variant: 'destructive' });
          // Consider redirecting here if preferred: router.push('/');
        }
      } catch (fetchError: any) {
        console.error('Erreur lors de la récupération de la fête :', fetchError);
        setError('Impossible de charger les détails de la fête.');
        toast({ title: 'Erreur', description: fetchError.message || 'Impossible de charger les détails de la fête.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchParty();
  }, [partyId, user, firebaseInitialized, router, toast]); // Add firebaseInitialized


  const calculateAverageRating = (ratings: { [userId: string]: number }) => {
    const allRatings = Object.values(ratings);
    if (allRatings.length === 0) {
      setAverageRating(0);
      return;
    }
    const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
    setAverageRating(sum / allRatings.length);
  };

  const handleRateParty = async (newRating: number) => {
     if (!user) {
       toast({ title: 'Connexion requise', description: 'Veuillez vous connecter pour noter.', variant: 'destructive' });
       return;
     }
     if (!party || !db || !firebaseInitialized) {
         toast({ title: 'Erreur', description: 'Impossible de noter pour le moment.', variant: 'destructive' });
         return;
     };
     setIsRating(true);

     try {
         const partyDocRef = doc(db, 'parties', party.id);
         // Use dot notation for updating specific field in map
         const ratingUpdate = { [`ratings.${user.uid}`]: newRating };

         await updateDoc(partyDocRef, ratingUpdate);

         // Optimistically update local state
         const updatedRatings = { ...party.ratings, [user.uid]: newRating };
         setUserRating(newRating);
         calculateAverageRating(updatedRatings);
         setParty(prev => prev ? { ...prev, ratings: updatedRatings } : null);

         toast({ title: 'Note envoyée', description: `Vous avez noté cette fête ${newRating} étoiles.` });

     } catch (rateError: any) {
         console.error("Erreur lors de l'envoi de la note :", rateError);
         toast({ title: 'Erreur', description: rateError.message || 'Impossible d\'envoyer la note.', variant: 'destructive' });
     } finally {
         setIsRating(false);
     }
  };


  const handleAddComment = async () => {
    if (!user) {
      toast({ title: 'Connexion requise', description: 'Veuillez vous connecter pour commenter.', variant: 'destructive' });
      return;
    }
    if (!party || !comment.trim() || !db || !firebaseInitialized) {
        toast({ title: 'Erreur', description: 'Impossible d\'ajouter un commentaire pour le moment.', variant: 'destructive' });
        return
    };

    setIsSubmittingComment(true);
    try {
      const partyDocRef = doc(db, 'parties', party.id);
      const newComment: Omit<Comment, 'timestamp'> & { timestamp: any } = { // Use 'any' for serverTimestamp()
        userId: user.uid,
        email: user.email || 'anonyme',
        avatar: user.photoURL || undefined,
        text: comment.trim(),
        timestamp: serverTimestamp(),
      };

      await updateDoc(partyDocRef, {
        comments: arrayUnion(newComment),
      });

       // Optimistically update local state with a client-side timestamp approximation
       const optimisticTimestamp: Timestamp = Timestamp.now();
       const optimisticComment: Comment = {
           ...newComment,
           timestamp: optimisticTimestamp, // Now satisfies the Comment type
       };

       setParty(prev => prev ? { ...prev, comments: [...prev.comments, optimisticComment] } : null);


      setComment('');
      toast({ title: 'Commentaire ajouté' });
    } catch (commentError: any) {
      console.error('Erreur lors de l\'ajout du commentaire :', commentError);
      toast({ title: 'Erreur', description: commentError.message || 'Impossible d\'ajouter le commentaire.', variant: 'destructive' });
    } finally {
      setIsSubmittingComment(false);
    }
  };

   const renderMedia = (url: string, index: number) => {
     const onError = (e: any) => {
        console.error(`Erreur lors du chargement du média ${url}:`, e);
        setPlayerError(`Impossible de charger le média : ${url.substring(url.lastIndexOf('/') + 1)}`);
     }

     // Basic type detection based on common extensions/keywords in URL
     const isVideo = /\.(mp4|mov|avi|webm)$/i.test(url) || url.includes('video') || url.includes('youtube.com') || url.includes('vimeo.com');
     const isAudio = /\.(mp3|wav|ogg|aac)$/i.test(url) || url.includes('audio');
     const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('image');

     if (isVideo) {
       return (
         <div key={index} className="aspect-video bg-black rounded-lg overflow-hidden relative shadow-md">
            {playerError && url === playerError.substring(playerError.indexOf(':') + 2) && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-destructive-foreground p-4 text-center">
                    Erreur de chargement de la vidéo
                </div>
            )}
             <ReactPlayer
                url={url}
                controls
                width="100%"
                height="100%"
                onError={onError}
                className="absolute top-0 left-0"
                config={{ file: { attributes: { controlsList: 'nodownload' } } }}
            />
         </div>
       );
     } else if (isAudio) {
       return (
         <div key={index} className="w-full bg-card p-3 rounded-lg shadow">
           <ReactPlayer url={url} controls width="100%" height="40px" onError={onError}/>
             {playerError && url === playerError.substring(playerError.indexOf(':') + 2) && (
                <p className="text-destructive text-xs mt-1">Erreur de chargement de l'audio</p>
            )}
         </div>
       );
     } else if (isImage) {
       return (
         <div key={index} className="relative aspect-square w-full overflow-hidden rounded-lg shadow-md group">
           <Image
             src={url}
             alt={`Souvenir ${index + 1}`}
             layout="fill"
             objectFit="cover"
             className="transition-transform duration-300 group-hover:scale-105"
             loading="lazy"
             onError={onError}
             data-ai-hint="souvenir fête photo"
           />
            {playerError && url === playerError.substring(playerError.indexOf(':') + 2) && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-destructive-foreground p-4 text-center">
                    Erreur de chargement de l'image
                </div>
            )}
         </div>
       );
     }
     // Fallback for unknown types or if detection fails
     return (
        <div key={index} className="bg-secondary rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground shadow">
            <Music className="h-4 w-4" /> {/* Default icon */}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                Média {index + 1}
            </a>
        </div>
     );
   };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
     return (
         <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
            <Alert variant="destructive" className="max-w-lg">
               <AlertTriangle className="h-4 w-4" />
               <AlertTitle>Erreur</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
            </Alert>
             <Button onClick={() => router.push('/')} variant="link" className="mt-4 text-primary">
                Retour à l'accueil
             </Button>
         </div>
     );
   }

  if (!party) {
    // This state should ideally be covered by the error state after fetch fails or doc doesn't exist
    return <div className="container mx-auto px-4 py-12 text-center">Fête non trouvée.</div>;
  }


  const partyDate = new Date(party.date.seconds * 1000);
  // Sort comments by timestamp, newest first
  const sortedComments = party.comments.sort((a, b) => {
      const timeA = a.timestamp instanceof Timestamp ? a.timestamp.toMillis() : a.timestamp.seconds * 1000;
      const timeB = b.timestamp instanceof Timestamp ? b.timestamp.toMillis() : b.timestamp.seconds * 1000;
      return timeB - timeA;
    });

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <Card className="bg-card border border-border overflow-hidden shadow-lg">
        {/* Header Section with Cover Photo */}
        <CardHeader className="p-0 relative border-b border-border/50">
           <div className="relative h-48 md:h-64 lg:h-80 w-full">
               {party.coverPhotoUrl ? (
                   <Image
                       src={party.coverPhotoUrl}
                       alt={`Photo de couverture pour ${party.name}`}
                       layout="fill"
                       objectFit="cover"
                       quality={80}
                       priority // Load cover photo eagerly
                       data-ai-hint="fête couverture événement"
                   />
               ) : (
                   <div className="absolute inset-0 bg-gradient-to-br from-secondary via-muted to-secondary flex items-center justify-center">
                        <ImageIcon className="h-16 w-16 text-muted-foreground/50" />
                   </div>
               )}
                {/* Gradient overlay for text contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />

                {/* Text content positioned at the bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white z-10">
                    <CardTitle className="text-2xl md:text-4xl font-bold mb-1 text-shadow">
                        {party.name}
                    </CardTitle>
                    <CardDescription className="text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                       <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/> {format(partyDate, 'PPP', { locale: fr })}</span>
                       {party.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/> {party.location}</span>}
                       <span className="flex items-center gap-1.5"><User className="h-4 w-4"/> Créé par {party.creatorEmail || 'Inconnu'}</span>
                    </CardDescription>
                     {party.description && (
                        <p className="mt-3 text-sm text-gray-200 line-clamp-2">{party.description}</p>
                     )}
                </div>

                 {/* Average Rating Badge */}
                 <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                     <Badge variant="secondary" className="backdrop-blur-sm bg-black/50 border-white/20 text-base px-3 py-1">
                         <Star className="h-4 w-4 text-yellow-400 fill-current mr-1.5" />
                         {averageRating.toFixed(1)}
                         <span className="text-xs text-muted-foreground ml-1">/ 5</span>
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
                    <h3 className="text-xl font-semibold mb-4 text-foreground">Souvenirs</h3>
                    {party.mediaUrls && party.mediaUrls.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                        {party.mediaUrls.map(renderMedia)}
                    </div>
                    ) : (
                    <p className="text-muted-foreground text-sm">Aucun souvenir importé pour cette fête.</p>
                    )}
                </CardContent>

                 {/* Comments Section */}
                 <CardContent className="p-4 md:p-6 border-t border-border/50">
                    <h3 className="text-xl font-semibold mb-5 text-foreground">Commentaires ({sortedComments.length})</h3>
                    <div className="space-y-6">
                       {/* Add Comment Form */}
                       {user && (
                        <div className="flex items-start space-x-3">
                            <Avatar className="h-9 w-9 border mt-1">
                                <AvatarImage src={user.photoURL || undefined} alt={user.email || ''}/>
                                <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <Textarea
                                    placeholder="Votre commentaire..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="w-full mb-2 bg-input border-border focus:bg-background focus:border-primary"
                                    rows={3}
                                />
                                <Button
                                    onClick={handleAddComment}
                                    disabled={!comment.trim() || isSubmittingComment}
                                    size="sm"
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                    Commenter
                                </Button>
                            </div>
                        </div>
                       )}
                       {!user && (
                            <p className="text-muted-foreground text-sm">
                                <button onClick={() => router.push('/auth')} className="text-primary hover:underline font-medium">Connectez-vous</button> pour laisser un commentaire ou noter.
                            </p>
                        )}

                      {/* Display Comments */}
                       {sortedComments.length > 0 ? (
                        <div className="space-y-4">
                            {sortedComments.map((cmt, index) => (
                            <div key={index} className="flex items-start space-x-3">
                                <Avatar className="h-8 w-8 border">
                                    <AvatarImage src={cmt.avatar || undefined} alt={cmt.email}/>
                                     <AvatarFallback className="text-xs">{getInitials(cmt.email)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 bg-secondary/50 p-3 rounded-lg border border-border/30">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="text-xs font-medium text-foreground">{cmt.email}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {cmt.timestamp instanceof Timestamp
                                            ? format(cmt.timestamp.toDate(), 'PPp', { locale: fr })
                                            : format(new Date(cmt.timestamp.seconds * 1000), 'PPp', { locale: fr })
                                        }
                                    </p>
                                </div>
                                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{cmt.text}</p>
                                </div>
                            </div>
                            ))}
                        </div>
                       ) : (
                           !user && <p className="text-muted-foreground text-center text-sm py-4">Aucun commentaire pour l'instant.</p>
                           // If user is logged in but no comments, the form is shown, so no extra message needed.
                       )}
                    </div>
                 </CardContent>
             </div>

             {/* Right Column (Span 1): Rating & Participants */}
             <div className="lg:col-span-1">
                 {/* Rating Section */}
                 <CardContent className="p-4 md:p-6">
                     <h3 className="text-xl font-semibold mb-4 text-foreground">Votre Note</h3>
                      <div className="flex flex-col items-center gap-3 bg-secondary/30 border border-border/50 p-4 rounded-lg">
                          <StarRating
                              rating={userRating}
                              onRate={handleRateParty}
                              disabled={!user || isRating}
                              size="h-8 w-8" // Larger stars for rating
                          />
                          {isRating && <span className="text-xs text-muted-foreground">Envoi...</span>}
                           {!user && <span className="text-xs text-muted-foreground mt-1">Connectez-vous pour noter</span>}
                           {user && userRating > 0 && <span className="text-xs text-muted-foreground mt-1">Votre note : {userRating}/5</span>}
                            {user && userRating === 0 && <span className="text-xs text-muted-foreground mt-1">Donnez une note !</span>}
                      </div>
                 </CardContent>

                {/* Rating Distribution Chart Section */}
                <CardContent className="p-4 md:p-6 border-t border-border/50">
                    <RatingDistributionChart ratings={party.ratings} />
                </CardContent>

                 {/* Participants Section */}
                 <CardContent className="p-4 md:p-6 border-t border-border/50">
                    <h3 className="text-xl font-semibold mb-4 text-foreground">Participants ({party.participantEmails?.length || 1})</h3>
                     <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                         {(party.participantEmails || [party.creatorEmail]).map((email, index) => (
                             <div key={email || index} className="flex items-center space-x-3 p-2 rounded-md hover:bg-secondary/50">
                                 <Avatar className="h-8 w-8 border">
                                     {/* TODO: Fetch participant avatarUrl from user profile if available */}
                                     <AvatarFallback className={`${participantColors[index % participantColors.length]} text-primary-foreground text-xs`}>
                                         {getInitials(email)}
                                     </AvatarFallback>
                                 </Avatar>
                                 <span className="text-sm font-medium text-foreground truncate">{email || 'Créateur'}</span>
                                 {/* Add role badge if needed */}
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

// Helper for class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}
