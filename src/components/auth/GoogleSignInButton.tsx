'use client';

import { Button } from '@/components/ui/button';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'; // Added updateDoc and serverTimestamp

// Simple SVG for Google icon
const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
        <path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 261.8 0 122.5 105.5 12.7 244 12.7c67.3 0 122.1 24.8 163.8 64.5l-64.5 63.4C304.1 105.3 276.6 92.1 244 92.1c-81.5 0-148.3 65.6-148.3 146.8s66.8 146.8 148.3 146.8c86.1 0 127.4-56.6 132.8-87.1H244v-83.1h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
    </svg>
);


export function GoogleSignInButton() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const provider = new GoogleAuthProvider();

  const handleSignIn = async () => {
    setIsLoading(true);
    if (!auth || !db) {
        console.error("Erreur: Auth ou DB non initialisé pour Google Sign-In.");
        toast({ title: 'Erreur de configuration', description: 'Le service Firebase n\'est pas prêt.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user already exists in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
         // User is new, create Firestore document
         console.log(`Nouvel utilisateur Google: ${user.email}. Création du document Firestore...`);
         await setDoc(userDocRef, {
           email: user.email,
           uid: user.uid,
           displayName: user.displayName || user.email?.split('@')[0],
           avatarUrl: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`, // Use Google photo or placeholder
           createdAt: serverTimestamp(), // Use server timestamp
         });
          toast({
            title: 'Compte créé et connecté',
            description: `Bienvenue, ${user.displayName || user.email}!`,
        });
      } else {
           // User exists, maybe update some fields like avatarUrl or displayName if changed
           console.log(`Utilisateur Google existant: ${user.email}. Connexion...`);
           // Example: Update avatar if it changed
           const existingData = userDocSnap.data();
           if (user.photoURL && existingData.avatarUrl !== user.photoURL) {
                console.log(`Mise à jour de l'avatar pour ${user.email}`);
                await updateDoc(userDocRef, {
                    avatarUrl: user.photoURL
                });
           }
           toast({
            title: 'Connexion réussie',
            description: `Bon retour, ${user.displayName || user.email}!`,
        });
      }

      router.push('/'); // Redirect to home page
    } catch (error: any) {
      console.error('Erreur de connexion Google :', error);
       let errorMessage = 'Une erreur inconnue est survenue lors de la connexion Google.';
       if (error.code === 'auth/popup-closed-by-user') {
         errorMessage = 'Connexion annulée.';
       } else if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = 'Un compte existe déjà avec la même adresse e-mail mais des identifiants de connexion différents. Essayez de vous connecter avec la méthode d\'origine.';
       } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-blocked') {
             errorMessage = 'La fenêtre popup de connexion a été bloquée ou annulée. Veuillez autoriser les popups pour ce site.';
       } else if (error.code === 'unavailable') {
             errorMessage = 'Service Firebase temporairement indisponible. Veuillez réessayer plus tard.';
       }
      toast({
        title: 'Échec de la connexion Google',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="outline" className="w-full" onClick={handleSignIn} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <GoogleIcon />
      )}
      Continuer avec Google
    </Button>
  );
}
