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
    console.warn(`[getCoordinates] Nom de ville invalide ou vide fourni: ${cityName}`);
    return null;
  }

  const normalizedCity = cityName.trim();

  try {
    console.log(`[getCoordinates] Récupération des coordonnées pour la ville: ${normalizedCity}`);
    // Use the general query parameter 'q' instead of 'city' for more flexibility
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
      console.error(`Erreur API Nominatim: ${response.status} pour la ville: ${cityName} (normalisé: ${normalizedCity}). Détails: ${errorText}`);
      return null;
    }
    const data = await response.json();

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log(`[getCoordinates] Coordonnées trouvées pour ${normalizedCity}: [${lat}, ${lon}]`);
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
    } else if (map) {
      map.setView([46.2276, 2.2137], 5); // Vue par défaut (France)
    }
  }, [parties, map]);
  return null;
};

const MAP_CONTAINER_ID = "event-map-leaflet-container";

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null); // Ref for the map container div

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !parties || !mapContainerRef.current) {
      setIsLoading(false);
      return;
    }
    
    // Clean up previous map instance if it exists
    if (mapRef.current) {
      console.log("[EventMap] Suppression de l'instance de carte précédente.");
      mapRef.current.remove();
      mapRef.current = null;
    }
     // Ensure the container is clean for Leaflet
    if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        console.log("[EventMap] Nettoyage de l'ID Leaflet du conteneur.");
        (mapContainerRef.current as any)._leaflet_id = null;
    }


    const processParties = async () => {
      setIsLoading(true);
      console.log("[EventMap] Traitement des fêtes pour le géocodage:", parties.length);
      const processedParties = await Promise.all(
        parties.map(async (party) => {
          const locationString = typeof party.location === 'string' ? party.location : undefined;
          const coords = await getCoordinates(locationString);
          return { ...party, coordinates: coords };
        })
      );
      setMappedParties(processedParties);
      setIsLoading(false);
      console.log("[EventMap] Géocodage terminé. Fêtes mappées avec des emplacements valides:", processedParties.filter(p => p.coordinates).length);
    };

    processParties();

  }, [parties, isClient]);


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

  if (validMarkers.length > 0 && validMarkers[0].coordinates) {
    initialCenter = validMarkers[0].coordinates;
    initialZoom = validMarkers.length === 1 ? 10 : 6; 
  }
  
  return (
    <div ref={mapContainerRef} className="h-full w-full" key={isClient ? "map-client-container" : "map-server-container-placeholder"}>
      {isClient && ( 
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          className="leaflet-container" // Ensure this class is applied for styling
          style={{ height: '100%', width: '100%' }}
          whenCreated={mapInstance => { mapRef.current = mapInstance; }}
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
          <DynamicMapUpdater parties={mappedParties} />
        </MapContainer>
      )}
    </div>
  );
}