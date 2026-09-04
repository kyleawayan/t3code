import { remoteHttpClientLayer } from "@t3tools/client-runtime/rpc";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { RelayWebClientId } from "@t3tools/contracts/relay";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Socket from "effect/unstable/socket/Socket";

const httpClientLayer = remoteHttpClientLayer((input, init) => globalThis.fetch(input, init));

const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.promise(async () => {
        const input = new Uint8Array(data.length);
        input.set(data);
        return new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, input.buffer));
      }),
  }),
);

// The glasses client only pairs directly (bearer token from a pairing URL).
// The shared connection layer still resolves the relay services, so provide a
// disabled relay client and a signer that refuses, rather than forking the layer.
const relayDpopSignerLayer = Layer.succeed(
  ManagedRelay.ManagedRelayDpopSigner,
  ManagedRelay.ManagedRelayDpopSigner.of({
    thumbprint: Effect.fail(
      new ManagedRelay.ManagedRelayDpopKeyLoadError({
        keyStore: "indexed-db",
        cause: new Error("T3 Connect is not supported on the glasses client."),
      }),
    ),
    createProof: (input) =>
      Effect.fail(
        new ManagedRelay.ManagedRelayDpopProofCreationError({
          method: input.method,
          url: input.url,
          cause: new Error("T3 Connect is not supported on the glasses client."),
        }),
      ),
  }),
);

const managedRelayClientLayer = ManagedRelay.layer({
  relayUrl: "http://relay.invalid",
  clientId: RelayWebClientId,
}).pipe(Layer.provide(Layer.mergeAll(relayDpopSignerLayer, httpClientLayer)));

const runtimeLayer = Layer.mergeAll(
  httpClientLayer,
  cryptoLayer,
  Socket.layerWebSocketConstructorGlobal,
  relayDpopSignerLayer,
  managedRelayClientLayer,
);

export const runtime = ManagedRuntime.make(runtimeLayer);

export const runtimeContextLayer = Layer.effectContext(runtime.contextEffect);
