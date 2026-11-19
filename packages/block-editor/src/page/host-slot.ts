/** Marks a host's element inside the page: an inline page icon, an `afterBlock` element. */
export const HOST_SLOT_ATTR = "data-gotipe-host";

/**
 * Whether a key comes from a host's element inside the page. Such a key is the host's: it goes on
 * to the host's listeners on `document` and `window`, and the editor's shortcuts and menus, which
 * listen there too, leave it alone.
 */
export function isHostKey(event: { target: EventTarget | null }): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(`[${HOST_SLOT_ATTR}]`) !== null;
}
