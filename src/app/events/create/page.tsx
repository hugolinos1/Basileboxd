
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { CalendarIcon, Loader2, UserPlus, X, Upload, Image as ImageIcon, Star, MapPin, Clock } from 'lucide-react'; // Removed MessageSquare import
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { compressMedia } from '@/services/media-compressor';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Progress } from '@/components/ui/progress';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Video, Music, File } from 'lucide-react';


// Schema Definition remains similar, add coverPhoto, initialRating, initialComment
const MAX_FILE_SIZE = {
  image: 1 * 1024 * 1024, // 1MB
  video: 10 * 1024 * 1024, // 10MB
  audio: 5 * 1024 * 1024, // 5MB
};
const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
const ACCEPTED_COVER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Use z.instanceof for better type checking across environments
const fileSchema = typeof window !== 'undefined'
  ? z.instanceof(File, { message: 'Veuillez télécharger un fichier' })
  : z.any(); // Fallback for server-side rendering

const coverPhotoSchema = fileSchema.refine(
    (file) => {
        // Check if in browser environment AND if it's a File instance before accessing file properties
        const isFile = typeof window !== 'undefined' && file instanceof File;
        // Ensure file properties are accessed only if it's a valid File object
        return isFile ? ACCEPTED_COVER_PHOTO_TYPES.includes(file.type) : true; // Allow validation to pass server-side
    },
    "Type de photo non supporté."
).refine(
    (file) => {
        const isFile = typeof window !== 'undefined' && file instanceof File;
        return isFile ? file.size <= MAX_FILE_SIZE.image : true; // Allow validation to pass server-side
    },
     `La photo de couverture ne doit pas dépasser ${MAX_FILE_SIZE.image / 1024 / 1024}Mo.`
).optional(); // Make cover photo optional


const formSchema = z.object({
  name: z.string().min(2, { message: 'Le nom de la soirée doit contenir au moins 2 caractères.' }).max(100),
  description: z.string().max(500).optional(),
  date: z.date({ required_error: 'Une date pour la soirée est requise.' }),
  location: z.string().max(150).optional(), // Keep location optional for now
  participants: z.array(z.string().email()).optional(), // Array of emails for participants
  media: z.array(fileSchema).optional(), // Array of files for general media
  coverPhoto: coverPhotoSchema, // Optional single cover photo
  initialRating: z.number().min(0.5, { message: "La note doit être d'au moins 0.5." }).max(5, { message: "La note ne peut pas dépasser 5." }).step(0.5).optional(), // Allow 0.5 increments
  initialComment: z.string().max(500, { message: "Le commentaire ne peut pas dépasser 500 caractères." }).optional(),
});

type EventFormValues = z.infer<typeof formSchema>;

// Helper to get file type category
const getFileType = (file: File): 'image' | 'video' | 'audio' | 'other' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'other';
};

// Couleurs Tailwind pour les avatars des participants
const participantColors = [
  'bg-red-600',
  'bg-blue-600',
  'bg-green-600',
  'bg-yellow-600',
  'bg-purple-600',
  'bg-pink-600',
  'bg-indigo-600',
  'bg-teal-600',
];

