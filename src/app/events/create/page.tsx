// src/app/events/create/page.tsx
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
import { CalendarIcon, Loader2, UserPlus, X, Upload, Image as ImageIcon, Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
// Import the centralized uploader and related constants/types
import {
  uploadFile,
  MAX_FILE_SIZE,
  ACCEPTED_MEDIA_TYPES,
  ACCEPTED_COVER_PHOTO_TYPES,
  getFileType,
  COMPRESSED_COVER_PHOTO_MAX_SIZE_MB,
  coverPhotoSchema // Import schema from dedicated file
} from '@/services/media-uploader';


import { Progress } from '@/components/ui/progress';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Video, Music, File as FileIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider'; // Added Slider import

// --- Schema Definition ---
const isBrowser = typeof window !== 'undefined';

// Use zod directly for file schema validation
const fileSchemaClient = isBrowser ? z.instanceof(File, { message: 'Veuillez télécharger un fichier' }) : z.any();
const fileSchemaServer = z.any(); // Fallback for SSR where File is not available
const fileSchema = isBrowser ? fileSchemaClient : fileSchemaServer;


const mediaFileSchema = fileSchema.refine(
    (file) => {
        if (!isBrowser || !(file instanceof File)) return true;
        const fileType = getFileType(file);
        let maxSize = 0;
        if (fileType === 'image') maxSize = MAX_FILE_SIZE.image;
        else if (fileType === 'video') maxSize = MAX_FILE_SIZE.video;
        else if (fileType === 'audio') maxSize = MAX_FILE_SIZE.audio;
        else return ACCEPTED_MEDIA_TYPES.includes(file.type); // Allow other accepted types without specific size check here

        return ACCEPTED_MEDIA_TYPES.includes(file.type) && file.size <= maxSize;
    },
    (file) => { // Custom error message function
        if (!isBrowser || !(file instanceof File)) return { message: 'Fichier invalide.' };
        const fileType = getFileType(file);
        let maxSizeMB = 0;
        if (fileType === 'image') maxSizeMB = MAX_FILE_SIZE.image / (1024*1024);
        else if (fileType === 'video') maxSizeMB = MAX_FILE_SIZE.video / (1024*1024);
        else if (fileType === 'audio') maxSizeMB = MAX_FILE_SIZE.audio / (1024*1024);

        if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
            return { message: `Type de fichier non supporté (${file.type}).` };
        }
        if (maxSizeMB > 0 && fileType in MAX_FILE_SIZE && file.size > MAX_FILE_SIZE[fileType as keyof typeof MAX_FILE_SIZE]) { // Added type assertion and check if fileType is a valid key
             return { message: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)}Mo). Max ${maxSizeMB.toFixed(1)}Mo.` };
        }
        return { message: 'Fichier invalide.' }; // Default fallback
    }
);


const formSchema = z.object({
  name: z.string().min(2, { message: 'Le nom de la soirée doit contenir au moins 2 caractères.' }).max(100),
  description: z.string().max(500).optional(),
  date: z.date({ required_error: 'Une date pour la soirée est requise.' }),
  location: z.string().max(150).optional(),
  participants: z.array(z.string().email()).optional(), // Feature in development
  media: z.array(mediaFileSchema).optional(), // Array of files for general media
  coverPhoto: coverPhotoSchema, // Use imported schema
  initialRating: z.number().min(0.5).max(5).step(0.5).optional(),
  initialComment: z.string().max(500).optional(),
});

type EventFormValues = z.infer<typeof formSchema>;

// Couleurs Tailwind pour les avatars des participants
const participantColors = [
  'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-600',
  'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
];

// --- Component ---
export default function CreateEventPage() {
  const { user } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({}); // { fileName: progress }
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number>(0);

  // --- Mock Participants Data --- (Keep for visual representation)
  const [mockParticipants] = useState([
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
    const watchedRating = form.watch('initialRating');

    useEffect(() => {
        setCurrentRating(watchedRating || 0);
    }, [watchedRating]);


   // Media File Handling
   const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const currentFiles = form.getValues('media') || [];
            const newFilesArray = Array.from(files);

            // Validate each new file individually
            const validNewFiles: File[] = [];
            const newPreviews: string[] = [];

            newFilesArray.forEach(file => {
                const validationResult = mediaFileSchema.safeParse(file);
                if (validationResult.success) {
                    validNewFiles.push(file);
                    newPreviews.push(URL.createObjectURL(file));
                } else {
                     // Show specific error from Zod refinement
                     const errorMessage = validationResult.error.errors[0]?.message || 'Fichier invalide.';
                    toast({
                        title: `Erreur Fichier Média: ${file.name}`,
                        description: errorMessage,
                        variant: 'destructive',
                    });
                     console.error(`Validation échouée pour ${file.name}: ${errorMessage}`);
                }
            });

            // Update form state and previews only with valid files
            if (validNewFiles.length > 0) {
                 const combinedFiles = [...currentFiles, ...validNewFiles];
                 form.setValue('media', combinedFiles, { shouldValidate: true });
                 setMediaPreviews(prev => [...prev, ...newPreviews]);
            }


            // Clear the file input value
            if (event.target) {
              (event.target as HTMLInputElement).value = '';
            }
        }
    };

    const removeMediaFile = (index: number) => {
        const currentFiles = form.getValues('media') || [];
        const fileToRemove = currentFiles[index];
        const updatedFiles = currentFiles.filter((_, i) => i !== index);
        form.setValue('media', updatedFiles, { shouldValidate: true });

        const previewUrlToRemove = mediaPreviews[index];
        if (previewUrlToRemove) {
          URL.revokeObjectURL(previewUrlToRemove);
        }
        setMediaPreviews(prev => prev.filter((_, i) => i !== index));

        // Remove progress entry if it exists
         if (fileToRemove?.name && uploadProgress[fileToRemove.name] !== undefined) {
             setUploadProgress(prev => {
                 const newProgress = { ...prev };
                 delete newProgress[fileToRemove.name];
                 return newProgress;
             });
         }
        console.log(`Média retiré : ${fileToRemove?.name}`);
    };

     // Cover Photo Handling
    const handleCoverPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
             // Validate the file against the schema before setting value and preview
             const validationResult = isBrowser && file instanceof File ? coverPhotoSchema.safeParse(file) : { success: true }; // Only validate on client
             if (validationResult.success) {
                 form.setValue('coverPhoto', file, { shouldValidate: true });
                 if (coverPhotoPreview) {
                     URL.revokeObjectURL(coverPhotoPreview);
                 }
                 const newPreviewUrl = URL.createObjectURL(file);
                 setCoverPhotoPreview(newPreviewUrl);
                 console.log("Photo de couverture valide ajoutée.");
             } else {
                 const errorMessage = validationResult.error?.errors[0]?.message || 'Validation a échoué.'; // Added optional chaining
                 console.error("Erreur photo de couverture:", errorMessage);
                 form.setError('coverPhoto', { type: 'manual', message: errorMessage });
                 toast({
                    title: "Erreur Photo de Couverture",
                    description: errorMessage,
                    variant: "destructive"
                 });
                 // Reset field and preview
                 form.setValue('coverPhoto', undefined, { shouldValidate: true });
                 if (coverPhotoPreview) { URL.revokeObjectURL(coverPhotoPreview); }
                 setCoverPhotoPreview(null);
             }
        } else {
            // Handle case where no file is selected (clearing the selection)
            form.setValue('coverPhoto', undefined, { shouldValidate: true });
            if (coverPhotoPreview) { URL.revokeObjectURL(coverPhotoPreview); }
            setCoverPhotoPreview(null);
            console.log("Sélection de photo de couverture annulée.");
        }
        // Clear file input value
         if (event.target) {
             (event.target as HTMLInputElement).value = '';
         }
    };


     const removeCoverPhoto = () => {
        form.setValue('coverPhoto', undefined, { shouldValidate: true });
        if (coverPhotoPreview) {
            URL.revokeObjectURL(coverPhotoPreview);
        }
        setCoverPhotoPreview(null);
        const input = document.getElementById('cover-photo-input') as HTMLInputElement;
        if (input) { input.value = ''; }
         console.log("Photo de couverture retirée.");
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


  async function onSubmit(values: EventFormValues) {
    if (!user) { toast({ title: 'Non authentifié', description: "Veuillez vous connecter d'abord.", variant: 'destructive' }); return; }
    if (!db || !storage) { toast({ title: 'Erreur de service', description: 'Firebase non disponible.', variant: 'destructive' }); return; }

    setIsLoading(true);
    setUploadProgress({});

    try {
        // 1. Create party document without media/cover URLs first
        const partyData: any = {
            name: values.name,
            description: values.description || '',
            date: values.date,
            location: values.location || '',
            createdBy: user.uid,
            creatorEmail: user.email,
            participants: [user.uid], // Creator is always a participant
            participantEmails: [user.email], // Store emails
            mediaUrls: [], // Initialize as empty
            coverPhotoUrl: '', // Initialize as empty
            ratings: {},
            comments: [],
            createdAt: serverTimestamp(),
         };

        if (values.initialRating !== undefined) { partyData.ratings[user.uid] = values.initialRating; }

        let initialCommentData: any = null;
        if (values.initialComment && values.initialComment.trim()) {
            initialCommentData = {
                userId: user.uid,
                email: user.email || 'Anonyme',
                avatar: user.photoURL || undefined,
                text: values.initialComment.trim(),
                timestamp: serverTimestamp() // Let Firestore handle the timestamp
            };
        }

        const partyDocRef = await addDoc(collection(db, 'parties'), partyData);
        const partyId = partyDocRef.id;

        if (initialCommentData) {
             try {
                 await updateDoc(partyDocRef, { comments: arrayUnion(initialCommentData) });
             } catch (commentError: any) {
                 // Log but don't block the event creation if comment fails
                 console.error("Erreur lors de l'ajout du commentaire initial :", commentError);
                 toast({ title: 'Avertissement', description: 'Le commentaire initial n\'a pas pu être sauvegardé.', variant: 'warning' });
             }
        }

        // 2. Upload Cover Photo (if provided) using centralized uploader
        let coverPhotoUrl = '';
        if (values.coverPhoto) {
            try {
                console.log("Téléversement de la photo de couverture...");
                coverPhotoUrl = await uploadFile(
                    values.coverPhoto,
                    partyId,
                    true, // isCover = true
                    (progress) => {
                         // Optionally update progress for cover photo specifically if needed
                         // setUploadProgress(prev => ({ ...prev, [`cover_${values.coverPhoto.name}`]: progress }));
                         console.log(`Progression couverture : ${progress}%`);
                    }
                 );
                 console.log("URL de la photo de couverture:", coverPhotoUrl);
            } catch (error: any) {
                 toast({
                    title: `Échec téléversement photo de couverture`,
                    description: error.message || 'Impossible de téléverser le fichier.',
                    variant: 'destructive',
                });
                 // Continue without cover photo
            }
        }

        // 3. Upload Media Files (if any) using centralized uploader
         const mediaUrls: string[] = [];
         if (values.media && values.media.length > 0) {
              console.log(`Téléversement de ${values.media.length} fichier(s) média...`);
              const uploadPromises = values.media.map(file =>
                  uploadFile(
                      file,
                      partyId,
                      false, // isCover = false
                      (progress) => setUploadProgress(prev => ({ ...prev, [file.name]: progress }))
                  ).catch(error => {
                     toast({
                         title: `Échec téléversement pour ${file.name}`,
                         description: error.message || 'Impossible de téléverser le fichier.',
                         variant: 'destructive',
                     });
                     setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // Mark as error
                     return null;
                 })
             );
             const results = await Promise.all(uploadPromises);
             results.forEach(url => { if (url) mediaUrls.push(url); });

             if (values.media.length > 0 && mediaUrls.length < values.media.length) {
                 toast({ title: "Certains téléversements ont échoué", description: "Vérifiez les fichiers marqués comme échoués.", variant: 'warning' });
             }
             if (values.media.length > 0 && mediaUrls.length === 0 && !coverPhotoUrl) {
                  // Decide if this is a critical failure - perhaps allow event creation anyway?
                  // throw new Error("Tous les téléversements de médias ont échoué. Création de l'événement annulée.");
                  toast({ title: 'Échec critique', description: "Tous les téléversements de médias ont échoué. L'événement a été créé sans média.", variant: 'destructive' });
             }
         }

        // 4. Update party document with URLs
         await updateDoc(partyDocRef, {
            mediaUrls: mediaUrls, // Use arrayUnion if adding to existing? For creation, set directly.
            coverPhotoUrl: coverPhotoUrl || ''
         });

      toast({ title: 'Événement créé !', description: `"${values.name}" est prêt.` });
      router.push(`/party/${partyId}`);

    } catch (error: any) {
      console.error('Erreur lors de la création de l\'événement :', error);
      let errorMessage = error.message || 'Erreur inattendue.';
       if (error.code === 'permission-denied') {
           errorMessage = 'Permission refusée. Vérifiez les règles Firestore pour créer des documents dans "parties".';
       }
      toast({ title: 'Échec de la création', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }

   if (!user && !isLoading) { return <div className="container mx-auto px-4 py-12 text-center">Redirection vers la connexion...</div>; }

  // --- JSX Structure (largely unchanged, but updates to media section for progress) ---
  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
        <h1 className="text-3xl font-bold mb-8 text-center text-primary">Créer un Nouvel Événement</h1>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                 {/* Column 1: Basic Info, Cover Photo, Participants */}
                 <div className="lg:col-span-2 space-y-8">
                      {/* --- Informations de base Card --- */}
                      <Card className="bg-card border border-border">
                          <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                               <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                               <CardTitle className="text-lg font-semibold">Informations de base</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6">
                                {/* FormField for name */}
                                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem> <FormLabel>Nom de la soirée *</FormLabel> <FormControl> <Input placeholder="Ex : Anniversaire de Léa" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/> </FormControl> <FormMessage /> </FormItem> )}/>
                                {/* FormField for description */}
                                <FormField control={form.control} name="description" render={({ field }) => ( <FormItem> <FormLabel>Description</FormLabel> <FormControl> <Textarea placeholder="Décrivez votre soirée..." className="resize-none bg-input border-border focus:bg-background focus:border-primary" {...field}/> </FormControl> <FormMessage /> </FormItem> )}/>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* FormField for date */}
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
                                                        {field.value ? format(field.value, 'PPP', { locale: fr }) : <span>jj/mm/aaaa</span>}
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
                                                        // No disabled prop, allow any date
                                                        initialFocus
                                                     />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                    {/* FormField for location */}
                                     <FormField control={form.control} name="location" render={({ field }) => ( <FormItem> <FormLabel>Lieu (Optionnel)</FormLabel> <FormControl> <Input placeholder="Ex : Sunset Beach Club" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/> </FormControl> <FormMessage /> </FormItem> )}/>
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
                                             <div
                                                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 text-center bg-secondary/50 h-48 md:h-64 relative cursor-pointer"
                                                onClick={() => document.getElementById('cover-photo-input')?.click()} // Trigger file input
                                            >
                                                 {/* Preview or Placeholder */}
                                                 {coverPhotoPreview ? (
                                                     <div className="relative w-full h-full">
                                                         <Image src={coverPhotoPreview} alt="Aperçu photo de couverture" layout="fill" objectFit="contain" className="rounded-md"/>
                                                         <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10" onClick={(e) => { e.stopPropagation(); removeCoverPhoto(); }}> <X className="h-4 w-4" /> <span className="sr-only">Retirer photo</span> </Button>
                                                     </div>
                                                 ) : (
                                                     <div className="flex flex-col items-center justify-center text-center h-full">
                                                         <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                                                         <p className="text-sm text-muted-foreground mb-2">Ajoutez une photo (max {MAX_FILE_SIZE.image / 1024 / 1024}Mo initial, compressée à {COMPRESSED_COVER_PHOTO_MAX_SIZE_MB}Mo).</p>
                                                         <Button type="button" variant="outline" size="sm" disabled={isLoading} className="pointer-events-none"> {/* Visually indicates clickable area, but click handled by div */}
                                                             <Upload className="mr-2 h-4 w-4" /> Ajouter une photo
                                                         </Button>
                                                     </div>
                                                 )}
                                                 {/* Hidden Input controlled by React Hook Form */}
                                                 <FormControl>
                                                    <Input
                                                        id="cover-photo-input"
                                                        type="file"
                                                        accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')}
                                                        onChange={handleCoverPhotoChange}
                                                        className="sr-only"
                                                        ref={field.ref} // Ensure RHF can track the input
                                                        onBlur={field.onBlur}
                                                        name={field.name}
                                                        disabled={field.disabled}
                                                    />
                                                </FormControl>
                                            </div>
                                            <FormMessage className="text-xs"/>
                                        </FormItem>
                                    )}
                                />


                               {/* Preview Card -- Moved Inside Column 1 */}
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
                                            <CardTitle className="text-sm font-semibold leading-tight mb-1 truncate"> {watchedName || "Nom de la soirée"} </CardTitle>
                                            <div className="flex items-center space-x-1 text-xs text-yellow-400 mb-1">
                                               {Array.from({ length: 5 }).map((_, i) => ( <Star key={i} className={`h-3 w-3 ${i < currentRating ? 'fill-current' : ''} ${ i + 0.5 === currentRating ? 'half-star' : '' }`} /> ))}
                                                <span className="text-muted-foreground ml-1">{currentRating > 0 ? `${currentRating.toFixed(1)}/5` : "Nouvelle"}</span>
                                            </div>
                                             <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1"> <CalendarIcon className="h-3 w-3" /> <span>{watchedDate ? format(watchedDate, 'P', {locale: fr}) : '--/--/----'}</span> </div>
                                             <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2"> <MapPin className="h-3 w-3"/> <span>{watchedLocation || "Lieu non spécifié"}</span> </div>
                                            <p className="text-xs text-muted-foreground truncate"> {watchedDescription || "Description non renseignée"} </p>
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
                                                <Avatar className="h-8 w-8"> <AvatarFallback className={`${participantColors[index % participantColors.length]} text-primary-foreground text-xs`}> {p.initials} </AvatarFallback> </Avatar>
                                                <span className="text-sm font-medium">{p.name}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{p.status}</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Updated Participants FormField */}
                                <FormField
                                  control={form.control}
                                  name="participants"
                                  render={({ field }) => (
                                      <FormItem>
                                      <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
                                          {/* Input for email */}
                                           <FormControl>
                                              <Input
                                                placeholder="Entrer l'email des participants... (bientôt disponible)"
                                                disabled // Disabled until UI/backend is ready
                                                className="bg-input border-border flex-grow"
                                                // In a real implementation, this would likely be a more complex component
                                                // for searching and adding users, updating field.value accordingly.
                                              />
                                           </FormControl>
                                           <Button type="button" variant="outline" className="bg-secondary hover:bg-accent border-border" disabled>
                                              <UserPlus className="mr-2 h-4 w-4"/> Ajouter
                                           </Button>
                                      </div>
                                      <FormDescription>Fonctionnalité en développement.</FormDescription>
                                      <FormMessage />
                                      </FormItem>
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
                                 {/* Media Upload Button */}
                                 <FormField
                                    control={form.control}
                                    name="media"
                                    render={({ field }) => (
                                        <FormItem>
                                            {/* Button triggers the hidden input */}
                                            <Button type="button" variant="outline" className="w-full sm:w-auto bg-secondary hover:bg-accent border-border" onClick={() => document.getElementById('media-upload-input')?.click()}>
                                                <Upload className="mr-2 h-4 w-4" />
                                                Importer Souvenirs
                                            </Button>
                                            {/* Hidden input - wrapped by FormControl */}
                                            <FormControl>
                                                <Input
                                                    id="media-upload-input"
                                                    type="file"
                                                    multiple
                                                    accept={ACCEPTED_MEDIA_TYPES.join(',')}
                                                    onChange={handleMediaFileChange}
                                                    className="sr-only" // Keep it hidden
                                                    disabled={field.disabled}
                                                />
                                            </FormControl>
                                            <FormDescription> Max {MAX_FILE_SIZE.image/1024/1024}Mo/Image, {MAX_FILE_SIZE.video/1024/1024}Mo/Vidéo, {MAX_FILE_SIZE.audio/1024/1024}Mo/Son. </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                {/* Media Previews & Progress */}
                                {(form.getValues('media') || []).length > 0 && ( // Use getValues for reliability inside map
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-foreground">Souvenirs ajoutés :</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-3 gap-4">
                                            {(form.getValues('media') || []).map((file, index) => {
                                                const previewUrl = mediaPreviews[index];
                                                const progress = uploadProgress[file.name]; // Get progress by name
                                                const fileTypeIcon = getFileType(file);

                                                return (
                                                    <div key={index} className="relative group border rounded-md p-2 bg-secondary space-y-1">
                                                        {previewUrl && file.type.startsWith('image/') ? (
                                                            <Image src={previewUrl} alt={`Aperçu ${file.name}`} width={80} height={80} className="rounded-md object-cover mx-auto h-16 w-16" />
                                                        ) : (
                                                            <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-md mx-auto text-muted-foreground text-2xl">
                                                                {fileTypeIcon === 'video' && <Video className="h-8 w-8" />}
                                                                {fileTypeIcon === 'audio' && <Music className="h-8 w-8" />}
                                                                {fileTypeIcon === 'autre' && <FileIcon className="h-8 w-8" />}
                                                            </div>
                                                        )}
                                                        <p className="text-xs text-muted-foreground truncate text-center">{file.name}</p>
                                                        {progress !== undefined && progress >= 0 && progress < 100 && (
                                                            <Progress value={progress} className="h-1 w-full" />
                                                        )}
                                                        {progress === 100 && ( <p className="text-xs text-green-500 text-center">Téléversé</p> )}
                                                        {progress === -1 && ( <p className="text-xs text-destructive text-center">Échec</p> )}
                                                        <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full z-10" onClick={() => removeMediaFile(index)} > <X className="h-3 w-3" /> <span className="sr-only">Retirer {file.name}</span> </Button>
                                                    </div>
                                                );
                                            })}
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
                                <FormField control={form.control} name="initialRating" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center justify-between">
                                            <span>Note (Optionnel)</span> <span className="text-sm font-bold text-primary">{field.value?.toFixed(1) || '0.0'}/5</span>
                                        </FormLabel>
                                        <FormControl>
                                             <div className="flex items-center space-x-3">
                                                  <Star className="h-5 w-5 text-muted-foreground"/>
                                                   <Slider value={field.value !== undefined ? [field.value] : [0]} onValueChange={(value) => field.onChange(value[0] === 0 ? undefined : value[0])} max={5} step={0.5} className="flex-1" ref={field.ref} />
                                                   <Star className="h-5 w-5 text-yellow-400 fill-current"/>
                                             </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                {/* Comment Textarea */}
                                <FormField control={form.control} name="initialComment" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Commentaire (Optionnel)</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Ajoutez un premier commentaire..." className="resize-none bg-input border-border focus:bg-background focus:border-primary" rows={4} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </CardContent>
                        </Card>

                       {/* Submit Button */}
                       <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-8" disabled={isLoading}>
                            {isLoading ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création...</> ) : ( "Créer l'Événement" )}
                        </Button>
                  </div>
            </form>
        </Form>
    </div>
  );
}
