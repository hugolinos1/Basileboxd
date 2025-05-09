import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp, doc, getDoc as getFirestoreDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { calculatePartyAverageRating, PartyData as SharedPartyData, MediaItem as SharedMediaItem } from '@/lib/party-utils';

// Extend PartyData to include id if not already present
type PartyData = SharedPartyData & { id: string };

interface UserProfile {
    id: string;
    uid: string;
    email: string;
    displayName?: string;
    pseudo?: string;
    avatarUrl?: string;
}

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
  participants: { 
    id: string; 
    avatarUrl?: string;
    email?: string;
    displayName?: string;
    pseudo?: string;
  }[]; 
}


async function getPartyData(): Promise<{ topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }> {
  if (!db) {
    console.error("Firestore instance is not available for getPartyData.");
    return { topParties: [], recentParties: [] };
  }

  try {
    console.log("[getPartyData] Fetching party data from Firestore...");
    const partiesCollectionRef = collection(db, 'parties');
    // Ensure you have an index on 'createdAt' descending for these queries in Firestore
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); 

    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);
    console.log(`[getPartyData] Fetched ${allPartiesSnapshot.size} parties for ranking, ${recentSnapshot.size} for recent.`);

    if (allPartiesSnapshot.empty) {
        console.log("[getPartyData] No parties found in 'parties' collection for ranking.");
    }

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => {
        const data = doc.data();
        // Log each document's data for inspection
        // console.log(`[getPartyData] Raw party doc (id: ${doc.id}):`, data);
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyData] Mapped allPartiesData count: ${allPartiesData.length}`);
    if (allPartiesData.length > 0) {
      // console.log("[getPartyData] Sample of allPartiesData (first 2):", allPartiesData.slice(0, 2).map(p => ({id: p.id, name: p.name, ratings: p.ratings, createdAt: p.createdAt })));
    }


    const partiesWithAvgRating = allPartiesData
      .map(party => {
          const avgRating = calculatePartyAverageRating(party);
          // console.log(`[getPartyData] Party: ${party.name}, Ratings: ${JSON.stringify(party.ratings)}, Calculated Avg Rating (0-5): ${avgRating}`);
          return {
            ...party,
            averageRating: avgRating
          };
      })
      .filter(party => {
          const passesFilter = party.averageRating > 0;
          // if (!passesFilter) {
          //   console.log(`[getPartyData] Filtering out party: ${party.name} due to averageRating <= 0 (is ${party.averageRating})`);
          // }
          return passesFilter;
      })
      .sort((a, b) => b.averageRating - a.averageRating); 
    
    console.log(`[getPartyData] Parties after rating calculation and filtering (count: ${partiesWithAvgRating.length}):`);
    // if (partiesWithAvgRating.length > 0) {
    //   console.log("[getPartyData] Sample of partiesWithAvgRating (first 2):", partiesWithAvgRating.slice(0, 2).map(p => ({name:p.name, avg: p.averageRating})));
    // }


    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => {
        // console.log(`[getPartyData] Top Party ${index + 1}: ${party.name}, Cover URL: ${party.coverPhotoUrl}, Avg Rating (0-5): ${party.averageRating}`); 
        return {
          id: party.id,
          name: party.name || 'Événement sans nom',
          imageUrl: party.coverPhotoUrl || undefined, 
          rating: party.averageRating,
          rank: index + 1,
        };
    });

    const recentPartiesPromises = recentSnapshot.docs.map(async (partyDoc) => {
      const party = { id: partyDoc.id, ...partyDoc.data() } as PartyData;
      const averageRating = calculatePartyAverageRating(party);
      
      const participantDetailsPromises = (party.participants || []).slice(0, 5).map(async (participantId) => {
        let userProfile: UserProfile | null = null;
        try {
          // Ensure 'users' collection exists and participantId is a valid doc ID
          const userDocRef = doc(db, 'users', participantId); 
          const userDocSnap = await getFirestoreDoc(userDocRef);
          if (userDocSnap.exists()) {
            userProfile = { id: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
          } else {
            // console.warn(`[getPartyData] User profile not found for participant ID: ${participantId} in party ${party.name}`);
          }
        } catch (e) {
          console.warn(`[getPartyData] Could not fetch profile for participant ${participantId}:`, e);
        }
        return {
          id: participantId,
          avatarUrl: userProfile?.avatarUrl || undefined,
          email: userProfile?.email || undefined,
          displayName: userProfile?.displayName || undefined,
          pseudo: userProfile?.pseudo || undefined,
        };
      });
      const participants = await Promise.all(participantDetailsPromises);

      // console.log(`[getPartyData] Recent Party: ${party.name}, Cover URL: ${party.coverPhotoUrl}`); 
      return {
        id: party.id,
        name: party.name || 'Événement sans nom',
        imageUrl: party.coverPhotoUrl || undefined, 
        rating: averageRating.toFixed(1),
        participants: participants,
      };
    });

    const recentParties = await Promise.all(recentPartiesPromises);

    console.log(`[getPartyData] Prepared ${topParties.length} top parties and ${recentParties.length} recent parties.`);
    return { topParties, recentParties };

  } catch (error) {
    console.error("[getPartyData] Erreur lors de la récupération des fêtes:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("[getPartyData] FIREBASE PERMISSION ERROR: Check Firestore security rules for the 'parties' collection. Ensure reads are allowed. Also check if required indexes are built.");
     } else if (error instanceof Error && error.message.includes('requires an index')) {
         console.error("[getPartyData] FIREBASE INDEXING ERROR: The query requires an index. Check the Firebase console for a link to create it. Error:", error.message);
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
      {/* Pass fetched data to RecentPartiesSection */}
      <RecentPartiesSection parties={recentParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <AddPartySection />
    </div>
  );
}

