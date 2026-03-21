/* eslint-disable obsidianmd/no-static-styles-assignment */
import SideCardsPlugin from "../core/Plugin";

/**
  Drag-to-reorder using FLIP.
  ------------------------------
  We briefly move items in the DOM to see where they’d land,
  let the browser calculate the layout, then move them back.
  The position changes are animated with transforms.

  drag-n-drop in grid layout is still messy ehm
**/

export function attachDragToReorder(
  container: HTMLElement,
  plugin: SideCardsPlugin,
  getSortMode: () => string,
  onReorder: (newOrder: string[]) => void | Promise<void>,
  onPlaceholderMoved?: () => void
): () => void {
  let ghost: HTMLElement | null = null;
  let draggedEl: HTMLElement | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let active = false;

  let snapRects: Map<HTMLElement, DOMRect> = new Map();
  let originalOrder: HTMLElement[] = [];
  let currentTargetIndex = -1;
  let draggedIndex = -1;

  // Rects for the current targetIndex (used to avoid redundant FLIP reads)
  let lastFlipRects: Map<HTMLElement, DOMRect> = new Map();

  function getCards(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(':scope > .sc-card'));
  }

  function getCardEl(el: EventTarget | null): HTMLElement | null {
    if (!(el instanceof HTMLElement)) return null;
    if (el.closest('button, a, [contenteditable="true"], .sc-tag, .sc-copy-btn')) return null;
    return el.closest<HTMLElement>('.sc-card');
  }

  /** Compute target insert index from cursor position using snapshotted rects */
  function computeTargetIndex(clientX: number, clientY: number): number {
    const others = originalOrder.filter((_, i) => i !== draggedIndex);
    if (others.length === 0) return 0;

    let closest: HTMLElement | null = null;
    let closestDist = Infinity;
    for (const card of others) {
      const r = snapRects.get(card)!;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      if (d < closestDist) { closestDist = d; closest = card; }
    }
    if (!closest) return draggedIndex;

    const closestOrigIdx = originalOrder.indexOf(closest);
    const r = snapRects.get(closest)!;

    const isGrid = others.some(c => {
      if (c === closest) return false;
      return Math.abs(snapRects.get(c)!.top - r.top) < 10;
    });

    const insertBefore = isGrid
      ? clientX < r.left + r.width / 2
      : clientY < r.top + r.height / 2;

    if (insertBefore) {
      return closestOrigIdx <= draggedIndex ? closestOrigIdx : closestOrigIdx - 1;
    } else {
      return closestOrigIdx >= draggedIndex ? closestOrigIdx : closestOrigIdx + 1;
    }
  }

  /**
   * FLIP: temporarily reorder DOM to targetIdx, read real rects, revert.
   * Returns a map of card → new DOMRect in the target layout.
   */
  function readFlipRects(targetIdx: number): Map<HTMLElement, DOMRect> {
    // Build the new order array
    const newOrder = originalOrder.slice();
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIdx, 0, draggedEl!);

    // Suppress transitions during DOM manipulation
    originalOrder.forEach(c => { c.style.transition = 'none'; c.style.transform = ''; });

    // Temporarily reorder DOM
    newOrder.forEach(card => container.appendChild(card));

    // Force layout read
    const rects = new Map<HTMLElement, DOMRect>();
    originalOrder.forEach(c => rects.set(c, c.getBoundingClientRect()));

    // Revert DOM to original order
    originalOrder.forEach(card => container.appendChild(card));

    return rects;
  }

  /** Apply FLIP animations: translate each card from snapRect → flipRect */
  function applyFlip(flipRects: Map<HTMLElement, DOMRect>) {
    // Step 1: instantly snap each card to its "from" position (no transition)
    // This is needed because readFlipRects cleared transforms — we must re-establish
    // the current visual position before animating to the new one.
    for (const card of originalOrder) {
      if (card === draggedEl) continue;
      card.style.transition = 'none';
      // Current visual position is snapRects (home), which is where the card
      // physically sits in the DOM right now — so transform is already '' (identity).
      // We just need to make sure transition is off before we set the new value.
      card.style.transform = card.style.transform || '';
    }

    // Step 2: force a reflow so the browser registers the transition:none state
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    container.offsetHeight;

    // Step 3: set target transforms with transition — browser will animate from current → target
    for (const card of originalOrder) {
      if (card === draggedEl) continue;

      const from = snapRects.get(card)!;
      const to = flipRects.get(card)!;
      const dx = to.left - from.left;
      const dy = to.top - from.top;

      card.style.transition = 'transform 150ms cubic-bezier(0.25,0.46,0.45,0.94)';
      card.style.transform = (dx === 0 && dy === 0) ? '' : `translate(${dx}px,${dy}px)`;
    }
  }

  function clearTransforms() {
    getCards().forEach(c => {
      c.style.transition = '';
      c.style.transform = '';
    });
  }

  const onMouseDown = (e: MouseEvent) => {
    if (getSortMode() !== 'manual') return;
    if (e.button !== 0) return;
    const card = getCardEl(e.target);
    if (!card) return;

    draggedEl = card;
    originalOrder = getCards();
    draggedIndex = originalOrder.indexOf(card);
    currentTargetIndex = draggedIndex;

    // Snapshot home rects before any changes
    snapRects = new Map();
    originalOrder.forEach(c => snapRects.set(c, c.getBoundingClientRect()));

    const rect = snapRects.get(card)!;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Hide source card in-place (keeps its grid slot)
    card.style.opacity = '0';
    card.style.pointerEvents = 'none';

    // Ghost: clone with resolved computed styles so CSS vars work on document.body
    ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('sc-drag-ghost');
    const cs = getComputedStyle(card);
    ghost.style.background = cs.background;
    ghost.style.backgroundColor = cs.backgroundColor;
    ghost.style.borderColor = cs.borderColor;
    ghost.style.borderWidth = cs.borderWidth;
    ghost.style.borderStyle = cs.borderStyle;
    ghost.style.borderRadius = cs.borderRadius;
    ghost.style.color = cs.color;
    ghost.style.fontSize = cs.fontSize;
    ghost.style.lineHeight = cs.lineHeight;
    ghost.style.padding = cs.padding;
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.margin = '0';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
    ghost.style.opacity = '1';
    ghost.style.cursor = 'grabbing';
    ghost.style.transform = '';
    ghost.style.transition = '';
    document.body.appendChild(ghost);

    active = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!active || !ghost || !draggedEl) return;

    ghost.style.left = (e.clientX - offsetX) + 'px';
    ghost.style.top = (e.clientY - offsetY) + 'px';

    const newTarget = computeTargetIndex(e.clientX, e.clientY);
    if (newTarget !== currentTargetIndex) {
      currentTargetIndex = newTarget;
      // FLIP: read real layout for this target, then animate
      lastFlipRects = readFlipRects(currentTargetIndex);
      applyFlip(lastFlipRects);
    }
  };

  const onMouseUp = () => {
    if (!active || !draggedEl) return;
    active = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    ghost?.remove();
    ghost = null;

    draggedEl.style.opacity = '';
    draggedEl.style.pointerEvents = '';

    // Commit: clear transforms, reorder DOM permanently
    clearTransforms();

    const newOrder = originalOrder.slice();
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(currentTargetIndex, 0, draggedEl);
    newOrder.forEach(card => container.appendChild(card));

    const ids = newOrder.map(c => c.dataset.id ?? '').filter(Boolean);
    plugin.settings.manualOrder = ids;
    void onReorder(ids);
    onPlaceholderMoved?.();

    draggedEl = null;
    snapRects = new Map();
    lastFlipRects = new Map();
    originalOrder = [];
    currentTargetIndex = -1;
    draggedIndex = -1;
  };

  container.addEventListener('mousedown', onMouseDown);

  return () => {
    container.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    ghost?.remove();
    if (draggedEl) {
      draggedEl.style.opacity = '';
      draggedEl.style.pointerEvents = '';
    }
    clearTransforms();
    ghost = null; draggedEl = null; active = false;
    snapRects = new Map(); lastFlipRects = new Map();
    originalOrder = []; currentTargetIndex = -1; draggedIndex = -1;
  };
}
