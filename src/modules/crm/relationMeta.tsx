import { Briefcase, Handshake, Music, Store, Target, type LucideIcon } from "lucide-react";
import type { RelationshipType } from "./types";

/**
 * Ícone de cada papel de relação. Usado nos badges da lista/cards e no filtro
 * por ícones (clicáveis, multi-seleção) da página Pessoas — antes só Fornecedor
 * tinha ícone próprio.
 */
export const RELATIONSHIP_ICON: Record<RelationshipType, LucideIcon> = {
  Contratante: Briefcase, // quem contrata/paga a GIG
  Parceiro: Handshake, // parcerias e colaborações
  Alvo: Target, // prospecção
  "Músico": Music,
  Fornecedor: Store,
};
