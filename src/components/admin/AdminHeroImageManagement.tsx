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
import { ACCEPTED_COVER_PHOTO_TYPES, MAX_FILE_SIZE } from '@/services/media-uploader'; // Using existing constants
import { useFirebase } from '@/context/FirebaseContext';

const HERO_IMAGE_STORAGE_PATH = 'site_configuration/hero_image/hero_image'; // Fixed path for easy overwrite/delete
const HERO_SETTINGS_DOC_PATH = 'siteConfiguration/heroSettings';
const DEFAULT_HERO_IMAGE_URL = "https://i.ibb.co/NnTT13h0/Snapchat-1715506731.jpg";


export function AdminHeroImageManagement() {
  const { isAdmin } = useFirebase();
  const { toast } = useToast();
  const [currentHeroImageUrl, setCurrentHeroImageUrl] = useState<string | null>(DEFAULT_HERO_IMAGE_URL);
  const [newHeroImageFile, setNewHeroImageFile] = useState<File | null>(null);
  const [newHeroImagePreview, setNewHeroImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCurrentImageUrl = async () => {
      if (!db) return;
      setIsLoadingCurrent(true);
      try {
        const docRef = doc(db, HERO_SETTINGS_DOC_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.heroImageUrl) {
          setCurrentHeroImageUrl(docSnap.data().heroImageUrl);
        } else {
          setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
        }
      } catch (error) {
        console.error("Error fetching current hero image URL:", error);
        toast({ title: "Erreur", description: "Impossible de charger l'image actuelle.", variant: "destructive" });
        setCurrentHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
      } finally {
        setIsLoadingCurrent(false);
      }
    };
    fetchCurrentImageUrl();
  }, [toast]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!ACCEPTED_COVER_PHOTO_TYPES.includes(file.type)) {
        toast({ title: "Type de fichier non supporté", description: `Veuillez sélectionner une image (${ACCEPTED_COVER_PHOTO_TYPES.join(', ')}).`, variant: "destructive" });
        return;
      }
      if (file.size > MAX_FILE_SIZE.image) { // Using existing image size limit for consistency
        toast({ title: "Fichier trop volumineux", description: `L'image ne doit pas dépasser ${MAX_FILE_SIZE.image / 1024 / 1024}Mo.`, variant: "destructive" });
        return;
      }
      setNewHeroImageFile(file);
      setNewHeroImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUploadAndSave = async () => {
    if (!newHeroImageFile || !isAdmin || !storage || !db) {
      toast({ title: "Erreur", description: "Fichier manquant, permissions insuffisantes ou service non disponible.", variant: "destructive" });
      return;
    }
    setIsUploading(true);

    try {
      // Delete existing image if one is stored with the fixed name (optional, but good for cleanup)
      // This requires listAll and then delete, or just trying to delete the known path.
      // For simplicity, we'll just overwrite. If you need to guarantee no orphaned files with dynamic names, 
      // you'd store the full storage path in Firestore and delete that specific path.
      // Since we use a fixed path HERO_IMAGE_STORAGE_PATH, overwriting is fine.

      const storageRef = ref(storage, `${HERO_IMAGE_STORAGE_PATH}.${newHeroImageFile.name.split('.').pop()}`); // Append extension
      const uploadTask = uploadBytesResumable(storageRef, newHeroImageFile);

      uploadTask.on('state_changed',
        null, // No progress tracking for this simple upload
        (error) => {
          console.error("Upload error:", error);
          toast({ title: "Échec du téléversement", description: error.message, variant: "destructive" });
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(db, HERO_SETTINGS_DOC_PATH), { heroImageUrl: downloadURL }, { merge: true });
          setCurrentHeroImageUrl(downloadURL);
          toast({ title: "Image Hero mise à jour !" });
          setNewHeroImageFile(null);
          if (newHeroImagePreview) URL.revokeObjectURL(newHeroImagePreview);
          setNewHeroImagePreview(null);
          if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
          setIsUploading(false);
        }
      );
    } catch (error: any) {
      console.error("Error uploading/saving hero image:", error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setIsUploading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Image de la Section Héro</CardTitle>
        <CardDescription>Gérer l'image principale affichée sur la page d'accueil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Image Actuelle :</h4>
          {isLoadingCurrent ? (
            <Skeleton className="w-full h-48 rounded-md bg-muted" />
          ) : currentHeroImageUrl ? (
            <div className="relative w-full aspect-[16/7] rounded-md overflow-hidden border border-border">
              <Image src={currentHeroImageUrl} alt="Image Héro Actuelle" layout="fill" objectFit="cover" data-ai-hint="paysage urbain"/>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune image configurée. L'image par défaut sera utilisée.</p>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-2 pt-4 border-t border-border/50">
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
              <div className="mt-2 relative w-1/2 aspect-[16/7] rounded-md overflow-hidden border border-border">
                <Image src={newHeroImagePreview} alt="Aperçu nouvelle image Héro" layout="fill" objectFit="cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full z-10 opacity-80 hover:opacity-100"
                  onClick={() => {
                    setNewHeroImageFile(null);
                    if (newHeroImagePreview) URL.revokeObjectURL(newHeroImagePreview);
                    setNewHeroImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isUploading}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
            <Button onClick={handleUploadAndSave} disabled={!newHeroImageFile || isUploading || !isAdmin} className="w-full md:w-auto">
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Mettre à jour l'Image Héro
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
