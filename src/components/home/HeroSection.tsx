// src/components/home/HeroSection.tsx
'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_HERO_IMAGE_URL = "https://i.ibb.co/NnTT13h0/Snapchat-1715506731.jpg";

export function HeroSection() {
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(true);

  useEffect(() => {
    const fetchHeroImageUrl = async () => {
      if (!db) {
        console.warn("Firestore DB instance is not available in HeroSection.");
        setHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
        setLoadingImage(false);
        return;
      }
      try {
        const heroSettingsDocRef = doc(db, 'siteConfiguration', 'heroSettings');
        const docSnap = await getDoc(heroSettingsDocRef);
        if (docSnap.exists() && docSnap.data()?.heroImageUrl) {
          setHeroImageUrl(docSnap.data().heroImageUrl);
        } else {
          console.log("Hero image URL not found in Firestore, using default.");
          setHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
        }
      } catch (error) {
        console.error("Error fetching hero image URL:", error);
        setHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
      } finally {
        setLoadingImage(false);
      }
    };

    fetchHeroImageUrl();
  }, []);

  const currentImage = heroImageUrl || DEFAULT_HERO_IMAGE_URL;

  return (
    <div className="relative h-96 md:h-[500px] lg:h-[600px] w-full">
      {loadingImage ? (
        <Skeleton className="absolute inset-0 z-0 w-full h-full bg-muted" />
      ) : (
        <Image
          src={currentImage}
          alt="Groupe de jeunes s'amusant à une fête ou un concert"
          fill
          style={{ objectFit: 'cover' }}
          quality={85}
          priority
          className="absolute inset-0 z-0"
          data-ai-hint="fête jeunes concert"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1600px"
          onError={() => {
            console.warn(`Error loading hero image: ${currentImage}. Falling back to default.`);
            setHeroImageUrl(DEFAULT_HERO_IMAGE_URL);
          }}
          unoptimized={currentImage.includes('i.ibb.co') || currentImage.includes('localhost') || !currentImage.startsWith('https')}
        />
      )}

      <div className="absolute inset-0 hero-gradient z-10" />

      <div className="relative z-20 container mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-12 md:pb-20 lg:pb-28">
        <div className="max-w-lg">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-primary mb-4 shadow-lg">
              BaliseBoxd
            </h1>
            <p className="text-base md:text-lg text-gray-200 mb-6 shadow-md">
              Le QG des délires que t’as (presque) oubliés
            </p>
            <div className="flex flex-col space-y-3">
              <Link href="/events/create" passHref>
                <Button variant="default" size="lg" className="bg-white text-black hover:bg-gray-200 w-full sm:w-auto">
                  <PlusCircle className="mr-2 h-5 w-5 fill-primary" />
                  Créer un Event
                </Button>
              </Link>
              <p className="text-xs md:text-sm text-gray-300 shadow-md max-w-xs sm:max-w-sm mx-auto sm:mx-0 text-center sm:text-left">
                Tu peux créer tes Events, laisser des souvenirs et noter tous les Events et réagir en commentaires.
              </p>
            </div>
        </div>
      </div>
    </div>
  );
}