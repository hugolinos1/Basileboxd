// src/app/events/create/page.tsx
'use client';

import * as React from 'react';
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
import { CalendarIcon, Loader2, UserPlus, X, Image as ImageIcon, Upload, StarIcon, Edit, Trash2, MapPin, CalendarDays, ChevronDown, Video, Music as MusicIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs, query, where, FieldValue, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';


import {
  uploadFile,
  getFileType as getMediaFileType, 
  ACCEPTED_MEDIA_TYPES,
  MAX_FILE_SIZE as MEDIA_MAX_FILE_SIZE_CONFIG,
  COMPRESSED_COVER_PHOTO_MAX_SIZE_MB,
  ACCEPTED_COVER_PHOTO_TYPES, 
} from '@/services/media-uploader';
import { coverPhotoSchema } from '@/services/validation-schemas'; 


import { Progress } from '@/components/ui/progress';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';


import { Combobox } from '@/components/ui/combobox';
import type { MediaItem } from '@/lib/party-utils';
import { normalizeCityName, geocodeCity, PartyData } from '@/lib/party-utils'; 
import { Badge } from '@/components/ui/badge';

interface UserData { 
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  pseudo?: string;
  avatarUrl?: string;
}

const fileSchema = z.custom<File>((val) => {
  if (typeof window === 'undefined') return true; 
  return val instanceof File;
}, 'Veuillez télécharger un fichier');

const MAX_FILE_SIZE_COVER = 10 * 1024 * 1024; 


const formSchema = z.object({
  name: z.string().min(2, { message: "Le nom de l'Event doit contenir au moins 2 caractères." }).max(100),
  description: z.string().max(500).optional(),
  date: z.date({ required_error: "Une date pour l'Event est requise." }),
  location: z.string().min(2, {message: "La ville est requise."}).max(100),
  coverPhoto: fileSchema.refine(file => {
    if (typeof window === 'undefined' || !(file instanceof File)) return true; 
    return file.size <= MAX_FILE_SIZE_COVER;
  }, `La photo de couverture ne doit pas dépasser ${MAX_FILE_SIZE_COVER / 1024 / 1024}Mo.`).optional(),
  participants: z.array(z.string()).optional(), 
  media: z.array(fileSchema).optional(),
  initialRating: z.number().min(0).max(5).step(0.5).optional(), 
  initialComment: z.string().max(1000).optional(),
});

type PartyFormValues = z.infer<typeof formSchema>;

// --- Helper Functions ---
const getLocalFileType = (file: File): 'image' | 'video' | 'audio' | 'autre' => {
    if (!file || !file.type) return 'autre';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'autre';
};


export default function CreateEventPage() {
  const { user, firebaseInitialized } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<UserData[]>([]); 

  const coverPhotoInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user && !isLoading && firebaseInitialized) {
      router.push('/auth');
      toast({ title: 'Authentification requise', description: 'Veuillez vous connecter pour créer un événement.', variant: 'destructive' });
    }
  }, [user, isLoading, router, toast, firebaseInitialized]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!db) return;
      try {
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        const fetchedUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
        setAllUsers(fetchedUsers);
        console.log("Fetched all users for Combobox:", fetchedUsers.map(u => ({uid: u.uid, email: u.email, pseudo: u.pseudo})));
      } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs:", error);
        toast({ title: "Erreur utilisateurs", description: "Impossible de charger la liste des utilisateurs.", variant: "destructive" });
      }
    };
    if (firebaseInitialized) {
        fetchUsers();
    }
  }, [firebaseInitialized, toast]);


  const form = useForm<PartyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      coverPhoto: undefined,
      participants: [],
      media: [],
      initialRating: 0,
      initialComment: '',
    },
  });

  useEffect(() => {
    if (user && allUsers.length > 0) {
      const creatorDataInAllUsers = allUsers.find(u => u.uid === user.uid);
      if (creatorDataInAllUsers) {
        const isCreatorInSelectedParticipants = selectedParticipants.some(p => p.uid === user.uid);
        if (!isCreatorInSelectedParticipants) {
          setSelectedParticipants(prevSelected => [...prevSelected, creatorDataInAllUsers]);
        }
        
        const formParticipantUIDs = form.getValues('participants') || [];
        if (!formParticipantUIDs.includes(user.uid)) {
          form.setValue('participants', [...formParticipantUIDs, user.uid]);
        }
      }
    }
  }, [user, allUsers, form, selectedParticipants]);


  const handleCoverPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validationResult = typeof window !== 'undefined' && file instanceof File ? coverPhotoSchema.safeParse(file) : { success: true };
      if (validationResult.success) {
        form.setValue('coverPhoto', file, { shouldValidate: true });
        if (coverPhotoPreview) {
          URL.revokeObjectURL(coverPhotoPreview);
        }
        setCoverPhotoPreview(URL.createObjectURL(file));
      } else {
        const errorMessage = (validationResult as any).error?.errors[0]?.message || 'Fichier invalide.';
        toast({ title: "Erreur Photo de Couverture", description: errorMessage, variant: "destructive" });
        form.setValue('coverPhoto', undefined);
        if (coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
        setCoverPhotoPreview(null);
      }
    }
     if (coverPhotoInputRef.current) {
        coverPhotoInputRef.current.value = '';
    }
  };

  const removeCoverPhoto = () => {
    form.setValue('coverPhoto', undefined);
    if (coverPhotoPreview) {
      URL.revokeObjectURL(coverPhotoPreview);
    }
    setCoverPhotoPreview(null);
  };

  const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const currentFiles = form.getValues('media') || [];
      const newFilesArray = Array.from(files);
      const validNewFiles: File[] = [];
      const newPreviews: string[] = [];

      newFilesArray.forEach(file => {
        const fileType = getMediaFileType(file);
        let maxSize = 0;
        if (fileType === 'image') maxSize = MEDIA_MAX_FILE_SIZE_CONFIG.image;
        else if (fileType === 'video') maxSize = MEDIA_MAX_FILE_SIZE_CONFIG.video;
        else if (fileType === 'audio') maxSize = MEDIA_MAX_FILE_SIZE_CONFIG.audio;

        if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
          toast({ title: `Type non supporté : ${file.name}`, description: `Type ${file.type} non accepté.`, variant: 'destructive' });
          return;
        }
        if (maxSize > 0 && file.size > maxSize) {
          toast({ title: `Fichier trop volumineux : ${file.name}`, description: `La taille dépasse la limite de ${(maxSize / 1024 / 1024).toFixed(1)}Mo.`, variant: 'destructive' });
          return;
        }
        validNewFiles.push(file);
        newPreviews.push(URL.createObjectURL(file));
      });

      form.setValue('media', [...currentFiles, ...validNewFiles], { shouldValidate: true });
      setMediaPreviews(prev => [...prev, ...newPreviews]);
    }
     if (mediaInputRef.current) {
        mediaInputRef.current.value = '';
    }
  };

  const removeMediaFile = (index: number) => {
    const currentFiles = form.getValues('media') || [];
    const updatedFiles = currentFiles.filter((_, i) => i !== index);
    form.setValue('media', updatedFiles, { shouldValidate: true });

    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddParticipant = (userId: string) => {
    const currentFormParticipantUIDs = form.getValues('participants') || [];
    if (!currentFormParticipantUIDs.includes(userId)) {
      console.log("[handleAddParticipant] Trying to add UID:", userId);
      console.log("[handleAddParticipant] Current allUsers UIDs for lookup:", allUsers.map(u => u.uid));

      const participantData = allUsers.find(u => u.uid.toLowerCase() === userId.toLowerCase()); 
      if (participantData) {
        form.setValue('participants', [...currentFormParticipantUIDs, participantData.uid]); 
        setSelectedParticipants(prev => {
          if (!prev.find(p => p.uid.toLowerCase() === participantData.uid.toLowerCase())) { 
            console.log("Adding to selectedParticipants state:", participantData);
            return [...prev, participantData];
          }
          return prev;
        });
      } else {
        console.warn(`Participant data not found in allUsers for UID: ${userId} when trying to update selectedParticipants state.`);
        toast({
          title: "Utilisateur introuvable",
          description: `L'utilisateur avec l'ID "${userId}" n'a pas été trouvé. Assurez-vous que cet utilisateur existe et a un profil complet dans la base de données.`,
          variant: "warning",
          duration: 7000,
        });
      }
    }
  };

  const handleRemoveParticipant = (userId: string) => {
    if (user && userId === user.uid) {
      toast({ title: "Impossible de retirer", description: "Le créateur ne peut pas être retiré de l'événement.", variant: 'warning' });
      return;
    }
    form.setValue('participants', (form.getValues('participants') || []).filter(uid => uid.toLowerCase() !== userId.toLowerCase())); 
    setSelectedParticipants(prev => prev.filter(p => p.uid.toLowerCase() !== userId.toLowerCase())); 
    console.log("Removed participant:", userId, "New selectedParticipants:", selectedParticipants.filter(p => p.uid.toLowerCase() !== userId.toLowerCase()));
  };


  useEffect(() => {
    return () => {
      mediaPreviews.forEach(URL.revokeObjectURL);
      if (coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
    };
  }, [mediaPreviews, coverPhotoPreview]);


  async function onSubmit(values: PartyFormValues) {
    if (!user) {
      toast({ title: 'Non authentifié', description: 'Veuillez vous connecter d\'abord.', variant: 'destructive' });
      return;
    }
    if (!db || !storage) {
      toast({ title: 'Erreur de service', description: 'Les services Firebase ne sont pas disponibles.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    setUploadProgress({});
    setIsUploadingCover(false);
    setIsUploadingMedia(false);

    let latitude: number | null = null;
    let longitude: number | null = null;
    const normalizedLocation = normalizeCityName(values.location);

    if (normalizedLocation) {
      toast({ title: "Géocodage en cours...", description: `Recherche des coordonnées pour ${values.location}.` });
      const coords = await geocodeCity(normalizedLocation); 
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
        toast({ title: "Géocodage réussi", description: `Coordonnées trouvées pour ${values.location}.` });
      } else {
        toast({ title: "Échec du géocodage", description: `Impossible de trouver les coordonnées pour ${values.location}. L'événement sera créé sans localisation précise.`, variant: "warning" });
      }
    }
    
    const currentParticipantUIDs = selectedParticipants.map(p => p.uid);
    let finalParticipantUIDs = [...currentParticipantUIDs];

    if (user && !finalParticipantUIDs.includes(user.uid)) {
        finalParticipantUIDs.push(user.uid);
    }
    
    const finalParticipantEmails = finalParticipantUIDs.map(uid => {
        const participant = selectedParticipants.find(p => p.uid === uid);
        if (participant) return participant.email;
        if (user && user.uid === uid) return user.email || ''; 
        return ''; 
    }).filter(email => typeof email === 'string');


    try {
      const partyDocData: Omit<PartyData, 'id' | 'createdAt' | 'averageRating' | 'mediaItems' | 'coverPhotoUrl' | 'ratings' > & { createdAt: FieldValue, ratings: { [key: string]: number }, mediaItems: MediaItem[], coverPhotoUrl: string } = {
        name: values.name,
        description: values.description || '',
        date: Timestamp.fromDate(values.date), 
        location: normalizedLocation,
        latitude: latitude,
        longitude: longitude,
        createdBy: user.uid,
        creatorEmail: user.email || null,
        participants: finalParticipantUIDs,
        participantEmails: finalParticipantEmails,
        ratings: values.initialRating && user ? { [user.uid]: values.initialRating * 2 } : {}, 
        createdAt: serverTimestamp(),
        mediaItems: [], 
        coverPhotoUrl: '', 
      };
      
      const partyDocRef = await addDoc(collection(db, 'parties'), partyDocData);
      const partyId = partyDocRef.id;

      if (values.initialComment && user) {
        const commentsCollectionRef = collection(db, 'parties', partyId, 'comments');
        await addDoc(commentsCollectionRef, {
          userId: user.uid,
          email: user.email || 'Inconnu',
          avatar: user.photoURL || null,
          text: values.initialComment,
          timestamp: serverTimestamp(),
          partyId: partyId, 
        });
      }

      let coverPhotoUrl = '';
      if (values.coverPhoto) {
        setIsUploadingCover(true);
        coverPhotoUrl = await uploadFile(values.coverPhoto, partyId, true, (progress) => {
          setUploadProgress(prev => ({ ...prev, coverPhoto: progress }));
        }, 'coverPhoto').catch(error => {
          toast({ title: `Échec téléversement photo de couverture`, description: error.message, variant: 'destructive' });
          return '';
        });
        setIsUploadingCover(false);
        if (coverPhotoUrl) {
            await updateDoc(partyDocRef, { coverPhotoUrl });
        }
      }

      const uploadedMediaItems: MediaItem[] = [];
      if (values.media && values.media.length > 0) {
        setIsUploadingMedia(true);
        const uploadPromises = values.media.map(file =>
          uploadFile(file, partyId, false, (progress) => {
            setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
          }, 'souvenir').then(url => {
            if (url && user) {
              return {
                id: `${partyId}-${file.name}-${Date.now()}`,
                url,
                type: getLocalFileType(file),
                uploaderId: user.uid,
                uploaderEmail: user.email || undefined,
                uploadedAt: Timestamp.now(), 
                fileName: file.name,
              } as MediaItem;
            }
            return null;
          }).catch(error => {
            toast({ title: `Échec téléversement pour ${file.name}`, description: error.message, variant: 'destructive' });
            return null;
          })
        );
        const results = await Promise.all(uploadPromises);
        results.forEach(item => { if (item) uploadedMediaItems.push(item); });
        setIsUploadingMedia(false);
        if (uploadedMediaItems.length > 0) {
          await updateDoc(partyDocRef, { mediaItems: uploadedMediaItems });
        }
      }

      toast({ title: "Événement créé !", description: `"${values.name}" est prêt à être partagé.` });
      router.push(`/party/${partyId}`);

    } catch (error: any) {
      console.error('Erreur lors de la création de l\'événement :', error);
      toast({ title: 'Échec de la création', description: error.message || 'Une erreur inattendue est survenue.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsUploadingCover(false);
      setIsUploadingMedia(false);
    }
  }

  if (!firebaseInitialized) {
    return <div className="container mx-auto px-4 py-12 text-center">Chargement de Firebase...</div>;
  }
  if (!user && !isLoading) {
    return <div className="container mx-auto px-4 py-12 text-center">Redirection vers la connexion...</div>;
  }

  const comboboxOptions = allUsers
    .filter(u => !(form.getValues('participants') || []).map(uid => uid.toLowerCase()).includes(u.uid.toLowerCase()))
    .map(u => ({ value: u.uid, label: u.pseudo || u.displayName || u.email || u.uid }));


  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center text-primary">Créer un Nouvel Event</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
          <Accordion type="multiple" defaultValue={['item-1', 'item-2', 'item-3', 'item-4', 'item-5']} className="w-full">

            {/* Section 1: Informations de base */}
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center space-x-2">
                  <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs">1</span>
                  <span>Informations de base</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="bg-card border-none shadow-none p-0">
                  <CardContent className="space-y-6 pt-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom de l&apos;Event *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex : Soirée plage d'été" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
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
                            <Textarea placeholder="Décrivez votre Event..." className="resize-none bg-input border-border focus:bg-background focus:border-primary" {...field} />
                          </FormControl>
                          <FormDescription>Restez bref et concis !</FormDescription>
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
                                  className={cn('w-full pl-3 text-left font-normal bg-input border-border hover:bg-accent', !field.value && 'text-muted-foreground')}
                                >
                                  {field.value ? format(field.value, 'PPP', { locale: fr }) : <span>Choisir une date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
                              <Calendar locale={fr} mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
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
                          <FormLabel>Ville *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex : Paris" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Photo de l'Événement */}
            <AccordionItem value="item-2">
               <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center space-x-2">
                  <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs">2</span>
                  <span>Photo de l&apos;Event</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="bg-card border-none shadow-none p-0">
                  <CardHeader className="flex flex-row items-center space-x-2 pb-4">
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                        control={form.control}
                        name="coverPhoto"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 text-center bg-secondary/50 h-48 md:h-64 relative">
                                  <FormControl>
                                  <React.Fragment> {/* Ensure a single child for FormControl */}
                                      {coverPhotoPreview ? (
                                          <>
                                              <div className="relative w-full h-full">
                                                  <Image src={coverPhotoPreview} alt="Aperçu photo de couverture" fill style={{ objectFit: 'contain' }} className="rounded-md" sizes="(max-width: 768px) 100vw, 50vw"/>
                                              </div>
                                              <Button
                                                  type="button"
                                                  variant="destructive"
                                                  size="icon"
                                                  className="absolute top-2 right-2 h-6 w-6 rounded-full z-10"
                                                  onClick={removeCoverPhoto}
                                              >
                                                  <X className="h-3 w-3" />
                                              </Button>
                                          </>
                                      ) : (
                                        <>
                                          <ImageIcon className="h-12 w-12 text-muted-foreground mb-2" />
                                          <p className="text-sm text-muted-foreground mb-2">Glissez-déposez ou cliquez pour ajouter</p>
                                           <Button type="button" variant="outline" size="sm" onClick={() => coverPhotoInputRef.current?.click()}>
                                              Ajouter une photo
                                          </Button>
                                        </>
                                      )}
                                       <Input
                                          ref={coverPhotoInputRef}
                                          type="file"
                                          accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')}
                                          className="hidden"
                                          onChange={handleCoverPhotoChange}
                                      />
                                    </React.Fragment>
                                  </FormControl>
                                </div>
                                 {uploadProgress.coverPhoto !== undefined && uploadProgress.coverPhoto >= 0 && (
                                    <Progress value={uploadProgress.coverPhoto} className="h-1 w-full mt-2" />
                                )}
                                {uploadProgress.coverPhoto === -1 && (
                                    <p className="text-xs text-destructive text-center mt-1">Échec du téléversement de la couverture</p>
                                )}
                                <FormDescription className="text-center mt-2">
                                    Max {MAX_FILE_SIZE_COVER / 1024 / 1024}Mo initial, compressée à {COMPRESSED_COVER_PHOTO_MAX_SIZE_MB}Mo.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Participants */}
            <AccordionItem value="item-3">
               <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center space-x-2">
                  <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs">3</span>
                  <span>Participants</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="bg-card border-none shadow-none p-0">
                  <CardContent className="space-y-4 pt-6">
                     <FormField
                        control={form.control}
                        name="participants"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Ajouter des participants</FormLabel>
                            <FormControl>
                                <Combobox
                                    options={comboboxOptions}
                                    onSelect={(userId) => {
                                        if (userId) handleAddParticipant(userId);
                                    }}
                                    placeholder="Rechercher un utilisateur..."
                                    searchPlaceholder="Tapez un nom ou email..."
                                    emptyPlaceholder="Aucun utilisateur trouvé."
                                    triggerIcon={<UserPlus className="mr-2 h-4 w-4" />}
                                />
                            </FormControl>
                            <FormDescription>Les participants doivent avoir un compte.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    {selectedParticipants.length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-sm font-medium text-foreground">Participants sélectionnés :</h4>
                            <div className="flex flex-wrap gap-2 p-3 bg-secondary/30 border border-border/50 rounded-md">
                            {selectedParticipants.map((participant) => (
                                <Badge key={participant.uid} variant="secondary" className="py-1.5 px-2.5 text-xs shadow-sm">
                                    <div className="flex items-center gap-1.5">
                                    {participant.avatarUrl ? (
                                        <Image src={participant.avatarUrl} alt={participant.pseudo || participant.displayName || participant.email || 'avatar'} width={16} height={16} className="rounded-full" data-ai-hint="utilisateur avatar" />
                                    ) : (
                                        <UserPlus className="h-3 w-3" /> 
                                    )}
                                    <span>{participant.pseudo || participant.displayName || participant.email}</span>
                                    {user && participant.uid === user.uid ? 
                                        <span className="text-xs text-muted-foreground/80">(Créateur)</span> 
                                        : (
                                        <button type="button" onClick={() => handleRemoveParticipant(participant.uid)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors" title="Retirer ce participant">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                    </div>
                                </Badge>
                            ))}
                            </div>
                        </div>
                    )}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Importer des Souvenirs */}
            <AccordionItem value="item-4">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center space-x-2">
                  <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs">4</span>
                  <span>Importer des Souvenirs</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="bg-card border-none shadow-none p-0">
                  <CardContent className="space-y-4 pt-6">
                    <FormField
                      control={form.control}
                      name="media"
                      render={({ field }) => (
                        <FormItem>
                           <FormControl>
                             <div className="w-full"> {/* Wrapper div */}
                              <Button type="button" variant="outline" onClick={() => mediaInputRef.current?.click()} className="w-full">
                                <Upload className="mr-2 h-4 w-4" /> Importer Souvenirs (Photos, Vidéos, Sons)
                              </Button>
                               <Input
                                 ref={mediaInputRef}
                                 type="file"
                                 multiple
                                 accept={ACCEPTED_MEDIA_TYPES.join(',')}
                                 onChange={handleMediaFileChange}
                                 className="hidden"
                               />
                             </div>
                           </FormControl>
                          <FormDescription className="text-center">
                            Max {MEDIA_MAX_FILE_SIZE_CONFIG.image / 1024 / 1024}Mo/Image, {MEDIA_MAX_FILE_SIZE_CONFIG.video / 1024 / 1024}Mo/Vidéo, {MEDIA_MAX_FILE_SIZE_CONFIG.audio / 1024 / 1024}Mo/Son.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {(form.watch('media') || []).length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Souvenirs sélectionnés :</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {(form.watch('media') || []).map((file, index) => {
                             const previewUrl = mediaPreviews[index];
                             const progress = uploadProgress[file.name];
                             const fileTypeDisplay = getLocalFileType(file);
                            return (
                              <div key={index} className="relative group border rounded-md p-2 bg-secondary space-y-1.5">
                                {previewUrl && file.type.startsWith('image/') ? (
                                  <Image src={previewUrl} alt={`Aperçu ${file.name}`} width={80} height={80} className="rounded-md object-cover mx-auto h-16 w-16" data-ai-hint="fête souvenir"/>
                                ) : (
                                  <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-md mx-auto text-muted-foreground">
                                    {fileTypeDisplay === 'video' && <Video className="h-8 w-8" />}
                                    {fileTypeDisplay === 'audio' && <MusicIcon className="h-8 w-8" />}
                                    {fileTypeDisplay === 'autre' && <ImageIcon className="h-8 w-8" />}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground truncate text-center px-1">{file.name}</p>
                                {progress !== undefined && progress >= 0 && progress < 100 && (
                                  <Progress value={progress} className="h-1 w-full" />
                                )}
                                {progress === 100 && <p className="text-xs text-green-500 text-center">Téléversé</p>}
                                {progress === -1 && <p className="text-xs text-destructive text-center">Échec</p>}
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="absolute -top-1.5 -right-1.5 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                                  onClick={() => removeMediaFile(index)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Évaluation Initiale */}
            <AccordionItem value="item-5">
               <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center space-x-2">
                  <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs">5</span>
                  <span>Évaluation Initiale</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="bg-card border-none shadow-none p-0">
                  <CardContent className="space-y-6 pt-6">
                     <FormField
                        control={form.control}
                        name="initialRating"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Note (Optionnel)</FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-3">
                                    <Slider
                                        defaultValue={[0]}
                                        value={[field.value || 0]}
                                        max={5} 
                                        step={0.5}
                                        onValueChange={(value) => field.onChange(value[0])}
                                        className="w-[calc(100%-5rem)]"
                                    />
                                    <span className="text-sm font-medium w-16 text-right">{(field.value || 0).toFixed(1)}/5 ★</span>
                                </div>
                              </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                     <FormField
                        control={form.control}
                        name="initialComment"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Commentaire (Optionnel)</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Un premier avis sur l'événement..." {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-lg py-6" disabled={isLoading || isUploadingCover || isUploadingMedia}>
            {isLoading ? (
              <React.Fragment>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {(isUploadingCover || isUploadingMedia) ? "Téléversement des fichiers..." : "Création de l'Event..."}
              </React.Fragment>
            ) : (
              "Créer l'Event"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}

