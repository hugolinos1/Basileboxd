// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
// Ensure leaflet.css is imported if not globally done in globals.css or layout
// import 'leaflet/dist/leaflet.css'; 
import type { PartyData } from '@/lib/party-utils';
import { MapPin, Loader2 } from 'lucide-react';
import { normalizeCityName } from '@/lib/party-utils';

// Leaflet default icon fix
if (typeof window !== 'undefined') {
  if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
    const LDefaultIcon = L.Icon.Default.prototype as any;
    if (LDefaultIcon._getIconUrl) {
      delete LDefaultIcon._getIconUrl;
    }
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }
}


interface MappedParty extends PartyData {
  coordinates: LatLngTuple;
}

interface EventMapProps {
  parties: PartyData[];
}

const getCoordinates = async (cityName: string | undefined): Promise<LatLngTuple | null> => {
  if (!cityName || typeof cityName !== 'string' || cityName.trim() === '') {
    console.warn(`[getCoordinates] Nom de ville invalide ou vide fourni: ${cityName}`);
    return null;
  }
  const originalCityName = cityName.trim();
  const normalizedCity = normalizeCityName(originalCityName);

  if (!normalizedCity) {
    console.warn(`[getCoordinates] Le nom de ville normalisé est vide pour l'original : ${originalCityName}`);
    return null;
  }
  
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  console.log(`[getCoordinates] Tentative de géocodage pour : "${originalCityName}" (normalisé: "${normalizedCity}"). URL de l'API: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)', 
        'Accept-Language': 'fr,en;q=0.9'
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
      console.error(`[getCoordinates] Erreur API Nominatim: ${response.status} pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}. Détails: ${errorText}`);
      return null;
    }
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error(`[getCoordinates] Erreur de parsing JSON pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}. Erreur:`, jsonError);
      const rawResponse = await response.text().catch(() => "Impossible de lire la réponse brute après l'erreur JSON");
      console.log(`[getCoordinates] Réponse brute de l'API pour ${normalizedCity}:`, rawResponse);
      return null;
    }

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log(`[getCoordinates] Coordonnées trouvées pour ${originalCityName} (via ${normalizedCity}): [${lat}, ${lon}]`);
        return [lat, lon];
      } else {
         console.warn(`[getCoordinates] Coordonnées invalides (NaN) pour ${originalCityName} (via ${normalizedCity}). Lat: ${data[0].lat}, Lon: ${data[0].lon}.`);
      }
    }
    console.warn(`[getCoordinates] Aucune coordonnée trouvée ou structure de réponse inattendue pour la ville: ${originalCityName} (via ${normalizedCity}). Réponse API:`, data);
    return null;
  } catch (error) {
    console.error(`[getCoordinates] Erreur inattendue lors du géocodage pour la ville: ${originalCityName} (via ${normalizedCity}). URL: ${apiUrl}`, error);
    return null;
  }
};


