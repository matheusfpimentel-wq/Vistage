export const VENUE_TYPES = ["Club", "Bar", "Espaço para eventos", "Teatro", "Festival", "Outro"] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

/**
 * Estado da estrela do venue:
 * - "target": alvo, quero tocar lá (estrela vermelha)
 * - "played": já toquei lá (estrela amarela)
 * - "favorite": já toquei e gostei, quero me aproximar (estrela laranja)
 */
export const VENUE_STAR_STATUSES = ["target", "played", "favorite"] as const;
export type VenueStarStatus = (typeof VENUE_STAR_STATUSES)[number];

export type Venue = {
  id: number;
  name: string;
  venue_type: VenueType | null;
  star_status: VenueStarStatus | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  founded_year: number | null;
  capacity: number | null;
  owner_name: string | null;
  owner_role: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  instagram: string | null;
  website: string | null;
  notes: string | null;
  photo_path: string | null;
  concept?: string | null;
  dominant_genre?: string | null;
  rider_equipment?: string | null;
  regular_audience?: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueCreateInput = Omit<Venue, "id" | "created_at" | "updated_at" | "lat" | "lng" | "geocoded_at"> & {
  lat?: number | null;
  lng?: number | null;
  geocoded_at?: string | null;
};
export type VenueUpdateInput = Partial<VenueCreateInput> & { id: number };

export type VenueStats = {
  gigCount: number;
  totalRevenue: number;
  lastGigDate: string | null;
  avgRating: number | null;
};
