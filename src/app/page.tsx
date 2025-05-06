import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { calculatePartyAverageRating, PartyData as SharedPartyData, MediaItem as SharedMediaItem } from '@/lib/party-utils';

// Extend PartyData to include id if not already present
type PartyData = SharedPartyData & { id: string };


// Define a structure for the data passed to components
interface TopPartyDisplayData {
  id: string;
  name: string;
  imageUrl?: string; 
  rating: number;
  rank: number;
}

interface RecentPartyDisplayData {
  id: string;
  name: string;
  imageUrl?: string; 
  rating: string;
  participants: { id: string; avatarUrl?: string }[]; 
}


async function getPartyData(): Promise<{ topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }> {
  if (!db) {
    console.error("Firestore instance is not available.");
    return { topParties: [], recentParties: [] };
  }

  try {
    console.log("Fetching party data from Firestore...");
    const partiesCollectionRef = collection(db, 'parties');
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50));

    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);
    console.log(`Fetched ${allPartiesSnapshot.size} parties for ranking, ${recentSnapshot.size} for recent.`);

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartyData));

    const partiesWithAvgRating = allPartiesData
      .map(party => ({
          ...party,
          averageRating: calculatePartyAverageRating(party)
      }))
      .filter(party => party.averageRating > 0) 
      .sort((a, b) => b.averageRating - a.averageRating); 

    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => {
        console.log(`Top Party ${index + 1}: ${party.name}, Cover URL: ${party.coverPhotoUrl}`); 
        return {
          id: party.id,
          name: party.name || 'Événement sans nom',
          imageUrl: party.coverPhotoUrl || undefined, 
          rating: party.averageRating,
          rank: index + 1,
        };
    });

    const recentParties: RecentPartyDisplayData[] = recentSnapshot.docs.map(doc => {
      const party = { id: doc.id, ...doc.data() } as PartyData;
      const averageRating = calculatePartyAverageRating(party);
      const participants = (party.participantEmails || []).slice(0, 5).map((email, index) => ({
          id: party.participants?.[index] || `user-${index}-${email}`, 
          avatarUrl: undefined 
      }));

       console.log(`Recent Party: ${party.name}, Cover URL: ${party.coverPhotoUrl}`); 
      return {
        id: party.id,
        name: party.name || 'Événement sans nom',
        imageUrl: party.coverPhotoUrl || undefined, 
        rating: averageRating.toFixed(1),
        participants: participants,
      };
    });

    console.log(`Prepared ${topParties.length} top parties and ${recentParties.length} recent parties.`);
    return { topParties, recentParties };

  } catch (error) {
    console.error("Erreur lors de la récupération des fêtes:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("FIREBASE PERMISSION ERROR: Check Firestore security rules for the 'parties' collection. Ensure reads are allowed.");
     }
    return { topParties: [], recentParties: [] }; 
  }
}


export default async function Home() {
  const { topParties, recentParties } = await getPartyData();

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