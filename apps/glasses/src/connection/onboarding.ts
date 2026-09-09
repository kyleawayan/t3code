import { ConnectionOnboarding, EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "./runtime";

const onboardingScheduler = createAtomCommandScheduler();

export const connectPairing = createRuntimeCommand(connectionAtomRuntime, {
  label: "glasses:connection:connect-pairing",
  scheduler: onboardingScheduler,
  concurrency: { mode: "singleFlight", key: (pairingUrl: string) => pairingUrl },
  execute: (pairingUrl: string) =>
    ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.registerPairing({ pairingUrl })),
    ),
});

// Manual retry for the phone page: the glasses give up after a few failed
// attempts (battery), so this is how the reader tries a server again once it is
// back.
export const reconnect = createRuntimeCommand(connectionAtomRuntime, {
  label: "glasses:connection:reconnect",
  scheduler: onboardingScheduler,
  concurrency: { mode: "singleFlight", key: (environmentId: EnvironmentId) => environmentId },
  execute: (environmentId: EnvironmentId) =>
    EnvironmentRegistry.pipe(Effect.flatMap((registry) => registry.retryNow(environmentId))),
});

// Point the single glasses connection at one environment (null disconnects all).
// The registry connects it and disconnects the rest — the glasses hold one
// connection at a time on phone battery. Serial so rapid switches apply in order.
export const activateEnvironment = createRuntimeCommand(connectionAtomRuntime, {
  label: "glasses:connection:activate-environment",
  scheduler: onboardingScheduler,
  concurrency: { mode: "serial", key: () => "active-environment" },
  execute: (environmentId: EnvironmentId | null) =>
    EnvironmentRegistry.pipe(
      Effect.flatMap((registry) => registry.setActiveEnvironment(environmentId)),
    ),
});
