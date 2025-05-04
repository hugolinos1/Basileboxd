'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AuthPage() {
  const { user, loading } = useFirebase();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('login');

   useEffect(() => {
    // Redirect if user is already logged in and not loading
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

   // Optionally, show a loading state or nothing while checking auth state
   if (loading || user) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Chargement...</div>; // Or a spinner
   }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12 px-4">
      <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
          <TabsTrigger value="login" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Connexion</TabsTrigger>
          <TabsTrigger value="signup" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Inscription</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <Card className="bg-card border-border">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl">Bon Retour</CardTitle>
              <CardDescription>Entrez vos identifiants pour accéder à votre compte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <LoginForm />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Ou continuer avec
                  </span>
                </div>
              </div>
              <GoogleSignInButton />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card className="bg-card border-border">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl">Créer un Compte</CardTitle>
              <CardDescription>Entrez vos informations pour rejoindre la fête</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignupForm onSignupSuccess={() => setActiveTab('login')} />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Ou s'inscrire avec
                  </span>
                </div>
              </div>
              <GoogleSignInButton />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
