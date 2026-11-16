import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { useDebouncedValue } from "~/state/queries";
import { cn } from "~/lib/utils";

import { linearBridge, type LinearRequestError } from "./linearBridge";
import { LinearStatusIcon } from "./LinearIcons";
import { parseLinearIssueUrl } from "./linearLinks";
import { LINEAR_MY_ISSUES_QUERY, LINEAR_SEARCH_QUERY } from "./linearQuery";
import type { LinearIssueRef } from "./linearTypes";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/** A pasted link or a typed key like `ENG-12` opens directly, ahead of the search results. */
export function directLinearTarget(input: string): string | null {
  const trimmed = input.trim();
  if (IDENTIFIER.test(trimmed)) return trimmed.toUpperCase();
  return parseLinearIssueUrl(trimmed)?.identifier ?? null;
}

type SearchState =
  | { readonly status: "loading" }
  | { readonly status: "done"; readonly issues: readonly LinearIssueRef[] }
  | { readonly status: "error"; readonly kind: LinearRequestError; readonly message: string };

/** Runs one read query through the desktop bridge; `null` variables skip it. */
function useLinearIssueList(
  query: string,
  variablesJson: string | null,
  pick: (data: unknown) => readonly LinearIssueRef[],
): SearchState {
  const [state, setState] = useState<{ key: string; value: SearchState } | null>(null);
  const key = variablesJson === null ? "" : `${query}:${variablesJson}`;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetches from Linear through the desktop bridge when the search changes
  useEffect(() => {
    const bridge = linearBridge();
    if (!bridge || variablesJson === null) return;
    let current = true;
    const variables = JSON.parse(variablesJson) as Record<string, unknown>;
    void bridge.request(query, variables).then(
      (result) => {
        if (!current) return;
        setState({
          key,
          value: result.ok
            ? { status: "done", issues: pick(result.data) }
            : { status: "error", kind: result.error, message: result.message },
        });
      },
      (cause: unknown) => {
        if (!current) return;
        setState({
          key,
          value: {
            status: "error",
            kind: "failed",
            message: cause instanceof Error ? cause.message : String(cause),
          },
        });
      },
    );
    return () => {
      current = false;
    };
  }, [key, query, variablesJson, pick]);
  return state?.key === key ? state.value : { status: "loading" };
}

const pickSearch = (data: unknown) =>
  (data as { searchIssues?: { nodes?: LinearIssueRef[] } }).searchIssues?.nodes ?? [];
const pickMine = (data: unknown) =>
  (data as { viewer?: { assignedIssues?: { nodes?: LinearIssueRef[] } } }).viewer?.assignedIssues
    ?.nodes ?? [];

export function LinearIssueSearch(props: { readonly onOpen: (identifier: string) => void }) {
  const [input, setInput] = useState("");
  const [highlight, setHighlight] = useState(0);
  const navigate = useNavigate();
  const term = useDebouncedValue(input.trim(), 250);
  const direct = directLinearTarget(input);
  // A key-shaped term like `gpt-4` may be plain text, so it still searches below the direct row.
  const searching = term.length > 0;
  const mine = useLinearIssueList(LINEAR_MY_ISSUES_QUERY, searching ? null : "{}", pickMine);
  const found = useLinearIssueList(
    LINEAR_SEARCH_QUERY,
    searching ? JSON.stringify({ term }) : null,
    pickSearch,
  );
  const list = searching ? found : mine;
  const issues = (list.status === "done" ? list.issues : []).filter(
    (issue) => issue.identifier !== direct,
  );
  const choices = [...(direct ? [direct] : []), ...issues.map((issue) => issue.identifier)];
  const active = Math.min(highlight, Math.max(choices.length - 1, 0));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + choices.length) % Math.max(choices.length, 1));
      return;
    }
    if (event.key === "Enter") {
      const choice = choices[active];
      if (!choice) return;
      event.preventDefault();
      props.onOpen(choice);
    }
  };

  const row = (identifier: string, index: number, body: ReactNode) => (
    <li key={`${identifier}:${index}`}>
      <button
        type="button"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-accent",
          index === active && "bg-accent",
        )}
        onMouseEnter={() => setHighlight(index)}
        onClick={() => props.onOpen(identifier)}
      >
        {body}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          type="search"
          aria-label="Search Linear issues"
          placeholder="Search issues, or paste a key or link"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
      </InputGroup>
      <section className="flex flex-col gap-1" aria-label="Search results">
        <h2 className="px-2 text-xs text-muted-foreground">
          {searching ? "Results" : "Assigned to you"}
        </h2>
        <ul className="flex flex-col">
          {direct
            ? row(
                direct,
                0,
                <>
                  <span className="shrink-0 font-medium">Open {direct}</span>
                </>,
              )
            : null}
          {issues.map((issue, index) =>
            row(
              issue.identifier,
              index + (direct ? 1 : 0),
              <>
                <LinearStatusIcon state={issue.state} />
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                  {issue.identifier}
                </span>
                <span className="min-w-0 truncate">{issue.title}</span>
              </>,
            ),
          )}
        </ul>
        {list.status === "loading" && (searching || !direct) ? (
          <p className="px-2 text-xs text-muted-foreground">Searching…</p>
        ) : null}
        {list.status === "done" && issues.length === 0 && !direct ? (
          <p className="px-2 text-sm text-muted-foreground">
            {searching ? "No issues match." : "No open issues are assigned to you."}
          </p>
        ) : null}
        {list.status === "error" ? (
          <div className="flex flex-col items-start gap-2 px-2 text-sm text-muted-foreground">
            {list.message}
            {list.kind === "no-key" || list.kind === "unauthorized" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigate({ to: "/settings/diffs" })}
              >
                Open Settings
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
