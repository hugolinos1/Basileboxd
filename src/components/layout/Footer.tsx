
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Facebook, Twitter, Instagram, Linkedin } from 'lucide-react'; // Using Lucide icons
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';

export function Footer() {
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);

  const socialLinks = [
    { Icon: Facebook, href: '#' },
    { Icon: Twitter, href: '#' },
    { Icon: Instagram, href: '#' },
    { Icon: Linkedin, href: '#' },
  ];

  const footerLinks = [
    {
      title: "Entreprise",
      links: [
        // "À propos" will be handled by the AlertDialog
      ],
    },
    {
      title: "Support",
      links: [
        // "Centre d'aide" will be handled by AlertDialog
        // "Contactez-nous" will be handled by AlertDialog
        { name: "Conditions d'utilisation", href: "#" },
      ],
    },
    {
        title: "Communauté",
        links: [
            { name: "Directives", href: "#" },
            { name: "Événements", href: "#" },
        ],
    },
     {
        title: "Légal",
        links: [
            { name: "Mentions légales", href: "#" },
        ],
    }
  ];

  return (
    <footer className="bg-card py-8 md:py-12 mt-auto border-t border-border/40">
      <div className="container mx-auto px-4">
        {/* Social Links */}
        <div className="flex justify-center md:justify-start space-x-6 mb-8">
          {socialLinks.map(({ Icon, href }, index) => (
            <Link key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <Icon className="h-5 w-5" />
            </Link>
          ))}
        </div>

        {/* Footer Links Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8 text-sm mb-8">
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold text-foreground mb-3">{section.title}</h4>
              <ul className="space-y-2">
                {section.title === "Entreprise" && (
                  <li>
                    <AlertDialog open={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="link" className="p-0 h-auto text-muted-foreground hover:text-foreground transition-colors font-normal">
                          À propos
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>À Propos de Nous</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tu parles d'une entreprise ! Juste une association de malfaiteurs.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction onClick={() => setIsAboutDialogOpen(false)}>Fermer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                )}
                 {section.title === "Support" && (
                   <>
                    <li>
                      <AlertDialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="link" className="p-0 h-auto text-muted-foreground hover:text-foreground transition-colors font-normal">
                            Centre d'aide
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Centre d'aide</AlertDialogTitle>
                            <AlertDialogDescription>
                              Oh ! T'as quel age ? Tu te démerdes
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogAction onClick={() => setIsHelpDialogOpen(false)}>Fermer</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                     <li>
                      <AlertDialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="link" className="p-0 h-auto text-muted-foreground hover:text-foreground transition-colors font-normal">
                            Contactez-nous
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Contactez-nous</AlertDialogTitle>
                            <AlertDialogDescription>
                              Qu'est ce tu veux ???
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogAction onClick={() => setIsContactDialogOpen(false)}>Fermer</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                   </>
                )}
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="text-center text-xs text-muted-foreground pt-8 border-t border-border/40">
          &copy; {new Date().getFullYear()} Hugolinos. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}

