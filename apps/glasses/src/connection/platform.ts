import { ConnectionBlockedError, Connectivity, Wakeups } from "@t3tools/client-runtime/connection";
import {
  ClientPresentation,
  CloudSession,
  EnvironmentOwnedDataCleanup,
  PlatformConnectionSource,
  PrimaryEnvironmentAuth,
  RelayDeviceIdentity,
  SshEnvironmentGateway,
} from "@t3tools/client-runtime/platform";
import {
  AuthOrchestrationReadScope,
  type AuthClientPresentationMetadata,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { connectionStorageLayer } from "./storage";

function currentNetworkStatus(): "unknown" | "offline" | "online" {
  return navigator.onLine ? "online" : "offline";
}

const connectivityLayer = Connectivity.layer({
  status: Effect.sync(currentNetworkStatus),
  changes: Stream.callback((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const online = () => Queue.offerUnsafe(queue, "online");
        const offline = () => Queue.offerUnsafe(queue, "offline");
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        return { online, offline };
      }),
      ({ online, offline }) =>
        Effect.sync(() => {
          window.removeEventListener("online", online);
          window.removeEventListener("offline", offline);
        }),
    ).pipe(Effect.asVoid),
  ),
});

// Android may suspend the WebView and drop the socket while backgrounded; a
// visibility change is the earliest signal to probe and reconnect.
const wakeupsLayer = Wakeups.layer({
  changes: Stream.callback<"application-active">((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = () => {
          if (document.visibilityState === "visible") {
            Queue.offerUnsafe(queue, "application-active");
          }
        };
        document.addEventListener("visibilitychange", listener);
        return listener;
      }),
      (listener) =>
        Effect.sync(() => {
          document.removeEventListener("visibilitychange", listener);
        }),
    ).pipe(Effect.asVoid),
  ),
});

function clientMetadata(): AuthClientPresentationMetadata {
  const userAgent = navigator.userAgent;
  const os = /iphone|ipad|ipod/i.test(userAgent)
    ? "iOS"
    : /android/i.test(userAgent)
      ? "Android"
      : "unknown";
  return {
    label: "T3 Code Glasses",
    deviceType: "mobile",
    os,
    surface: "mobile",
    deviceModel: "Even G2",
  };
}

const unsupported = (detail: string) =>
  Effect.fail(new ConnectionBlockedError({ reason: "unsupported", detail }));

const capabilitiesLayer = Layer.succeedContext(
  Context.make(
    ClientPresentation,
    // Read-only client: asking for more than the pairing link grants makes the
    // token exchange fail, and read-only links are what this app is paired with.
    ClientPresentation.of({ metadata: clientMetadata(), scopes: [AuthOrchestrationReadScope] }),
  ).pipe(
    Context.add(
      CloudSession,
      CloudSession.of({
        clerkToken: unsupported("T3 Connect is not supported on the glasses client."),
      }),
    ),
    Context.add(
      PrimaryEnvironmentAuth,
      PrimaryEnvironmentAuth.of({ bearerToken: Effect.succeed(Option.none()) }),
    ),
    Context.add(
      RelayDeviceIdentity,
      RelayDeviceIdentity.of({ deviceId: Effect.succeed(Option.none()) }),
    ),
    Context.add(
      SshEnvironmentGateway,
      SshEnvironmentGateway.of({
        provision: () => unsupported("SSH environments are only available in the desktop app."),
        prepare: () => unsupported("SSH environments are only available in the desktop app."),
        disconnect: () => Effect.void,
      }),
    ),
  ),
);

const platformConnectionSourceLayer = Layer.succeed(
  PlatformConnectionSource,
  PlatformConnectionSource.of({ registrations: Stream.empty }),
);

const environmentOwnedDataCleanupLayer = Layer.succeed(
  EnvironmentOwnedDataCleanup,
  EnvironmentOwnedDataCleanup.of({ clear: () => Effect.void }),
);

export const connectionPlatformLayer = Layer.mergeAll(
  connectionStorageLayer,
  connectivityLayer,
  wakeupsLayer,
  capabilitiesLayer,
  platformConnectionSourceLayer,
  environmentOwnedDataCleanupLayer,
);
