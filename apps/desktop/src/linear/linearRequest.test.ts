import {
  AuthenticationLinearError,
  ForbiddenLinearError,
  InvalidInputLinearError,
  NetworkLinearError,
  RatelimitedLinearError,
} from "@linear/sdk";
import { describe, expect, it } from "vite-plus/test";

import { classifyLinearError, isReadOnlyQuery, linearUploadUrl } from "./linearRequest.ts";

describe("isReadOnlyQuery", () => {
  it.each([
    ["query($id: String!) { issue(id: $id) { title } }", true],
    ["fragment S on WorkflowState { name } query Q { viewer { id } }", true],
    ['mutation { issueUpdate(id: "x", input: {}) { success } }', false],
    ['query Q { viewer { id } } mutation M { issueDelete(id: "x") { success } }', false],
    ["subscription { issues { id } }", false],
    ["   ", false],
  ])("%s → %s", (query, expected) => {
    expect(isReadOnlyQuery(query)).toBe(expected);
  });
});

describe("linearUploadUrl", () => {
  it.each([
    [
      "https://uploads.linear.app/org/file/abc?signature=stale",
      "https://uploads.linear.app/org/file/abc",
    ],
    ["https://uploads.linear.app/other-org/file/abc?signature=valid", null],
    ["https://uploads.linear.app/org/file/abc#x", "https://uploads.linear.app/org/file/abc"],
    ["http://uploads.linear.app/org/file/abc", null],
    ["https://uploads.linear.app.evil.com/org/file/abc", null],
    ["https://user:pass@uploads.linear.app/org/file/abc", null],
    ["https://uploads.linear.app:8443/org/file/abc", null],
    ["https://example.com/image.png", null],
    ["not a url", null],
  ])("%s → %s", (raw, expected) => {
    expect(linearUploadUrl(raw, "org")).toBe(expected);
  });
});

describe("classifyLinearError", () => {
  it.each([
    [new AuthenticationLinearError(), "unauthorized"],
    [new ForbiddenLinearError(), "unauthorized"],
    [new RatelimitedLinearError(), "rate-limited"],
    [new NetworkLinearError(), "network"],
    [new TypeError("fetch failed"), "network"],
    [new InvalidInputLinearError({ message: "Query too complex" }), "failed"],
    [new Error("boom"), "failed"],
  ])("%s → %s", (error, kind) => {
    expect(classifyLinearError(error)).toMatchObject({ ok: false, error: kind });
  });

  it("keeps the data Linear returns beside a missing-issue error", () => {
    const error = new InvalidInputLinearError({
      message: "Entity not found: Issue",
      response: { status: 200, data: { issue: null }, error: "Entity not found: Issue" },
    });
    expect(classifyLinearError(error)).toEqual({ ok: true, data: { issue: null } });
  });
});
