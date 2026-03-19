
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
  const style = Number(settings.cardStyle ?? 2);
  const opacity = Number(settings.cardBgOpacity ?? 0.08);
  const borderThickness = Number(settings.borderThickness ?? 2);

  // Reset styles using setProperty to ensure consistency
  cardEl.style.removeProperty('border-left');
  cardEl.style.removeProperty('border');
  cardEl.style.removeProperty('background-color');
  cardEl.style.removeProperty('box-shadow');

  const hex = resolveColorVarToHex(colorVar, settings) || colorVar;
  const rgba = hexToRgba(hex, opacity);
  const borderRadius = settings.borderRadius ?? 6;

  if (style === 1) {
    cardEl.style.setProperty('border', `${borderThickness}px solid ${colorVar}`, 'important');
    cardEl.style.setProperty('background-color', rgba, 'important');
  } else if (style === 3) {
    cardEl.style.setProperty('border-left', `${borderThickness}px solid ${colorVar}`, 'important');
    cardEl.style.setProperty('background-color', rgba, 'important');
    cardEl.style.setProperty('border-top', `1px solid var(--background-modifier-border)`, 'important');
    cardEl.style.setProperty('border-right', `1px solid var(--background-modifier-border)`, 'important');
    cardEl.style.setProperty('border-bottom', `1px solid var(--background-modifier-border)`, 'important');
  } else {
    // Style 2 (Default)
    cardEl.style.setProperty('border', `${borderThickness}px solid ${colorVar}`, 'important');
    cardEl.style.setProperty('background-color', rgba, 'important');
    cardEl.style.setProperty('box-shadow', `2px 2px 0 0 ${colorVar}`, 'important');
  }

  cardEl.style.setProperty('border-radius', `${borderRadius}px`, 'important');
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
