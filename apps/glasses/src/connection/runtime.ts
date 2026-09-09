import { Connection, retryPolicyLayer } from "@t3tools/client-runtime/connection";
import { shellSnapshotLoaderLayer } from "@t3tools/client-runtime/state/shell";
import { threadSnapshotLoaderLayer } from "@t3tools/client-runtime/state/threads";
import * as Layer from "effect/Layer";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { runtimeContextLayer } from "../runtime";
import { connectionPlatformLayer } from "./platform";

export const appAtomRegistry = AtomRegistry.make();

const snapshotLoaderLayer = Layer.merge(threadSnapshotLoaderLayer, shellSnapshotLoaderLayer);

const connectionLayer = Layer.merge(Connection.layer, snapshotLoaderLayer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      runtimeContextLayer,
      connectionPlatformLayer,
      // Glasses run on phone battery: try a few times over ~15s (3s/4s/8s
      // backoff), then park until a manual refresh instead of an endless
      // reconnect loop. A connection that stayed up then dropped resets the
      // ladder, so a transient blip auto-recovers while a dead server still
      // gives up.
      retryPolicyLayer({ maxAutoAttempts: 4 }),
    ),
  ),
);

export const connectionAtomRuntime = Atom.runtime(connectionLayer);
