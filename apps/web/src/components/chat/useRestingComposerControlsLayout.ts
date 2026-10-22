import { measureRestingComposerControls } from "./restingComposerControlsMeasurement";
import { observeResize } from "~/lib/observeResize";
import {
  resolveRestingComposerControlsLayout,
  resolveRestingComposerControlsNaturalWidth,
} from "../composerFooterLayout";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * `actions` sits beside the controls in one footer row. When the controls cannot fit there even
 * with every label at its shortest, the attach button gives up its room. A hidden attach button
 * keeps its size out of flow and is counted either way, so the footer does not bounce.
 */
function actionsWidthWithAttach(actions: HTMLElement): number {
  const width = actions.getBoundingClientRect().width;
  const attach = actions.querySelector<HTMLElement>("[data-composer-attach-action]");
  if (!attach || getComputedStyle(attach).position !== "absolute") return width;
  return (
    width +
    attach.getBoundingClientRect().width +
    (Number.parseFloat(getComputedStyle(actions).columnGap) || 0)
  );
}

export function useRestingComposerControlsLayout(
  host: HTMLDivElement | null,
  useControlsAsHost = false,
  actions: HTMLElement | null = null,
) {
  const [controls, setControls] = useState<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const attachControls = (element: HTMLDivElement | null) => {
    controlsRef.current = element;
    setControls(element);
  };
  const [layout, setLayout] = useState<{
    hiddenCount: number;
    iconOnlyCount?: number;
    visible: boolean;
  }>({ hiddenCount: 0, visible: true });
  const [actionsCrowded, setActionsCrowded] = useState(false);

  const measure = () => {
    const currentHost = useControlsAsHost ? controls : host;
    if (currentHost === null || !controls) return;

    const measurement = measureRestingComposerControls(controls);
    if (!measurement) return;
    const row = controls.parentElement;
    if (actions && row) {
      const rowStyle = getComputedStyle(row);
      const besideActions =
        row.clientWidth -
        (Number.parseFloat(rowStyle.paddingInlineStart) || 0) -
        (Number.parseFloat(rowStyle.paddingInlineEnd) || 0) -
        actionsWidthWithAttach(actions) -
        (Number.parseFloat(rowStyle.columnGap) || 0);
      setActionsCrowded(resolveRestingComposerControlsNaturalWidth(measurement) > besideActions);
    }
    const style = getComputedStyle(currentHost);
    const hostWidth =
      currentHost.clientWidth -
      (Number.parseFloat(style.paddingInlineStart) || 0) -
      (Number.parseFloat(style.paddingInlineEnd) || 0);

    setLayout((current) => {
      const next = resolveRestingComposerControlsLayout({
        ...measurement,
        hostWidth,
        previous: current,
      });
      return next.hiddenCount === current.hiddenCount &&
        next.iconOnlyCount === current.iconOnlyCount &&
        next.visible === current.visible
        ? current
        : next;
    });
  };

  useLayoutEffect(() => {
    const currentHost = useControlsAsHost ? controls : host;
    if (!currentHost || !controls) return;
    let stopObserving = () => {};
    const observeControls = () => {
      stopObserving();
      stopObserving = observeResize(
        [
          currentHost,
          controls,
          ...(actions ? [actions] : []),
          ...controls.querySelectorAll<HTMLElement>(
            "[data-resting-block], [data-composer-control-label], [data-chat-provider-model-picker-label]",
          ),
        ],
        measure,
      );
      measure();
    };
    observeControls();
    const mutations = new MutationObserver(observeControls);
    mutations.observe(controls, { childList: true, subtree: true, characterData: true });
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      stopObserving();
      mutations.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [host, controls, useControlsAsHost, actions, measure]);

  return {
    controlsRef,
    attachControls,
    hiddenBlockCount: layout.hiddenCount,
    iconOnlyBlockCount: layout.iconOnlyCount ?? 0,
    controlsVisible: layout.visible,
    actionsCrowded: actions !== null && actionsCrowded,
  };
}
