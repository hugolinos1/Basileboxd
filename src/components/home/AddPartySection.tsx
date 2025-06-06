import { Button } from '@/components/ui/button';
import { Camera, Video, Music, PlusCircle } from 'lucide-react';
import Link from 'next/link';

export function AddPartySection() {
  const icons = [
    { Icon: Camera, label: 'Photos' },
    { Icon: Video, label: 'Vidéos' },
    { Icon: Music, label: 'Sons' },
  ];

  return (
    <div className="bg-secondary py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Partagez votre Event !</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Des moments à partager ? Créez un nouvel Event et téléchargez vos photos, vidéos et clips audio pour que tout le monde puisse noter et commenter.
        </p>

        <div className="flex justify-center items-center space-x-6 mb-8">
          {icons.map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center space-y-1 text-muted-foreground">
              <Icon className="h-6 w-6 md:h-8 md:w-8" />
              <span className="text-xs md:text-sm">{label}</span>
            </div>
          ))}
        </div>

        <Link href="/events/create">
          <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-5 w-5" />
            Créer un Event
          </Button>
        </Link>
      </div>
    </div>
  );
}
