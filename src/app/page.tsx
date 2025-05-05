import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { calculatePartyAverageRating, getDateFromTimestamp, PartyData } from '@/lib/party-utils'; // Assuming party utils exist


// Define a structure for the data passed to components
interface TopPartyDisplayData {
  id: string;
  name: string;
  imageUrl?: string; // Make imageUrl optional
  rating: number;
  rank: number;
}

interface RecentPartyDisplayData {
  id: string;
  name: string;
  imageUrl?: string; // Make imageUrl optional
  rating: string;
  participants: { id: string; avatarUrl?: string }[]; // Ensure avatarUrl is optional
}


async function getPartyData(): Promise<{ topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }> {
  if (!db) {
    console.error("Firestore instance is not available.");
    return { topParties: [], recentParties: [] };
  }

  try {
    const partiesCollectionRef = collection(db, 'parties');
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    // For top parties, we need to fetch all (or a larger set) and sort client-side by calculated average rating
    // Note: Firestore doesn't directly support ordering by computed fields like average rating.
    // Fetching a reasonable number (e.g., 50) and sorting is a common approach for moderate datasets.
    // For very large datasets, a backend aggregation/ranking mechanism would be better.
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); // Fetch more for ranking

    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartyData));

    // Calculate average ratings and sort for Top 10
    const partiesWithAvgRating = allPartiesData.map(party => ({
        ...party,
        averageRating: calculatePartyAverageRating(party)
    })).sort((a, b) => b.averageRating - a.averageRating); // Sort descending by average rating

    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => ({
      id: party.id,
      name: party.name || 'Événement sans nom',
      imageUrl: party.coverPhotoUrl, // Use coverPhotoUrl
      rating: party.averageRating,
      rank: index + 1,
    }));

    // Prepare recent parties data
    const recentParties: RecentPartyDisplayData[] = recentSnapshot.docs.map(doc => {
      const party = { id: doc.id, ...doc.data() } as PartyData;
      const averageRating = calculatePartyAverageRating(party);
      // Fetch participant avatars might require another query or denormalization
      const participants = (party.participantEmails || []).slice(0, 5).map((email, index) => ({
          id: party.participants?.[index] || `user-${index}`, // Use UID if available, else fallback
          // TODO: Fetch avatarUrl based on UID/email from a 'users' collection if needed
          avatarUrl: `https://picsum.photos/seed/${party.participants?.[index] || email}/50/50` // Placeholder
      }));

      return {
        id: party.id,
        name: party.name || 'Événement sans nom',
        imageUrl: party.coverPhotoUrl, // Use coverPhotoUrl
        rating: averageRating.toFixed(1),
        participants: participants,
      };
    });

    return { topParties, recentParties };

  } catch (error) {
    console.error("Erreur lors de la récupération des fêtes:", error);
    return { topParties: [], recentParties: [] }; // Return empty arrays on error
  }
}


export default async function Home() {
  const { topParties, recentParties } = await getPartyData();

  return (
    <div className="flex flex-col space-y-12 md:space-y-16 lg:space-y-20 pb-16">
      <HeroSection />
      {/* Pass fetched data to TopPartiesSection */}
      <TopPartiesSection parties={topParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      {/* Pass fetched data to RecentPartiesSection */}
      <RecentPartiesSection parties={recentParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <AddPartySection />
    </div>
  );
}
