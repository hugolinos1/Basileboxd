// src/app/page.tsx
'use client'; 

import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp, doc, getDoc as getFirestoreDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { calculatePartyAverageRating, PartyData as SharedPartyData } from '@/lib/party-utils';
import { useFirebase } from '@/context/FirebaseContext';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
    console.error("[getPartyData] Firestore instance (db) is not available.");
    return { topParties: [], recentParties: [] };
  }

  console.log(`[getPartyData] Starting data fetch.`);

  try {
    const partiesCollectionRef = collection(db, 'parties');
    
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    console.log("[getPartyData] Recent parties query:", recentQuery);
    
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); 
    console.log("[getPartyData] All parties query (for ranking):", allPartiesQuery);


    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);
    console.log(`[getPartyData] Fetched ${allPartiesSnapshot.size} parties for ranking, ${recentSnapshot.size} for recent section.`);

    if (allPartiesSnapshot.empty && recentSnapshot.empty) {
        console.warn("[getPartyData] No parties found in 'parties' collection at all.");
    }

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyData] Mapped allPartiesData for ranking. Count: ${allPartiesData.length}`);
    if (allPartiesData.length > 0) {
      console.log("[getPartyData] Sample of allPartiesData (first 2 for ranking):", allPartiesData.slice(0, 2).map(p => ({id: p.id, name: p.name, ratings: p.ratings, createdAt: p.createdAt?.toString() })));
    }


    const partiesWithAvgRating = allPartiesData
      .map(party => {
          const avgRating = calculatePartyAverageRating(party);
          return { ...party, averageRating: avgRating };
      })
      // MODIFIED: Removed filter that excluded 0-rated parties to allow them in Top10 (ranked lower)
      .filter(party => true) 
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));  // Handle undefined averageRating
    
    console.log(`[getPartyData] Parties after rating calculation and sorting (count: ${partiesWithAvgRating.length})`);
     if (partiesWithAvgRating.length > 0) {
       console.log("[getPartyData] Sample of partiesWithAvgRating (first 2):", partiesWithAvgRating.slice(0, 2).map(p => ({name:p.name, avg: p.averageRating})));
     }

    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => {
        return {
          id: party.id,
          name: party.name || 'Événement sans nom',
          imageUrl: party.coverPhotoUrl || undefined, 
          rating: party.averageRating || 0, 
          rank: index + 1,
        };
    });
    console.log(`[getPartyData] Created topParties array with ${topParties.length} items.`);
     if (topParties.length > 0) {
       console.log("[getPartyData] Sample of topParties (first 2):", topParties.slice(0, 2));
     } else {
       console.warn("[getPartyData] topParties array is empty.");
     }


    const recentPartiesDataFromSnapshot: PartyData[] = recentSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyData] Mapped recentPartiesDataFromSnapshot. Count: ${recentPartiesDataFromSnapshot.length}`);


    const recentPartiesPromises = recentPartiesDataFromSnapshot.map(async (party) => {
      const averageRating = calculatePartyAverageRating(party);
      
      const participantDetailsPromises = (party.participants || []).slice(0, 5).map(async (participantId) => {
        let userProfile: UserProfile | null = null;
        try {
          const userDocRef = doc(db, 'users', participantId); 
          const userDocSnap = await getFirestoreDoc(userDocRef);
          if (userDocSnap.exists()) {
            userProfile = { id: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
          }
        } catch (e) {
          console.warn(`[getPartyData] Recent: Could not fetch profile for participant ${participantId}:`, e);
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

      return {
        id: party.id,
        name: party.name || 'Événement sans nom',
        imageUrl: party.coverPhotoUrl || undefined, 
        rating: (averageRating || 0).toFixed(1), 
        participants: participants,
      };
    });

    const recentParties = await Promise.all(recentPartiesPromises);
    console.log(`[getPartyData] Created recentParties array with ${recentParties.length} items`);
    if (recentParties.length > 0) {
       console.log("[getPartyData] Sample of recentParties (first 2):", recentParties.slice(0, 2));
     } else {
       console.warn("[getPartyData] recentParties array is empty.");
     }

    console.log(`[getPartyData] FINAL: Prepared ${topParties.length} top parties and ${recentParties.length} recent parties.`);
    return { topParties, recentParties };

  } catch (error) {
    console.error("[getPartyData] Erreur MAJEURE lors de la récupération des fêtes:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("[getPartyData] FIREBASE PERMISSION ERROR: Check Firestore security rules for the 'parties' collection. Ensure reads are allowed. Also check if required indexes are built.");
     } else if (error instanceof Error && error.message.includes('requires an index')) {
         console.error("[getPartyData] FIREBASE INDEXING ERROR: The query requires an index. Check the Firebase console for a link to create it. Error:", error.message);
     }
    return { topParties: [], recentParties: [] }; 
  }
}

const AuthenticatedHomePageContent = ({ topParties, recentParties }: { topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }) => {
  console.log("[AuthenticatedHomePageContent] Rendering with topParties:", topParties.length, "recentParties:", recentParties.length);
  return (
    <>
      <TopPartiesSection parties={topParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <RecentPartiesSection parties={recentParties} />
      <Separator className="my-8 md:my-12 bg-border/50" />
      <AddPartySection />
    </>
  );
};

export default function Home() {
  const { user, loading: authLoading, firebaseInitialized } = useFirebase();
  const [partyData, setPartyData] = useState<{ topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] } | null>(null);
  const [dataLoading, setDataLoading] = useState(true); 

  useEffect(() => {
    console.log("[Home useEffect] AuthLoading:", authLoading, "FirebaseInitialized:", firebaseInitialized, "User:", !!user);
    if (!firebaseInitialized) { // Only proceed if Firebase is initialized
      setDataLoading(true); 
      return;
    }

    // If Firebase is initialized, proceed to fetch data
    // getPartyData is general and doesn't depend on user auth status for fetching all parties.
    setDataLoading(true);
    console.log("[Home useEffect] Triggering getPartyData.");
    getPartyData().then(data => { 
      console.log("[Home useEffect] Data received from getPartyData:", data);
      setPartyData(data);
      setDataLoading(false);
    }).catch(err => {
      console.error("[Home useEffect] Failed to load party data:", err);
      setPartyData({ topParties: [], recentParties: [] }); 
      setDataLoading(false);
    });

  }, [firebaseInitialized]); // Removed user and authLoading to prevent re-fetches on auth change if not needed for general data

  if (authLoading || !firebaseInitialized || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-12 md:space-y-16 lg:space-y-20 pb-16">
      <HeroSection />
      {/* Render content if partyData is loaded, regardless of user auth state if data is public */}
      {partyData && (partyData.topParties.length > 0 || partyData.recentParties.length > 0) ? (
          <AuthenticatedHomePageContent topParties={partyData.topParties} recentParties={partyData.recentParties} />
        ) : ( // Fallback if no data or loading still (though dataLoading should handle it)
          <div className="container mx-auto px-4 text-center py-10">
            <p className="text-lg text-foreground">Bienvenue sur BaliseBoxd !</p>
            <p className="text-muted-foreground">
              {user ? "Aucun événement à afficher pour le moment." : "Connectez-vous pour découvrir, noter et partager les meilleurs Events."}
            </p>
          </div>
        )
      }
    </div>
  );
}
