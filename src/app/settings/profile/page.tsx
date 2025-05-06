// src/app/settings/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';

// Schema for profile form
const profileSchema = z.object({
  displayName: z.string().min(1, 'Le nom d\'affichage est requis.').max(50, 'Le nom d\'affichage est trop long.'),
  pseudo: z.string().max(30, 'Le pseudo est trop long.').optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSettingsPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true); // State for fetching initial data

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      pseudo: '',
    },
  });

  useEffect(() => {
    // Redirect if not authenticated or loading
    if (!authLoading && !user) {
      router.push('/auth');
      return;
    }

    // Fetch existing user data if authenticated
    if (user && db) {
      const fetchUserData = async () => {
        setIsFetching(true);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            form.reset({
              displayName: data.displayName || user.email?.split('@')[0] || '',
              pseudo: data.pseudo || '',
            });
          } else {
             // If no Firestore doc exists yet (shouldn't happen with signup logic, but good fallback)
             form.reset({
                displayName: user.displayName || user.email?.split('@')[0] || '',
                pseudo: '',
             });
             console.warn("Document utilisateur Firestore non trouvé pour", user.uid);
          }
        } catch (error) {
          console.error("Erreur lors de la récupération des données utilisateur:", error);
          toast({ title: "Erreur", description: "Impossible de charger les informations du profil.", variant: "destructive" });
        } finally {
          setIsFetching(false);
        }
      };
      fetchUserData();
    } else if (!authLoading && user && !db) {
        console.error("Instance Firestore (db) non disponible.");
        toast({ title: "Erreur", description: "Service de base de données non disponible.", variant: "destructive" });
        setIsFetching(false);
    }
  }, [user, authLoading, router, form, toast]); // Removed db from dependencies as it should be stable

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user || !db) {
      toast({ title: "Erreur", description: "Utilisateur non connecté ou base de données indisponible.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);

      console.log("Mise à jour du profil pour l'utilisateur UID:", user.uid);
      console.log("Référence du document Firestore :", userDocRef.path);
      await updateDoc(userDocRef, {
        displayName: values.displayName,
        pseudo: values.pseudo || '', // Store empty string if undefined
      });
      toast({ title: "Profil mis à jour", description: "Vos informations ont été sauvegardées." });
      router.push(`/user/${user.uid}`); // Redirect back to profile page
    } catch (error) {
      console.error("Erreur lors de la mise à jour du profil:", error);
      toast({ title: "Erreur", description: "Impossible de mettre à jour le profil.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isFetching) {
    return <div className="container mx-auto px-4 py-12 text-center">Chargement du profil...</div>;
  }

  if (!user) {
     return <div className="container mx-auto px-4 py-12 text-center">Redirection vers la connexion...</div>;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card className="bg-card border border-border">
        <CardHeader>
          <CardTitle>Modifier le Profil</CardTitle>
          <CardDescription>Mettez à jour votre nom d'affichage et votre pseudo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom d'affichage *</FormLabel>
                    <FormControl>
                      <Input placeholder="Votre nom affiché" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pseudo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pseudo (Optionnel)</FormLabel>
                    <FormControl>
                      <Input placeholder="Votre pseudo unique" {...field} className="bg-input border-border focus:bg-background focus:border-primary"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-3">
                 <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
                     Annuler
                 </Button>
                  <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sauvegarder
                  </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

