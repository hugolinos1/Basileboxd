// src/components/admin/AdminHeroImageManagement.tsx
'use client';

import { useState, useEffect, ChangeEvent, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/config/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'; 
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loader2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { ACCEPTED_COVER_PHOTO_TYPES, MAX_FILE_SIZE } from '@/services/media-uploader';
import { useFirebase } from '@/context/FirebaseContext';
import { Skeleton } from '@/components/ui/skeleton';

const HERO_IMAGE_STORAGE_PATH = 'siteConfiguration/heroImage';
const HERO_SETTINGS_DOC_PATH = 'siteConfiguration/heroSettings';
const DEFAULT_HERO_IMAGE_URL = "https://i.ibb.co/NnTT13h0/Snapchat-1715506731.jpg";

export function AdminHeroImageManagement() {
  const { isAdmin, firebaseInitialized } = useFirebase();
  const { toast } = useToast();
  const [currentHeroImageUrl, setCurrentHeroImageUrl] = useState<string | null>(DEFAULT_HERO_IMAGE_URL);
  const [newHeroImageFile, setNewHeroImageFile] = useState<File | null>(null);
  const [newHeroImagePreview, setNewHeroImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!firebaseInitialized) return;

    const fetchCurrentImageUrl = async () => {
      if (!db) {
        console.warn("Firestore DB instance is not available in AdminHeroImageManagement.");
        setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
        setIsLoadingCurrent(false);
        return;
      }
      setIsLoadingCurrent(true);
      try {
        const docRef = doc(db, HERO_SETTINGS_DOC_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.heroImageUrl) {
          setCurrentHeroImageUrl(docSnap.data().heroImageUrl);
        } else {
          setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
          console.log(`Hero image URL not found in Firestore at ${HERO_SETTINGS_DOC_PATH}, using default.`);
        }
      } catch (error) {
        console.error("Error fetching current hero image URL:", error);
        toast({ title: "Erreur", description: "Impossible de charger l'image de fond actuelle.", variant: "destructive" });
        setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
      } finally {
        setIsLoadingCurrent(false);
      }
    };
    fetchCurrentImageUrl();
  }, [toast, firebaseInitialized]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!ACCEPTED_COVER_PHOTO_TYPES.includes(file.type)) {
        toast({ title: "Type de fichier non supporté", description: `Veuillez sélectionner une image (${ACCEPTED_COVER_PHOTO_TYPES.join(', ')}).`, variant: "destructive" });
        return;
      }
      if (file.size > MAX_FILE_SIZE.image) { 
        toast({ title: "Fichier trop volumineux", description: `L'image ne doit pas dépasser ${MAX_FILE_SIZE.image / 1024 / 1024}Mo.`, variant: "destructive" });
        return;
      }
      setNewHeroImageFile(file);
      if (newHeroImagePreview) URL.revokeObjectURL(newHeroImagePreview);
      setNewHeroImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUploadAndSave = async () => {
    if (!newHeroImageFile || !isAdmin || !storage || !db) {
      toast({ title: "Erreur", description: "Fichier manquant, permissions insuffisantes ou service non disponible.", variant: "destructive" });
      return;
    }
    setIsUploading(true);

    if (currentHeroImageUrl && currentHeroImageUrl !== DEFAULT_HERO_IMAGE_URL) {
        try {
            const oldImagePath = new URL(currentHeroImageUrl).pathname.split('/o/')[1].split('?')[0];
            if (oldImagePath && oldImagePath !== HERO_IMAGE_STORAGE_PATH) { 
                 await deleteObject(ref(storage, decodeURIComponent(oldImagePath)));
                 console.log("Ancienne image de la page d'accueil supprimée de Storage.");
            }
        } catch (deleteError: any) {
            console.warn("Avertissement lors de la suppression de l'ancienne image:", deleteError.message);
            if (deleteError.code !== 'storage/object-not-found') {
                 toast({ title: "Avertissement", description: "Impossible de supprimer l'ancienne image de fond, mais la nouvelle sera téléversée.", variant: "default" });
            }
        }
    }

    const fileExtension = newHeroImageFile.name.split('.').pop();
    const newImageFileName = `heroImage-${Date.now()}.${fileExtension}`;
    const newImageStoragePath = `${HERO_IMAGE_STORAGE_PATH}/${newImageFileName}`;
    const storageRefInstance = ref(storage, newImageStoragePath);

    try {
      const uploadTask = uploadBytesResumable(storageRefInstance, newHeroImageFile);

      uploadTask.on('state_changed',
        (snapshot) => {},
        (error) => {
          console.error("Upload error:", error);
          toast({ title: "Échec du téléversement", description: error.message, variant: "destructive" });
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(db, HERO_SETTINGS_DOC_PATH), { heroImageUrl: downloadURL });
          setCurrentHeroImageUrl(downloadURL);
          toast({ title: "Image de fond mise à jour !" });
          setNewHeroImageFile(null);
          if (newHeroImagePreview) URL.revokeObjectURL(newHeroImagePreview);
          setNewHeroImagePreview(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setIsUploading(false);
        }
      );
    } catch (error: any) {
      console.error("Error uploading/saving hero image:", error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setIsUploading(false);
    }
  };
  
  const handleDeleteHeroImage = async () => {
    if (!isAdmin || !storage || !db) {
      toast({ title: "Erreur", description: "Permissions insuffisantes ou service non disponible.", variant: "destructive" });
      return;
    }
    setIsUploading(true); 
    try {
      if (currentHeroImageUrl && currentHeroImageUrl !== DEFAULT_HERO_IMAGE_URL) {
        try {
          const imagePath = new URL(currentHeroImageUrl).pathname.split('/o/')[1].split('?')[0];
           if (imagePath && imagePath.startsWith(HERO_IMAGE_STORAGE_PATH)) { 
             await deleteObject(ref(storage, decodeURIComponent(imagePath)));
             console.log("Image de fond actuelle supprimée de Storage.");
           }
        } catch (deleteError: any) {
          console.warn("Avertissement: Impossible de supprimer l'image actuelle de Storage:", deleteError.message);
           if (deleteError.code !== 'storage/object-not-found') {
            toast({ title: "Avertissement", description: "L'ancienne image de fond n'a pas pu être supprimée du stockage, mais les paramètres seront réinitialisés.", variant: "default" });
           }
        }
      }
      await setDoc(doc(db, HERO_SETTINGS_DOC_PATH), { heroImageUrl: DEFAULT_HERO_IMAGE_URL }); 
      setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
      toast({ title: "Image de fond réinitialisée à la valeur par défaut." });
    } catch (error: any) {
        console.error("Erreur lors de la réinitialisation de l'image:", error);
        toast({ title: "Erreur", description: "Impossible de réinitialiser l'image de fond.", variant: "destructive" });
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Image de Fond Principale</CardTitle>
        <CardDescription>Gérer l'image de fond affichée sur la page d'accueil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Image Actuelle :</h4>
          {isLoadingCurrent ? (
            <Skeleton className="w-full h-48 rounded-md bg-muted" />
          ) : currentHeroImageUrl ? (
            <div className="relative w-full aspect-[16/7] rounded-md overflow-hidden border border-border">
              <Image 
                src={currentHeroImageUrl} 
                alt="Image de fond actuelle" 
                fill 
                style={{ objectFit: 'cover' }} 
                priority 
                data-ai-hint="accueil fête concert"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                unoptimized={currentHeroImageUrl.includes('i.ibb.co') || currentHeroImageUrl.includes('localhost') || !currentHeroImageUrl.startsWith('https')} 
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune image configurée. L'image par défaut sera utilisée.</p>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium text-muted-foreground">Modifier l'Image :</h4>
            <Input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_COVER_PHOTO_TYPES.join(',')}
              onChange={handleFileChange}
              className="bg-input border-border"
              disabled={isUploading}
            />
            {newHeroImagePreview && (
              <div className="mt-2 relative w-full max-w-md aspect-[16/7] rounded-md overflow-hidden border border-border">
                <Image 
                  src={newHeroImagePreview} 
                  alt="Aperçu nouvelle image" 
                  fill 
                  style={{ objectFit: 'contain' }} 
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full z-10 opacity-70 hover:opacity-100"
                  onClick={() => {
                    setNewHeroImageFile(null);
                    if (newHeroImagePreview) URL.revokeObjectURL(newHeroImagePreview);
                    setNewHeroImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isUploading}
                  title="Retirer l'aperçu"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center">
                <Button onClick={handleUploadAndSave} disabled={!newHeroImageFile || isUploading} className="flex-grow sm:flex-grow-0">
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Mettre à jour l'Image
                </Button>
                 <Button onClick={handleDeleteHeroImage} variant="outline" disabled={isUploading || currentHeroImageUrl === DEFAULT_HERO_IMAGE_URL} className="flex-grow sm:flex-grow-0">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Réinitialiser à l'image par défaut
                </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
