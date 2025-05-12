// src/components/home/TopPartiesSection.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'; 
import { cn } from '@/lib/utils';

interface Party {
  id: string;
  name: string;
  imageUrl?: string; 
  rating: number; 
  rank: number;
}

interface TopPartiesSectionProps {
  parties: Party[];
}

export function TopPartiesSection({ parties }: TopPartiesSectionProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { current: container } = scrollContainerRef;
      const scrollAmount = container.offsetWidth * 0.8; 
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

   const getRankColor = (rank: number): string => {
    if (rank === 1) return 'top-number-gold';
    if (rank === 2) return 'top-number-silver';
    if (rank === 3) return 'top-number-bronze';
    return 'text-white'; 
  };

  return (
    <div className="container mx-auto px-4 md:px-6 relative group">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white">TOP10 des Events</h2>

      <button
        onClick={() => scroll('left')}
        className="scroll-arrow left-0 md:left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        aria-label="Faire défiler vers la gauche"
      >
        <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
      </button>
      <button
        onClick={() => scroll('right')}
        className="scroll-arrow right-0 md:right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        aria-label="Faire défiler vers la droite"
      >
        <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
      </button>

      <div
        ref={scrollContainerRef}
        className="flex space-x-4 md:space-x-6 overflow-x-auto pb-6 scrollbar-hide top10-slider" 
      >
        {parties.length === 0 && (
            <p className="text-muted-foreground text-center w-full">Aucun événement dans le top 10 pour le moment.</p>
        )}
        {parties.map((party, index) => (
          <Link href={`/party/${party.id}`} key={party.id} className="block flex-shrink-0">
            <Card className="w-48 md:w-64 border-none bg-transparent overflow-visible group/item relative transition-transform duration-300 ease-in-out hover:scale-105">
              <CardContent className="p-0 flex flex-col items-start space-y-2"> 
                 <div className={cn("top-number z-10 absolute -left-4 -bottom-4", getRankColor(party.rank))}> 
                   {party.rank}
                 </div>

                <div className="w-full h-64 md:h-80 ml-6 md:ml-10 relative rounded-md overflow-hidden shadow-lg thumbnail-hover bg-muted">
                   {party.imageUrl ? (
                     <Image
                       src={party.imageUrl}
                       alt={party.name}
                       fill
                       style={{ objectFit: 'cover' }}
                       className="transition-transform duration-300 group-hover/item:scale-110"
                       loading="lazy"
                       data-ai-hint="fête événement célébration"
                       sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                       onError={(e) => {
                        console.error(`Error loading image for Top Party ${party.rank} (${party.id}): ${party.imageUrl}`, e);
                       }}
                       unoptimized={party.imageUrl.includes('localhost')}
                     />
                   ) : (
                     <div className="flex items-center justify-center h-full">
                       <ImageIcon className="h-16 w-16 text-muted-foreground/50" />
                     </div>
                   )}
                </div>
                <p className="text-sm font-semibold text-white ml-6 md:ml-10 mt-2 truncate w-full text-center group-hover/item:text-primary transition-colors">
                  {party.name}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
