import { create } from "zustand";

export interface LinearKeyStatus {
  readonly hasKey: boolean;
  readonly encryptionAvailable: boolean;
  readonly workspaceName: string | null;
  readonly workspaceUrlKey: string | null;
}

export type LinearRequestError =
  | "no-key"
  | "unauthorized"
  | "rate-limited"
  | "network"
  | "rejected"
  | "failed";

export type LinearRequestResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: LinearRequestError; readonly message: string };

/** Exposed by the desktop preload (`apps/desktop/src/linear/linearPreload.ts`). */
export interface LinearBridge {
  readonly status: () => Promise<LinearKeyStatus>;
  readonly setKey: (
    key: string,
  ) => Promise<
    | { readonly ok: true; readonly status: LinearKeyStatus }
    | { readonly ok: false; readonly error: LinearRequestError; readonly message: string }
  >;
  readonly clearKey: () => Promise<boolean>;
  readonly request: (
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<LinearRequestResult>;
  /** While claimed, the window sends mouse-driver Back/Forward swipes to `onHistoryStep`. */
  readonly claimHistory: (claimed: boolean) => Promise<boolean>;
  readonly onHistoryStep: (listener: (delta: -1 | 1) => void) => () => void;
}

declare global {
  interface Window {
    t3Linear?: LinearBridge;
  }
}

export const linearBridge = (): LinearBridge | null =>
  typeof window === "undefined" ? null : (window.t3Linear ?? null);

interface LinearKeyStore {
  /** null until the desktop app answers; links open in the browser meanwhile. */
  readonly status: LinearKeyStatus | null;
  readonly refresh: () => Promise<void>;
  readonly setStatus: (status: LinearKeyStatus) => void;
}

export const useLinearKeyStore = create<LinearKeyStore>()((set) => ({
  status: null,
  refresh: async () => {
    const bridge = linearBridge();
    if (!bridge) return;
    set({ status: await bridge.status() });
  },
  setStatus: (status) => set({ status }),
}));

void useLinearKeyStore.getState().refresh();
