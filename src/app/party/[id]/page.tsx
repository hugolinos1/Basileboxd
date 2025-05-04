'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase'; // Import potentially null db
import { useFirebase } from '@/context/FirebaseContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale'; // Import French locale
import { Star, Send, User, MapPin, CalendarDays, Image as ImageIcon, Video, Music, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import ReactPlayer from 'react-player/lazy'; // Using react-player for video/audio

interface PartyData {
    id: string;
    name: string;
    description: string;
    date: { seconds: number; nanoseconds: number }; // Firestore Timestamp structure
    location: string;
    createdBy: string;
    creatorEmail: string;
    participants: string[];
    participantEmails?: string[]; // Optional: if stored
    mediaUrls: string[];
    ratings: { [userId: string]: number };
    comments: { userId: string; email: string; avatar?: string; text: string; timestamp: { seconds: number, nanoseconds: number} }[];
    createdAt: { seconds: number; nanoseconds: number };
}

const StarRating = ({ totalStars = 5, rating, onRate, disabled = false }: { totalStars?: number, rating: number, onRate: (rating: number) => void, disabled?: boolean }) => {
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div className={`flex space-x-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      {[...Array(totalStars)].map((_, index) => {
        const starValue = index + 1;
        const filled = starValue <= (hoverRating || rating);
        return (
          <Star
            key={index}
            className={`h-6 w-6 transition-colors duration-150 ${
              filled ? 'text-yellow-400 fill-current' : 'text-gray-500'
            } ${!disabled ? 'hover:text-yellow-300' : ''}`}
            onClick={() => !disabled && onRate(starValue)}
            onMouseEnter={() => !disabled && setHoverRating(starValue)}
            onMouseLeave={() => !disabled && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
};


export default function PartyDetailsPage() {
  const params = useParams();
  const partyId = params.id as string;
  const router = useRouter();
  const { user } = useFirebase();
  const { toast } = useToast();

  const [party, setParty] = useState<PartyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [userRating, setUserRating] = useState<number>(0);
  const [averageRating, setAverageRating] = useState<number>(0);
   const [playerError, setPlayerError] = useState<string | null>(null); // For react-player errors

  useEffect(() => {
    if (!partyId) return;
    if (!db) {
        console.error("Firestore non initialisé. Impossible de récupérer la fête.");
        toast({ title: 'Erreur', description: 'La base de données n\'est pas disponible.', variant: 'destructive' });
        setLoading(false);
        return;
      }

    const fetchParty = async () => {
      setLoading(true);
      try {
        const partyDocRef = doc(db, 'parties', partyId);
        const partyDocSnap = await getDoc(partyDocRef);

        if (partyDocSnap.exists()) {
          const data = { id: partyDocSnap.id, ...partyDocSnap.data() } as PartyData;
          setParty(data);
          // Calculate initial average rating
          calculateAverageRating(data.ratings);
          // Set user's existing rating if available
          if (user && data.ratings[user.uid]) {
            setUserRating(data.ratings[user.uid]);
          } else {
              setUserRating(0); // Reset if user has no rating
          }
        } else {
          toast({ title: 'Erreur', description: 'Fête non trouvée.', variant: 'destructive' });
          router.push('/'); // Redirect if party doesn't exist
        }
      } catch (error) {
        console.error('Erreur lors de la récupération de la fête :', error);
        toast({ title: 'Erreur', description: 'Impossible de charger les détails de la fête.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchParty();
  }, [partyId, router, toast, user]); // Add user to dependency array


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
     if (!party || !db) {
         toast({ title: 'Erreur', description: 'Impossible de noter pour le moment.', variant: 'destructive' });
         return;
     };
     setIsRating(true);

     try {
         const partyDocRef = doc(db, 'parties', party.id);
         const newRatings = { ...party.ratings, [user.uid]: newRating };

         await updateDoc(partyDocRef, {
             ratings: newRatings
         });

         setUserRating(newRating);
         calculateAverageRating(newRatings); // Recalculate average
         setParty(prev => prev ? { ...prev, ratings: newRatings } : null); // Update local state

         toast({ title: 'Note envoyée', description: `Vous avez noté cette fête ${newRating} étoiles.` });

     } catch (error) {
         console.error("Erreur lors de l'envoi de la note :", error);
         toast({ title: 'Erreur', description: 'Impossible d\'envoyer la note.', variant: 'destructive' });
     } finally {
         setIsRating(false);
     }
  };


  const handleAddComment = async () => {
    if (!user) {
      toast({ title: 'Connexion requise', description: 'Veuillez vous connecter pour commenter.', variant: 'destructive' });
      return;
    }
    if (!party || !comment.trim() || !db) {
        toast({ title: 'Erreur', description: 'Impossible d\'ajouter un commentaire pour le moment.', variant: 'destructive' });
        return
    };

    setIsSubmittingComment(true);
    try {
      const partyDocRef = doc(db, 'parties', party.id);
      const newComment = {
        userId: user.uid,
        email: user.email || 'anonyme',
        avatar: user.photoURL || undefined, // Use Google photo if available
        text: comment.trim(),
        timestamp: serverTimestamp(), // Use server timestamp
      };

      await updateDoc(partyDocRef, {
        comments: arrayUnion(newComment),
      });

      // Optimistically update local state
       const optimisticTimestamp = { seconds: Date.now() / 1000, nanoseconds: 0 };
       setParty(prev => prev ? { ...prev, comments: [...prev.comments, { ...newComment, timestamp: optimisticTimestamp }] } : null);


      setComment(''); // Clear comment input
      toast({ title: 'Commentaire ajouté' });
    } catch (error) {
      console.error('Erreur lors de l\'ajout du commentaire :', error);
      toast({ title: 'Erreur', description: 'Impossible d\'ajouter le commentaire.', variant: 'destructive' });
    } finally {
      setIsSubmittingComment(false);
    }
  };

   // Render helper for media
   const renderMedia = (url: string, index: number) => {
     const onError = (e: any) => {
        console.error(`Erreur lors du chargement du média ${url}:`, e);
        setPlayerError(`Impossible de charger le média : ${url.substring(url.lastIndexOf('/') + 1)}`);
        // Optionally hide the player or show a placeholder
     }

     if (url.includes('.mp4') || url.includes('.mov') || url.includes('video') || url.includes('youtube.com') || url.includes('vimeo.com')) { // Basic video check
       return (
         <div key={index} className="aspect-video bg-black rounded-lg overflow-hidden relative">
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
                config={{ file: { attributes: { controlsList: 'nodownload' } } }} // Optional: disable download
            />
         </div>
       );
     } else if (url.includes('.mp3') || url.includes('.wav') || url.includes('audio')) { // Basic audio check
       return (
         <div key={index} className="w-full bg-card p-4 rounded-lg shadow">
           <ReactPlayer url={url} controls width="100%" height="50px" onError={onError}/>
             {playerError && url === playerError.substring(playerError.indexOf(':') + 2) && (
                <p className="text-destructive text-xs mt-2">Erreur de chargement de l'audio</p>
            )}
         </div>
       );
     } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp') || url.includes('image')) { // Basic image check
       return (
         <div key={index} className="relative aspect-square w-full overflow-hidden rounded-lg shadow-md group">
           <Image
             src={url}
             alt={`Média de la fête ${index + 1}`}
             layout="fill"
             objectFit="cover"
             className="transition-transform duration-300 group-hover:scale-105"
             loading="lazy"
             onError={onError}
           />
            {playerError && url === playerError.substring(playerError.indexOf(':') + 2) && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-destructive-foreground p-4 text-center">
                    Erreur de chargement de l'image
                </div>
            )}
         </div>
       );
     }
     // Fallback for unknown types or simple link
     return <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">{url.substring(url.lastIndexOf('/')+1)}</a>;
   };

    const getInitials = (email: string | null | undefined): string => {
      if (!email) return '?';
      const parts = email.split('@')[0];
      return parts[0]?.toUpperCase() || '?';
    };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!party) {
    // Should have been redirected, but as a fallback
    return <div className="container mx-auto px-4 py-12 text-center">Fête non trouvée.</div>;
  }


  const partyDate = new Date(party.date.seconds * 1000);

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <Card className="bg-card border border-border overflow-hidden">
        {/* Header Section */}
        <CardHeader className="p-6 md:p-8 border-b border-border/50">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                     <CardTitle className="text-2xl md:text-3xl font-bold text-primary mb-2">{party.name}</CardTitle>
                     <CardDescription className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                       <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4"/> {format(partyDate, 'PPP', { locale: fr })}</span>
                       {party.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4"/> {party.location}</span>}
                       <span className="flex items-center gap-1"><User className="h-4 w-4"/> Créé par {party.creatorEmail || 'Inconnu'}</span>
                    </CardDescription>
                </div>
                 <div className="flex flex-col items-start md:items-end gap-2 flex-shrink-0 mt-4 md:mt-0">
                   <div className="flex items-center gap-2">
                       <StarRating
                          rating={userRating}
                          onRate={handleRateParty}
                          disabled={!user || isRating}
                       />
                        <Badge variant="secondary" className="text-xs font-semibold">
                           {averageRating.toFixed(1)} ({Object.keys(party.ratings).length} notes)
                        </Badge>
                   </div>
                     {isRating && <span className="text-xs text-muted-foreground">Envoi...</span>}
                     {!user && <span className="text-xs text-muted-foreground">Connectez-vous pour noter</span>}
                </div>

            </div>


          {party.description && (
            <p className="mt-4 text-foreground/90">{party.description}</p>
          )}
        </CardHeader>

        {/* Media Section */}
        <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-semibold mb-4 text-foreground">Galerie Média</h3>
            {party.mediaUrls && party.mediaUrls.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {party.mediaUrls.map(renderMedia)}
            </div>
            ) : (
            <p className="text-muted-foreground">Aucun média téléchargé pour cette fête pour l'instant.</p>
            )}
        </CardContent>

        {/* Comments Section */}
         <CardContent className="p-6 md:p-8 border-t border-border/50">
            <h3 className="text-xl font-semibold mb-6 text-foreground">Commentaires ({party.comments.length})</h3>
            <div className="space-y-6">
              {/* Add Comment Form */}
               {user && (
                <div className="flex items-start space-x-4">
                    <Avatar className="h-10 w-10 border">
                        <AvatarImage src={user.photoURL || undefined} alt={user.email || ''}/>
                        <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                    <Textarea
                        placeholder="Ajouter votre commentaire..."
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
                        Poster le commentaire
                    </Button>
                    </div>
                </div>
               )}
                {!user && (
                    <p className="text-muted-foreground text-sm">
                        <button onClick={() => router.push('/auth')} className="text-primary hover:underline font-medium">Connectez-vous</button> pour laisser un commentaire.
                    </p>
                )}

              {/* Display Comments */}
               {party.comments.length > 0 ? (
                <div className="space-y-4">
                    {party.comments
                    .sort((a, b) => b.timestamp.seconds - a.timestamp.seconds) // Sort newest first
                    .map((cmt, index) => (
                    <div key={index} className="flex items-start space-x-3">
                        <Avatar className="h-8 w-8 border">
                            <AvatarImage src={cmt.avatar || undefined} alt={cmt.email}/>
                             <AvatarFallback className="text-xs">{getInitials(cmt.email)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-secondary p-3 rounded-md">
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-xs font-semibold text-foreground">{cmt.email}</p>
                            <p className="text-xs text-muted-foreground">
                                {format(new Date(cmt.timestamp.seconds * 1000), 'PPp', { locale: fr })}
                            </p>
                        </div>
                        <p className="text-sm text-foreground/90">{cmt.text}</p>
                        </div>
                    </div>
                    ))}
                </div>
               ) : (
                 <p className="text-muted-foreground text-center py-4">Aucun commentaire pour l'instant. Soyez le premier à partager vos pensées !</p>
               )}
            </div>
         </CardContent>

      </Card>
    </div>
  );
}
