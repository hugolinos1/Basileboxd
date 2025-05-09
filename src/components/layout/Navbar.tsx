// src/components/layout/Navbar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, User as UserIcon, LogOut, LayoutDashboard, Settings, List, Users, Menu, BarChart3 } from 'lucide-react';
import { useFirebase } from '@/context/FirebaseContext';
import { auth } from '@/config/firebase';
import { signOut } from 'firebase/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

export function Navbar() {
  const { user, isAdmin, firebaseInitialized, loading: authLoading } = useFirebase();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/auth'); // Redirect to auth page after sign out
    } catch (error) {
      console.error("Erreur lors de la déconnexion: ", error);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/parties?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/parties');
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  // Don't render navbar content until firebase is initialized and auth state is known
  // This prevents a flash of "Connexion / Inscription" for logged-in users
  const showNavbarContent = firebaseInitialized && !authLoading;


  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2">
            <Image
                src="https://i.ibb.co/nMGMZNPq/logo2.png"
                alt="BaliseBoxd Logo"
                width={28}
                height={28}
                className="object-contain"
                data-ai-hint="logo diable cornes"
            />
            <span className="font-bold text-primary">BaliseBoxd</span>
          </Link>

           {showNavbarContent && user && (
             <div className="hidden md:flex items-center space-x-4">
                  <Link href="/parties" className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                     <List className="mr-1 h-4 w-4" /> Events
                  </Link>
                  <Link href="/users" className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <Users className="mr-1 h-4 w-4" /> Les Membres
                  </Link>
                   <Link href="/stats" className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <BarChart3 className="mr-1 h-4 w-4" /> Statistiques
                  </Link>
             </div>
           )}
        </div>


        <div className="flex flex-1 items-center justify-end space-x-4">
          {showNavbarContent && user && (
            <div className="relative w-full max-w-sm hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Rechercher des Events..."
                className="w-full pl-10 pr-4 py-2 h-9 bg-secondary border-border focus:bg-background focus:border-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          )}

          {showNavbarContent && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="default" className="h-12 w-12 p-0 bg-primary hover:bg-primary/80">
                    <Menu className="h-8 w-8 text-primary-foreground" />
                    <span className="sr-only">Ouvrir le menu utilisateur</span>
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.displayName || user.email?.split('@')[0]}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <div className="md:hidden">
                    <DropdownMenuItem onClick={() => router.push('/parties')}>
                        <List className="mr-2 h-4 w-4" />
                        <span>Events</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/users')}>
                        <Users className="mr-2 h-4 w-4" />
                        <span>Les Membres</span>
                    </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => router.push('/stats')}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Statistiques</span>
                    </DropdownMenuItem>
                    {/* Mobile Search Input */}
                    <DropdownMenuSeparator className="md:hidden" />
                    <div className="p-2 md:hidden">
                        <div className="relative">
                           <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                           <Input
                             type="search"
                             placeholder="Rechercher des Events..."
                             className="w-full pl-10 pr-4 py-2 h-9 bg-input border-border focus:bg-background focus:border-primary"
                             value={searchQuery}
                             onChange={(e) => setSearchQuery(e.target.value)}
                             onKeyDown={handleSearchKeyDown}
                           />
                        </div>
                    </div>
                    <DropdownMenuSeparator className="md:hidden"/>
                 </div>
                 <DropdownMenuItem onClick={() => router.push(`/user/${user.uid}`)}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>Profil</span>
                  </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => router.push('/admin')}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Panneau Admin</span>
                  </DropdownMenuItem>
                )}
                 <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Paramètres</span>
                 </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Se déconnecter</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : showNavbarContent ? ( // Only show login button if firebase is init and user is null
            <Button onClick={() => router.push('/auth')} variant="default" size="sm">
              <UserIcon className="mr-2 h-4 w-4" />
              Connexion / Inscription
            </Button>
          ) : null /* Or a placeholder/skeleton while auth is loading */ }
        </div>
      </div>
    </nav>
  );
}
