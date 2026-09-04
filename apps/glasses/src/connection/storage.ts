import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  ConnectionTransientError,
  CredentialStore,
  ProfileStore,
} from "@t3tools/client-runtime/connection";
import {
  ConnectionCatalogDocument,
  type ConnectionCatalogDocument as ConnectionCatalogDocumentType,
  ConnectionPersistenceError,
  ConnectionRegistrationStore,
  ConnectionTargetStore,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  EnvironmentCacheStore,
  registerConnectionInCatalog,
  removeCatalogValue,
  removeConnectionFromCatalog,
  replaceCatalogValue,
} from "@t3tools/client-runtime/platform";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { hostStorage } from "./hostStorage";

// The catalog (targets + bearer credentials) is the only state worth keeping;
// it lives in the Even App's own storage (see hostStorage). Shell and thread
// snapshots are re-fetched on every launch instead of cached.
const CATALOG_STORAGE_KEY = "t3code-glasses:connection-catalog:v1";

const ConnectionCatalogDocumentJson = Schema.fromJsonString(ConnectionCatalogDocument);
const decodeCatalog = Schema.decodeUnknownEffect(ConnectionCatalogDocumentJson);
const encodeCatalog = Schema.encodeEffect(ConnectionCatalogDocumentJson);

function catalogError(operation: string, cause: unknown) {
  return new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Could not ${operation} the connection catalog: ${String(cause)}`,
  });
}

function persistenceError(
  operation: ConnectionPersistenceError["operation"],
  cause: unknown,
): ConnectionPersistenceError {
  return new ConnectionPersistenceError({
    operation,
    message: `Could not ${operation.replaceAll("-", " ")}: ${String(cause)}`,
  });
}

const makeCatalogStore = Effect.fn("glasses.storage.makeCatalogStore")(function* () {
  const state = yield* Ref.make<Option.Option<ConnectionCatalogDocumentType>>(Option.none());
  const lock = yield* Semaphore.make(1);

  const loadUnlocked = Effect.gen(function* () {
    const cached = yield* Ref.get(state);
    if (Option.isSome(cached)) {
      return cached.value;
    }
    const raw = yield* Effect.tryPromise({
      try: () => hostStorage.getItem(CATALOG_STORAGE_KEY),
      catch: (cause) => catalogError("read", cause),
    });
    let catalog = EMPTY_CONNECTION_CATALOG_DOCUMENT;
    if (raw !== null && raw.trim() !== "") {
      catalog = yield* decodeCatalog(raw).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Discarding a corrupt glasses connection catalog.", {
            error: error.message,
          }).pipe(Effect.as(EMPTY_CONNECTION_CATALOG_DOCUMENT)),
        ),
      );
    }
    yield* Ref.set(state, Option.some(catalog));
    return catalog;
  });

  const read = lock.withPermits(1)(loadUnlocked);
  const update = (
    transform: (catalog: ConnectionCatalogDocumentType) => ConnectionCatalogDocumentType,
  ) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const next = transform(yield* loadUnlocked);
        const encoded = yield* encodeCatalog(next).pipe(
          Effect.mapError((cause) => catalogError("encode", cause)),
        );
        yield* Effect.tryPromise({
          try: () => hostStorage.setItem(CATALOG_STORAGE_KEY, encoded),
          catch: (cause) => catalogError("write", cause),
        });
        yield* Ref.set(state, Option.some(next));
      }),
    );

  return { read, update };
});

export const connectionStorageLayer = Layer.effectContext(
  Effect.gen(function* () {
    const catalog = yield* makeCatalogStore();

    const targetStore = ConnectionTargetStore.of({
      list: catalog.read.pipe(
        Effect.map((document) => document.targets),
        Effect.mapError((cause) => persistenceError("list-targets", cause)),
      ),
    });
    const registrationStore = ConnectionRegistrationStore.of({
      register: (registration) =>
        catalog
          .update((document) => registerConnectionInCatalog(document, registration))
          .pipe(Effect.mapError((cause) => persistenceError("register-connection", cause))),
      remove: (target) =>
        catalog
          .update((document) => removeConnectionFromCatalog(document, target))
          .pipe(Effect.mapError((cause) => persistenceError("remove-connection", cause))),
    });
    const profileStore = ProfileStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.profiles.find((profile) => profile.connectionId === connectionId),
            ),
          ),
        ),
      put: (profile) =>
        catalog.update((document) => ({
          ...document,
          profiles: replaceCatalogValue(document.profiles, (value) => value.connectionId, profile),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          profiles: removeCatalogValue(
            document.profiles,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const credentialStore = CredentialStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.credentials.find((entry) => entry.connectionId === connectionId)?.credential,
            ),
          ),
        ),
      put: (connectionId, credential) =>
        catalog.update((document) => ({
          ...document,
          credentials: replaceCatalogValue(document.credentials, (value) => value.connectionId, {
            connectionId,
            credential,
          }),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          credentials: removeCatalogValue(
            document.credentials,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const remoteTokenStore = TokenStore.make({
      get: (environmentId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
            ),
          ),
        ),
      put: (token) =>
        catalog.update((document) => ({
          ...document,
          remoteDpopTokens: replaceCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            token,
          ),
        })),
      remove: (environmentId) =>
        catalog.update((document) => ({
          ...document,
          remoteDpopTokens: removeCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            environmentId,
          ),
        })),
    });
    const cacheStore = EnvironmentCacheStore.of({
      loadShell: () => Effect.succeed(Option.none()),
      saveShell: () => Effect.void,
      loadServerConfig: () => Effect.succeed(Option.none()),
      saveServerConfig: () => Effect.void,
      loadThread: () => Effect.succeed(Option.none()),
      saveThread: () => Effect.void,
      removeThread: () => Effect.void,
      loadVcsRefs: () => Effect.succeed(Option.none()),
      saveVcsRefs: () => Effect.void,
      removeVcsRefs: () => Effect.void,
      clearVcsRefs: () => Effect.void,
      clear: () => Effect.void,
    });

    return Context.make(ConnectionTargetStore, targetStore).pipe(
      Context.add(ConnectionRegistrationStore, registrationStore),
      Context.add(ProfileStore.ConnectionProfileStore, profileStore),
      Context.add(CredentialStore.ConnectionCredentialStore, credentialStore),
      Context.add(TokenStore.RemoteDpopAccessTokenStore, remoteTokenStore),
      Context.add(EnvironmentCacheStore, cacheStore),
    );
  }),
);
