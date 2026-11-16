// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import { useState, type FormEvent } from "react";

import { SettingsRow, SettingsSection } from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { linearBridge, useLinearKeyStore } from "./linearBridge";

/** Fork: Linear tab. Desktop only: the key is stored by the desktop app, encrypted with the Keychain. */
export function LinearSettingsSection() {
  const status = useLinearKeyStore((state) => state.status);
  const setStatus = useLinearKeyStore((state) => state.setStatus);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridge = linearBridge();
  if (!bridge) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await bridge.setKey(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft("");
      setStatus(result.status);
    } catch {
      setError("The key couldn't be saved.");
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await bridge.clearKey();
      setStatus({
        hasKey: false,
        encryptionAvailable: status?.encryptionAvailable ?? true,
        workspaceName: null,
        workspaceUrlKey: null,
      });
    } catch {
      setError("The key couldn't be removed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsSection id="linear" title="Linear">
      {status?.hasKey ? (
        <SettingsRow
          title="API key"
          description={`Saved in Keychain for the ${status.workspaceName ?? "Linear"} workspace. Links to its issues open in a Linear tab beside the thread.`}
          control={
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void remove()}>
              Remove
            </Button>
          }
        >
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </SettingsRow>
      ) : (
        <SettingsRow
          title="API key"
          description="Paste a read-only personal API key (Linear → Settings → Security & access) to open Linear issue links in a tab beside the thread. It's stored encrypted in the Keychain."
        >
          <form
            className="mt-2 flex w-full flex-col gap-2 sm:flex-row"
            onSubmit={(event) => void save(event)}
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="lin_api_…"
              aria-label="Linear API key"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={pending || draft.trim().length === 0}>
              {pending ? "Checking…" : "Save"}
            </Button>
          </form>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