export default function CreateEventPage() {
  const { user } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number>(0); // State to display rating

  // --- Mock Participants Data ---
  const [mockParticipants, setMockParticipants] = useState([
    { id: '1', name: 'Thomas', status: 'En attente', initials: 'T' },
    { id: '2', name: 'Sophie', status: 'En attente', initials: 'S' },
    { id: '3', name: 'Marc', status: 'En attente', initials: 'M' },
    { id: '4', name: 'Julie', status: 'En attente', initials: 'J' },
    { id: '5', name: 'Alex', status: 'En attente', initials: 'A' },
  ]);
   // ----------------------------

  useEffect(() => {
    if (!user && !isLoading) {
      router.push('/auth');
      toast({ title: 'Authentification requise', description: 'Veuillez vous connecter pour créer un événement.', variant: 'destructive' });
    }
  }, [user, isLoading, router, toast]);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      date: undefined,
      location: '',
      participants: [],
      media: [],
      coverPhoto: undefined,
      initialRating: undefined,
      initialComment: '',
    },
  });

    // Watch form values for the preview card
    const watchedName = form.watch('name');
    const watchedDate = form.watch('date');
    const watchedLocation = form.watch('location');
    const watchedDescription = form.watch('description');
    const watchedRating = form.watch('initialRating'); // Watch the rating

    useEffect(() => {
        setCurrentRating(watchedRating || 0);
    }, [watchedRating]);


   // Media File Handling
   const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const currentFiles = form.getValues('media') || [];
            const newFiles = Array.from(files);
            const combinedFiles = [...currentFiles, ...newFiles];
            form.setValue('media', combinedFiles, { shouldValidate: true });

            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setMediaPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeMediaFile = (index: number) => {
        const currentFiles = form.getValues('media') || [];
        const updatedFiles = currentFiles.filter((_, i) => i !== index);
        form.setValue('media', updatedFiles, { shouldValidate: true });

        URL.revokeObjectURL(mediaPreviews[index]);
        setMediaPreviews(prev => prev.filter((_, i) => i !== index));
    };

     // Cover Photo Handling
    const handleCoverPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
             // Validate the file against the schema before setting value and preview
             const validationResult = coverPhotoSchema.safeParse(file);
             if (validationResult.success) {
                 form.setValue('coverPhoto', file, { shouldValidate: true });
                 if (coverPhotoPreview) {
                     URL.revokeObjectURL(coverPhotoPreview); // Clean up previous preview
                 }
                 setCoverPhotoPreview(URL.createObjectURL(file));
             } else {
                 // Show validation error
                 form.setError('coverPhoto', { type: 'manual', message: validationResult.error.errors[0]?.message });
                 // Optionally clear the input and preview
                  form.setValue('coverPhoto', undefined, { shouldValidate: true });
                  if (coverPhotoPreview) {
                    URL.revokeObjectURL(coverPhotoPreview);
                  }
                  setCoverPhotoPreview(null);
                  (event.target as HTMLInputElement).value = ''; // Clear file input
             }
        } else {
            form.setValue('coverPhoto', undefined, { shouldValidate: true });
            if (coverPhotoPreview) {
                URL.revokeObjectURL(coverPhotoPreview);
            }
            setCoverPhotoPreview(null);
        }
    };

     const removeCoverPhoto = () => {
        form.setValue('coverPhoto', undefined, { shouldValidate: true });
        if (coverPhotoPreview) {
            URL.revokeObjectURL(coverPhotoPreview);
        }
        setCoverPhotoPreview(null);
        // Clear the file input visually
        const input = document.getElementById('cover-photo-input') as HTMLInputElement;
        if (input) {
            input.value = '';
        }
    };


    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            mediaPreviews.forEach(url => URL.revokeObjectURL(url));
            if (coverPhotoPreview) {
                URL.revokeObjectURL(coverPhotoPreview);
            }
        }
    }, [mediaPreviews, coverPhotoPreview]);


    // Simplified upload logic (based on existing party/create)
    const uploadFile = async (file: File, partyId: string, isCover: boolean = false): Promise<string> => {
        if (!storage) {
            throw new Error("Le service de stockage n'est pas disponible.");
        }
        return new Promise(async (resolve, reject) => {
            const fileType = getFileType(file);
            let fileToUpload = file;
            let targetSizeMB = 0;
            let maxSize = 0;

            if (fileType === 'image') {
                targetSizeMB = MAX_FILE_SIZE.image / (1024 * 1024);
                maxSize = MAX_FILE_SIZE.image;
            } else if (fileType === 'video') {
                targetSizeMB = MAX_FILE_SIZE.video / (1024 * 1024);
                 maxSize = MAX_FILE_SIZE.video;
            } else if (fileType === 'audio') {
                targetSizeMB = MAX_FILE_SIZE.audio / (1024 * 1024);
                 maxSize = MAX_FILE_SIZE.audio;
            } else if (!isCover) { // Don't reject if it's just not an image/video/audio for general media
                 console.warn(`Type de fichier non supporté pour la compression : ${file.type}`);
                 maxSize = 50 * 1024 * 1024; // Allow other types up to 50MB for now
            }
             else { // Reject unsupported cover photo types
                 reject(new Error('Type de fichier non supporté pour la photo de couverture'));
                 return;
            }

            // Compress images
            if (fileType === 'image') {
                try {
                    const compressedBlobResult = await compressMedia(file, { maxSizeMB: targetSizeMB });
                    const compressedBlob = compressedBlobResult.blob;
                    fileToUpload = compressedBlob instanceof File ? compressedBlob : new File([compressedBlob], file.name, { type: compressedBlob.type });
                    // Use compressed file only if smaller
                    if(fileToUpload.size >= file.size) {
                        fileToUpload = file;
                        console.log(`Compression n'a pas réduit la taille pour ${file.name}, utilisation de l'original.`);
                    }
                } catch (compressionError) {
                    console.warn(`Impossible de compresser l'image ${file.name}:`, compressionError);
                    fileToUpload = file; // Proceed with original if compression fails
                }
            }

            // Check final size
            if (maxSize !== Infinity && fileToUpload.size > maxSize) {
                 reject(new Error(`Le fichier ${file.name} dépasse la limite de taille autorisée (${(maxSize / 1024 / 1024).toFixed(1)}Mo).`));
                 return;
            }

            const filePath = isCover
                ? `parties/${partyId}/cover/${Date.now()}_${fileToUpload.name}`
                : `parties/${partyId}/${fileType}s/${Date.now()}_${fileToUpload.name}`;
            const storageRef = ref(storage, filePath);
            const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

             uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: progress }));
                },
                (error) => {
                    console.error("Échec du téléversement :", error);
                    setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: -1 })); // Indicate error
                    reject(error);
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: 100 })); // Mark as complete
                        resolve(downloadURL);
                    } catch (error) {
                         console.error("Erreur lors de l'obtention de l'URL de téléchargement :", error);
                        reject(error);
                    }
                }
            );
        });
    };

  async function onSubmit(values: EventFormValues) {
    if (!user) {
       toast({ title: 'Non authentifié', description: 'Veuillez vous connecter d\'abord.', variant: 'destructive' });
       return;
     }
      if (!db || !storage) {
         toast({ title: 'Erreur de service', description: 'Les services Firebase ne sont pas disponibles. Veuillez réessayer plus tard.', variant: 'destructive' });
         setIsLoading(false);
         return;
       }
    setIsLoading(true);
    setUploadProgress({}); // Reset progress

    try {
        // 1. Create party document without media/cover URLs first
         const partyData: any = { // Use 'any' temporarily or define a proper type
            name: values.name,
            description: values.description || '',
            date: values.date,
            location: values.location || '',
            createdBy: user.uid,
            creatorEmail: user.email,
            participants: [user.uid], // Creator is always a participant
            participantEmails: [user.email], // Store emails for easier lookup initially
            mediaUrls: [], // Initialize as empty
            coverPhotoUrl: '', // Initialize as empty
            ratings: {}, // Initialize empty
            comments: [], // Initialize empty
            createdAt: serverTimestamp(),
         };

          // Add initial rating if provided
          if (values.initialRating !== undefined) {
                partyData.ratings[user.uid] = values.initialRating;
          }

          // Add initial comment if provided
          let initialCommentData: any = null;
            if (values.initialComment && values.initialComment.trim()) {
                initialCommentData = {
                    userId: user.uid,
                    email: user.email || 'Anonyme',
                    avatar: user.photoURL || undefined,
                    text: values.initialComment.trim(),
                    timestamp: serverTimestamp() // Use server timestamp here
                };
                // We will add this with arrayUnion after doc creation
            }


         const partyDocRef = await addDoc(collection(db, 'parties'), partyData);
         const partyId = partyDocRef.id;

          // Add initial comment if it exists
          if (initialCommentData) {
                await updateDoc(partyDocRef, {
                    comments: arrayUnion(initialCommentData)
                });
          }


        // 2. Upload Cover Photo (if provided)
        let coverPhotoUrl = '';
        if (values.coverPhoto) {
            try {
                coverPhotoUrl = await uploadFile(values.coverPhoto, partyId, true);
            } catch (error: any) {
                 toast({
                    title: `Échec du téléversement de la photo de couverture`,
                    description: error.message || 'Impossible de téléverser le fichier.',
                    variant: 'destructive',
                });
                // Continue creating the event without a cover photo
            }
        }

        // 3. Upload Media Files (if any)
         const mediaUrls: string[] = [];
         if (values.media && values.media.length > 0) {
             const uploadPromises = values.media.map(file =>
                 uploadFile(file, partyId).catch(error => {
                     toast({
                         title: `Échec du téléversement pour ${file.name}`,
                         description: error.message || 'Impossible de téléverser le fichier.',
                         variant: 'destructive',
                     });
                     return null; // Return null for failed uploads
                 })
             );
             const results = await Promise.all(uploadPromises);
             results.forEach(url => {
                 if (url) mediaUrls.push(url); // Only add successful URLs
             });
             if (values.media.length > 0 && mediaUrls.length === 0 && !coverPhotoUrl) {
                 // All uploads failed, and no cover photo either
                 throw new Error("Tous les téléversements de médias ont échoué. Création de l'événement annulée.");
             }
         }

        // 4. Update party document with media and cover URLs
         await updateDoc(partyDocRef, {
            mediaUrls: mediaUrls,
            coverPhotoUrl: coverPhotoUrl || '' // Use uploaded URL or empty string
         });


      toast({
        title: 'Événement créé !',
        description: `"${values.name}" est prêt à être partagé.`,
      });
      router.push(`/party/${partyId}`);

    } catch (error: any) {
      console.error('Erreur lors de la création de l\'événement :', error);
      toast({
        title: 'Échec de la création',
        description: error.message || 'Une erreur inattendue est survenue.',
        variant: 'destructive',
      });
       // Consider deleting the Firestore doc if creation failed mid-way? Complex, maybe handle later.
    } finally {
      setIsLoading(false);
    }
  }

   if (!user && !isLoading) {
     return <div className="container mx-auto px-4 py-12 text-center">Redirection vers la connexion...</div>;
   }

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl"> {/* Increased max-width */}
        <h1 className="text-3xl font-bold mb-8 text-center text-primary">Créer un Nouvel Événement</h1>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8"> {/* 3-column layout on large screens */}

                 {/* Column 1: Basic Info, Cover Photo, Participants */}
                 <div className="lg:col-span-2 space-y-8"> {/* Spans 2 columns */}
                      {/* --- Informations de base Card --- */}
                      <Card className="bg-card border border-border">
                          <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                               <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                               <CardTitle className="text-lg font-semibold">Informations de base</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Nom de la soirée *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex : Anniversaire de Léa" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                            placeholder="Décrivez votre soirée en quelques mots..."
                                            className="resize-none bg-input border-border focus:bg-background focus:border-primary"
                                            {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                            <FormLabel>Date *</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                    variant={'outline'}
                                                    className={cn(
                                                        'w-full pl-3 text-left font-normal bg-input border-border hover:bg-accent',
                                                        !field.value && 'text-muted-foreground'
                                                    )}
                                                    >
                                                    {field.value ? (
                                                        format(field.value, 'PPP', { locale: fr })
                                                    ) : (
                                                        <span>jj/mm/aaaa</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
                                                <Calendar
                                                    locale={fr}
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    // Removed disabled prop to allow past dates
                                                    initialFocus
                                                />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="location"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Lieu (Optionnel)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ex : Sunset Beach Club" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                </div>
                          </CardContent>
                      </Card>

                       {/* --- Photo de l'Event Card (Cover Photo) --- */}
                       <Card className="bg-card border border-border">
                           <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                               <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
                               <CardTitle className="text-lg font-semibold">Photo de l'Événement</CardTitle>
                           </CardHeader>
                           <CardContent className="flex flex-col md:flex-row items-center gap-6">
                                <FormField
                                    control={form.control}
                                    name="coverPhoto"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            {/* Outer container for the visual dropzone area and preview */}
                                            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 text-center bg-secondary/50 h-48 md:h-64 relative">
                                                <FormControl>
                                                   {/* Removed the unnecessary React.Fragment that caused the error */}
                                                     {coverPhotoPreview ? (
                                                         <div className="relative w-full h-full">
                                                             <Image src={coverPhotoPreview} alt="Aperçu photo de couverture" layout="fill" objectFit="contain" className="rounded-md"/>
                                                             <Button
                                                                 type="button"
                                                                 variant="destructive"
                                                                 size="icon"
                                                                 className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10"
                                                                 onClick={removeCoverPhoto}
                                                             >
                                                                 <X className="h-4 w-4" />
                                                                 <span className="sr-only">Retirer photo</span>
                                                             </Button>
                                                         </div>
                                                     ) : (
                                                         <div className="flex flex-col items-center justify-center text-center h-full">
                                                             <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                                                             <p className="text-sm text-muted-foreground mb-2">Ajoutez une photo pour personnaliser votre soirée.</p>
                                                             <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('cover-photo-input')?.click()}>
                                                                 <Upload className="mr-2 h-4 w-4" />
                                                                 Ajouter une photo
                                                             </Button>
                                                         </div>
                                                     )}
                                                      {/* Hidden actual input - controlled by React Hook Form */}
                                                     <Input
                                                         id="cover-photo-input"
                                                         type="file"
                                                         accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')}
                                                         onChange={handleCoverPhotoChange}
                                                         className="sr-only"
                                                         ref={field.ref}
                                                         onBlur={field.onBlur}
                                                         name={field.name}
                                                         disabled={field.disabled}
                                                         // Remove value and onChange from here, RHF handles it
                                                     />

                                                </FormControl>
                                                <FormMessage className="absolute bottom-2 left-2 right-2 text-xs"/>
                                            </div>
                                        </FormItem>
                                    )}
                                />


                               {/* Preview Card */}
                               <div className="w-full md:w-64 flex-shrink-0">
                                    <Card className="bg-secondary border-border overflow-hidden">
                                        <CardHeader className="p-0 relative">
                                            <div className="aspect-[4/3] relative w-full bg-muted flex items-center justify-center">
                                                 {coverPhotoPreview ? (
                                                     <Image src={coverPhotoPreview} alt="Aperçu carte" layout="fill" objectFit="cover" />
                                                 ) : (
                                                     <ImageIcon className="h-10 w-10 text-muted-foreground" data-ai-hint="carte vide"/>
                                                 )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-3">
                                            <CardTitle className="text-sm font-semibold leading-tight mb-1 truncate">
                                                {watchedName || "Nom de la soirée"}
                                            </CardTitle>
                                            <div className="flex items-center space-x-1 text-xs text-yellow-400 mb-1">
                                               {Array.from({ length: 5 }).map((_, i) => (
                                                  <Star key={i} className={`h-3 w-3 ${i < currentRating ? 'fill-current' : ''} ${ i + 0.5 === currentRating ? 'half-star' : '' }`} />
                                               ))}
                                                <span className="text-muted-foreground ml-1">{currentRating > 0 ? `${currentRating.toFixed(1)}/5` : "Nouvelle"}</span>
                                            </div>
                                             <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                                 <CalendarIcon className="h-3 w-3" />
                                                 <span>{watchedDate ? format(watchedDate, 'P', {locale: fr}) : '--/--/----'}</span>
                                                 <Clock className="h-3 w-3 ml-2"/>
                                                  <span>{watchedDate ? format(watchedDate, 'p', {locale: fr}) : '--:--'}</span>
                                             </div>
                                             <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                                <MapPin className="h-3 w-3"/>
                                                <span>{watchedLocation || "Lieu non spécifié"}</span>
                                             </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {watchedDescription || "Description non renseignée"}
                                            </p>
                                        </CardContent>
                                    </Card>
                               </div>
                           </CardContent>
                       </Card>

                        {/* --- Participants Card --- */}
                        <Card className="bg-card border border-border">
                           <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                               <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
                               <CardTitle className="text-lg font-semibold">Participants</CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-4">
                                <p className="text-sm font-medium text-muted-foreground">Liste des participants</p>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                     {mockParticipants.map((p, index) => (
                                        <div key={p.id} className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className={`${participantColors[index % participantColors.length]} text-primary-foreground text-xs`}>
                                                        {p.initials}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-medium">{p.name}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{p.status}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
                                      <Button type="button" variant="outline" className="flex-1 bg-secondary hover:bg-accent border-border" disabled> {/* Disabled for now */}
                                          <UserPlus className="mr-2 h-4 w-4"/> Ajouter
                                      </Button>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="participants"
                                    render={() => (
                                         <FormDescription>
                                            Recherchez des participants pour les ajouter (Fonctionnalité en développement).
                                        </FormDescription>
                                    )}
                                 />
                           </CardContent>
                      </Card>

                 </div>

                 {/* Column 2: Import Souvenirs, Evaluation & Submit */}
                  <div className="lg:col-span-1 space-y-8">
                     {/* --- Importer Souvenirs Card --- */}
                        <Card className="bg-card border border-border">
                            <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</div>
                                <CardTitle className="text-lg font-semibold">Importer des Souvenirs</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                 {/* Media Upload Button - Styled as per image */}
                                 <FormField
                                    control={form.control}
                                    name="media"
                                    render={({ field }) => (
                                        <FormItem>
                                        {/* Hidden actual input */}
                                        <FormControl>
                                             <Input
                                                id="media-upload-input"
                                                type="file"
                                                multiple
                                                accept={ACCEPTED_MEDIA_TYPES.join(',')}
                                                onChange={handleMediaFileChange}
                                                className="sr-only" // Hide the default input
                                                ref={field.ref} // Important for react-hook-form
                                                onBlur={field.onBlur}
                                                name={field.name}
                                                disabled={field.disabled}
                                            />
                                        </FormControl>
                                        {/* Custom styled button */}
                                        <Button type="button" variant="outline" className="w-full sm:w-auto bg-secondary hover:bg-accent border-border" onClick={() => document.getElementById('media-upload-input')?.click()}>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Importer Souvenirs (Photos, Vidéos, Sons)
                                        </Button>
                                         <FormDescription>
                                            Max {MAX_FILE_SIZE.image/1024/1024}Mo/Image, {MAX_FILE_SIZE.video/1024/1024}Mo/Vidéo, {MAX_FILE_SIZE.audio/1024/1024}Mo/Son.
                                        </FormDescription>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                {/* Media Previews & Progress */}
                                {(form.watch('media') || []).length > 0 && (
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-foreground">Souvenirs ajoutés :</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-3 gap-4"> {/* Adjust grid for lg breakpoint */}
                                            {(form.watch('media') || []).map((file, index) => (
                                                <div key={index} className="relative group border rounded-md p-2 bg-secondary space-y-1">
                                                    {mediaPreviews[index] && file.type.startsWith('image/') ? (
                                                        <Image src={mediaPreviews[index]} alt={`Aperçu ${file.name}`} width={80} height={80} className="rounded-md object-cover mx-auto h-16 w-16" />
                                                    ) : (
                                                        <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-md mx-auto text-muted-foreground text-2xl">
                                                            {/* Simple icons based on type */}
                                                            {file.type.startsWith('video/') && <Video className="h-8 w-8" />}
                                                            {file.type.startsWith('audio/') && <Music className="h-8 w-8" />}
                                                            {!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/') && <File className="h-8 w-8" />}
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground truncate text-center">{file.name}</p>
                                                    {uploadProgress[file.name] !== undefined && uploadProgress[file.name] >= 0 && uploadProgress[file.name] < 100 && (
                                                        <Progress value={uploadProgress[file.name]} className="h-1 w-full" />
                                                    )}
                                                    {uploadProgress[file.name] === 100 && (
                                                        <p className="text-xs text-green-500 text-center">Téléversé</p>
                                                    )}
                                                    {uploadProgress[file.name] === -1 && (
                                                        <p className="text-xs text-destructive text-center">Échec</p>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="icon"
                                                        className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full z-10"
                                                        onClick={() => removeMediaFile(index)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                        <span className="sr-only">Retirer {file.name}</span>
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* --- Evaluation Card --- */}
                         <Card className="bg-card border border-border">
                            <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">5</div>
                                <CardTitle className="text-lg font-semibold">Évaluation Initiale</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Rating Slider */}
                                <FormField
                                    control={form.control}
                                    name="initialRating"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center justify-between">
                                                <span>Note (Optionnel)</span>
                                                <span className="text-sm font-bold text-primary">{field.value?.toFixed(1) || '0.0'}/5</span> {/* Display with one decimal */}
                                            </FormLabel>
                                            <FormControl>
                                                 <div className="flex items-center space-x-3">
                                                      <Star className="h-5 w-5 text-muted-foreground"/>
                                                       <Slider
                                                           defaultValue={[0]}
                                                           value={field.value !== undefined ? [field.value] : [0]}
                                                           onValueChange={(value) => field.onChange(value[0] === 0 ? undefined : value[0])} // Set to undefined if 0
                                                           max={5}
                                                           step={0.5} // Set step to 0.5
                                                           className="flex-1"
                                                           ref={field.ref} // Add ref for react-hook-form
                                                        />
                                                       <Star className="h-5 w-5 text-yellow-400 fill-current"/>
                                                 </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {/* Comment Textarea */}
                                <FormField
                                    control={form.control}
                                    name="initialComment"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Commentaire (Optionnel)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                placeholder="Ajoutez un premier commentaire pour lancer la discussion..."
                                                className="resize-none bg-input border-border focus:bg-background focus:border-primary"
                                                rows={4}
                                                {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>


                       {/* Submit Button */}
                       <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-8" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Création de l'événement...
                                </>
                            ) : (
                                "Créer l'Événement"
                            )}
                        </Button>

                  </div>
            </form>
        </Form>
    </div>
  );
}
