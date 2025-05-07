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
  parties: PartyData[]; // Parties already have latitude/longitude
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

const MAP_CONTAINER_ID = "event-map-leaflet-container-unique";

export function EventMap({ parties }: EventMapProps) {
  const [isLoading, setIsLoading] = useState(true); // Initially true until client is ready
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      // Logic to handle map initialization or re-initialization
      // This ensures that Leaflet attempts to initialize only after the client-side rendering is confirmed.
      setIsLoading(false); // Map can now attempt to load
      setMapReady(true); // Indicate that the map component can be rendered
    }
  }, [isClient]);


  useEffect(() => {
    // Cleanup map instance on component unmount or if the map container is removed
    return () => {
      if (mapRef.current) {
        console.log("[EventMap Cleanup] Removing existing map instance from ref.");
        mapRef.current.remove();
        mapRef.current = null;
      }
       // Also attempt to clean up if Leaflet attached an ID directly to the DOM element
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
         console.log("[EventMap Cleanup] Clearing _leaflet_id from container div.");
        (mapContainerRef.current as any)._leaflet_id = null;
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleanup on unmount


  if (!isClient || isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />Chargement de la carte...
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
        <p className="text-lg font-medium">Aucune localisation d'événement disponible.</p>
        <p className="text-sm">Ajoutez des lieux à vos événements pour les voir sur la carte.</p>
      </div>
    );
  }

  let initialCenter: LatLngExpression = [46.2276, 2.2137]; 
  let initialZoom = 5;

  if (validMarkers.length > 0) {
    if (validMarkers.length === 1 && validMarkers[0].latitude != null && validMarkers[0].longitude != null) {
      initialCenter = [validMarkers[0].latitude!, validMarkers[0].longitude!];
      initialZoom = 10;
    }
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
