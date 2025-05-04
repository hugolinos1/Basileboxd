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
import { CalendarIcon, Loader2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth, storage } from '@/config/firebase';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { compressMedia } from '@/services/media-compressor';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Progress } from '@/components/ui/progress';
import Image from 'next/image';

// Schema Definition
const MAX_FILE_SIZE = {
  image: 1 * 1024 * 1024, // 1MB
  video: 10 * 1024 * 1024, // 10MB
  audio: 5 * 1024 * 1024, // 5MB
};
const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];

const fileSchema = z.custom<File>((val) => val instanceof File, 'Please upload a file');
// Add more specific checks if needed, e.g., using file.type

const formSchema = z.object({
  name: z.string().min(2, { message: 'Party name must be at least 2 characters.' }).max(100),
  description: z.string().max(500).optional(),
  date: z.date({ required_error: 'A date for the party is required.' }),
  location: z.string().max(150).optional(),
  participants: z.array(z.string().email()).optional(), // Array of emails for participants
  media: z.array(fileSchema).optional(), // Array of files for media
});

type PartyFormValues = z.infer<typeof formSchema>;

// Helper to get file type category
const getFileType = (file: File): 'image' | 'video' | 'audio' | 'other' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'other';
};

export default function CreatePartyPage() {
  const { user } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
   const [previews, setPreviews] = useState<string[]>([]);

   useEffect(() => {
    if (!user && !isLoading) {
      // Redirect to login if not authenticated and not already processing login state
      router.push('/auth');
      toast({ title: 'Authentication Required', description: 'Please log in to create a party.', variant: 'destructive' });
    }
   }, [user, isLoading, router, toast]);


  const form = useForm<PartyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      date: undefined,
      location: '',
      participants: [],
      media: [],
    },
  });

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const currentFiles = form.getValues('media') || [];
            const newFiles = Array.from(files);
            const combinedFiles = [...currentFiles, ...newFiles];
            form.setValue('media', combinedFiles, { shouldValidate: true });

            // Generate previews
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeFile = (index: number) => {
        const currentFiles = form.getValues('media') || [];
        const updatedFiles = currentFiles.filter((_, i) => i !== index);
        form.setValue('media', updatedFiles, { shouldValidate: true });

        // Clean up preview URL
        URL.revokeObjectURL(previews[index]);
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    // Cleanup previews on unmount
    useEffect(() => {
        return () => previews.forEach(url => URL.revokeObjectURL(url));
    }, [previews]);


  const uploadFile = async (file: File, partyId: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      const fileType = getFileType(file);
      let fileToUpload = file;
      let targetSizeMB = 0;

      if (fileType === 'image') targetSizeMB = MAX_FILE_SIZE.image / (1024 * 1024);
      else if (fileType === 'video') targetSizeMB = MAX_FILE_SIZE.video / (1024 * 1024);
      else if (fileType === 'audio') targetSizeMB = MAX_FILE_SIZE.audio / (1024 * 1024);
      else {
          reject(new Error('Unsupported file type'));
          return;
      }

        let compressedBlob: Blob | File = file; // Initialize with original file
        try {
             if (fileType === 'image') {
                compressedBlob = await compressMedia(file, { maxSizeMB: targetSizeMB });
             }
             // Add similar conditions for video/audio if compressor.js or another library supports them
             // else if (fileType === 'video') { ... }
             // else if (fileType === 'audio') { ... }

             // If no compression was applied or needed, compressedBlob remains the original file
             fileToUpload = compressedBlob instanceof File ? compressedBlob : new File([compressedBlob], file.name, { type: compressedBlob.type });

        } catch (compressionError) {
            console.warn(`Could not compress ${fileType} ${file.name}:`, compressionError);
            // Proceed with original file if compression fails
             fileToUpload = file;
        }

       // Check size after potential compression
       const maxSize = MAX_FILE_SIZE[fileType];
       if (fileToUpload.size > maxSize) {
            reject(new Error(`${fileType} exceeds the size limit of ${targetSizeMB}MB.`));
            return;
       }


      const storageRef = ref(storage, `parties/${partyId}/${fileType}s/${Date.now()}_${fileToUpload.name}`);
      const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: progress }));
        },
        (error) => {
          console.error("Upload failed:", error);
          setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: -1 })); // Indicate error
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
             setUploadProgress(prev => ({ ...prev, [fileToUpload.name]: 100 })); // Mark as complete
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  async function onSubmit(values: PartyFormValues) {
    if (!user) {
       toast({ title: 'Not Authenticated', description: 'Please log in first.', variant: 'destructive' });
       return;
     }
    setIsLoading(true);
    setUploadProgress({}); // Reset progress

    try {
      // 1. Create party document in Firestore
      const partyData = {
        name: values.name,
        description: values.description || '',
        date: values.date,
        location: values.location || '',
        createdBy: user.uid,
        creatorEmail: user.email, // Store email for easy display
        participants: [user.uid], // Initially only the creator
        participantEmails: [user.email], // Store emails for easier lookup/display initially
        mediaUrls: [], // Will be populated after uploads
        ratings: {}, // Structure for user ratings { userId: rating }
        comments: [], // Structure for comments { userId: string, text: string, timestamp: Date }
        createdAt: serverTimestamp(),
        // Add participant emails if collected from the form
      };

      const partyDocRef = await addDoc(collection(db, 'parties'), partyData);
      const partyId = partyDocRef.id;

       // 2. Handle participant invitations (Placeholder - requires user search/selection UI)
       // For now, we'll just log the emails. A real implementation needs user lookup.
       if (values.participants && values.participants.length > 0) {
         console.log("Invited participant emails:", values.participants);
         // TODO: Implement logic to find user UIDs based on emails and add them to the party's participants array.
         // This might involve a separate cloud function or careful querying if user emails are indexed.
       }

      // 3. Upload media files (if any)
      const mediaUrls: string[] = [];
      if (values.media && values.media.length > 0) {
          const uploadPromises = values.media.map(file =>
             uploadFile(file, partyId).catch(error => {
                 toast({
                     title: `Upload Failed for ${file.name}`,
                     description: error.message || 'Could not upload file.',
                     variant: 'destructive',
                 });
                 return null; // Return null for failed uploads
             })
          );
          const results = await Promise.all(uploadPromises);
          results.forEach(url => {
             if (url) mediaUrls.push(url); // Only add successful URLs
          });

          // 4. Update party document with media URLs
          if (mediaUrls.length > 0) {
              await updateDoc(partyDocRef, { mediaUrls });
          } else if (values.media.length > 0 && mediaUrls.length === 0) {
              // All uploads failed
              throw new Error("All media uploads failed. Party created without media.");
          }
      }


      toast({
        title: 'Party Created!',
        description: `"${values.name}" is ready to be shared.`,
      });
      router.push(`/party/${partyId}`); // Navigate to the new party page

    } catch (error: any) {
      console.error('Error creating party:', error);
      toast({
        title: 'Party Creation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  // If user is null and not loading, we might be in the process of redirecting, render minimal UI
   if (!user && !isLoading) {
     return <div className="container mx-auto px-4 py-12 text-center">Redirecting to login...</div>;
   }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8 text-center text-primary">Create a New Party</h1>
      <Card className="bg-card p-6 md:p-8 border border-border">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Party Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Party Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Summer Beach Bash" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us a bit about the party..."
                      className="resize-none bg-input border-border focus:bg-background focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Keep it short and sweet!</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             {/* Date */}
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
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0)) // Disable past dates
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location */}
             <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Sunset Beach Club" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                  </FormControl>
                   <FormDescription>Where did the magic happen?</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             {/* Participants (Placeholder UI) */}
             <FormField
                control={form.control}
                name="participants"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Invite Participants (Optional)</FormLabel>
                    <FormControl>
                       {/* Basic Input - Replace with a proper user search/tagging component later */}
                        <div className="flex gap-2">
                             <Input
                                placeholder="Enter participant email(s)... (coming soon)"
                                // value={field.value?.join(', ') || ''} // Display emails for now
                                // onChange={(e) => field.onChange(e.target.value.split(',').map(email => email.trim()))}
                                disabled // Disabled until UI is built
                                className="bg-input border-border flex-grow"
                             />
                            <Button type="button" variant="outline" disabled> <UserPlus className="h-4 w-4" /></Button>
                        </div>
                    </FormControl>
                    <FormDescription>Search for users to add them to the party. (Feature under development)</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
             />


            {/* Media Upload */}
             <FormField
              control={form.control}
              name="media"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Upload Media (Photos, Videos, Sounds)</FormLabel>
                   <FormControl>
                     <Input
                       type="file"
                       multiple
                       accept={ACCEPTED_MEDIA_TYPES.join(',')}
                       onChange={handleFileChange}
                       className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer bg-input border-border focus:bg-background focus:border-primary"
                     />
                   </FormControl>
                  <FormDescription>
                      Max size: Images (1MB), Videos (10MB), Sounds (5MB). Files will be compressed if possible.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             {/* File Previews & Progress */}
              {(form.watch('media') || []).length > 0 && (
                  <div className="space-y-4">
                      <h4 className="text-sm font-medium text-foreground">Selected Files:</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {(form.watch('media') || []).map((file, index) => (
                              <div key={index} className="relative group border rounded-md p-2 bg-secondary space-y-2">
                                  {previews[index] && file.type.startsWith('image/') ? (
                                      <Image src={previews[index]} alt={`Preview ${file.name}`} width={100} height={100} className="rounded-md object-cover mx-auto h-20 w-20" />
                                  ) : (
                                       <div className="h-20 w-20 flex items-center justify-center bg-muted rounded-md mx-auto text-muted-foreground">
                                           <span className="text-xs truncate px-1">{file.name}</span>
                                       </div>
                                  )}
                                  <p className="text-xs text-muted-foreground truncate text-center">{file.name}</p>
                                   {uploadProgress[file.name] !== undefined && uploadProgress[file.name] >= 0 && uploadProgress[file.name] < 100 && (
                                     <Progress value={uploadProgress[file.name]} className="h-1 w-full" />
                                   )}
                                   {uploadProgress[file.name] === 100 && (
                                       <p className="text-xs text-green-500 text-center">Uploaded</p>
                                   )}
                                    {uploadProgress[file.name] === -1 && (
                                       <p className="text-xs text-destructive text-center">Upload Failed</p>
                                   )}
                                  <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                                      onClick={() => removeFile(index)}
                                  >
                                      <span className="text-xs">X</span>
                                      <span className="sr-only">Remove {file.name}</span>
                                  </Button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}


            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
              {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Party & Uploading...
                  </>
              ) : (
                  'Create Party'
              )}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
