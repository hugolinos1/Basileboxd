// src/app/page.tsx
'use client'; // Make this a client component to use useFirebase

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
    console.error("Firestore instance is not available for getPartyDataForUser.");
    return { topParties: [], recentParties: [] };
  }
   // If no user, we might want to show public data or nothing. For now, return empty.
   // The prompt says "uniquement si on est connecté"
  if (!userId) {
    console.log("[getPartyDataForUser] No user ID provided, returning empty data as per requirement.");
    return { topParties: [], recentParties: [] };
  }

  try {
    console.log(`[getPartyDataForUser] Fetching party data from Firestore for user: ${userId}...`);
    const partiesCollectionRef = collection(db, 'parties');
    
    // Query for recent parties (could be all recent, or filtered by user participation later)
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(15));
    
    // Query for parties to rank (could be all parties or filtered)
    const allPartiesQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); 

    const [recentSnapshot, allPartiesSnapshot] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQuery)
    ]);
    console.log(`[getPartyDataForUser] Fetched ${allPartiesSnapshot.size} parties for ranking, ${recentSnapshot.size} for recent.`);

    if (allPartiesSnapshot.empty && recentSnapshot.empty) {
        console.log("[getPartyDataForUser] No parties found in 'parties' collection.");
    }

    const allPartiesData: PartyData[] = allPartiesSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as PartyData;
    });
    console.log(`[getPartyDataForUser] Mapped allPartiesData count: ${allPartiesData.length}`);

    const partiesWithAvgRating = allPartiesData
      .map(party => {
          const avgRating = calculatePartyAverageRating(party);
          return { ...party, averageRating: avgRating };
      })
      .filter(party => party.averageRating > 0)
      .sort((a, b) => b.averageRating - a.averageRating); 
    
    console.log(`[getPartyDataForUser] Parties after rating calculation and filtering (count: ${partiesWithAvgRating.length})`);

    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => ({
      id: party.id,
      name: party.name || 'Événement sans nom',
      imageUrl: party.coverPhotoUrl || undefined, 
      rating: party.averageRating,
      rank: index + 1,
    }));

    const recentPartiesPromises = recentSnapshot.docs.map(async (partyDoc) => {
      const party = { id: partyDoc.id, ...partyDoc.data() } as PartyData;
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
          console.warn(`[getPartyDataForUser] Could not fetch profile for participant ${participantId}:`, e);
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
        rating: averageRating.toFixed(1),
        participants: participants,
      };
    });

    const recentParties = await Promise.all(recentPartiesPromises);

    console.log(`[getPartyDataForUser] Prepared ${topParties.length} top parties and ${recentParties.length} recent parties.`);
    return { topParties, recentParties };

  } catch (error) {
    console.error("[getPartyDataForUser] Erreur lors de la récupération des fêtes:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("[getPartyDataForUser] FIREBASE PERMISSION ERROR: Check Firestore security rules for the 'parties' collection. Ensure reads are allowed for authenticated users. Also check if required indexes are built.");
     } else if (error instanceof Error && error.message.includes('requires an index')) {
         console.error("[getPartyDataForUser] FIREBASE INDEXING ERROR: The query requires an index. Check the Firebase console for a link to create it. Error:", error.message);
     }
    return { topParties: [], recentParties: [] }; 
  }
}

const AuthenticatedHomePageContent = ({ topParties, recentParties }: { topParties: TopPartyDisplayData[], recentParties: RecentPartyDisplayData[] }) => {
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
  const [dataLoading, setDataLoading] = useState(true); // For party data loading

  useEffect(() => {
    if (authLoading || !firebaseInitialized) {
      // Still waiting for auth or Firebase init
      return;
    }

    if (user) {
      setDataLoading(true);
      getPartyDataForUser(user.uid).then(data => {
        setPartyData(data);
        setDataLoading(false);
      }).catch(err => {
        console.error("Failed to load party data for authenticated user:", err);
        setPartyData({ topParties: [], recentParties: [] }); // Set empty on error
        setDataLoading(false);
      });
    } else {
      // User is not authenticated, no need to fetch party data as per requirement
      setPartyData(null); // Clear any existing data
      setDataLoading(false); // Not loading data for unauthenticated user
    }
  }, [user, authLoading, firebaseInitialized]);

  if (authLoading || (!firebaseInitialized && !authLoading) ) {
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
      {user && firebaseInitialized && (
        dataLoading ? (
          <div className="flex justify-center items-center min-h-[20rem]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Chargement des événements...</span>
          </div>
        ) : partyData ? (
          <AuthenticatedHomePageContent topParties={partyData.topParties} recentParties={partyData.recentParties} />
        ) : (
          <p className="text-center text-muted-foreground">Erreur lors du chargement des données des événements.</p>
        )
      )}
      {!user && firebaseInitialized && (
        <div className="container mx-auto px-4 text-center py-10">
          <p className="text-lg text-foreground">Bienvenue sur BaliseBoxd !</p>
          <p className="text-muted-foreground">Connectez-vous pour découvrir, noter et partager les meilleurs Events.</p>
        </div>
      )}
    </div>
  );
}
