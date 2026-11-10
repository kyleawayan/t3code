import { useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { flushSync } from "react-dom";

import {
  onWindowControlsOverlayGeometryChange,
  windowControlsOverlayHeight,
} from "../../lib/windowControlsOverlay";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { AttachmentImage } from "../media/AttachmentImage";

const MAX_ZOOM = 8;

// Subtract the caption strip, matching dialog CSS's --native-titlebar-height.
function readViewerSize() {
  return { width: window.innerWidth, height: window.innerHeight - windowControlsOverlayHeight() };
}

let viewerSize: ReturnType<typeof readViewerSize> | null = null;

// Cached so an unchanged size keeps its identity: a new one resets the zoom.
function getViewerSize() {
  const next = readViewerSize();
  if (next.width !== viewerSize?.width || next.height !== viewerSize.height) viewerSize = next;
  return viewerSize;
}

function subscribeViewerSize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  // Fullscreen caption-strip changes may not emit resize.
  const stopOverlayListener = onWindowControlsOverlayGeometryChange(onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    stopOverlayListener();
  };
}

export interface ZoomableImageHandle {
  pan: (key: string) => boolean;
}

export function ZoomableImage({
  src,
  name,
  mimeType,
  onError,
  fill = false,
  ref,
}: {
  src: string;
  name: string;
  mimeType?: string | undefined;
  onError: () => void;
  /** Fork: fill the parent and fit the image to it, instead of sizing to the window. */
  fill?: boolean;
  ref?: Ref<ZoomableImageHandle>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const windowViewerSize = useSyncExternalStore(subscribeViewerSize, getViewerSize);
  const [fillSize, setFillSize] = useState<{ width: number; height: number } | null>(null);
  const viewerSize = fill && fillSize ? fillSize : windowViewerSize;
  const [zoom, setZoom] = useState(1);
  // A resized viewer refits the image.
  const [zoomViewerSize, setZoomViewerSize] = useState(viewerSize);
  if (zoomViewerSize !== viewerSize) {
    setZoomViewerSize(viewerSize);
    setZoom(1);
  }
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const maxHeight = fill
    ? viewerSize.height
    : Math.max(1, Math.min(viewerSize.height * 0.86, viewerSize.height - 160));
  const maxWidth = fill
    ? viewerSize.width
    : viewerSize.width * 0.92 - (viewerSize.width >= 640 ? 96 : 0);
  // A vector scales without loss, and an SVG without width and height reports a tiny default size.
  const fit = Math.min(
    mimeType === "image/svg+xml" ? Infinity : 1,
    maxWidth / (naturalSize.width || 1),
    maxHeight / (naturalSize.height || 1),
  );
  const width = naturalSize.width * fit * zoom;
  const height = naturalSize.height * fit * zoom;

  useImperativeHandle(
    ref,
    () => ({
      pan(key) {
        const viewport = viewportRef.current;
        if (!viewport || zoom <= 1) return false;
        // A vertical scrollbar alone must not swallow gallery navigation.
        if (
          (key === "ArrowLeft" || key === "ArrowRight") &&
          viewport.scrollWidth <= viewport.offsetWidth
        )
          return false;
        switch (key) {
          case "ArrowLeft":
            viewport.scrollLeft -= 40;
            break;
          case "ArrowRight":
            viewport.scrollLeft += 40;
            break;
          case "ArrowUp":
            viewport.scrollTop -= 40;
            break;
          case "ArrowDown":
            viewport.scrollTop += 40;
            break;
          default:
            return false;
        }
        return true;
      },
    }),
    [zoom],
  );

  const changeZoom = (next: number, point?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
    if (!viewport || zoom === clamped) return;
    const bounds = viewport.getBoundingClientRect();
    const x = point ? point.x - bounds.left : viewport.clientWidth / 2;
    const y = point ? point.y - bounds.top : viewport.clientHeight / 2;
    const anchorX = (viewport.scrollLeft + x) / zoom;
    const anchorY = (viewport.scrollTop + y) / zoom;
    const clientX = bounds.left + x;
    const clientY = bounds.top + y;
    const image = fill ? viewport.querySelector("img") : null;
    if (image) {
      // Fork: a fitted image sits centered, so anchor on the image, not the scroll origin.
      const before = image.getBoundingClientRect();
      const fractionX = (clientX - before.left) / (before.width || 1);
      const fractionY = (clientY - before.top) / (before.height || 1);
      flushSync(() => setZoom(clamped));
      const after = image.getBoundingClientRect();
      viewport.scrollLeft += after.left + fractionX * after.width - clientX;
      viewport.scrollTop += after.top + fractionY * after.height - clientY;
      return;
    }
    // The new size must be laid out before the scroll position can keep the anchor in place.
    flushSync(() => setZoom(clamped));
    const resized = viewport.getBoundingClientRect();
    viewport.scrollLeft = anchorX * clamped - (clientX - resized.left);
    viewport.scrollTop = anchorY * clamped - (clientY - resized.top);
  };

  const attachViewport = (viewport: HTMLDivElement) => {
    viewportRef.current = viewport;
    // Trackpad pinch arrives as a ctrlKey wheel; plain wheels pan through native overflow scrolling.
    // React's onWheel is passive and cannot stop the browser's own page zoom.
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      changeZoom(zoom * Math.exp(-delta * 0.01), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    const stopObservingSize = fill
      ? observeResize(viewport, () => {
          // The border box, so a scrollbar appearing on zoom doesn't refit the image.
          const next = { width: viewport.offsetWidth, height: viewport.offsetHeight };
          // A new size refits the image, so an unchanged one must keep its identity.
          setFillSize((current) =>
            current?.width === next.width && current.height === next.height ? current : next,
          );
        })
      : null;
    return () => {
      viewport.removeEventListener("wheel", wheel);
      stopObservingSize?.();
      viewportRef.current = null;
    };
  };

  const image = (
    <AttachmentImage
      name={name}
      mimeType={mimeType}
      src={src}
      alt={name}
      draggable={false}
      className="block max-w-none select-none"
      style={naturalSize.width ? { width, height } : { maxWidth: "var(--media-width)", maxHeight }}
      onLoad={(event) => {
        setNaturalSize({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        });
      }}
      onError={onError}
    />
  );

  return (
    <div className={fill ? "flex min-h-0 w-full flex-1" : "min-w-0"}>
      <div
        ref={attachViewport}
        role="region"
        aria-label={`${name}, zoomable image`}
        aria-description="Pinch or Ctrl+scroll to zoom, scroll or drag to pan. Use Enter to toggle zoom, plus or minus to zoom, and 0 to fit."
        tabIndex={0}
        className={cn(
          "max-w-[var(--media-width)] overflow-auto overscroll-contain bg-background outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
          fill ? "size-full" : "rounded-lg shadow-2xl ring-1 ring-border/70",
        )}
        style={{
          ...(fill ? {} : { width: width || undefined, height: height || undefined, maxHeight }),
          // Fork: a click never zooms, so a drag that started at fit doesn't zoom on release.
          cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : undefined,
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!event.repeat) changeZoom(zoom > 1 ? 1 : 2);
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            changeZoom(zoom * 1.5);
          } else if (event.key === "-") {
            event.preventDefault();
            changeZoom(zoom / 1.5);
          } else if (event.key === "0") {
            event.preventDefault();
            changeZoom(1);
          }
        }}
        onPointerDown={(event) => {
          if (dragRef.current) return;
          if (event.pointerType !== "mouse" || event.button !== 0 || zoom <= 1) return;
          const viewport = event.currentTarget;
          const bounds = viewport.getBoundingClientRect();
          if (
            event.clientX - bounds.left >= viewport.clientWidth ||
            event.clientY - bounds.top >= viewport.clientHeight
          )
            return;
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          viewport.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
          event.currentTarget.scrollTop = drag.top - (event.clientY - drag.y);
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragRef.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setDragging(false);
        }}
      >
        {fill ? (
          // Centers an image smaller than the viewport; a larger one scrolls from its edge.
          <div className="flex min-h-full w-max min-w-full items-center justify-center">
            {image}
          </div>
        ) : (
          image
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {Math.round(zoom * 100)}% zoom
      </span>
    </div>
  );
}
