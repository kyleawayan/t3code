import { LinearClient, NetworkLinearError } from "@linear/sdk";
import * as Electron from "electron";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import * as Channels from "./linearChannels.ts";
import { setLinearHistoryClaim } from "./linearSwipe.ts";
import {
  classifyLinearError,
  isReadOnlyQuery,
  linearUploadUrl,
  type LinearRequestResult,
} from "./linearRequest.ts";

const KEY_FILE = "linear-api-key.json";
const REQUEST_TIMEOUT = "15 seconds";

const KeyDocument = Schema.Struct({
  version: Schema.Literal(1),
  encryptedKey: Schema.String,
  workspaceName: Schema.String,
  workspaceUrlKey: Schema.String,
  organizationId: Schema.optional(Schema.String),
});
type KeyDocument = typeof KeyDocument.Type;
const KeyDocumentJson = Schema.fromJsonString(KeyDocument);
const decodeKeyDocument = Schema.decodeUnknownOption(KeyDocumentJson);
const encodeKeyDocument = Schema.encodeEffect(KeyDocumentJson);

class LinearKeyStoreError extends Schema.TaggedError<LinearKeyStoreError>()("LinearKeyStoreError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

interface StoredKey {
  readonly key: string;
  readonly linear: LinearClient;
  readonly workspaceName: string;
  readonly workspaceUrlKey: string;
  readonly organizationId: string | undefined;
}

class LinearSdkError extends Schema.TaggedError<LinearSdkError>()("LinearSdkError", {
  cause: Schema.Defect(),
}) {}

const withTimeout = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: REQUEST_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new LinearSdkError({
            cause: new NetworkLinearError({ message: "Linear took too long to respond." }),
          }),
        ),
    }),
  );

const sendQuery = (linear: LinearClient, query: string, variables: Record<string, unknown>) =>
  Effect.tryPromise({
    // oxlint-disable-next-line t3code/no-rpc-permission-bypass -- the Linear SDK's GraphQL client, not T3's RPC client
    try: () => linear.client.rawRequest<unknown, Record<string, unknown>>(query, variables),
    catch: (cause) => new LinearSdkError({ cause }),
  }).pipe(
    withTimeout,
    Effect.map((response): LinearRequestResult => ({ ok: true, data: response.data })),
    Effect.catch((failure) => Effect.succeed(classifyLinearError(failure.cause))),
  );

/** Validates a key through the SDK and returns its workspace. */
const readOrganization = (linear: LinearClient) =>
  Effect.tryPromise({
    try: async () => {
      const organization = await linear.organization;
      return { id: organization.id, name: organization.name, urlKey: organization.urlKey };
    },
    catch: (cause) => new LinearSdkError({ cause }),
  }).pipe(withTimeout);

