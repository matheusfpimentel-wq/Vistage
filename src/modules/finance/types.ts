export const TRANSACTION_KINDS = ["income", "expense"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = ["Previsto", "Recebido/Pago"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = [
  "PIX",
  "Transferência",
  "Cartão",
  "Dinheiro",
  "Boleto",
  "Outro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_TYPES = ["Variável", "Fixa"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EQUIPMENT_STATES = [
  "Em uso",
  "Vendido",
  "Quebrado",
  "Estoque",
] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];

export type FinanceCategory = {
  id: number;
  name: string;
  kind: TransactionKind;
  is_default: number; // 0 / 1
};

export type FinanceTransaction = {
  id: number;
  kind: TransactionKind;
  amount: number;
  date: string;
  description: string | null;
  category_id: number | null;
  gig_id: number | null;
  contact_id: number | null;
  status: TransactionStatus;
  payment_method: PaymentMethod | null;
  expense_type: ExpenseType | null;
  receipt_file_path: string | null;
  tax_relevant: number; // 0/1
  recurring_id: number | null;
  created_at: string;
  updated_at: string;
};

export type FinanceTransactionWithCategory = FinanceTransaction & {
  category_name: string | null;
};

export type FinanceTransactionCreateInput = Omit<
  FinanceTransaction,
  "id" | "created_at" | "updated_at"
>;
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
};

export type EquipmentCreateInput = Omit<Equipment, "id">;
export type EquipmentUpdateInput = Partial<EquipmentCreateInput> & { id: number };
