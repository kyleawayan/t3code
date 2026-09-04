import { describe, expect, it } from "vite-plus/test";

import {
  make,
  nextTurnActivityState,
  shouldEmitTurnActivity,
  type TurnActivitySnapshot,
} from "./ThreadTurnActivity.ts";

const fold = (type: string, streamKind?: string, openToolCount = 0) =>
  nextTurnActivityState({
    event: { type } as never,
    streamKind,
    openToolCount,
  });

describe("nextTurnActivityState", () => {
  it("treats reasoning and assistant deltas alike as tokens arriving", () => {
    // The question is whether the model is emitting, not what it emits — a
    // thinking phase has to count or the whole thinking phase reads as dead.
    expect(fold("content.delta", "reasoning_text")).toEqual({
      state: "generating",
      tokenArrived: true,
    });
    expect(fold("content.delta", "assistant_text")).toEqual({
      state: "generating",
      tokenArrived: true,
    });
  });

  it("ignores deltas that are not model output", () => {
    expect(fold("content.delta", "tool_output")).toBeUndefined();
  });

  it("stays in tool until the last open tool returns", () => {
    // Parallel tool calls close one at a time; the turn is only back to
    // "should be producing" once none are left.
    expect(fold("item.completed", undefined, 1)).toEqual({ state: "tool", tokenArrived: false });
    expect(fold("item.completed", undefined, 0)).toEqual({ state: "quiet", tokenArrived: false });
  });

  it("reports waiting while a person is on the hook", () => {
    expect(fold("request.opened")?.state).toBe("waiting");
    expect(fold("user-input.requested")?.state).toBe("waiting");
    expect(fold("request.resolved")?.state).toBe("quiet");
  });

  it("goes idle when the turn or session ends", () => {
    expect(fold("turn.completed")?.state).toBe("idle");
    expect(fold("session.exited")?.state).toBe("idle");
  });

  it("says nothing about liveness for unrelated events", () => {
    expect(fold("thread.token-usage.updated")).toBeUndefined();
  });
});

describe("shouldEmitTurnActivity", () => {
  const previous: TurnActivitySnapshot = {
    state: "generating",
    tokenChunks: 5,
    generatedTokens: 20,
    lastTokenAtMs: 1_000,
    emittedAtMs: 1_000,
  };

  it("always ships a state change", () => {
    // These are what stop a client alarming during a legitimately quiet tool.
    expect(
      shouldEmitTurnActivity({ previous, nextState: "tool", nowMs: 1_001, intervalMs: 250 }),
    ).toBe(true);
  });

  it("throttles a continuing generate", () => {
    expect(
      shouldEmitTurnActivity({ previous, nextState: "generating", nowMs: 1_100, intervalMs: 250 }),
    ).toBe(false);
    expect(
      shouldEmitTurnActivity({ previous, nextState: "generating", nowMs: 1_250, intervalMs: 250 }),
    ).toBe(true);
  });
});

describe("ThreadTurnActivityService", () => {
  it("counts every token even when the emission is throttled", () => {
    // The pulse advances by the token delta, so a throttled tick must not lose
    // the tokens it covered — otherwise the bar under-reports real work.
    const service = make({ generatingEmitIntervalMs: 100 });
    service.observe({
      threadId: "t",
      event: { type: "turn.started" } as never,
      streamKind: undefined,
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 0,
    });
    for (let i = 1; i <= 5; i++) {
      service.observe({
        threadId: "t",
        event: { type: "content.delta" } as never,
        streamKind: "assistant_text",
        deltaLength: undefined,
        openToolCount: 0,
        nowMs: i * 10,
      });
    }
    const emitted = service.observe({
      threadId: "t",
      event: { type: "content.delta" } as never,
      streamKind: "assistant_text",
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 200,
    });
    expect(emitted?.state).toBe("generating");
    expect(emitted?.tokenChunks).toBe(6);
  });

  it("restarts the count on a new turn", () => {
    // A fresh turn must not inherit the previous turn's travel.
    const service = make({ generatingEmitIntervalMs: 0 });
    service.observe({
      threadId: "t",
      event: { type: "content.delta" } as never,
      streamKind: "assistant_text",
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 0,
    });
    const started = service.observe({
      threadId: "t",
      event: { type: "turn.started" } as never,
      streamKind: undefined,
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 1,
    });
    expect(started?.tokenChunks).toBe(0);
  });

  it("forgets a thread once its turn ends", () => {
    const service = make({ generatingEmitIntervalMs: 0 });
    service.observe({
      threadId: "t",
      event: { type: "content.delta" } as never,
      streamKind: "assistant_text",
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 0,
    });
    service.observe({
      threadId: "t",
      event: { type: "turn.completed" } as never,
      streamKind: undefined,
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 1,
    });
    expect(service.get("t")).toBeUndefined();
  });

  it("accumulates real output volume, not just frame count", () => {
    // A burst and a trickle must not look the same: the bar moves by how much
    // was actually generated, taken from the delta every provider streams.
    const service = make({ generatingEmitIntervalMs: 0 });
    service.observe({
      threadId: "t",
      event: { type: "turn.started" } as never,
      streamKind: undefined,
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 0,
    });
    const small = service.observe({
      threadId: "t",
      event: { type: "content.delta" } as never,
      streamKind: "assistant_text",
      deltaLength: 8,
      openToolCount: 0,
      nowMs: 1,
    });
    const big = service.observe({
      threadId: "t",
      event: { type: "content.delta" } as never,
      streamKind: "reasoning_text",
      deltaLength: 400,
      openToolCount: 0,
      nowMs: 2,
    });
    expect(small?.generatedTokens).toBe(2);
    // Reasoning counts the same as answer text — the thinking phase is exactly
    // where the volume read matters.
    expect(big?.generatedTokens).toBe(102);
    // Frames still advance one at a time, so the two measures stay distinct.
    expect(big?.tokenChunks).toBe(2);
  });

  it("omits volume entirely when a provider streams none", () => {
    // Absent, not zero: the client reads absence as "fall back to frames".
    const service = make({ generatingEmitIntervalMs: 0 });
    const emitted = service.observe({
      threadId: "t",
      event: { type: "turn.started" } as never,
      streamKind: undefined,
      deltaLength: undefined,
      openToolCount: 0,
      nowMs: 0,
    });
    expect(emitted?.generatedTokens).toBeUndefined();
  });
});
