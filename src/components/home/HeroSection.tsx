
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react'; 
import Link from 'next/link'; 

export function HeroSection() {
  return (
    <div className="relative h-96 md:h-[500px] lg:h-[600px] w-full">
      {/* Background Image */}
      <Image
        src="https://i.ibb.co/NnTT13h0/Snapchat-1715506731.jpg" 
        alt="Groupe de jeunes s'amusant à une fête ou un concert" 
        layout="fill"
        objectFit="cover"
        quality={85}
        priority // Load the hero image eagerly
        className="absolute inset-0 z-0"
        data-ai-hint="fête jeunes soirée" 
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 hero-gradient z-10" />

      {/* Content */}
      <div className="relative z-20 container mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-12 md:pb-20 lg:pb-28">
        <div className="max-w-lg">
            {/* Optional: Top 10 Badge if applicable to the featured item */}
            {/* <span className="top10-badge mb-4">Top 1 Fête</span> */}

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-primary mb-4 shadow-lg">
              BaliseBoxd
            </h1>
            <p className="text-base md:text-lg text-gray-200 mb-6 shadow-md">
              Le QG des délires que t’as (presque) oubliés
            </p>
            <div className="flex space-x-3">
              <Link href="/events/create" passHref>
                <Button variant="default" size="lg" className="bg-white text-black hover:bg-gray-200">
                  <PlusCircle className="mr-2 h-5 w-5 fill-current" /> 
                  Créer un Event 
                </Button>
              </Link>
            </div>
        </div>
      </div>
    </div>
  );
}

