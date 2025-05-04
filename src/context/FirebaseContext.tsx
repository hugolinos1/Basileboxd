'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, firebaseInitialized, firebaseInitializationError } from '@/config/firebase'; // Import potentially null auth and initialization status
import { Skeleton } from '@/components/ui/skeleton'; // Assuming Skeleton component exists
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert components
import { AlertTriangle } from 'lucide-react'; // Import icon for error alert

interface FirebaseContextProps {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  initializationFailed: boolean;
  initializationErrorMessage: string | null;
}

const FirebaseContext = createContext<FirebaseContextProps | undefined>(undefined);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // Directly use the imported initialization status
  const initializationFailed = !firebaseInitialized;
  const initializationErrorMessage = firebaseInitializationError;

  const adminEmail = "hugues.rabier@gmail.com";

  useEffect(() => {
    // If initialization already failed, don't attempt to set up listener
    if (initializationFailed) {
      console.error("Firebase n'a pas été initialisé, l'écouteur d'authentification ne sera pas configuré.");
      setLoading(false);
      return;
    }

    // Ensure auth is initialized before subscribing (double check, although firebaseInitialized should cover this)
    if (!auth) {
        console.error("Firebase Auth non initialisé au moment de l'effet useEffect. L'écouteur ne sera pas configuré.");
        setLoading(false); // Stop loading, state already reflects initialization failure
        return;
    }

    console.log("Configuration de l'écouteur d'état Firebase Auth...");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
       console.log("État d'authentification changé :", currentUser?.email || 'Aucun utilisateur');
      setUser(currentUser);
      setIsAdmin(currentUser?.email === adminEmail);
      setLoading(false);
    }, (error) => {
        // Handle errors during auth state observation
        console.error("Erreur dans l'écouteur onAuthStateChanged :", error);
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
        console.log("Nettoyage de l'écouteur d'état Firebase Auth.");
        unsubscribe();
    }
  }, [adminEmail, initializationFailed]); // Rerun effect if initialization status changes

  // Show Skeleton while loading AND if initialization hasn't failed yet
  if (loading && !initializationFailed) {
    return (
       <div className="flex flex-col min-h-screen">
         {/* Skeleton Navbar */}
         <div className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-6">
                 <Skeleton className="h-8 w-24" />
                 <div className="flex items-center space-x-4">
                    <Skeleton className="h-8 w-48 hidden md:block" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                 </div>
            </div>
         </div>
         {/* Skeleton Main Content */}
         <main className="flex-grow container mx-auto px-4 py-8">
             <Skeleton className="h-96 w-full mb-8" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-64 w-full" />
                ))}
            </div>
         </main>
         {/* Skeleton Footer */}
          <footer className="bg-card py-8 mt-auto border-t border-border/40">
            <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-24 mb-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
             <div className="text-center text-xs text-muted-foreground pt-8 border-t border-border/40">
                 <Skeleton className="h-4 w-48 mx-auto" />
             </div>
          </footer>
       </div>
    );
  }

  // Show Error Alert if initialization failed
  if (initializationFailed) {
     return (
       <div className="flex flex-col min-h-screen items-center justify-center p-4">
         <Alert variant="destructive" className="max-w-md">
           <AlertTriangle className="h-4 w-4" />
           <AlertTitle>Erreur d'Initialisation Firebase</AlertTitle>
           <AlertDescription>
             L'application n'a pas pu se connecter à Firebase. Veuillez vérifier la configuration.
             {initializationErrorMessage && <p className="mt-2 text-xs">Détail : {initializationErrorMessage}</p>}
             <p className="mt-2 text-xs">Assurez-vous que les variables d'environnement (commençant par NEXT_PUBLIC_) sont correctement définies dans `.env.local` et que le serveur de développement a été redémarré (`npm run dev`).</p>
           </AlertDescription>
         </Alert>
       </div>
     );
  }

  // Render children if loading is complete and initialization was successful
  return (
    <FirebaseContext.Provider value={{ user, loading, isAdmin, initializationFailed, initializationErrorMessage }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase doit être utilisé à l\'intérieur d\'un FirebaseProvider');
  }
  return context;
};
