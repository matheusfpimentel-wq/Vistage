import { isNative } from "../native";

/**
 * §6 — bloqueio biométrico opcional (Face ID / digital) ao abrir o app. Verificação
 * 100% local (nada sobe pro servidor). Só existe no build NATIVO: no PWA o toggle
 * fica oculto e o app nunca tranca. O plugin é importado dinamicamente e só quando
 * nativo — o bundle do PWA não depende dele em runtime.
 */

const KEY = "vistage.biometric.enabled";

export function isBiometricEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setBiometricEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage indisponível */
  }
}

/** Só dá pra trancar no app nativo (o PWA não tem biometria). */
export function biometricOfferable(): boolean {
  return isNative();
}

/** Há biometria configurada/disponível no aparelho? (nativo) */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    return !!info.isAvailable;
  } catch {
    return false;
  }
}

/** Pede a biometria. No PWA devolve true (não tranca); no nativo, true só se passar. */
export async function biometricVerify(reason = "Desbloquear o Vistage"): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({ reason, cancelTitle: "Cancelar", allowDeviceCredential: true });
    return true;
  } catch {
    return false;
  }
}
