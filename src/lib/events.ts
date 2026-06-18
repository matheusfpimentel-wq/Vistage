// Eventos globais leves do app. Usado, por exemplo, para o sino de
// notificações reagir na hora quando dados relevantes mudam, em vez de
// esperar o próximo polling.

export const DATA_CHANGED = "vistage:data-changed";

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED));
}
