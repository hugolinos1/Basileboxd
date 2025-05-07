// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef, memo } from 'react';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
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

interface MappedParty extends PartyData {
  coordinates: LatLngTuple;
}

interface EventMapProps {
  parties: PartyData[];
}

interface LeafletMapContentProps {
  partiesWithCoords: MappedParty[];
}

const LeafletMapContent = memo(({ partiesWithCoords }: LeafletMapContentProps) => {
  const map = useMap();

  useEffect(() => {
    if (partiesWithCoords.length > 0 && map) {
      try {
        const bounds = L.latLngBounds(partiesWithCoords.map(p => p.coordinates));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (partiesWithCoords.length === 1) {
          map.setView(partiesWithCoords[0].coordinates, 10);
        }
      } catch (e) {
        console.error("[LeafletMapContent] Error fitting bounds:", e);
      }
    } else if (map && partiesWithCoords.length === 0) {
      map.setView([46.2276, 2.2137], 5); // Default to France
    }
  }, [partiesWithCoords, map]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {partiesWithCoords.map((party) => (
        <Marker key={party.id} position={party.coordinates}>
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
LeafletMapContent.displayName = 'LeafletMapContent';


export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapKey = "event-map-stable-key"; // Stable key for MapContainer

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getCoordinates = async (cityName: string | undefined): Promise<LatLngTuple | null> => {
    if (!cityName || typeof cityName !== 'string' || cityName.trim() === '') {
      console.warn(`[getCoordinates] Nom de ville invalide ou vide fourni: ${cityName}`);
      return null;
    }
    const originalCityName = cityName.trim();
    const normalizedCity = normalizeCityName(originalCityName);

    if (!normalizedCity) {
      console.warn(`[getCoordinates] Le nom de ville normalisé est vide pour l'original : ${originalCityName}`);
      return null;
    }
    
    const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
    
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)',
          'Accept-Language': 'fr,en;q=0.9'
        }
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur");
        console.error(`[getCoordinates] Erreur API Nominatim: ${response.status} pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}. Détails: ${errorText}`);
        return null;
      }
      const data = await response.json();
      if (data && data.length > 0 && data[0].lat && data[0].lon) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          return [lat, lon];
        }
      }
      console.warn(`[getCoordinates] Aucune coordonnée trouvée pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). API Response:`, data);
      return null;
    } catch (err) {
      console.error(`[getCoordinates] Erreur lors du géocodage pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}`, err);
      return null;
    }
  };

  useEffect(() => {
    if (!isClient || parties.length === 0) {
      setIsLoading(false);
      return;
    }

    const processParties = async () => {
      setIsLoading(true);
      setError(null);
      const partiesWithCoords: MappedParty[] = [];
      
      for (const party of parties) {
        if (party.latitude && party.longitude) {
          partiesWithCoords.push({ ...party, coordinates: [party.latitude, party.longitude] });
        } else if (party.location) {
          const coords = await getCoordinates(party.location);
          if (coords) {
            partiesWithCoords.push({ ...party, coordinates: coords });
          } else {
            console.warn(`Impossible de géocoder la ville: ${party.location} pour l'événement ${party.name}`);
          }
        }
      }
      
      setMappedParties(partiesWithCoords);
      if (partiesWithCoords.length === 0 && parties.length > 0) {
        setError("Aucune coordonnée n'a pu être déterminée pour les événements.");
      }
      setIsLoading(false);
    };

    processParties();
  }, [isClient, parties]); // parties dependency is important here


  if (!isClient || isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        {isLoading ? "Géocodage des localisations..." : "Chargement de la carte..."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-destructive p-4 bg-destructive/10 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Erreur de carte</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }
  
  if (mappedParties.length === 0 && !isLoading) { // Added !isLoading check
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
  }

  const initialCenter: LatLngExpression = [46.2276, 2.2137]; // Default to France
  const initialZoom = 5;

  return (
    <div className="h-full w-full">
      {isClient && ( // Render MapContainer only on client
        <MapContainer
          key={mapKey} // Use a stable key for MapContainer
          center={initialCenter}
          zoom={initialZoom}
          style={{ height: '100%', width: '100%' }}
          className="leaflet-container"
          scrollWheelZoom={true}
        >
          <LeafletMapContent partiesWithCoords={mappedParties} />
        </MapContainer>
      )}
    </div>
  );
}
