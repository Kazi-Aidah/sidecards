
export function hexToRgba(hex: string, alpha = 1): string {
  if (!hex) return '';
  const h = hex.replace('#', '').trim();
  let r, g, b;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveColorVarToHex(colorVar: string, settings: any): string | null {
  if (!colorVar) return null;
  if (colorVar.startsWith('#')) return colorVar;
  const m = colorVar.match(/--card-color-(\d+)/);
  if (m) {
    const idx = m[1];
    const key = `color${idx}`;
    const fromSettings = settings[key] || null;
    if (fromSettings) return fromSettings;
    try {
      const root = window && window.getComputedStyle ? window.getComputedStyle(document.documentElement) : null;
      if (root) {
        const val = root.getPropertyValue(`--card-color-${idx}`);
        if (val) {
          const v = String(val).trim();
          if (v) return v;
        }
      }
    } catch (e) { }
    return null;
  }
  return null;
}

export function applyCardColorToElement(cardEl: HTMLElement, colorVar: string, settings: any): void {
  const style = settings.cardStyle ?? 2;
  const opacity = settings.cardBgOpacity ?? 0.08;
  const borderThickness = Number(settings.borderThickness ?? 2);

  cardEl.style.borderLeft = '';
  cardEl.style.border = '';
  cardEl.style.backgroundColor = '';
  cardEl.style.boxShadow = '';

  const hex = resolveColorVarToHex(colorVar, settings) || colorVar;

  if (style === 1) {
    cardEl.style.border = `${borderThickness}px solid ${colorVar}`;
    cardEl.style.backgroundColor = hexToRgba(hex, opacity);
  } else if (style === 3) {
    cardEl.style.borderLeft = `4px solid ${colorVar}`;
    cardEl.style.backgroundColor = hexToRgba(hex, opacity);
  } else {
    cardEl.style.border = `${borderThickness}px solid ${colorVar}`;
    cardEl.style.backgroundColor = hexToRgba(hex, opacity);
    cardEl.style.boxShadow = `2px 2px 0 0 ${colorVar}`;
  }
}
