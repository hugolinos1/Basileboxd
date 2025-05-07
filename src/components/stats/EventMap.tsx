// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
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

const getCoordinates = async (cityName: string | undefined): Promise<LatLngTuple | null> => {
  if (!cityName || typeof cityName !== 'string' || cityName.trim() === '') {
    console.warn(`[getCoordinates] Invalid or empty city name provided: ${cityName}`);
    return null;
  }

  const normalizedCity = cityName.trim();

  try {
    console.log(`[getCoordinates] Fetching coordinates for city: ${normalizedCity}`);
    // Using a more structured query with city and country for better accuracy if possible, though country is not available directly here.
    // For simplicity, keeping it to city. Add `&country=France` if all events are in France.
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedCity)}&limit=1&addressdetails=1`);
    
    if (!response.ok) {
      // Log the response text for more details on the error
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
      console.error(`Erreur API Nominatim: ${response.status} pour la ville: ${cityName} (normalisé: ${normalizedCity}). Détails: ${errorText}`);
      return null;
    }
    const data = await response.json();

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log(`[getCoordinates] Coordinates found for ${normalizedCity}: [${lat}, ${lon}]`);
        return [lat, lon];
      }
    }
    console.warn(`[getCoordinates] Aucune coordonnée trouvée pour la ville: ${cityName} (normalisé: ${normalizedCity}). Réponse API:`, data);
    return null;
  } catch (error) {
    console.error(`[getCoordinates] Erreur lors du géocodage pour la ville: ${cityName} (normalisé: ${normalizedCity})`, error);
    return null;
  }
};

const DynamicMapUpdater = ({ partiesWithCoords }: { partiesWithCoords: MappedParty[] }) => {
  const map = useMap();
  useEffect(() => {
    const validMarkers = partiesWithCoords.filter(p => p.coordinates !== null);
    if (validMarkers.length > 0 && map) {
      const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } else if (validMarkers.length === 1 && validMarkers[0].coordinates) {
        map.setView(validMarkers[0].coordinates, 10);
      }
    } else if (map) {
      // Default view if no valid markers or map instance exists
      map.setView([46.2276, 2.2137], 5); // Default view (France)
    }
  }, [partiesWithCoords, map]); // Rerun when partiesWithCoords or map instance changes
  return null;
};


export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const mapKeyRef = useRef(0); // Used to force remount of MapContainer if needed

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  useEffect(() => {
    if (!isClient || !parties) {
      setIsLoading(false);
      return;
    }

    const processParties = async () => {
      setIsLoading(true);
      console.log("[EventMap] Processing parties for geocoding:", parties.length);
      const processedParties = await Promise.all(
        parties.map(async (party) => {
          const locationString = typeof party.location === 'string' ? party.location : undefined;
          const coords = await getCoordinates(locationString);
          return { ...party, coordinates: coords };
        })
      );
      setMappedParties(processedParties);
      setIsLoading(false);
      mapKeyRef.current += 1; // Increment key to ensure map re-renders with new data if necessary
      console.log("[EventMap] Geocoding complete. Mapped parties with valid locations:", processedParties.filter(p => p.coordinates).length);
    };

    processParties();
  }, [parties, isClient]); // Rerun if parties or isClient status changes


  if (!isClient) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Chargement de la carte...</div>;
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 mr-2 animate-spin" />Géocodage des localisations en cours...</div>;
  }
  
  const validMarkers = mappedParties.filter(p => p.coordinates !== null);

  if (validMarkers.length === 0 && !isLoading) { // Added !isLoading check
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

  // This initial logic might be less effective if DynamicMapUpdater handles it well.
  // Keeping it for a sensible first render.
  if (validMarkers.length > 0 && validMarkers[0].coordinates) {
    initialCenter = validMarkers[0].coordinates;
    initialZoom = validMarkers.length === 1 ? 10 : 6; 
  }
  
  // Use a unique key for MapContainer to ensure it re-initializes if critical props change or for forced refresh.
  // Using mapKeyRef.current ensures it changes only when geocoding is complete.
  return (
    <div className="h-full w-full">
      <MapContainer
        key={`event-map-${mapKeyRef.current}`} 
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="leaflet-container"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &amp; <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">Nominatim</a>'
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
        <DynamicMapUpdater partiesWithCoords={validMarkers} />
      </MapContainer>
    </div>
  );
}
