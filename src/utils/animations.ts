
export interface FlipOptions {
  duration?: number;
  easing?: string;
  stagger?: number;
  offset?: number;
}

export async function flipAnimateAsync(
  container: HTMLElement,
  asyncDomChange: () => Promise<void>,
  opts: FlipOptions = {},
  settings: any
): Promise<void> {
  if (!settings.animatedCards) {
    await asyncDomChange();
    return;
  }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await asyncDomChange();
    return;
  }

  const duration = opts.duration ?? 260;
  const stagger = opts.stagger ?? 20;
  const entranceOffset = opts.offset ?? 28;

  const oldEls = Array.from(container.querySelectorAll('.sc-card')) as HTMLElement[];
  const oldMap = new Map<string, DOMRect>();
  oldEls.forEach(el => {
    const id = el.dataset.id;
    if (id) oldMap.set(id, el.getBoundingClientRect());
  });

  await asyncDomChange();

  const newEls = Array.from(container.querySelectorAll('.sc-card')) as HTMLElement[];
  const newMap = new Map<string, DOMRect>();
  const elById = new Map<string, HTMLElement>();
  newEls.forEach(el => {
    const id = el.dataset.id;
    if (id) {
      newMap.set(id, el.getBoundingClientRect());
      elById.set(id, el);
    }
  });

  const ids = Array.from(elById.keys());
  ids.forEach(id => {
    const oldRect = oldMap.get(id);
    const newRect = newMap.get(id);
    const el = elById.get(id);
    if (oldRect && newRect && el) {
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        el.style.willChange = 'transform';
      }
    } else if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${entranceOffset}px)`;
      el.style.willChange = 'transform';
      if (!settings.disableCardFadeIn) {
        el.style.opacity = '0';
      }
    }
  });

  // Force reflow
  void container.offsetHeight;

  ids.forEach((id, i) => {
    const el = elById.get(id);
    if (!el) return;
    const delay = i * stagger;
    setTimeout(() => {
      el.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
      el.style.transform = '';
      if (!settings.disableCardFadeIn) {
        el.style.opacity = '1';
      }
    }, delay);
  });

  setTimeout(() => {
    ids.forEach(id => {
      const el = elById.get(id);
      if (el) {
        el.style.transition = '';
      }
    });
  }, duration + (ids.length * stagger) + 50);
}

export function animateCardsEntrance(
  container: HTMLElement,
  opts: FlipOptions = {},
  settings: any
): void {
  if (!settings.animatedCards) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const els = Array.from(container.querySelectorAll('.sc-card'))
    .filter(el => (el as HTMLElement).style.display !== 'none') as HTMLElement[];
  if (els.length === 0) return;

  const duration = opts.duration ?? 360;
  const stagger = opts.stagger ?? 34;
  const offsetPx = opts.offset ?? 28;

  els.forEach(el => {
    el.style.transition = 'none';
    el.style.transform = `translateY(${offsetPx}px)`;
    el.style.opacity = settings.disableCardFadeIn ? '1' : '0';
    el.style.willChange = 'transform, opacity';
  });

  void container.offsetHeight;

  els.forEach((el, i) => {
    const delay = i * stagger;
    setTimeout(() => {
      const transitions = [`transform ${duration}ms ease-out`];
      if (!settings.disableCardFadeIn) {
        transitions.push(`opacity ${duration}ms ease-out`);
      }
      el.style.transition = transitions.join(', ');
      el.style.transform = '';
      el.style.opacity = '1';
    }, delay);
  });

  const total = duration + (els.length * stagger) + 50;
  setTimeout(() => {
    els.forEach(el => {
      el.style.transition = '';
      el.style.willChange = '';
      el.style.transform = '';
      el.style.opacity = '';
    });
  }, total);
}
