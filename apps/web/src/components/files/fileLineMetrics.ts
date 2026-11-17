import { DEFAULT_VIRTUAL_FILE_METRICS, type VirtualFileMetrics } from "@pierre/diffs";

import { diffLineHeightForCodeSize } from "~/appearanceFonts";
import { useClientSettings } from "~/hooks/useSettings";

/** Fork: file previews draw rows at `--diffs-line-height`, so their virtualizer must estimate rows at it too. */
export function useFileLineMetrics(): VirtualFileMetrics {
  const codeFontSize = useClientSettings((settings) => settings.fontSizeCode);
  return { ...DEFAULT_VIRTUAL_FILE_METRICS, lineHeight: diffLineHeightForCodeSize(codeFontSize) };
}
