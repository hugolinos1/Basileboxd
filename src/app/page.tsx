
// src/app/page.tsx
'use client'; 

import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { AddPartySection } from '@/components/home/AddPartySection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp, doc, getDoc as getFirestoreDoc, where } from 'firebase/firestore';
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

async function getPartyDataForUser(userId: string | null): Promise<{ topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }> {
  if (!db) {
    console.error("[getPartyDataForUser] Firestore instance (db) is not available.");
    return { topParties: [], recentParties: [] };
  }
  if (!userId) {
    console.log("[getPartyDataForUser] No user ID provided. Returning empty data for public/unauthenticated view.");
    // Logic for public data if any (e.g., fetching all public parties)
    // For now, sticking to the "uniquement si on est connecté" behavior for TOP10/Recent
    // However, if the prompt implies homepage should show *something* even when logged out,
    // we might fetch all parties here without user-specific filtering.
    // Let's assume for now, based on previous behavior, that these sections are user-dependent.
    // To show general public data:
    // 1. Remove the userId check here.
    // 2. Adjust queries to fetch general data (e.g., all recent, all top-rated).
    // 3. This would likely mean the TopParties/RecentParties sections are always populated.
  }

  console.log(`[getPartyDataForUser] Starting data fetch for user: ${userId || 'public'}`);

  try {
    const partiesCollectionRef = collection(db, 'parties');
    
    // Query for recent parties - this should be general, not user-specific for homepage
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    console.log("[getPartyDataForUser] Recent parties query:", recentQuery);
    
    // Query for all parties to rank (for TOP10) - also general
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); // Limit for performance
    console.log("[getPartyDataForUser] All parties query (for ranking):", allPartiesQuery);


    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);
    console.log(`[getPartyDataForUser] Fetched ${allPartiesSnapshot.size} parties for ranking, ${recentSnapshot.size} for recent section.`);

    if (allPartiesSnapshot.empty && recentSnapshot.empty) {
        console.warn("[getPartyDataForUser] No parties found in 'parties' collection at all.");
    }

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyDataForUser] Mapped allPartiesData for ranking. Count: ${allPartiesData.length}`);
    if (allPartiesData.length > 0) {
      console.log("[getPartyDataForUser] Sample of allPartiesData (first 2 for ranking):", allPartiesData.slice(0, 2).map(p => ({id: p.id, name: p.name, ratings: p.ratings, createdAt: p.createdAt?.toString() })));
    }


    const partiesWithAvgRating = allPartiesData
      .map(party => {
          const avgRating = calculatePartyAverageRating(party);
          // console.log(`[getPartyDataForUser] Party: ${party.name}, Ratings: ${JSON.stringify(party.ratings)}, Calculated Avg Rating (0-5): ${avgRating}`);
          return { ...party, averageRating: avgRating };
      })
      .filter(party => { // Keep parties even if rating is 0 for TOP10, rank them lower.
          // const passesFilter = party.averageRating > 0; // Original filter
          // For TOP10, we might want to include parties with 0 ratings if there aren't enough > 0
          return true; // Include all for now, sorting will handle ranking.
      })
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));  // Handle undefined averageRating
    
    console.log(`[getPartyDataForUser] Parties after rating calculation and sorting (count: ${partiesWithAvgRating.length})`);
     if (partiesWithAvgRating.length > 0) {
       console.log("[getPartyDataForUser] Sample of partiesWithAvgRating (first 2):", partiesWithAvgRating.slice(0, 2).map(p => ({name:p.name, avg: p.averageRating})));
     }

    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => {
        // console.log(`[getPartyDataForUser] Top Party ${index + 1}: ${party.name}, Cover URL: ${party.coverPhotoUrl}, Avg Rating (0-5): ${party.averageRating}`);
        return {
          id: party.id,
          name: party.name || 'Événement sans nom',
          imageUrl: party.coverPhotoUrl || undefined, 
          rating: party.averageRating || 0, // Default to 0 if undefined
          rank: index + 1,
        };
    });
    console.log(`[getPartyDataForUser] Created topParties array with ${topParties.length} items.`);
     if (topParties.length > 0) {
       console.log("[getPartyDataForUser] Sample of topParties (first 2):", topParties.slice(0, 2));
     } else {
       console.warn("[getPartyDataForUser] topParties array is empty.");
     }


    const recentPartiesDataFromSnapshot: PartyData[] = recentSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyDataForUser] Mapped recentPartiesDataFromSnapshot. Count: ${recentPartiesDataFromSnapshot.length}`);


    const recentPartiesPromises = recentPartiesDataFromSnapshot.map(async (party) => {
      const averageRating = calculatePartyAverageRating(party);
      
      const participantDetailsPromises = (party.participants || []).slice(0, 5).map(async (participantId) => {
        let userProfile: UserProfile | null = null;
        try {
          const userDocRef = doc(db, 'users', participantId); 
          const userDocSnap = await getFirestoreDoc(userDocRef);
          if (userDocSnap.exists()) {
            userProfile = { id: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
          } else {
             // console.warn(`[getPartyDataForUser] Recent: User profile not found for participant ID: ${participantId} in party ${party.name}`);
          }
        } catch (e) {
          console.warn(`[getPartyDataForUser] Recent: Could not fetch profile for participant ${participantId}:`, e);
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

      // console.log(`[getPartyDataForUser] Recent Party Processed: ${party.name}, Cover URL: ${party.coverPhotoUrl}`);
      return {
        id: party.id,
        name: party.name || 'Événement sans nom',
        imageUrl: party.coverPhotoUrl || undefined, 
        rating: (averageRating || 0).toFixed(1), // Default to 0 if undefined
        participants: participants,
      };
    });

    const recentParties = await Promise.all(recentPartiesPromises);
    console.log(`[getPartyDataForUser] Created recentParties array with ${recentParties.length} items`);
    if (recentParties.length > 0) {
       console.log("[getPartyDataForUser] Sample of recentParties (first 2):", recentParties.slice(0, 2));
     } else {
       console.warn("[getPartyDataForUser] recentParties array is empty.");
     }

    console.log(`[getPartyDataForUser] FINAL: Prepared ${topParties.length} top parties and ${recentParties.length} recent parties.`);
    return { topParties, recentParties };

  } catch (error) {
    console.error("[getPartyDataForUser] Erreur MAJEURE lors de la récupération des fêtes:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("[getPartyDataForUser] FIREBASE PERMISSION ERROR: Check Firestore security rules for the 'parties' collection. Ensure reads are allowed for the current user context (authenticated or public). Also check if required indexes are built.");
     } else if (error instanceof Error && error.message.includes('requires an index')) {
         console.error("[getPartyDataForUser] FIREBASE INDEXING ERROR: The query requires an index. Check the Firebase console for a link to create it. Error:", error.message);
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
    if (authLoading || !firebaseInitialized) {
      setDataLoading(true); // Keep loading if auth or firebase is not ready
      return;
    }

    // If Firebase is initialized, proceed to fetch data regardless of user state for now
    // The getPartyDataForUser function will handle if userId is null (for public view)
    setDataLoading(true);
    console.log("[Home useEffect] Triggering getPartyDataForUser. User UID:", user?.uid || "public/unauthenticated");
    getPartyDataForUser(user?.uid || null).then(data => { // Pass null if no user
      console.log("[Home useEffect] Data received from getPartyDataForUser:", data);
      setPartyData(data);
      setDataLoading(false);
    }).catch(err => {
      console.error("[Home useEffect] Failed to load party data:", err);
      setPartyData({ topParties: [], recentParties: [] }); 
      setDataLoading(false);
    });

  }, [user, authLoading, firebaseInitialized]);

  if (authLoading || !firebaseInitialized || dataLoading) { // Keep dataLoading check
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
      {/* Conditionally render based on if data is available for authenticated state */}
      {firebaseInitialized && partyData && (user || (!user && (partyData.topParties.length > 0 || partyData.recentParties.length > 0))) ? (
          <AuthenticatedHomePageContent topParties={partyData.topParties} recentParties={partyData.recentParties} />
        ) : firebaseInitialized && !user ? ( // If not logged in and no public data was fetched (or sections are user-dependent)
          <div className="container mx-auto px-4 text-center py-10">
            <p className="text-lg text-foreground">Bienvenue sur BaliseBoxd !</p>
            <p className="text-muted-foreground">Connectez-vous pour découvrir, noter et partager les meilleurs Events.</p>
          </div>
        ) : ( // Fallback for errors or no data when user is logged in
           firebaseInitialized && user && !partyData && <p className="text-center text-muted-foreground">Chargement des données des événements ou aucun événement à afficher...</p>
        )
      }
    </div>
  );
}

