// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PartyData } from '@/lib/party-utils';
import { MapPin, Loader2 } from 'lucide-react';
import { normalizeCityName } from '@/lib/party-utils';


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

const DynamicMapUpdater = ({ parties }: { parties: PartyData[] }) => {
  const map = useMap();
  useEffect(() => {
    const validMarkers = parties.filter(p => p.latitude != null && p.longitude != null);
    if (validMarkers.length > 0 && map) {
      try {
        const bounds = L.latLngBounds(validMarkers.map(p => [p.latitude!, p.longitude!] as LatLngTuple));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (validMarkers.length === 1 && validMarkers[0].latitude != null && validMarkers[0].longitude != null) {
          map.setView([validMarkers[0].latitude!, validMarkers[0].longitude!], 10);
        }
      } catch (e) {
        console.error("[DynamicMapUpdater] Error fitting bounds:", e);
      }
    } else if (map && validMarkers.length === 0) {
      map.setView([46.2276, 2.2137], 5); // Default view for France if no markers
    }
  }, [parties, map]);
  return null;
};


export function EventMap({ parties }: EventMapProps) {
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Key to force remount MapContainer when necessary, e.g. after geocoding
  const [mapContainerKey, setMapContainerKey] = useState("map-initial");


  useEffect(() => {
    setIsClient(true);
  }, []);

  // This effect will run after isClient is true and parties prop potentially changes.
  useEffect(() => {
    if (!isClient) return; // Ensure this only runs on the client
    
    // If parties with coordinates are available, set loading to false
    // or if geocoding is no longer needed because lat/lon are already present.
    const hasCoordinates = parties.some(p => p.latitude != null && p.longitude != null);
    if (hasCoordinates) {
      setIsLoading(false);
      setError(null);
      setMapContainerKey("map-ready-" + Date.now()); // Force re-render if needed
    } else {
        // Handle case where no parties have coordinates - might show "no data" or keep loading
        // For now, assuming if no coordinates, something is wrong or still processing elsewhere
        setIsLoading(false); // Stop loading if no coordinates to process
        setError("Aucune coordonnée d'événement disponible pour afficher sur la carte.");
    }

    // Cleanup function for the map instance
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
       // Explicitly clear Leaflet's internal ID from the DOM element
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        (mapContainerRef.current as any)._leaflet_id = null;
      }
    };
  }, [isClient, parties]); // Rerun if isClient changes or parties data changes

  if (!isClient || isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Chargement de la carte...
      </div>
    );
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
  
  const validMarkers = parties.filter(p => p.latitude != null && p.longitude != null);

  if (validMarkers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; 
  let initialZoom = 5;

  if (validMarkers.length > 0 && validMarkers[0].latitude != null && validMarkers[0].longitude != null) {
      initialCenter = [validMarkers[0].latitude!, validMarkers[0].longitude!];
      initialZoom = 10;
  }
  
  return (
    <div className="h-full w-full" key={mapContainerKey}> 
      {isClient && ( 
        <MapContainer
          whenCreated={instance => { mapRef.current = instance; }} // Store map instance
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          className="leaflet-container" 
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {validMarkers.map((party) =>
             (party.latitude != null && party.longitude != null) ? (
              <Marker key={party.id} position={[party.latitude, party.longitude]}>
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
          <DynamicMapUpdater parties={validMarkers} />
        </MapContainer>
      )}
    </div>
  );
}
