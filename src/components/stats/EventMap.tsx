// src/components/stats/EventMap.tsx
'use client';

import React, { useEffect, useState } from 'react';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
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
    // console.log(`[getCoordinates] Nom de ville invalide ou vide: ${cityName}`);
    return null;
  }
  const originalCityName = cityName.trim();
  const normalizedCity = normalizeCityName(originalCityName);

  if (!normalizedCity) {
    // console.log(`[getCoordinates] Ville normalisée vide pour: ${originalCityName}`);
    return null;
  }
  
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)}&format=json&limit=1&addressdetails=1`;
  // console.log(`[getCoordinates] API URL: ${apiUrl} pour ${originalCityName}`);
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'PartyHubApp/1.0 (contact@partagefestif.com)', 
        'Accept-Language': 'fr,en;q=0.9'
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Impossible de lire le corps de l'erreur Nominatim");
      console.error(`[getCoordinates] Erreur API Nominatim ${response.status} pour ${originalCityName}: ${errorText}`);
      return null;
    }
    const data = await response.json();
    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        // console.log(`[getCoordinates] Coordonnées pour ${originalCityName}: [${lat}, ${lon}]`);
        return [lat, lon];
      } else {
        console.warn(`[getCoordinates] Coordonnées invalides (NaN) pour ${originalCityName}. Lat: ${data[0].lat}, Lon: ${data[0].lon}.`);
      }
    }
    // console.log(`[getCoordinates] Aucune coordonnée trouvée pour ${originalCityName}. Réponse:`, data);
    return null;
  } catch (error) {
    console.error(`[getCoordinates] Erreur fetch pour ${originalCityName}:`, error);
    return null;
  }
};

const MapContentUpdater: React.FC<{ parties: MappedParty[] }> = ({ parties }) => {
  const map = useMap();
  useEffect(() => {
    // console.log('[MapContentUpdater] Mise à jour avec les événements:', parties);
    if (parties.length > 0) {
      try {
        const bounds = L.latLngBounds(parties.map(p => p.coordinates));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        } else if (parties.length === 1) {
          map.setView(parties[0].coordinates, 10);
        }
      } catch (boundsError) {
        console.error("[MapContentUpdater] Erreur fitBounds:", boundsError);
      }
    } else {
       map.setView([46.2276, 2.2137], 5); // Vue par défaut si aucun événement
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
  const [processedParties, setProcessedParties] = useState<MappedParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClientSide, setIsClientSide] = useState(false);

  useEffect(() => {
    // console.log('[EventMap] Monté. isClientSide sera true.');
    setIsClientSide(true);
  }, []);

  useEffect(() => {
    if (!isClientSide) {
      // console.log('[EventMap processParties] Attente du client...');
      return;
    }
    // console.log('[EventMap processParties] Démarrage du traitement. Nombre d'événements entrants:', parties.length);
    setIsLoading(true); // Commence le chargement global (géocodage)
    setErrorMessage(null);

    const process = async () => {
      if (parties.length === 0) {
        // console.log('[EventMap processParties] Aucun événement à traiter.');
        setProcessedParties([]);
        setIsLoading(false);
        return;
      }

      const partiesWithCoords: MappedParty[] = [];
      for (const party of parties) {
        if (party.latitude && party.longitude && !isNaN(party.latitude) && !isNaN(party.longitude)) {
          partiesWithCoords.push({ ...party, coordinates: [party.latitude, party.longitude] });
        } else if (party.location) {
          // console.log(`[EventMap processParties] Géocodage pour: ${party.location}`);
          const coords = await getCoordinates(party.location);
          if (coords) {
            partiesWithCoords.push({ ...party, coordinates: coords });
          } else {
            // console.warn(`[EventMap processParties] Échec du géocodage pour: ${party.location}`);
          }
        }
      }
      
      // console.log('[EventMap processParties] Traitement terminé. Événements avec coordonnées:', partiesWithCoords.length);
      setProcessedParties(partiesWithCoords);
      if (partiesWithCoords.length === 0 && parties.length > 0) {
        setErrorMessage("Aucune coordonnée valide n'a pu être déterminée pour les événements.");
      }
      setIsLoading(false); // Fin du chargement global
    };

    process();
  }, [isClientSide, parties]); // Dépend de isClientSide et des parties entrantes

  const initialCenter: LatLngExpression = [46.2276, 2.2137];
  const initialZoom = 5;

  // État de chargement initial avant que le client ne soit prêt
  if (!isClientSide) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Préparation de la carte...
      </div>
    );
  }
  
  // État de chargement pendant le géocodage (après que le client soit prêt)
  if (isLoading) {
     return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 mr-2 animate-spin" />
        Chargement des localisations...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-destructive p-4 bg-destructive/10 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Erreur de carte</p>
        <p className="text-sm">{errorMessage}</p>
      </div>
    );
  }
  
  if (parties.length > 0 && processedParties.length === 0 && !isLoading) { 
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucune localisation d'événement valide trouvée.</p>
        <p className="text-sm">Vérifiez les noms de ville ou ajoutez des localisations à vos événements.</p>
      </div>
    );
   }

   if (parties.length === 0 && !isLoading) {
     return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 bg-muted/50 rounded-md">
        <MapPin className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Aucun événement à afficher sur la carte.</p>
      </div>
    );
   }

  // console.log('[EventMap] Rendu du MapContainer.');
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        className="rounded-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapContentUpdater parties={processedParties} />
      </MapContainer>
    </div>
  );
}
