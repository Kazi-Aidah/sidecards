import SideCardsPlugin from "../core/Plugin";

/**
  Drag-to-reorder using FLIP.
  ------------------------------
  Uses Pointer Events API for unified mouse + touch support.
  We briefly move items in the DOM to see where they'd land,
  let the browser calculate the layout, then move them back.
  The position changes are animated with transforms.
**/

export function attachDragToReorder(
  container: HTMLElement,
  plugin: SideCardsPlugin,
  getSortMode: () => string,
  onReorder: (newIds: string[]) => Promise<void>,
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
  let lastFlipRects: Map<HTMLElement, DOMRect> = new Map();

  function getCards(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(':scope > .sc-card'));
  }

  function getCardEl(el: EventTarget | null): HTMLElement | null {
    if (!(el instanceof HTMLElement)) return null;
    if (el.closest('button, a, [contenteditable="true"], .sc-tag, .sc-copy-btn')) return null;
    return el.closest<HTMLElement>('.sc-card');
  }

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

  function readFlipRects(targetIdx: number): Map<HTMLElement, DOMRect> {
    const newOrder = originalOrder.slice();
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIdx, 0, draggedEl!);

    originalOrder.forEach(c => {
      c.setCssProps({ 'transition': 'none', 'transform': '' });
    });

    newOrder.forEach(card => container.appendChild(card));

    const rects = new Map<HTMLElement, DOMRect>();
    originalOrder.forEach(c => rects.set(c, c.getBoundingClientRect()));

    originalOrder.forEach(card => container.appendChild(card));

    return rects;
  }

  function applyFlip(flipRects: Map<HTMLElement, DOMRect>) {
    for (const card of originalOrder) {
      if (card === draggedEl) continue;
      card.setCssProps({ 'transition': 'none', 'transform': card.style.transform || '' });
    }

    void container.offsetHeight;

    for (const card of originalOrder) {
      if (card === draggedEl) continue;

      const from = snapRects.get(card)!;
      const to = flipRects.get(card)!;
      const dx = to.left - from.left;
      const dy = to.top - from.top;

      card.setCssProps({
        'transition': 'transform 150ms cubic-bezier(0.25,0.46,0.45,0.94)',
        'transform': (dx === 0 && dy === 0) ? '' : `translate(${dx}px,${dy}px)`
      });
    }
  }

  function clearTransforms() {
    getCards().forEach(c => {
      c.setCssProps({ 'transition': '', 'transform': '' });
    });
  }

  let dragStartX = 0;
  let dragStartY = 0;
  let dragPending = false;
  const DRAG_THRESHOLD = 5;
  const TOUCH_HOLD_MS = 300; // touch must be held this long before drag activates
  let touchHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let touchHoldReady = false; // true once the hold timer fires

  // Cancel if a native HTML5 drag starts (e.g. drag-to-editor)
  const onNativeDragStart = () => {
    if (!dragPending && !active) return;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
    touchHoldReady = false;
    ghost?.remove();
    ghost = null;
    if (draggedEl) {
      draggedEl.setCssProps({ 'opacity': '', 'pointer-events': '' });
    }
    clearTransforms();
    draggedEl = null; active = false; dragPending = false;
    snapRects = new Map(); lastFlipRects = new Map();
    originalOrder = []; currentTargetIndex = -1; draggedIndex = -1;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (getSortMode() !== 'manual') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const card = getCardEl(e.target);
    if (!card) return;

    draggedEl = card;
    originalOrder = getCards();
    draggedIndex = originalOrder.indexOf(card);
    currentTargetIndex = draggedIndex;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPending = true;
    touchHoldReady = e.pointerType !== 'touch'; // mouse is ready immediately

    if (e.pointerType === 'touch') {
      touchHoldTimer = setTimeout(() => {
        touchHoldReady = true;
      }, TOUCH_HOLD_MS);
    }

    snapRects = new Map();
    originalOrder.forEach(c => snapRects.set(c, c.getBoundingClientRect()));

    const rect = snapRects.get(card)!;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    // Don't preventDefault here for mouse — let clicks through until threshold crossed
    // For touch, we need to prevent scroll once drag is active (done in onPointerMove)
  };

  function activateDrag(e: PointerEvent) {
    if (!draggedEl) return;
    dragPending = false;
    active = true;

    const rect = snapRects.get(draggedEl)!;

    draggedEl.setCssProps({ 'opacity': '0', 'pointer-events': 'none' });

    ghost = draggedEl.cloneNode(true) as HTMLElement;
    ghost.classList.add('sc-drag-ghost');
    const cs = getComputedStyle(draggedEl);
    ghost.setCssProps({
      'background': cs.background,
      'background-color': cs.backgroundColor,
      'border-color': cs.borderColor,
      'border-width': cs.borderWidth,
      'border-style': cs.borderStyle,
      'border-radius': cs.borderRadius,
      'color': cs.color,
      'font-size': cs.fontSize,
      'line-height': cs.lineHeight,
      'padding': cs.padding,
      'position': 'fixed',
      'z-index': '9999',
      'pointer-events': 'none',
      'width': rect.width + 'px',
      'height': rect.height + 'px',
      'left': (e.clientX - offsetX) + 'px',
      'top': (e.clientY - offsetY) + 'px',
      'margin': '0',
      'box-shadow': '0 8px 24px rgba(0,0,0,0.25)',
      'opacity': '1',
      'cursor': 'grabbing',
      'transform': '',
      'transition': ''
    });
    document.body.appendChild(ghost);
  }

  const onPointerMove = (e: PointerEvent) => {
    if (dragPending) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        if (!touchHoldReady) {
          // Touch moved before hold timer — cancel drag, let it be a scroll
          if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          dragPending = false;
          draggedEl = null;
          snapRects = new Map();
          originalOrder = [];
          return;
        }
        // Prevent page scroll on touch once drag threshold is crossed
        if (e.pointerType === 'touch') e.preventDefault();
        activateDrag(e);
      } else {
        return;
      }
    }

    if (!active || !ghost || !draggedEl) return;

    // Prevent scroll while dragging on touch
    if (e.pointerType === 'touch') e.preventDefault();

    ghost.setCssProps({
      'left': (e.clientX - offsetX) + 'px',
      'top': (e.clientY - offsetY) + 'px'
    });

    const newTarget = computeTargetIndex(e.clientX, e.clientY);
    if (newTarget !== currentTargetIndex) {
      currentTargetIndex = newTarget;
      lastFlipRects = readFlipRects(currentTargetIndex);
      applyFlip(lastFlipRects);
    }
  };

  const onPointerUp = () => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);

    if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
    touchHoldReady = false;

    if (dragPending) {
      dragPending = false;
      draggedEl = null;
      snapRects = new Map();
      originalOrder = [];
      return;
    }

    if (!active || !draggedEl) return;
    active = false;

    ghost?.remove();
    ghost = null;

    draggedEl.setCssProps({ 'opacity': '', 'pointer-events': '' });

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

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('dragstart', onNativeDragStart);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('dragstart', onNativeDragStart);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
    touchHoldReady = false;
    ghost?.remove();
    if (draggedEl) {
      draggedEl.setCssProps({ 'opacity': '', 'pointer-events': '' });
    }
    clearTransforms();
    ghost = null; draggedEl = null; active = false; dragPending = false;
    snapRects = new Map(); lastFlipRects = new Map();
    originalOrder = []; currentTargetIndex = -1; draggedIndex = -1;
  };
}

