// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import L, { LatLngExpression, LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
// CSS is imported in globals.css
import type { PartyData } from '@/lib/party-utils';
import { MapPin, Loader2 } from 'lucide-react';
import { normalizeCityName } from '@/lib/party-utils';

// Leaflet default icon fix
if (typeof window !== 'undefined') {
  if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
    const LDefaultIcon = L.Icon.Default.prototype as any;
    if (LDefaultIcon._getIconUrl) {
      delete LDefaultIcon._getIconUrl;
    }
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }
}

interface MappedParty extends PartyData {
  coordinates: LatLngTuple;
}

interface EventMapProps {
  parties: PartyData[];
}

const getCoordinates = async (cityName: string | undefined): Promise<LatLngTuple | null> => {
  if (!cityName || typeof cityName !== 'string' || cityName.trim() === '') {
    // console.warn(`[getCoordinates] Invalid or empty city name provided: ${cityName}`);
    return null;
  }
  const originalCityName = cityName.trim();
  const normalizedCity = normalizeCityName(originalCityName);

  if (!normalizedCity) {
    // console.warn(`[getCoordinates] Normalized city name is empty for original: ${originalCityName}`);
    return null;
  }
  
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  // console.log(`[getCoordinates] Attempting geocoding for: "${originalCityName}" (normalized: "${normalizedCity}"). API URL: ${apiUrl}`);
  
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
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error(`[getCoordinates] Erreur de parsing JSON pour la ville: ${originalCityName} (normalisé: ${normalizedCity}). URL: ${apiUrl}. Erreur:`, jsonError);
      const rawResponse = await response.text().catch(() => "Impossible de lire la réponse brute après l'erreur JSON");
      // console.log(`[getCoordinates] Réponse brute de l'API pour ${normalizedCity}:`, rawResponse);
      return null;
    }

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        // console.log(`[getCoordinates] Coordonnées trouvées pour ${originalCityName} (via ${normalizedCity}): [${lat}, ${lon}]`);
        return [lat, lon];
      } else {
         console.warn(`[getCoordinates] Coordonnées invalides (NaN) pour ${originalCityName} (via ${normalizedCity}). Lat: ${data[0].lat}, Lon: ${data[0].lon}.`);
      }
    }
    // console.warn(`[getCoordinates] Aucune coordonnée trouvée ou structure de réponse inattendue pour la ville: ${originalCityName} (via ${normalizedCity}). Réponse API:`, data);
    return null;
  } catch (error) {
    console.error(`[getCoordinates] Erreur inattendue lors du géocodage pour la ville: ${originalCityName} (via ${normalizedCity}). URL: ${apiUrl}`, error);
    return null;
  }
};

const MapContentUpdater: React.FC<{ parties: MappedParty[] }> = ({ parties }) => {
  const map = useMap();

  useEffect(() => {
    if (parties.length > 0) {
      try {
        const bounds = L.latLngBounds(parties.map(p => p.coordinates));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (parties.length === 1) {
          map.setView(parties[0].coordinates, 10);
        }
      } catch (boundsError) {
        console.error("[MapContentUpdater] Erreur lors de l'ajustement des limites de la carte:", boundsError);
      }
    } else {
       map.setView([46.2276, 2.2137], 5); 
    }
  }, [parties, map]);

  return (
    <>
      {parties.map(party => (
        <Marker key={party.id} position={party.coordinates}>
          <Popup>
            <b>{party.name}</b><br/>
            {party.location || 'Lieu non spécifié'}<br/>
            <a href={`/party/${party.id}`} target="_blank" rel="noopener noreferrer" style={{color: 'hsl(var(--primary))'}}>
              Voir l'événement
            </a>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export function EventMap({ parties }: EventMapProps) {
  const [mappedParties, setMappedParties] = useState<MappedParty[]>([]);
  const [isLoadingGeocoding, setIsLoadingGeocoding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const [mapContainerKey, setMapContainerKey] = useState("initial-map-key"); // Use a string key


  useEffect(() => {
    setIsClient(true);
    // Generate a new key on mount to ensure the container is fresh for Leaflet
    setMapContainerKey(`map-${Date.now()}`); 

    return () => {
      if (mapRef.current) {
        // console.log("[EventMap Cleanup] Removing map instance:", mapRef.current);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); 

  useEffect(() => {
    if (!isClient) return; // Don't process until client-side

    const processParties = async () => {
      // console.log("[EventMap processParties] Starting party processing for map. Parties count:", parties.length);
      setIsLoadingGeocoding(true);
      setError(null);
      
      if (parties.length === 0) {
        setMappedParties([]);
        setIsLoadingGeocoding(false);
        // console.log("[EventMap processParties] No parties to process.");
        return;
      }

      const partiesWithCoords: MappedParty[] = [];
      for (const party of parties) {
        if (party.latitude && party.longitude && !isNaN(party.latitude) && !isNaN(party.longitude)) {
          partiesWithCoords.push({ ...party, coordinates: [party.latitude, party.longitude] });
        } else if (party.location) {
          const coords = await getCoordinates(party.location);
          if (coords) {
            partiesWithCoords.push({ ...party, coordinates: coords });
          }
        }
      }
      
      // console.log("[EventMap processParties] Processed parties with coordinates:", partiesWithCoords.length);
      setMappedParties(partiesWithCoords);
      if (partiesWithCoords.length === 0 && parties.length > 0) {
        setError("Aucune coordonnée n'a pu être déterminée pour les événements.");
      }
      setIsLoadingGeocoding(false);
    };

    processParties();
  }, [isClient, parties]);


  const initialCenter: LatLngExpression = [46.2276, 2.2137]; 
  const initialZoom = 5;

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Chargement de la carte...
      </div>
    );
  }
  
  if (isLoadingGeocoding) {
     return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Géocodage des localisations...
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
  
  if (mappedParties.length === 0 && parties.length > 0) { 
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
   }

   if (mappedParties.length === 0 && parties.length === 0 ) {
     return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucun événement à afficher sur la carte.</p>
      </div>
    );
   }

  return (
    <div className="h-full w-full leaflet-container" key={mapContainerKey}> 
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
          <MapContentUpdater parties={mappedParties} />
        </MapContainer>
      )}
    </div>
  );
}
