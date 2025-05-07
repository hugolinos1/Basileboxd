// src/components/stats/EventMap.tsx
'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils';
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';

// Fix for default Leaflet icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface EventMapProps {
  parties: PartyData[];
}

interface MappedParty extends PartyData {
  coordinates: LatLngTuple | null;
}

// Simple geocoding placeholder / parser
// In a real app, use a proper geocoding service like Nominatim or Google Geocoding API
const getCoordinates = async (location: string | undefined): Promise<LatLngTuple | null> => {
  if (!location) return null;

  // Check if location string is already "lat,lng"
  const latLngMatch = location.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (latLngMatch) {
    return [parseFloat(latLngMatch[1]), parseFloat(latLngMatch[2])];
  }

  // Placeholder: Very basic "geocoding" for known locations (example only)
  // For a real app, you'd call an API here.
  // console.warn(`Geocoding needed for: "${location}". Using placeholder or default.`);
  // Example: if (location.toLowerCase().includes('villefranche')) return [45.9833, 4.7167];

  // Fallback - consider a default or null if no match
  return null; // Or a default like [46.2276, 2.2137] for France center
};

const MapUpdater = ({ parties }: { parties: MappedParty[] }) => {
  const map = useMap();
  useEffect(() => {
    const validMarkers = parties.filter(p => p.coordinates !== null);
    if (validMarkers.length > 0) {
      const bounds = L.latLngBounds(validMarkers.map(p => p.coordinates as LatLngTuple));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      } else if (validMarkers.length === 1 && validMarkers[0].coordinates) {
         map.setView(validMarkers[0].coordinates, 10); // Zoom to single marker
      }
    } else {
      map.setView([46.2276, 2.2137], 5); // Default view (France)
    }
  }, [parties, map]);
  return null;
};

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const processParties = async () => {
      setIsLoading(true);
      const processed = await Promise.all(
        parties.map(async (party) => {
          const coords = await getCoordinates(party.location);
          return { ...party, coordinates: coords };
        })
      );
      setMappedParties(processed);
      setIsLoading(false);
    };
    processParties();
  }, [parties]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><MapPin className="h-12 w-12 mr-2 animate-pulse" />Chargement de la carte...</div>;
  }
  
  const validMarkers = mappedParties.filter(p => p.coordinates !== null);

  if (validMarkers.length === 0 && !isLoading) {
     return (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Aucune localisation d'événement disponible</p>
            <p className="text-sm">Ajoutez des lieux à vos événements pour les voir sur la carte.</p>
        </div>
    );
  }

  // Determine a sensible initial center and zoom
  let initialCenter: LatLngExpression = [46.2276, 2.2137]; // Default to France
  let initialZoom = 5;

  if (validMarkers.length > 0 && validMarkers[0].coordinates) {
    initialCenter = validMarkers[0].coordinates;
    initialZoom = validMarkers.length === 1 ? 10 : 5; // Zoom in more if only one marker
  }


  return (
    <MapContainer center={initialCenter} zoom={initialZoom} scrollWheelZoom={true} className="leaflet-container">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {validMarkers.map((party) =>
        party.coordinates ? (
          <Marker key={party.id} position={party.coordinates}>
            <Popup>
              <div className="font-semibold">{party.name}</div>
              {party.location}
            </Popup>
          </Marker>
        ) : null
      )}
      <MapUpdater parties={validMarkers} />
    </MapContainer>
  );
}
