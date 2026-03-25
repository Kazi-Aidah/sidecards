
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

interface ColorSettings {
  cardStyle?: number;
  cardBgOpacity?: number;
  borderThickness?: number;
  cardBorderShadowOpacity?: number;
  borderRadius?: number;
  [key: string]: unknown;
}

export function resolveColorVarToHex(colorVar: string, settings: ColorSettings): string | null {
  if (!colorVar) return null;
  if (colorVar.startsWith('#')) return colorVar;
  const m = colorVar.match(/--card-color-(\d+)/);
  if (m) {
    // Always read the live CSS variable so color changes are reflected immediately
    try {
      const root = window && window.getComputedStyle ? window.getComputedStyle(document.documentElement) : null;
      if (root) {
        const val = root.getPropertyValue(`--card-color-${m[1]}`);
        if (val) {
          const v = String(val).trim();
          if (v) return v;
        }
      }
    } catch { /* ignore */ }
    // Fallback to settings value
    const key = `color${m[1]}`;
    return (settings[key] as string | null | undefined) || null;
  }
  return null;
}

export function applyCardColorToElement(cardEl: HTMLElement, colorVar: string, settings: ColorSettings): void {
  const style = Number(settings.cardStyle ?? 2);
  const opacity = Number(settings.cardBgOpacity ?? 0.08);
  const borderThickness = Number(settings.borderThickness ?? 2);
  const borderShadowOpacity = Number(settings.cardBorderShadowOpacity ?? 1);

  // Reset styles using setProperty to ensure consistency
  cardEl.style.removeProperty('border-left');
  cardEl.style.removeProperty('border');
  cardEl.style.removeProperty('background-color');
  cardEl.style.removeProperty('box-shadow');
  // Clear any legacy inline max-height/overflow from older builds
  cardEl.style.removeProperty('max-height');
  cardEl.style.removeProperty('overflow');

  const hex = resolveColorVarToHex(colorVar, settings) || colorVar;
  const rgba = hexToRgba(hex, opacity);
  const borderColor = borderShadowOpacity >= 1 ? colorVar : hexToRgba(hex, borderShadowOpacity);
  const borderRadius = settings.borderRadius ?? 6;

  if (style === 1) {
    cardEl.setCssProps({
      'border': `${borderThickness}px solid ${borderColor}`,
      'background-color': rgba
    });
  } else if (style === 3) {
    cardEl.setCssProps({
      'border-left': `${borderThickness}px solid ${borderColor}`,
      'background-color': rgba,
      'border-top': `1px solid var(--background-modifier-border)`,
      'border-right': `1px solid var(--background-modifier-border)`,
      'border-bottom': `1px solid var(--background-modifier-border)`
    });
  } else {
    // Style 2 (Default)
    cardEl.setCssProps({
      'border': `${borderThickness}px solid ${borderColor}`,
      'background-color': rgba,
      'box-shadow': `2px 2px 0 0 ${borderColor}`
    });
  }

  cardEl.setCssProps({ 'border-radius': `${borderRadius}px` });
}

export function resolveAutoColor(
  content: string,
  tags: string[],
  settings: { autoColorRules?: Array<{ type: 'text' | 'tag'; match: string; colorIndex: number }> }
): string | null {
  const rules = settings.autoColorRules;
  if (!rules || rules.length === 0) return null;
  const lowerContent = content.toLowerCase();
  // Normalize tags: strip leading # if present
  const lowerTags = tags.map(t => t.toLowerCase().replace(/^#/, ''));
  for (const rule of rules) {
    if (!rule.match) continue;
    const match = rule.match.toLowerCase().replace(/^#/, '');
    if (rule.type === 'tag') {
      if (lowerTags.some(t => t === match || t.includes(match))) {
        return `var(--card-color-${rule.colorIndex})`;
      }
    } else {
      if (lowerContent.includes(match)) {
        return `var(--card-color-${rule.colorIndex})`;
      }
    }
  }
  return null;
}
