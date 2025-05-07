// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef, memo } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils'; // Assuming PartyData includes latitude and longitude
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

interface MapRendererAndMarkersProps {
  partiesWithCoords: PartyData[];
  initialCenter: LatLngExpression;
  initialZoom: number;
}

// Memoized component to render the map and markers.
// This will only re-render if its props change.
const MapRendererAndMarkers = memo(({ partiesWithCoords, initialCenter, initialZoom }: MapRendererAndMarkersProps) => {
  const map = useMap();

  useEffect(() => {
    if (partiesWithCoords.length > 0 && map) {
      try {
        const bounds = L.latLngBounds(partiesWithCoords.map(p => [p.latitude!, p.longitude!] as LatLngTuple));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (partiesWithCoords.length === 1 && partiesWithCoords[0].latitude != null && partiesWithCoords[0].longitude != null) {
          map.setView([partiesWithCoords[0].latitude!, partiesWithCoords[0].longitude!], 10);
        }
      } catch (e) {
        console.error("[MapRendererAndMarkers] Error fitting bounds:", e);
      }
    } else if (map && partiesWithCoords.length === 0) {
      // If no markers, set to default view (e.g., center of France)
      map.setView([46.2276, 2.2137], 5);
    }
  }, [partiesWithCoords, map]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {partiesWithCoords.map((party) => (
        <Marker key={party.id} position={[party.latitude!, party.longitude!]}>
          <Popup>
            <div className="font-semibold text-sm">{party.name}</div>
            <div className="text-xs">{party.location || 'Lieu non spécifié'}</div>
            <a href={`/party/${party.id}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline mt-1 block">
              Voir l'événement
            </a>
          </Popup>
        </Marker>
      ))}
    </>
  );
});
MapRendererAndMarkers.displayName = 'MapRendererAndMarkers';


export function EventMap({ parties }: EventMapProps) {
  const [isClient, setIsClient] = useState(false);
  // This key will force a re-render of the MapContainer when isClient changes,
  // effectively re-initializing the map only once on the client.
  const mapKey = isClient ? "leaflet-map-client-ready" : "leaflet-map-server";


  useEffect(() => {
    setIsClient(true);
  }, []);

  const partiesWithCoords = parties.filter(p => p.latitude != null && p.longitude != null);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Chargement de la carte...
      </div>
    );
  }
  
  if (partiesWithCoords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; // Default to France
  let initialZoom = 5;

  // No complex logic to set initialCenter/Zoom here, as DynamicMapUpdater/MapContent will handle it.
  // It's okay to start with a generic center/zoom if fitBounds will be called.

  return (
    <div id="event-map-container-wrapper" style={{ height: '100%', width: '100%' }}>
        <MapContainer
          key={mapKey} // Use a stable key or one that changes only when necessary
          center={initialCenter}
          zoom={initialZoom}
          style={{ height: '100%', width: '100%' }}
          className="leaflet-container" // Ensure this class is applied
          scrollWheelZoom={true}
        >
          <MapRendererAndMarkers 
            partiesWithCoords={partiesWithCoords} 
            initialCenter={initialCenter} // Pass if needed, though useMap in child will override
            initialZoom={initialZoom}   // Pass if needed
          />
        </MapContainer>
    </div>
  );
}