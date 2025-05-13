// src/components/home/LandingInvitationSection.tsx
'use client';

import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import Link from 'next/link';

export function LandingInvitationSection() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 text-center">
      <h2 className="text-3xl md:text-4xl font-bold text-primary mb-6">
        Bienvenue sur BaliseBoxd !
      </h2>
      <p className="text-lg md:text-xl text-foreground mb-8 max-w-2xl mx-auto">
        Le QG des délires que t’as (presque) oubliés. Connectez-vous ou créez un compte pour découvrir, noter et partager les meilleurs Events de Balise Boli.
      </p>
      <Link href="/auth" passHref>
        <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <LogIn className="mr-2 h-5 w-5" />
          Connexion / Inscription
        </Button>
      </Link>
    </div>
  );
}
