import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import { createEnvironmentShellAtoms } from "@t3tools/client-runtime/state/shell";
import { createEnvironmentThreadStateAtoms } from "@t3tools/client-runtime/state/threads";

import { connectionAtomRuntime } from "./connection/runtime";

export const environmentCatalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);
export const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);
export const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);
