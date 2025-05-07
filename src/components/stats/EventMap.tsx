// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils'; // Ensure this path is correct
import { MapPin, Loader2 } from 'lucide-react';

// Leaflet default icon fix
if (typeof window !== 'undefined') {
  // Check if the prototype and _getIconUrl exist before deleting
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
const normalizeCityNameClient = (cityName: string): string => {
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
  const normalizedCity = normalizeCityNameClient(originalCityName); // Use client-side normalization for consistency

  if (!normalizedCity) {
    console.warn(`[getCoordinates] Nom de ville normalisé est vide pour l'original: ${originalCityName}`);
    return null;
  }

  // Use 'q' parameter for general queries, which can be more robust than 'city='
  // Add addressdetails=1 to get more structured address info if needed later
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  console.log(`[getCoordinates] Tentative de géocodage pour : "${originalCityName}" (normalisé: "${normalizedCity}"). URL de l'API : ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)', // Good practice to set a User-Agent
        'Accept-Language': 'fr,en;q=0.9' // Prefer French results if available
      }
    });
    
    if (!response.ok) {
      // Log the response text for more details on the error
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


const DynamicMapUpdater = ({ parties }: { parties: MappedParty[] }) => { // Changed prop name to parties for clarity
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
    } else if (map && validMarkers.length === 0) { // Default view if no markers
      map.setView([46.2276, 2.2137], 5); // Center of France
    }
  }, [parties, map]); // Re-run if parties or map instance changes
  return null;
};

const MAP_CONTAINER_ID = "event-map-dynamic-container";

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapInstanceRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerDomRef = useRef<HTMLDivElement | null>(null); // Ref for the DOM element that will contain the map


  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !mapContainerDomRef.current) return; // Ensure container is also ready

    // Attempt to fix the "Map container is already initialized" error
    // by clearing Leaflet's internal ID if the container was previously used.
    if (mapContainerDomRef.current && (mapContainerDomRef.current as any)._leaflet_id) {
      console.log(`[EventMap] Container #${MAP_CONTAINER_ID} was already initialized. Clearing _leaflet_id.`);
      (mapContainerDomRef.current as any)._leaflet_id = null;
    }

    const processParties = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const processedParties = await Promise.all(
          parties
            .filter(party => typeof party.location === 'string' && party.location.trim() !== '')
            .map(async (party) => {
              const locationString = party.location as string;
              const coords = await getCoordinates(locationString);
              return { ...party, coordinates: coords };
            })
        );
        setMappedParties(processedParties);
      } catch (e: any) {
        console.error("[EventMap] Erreur lors du traitement des fêtes pour la carte:", e);
        setError("Impossible de charger les données de localisation des événements. " + e.message);
      } finally {
        setIsLoading(false);
      }
    };

    processParties();

    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      if (mapInstanceRef.current) {
        console.log("[EventMap] Nettoyage de l'instance de carte Leaflet existante.");
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
       // It's also good practice to ensure the DOM element itself is cleaned up if _leaflet_id was set.
      if (mapContainerDomRef.current && (mapContainerDomRef.current as any)._leaflet_id) {
        (mapContainerDomRef.current as any)._leaflet_id = null;
      }
    };
  }, [parties, isClient]); // Re-run if parties or isClient changes


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

  if (validMarkers.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; // Default to center of France
  let initialZoom = 5;

  if (validMarkers.length > 0) {
    if (validMarkers.length === 1 && validMarkers[0].coordinates) {
      initialCenter = validMarkers[0].coordinates;
      initialZoom = 10;
    } else {
      const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
      if (bounds.isValid()) {
        initialCenter = bounds.getCenter();
        // Determine zoom level based on bounds (Leaflet does this automatically with fitBounds)
        // initialZoom = map.getBoundsZoom(bounds); // This would need map instance
        initialZoom = 6; // Or a sensible default after bounds are set
      }
    }
  }
  
  // Key the outer div on `isClient` to ensure it's fresh when client-side rendering begins.
  return (
    <div 
      id={MAP_CONTAINER_ID} // Use the ID for the manual _leaflet_id cleanup
      ref={mapContainerDomRef} // Attach the ref to the div
      className="h-full w-full" 
      key={isClient ? "map-client-container-ready" : "map-server-container-placeholder"}
    >
      {/* MapContainer itself should not need a frequently changing key if its parent handles the mounting correctly. */}
      <MapContainer
        whenCreated={instance => { mapInstanceRef.current = instance; }}
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="leaflet-container" // Ensure this class provides height: 100% via CSS
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
    </div>
  );
}
