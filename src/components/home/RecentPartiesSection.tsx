// src/components/home/RecentPartiesSection.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, Image as ImageIcon } from 'lucide-react'; 

interface Participant {
    id: string;
    avatarUrl?: string; 
    email?: string; 
    displayName?: string; 
    pseudo?: string; 
}

interface Party {
  id: string;
  name: string;
  imageUrl?: string; 
  rating: string; 
  participants: Participant[];
}

interface RecentPartiesSectionProps {
  parties: Party[];
}

export function RecentPartiesSection({ parties }: RecentPartiesSectionProps) {

   const getInitials = (participant: Participant): string => {
        const name = participant.pseudo || participant.displayName || participant.email;
        if (name && name.length > 0) return name.charAt(0).toUpperCase();
        return participant.id.substring(0, 1).toUpperCase() || '?';
   }

  return (
    <div className="container mx-auto px-4 md:px-6">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white">Events Ajoutés Récemment</h2>
       {parties.length === 0 && (
            <p className="text-muted-foreground text-center py-4">Aucun événement récent trouvé.</p>
       )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {parties.map((party) => (
          <Link href={`/party/${party.id}`} key={party.id} className="block group">
            <Card className="bg-card border border-border/50 overflow-hidden h-full flex flex-col hover:shadow-lg hover:border-primary/50 transition-all duration-300 thumbnail-hover">
              <CardHeader className="p-0 relative">
                <div className="aspect-video relative w-full bg-muted"> 
                    {party.imageUrl ? (
                        <Image
                            src={party.imageUrl}
                            alt={party.name}
                            fill
                            style={{ objectFit: 'cover' }}
                            className="transition-transform duration-300 group-hover:scale-105"
                            loading="lazy" 
                            data-ai-hint="fête rassemblement social"
                            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                            onError={(e) => {
                              console.error(`Error loading image for Recent Party (${party.id}): ${party.imageUrl}`, e);
                            }}
                             unoptimized={party.imageUrl.includes('localhost') || !party.imageUrl.startsWith('https')} 
                        />
                    ) : (
                         <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                         </div>
                    )}
                     <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center space-x-1">
                         <Star className="h-3 w-3 text-yellow-400 fill-current" />
                         <span>{party.rating}</span>
                     </div>
                </div>

              </CardHeader>
              <CardContent className="p-4 flex-grow">
                <CardTitle className="text-base font-semibold leading-tight mb-2 truncate group-hover:text-primary transition-colors">
                    {party.name}
                </CardTitle>
              </CardContent>
              <CardFooter className="p-4 pt-0 flex justify-between items-center">
                 <div className="flex items-center stacked-avatars">
                   {party.participants.slice(0, 3).map((participant, index) => ( 
                     <Avatar key={participant.id} className="h-6 w-6 border-2 border-background">
                       {participant.avatarUrl ? (
                          <AvatarImage src={participant.avatarUrl} alt={participant.displayName || participant.pseudo || participant.email || `Participant ${index + 1}`} />
                       ) : null }
                       <AvatarFallback className="text-xs bg-muted">
                            {getInitials(participant)}
                       </AvatarFallback>
                     </Avatar>
                   ))}
                   {party.participants.length > 3 && (
                       <Avatar className="h-6 w-6 border-2 border-background -ml-2">
                           <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                               +{party.participants.length - 3}
                           </AvatarFallback>
                       </Avatar>
                   )}
                 </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
