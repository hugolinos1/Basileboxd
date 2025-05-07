// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils';
import { MapPin, Loader2 } from 'lucide-react';

// Leaflet default icon fix
if (typeof window !== 'undefined') {
  if (L.Icon.Default.prototype && (L.Icon.Default.prototype as any)._getIconUrl) {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
  }
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

interface EventMapProps {
  parties: PartyData[];
}

interface MappedParty extends PartyData {
  coordinates: LatLngTuple | null;
}

// --- City Normalization Helper (Client-side) ---
const normalizeCityName = (cityName: string): string => {
  if (!cityName || typeof cityName !== 'string') return '';
  return cityName
    .toLowerCase()
    .normalize("NFD") // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric (except space/hyphen)
    .trim();
};


const getCoordinates = async (cityName: string | undefined): Promise<LatLngTuple | null> => {
  if (!cityName || typeof cityName !== 'string' || cityName.trim() === '') {
    console.warn(`[getCoordinates] Nom de ville invalide ou vide fourni: ${cityName}`);
    return null;
  }

  const originalCityName = cityName.trim();
  const normalizedCity = normalizeCityName(originalCityName);

  if (!normalizedCity) {
    console.warn(`[getCoordinates] Nom de ville normalisé est vide pour l'original: ${originalCityName}`);
    return null;
  }

  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  console.log(`[getCoordinates] Tentative de géocodage pour : "${originalCityName}" (normalisé: "${normalizedCity}"). URL de l'API : ${apiUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`[getCoordinates] Timeout for city: ${originalCityName}`);
    controller.abort();
  }, 10000); // 10-second timeout

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)',
        'Accept-Language': 'fr,en;q=0.9'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId); // Clear the timeout if fetch completes

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
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`[getCoordinates] Requête de géocodage pour "${originalCityName}" a expiré. URL: ${apiUrl}`);
    } else {
      console.error(`[getCoordinates] Erreur inattendue lors du géocodage pour la ville: ${originalCityName} (via ${normalizedCity}). URL: ${apiUrl}`, error);
    }
    return null;
  }
};


const DynamicMapUpdater = ({ parties }: { parties: MappedParty[] }) => {
  const map = useMap();
  useEffect(() => {
    const validMarkers = parties.filter(p => p.coordinates !== null);
    if (validMarkers.length > 0 && map) {
      try {
        const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (validMarkers.length === 1 && validMarkers[0].coordinates) {
          map.setView(validMarkers[0].coordinates, 10);
        }
      } catch (e) {
        console.error("[DynamicMapUpdater] Error fitting bounds:", e);
      }
    } else if (map && validMarkers.length === 0) {
      map.setView([46.2276, 2.2137], 5);
    }
  }, [parties, map]);
  return null;
};

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const processParties = async () => {
      console.log("[EventMap] processParties: Démarrage...");
      setIsLoading(true);
      setError(null);
      try {
        console.log("[EventMap] processParties: Traitement d'un tableau de fêtes de longueur:", parties.length);
        const partiesToGeocode = parties.filter(party => typeof party.location === 'string' && party.location.trim() !== '');
        console.log("[EventMap] processParties: Nombre de fêtes à géocoder:", partiesToGeocode.length);

        const processedPartiesPromises = partiesToGeocode.map(async (party, index) => {
          try {
            console.log(`[EventMap] processParties: Géocodage de la fête ${index + 1}/${partiesToGeocode.length}: ${party.name} à ${party.location}`);
            const locationString = party.location as string;
            const coords = await getCoordinates(locationString);
            console.log(`[EventMap] processParties: Fête géocodée ${index + 1} - Coords:`, coords);
            return { ...party, coordinates: coords };
          } catch (mapError) {
            console.error(`[EventMap] processParties: Erreur lors du géocodage de la fête ${party.name} (${party.id}):`, mapError);
            return { ...party, coordinates: null }; 
          }
        });
        
        console.log("[EventMap] processParties: En attente de toutes les promesses de géocodage...");
        const resolvedProcessedParties = await Promise.all(processedPartiesPromises);
        console.log("[EventMap] processParties: Toutes les promesses de géocodage résolues.");
        setMappedParties(resolvedProcessedParties);
      } catch (e: any) {
        console.error("[EventMap] Erreur lors du traitement des fêtes pour la carte:", e);
        setError("Impossible de charger les données de localisation des événements. " + e.message);
      } finally {
        console.log("[EventMap] processParties: isLoading défini sur false.");
        setIsLoading(false);
      }
    };

    if (parties && parties.length > 0) {
      processParties();
    } else {
      console.log("[EventMap] processParties: Aucune fête à traiter ou tableau de fêtes vide.");
      setIsLoading(false); // Ensure loading is false if no parties
    }
    
    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      console.log("[EventMap] Cleanup: Exécution de la fonction de nettoyage de useEffect.");
      const currentMapRef = mapRef.current;
      if (currentMapRef) {
        console.log("[EventMap] Cleanup: Suppression de l'instance de carte Leaflet existante.");
        currentMapRef.remove();
        mapRef.current = null;
      }
      const currentMapContainerRef = mapContainerRef.current;
      if (currentMapContainerRef && (currentMapContainerRef as any)._leaflet_id) {
        console.log("[EventMap] Cleanup: Effacement de _leaflet_id pour le conteneur de carte.");
        (currentMapContainerRef as any)._leaflet_id = null;
      }
    };
  }, [parties, isClient]);


  if (!isClient) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Chargement de la carte...</div>;
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Géocodage des localisations...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-destructive p-4">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Erreur de chargement de la carte</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const validMarkers = mappedParties.filter(p => p.coordinates !== null);

  if (validMarkers.length === 0 && !isLoading) { // Check !isLoading too
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; 
  let initialZoom = 5;

  if (validMarkers.length > 0) {
    if (validMarkers.length === 1 && validMarkers[0].coordinates) {
      initialCenter = validMarkers[0].coordinates;
      initialZoom = 10;
    }
    // DynamicMapUpdater will handle fitting bounds for multiple markers
  }
  
  return (
    <div ref={mapContainerRef} className="h-full w-full" key={isClient ? "map-client-container" : "map-server-container-placeholder"}>
      {isClient && ( 
        <MapContainer
          whenCreated={instance => { mapRef.current = instance; }}
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          className="leaflet-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &amp; <a href="https://nominatim.org/">Nominatim</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {validMarkers.map((party) =>
            party.coordinates ? (
              <Marker key={party.id} position={party.coordinates}>
                <Popup>
                  <div className="font-semibold text-sm">{party.name}</div>
                  <div className="text-xs">{party.location}</div>
                  <a href={`/party/${party.id}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline mt-1 block">
                    Voir l'événement
                  </a>
                </Popup>
              </Marker>
            ) : null
          )}
          <DynamicMapUpdater parties={mappedParties} />
        </MapContainer>
      )}
    </div>
  );
}
