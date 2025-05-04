'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email({ message: 'Adresse email invalide.' }),
  password: z.string().min(6, { message: 'Le mot de passe doit contenir au moins 6 caractères.' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ['confirmPassword'], // path of error
});

interface SignupFormProps {
  onSignupSuccess?: () => void;
}

export function SignupForm({ onSignupSuccess }: SignupFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        uid: user.uid,
        createdAt: new Date(),
        // Add other initial fields like displayName if collected, or leave empty
        displayName: user.email?.split('@')[0] || 'Nouvel utilisateur',
        avatarUrl: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100` // Placeholder avatar
      });


      toast({
        title: 'Inscription réussie',
        description: 'Votre compte a été créé. Veuillez vous connecter.',
      });
      form.reset(); // Reset form fields
      onSignupSuccess?.(); // Callback to potentially switch tabs

    } catch (error: any) {
      console.error('Erreur d\'inscription:', error);
       let errorMessage = 'Une erreur inconnue est survenue lors de l\'inscription.';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Cette adresse email est déjà enregistrée.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Veuillez entrer une adresse email valide.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Le mot de passe est trop faible. Veuillez choisir un mot de passe plus fort.';
        }
      toast({
        title: 'Échec de l\'inscription',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="vous@exemple.com"
                  {...field} type="email"
                  className="bg-input border-border focus:bg-background focus:border-primary"
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mot de passe</FormLabel>
              <FormControl>
                <Input
                  placeholder="••••••••"
                  {...field}
                  type="password"
                  className="bg-input border-border focus:bg-background focus:border-primary"
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmer le mot de passe</FormLabel>
              <FormControl>
                <Input
                  placeholder="••••••••"
                  {...field}
                  type="password"
                  className="bg-input border-border focus:bg-background focus:border-primary"
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
           {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
           S'inscrire
        </Button>
      </form>
    </Form>
  );
}