export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoadingGeocoding, setIsLoadingGeocoding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const MAP_CONTAINER_ID = "event-map-leaflet-instance"; // Unique ID for the map div

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || parties.length === 0) {
      setIsLoadingGeocoding(false);
      return;
    }

    const processParties = async () => {
      console.log("[EventMap processParties] Début du traitement des événements pour la carte.");
      setIsLoadingGeocoding(true);
      setError(null);
      const partiesWithCoords: MappedParty[] = [];
      
      for (const party of parties) {
        if (party.latitude && party.longitude && !isNaN(party.latitude) && !isNaN(party.longitude)) {
          partiesWithCoords.push({ ...party, coordinates: [party.latitude, party.longitude] });
        } else if (party.location) {
          const coords = await getCoordinates(party.location);
          if (coords) {
            partiesWithCoords.push({ ...party, coordinates: coords });
          } else {
            console.warn(`[EventMap processParties] Impossible de géocoder la ville: ${party.location} pour l'événement ${party.name}`);
          }
        } else {
          console.warn(`[EventMap processParties] Événement ${party.name} (ID: ${party.id}) n'a ni coordonnées ni lieu défini.`);
        }
      }
      
      console.log("[EventMap processParties] Événements traités avec coordonnées:", partiesWithCoords.length);
      setMappedParties(partiesWithCoords);
      if (partiesWithCoords.length === 0 && parties.length > 0) {
        setError("Aucune coordonnée n'a pu être déterminée pour les événements.");
      }
      setIsLoadingGeocoding(false);
    };

    processParties();
  }, [isClient, parties]);

  useEffect(() => {
    if (!isClient || !mapContainerRef.current || isLoadingGeocoding) {
      return;
    }

    // Clean up existing map instance if any
    if (mapRef.current) {
      console.log("[EventMap useEffect map init] Suppression de l'instance de carte existante.");
      mapRef.current.remove();
      mapRef.current = null;
    }
    // Ensure _leaflet_id is cleared if Leaflet somehow attached it to the raw DOM element
    if ((mapContainerRef.current as any)._leaflet_id) {
        console.log("[EventMap useEffect map init] Nettoyage de _leaflet_id du conteneur.");
        (mapContainerRef.current as any)._leaflet_id = null;
    }

    if (mappedParties.length > 0) {
        console.log("[EventMap useEffect map init] Initialisation de la nouvelle carte Leaflet.");
        // Ensure the container is empty before initializing a new map
        // This might be redundant if mapRef.current.remove() cleans up the DOM, but good as a safeguard.
        mapContainerRef.current.innerHTML = ''; 

        mapRef.current = L.map(mapContainerRef.current).setView([46.2276, 2.2137], 5); // Default view

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18,
        }).addTo(mapRef.current);

        mappedParties.forEach(party => {
            L.marker(party.coordinates).addTo(mapRef.current!)
                .bindPopup(`<b>${party.name}</b><br>${party.location || 'Lieu non spécifié'}<br><a href="/party/${party.id}" target="_blank" rel="noopener noreferrer" style="color: hsl(var(--primary));">Voir l'événement</a>`);
        });

        if (mapRef.current) {
            try {
                const bounds = L.latLngBounds(mappedParties.map(p => p.coordinates));
                if (bounds.isValid()) {
                    mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
                } else if (mappedParties.length === 1) {
                    mapRef.current.setView(mappedParties[0].coordinates, 10);
                }
            } catch (boundsError) {
                console.error("[EventMap useEffect map init] Erreur lors de l'ajustement des limites de la carte:", boundsError);
            }
        }
    } else if (parties.length > 0 && !error) {
         console.log("[EventMap useEffect map init] Des événements existent mais aucun n'a pu être géocodé.");
    } else {
         console.log("[EventMap useEffect map init] Aucune partie à afficher ou une erreur s'est produite.");
    }

    // Cleanup function
    return () => {
      if (mapRef.current) {
        console.log("[EventMap useEffect map cleanup] Suppression de l'instance de carte lors du démontage.");
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // Dependencies: re-run if isClient changes, or if the successfully geocoded parties change,
  // or if loading/error states change which might affect whether the map should be rendered.
  }, [isClient, mappedParties, isLoadingGeocoding, error, parties.length]); 


  if (!isClient || isLoadingGeocoding) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        {isLoadingGeocoding ? "Géocodage des localisations..." : "Chargement de la carte..."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-destructive p-4 bg-destructive/10 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Erreur de carte</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }
  
  if (mappedParties.length === 0 && parties.length > 0 && !isLoadingGeocoding && !error) { 
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

   if (mappedParties.length === 0 && parties.length === 0 && !isLoadingGeocoding && !error) {
     return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucun événement à afficher sur la carte.</p>
      </div>
    );
   }

  return (
    // This div will be the container for the Leaflet map
    <div ref={mapContainerRef} id={MAP_CONTAINER_ID} className="h-full w-full leaflet-container">
      {/* Leaflet map will be initialized here by useEffect */}
    </div>
  );
}
