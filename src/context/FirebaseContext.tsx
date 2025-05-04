'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Skeleton } from '@/components/ui/skeleton'; // Assuming Skeleton component exists

interface FirebaseContextProps {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
}

const FirebaseContext = createContext<FirebaseContextProps | undefined>(undefined);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const adminEmail = "hugues.rabier@gmail.com";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === adminEmail);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [adminEmail]); // Rerun effect if adminEmail changes (though it's constant here)

  if (loading) {
    // Optional: Show a loading skeleton or spinner for the entire app
    // Or return null/empty fragment if Navbar/Footer handle their own loading
    return (
       <div className="flex flex-col min-h-screen">
         {/* Skeleton Navbar */}
         <div className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
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
          <footer className="bg-card py-8 mt-auto border-t">
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
          </footer>
       </div>
    );
  }

  return (
    <FirebaseContext.Provider value={{ user, loading, isAdmin }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
