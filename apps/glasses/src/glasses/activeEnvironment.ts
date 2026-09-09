import { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { activateEnvironment } from "../connection/onboarding";
import { hostStorage } from "../connection/hostStorage";
import { appAtomRegistry } from "../connection/runtime";

/**
 * Which single environment (laptop) the glasses connect to. Chosen on the phone
 * page; the glasses display follows it, and the registry connects only this one
 * (see ConnectionActivationPolicy). Kept in the Even App's storage so the choice
 * survives relaunches, like the pairing catalog and typing speed.
 */
export const activeEnvironmentAtom = Atom.make<EnvironmentId | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("glasses-active-environment"),
);

const STORAGE_KEY = "t3code-glasses:active-environment:v1";

// Storage answers asynchronously (a bridge round trip inside the Even App); a
// selection made before it lands wins over the stored value.
let touched = false;
void hostStorage.getItem(STORAGE_KEY).then((raw) => {
  if (!touched && raw !== null && raw.length > 0) {
    const environmentId = EnvironmentId.make(raw);
    appAtomRegistry.set(activeEnvironmentAtom, environmentId);
    void activateEnvironment.run(appAtomRegistry, environmentId);
  }
});

/** Select the environment the glasses connect to (null disconnects all). Sets
 *  the shared atom the display follows, persists the choice, and dials the
 *  registry so the previous connection is dropped. */
export function setActiveEnvironment(environmentId: EnvironmentId | null): void {
  touched = true;
  appAtomRegistry.set(activeEnvironmentAtom, environmentId);
  void hostStorage
    .setItem(STORAGE_KEY, environmentId ?? "")
    .catch((cause: unknown) => console.warn("[glasses] active environment not saved", cause));
  void activateEnvironment.run(appAtomRegistry, environmentId);
}
