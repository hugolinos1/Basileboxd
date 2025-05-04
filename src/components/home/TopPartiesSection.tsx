'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Party {
  id: string;
  name: string;
  imageUrl: string;
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
      const scrollAmount = container.offsetWidth * 0.8; // Scroll by 80% of visible width
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
    return 'text-white'; // Default color for ranks 4-10
  };

  return (
    <div className="container mx-auto px-4 md:px-6 relative group">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white">Top 10 des Fêtes</h2>

      {/* Scroll Arrows - visible on hover */}
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
        className="flex space-x-4 md:space-x-6 overflow-x-auto pb-6 scrollbar-hide top10-slider" // Added top10-slider class
      >
        {parties.map((party, index) => (
          <Link href={`/party/${party.id}`} key={party.id} className="block flex-shrink-0">
            <Card className="w-48 md:w-64 border-none bg-transparent overflow-visible group/item relative transition-transform duration-300 ease-in-out hover:scale-105">
              <CardContent className="p-0 flex items-end space-x-2 md:space-x-4">
                {/* Rank Number */}
                 <div className={cn("top-number z-10", getRankColor(party.rank))}>
                   {party.rank}
                 </div>

                {/* Image Thumbnail */}
                <div className="w-full h-64 md:h-80 ml-6 md:ml-10 relative rounded-md overflow-hidden shadow-lg thumbnail-hover">
                   {/* Added thumbnail-hover class */}
                  <Image
                    src={party.imageUrl}
                    alt={party.name}
                    layout="fill"
                    objectFit="cover"
                    className="transition-transform duration-300 group-hover/item:scale-110" // Image zoom on card hover
                    loading="lazy" // Lazy load images
                    data-ai-hint="fête événement célébration"
                  />
                   {/* Optional overlay for better text visibility if needed */}
                  {/* <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" /> */}
                </div>
              </CardContent>
              {/* Party name or details can be added below or overlaid */}
               {/* <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent z-20">
                   <h3 className="text-white font-semibold truncate">{party.name}</h3>
               </div> */}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Helper CSS in globals.css or a style tag if preferred for scrollbar hiding
/*
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
*/
