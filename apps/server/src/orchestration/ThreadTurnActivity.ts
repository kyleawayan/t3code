/**
 * ThreadTurnActivityService - live, non-persisted answer to "is this turn
 * actually producing anything right now?"
 *
 * The durable activity log records what a turn did. This records whether it is
 * doing anything, at a granularity the log deliberately does not keep: a
 * spinner and a wedged turn look identical, and the difference is worth knowing
 * in seconds. Clients drive a liveness pulse off `tokenChunks`, which only ever
 * advances on a token that really arrived — so a pulse that stops is a real
 * stall, with no threshold or heuristic involved.
 *
 * Derived from provider events every adapter already emits, so this is not a
 * Claude feature: a provider that streams reasoning gets a pulse through the
 * thinking phase, and one that does not still gets accurate tool and waiting
 * states with a pulse while its answer streams.
 *
 * Nothing here is persisted or replayed. It describes the present moment; a
 * reconnecting client re-derives it from the next event.
 *
 * @module ThreadTurnActivityService
 */
import type {
  ProviderRuntimeEvent,
  ThreadTurnActivity,
  TurnActivityState,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Emission floor while tokens flow. The pulse only needs enough updates to look
 * continuous; forwarding every delta would put token-rate traffic on the socket
 * to animate a few pixels.
 */
export const GENERATING_EMIT_INTERVAL_MS = 250;

/** Characters per token, near enough for a progress read. */
const CHARS_PER_TOKEN = 4;

export interface TurnActivitySnapshot {
  readonly state: TurnActivityState;
  readonly tokenChunks: number;
  /** Approximate tokens generated this turn, from streamed delta length. */
  readonly generatedTokens: number;
  /** Epoch ms of the last token chunk, or undefined if none this turn. */
  readonly lastTokenAtMs: number | undefined;
  /** Epoch ms this snapshot was last published. */
  readonly emittedAtMs: number;
}

/**
 * Fold one provider event into the next activity state, or undefined when the
 * event says nothing about liveness.
 *
 * Deliberately reads only event types that live in the shared contract. Tool
 * lifecycle is tracked by open-item count rather than a boolean, because
 * parallel tool calls close one at a time and the turn is only back to
 * "should be producing" when the last one returns.
 */
export const nextTurnActivityState = (input: {
  readonly event: Pick<ProviderRuntimeEvent, "type">;
  readonly streamKind: string | undefined;
  readonly openToolCount: number;
}): { readonly state: TurnActivityState; readonly tokenArrived: boolean } | undefined => {
  switch (input.event.type) {
    case "content.delta":
      // Reasoning and assistant text both count: the question is whether the
      // model is emitting, not what it is emitting.
      if (input.streamKind !== "reasoning_text" && input.streamKind !== "assistant_text") {
        return undefined;
      }
      return { state: "generating", tokenArrived: true };
    case "turn.started":
      return { state: "quiet", tokenArrived: false };
    case "item.started":
      return { state: "tool", tokenArrived: false };
    case "item.completed":
      // Back to expecting tokens only once every open tool has returned.
      return input.openToolCount > 0
        ? { state: "tool", tokenArrived: false }
        : { state: "quiet", tokenArrived: false };
    case "request.opened":
    case "user-input.requested":
      return { state: "waiting", tokenArrived: false };
    case "request.resolved":
    case "user-input.resolved":
      return { state: "quiet", tokenArrived: false };
    case "turn.completed":
    case "turn.aborted":
    case "session.exited":
      return { state: "idle", tokenArrived: false };
    default:
      return undefined;
  }
};

/**
 * Should this transition go on the wire now?
 *
 * Every state change ships immediately — those are what stop a client from
 * alarming during a legitimately quiet tool call. A continuing "generating"
 * ships at most every {@link GENERATING_EMIT_INTERVAL_MS}. When generation
 * stops, emission simply stops with it: the client's pulse freezes because the
 * updates freeze, which is the whole design.
 */
export const shouldEmitTurnActivity = (input: {
  readonly previous: TurnActivitySnapshot | undefined;
  readonly nextState: TurnActivityState;
  readonly nowMs: number;
  readonly intervalMs: number;
}): boolean => {
  if (input.previous === undefined) return true;
  if (input.previous.state !== input.nextState) return true;
  return input.nowMs - input.previous.emittedAtMs >= input.intervalMs;
};

export class ThreadTurnActivityService extends Context.Service<
  ThreadTurnActivityService,
  {
    /**
     * Fold a provider event in. Returns the activity to publish, or undefined
     * when the event changed nothing worth sending.
     */
    readonly observe: (input: {
      readonly threadId: string;
      readonly event: Pick<ProviderRuntimeEvent, "type">;
      readonly streamKind: string | undefined;
      /**
       * Characters in this delta, when the event carries one. Real output
       * volume rather than a frame count, so a burst and a trickle no longer
       * look the same — and it comes from the delta every provider already
       * streams, so it stays provider-agnostic.
       */
      readonly deltaLength: number | undefined;
      readonly openToolCount: number;
      readonly nowMs: number;
    }) => ThreadTurnActivity | undefined;

    readonly get: (threadId: string) => TurnActivitySnapshot | undefined;

    readonly clear: (threadId: string) => void;

    /** Deliver an activity to every subscriber. */
    readonly publish: (activity: ThreadTurnActivity) => Effect.Effect<void>;

    /** Live feed. Returns an unsubscribe function. */
    readonly subscribe: (
      listener: (activity: ThreadTurnActivity) => Effect.Effect<void>,
    ) => Effect.Effect<() => void>;
  }
>()("t3/orchestration/ThreadTurnActivity/ThreadTurnActivityService") {}

export function make(options?: {
  readonly generatingEmitIntervalMs?: number;
}): ThreadTurnActivityService["Service"] {
  const intervalMs = Math.max(1, options?.generatingEmitIntervalMs ?? GENERATING_EMIT_INTERVAL_MS);
  const byThreadId = new Map<string, TurnActivitySnapshot>();
  const listeners = new Set<(activity: ThreadTurnActivity) => Effect.Effect<void>>();

  return {
    observe: (input) => {
      const resolved = nextTurnActivityState({
        event: input.event,
        streamKind: input.streamKind,
        openToolCount: input.openToolCount,
      });
      if (!resolved) return undefined;

      const previous = byThreadId.get(input.threadId);
      // A new turn restarts the count, so the pulse never inherits the last
      // turn's travel.
      const carriedChunks =
        resolved.state === "idle" || input.event.type === "turn.started"
          ? 0
          : (previous?.tokenChunks ?? 0);
      const tokenChunks = carriedChunks + (resolved.tokenArrived ? 1 : 0);
      const carriedTokens =
        resolved.state === "idle" || input.event.type === "turn.started"
          ? 0
          : (previous?.generatedTokens ?? 0);
      const generatedTokens =
        carriedTokens +
        (resolved.tokenArrived && input.deltaLength
          ? Math.ceil(input.deltaLength / CHARS_PER_TOKEN)
          : 0);

      if (
        !shouldEmitTurnActivity({
          previous,
          nextState: resolved.state,
          nowMs: input.nowMs,
          intervalMs,
        })
      ) {
        // Still record the token so the count stays true across throttled ticks.
        byThreadId.set(input.threadId, {
          ...previous!,
          tokenChunks,
          generatedTokens,
          ...(resolved.tokenArrived ? { lastTokenAtMs: input.nowMs } : {}),
        });
        return undefined;
      }

      const snapshot: TurnActivitySnapshot = {
        state: resolved.state,
        tokenChunks,
        generatedTokens,
        lastTokenAtMs: resolved.tokenArrived ? input.nowMs : previous?.lastTokenAtMs,
        emittedAtMs: input.nowMs,
      };
      if (resolved.state === "idle") {
        byThreadId.delete(input.threadId);
      } else {
        byThreadId.set(input.threadId, snapshot);
      }

      return {
        threadId: input.threadId,
        state: snapshot.state,
        tokenChunks: snapshot.tokenChunks,
        // Omitted rather than zero when nothing has streamed: absent means
        // "this provider gave us no volume", which the client reads as a cue
        // to fall back to frame counting.
        ...(snapshot.generatedTokens > 0 ? { generatedTokens: snapshot.generatedTokens } : {}),
        updatedAt: DateTime.formatIso(DateTime.makeUnsafe(input.nowMs)),
      } as ThreadTurnActivity;
    },
    get: (threadId) => byThreadId.get(threadId),
    clear: (threadId) => {
      byThreadId.delete(threadId);
    },
    publish: (activity) =>
      Effect.gen(function* () {
        for (const listener of listeners) {
          // One slow or failing subscriber must never stall the ingestion
          // worker every other thread's events flow through.
          yield* listener(activity).pipe(Effect.ignoreCause({ log: true }));
        }
      }),
    subscribe: (listener) =>
      Effect.sync(() => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
  };
}

export const layer = Layer.effect(
  ThreadTurnActivityService,
  Effect.sync(() => make()),
);
