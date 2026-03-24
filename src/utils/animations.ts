export interface FlipOptions {
  duration?: number;
  easing?: string;
  stagger?: number;
  offset?: number;
}

interface AnimationSettings {
  animatedCards: boolean;
  disableCardFadeIn?: boolean;
}

export async function flipAnimateAsync(
  container: HTMLElement,
  asyncDomChange: () => void | Promise<void>,
  opts: FlipOptions = {},
  settings: AnimationSettings
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

  const oldEls = Array.from(container.querySelectorAll<HTMLElement>('.sc-card'));
  const oldMap = new Map<string, DOMRect>();
  oldEls.forEach(el => {
    const id = el.dataset.id;
    if (id) oldMap.set(id, el.getBoundingClientRect());
  });

  await asyncDomChange();

  const newEls = Array.from(container.querySelectorAll<HTMLElement>('.sc-card'));
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
        el.setCssProps({
          'transition': 'none',
          'transform': `translateY(${dy}px)`,
          'will-change': 'transform'
        });
      }
    } else if (el) {
      el.setCssProps({
        'transition': 'none',
        'transform': `translateY(${entranceOffset}px)`,
        'will-change': 'transform'
      });
      if (!settings.disableCardFadeIn) {
        el.setCssProps({ 'opacity': '0' });
      }
    }
  });

  // Force reflow
  void container.offsetHeight;

  ids.forEach((id, i) => {
    const el = elById.get(id);
    if (!el) return;
    const delay = i * stagger;
    window.setTimeout(() => {
      el.setCssProps({
        'transition': `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`,
        'transform': ''
      });
      if (!settings.disableCardFadeIn) {
        el.setCssProps({ 'opacity': '1' });
      }
    }, delay);
  });

  window.setTimeout(() => {
    ids.forEach(id => {
      const el = elById.get(id);
      if (el) {
        el.setCssProps({ 'transition': '' });
      }
    });
  }, duration + (ids.length * stagger) + 50);
}

export function animateCardsEntrance(
  container: HTMLElement,
  opts: FlipOptions = {},
  settings: AnimationSettings
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
    el.setCssProps({
      'transition': 'none',
      'transform': `translateY(${offsetPx}px)`,
      'opacity': settings.disableCardFadeIn ? '1' : '0',
      'will-change': 'transform, opacity'
    });
  });

  // Force reflow
  void container.offsetHeight;

  els.forEach((el, i) => {
    const delay = i * stagger;
    window.setTimeout(() => {
      el.setCssProps({
        'transition': `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1), opacity ${duration}ms cubic-bezier(0.2, 0, 0, 1)`,
        'transform': 'translateY(0)',
        'opacity': '1'
      });
    }, delay);
  });

  window.setTimeout(() => {
    els.forEach(el => {
      el.setCssProps({
        'transition': '',
        'transform': '',
        'opacity': '',
        'will-change': ''
      });
    });
  }, duration + (els.length * stagger) + 50);
}
