/**
 * Desktop-safe chrome helpers for XYAI product overlays.
 *
 * Electron's `dsh-app:` window blocks remote `https:` iframe navigation.
 * Surface plugins advertise themselves with `data-xyai-surface-*` on
 * `<html>` so the sidebar can disable destinations that never mounted.
 */

const SURFACE_ATTR = {
  models: 'data-xyai-surface-models',
  employees: 'data-xyai-surface-employees',
  knowledge: 'data-xyai-surface-knowledge',
} as const;

/** Sidebar destinations that advertise themselves on `<html>`. */
export type XyaiSurfaceId = keyof typeof SURFACE_ATTR;

/** True when this page can host remote `https:` iframes.
 * @returns False on Electron `dsh-app:` pages.
 */
export function canEmbedRemoteFrames(): boolean {
  if (typeof location === 'undefined') return true;
  return location.protocol !== 'dsh-app:';
}

/**
 * Mark a product surface as mounted on `<html>`.
 *
 * @param surface - Surface id (`models` / `employees` / `knowledge`).
 * @returns Disposer that removes the attribute.
 */
export function advertiseXyaiSurface(surface: XyaiSurfaceId): () => void {
  if (typeof document === 'undefined') return () => {};
  const attr = SURFACE_ATTR[surface];
  document.documentElement.setAttribute(attr, '');
  return () => {
    document.documentElement.removeAttribute(attr);
  };
}

/**
 * Whether a surface plugin has advertised itself.
 *
 * @param surface - Surface id.
 * @returns True when the corresponding `data-xyai-surface-*` is present.
 */
export function isXyaiSurfaceMounted(surface: XyaiSurfaceId): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute(SURFACE_ATTR[surface]);
}

/**
 * Subscribe to surface-attribute changes on `<html>`.
 *
 * @param onChange - Callback after an advertisement changes.
 * @returns Disposer that disconnects the observer.
 */
export function watchXyaiSurfaces(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
}

/**
 * Overlay + footer layout that does not depend on hashed CSS-module class names.
 *
 * Footer `action` slots default to `display: contents` inside a row flex
 * footer. Forcing the wrapper that holds product-nav back to a column
 * keeps 模型广场 / 协作 / 知识库 stacked instead of floating mid-sidebar.
 */
export const SHELL_CHROME_CSS = `
[data-slot="sidebar.footer.action"]:has([data-xyai-product-nav]) {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  width: 100% !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
}
[data-slot="sidebar.footer.action"]:has([data-xyai-product-nav]) [data-xyai-product-nav] {
  width: 100%;
}
[data-slot="sidebar.footer.action"]:has([data-xyai-interact]) {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  width: 100% !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
}
div:has(> [data-slot="sidebar.footer.action"] > [data-xyai-product-nav]),
div:has(> [data-slot="sidebar.footer.action"] > [data-xyai-interact]) {
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 6px !important;
}
[data-xyai-interact][data-xyai-empty] {
  min-height: 0;
  padding-bottom: 0;
}
[data-xyai-interact][data-xyai-empty] [data-xyai-interact-empty] {
  display: none;
}
`;
