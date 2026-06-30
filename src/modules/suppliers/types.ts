export const SUPPLIER_CATEGORIES = [
  "Som/Luz",
  "Decoração",
  "Fotografia/Vídeo",
  "Segurança",
  "Alimentação",
  "Marketing",
  "Logística",
  "Venue",
  "Outros",
] as const;

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export type Supplier = {
  id: number;
  name: string;
  category: SupplierCategory | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  city: string | null;
  notes: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
};

export type SupplierService = {
  id: number;
  supplier_id: number;
  /** Categoria do serviço (por linha — antes era única por fornecedor). */
  category: string | null;
  description: string;
  unit: string | null;
  price: number | null;
  notes: string | null;
  created_at: string;
};

export type SupplierCreateInput = Omit<Supplier, "id" | "created_at" | "updated_at">;
export type SupplierUpdateInput = Partial<SupplierCreateInput> & { id: number };
