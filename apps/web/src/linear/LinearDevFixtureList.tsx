// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import { SquishText } from "~/components/SquishText";

import { DEV_LINEAR_FIXTURE_LIST } from "./linearDevFixtures";
import { LinearStatusIcon } from "./LinearIcons";

/** Dev builds only: local fixture issues that open without a Linear key. */
export default function LinearDevFixtureList(props: {
  readonly onOpen: (identifier: string) => void;
}) {
  return (
    <section className="flex flex-col gap-1" aria-label="Dev fixtures">
      <h2 className="px-2 text-xs text-muted-foreground">Dev fixtures</h2>
      <ul className="flex flex-col">
        {DEV_LINEAR_FIXTURE_LIST.map((issue) => (
          <li key={issue.identifier}>
            <button
              type="button"
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-accent"
              onClick={() => props.onOpen(issue.identifier)}
            >
              <LinearStatusIcon state={issue.state} />
              <SquishText className="w-14 shrink-0 text-muted-foreground tabular-nums">
                {issue.identifier}
              </SquishText>
              <span className="min-w-0 truncate">{issue.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
