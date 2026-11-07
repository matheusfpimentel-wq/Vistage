const TRANSACTION_KINDS = ["income", "expense"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = ["Previsto", "Recebido", "Pago"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Statuses disponíveis conforme o tipo (income/expense). */
export function statusesForKind(kind: "income" | "expense"): TransactionStatus[] {
  return kind === "income" ? ["Previsto", "Recebido"] : ["Previsto", "Pago"];
}

/** Default status quando cria um lançamento novo. */
export function defaultStatus(kind: "income" | "expense"): TransactionStatus {
  return kind === "income" ? "Recebido" : "Pago";
}

export const PAYMENT_METHODS = [
  "PIX",
  "Transferência",
  "Cartão",
  "Dinheiro",
  "Boleto",
  "Outro",
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_TYPES = ["Variável", "Fixa"] as const;
type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EQUIPMENT_STATES = [
  "Em uso",
  "Vendido",
  "Quebrado",
  "Estoque",
] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];

/**
 * Moedas suportadas em lançamentos. BRL é a moeda-base do app: `amount` é
 * SEMPRE em reais (já convertido), então todos os totais/dashboards somam BRL
 * sem precisar saber de câmbio. Quando a moeda é estrangeira, guardamos também
 * o valor original e a cotação só para exibição e auditoria.
 */
export const CURRENCIES = [
  { code: "BRL", symbol: "R$", label: "Real brasileiro" },
  { code: "USD", symbol: "US$", label: "Dólar americano" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Libra esterlina" },
  { code: "ARS", symbol: "AR$", label: "Peso argentino" },
  { code: "CHF", symbol: "CHF", label: "Franco suíço" },
  { code: "MXN", symbol: "MX$", label: "Peso mexicano" },
  { code: "CAD", symbol: "CA$", label: "Dólar canadense" },
  { code: "AUD", symbol: "AU$", label: "Dólar australiano" },
  { code: "JPY", symbol: "¥", label: "Iene japonês" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Símbolo de uma moeda pelo código (cai no próprio código se desconhecida). */
export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? "R$";
}

export type FinanceCategory = {
  id: number;
  name: string;
  kind: TransactionKind;
  is_default: number; // 0 / 1
  is_protected: number; // 0 / 1 — categoria-núcleo; não pode ser excluída
};

export type FinanceTransaction = {
  id: number;
  kind: TransactionKind;
  /** SEMPRE em BRL (moeda-base). Para moeda estrangeira, é o equivalente já convertido. */
  amount: number;
  /** Código da moeda original do lançamento ('BRL' = nativo). */
  currency: string;
  /** Valor na moeda original (null quando BRL nativo). */
  original_amount: number | null;
  /** Cotação moeda→BRL usada na conversão (null/1 quando BRL nativo). */
  exchange_rate: number | null;
  date: string;
  description: string | null;
  category_id: number | null;
  gig_id: number | null;
  contact_id: number | null;
  class_id: number | null;
  student_package_id: number | null;
  track_id: number | null;
  party_id: number | null;
  music_cost_id: number | null;
  gig_sync: number; // 0/1
  class_sync: number; // 0/1
  status: TransactionStatus;
  payment_method: PaymentMethod | null;
  expense_type: ExpenseType | null;
  receipt_file_path: string | null;
  tax_relevant: number; // 0/1
  recurring_id: number | null;
  /** Referência externa idempotente (ex.: "royalty:distrokid:2024-01:isrc"). */
  source_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceTransactionWithCategory = FinanceTransaction & {
  category_name: string | null;
};

export type FinanceTransactionCreateInput = Omit<
  FinanceTransaction,
  "id" | "created_at" | "updated_at" | "source_ref" | "currency" | "original_amount" | "exchange_rate"
> & {
  source_ref?: string | null;
  // Multi-moeda é opcional na criação: ausente = BRL nativo (defaults do banco).
  currency?: string;
  original_amount?: number | null;
  exchange_rate?: number | null;
};
export type FinanceTransactionUpdateInput =
  Partial<FinanceTransactionCreateInput> & { id: number };

export type FinanceRecurring = {
  id: number;
  kind: TransactionKind;
  amount: number;
  description: string | null;
  category_id: number | null;
  day_of_month: number | null;
  active: number;
};

export type FinanceRecurringCreateInput = Omit<FinanceRecurring, "id">;

export type Equipment = {
  id: number;
  transaction_id: number | null;
  name: string;
  purchase_date: string | null;
  purchase_value: number | null;
  state: EquipmentState;
  location: string | null;
  notes: string | null;
  quantity: number;
  category: string | null;
  photo_path: string | null;
  /** Estimativa de quanto o item vale HOJE. Opcional — pode ficar vazia. */
  resale_value: number | null;
  /** Quando a estimativa de revenda foi feita, pra saber se está velha. */
  resale_updated_at: string | null;
};

// Os campos de revenda ficam OPCIONAIS na criação: `Equipment` descreve a linha
// do banco (onde as colunas existem, anuláveis), mas há call sites que montam o
// objeto COMPLETO à mão — ex.: o cadastro rápido de equipamento no GigForm.
// Exigi-los ali quebraria o literal sem necessidade: um item nasce sem
// estimativa de revenda.
export type EquipmentCreateInput = Omit<Equipment, "id" | "resale_value" | "resale_updated_at"> &
  Partial<Pick<Equipment, "resale_value" | "resale_updated_at">>;
export type EquipmentUpdateInput = Partial<EquipmentCreateInput> & { id: number };

export const WISHLIST_PRIORITIES = ["Alta", "Média", "Baixa"] as const;
export type WishlistPriority = (typeof WISHLIST_PRIORITIES)[number];

export const WISHLIST_STATUSES = ["Desejado", "Comprado", "Descartado"] as const;
export type WishlistStatus = (typeof WISHLIST_STATUSES)[number];

/**
 * Desejo de compra: o que se QUER comprar, antes de o dinheiro sair. É a lista
 * de intenção; quando a compra acontece, o desejo gera um item de Patrimônio e
 * guarda o `equipment_id` pra manter o histórico de "quanto tempo isso ficou na
 * fila e por quanto eu acabei pagando".
 */
export type EquipmentWish = {
  id: number;
  name: string;
  category: string | null;
  estimated_value: number | null;
  priority: WishlistPriority;
  /** Prazo desejado — colorido pelos tokens de urgência, nunca cor local. */
  target_date: string | null;
  link: string | null;
  notes: string | null;
  /**
   * Quanto já foi separado pra essa compra. É ANOTAÇÃO de planejamento, não
   * registro financeiro: não existe lançamento correspondente, então não entra
   * em nenhum total do Financeiro (que segue sendo a fonte única de dinheiro).
   */
  saved_amount: number;
  status: WishlistStatus;
  /** Item de Patrimônio gerado ao marcar "Comprei" (anulável). */
  equipment_id: number | null;
  created_at: string;
  purchased_at: string | null;
};

export type EquipmentWishCreateInput = Omit<
  EquipmentWish,
  "id" | "created_at" | "status" | "equipment_id" | "purchased_at"
> & {
  status?: WishlistStatus;
  equipment_id?: number | null;
  purchased_at?: string | null;
};
export type EquipmentWishUpdateInput = Partial<EquipmentWishCreateInput> & { id: number };
