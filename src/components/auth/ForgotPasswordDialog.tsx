'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Loader2 } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Adresse email invalide.' }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function ForgotPasswordDialog({ isOpen, onOpenChange }: ForgotPasswordDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setIsLoading(true);
    if (!auth) {
      toast({ title: 'Erreur', description: "Le service d'authentification n'est pas disponible.", variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, values.email);
      toast({
        title: 'Email envoyé',
        description: 'Si un compte existe pour cet email, vous recevrez un lien pour réinitialiser votre mot de passe.',
      });
      onOpenChange(false); // Close dialog on success
      form.reset();
    } catch (error: any) {
      console.error('Erreur de réinitialisation du mot de passe:', error);
      let errorMessage = "Une erreur est survenue lors de l'envoi de l'email.";
      if (error.code === 'auth/user-not-found') {
        errorMessage = "Aucun utilisateur trouvé avec cette adresse email.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "L'adresse email fournie n'est pas valide.";
      }
      toast({
        title: 'Échec de l\'envoi',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Mot de Passe Oublié</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Entrez votre adresse email pour recevoir un lien de réinitialisation de mot de passe.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="vous@exemple.com"
                      {...field}
                      type="email"
                      className="bg-input border-border focus:bg-background focus:border-primary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isLoading}>
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Envoyer le lien
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
