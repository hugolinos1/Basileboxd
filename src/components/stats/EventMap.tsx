// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMap } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils';
import { MapPin, Loader2 } from 'lucide-react';

// Leaflet default icon fix
if (typeof window !== 'undefined') {
  if ((L.Icon.Default.prototype as any)._getIconUrl) {
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

const normalizeCityNameForAPI = (cityName: string): string => {
  // Convert to lowercase, remove diacritics, and keep only alphanumeric, spaces, and hyphens.
  // This helps with characters like "𝗟𝗮𝗻𝗱𝗲𝘃𝗲𝗻𝗻𝗲𝗰" which are not standard.
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

  const originalCityName = cityName.trim(); // Keep for logging
  const normalizedQueryCity = normalizeCityNameForAPI(originalCityName); // Normalize for API query

  if (!normalizedQueryCity) {
    console.warn(`[getCoordinates] Nom de ville normalisé est vide pour l'original: ${originalCityName}`);
    return null;
  }

  // Use 'q' parameter for general queries, which can be more robust than 'city='
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedQueryCity)}&format=json&limit=1&addressdetails=1`;
  console.log(`[getCoordinates] Tentative de géocodage pour : "${originalCityName}" (normalisé pour API: "${normalizedQueryCity}"). URL de l'API : ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@example.com)', // Good practice
        'Accept-Language': 'fr,en;q=0.9' // Prefer French results
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
      console.error(`[getCoordinates] Erreur API Nominatim: ${response.status} pour la ville: ${originalCityName} (normalisé: ${normalizedQueryCity}). URL: ${apiUrl}. Détails: ${errorText}`);
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error(`[getCoordinates] Erreur de parsing JSON pour la ville: ${originalCityName} (normalisé: ${normalizedQueryCity}). URL: ${apiUrl}. Erreur:`, jsonError);
      const rawResponse = await response.text().catch(() => "Impossible de lire la réponse brute après l'erreur JSON");
      console.log(`[getCoordinates] Réponse brute de l'API pour ${normalizedQueryCity}:`, rawResponse);
      return null;
    }

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log(`[getCoordinates] Coordonnées trouvées pour ${originalCityName} (via ${normalizedQueryCity}): [${lat}, ${lon}]`);
        return [lat, lon];
      } else {
        console.warn(`[getCoordinates] Coordonnées invalides (NaN) pour ${originalCityName} (via ${normalizedQueryCity}). Lat: ${data[0].lat}, Lon: ${data[0].lon}.`);
      }
    }
    console.warn(`[getCoordinates] Aucune coordonnée trouvée ou structure de réponse inattendue pour la ville: ${originalCityName} (via ${normalizedQueryCity}). Réponse API:`, data);
    return null;
  } catch (error) {
    console.error(`[getCoordinates] Erreur inattendue lors du géocodage pour la ville: ${originalCityName} (via ${normalizedQueryCity}). URL: ${apiUrl}`, error);
    return null;
  }
};

const DynamicMapUpdater = ({ parties }: { parties: MappedParty[] }) => {
  const map = useMap();
  useEffect(() => {
    const validMarkers = parties.filter(p => p.coordinates !== null);
    if (validMarkers.length > 0 && map) {
      const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } else if (validMarkers.length === 1 && validMarkers[0].coordinates) {
        map.setView(validMarkers[0].coordinates, 10);
      }
    } else if (map && validMarkers.length === 0) { // Only set default view if no markers
      map.setView([46.2276, 2.2137], 5); // Vue par défaut (France)
    }
  }, [parties, map]);
  return null;
};

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !parties || !mapRef.current) {
      setIsLoading(false);
      return;
    }

    const processParties = async () => {
      setIsLoading(true);
      console.log("[EventMap] Traitement des fêtes pour le géocodage:", parties.length);
      const processedParties = await Promise.all(
        parties
          .filter(party => typeof party.location === 'string' && party.location.trim() !== '') // Filter out parties with no/invalid location
          .map(async (party) => {
            const locationString = party.location as string; // We've already checked it's a string
            const coords = await getCoordinates(locationString);
            return { ...party, coordinates: coords };
          })
      );
      setMappedParties(processedParties);
      setIsLoading(false);
      console.log("[EventMap] Géocodage terminé. Fêtes mappées avec des emplacements valides:", processedParties.filter(p => p.coordinates).length);
    };

    processParties();

    // Cleanup function for the map instance
    return () => {
      if (mapInstance) {
        console.log("[EventMap] Nettoyage de l'instance de la carte.");
        mapInstance.remove();
        setMapInstance(null);
      }
    };
  }, [parties, isClient, mapInstance]); // mapInstance added to dependencies

  if (!isClient) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Chargement de la carte...</div>;
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Géocodage des localisations en cours...</div>;
  }
  
  const validMarkers = mappedParties.filter(p => p.coordinates !== null);

  if (validMarkers.length === 0 && !isLoading) {
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

  // Calculate initial center and zoom based on valid markers if available
  if (validMarkers.length > 0) {
    if (validMarkers.length === 1 && validMarkers[0].coordinates) {
      initialCenter = validMarkers[0].coordinates;
      initialZoom = 10;
    } else {
      // Create bounds from all valid markers
      const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
      if (bounds.isValid()) {
        initialCenter = bounds.getCenter();
        // initialZoom can be dynamically set by fitBounds in DynamicMapUpdater
        // For MapContainer itself, we might set a broader default if fitBounds handles specifics
        initialZoom = 6; 
      }
    }
  }
  
  // Key for MapContainer to help with re-initialization issues if absolutely necessary,
  // but preferred approach is to manage map instance state.
  const mapKey = `event-map-${parties.length}-${validMarkers.length}`;

  return (
    <div ref={mapRef} className="h-full w-full">
      {isClient && ( 
        <MapContainer
          key={mapKey} // Using a key that changes when the underlying data might significantly change
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          className="leaflet-container" 
          style={{ height: '100%', width: '100%' }}
          whenCreated={setMapInstance} // Store the map instance
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