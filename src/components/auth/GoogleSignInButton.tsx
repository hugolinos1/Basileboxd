'use client';

import { Button } from '@/components/ui/button';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';

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
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user already exists in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
         // User is new, create Firestore document
         await setDoc(userDocRef, {
           email: user.email,
           uid: user.uid,
           displayName: user.displayName || user.email?.split('@')[0],
           avatarUrl: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`, // Use Google photo or placeholder
           createdAt: new Date(),
         });
          toast({
            title: 'Account Created & Logged In',
            description: `Welcome, ${user.displayName || user.email}!`,
        });
      } else {
           toast({
            title: 'Login Successful',
            description: `Welcome back, ${user.displayName || user.email}!`,
        });
      }

      router.push('/'); // Redirect to home page
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
       let errorMessage = 'An unknown error occurred during Google Sign-In.';
       if (error.code === 'auth/popup-closed-by-user') {
         errorMessage = 'Sign-in cancelled.';
       } else if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = 'An account already exists with the same email address but different sign-in credentials. Try signing in with the original method.';
       }
      toast({
        title: 'Google Sign-In Failed',
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
      Continue with Google
    </Button>
  );
}
