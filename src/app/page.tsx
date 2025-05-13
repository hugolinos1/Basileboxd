// src/app/page.tsx
'use client'; 

import { HeroSection } from '@/components/home/HeroSection';
import { TopPartiesSection } from '@/components/home/TopPartiesSection';
import { RecentPartiesSection } from '@/components/home/RecentPartiesSection';
import { RecentlyCommentedPartiesSection } from '@/components/home/RecentlyCommentedPartiesSection'; // New import
import { AddPartySection } from '@/components/home/AddPartySection';
import { LandingInvitationSection } from '@/components/home/LandingInvitationSection';
import { Separator } from '@/components/ui/separator';
import { collection, getDocs, query, orderBy, limit, Timestamp, doc, getDoc as getFirestoreDoc, collectionGroup } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { calculatePartyAverageRating, PartyData as SharedPartyData, getDateFromTimestamp, CommentData as SharedCommentData } from '@/lib/party-utils';
import { useFirebase } from '@/context/FirebaseContext';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Extend PartyData to include id if not already present
type PartyData = SharedPartyData & { id: string };
type CommentData = SharedCommentData & { partyId: string };


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

// This type can be reused for both RecentPartiesSection and RecentlyCommentedPartiesSection
// if the data structure is consistent enough.
export interface RecentPartyDisplayData {
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
  latestCommentAt?: Date; // Optional: For sorting recently commented
  commentCount?: number; // Optional: To display comment count
}

// Fetcher function for all party data
async function getPartyData(): Promise<{ 
  topParties: TopPartyDisplayData[], 
  recentParties: RecentPartyDisplayData[],
  recentlyCommentedParties: RecentPartyDisplayData[] // Added new type
}> {
  if (!db) {
    console.error("[getPartyData] Firestore instance (db) is not available.");
    return { topParties: [], recentParties: [], recentlyCommentedParties: [] };
  }

  console.log(`[getPartyData] Starting data fetch.`);

  try {
    const partiesCollectionRef = collection(db, 'parties');
    
    const recentQuery = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(5)); // Limit to 5 recent parties
    const allPartiesQueryForRanking = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(50)); 
    // For recently commented, we'll fetch parties and then their latest comments
    const allPartiesQueryForComments = query(partiesCollectionRef, orderBy('createdAt', 'desc'), limit(30)); // Fetch a decent pool of recent parties


    const [recentSnapshot, allPartiesSnapshotForRanking, allPartiesSnapshotForComments] = await Promise.all([
        getDocs(recentQuery),
        getDocs(allPartiesQueryForRanking),
        getDocs(allPartiesQueryForComments)
    ]);
    console.log(`[getPartyData] Fetched ${allPartiesSnapshotForRanking.size} parties for ranking, ${recentSnapshot.size} for recent section, ${allPartiesSnapshotForComments.size} for comment processing.`);

    // --- TOP PARTIES ---
    const allPartiesDataForRanking: PartyData[] = allPartiesSnapshotForRanking.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartyData));
    const partiesWithAvgRating = allPartiesDataForRanking
      .map(party => ({ ...party, averageRating: calculatePartyAverageRating(party) }))
      .filter(party => true) 
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    
    const topParties: TopPartyDisplayData[] = partiesWithAvgRating.slice(0, 10).map((party, index) => ({
      id: party.id,
      name: party.name || 'Événement sans nom',
      imageUrl: party.coverPhotoUrl || undefined, 
      rating: party.averageRating || 0, 
      rank: index + 1,
    }));
    console.log(`[getPartyData] Created topParties array with ${topParties.length} items.`);

    // --- RECENT PARTIES ---
    const recentPartiesDataFromSnapshot: PartyData[] = recentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartyData));
    const recentPartiesPromises = recentPartiesDataFromSnapshot.map(async (party) => {
      const averageRating = calculatePartyAverageRating(party);
      const participantDetailsPromises = (party.participants || []).slice(0, 5).map(async (participantId) => {
        const userDocSnap = await getFirestoreDoc(doc(db, 'users', participantId));
        const userProfile = userDocSnap.exists() ? { id: userDocSnap.id, ...userDocSnap.data() } as UserProfile : null;
        return { id: participantId, avatarUrl: userProfile?.avatarUrl, email: userProfile?.email, displayName: userProfile?.displayName, pseudo: userProfile?.pseudo };
      });
      const participants = await Promise.all(participantDetailsPromises);
      return { id: party.id, name: party.name || 'Événement sans nom', imageUrl: party.coverPhotoUrl, rating: (averageRating || 0).toFixed(1), participants };
    });
    const recentParties = await Promise.all(recentPartiesPromises);
    console.log(`[getPartyData] Created recentParties array with ${recentParties.length} items`);

    // --- RECENTLY COMMENTED PARTIES ---
    const partiesForCommentProcessing: PartyData[] = allPartiesSnapshotForComments.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PartyData));
    let partiesWithLatestComment: (PartyData & { latestCommentAt: Date, commentCount: number })[] = [];

    for (const party of partiesForCommentProcessing) {
        const commentsQuery = query(collection(db, 'parties', party.id, 'comments'), orderBy('timestamp', 'desc'));
        const commentsSnapshot = await getDocs(commentsQuery);
        const commentCount = commentsSnapshot.size;

        if (!commentsSnapshot.empty) {
            const latestCommentData = commentsSnapshot.docs[0].data() as CommentData;
            const latestCommentDate = getDateFromTimestamp(latestCommentData.timestamp);
            if (latestCommentDate) {
                partiesWithLatestComment.push({ ...party, latestCommentAt: latestCommentDate, commentCount });
            }
        }
    }

    partiesWithLatestComment.sort((a, b) => b.latestCommentAt.getTime() - a.latestCommentAt.getTime());
    const topRecentlyCommentedPartiesData = partiesWithLatestComment.slice(0, 5); // Take top 5

    const recentlyCommentedPartiesPromises = topRecentlyCommentedPartiesData.map(async (party) => {
        const averageRating = calculatePartyAverageRating(party);
        const participantDetailsPromises = (party.participants || []).slice(0, 5).map(async (participantId) => {
            const userDocSnap = await getFirestoreDoc(doc(db, 'users', participantId));
            const userProfile = userDocSnap.exists() ? { id: userDocSnap.id, ...userDocSnap.data() } as UserProfile : null;
            return { id: participantId, avatarUrl: userProfile?.avatarUrl, email: userProfile?.email, displayName: userProfile?.displayName, pseudo: userProfile?.pseudo };
        });
        const participants = await Promise.all(participantDetailsPromises);
        return {
            id: party.id,
            name: party.name || 'Événement sans nom',
            imageUrl: party.coverPhotoUrl,
            rating: (averageRating || 0).toFixed(1),
            participants,
            latestCommentAt: party.latestCommentAt,
            commentCount: party.commentCount
        };
    });

    const recentlyCommentedParties = await Promise.all(recentlyCommentedPartiesPromises);
    console.log(`[getPartyData] Created recentlyCommentedParties array with ${recentlyCommentedParties.length} items`);

    return { topParties, recentParties, recentlyCommentedParties };

  } catch (error) {
    console.error("[getPartyData] Erreur MAJEURE lors de la récupération des données de fête:", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
         console.error("[getPartyData] ERREUR DE PERMISSION FIREBASE: Vérifiez les règles de sécurité Firestore pour la collection 'parties' et 'users'. Assurez-vous que les lectures sont autorisées. Vérifiez également si les index requis sont créés.");
     } else if (error instanceof Error && error.message.includes('requires an index')) {
         console.error("[getPartyData] ERREUR D'INDEXATION FIREBASE: La requête nécessite un index. Vérifiez la console Firebase pour un lien pour le créer. Erreur:", error.message);
     }
    return { topParties: [], recentParties: [], recentlyCommentedParties: [] }; 
  }
}

