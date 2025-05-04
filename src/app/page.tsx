import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';

export default function Home() {
  // Mock data - replace with actual data fetching later
  const topParties = Array.from({ length: 10 }, (_, i) => ({
    id: `top-${i + 1}`,
    name: `Epic Party ${i + 1}`,
    imageUrl: `https://picsum.photos/400/600?random=${i}`,
    rating: 5 - i * 0.1,
    rank: i + 1,
  }));

  const recentParties = Array.from({ length: 15 }, (_, i) => ({
    id: `recent-${i + 1}`,
    name: `Recent Bash ${i + 1}`,
    imageUrl: `https://picsum.photos/300/200?random=${10 + i}`,
    rating: (Math.random() * 2 + 3).toFixed(1), // Random rating between 3.0 and 5.0
    participants: Array.from({ length: Math.floor(Math.random() * 4) + 2 }, (__, j) => ({ // 2 to 5 participants
      id: `user-${i}-${j}`,
      avatarUrl: `https://picsum.photos/50/50?random=${100 + i * 10 + j}`
    })),
  }));


  return (
    <div className="flex flex-col space-y-12 md:space-y-16 lg:space-y-20 pb-16">
      <HeroSection />
      <TopPartiesSection parties={topParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <RecentPartiesSection parties={recentParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <AddPartySection />
    </div>
  );
}