/**
 * Drag-to-reorder for the pinned notes list.
 * Uses Pointer Events for mouse + touch support.
 */
export function attachPinnedListDragToReorder(
  container: HTMLElement,
  getPaths: () => string[],
  onReorder: (newPaths: string[]) => void | Promise<void>
): () => void {
  let ghost: HTMLElement | null = null;
  let draggedEl: HTMLElement | null = null;
  let draggedPath = '';
  let offsetY = 0;
  let active = false;
  let indicator: HTMLElement | null = null;
  let dropIndex = -1;

  function getItems(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(':scope > .sc-home-file-item'));
  }

  function getItemEl(el: EventTarget | null): HTMLElement | null {
    if (!(el instanceof HTMLElement)) return null;
    return el.closest<HTMLElement>('.sc-home-file-item');
  }

  function getOrCreateIndicator(): HTMLElement {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'sc-pinned-drop-indicator';
      indicator.setCssStyles({ position: 'absolute', left: '0', right: '0', height: '2px', background: 'var(--interactive-accent)', borderRadius: '2px', pointerEvents: 'none', zIndex: '100', display: 'none' });
    }
    return indicator;
  }

  function computeDropIndex(clientY: number): number {
    const items = getItems().filter(i => i !== draggedEl);
    if (items.length === 0) return 0;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  }

  function positionIndicator(idx: number) {
    const ind = getOrCreateIndicator();
    const items = getItems().filter(i => i !== draggedEl);
    const containerRect = container.getBoundingClientRect();

    let top: number;
    if (items.length === 0) {
      top = 0;
    } else if (idx >= items.length) {
      const last = items[items.length - 1].getBoundingClientRect();
      top = last.bottom - containerRect.top;
    } else {
      const target = items[idx].getBoundingClientRect();
      top = target.top - containerRect.top;
    }

    ind.setCssProps({ 'display': 'block', 'top': (top - 1) + 'px' });

    if (!ind.parentElement) {
      container.setCssProps({ 'position': 'relative' });
      container.appendChild(ind);
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const item = getItemEl(e.target);
    if (!item) return;

    draggedEl = item;
    draggedPath = item.dataset.path ?? '';
    if (!draggedPath) return;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    ghost = item.cloneNode(true) as HTMLElement;
    ghost.classList.add('sc-drag-ghost');
    const cs = getComputedStyle(item);
    ghost.setCssStyles({
      position: 'fixed',
      zIndex: '9999',
      pointerEvents: 'none',
      width: rect.width + 'px',
      height: rect.height + 'px',
      left: rect.left + 'px',
      top: rect.top + 'px',
      background: cs.background,
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderRadius,
      padding: cs.padding,
      fontSize: cs.fontSize,
      color: cs.color,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      opacity: '0.9',
      cursor: 'grabbing',
    });
    document.body.appendChild(ghost);

    item.setCssProps({ 'opacity': '0.3' });
    active = true;
    dropIndex = computeDropIndex(e.clientY);
    positionIndicator(dropIndex);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active || !ghost) return;
    if (e.pointerType === 'touch') e.preventDefault();
    ghost.setCssProps({ 'top': (e.clientY - offsetY) + 'px' });
    dropIndex = computeDropIndex(e.clientY);
    positionIndicator(dropIndex);
  };

  const onPointerUp = () => {
    if (!active) return;
    active = false;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);

    ghost?.remove();
    ghost = null;
    if (indicator) indicator.setCssProps({ 'display': 'none' });
    if (draggedEl) draggedEl.setCssProps({ 'opacity': '' });

    const paths = getPaths().slice();
    const fromIdx = paths.indexOf(draggedPath);
    if (fromIdx !== -1 && dropIndex !== -1) {
      paths.splice(fromIdx, 1);
      const insertAt = fromIdx < dropIndex ? dropIndex : dropIndex;
      paths.splice(insertAt, 0, draggedPath);
      void onReorder(paths);
    }

    draggedEl = null;
    draggedPath = '';
    dropIndex = -1;
  };

  container.addEventListener('pointerdown', onPointerDown);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    ghost?.remove();
    indicator?.remove();
    if (draggedEl) draggedEl.setCssProps({ 'opacity': '' });
    ghost = null; draggedEl = null; active = false; indicator = null;
  };
}
