import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';

interface Participant {
    id: string;
    avatarUrl: string;
}

interface Party {
  id: string;
  name: string;
  imageUrl: string;
  rating: string; // Keep as string if it includes '.0'
  participants: Participant[];
}

interface RecentPartiesSectionProps {
  parties: Party[];
}

export function RecentPartiesSection({ parties }: RecentPartiesSectionProps) {

   const getInitials = (id: string): string => {
        // Basic fallback based on id, replace with actual user data if available
        return id.substring(0, 1).toUpperCase();
   }

  return (
    <div className="container mx-auto px-4 md:px-6">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white">Recently Added Parties</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {parties.map((party) => (
          <Link href={`/party/${party.id}`} key={party.id} className="block group">
            <Card className="bg-card border border-border/50 overflow-hidden h-full flex flex-col hover:shadow-lg hover:border-primary/50 transition-all duration-300 thumbnail-hover">
              <CardHeader className="p-0 relative">
                <div className="aspect-video relative w-full">
                    {/* Use aspect-[16/9] or similar if images are consistently that ratio */}
                    <Image
                        src={party.imageUrl}
                        alt={party.name}
                        layout="fill"
                        objectFit="cover"
                        className="transition-transform duration-300 group-hover:scale-105"
                        loading="lazy" // Lazy load images
                        data-ai-hint="party gathering social"
                    />
                    {/* Rating Badge */}
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
                {/* Add other details like date or location if available */}
                 {/* <p className="text-xs text-muted-foreground">October 26, 2024</p> */}
              </CardContent>
              <CardFooter className="p-4 pt-0 flex justify-between items-center">
                 {/* Stacked Avatars */}
                 <div className="flex items-center stacked-avatars">
                   {party.participants.slice(0, 4).map((participant, index) => ( // Show max 4 avatars
                     <Avatar key={participant.id} className="h-6 w-6 border-2 border-background">
                       <AvatarImage src={participant.avatarUrl} alt={`Participant ${index + 1}`} />
                       <AvatarFallback className="text-xs bg-muted">
                            {getInitials(participant.id)}
                       </AvatarFallback>
                     </Avatar>
                   ))}
                   {party.participants.length > 4 && (
                       <Avatar className="h-6 w-6 border-2 border-background -ml-2">
                           <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                               +{party.participants.length - 4}
                           </AvatarFallback>
                       </Avatar>
                   )}
                 </div>
                 {/* Optional: Add participant count or other meta */}
                 {/* <span className="text-xs text-muted-foreground">{party.participants.length} attendees</span> */}
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
