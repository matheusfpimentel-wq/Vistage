export type Venue = {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  founded_year: number | null;
  capacity: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  instagram: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueCreateInput = Omit<Venue, "id" | "created_at" | "updated_at">;
export type VenueUpdateInput = Partial<VenueCreateInput> & { id: number };

export type VenueStats = {
  gigCount: number;
  totalRevenue: number;
  lastGigDate: string | null;
  avgRating: number | null;
};
