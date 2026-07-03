import { isNative, storeGet, storeSet } from "../native";
import { supabase } from "../supabase";
import { e164 } from "../links";

/**
 * §7.2 — Sincroniza contatos do Vistage COM a agenda nativa (mão única
 * Vistage→agenda). 100% local: nada sobe pro servidor. Só existe no build
 * NATIVO (o plugin de contatos é importado sob demanda e só quando nativo; no
 * PWA o toggle some e nada roda).
 *
 * Segurança: todo contato criado leva o identificador "MAZIK · Vistage" e um
 * mapeamento local id↔contato. O sync NUNCA toca nos contatos do usuário — só
 * nos que ele mesmo criou (via o mapa). Dedupe por telefone antes de criar,
 * pra não duplicar quem já está na agenda. O plugin não tem update, então
 * "atualizar" = apagar o que criamos + recriar.
 */

export type AgendaScope = "fan" | "contact" | "student";
const SCOPES: AgendaScope[] = ["fan", "contact", "student"];
const ENABLED_KEY = "vistage.agenda.enabled";
const SCOPES_KEY = "vistage.agenda.scopes";
const MAP_KEY = "vistage.agenda.map";
const TAG = "MAZIK · Vistage";

export function isAgendaSyncEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}
export function setAgendaSyncEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage indisponível */
  }
}
export function getScopes(): Record<AgendaScope, boolean> {
  try {
    const raw = localStorage.getItem(SCOPES_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Record<AgendaScope, boolean>>;
      return { fan: !!s.fan, contact: !!s.contact, student: !!s.student };
    }
  } catch {
    /* padrão abaixo */
  }
  return { fan: true, contact: true, student: false };
}
export function setScopes(s: Record<AgendaScope, boolean>): void {
  try {
    localStorage.setItem(SCOPES_KEY, JSON.stringify(s));
  } catch {
    /* storage indisponível */
  }
}
/** Só dá pra sincronizar com a agenda no app nativo (PWA não tem o plugin). */
export function agendaSyncOfferable(): boolean {
  return isNative();
}

type MapEntry = { nativeId: string; phone: string; name: string };
type SyncMap = Record<string, MapEntry>; // chave = `${scope}:${sourceId}`

async function loadMap(): Promise<SyncMap> {
  try {
    const raw = await storeGet(MAP_KEY);
    return raw ? (JSON.parse(raw) as SyncMap) : {};
  } catch {
    return {};
  }
}
async function saveMap(m: SyncMap): Promise<void> {
  try {
    await storeSet(MAP_KEY, JSON.stringify(m));
  } catch {
    /* storage indisponível */
  }
}

type Person = { key: string; name: string; phone: string };

/** Pessoas dos escopos ligados, do espelho, já com telefone em E.164. */
async function loadPeople(scopes: Record<AgendaScope, boolean>): Promise<Person[]> {
  const kinds = SCOPES.filter((s) => scopes[s]);
  const out: Person[] = [];
  for (const kind of kinds) {
    const { data } = await supabase
      .from("catalog_mirror")
      .select("source_id, title, meta")
      .eq("kind", kind)
      .limit(4000);
    for (const r of (data ?? []) as { source_id: string; title: string; meta: { phone?: string | null } | null }[]) {
      const phone = e164(r.meta?.phone);
      if (phone && r.title) out.push({ key: `${kind}:${r.source_id}`, name: r.title, phone });
    }
  }
  return out;
}

/** Sincroniza (mão única). Só nativo + habilitado. Idempotente. */
export async function syncAgenda(): Promise<{ created: number; updated: number; skipped: number }> {
  const result = { created: 0, updated: 0, skipped: 0 };
  if (!isNative() || !isAgendaSyncEnabled()) return result;
  try {
    const { Contacts, PhoneType } = await import("@capacitor-community/contacts");

    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== "granted") return result;

    const people = await loadPeople(getScopes());
    const map = await loadMap();

    // Dedupe: dígitos dos telefones já na agenda (pra não duplicar).
    const existing = await Contacts.getContacts({ projection: { phones: true } });
    const existingPhones = new Set<string>();
    for (const c of existing.contacts ?? []) {
      for (const ph of c.phones ?? []) {
        const d = (ph.number ?? "").replace(/\D/g, "");
        if (d) existingPhones.add(d);
      }
    }

    const build = (name: string, phone: string) => ({
      contact: {
        name: { given: name },
        organization: { company: TAG },
        note: TAG,
        phones: [{ type: PhoneType.Mobile, number: phone, isPrimary: true }],
      },
    });

    // Só mexe em quem já mapeamos + cria os novos dos escopos atuais.
    const wantedKeys = new Set(people.map((p) => p.key));

    for (const p of people) {
      const prev = map[p.key];
      if (prev) {
        if (prev.phone === p.phone && prev.name === p.name) {
          result.skipped++;
          continue;
        }
        // Mudou: recria (o plugin não tem update).
        try {
          await Contacts.deleteContact({ contactId: prev.nativeId });
        } catch {
          /* pode já não existir */
        }
        const res = await Contacts.createContact(build(p.name, p.phone));
        map[p.key] = { nativeId: res.contactId, phone: p.phone, name: p.name };
        result.updated++;
      } else {
        const digits = p.phone.replace(/\D/g, "");
        if (existingPhones.has(digits)) {
          result.skipped++;
          continue;
        }
        const res = await Contacts.createContact(build(p.name, p.phone));
        map[p.key] = { nativeId: res.contactId, phone: p.phone, name: p.name };
        existingPhones.add(digits);
        result.created++;
      }
    }

    // Escopo desligado/pessoa sumiu: remove o que tínhamos criado pra ela.
    for (const key of Object.keys(map)) {
      if (!wantedKeys.has(key)) {
        try {
          await Contacts.deleteContact({ contactId: map[key].nativeId });
        } catch {
          /* pode já não existir */
        }
        delete map[key];
      }
    }

    await saveMap(map);
  } catch {
    /* permissão negada / plugin indisponível — silencioso */
  }
  return result;
}

/** Remove da agenda TODOS os contatos criados pelo app (ao desligar). */
export async function removeAgendaContacts(): Promise<number> {
  if (!isNative()) return 0;
  let removed = 0;
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const map = await loadMap();
    for (const key of Object.keys(map)) {
      try {
        await Contacts.deleteContact({ contactId: map[key].nativeId });
        removed++;
      } catch {
        /* pode já não existir */
      }
    }
    await saveMap({});
  } catch {
    /* plugin indisponível */
  }
  return removed;
}
