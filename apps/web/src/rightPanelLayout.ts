export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
// Width is owned by RightPanelSheet via an inline style (user-resizable +
// persisted), so this drops the old fixed width/min/max classes. max-w-none
// lifts the SheetPopup right-side default cap of max-w-md (28rem) so the
// panel can grow to the resized width.
export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "p-0 max-w-none wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";
