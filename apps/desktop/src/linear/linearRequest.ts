import {
  AuthenticationLinearError,
  ForbiddenLinearError,
  LinearError,
  NetworkLinearError,
  RatelimitedLinearError,
} from "@linear/sdk";

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

/** Defense in depth: even a key with write access can only read through the renderer. */
export function isReadOnlyQuery(query: string): boolean {
  return query.trim().length > 0 && !/\b(?:mutation|subscription)\b/.test(query);
}

/**
 * A Linear upload link without its query, or null for anything else. Only these get the key; a
 * stored signature (often expired) is dropped, since the key authorizes the download. Upload paths
 * start with the workspace's id, so another workspace's links keep their own signature.
 */
export function linearUploadUrl(raw: string, organizationId: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "uploads.linear.app") return null;
  if (url.username || url.password || url.port) return null;
  if (organizationId !== undefined && !url.pathname.startsWith(`/${organizationId}/`)) return null;
  return `${url.origin}${url.pathname}`;
}

/** Maps what the SDK throws onto the tab's error states. */
export function classifyLinearError(error: unknown): LinearRequestResult {
  if (error instanceof AuthenticationLinearError || error instanceof ForbiddenLinearError) {
    return { ok: false, error: "unauthorized", message: "Linear rejected the API key." };
  }
  if (error instanceof RatelimitedLinearError) {
    return { ok: false, error: "rate-limited", message: "Linear's rate limit was reached." };
  }
  // The SDK passes fetch's own failures (offline, DNS, TLS) through untouched.
  if (
    error instanceof NetworkLinearError ||
    (error instanceof TypeError && error.message === "fetch failed")
  ) {
    return { ok: false, error: "network", message: "Couldn't reach Linear." };
  }
  if (error instanceof LinearError && error.data !== null && typeof error.data === "object") {
    // Linear answers a missing issue with `{ issue: null }` plus an error; that still renders.
    return { ok: true, data: error.data };
  }
  return {
    ok: false,
    error: "failed",
    message: error instanceof Error && error.message ? error.message : "Linear request failed.",
  };
}
