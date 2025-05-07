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

const DynamicMapUpdater = ({ partiesWithCoords }: { partiesWithCoords: PartyData[] }) => {
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
        console.error("[DynamicMapUpdater] Error fitting bounds:", e);
      }
    } else if (map && partiesWithCoords.length === 0) {
      map.setView([46.2276, 2.2137], 5); // Default view for France if no markers
    }
  }, [partiesWithCoords, map]);
  return null;
};

export function EventMap({ parties }: EventMapProps) {
  const [isLoading, setIsLoading] = useState(true); // Still useful for initial client-side check
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapContainerKey, setMapContainerKey] = useState("map-initial-load");

  useEffect(() => {
    setIsClient(true);
    setIsLoading(false); // Assuming data is ready, no more geocoding here
    setMapContainerKey("map-client-ready-" + Date.now()); // Force re-render once client is confirmed
  }, []);

  useEffect(() => {
    // Cleanup function for the map instance when component unmounts or key changes
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.warn("Erreur lors du nettoyage de l'instance de la carte:", e);
        }
        mapRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        (mapContainerRef.current as any)._leaflet_id = null;
      }
    };
  }, [mapContainerKey]); // Depend on mapContainerKey to trigger cleanup if map needs full remount


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
  
  const partiesWithCoords = parties.filter(p => p.latitude != null && p.longitude != null);

  if (partiesWithCoords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les données de localisation des événements.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; 
  let initialZoom = 5;

  if (partiesWithCoords.length > 0 && partiesWithCoords[0].latitude != null && partiesWithCoords[0].longitude != null) {
      initialCenter = [partiesWithCoords[0].latitude!, partiesWithCoords[0].longitude!];
      initialZoom = 10;
  }
  
  return (
    <div ref={mapContainerRef} className="h-full w-full" key={mapContainerKey}> 
      {isClient && ( 
        <MapContainer
          whenCreated={instance => { mapRef.current = instance; }}
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          className="leaflet-container" 
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {partiesWithCoords.map((party) =>
             (party.latitude != null && party.longitude != null) ? ( // Double check here is good practice
              <Marker key={party.id} position={[party.latitude, party.longitude]}>
                <Popup>
                  <div className="font-semibold text-sm">{party.name}</div>
                  <div className="text-xs">{party.location || 'Lieu non spécifié'}</div>
                  <a href={`/party/${party.id}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline mt-1 block">
                    Voir l'événement
                  </a>
                </Popup>
              </Marker>
            ) : null
          )}
          <DynamicMapUpdater partiesWithCoords={partiesWithCoords} />
        </MapContainer>
      )}
    </div>
  );
}