const AuthenticatedHomePageContent = ({ 
  topParties, 
  recentParties,
  recentlyCommentedParties // Added new prop
}: { 
  topParties: TopPartyDisplayData[], 
  recentParties: RecentPartyDisplayData[],
  recentlyCommentedParties: RecentPartyDisplayData[] // Added new prop type
}) => {
  if (topParties.length === 0 && recentParties.length === 0 && recentlyCommentedParties.length === 0) {
    return (
      <div className="container mx-auto px-4 text-center py-10">
        <p className="text-lg text-foreground">Aucun événement à afficher pour le moment.</p>
        <p className="text-muted-foreground mt-2">Soyez le premier à <a href="/events/create" className="text-primary hover:underline">créer un événement</a> !</p>
      </div>
    );
  }
  return (
    <>
      {topParties.length > 0 && <TopPartiesSection parties={topParties} />}
      <Separator className="my-8 md:my-12 bg-border/50" />
      {recentParties.length > 0 && <RecentPartiesSection parties={recentParties} />}
      <Separator className="my-8 md:my-12 bg-border/50" />
      {recentlyCommentedParties.length > 0 && <RecentlyCommentedPartiesSection parties={recentlyCommentedParties} />}
      <Separator className="my-8 md:my-12 bg-border/50" />
      <AddPartySection />
    </>
  );
};

export default function Home() {
  const { user, loading: authLoading, firebaseInitialized } = useFirebase();
  const [partyData, setPartyData] = useState<{ 
    topParties: TopPartyDisplayData[], 
    recentParties: RecentPartyDisplayData[],
    recentlyCommentedParties: RecentPartyDisplayData[] 
  } | null>(null);
  const [dataLoading, setDataLoading] = useState(true); 

  useEffect(() => {
    if (!firebaseInitialized) {
      setDataLoading(true); 
      return;
    }

    if (firebaseInitialized && user) {
      setDataLoading(true);
      getPartyData().then(data => { 
        setPartyData(data);
        setDataLoading(false);
      }).catch(err => {
        console.error("[Home useEffect] Failed to load party data:", err);
        setPartyData({ topParties: [], recentParties: [], recentlyCommentedParties: [] }); 
        setDataLoading(false);
      });
    } else if (firebaseInitialized && !user && !authLoading) {
      setDataLoading(false); 
      setPartyData(null);
    }
  }, [firebaseInitialized, user, authLoading]);

  if (authLoading || !firebaseInitialized) {
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
      {user ? (
        dataLoading ? (
          <div className="flex justify-center items-center min-h-[calc(100vh-25rem)]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Chargement des événements...</span>
          </div>
        ) : (
          partyData && (partyData.topParties.length > 0 || partyData.recentParties.length > 0 || partyData.recentlyCommentedParties.length > 0) ? (
            <AuthenticatedHomePageContent 
              topParties={partyData.topParties} 
              recentParties={partyData.recentParties}
              recentlyCommentedParties={partyData.recentlyCommentedParties} 
            />
          ) : (
            <div className="container mx-auto px-4 text-center py-10">
              <p className="text-lg text-foreground">Aucun événement à afficher pour le moment.</p>
              <p className="text-muted-foreground mt-2">Soyez le premier à <a href="/events/create" className="text-primary hover:underline">créer un événement</a> !</p>
            </div>
          )
        )
      ) : (
        <LandingInvitationSection />
      )}
    </div>
  );
}

