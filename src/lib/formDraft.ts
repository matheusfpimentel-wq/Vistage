import { useDocumentStore } from "./document";

// Rascunho de formulário em localStorage — para o caso "preenchi metade e
// fechei sem querer". Diferente do rascunho do Debrief de GIGs, que mora em
// tabela (`gig_debrief_drafts`) porque precisa viajar dentro do .vistage: aqui
// é conveniência de máquina, some com o cache do navegador e não precisa de
// migration.
//
// A chave é ESCOPADA PELO DOCUMENTO aberto. Sem isso, um rascunho preenchido no
// documento A seria oferecido ao abrir o mesmo formulário no documento B — a
// mesma classe de vazamento entre documentos que a auditoria já apontou em
// tabelas que escapavam da limpeza.

function scopedKey(formKey: string): string {
  const path = useDocumentStore.getState().currentPath ?? "sem-titulo";
  return `vistage.draft.${formKey}.${path}`;
}

/** Rascunho guardado, ou null se não houver (ou se estiver corrompido). */
export function readDraft<T>(formKey: string): T | null {
  try {
    const raw = localStorage.getItem(scopedKey(formKey));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(formKey: string, value: T): void {
  try {
    localStorage.setItem(scopedKey(formKey), JSON.stringify(value));
  } catch {
    /* cota cheia / storage bloqueado: rascunho é conveniência, não some dado */
  }
}

export function clearDraft(formKey: string): void {
  try {
    localStorage.removeItem(scopedKey(formKey));
  } catch {
    /* ignora */
  }
}
