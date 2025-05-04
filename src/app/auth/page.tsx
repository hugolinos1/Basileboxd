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
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Loading...</div>; // Or a spinner
   }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12 px-4">
      <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
          <TabsTrigger value="login" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Login</TabsTrigger>
          <TabsTrigger value="signup" className="data-[state=active]:bg-card data-[state=active]:text-foreground">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <Card className="bg-card border-border">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>Enter your credentials to access your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <LoginForm />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
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
              <CardTitle className="text-2xl">Create an Account</CardTitle>
              <CardDescription>Enter your details to join the party</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignupForm onSignupSuccess={() => setActiveTab('login')} />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or sign up with
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