/** Fork: the Linear tab's key lives encrypted in this process; the renderer only gets results. */
export const installLinearIpcHandlers = Effect.fn("desktop.linear.installIpcHandlers")(
  function* () {
    const ipc = yield* DesktopIpc.DesktopIpc;
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
    const random = yield* SecureRandom.SecureRandom;
    const keyPath = path.join(environment.stateDir, KEY_FILE);
    // undefined: not read yet; null: no key saved.
    const cache = yield* Ref.make<StoredKey | null | undefined>(undefined);
    // The network hooks below run synchronously, so they read this copy of the cached key.
    let active: StoredKey | null = null;
    const remember = (stored: StoredKey | null) =>
      Ref.set(cache, stored).pipe(Effect.tap(() => Effect.sync(() => (active = stored))));

    const encryptionAvailable = safeStorage.isEncryptionAvailable.pipe(
      Effect.orElseSucceed(() => false),
    );

    const readStoredKey = Effect.gen(function* () {
      const cached = yield* Ref.get(cache);
      if (cached !== undefined) return cached;
      const raw = yield* fileSystem.readFileString(keyPath).pipe(Effect.orElseSucceed(() => null));
      const document = raw === null ? null : decodeKeyDocument(raw);
      let stored: StoredKey | null = null;
      if (document !== null && document._tag === "Some" && (yield* encryptionAvailable)) {
        const key = yield* Effect.fromResult(Base64.decode(document.value.encryptedKey)).pipe(
          Effect.flatMap((bytes) => safeStorage.decryptString(bytes)),
          Effect.orElseSucceed(() => null),
        );
        if (key !== null) {
          stored = {
            key,
            linear: new LinearClient({ apiKey: key }),
            workspaceName: document.value.workspaceName,
            workspaceUrlKey: document.value.workspaceUrlKey,
            organizationId: document.value.organizationId,
          };
        }
      }
      yield* remember(stored);
      return stored;
    });

    const writeKeyDocument = Effect.fn("desktop.linear.writeKey")(function* (
      document: KeyDocument,
    ) {
      const tempPath = `${keyPath}.${(yield* random.uuidV4()).replace(/-/g, "")}.tmp`;
      yield* fileSystem
        .makeDirectory(path.dirname(keyPath), { recursive: true })
        .pipe(Effect.mapError((cause) => new LinearKeyStoreError({ operation: "mkdir", cause })));
      const encoded = yield* encodeKeyDocument(document).pipe(
        Effect.mapError((cause) => new LinearKeyStoreError({ operation: "encode", cause })),
      );
      yield* fileSystem
        .writeFileString(tempPath, encoded, { mode: 0o600 })
        .pipe(Effect.mapError((cause) => new LinearKeyStoreError({ operation: "write", cause })));
      yield* fileSystem
        .rename(tempPath, keyPath)
        .pipe(Effect.mapError((cause) => new LinearKeyStoreError({ operation: "rename", cause })));
    });

    const statusOf = (stored: StoredKey | null, available: boolean) => ({
      hasKey: stored !== null,
      encryptionAvailable: available,
      workspaceName: stored?.workspaceName ?? null,
      workspaceUrlKey: stored?.workspaceUrlKey ?? null,
    });

    yield* ipc.handle(
      DesktopIpc.makeIpcMethod({
        channel: Channels.LINEAR_KEY_STATUS_CHANNEL,
        payload: Schema.Void,
        result: Schema.Unknown,
        handler: Effect.fn("desktop.linear.status")(function* () {
          return statusOf(yield* readStoredKey, yield* encryptionAvailable);
        }),
      }),
    );

    yield* ipc.handle(
      DesktopIpc.makeIpcMethod({
        channel: Channels.LINEAR_SET_KEY_CHANNEL,
        payload: Schema.String,
        result: Schema.Unknown,
        handler: Effect.fn("desktop.linear.setKey")(function* (rawKey) {
          const key = rawKey.trim();
          if (key.length === 0) {
            return { ok: false, error: "rejected", message: "Paste an API key first." };
          }
          if (!(yield* encryptionAvailable)) {
            return { ok: false, error: "failed", message: "Keychain encryption isn't available." };
          }
          const linear = new LinearClient({ apiKey: key });
          const organization = yield* readOrganization(linear).pipe(
            Effect.catch((failure) => Effect.succeed(classifyLinearError(failure.cause))),
          );
          if ("ok" in organization) {
            return organization.ok
              ? { ok: false, error: "failed", message: "Linear didn't return a workspace." }
              : organization;
          }
          const encrypted = yield* safeStorage.encryptString(key);
          const document: KeyDocument = {
            version: 1,
            encryptedKey: Base64.encode(encrypted),
            workspaceName: organization.name,
            workspaceUrlKey: organization.urlKey,
            organizationId: organization.id,
          };
          yield* writeKeyDocument(document);
          const stored: StoredKey = {
            key,
            linear,
            workspaceName: organization.name,
            workspaceUrlKey: organization.urlKey,
            organizationId: organization.id,
          };
          yield* remember(stored);
          return { ok: true, status: statusOf(stored, true) };
        }),
      }),
    );

    yield* ipc.handle(
      DesktopIpc.makeIpcMethod({
        channel: Channels.LINEAR_CLEAR_KEY_CHANNEL,
        payload: Schema.Void,
        result: Schema.Boolean,
        handler: Effect.fn("desktop.linear.clearKey")(function* () {
          yield* fileSystem
            .remove(keyPath, { force: true })
            .pipe(
              Effect.mapError((cause) => new LinearKeyStoreError({ operation: "remove", cause })),
            );
          yield* remember(null);
          return true;
        }),
      }),
    );

    yield* ipc.handle(
      DesktopIpc.makeIpcMethod({
        channel: Channels.LINEAR_REQUEST_CHANNEL,
        payload: Schema.Struct({
          query: Schema.String,
          variables: Schema.Record(Schema.String, Schema.Unknown),
        }),
        result: Schema.Unknown,
        handler: Effect.fn("desktop.linear.request")(function* ({ query, variables }) {
          if (!isReadOnlyQuery(query)) {
            return { ok: false, error: "rejected", message: "Only read queries are allowed." };
          }
          const stored = yield* readStoredKey;
          if (stored === null) {
            return { ok: false, error: "no-key", message: "Add a Linear API key in Settings." };
          }
          return yield* sendQuery(stored.linear, query, variables);
        }),
      }),
    );
    // Linear's upload links need the key. Only the key's own workspace uploads get it, and
    // links carrying a stored (often expired) signature go to the bare path the key unlocks.
    // Electron keeps one listener per event per session; nothing else hooks the app window's.
    const uploads = { urls: ["https://uploads.linear.app/*"] };
    Electron.session.defaultSession.webRequest.onBeforeRequest(uploads, (details, callback) => {
      const bare = active && linearUploadUrl(details.url, active.organizationId);
      callback(bare && bare !== details.url ? { redirectURL: bare } : {});
    });
    Electron.session.defaultSession.webRequest.onBeforeSendHeaders(uploads, (details, callback) => {
      callback(
        active && linearUploadUrl(details.url, active.organizationId) === details.url
          ? { requestHeaders: { ...details.requestHeaders, Authorization: active.key } }
          : {},
      );
    });
    yield* ipc.handle(
      DesktopIpc.makeIpcMethod({
        channel: Channels.LINEAR_HISTORY_CLAIM_CHANNEL,
        payload: Schema.Boolean,
        result: Schema.Boolean,
        handler: (claimed, event) =>
          Effect.sync(() => {
            if (event) setLinearHistoryClaim(event.sender.id, claimed);
            return true;
          }),
      }),
    );
  },
);
