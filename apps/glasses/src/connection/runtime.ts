import { Connection } from "@t3tools/client-runtime/connection";
import { shellSnapshotLoaderLayer } from "@t3tools/client-runtime/state/shell";
import { threadSnapshotLoaderLayer } from "@t3tools/client-runtime/state/threads";
import * as Layer from "effect/Layer";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { runtimeContextLayer } from "../runtime";
import { connectionPlatformLayer } from "./platform";

export const appAtomRegistry = AtomRegistry.make();

const snapshotLoaderLayer = Layer.merge(threadSnapshotLoaderLayer, shellSnapshotLoaderLayer);

const connectionLayer = Layer.merge(Connection.layer, snapshotLoaderLayer).pipe(
  Layer.provideMerge(Layer.mergeAll(runtimeContextLayer, connectionPlatformLayer)),
);

export const connectionAtomRuntime = Atom.runtime(connectionLayer);
