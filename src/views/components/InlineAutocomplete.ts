/**
 * InlineAutocomplete
 * Attaches to a contenteditable element and shows a dropdown when the user
 * types @ (categories), # (tags), or [[ (file links) in the text.
 */
import { App, TFile, setIcon } from "obsidian";
import { CardStore } from "../../services/CardStore";

type SuggestionItem = { label: string; value: string; prefix: '@' | '#' | '[['; icon?: string; iconColor?: string };

export class InlineAutocomplete {
  private dropdown: HTMLElement;
  private selectedIndex = -1;
  private items: SuggestionItem[] = [];
  private triggerStart = -1;
  private triggerChar: '@' | '#' | '[[' | null = null;
  public isOpen = false;

  constructor(
    private editorEl: HTMLElement,
    private store: CardStore,
    private app?: App
  ) {
    const parent = editorEl.parentElement!;
    parent.addClass('sc-ac-parent');

    this.dropdown = parent.createDiv('sc-inline-autocomplete');

    editorEl.addEventListener('input', () => this.onInput());
    editorEl.addEventListener('keydown', (e) => this.onKeyDown(e), true);
    editorEl.addEventListener('blur', () => setTimeout(() => this.hide(), 150));
  }

  private getCaretInfo(): { text: string; offset: number } {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return { text: '', offset: 0 };
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(this.editorEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const text = preRange.toString();
    return { text, offset: text.length };
  }

  private onInput(): void {
    const { text } = this.getCaretInfo();

    // Check for [[ trigger first (two-char trigger)
    if (this.app) {
      const doubleBracketIdx = text.lastIndexOf('[[');
      if (doubleBracketIdx !== -1) {
        const afterBracket = text.substring(doubleBracketIdx + 2);
        // Only trigger if no closing ]] after the [[
        if (!afterBracket.includes(']]')) {
          const query = afterBracket.toLowerCase();
          const suggestions = this.getFileSuggestions(query);
          if (suggestions.length > 0) {
            this.triggerStart = doubleBracketIdx;
            this.triggerChar = '[[';
            this.items = suggestions;
            this.renderDropdown();
            this.positionDropdown();
            return;
          }
        }
      }
    }

    // Check for @ or # triggers
    let triggerIdx = -1;
    let triggerChar: '@' | '#' | null = null;
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ' ' || ch === '\n') break;
      if (ch === '@' || ch === '#') { triggerIdx = i; triggerChar = ch; break; }
    }

    if (triggerIdx === -1 || triggerChar === null) { this.hide(); return; }

    const query = text.substring(triggerIdx + 1).toLowerCase();
    this.triggerStart = triggerIdx;
    this.triggerChar = triggerChar;

    const suggestions = triggerChar === '@'
      ? this.getCategorySuggestions(query)
      : this.getTagSuggestions(query);

    if (suggestions.length === 0) { this.hide(); return; }

    this.items = suggestions;
    this.renderDropdown();
    this.positionDropdown();
  }

  private getFileSuggestions(query: string): SuggestionItem[] {
    if (!this.app) return [];
    const files = this.app.vault.getFiles()
      .filter((f: TFile) => f.name && !f.name.startsWith('.') && f.name.toLowerCase().includes(query))
      .slice(0, 10);
    return files.map((f: TFile) => {
      const iconInfo = this.resolveIconicIcon(f);
      return {
        label: f.name,
        value: f.name,
        prefix: '[[' as const,
        icon: iconInfo?.icon || 'file-text',
        iconColor: iconInfo?.color,
      };
    });
  }

  /** Synchronously resolve iconic plugin icon for a file (no async needed for sync APIs). */
  private resolveIconicIcon(file: TFile): { icon: string; color?: string } | null {
    if (!this.app) return null;
    type IconicEntry = { icon?: string; name?: string; value?: string; color?: string } | string;
    type IconicPlugin = {
      ruleManager?: { checkRuling?: (type: string, path: string) => { icon?: string; iconDefault?: string; color?: string } | null };
      getFileItem?: (path: string) => { icon?: string; iconDefault?: string; color?: string } | null;
      settings?: { fileIcons?: Record<string, IconicEntry> };
      data?: { fileIcons?: Record<string, IconicEntry> };
      fileIcons?: Record<string, IconicEntry>;
    };
    const iconicPlugin = (this.app as unknown as { plugins?: { getPlugin?: (id: string) => IconicPlugin | null } }).plugins?.getPlugin?.('iconic');
    if (!iconicPlugin) return null;

    const path = file.path;

    try {
      const ruled = iconicPlugin.ruleManager?.checkRuling?.('file', path);
      if (ruled) {
        const iconValue = ruled.icon ?? ruled.iconDefault;
        if (iconValue) return { icon: String(iconValue), color: ruled.color ?? undefined };
      }
    } catch { /* ignore */ }

    try {
      const item = iconicPlugin.getFileItem?.(path);
      if (item) {
        const iconValue = item.icon ?? item.iconDefault;
        if (iconValue) return { icon: String(iconValue), color: item.color ?? undefined };
      }
    } catch { /* ignore */ }

    const entry =
      iconicPlugin.settings?.fileIcons?.[path] ??
      iconicPlugin.data?.fileIcons?.[path] ??
      iconicPlugin.fileIcons?.[path];

    if (!entry) return null;
    if (typeof entry === 'string') return { icon: entry };
    if (typeof entry === 'object') {
      const iconValue = entry.icon ?? entry.name ?? entry.value;
      if (iconValue) return { icon: String(iconValue), color: typeof entry.color === 'string' ? entry.color : undefined };
    }
    return null;
  }

  private getCategorySuggestions(query: string): SuggestionItem[] {
    const settings = this.store.settings;
    const cats: SuggestionItem[] = [];
    const builtinIcons = settings.builtinCategoryIcons || {};

    if (!settings.hideTodayFilter)
      cats.push({ label: 'Today', value: 'today', prefix: '@', icon: builtinIcons['today'] || 'calendar-check' });
    if (!settings.hideTomorrowFilter)
      cats.push({ label: 'Tomorrow', value: 'tomorrow', prefix: '@', icon: builtinIcons['tomorrow'] || 'calendar-plus' });

    if (settings.enableCustomCategories) {
      (settings.customCategories || []).forEach(c => {
        cats.push({ label: c.label, value: c.id || c.label, prefix: '@', icon: c.icon });
      });
    }

    return query
      ? cats.filter(c => c.label.toLowerCase().startsWith(query) || c.value.toLowerCase().startsWith(query))
      : cats.slice(0, 8);
  }

  private getTagSuggestions(query: string): SuggestionItem[] {
    const tags = new Set<string>();
    this.store.getAll().forEach(c => (c.tags || []).forEach(t => tags.add(t.toLowerCase())));
    const all = Array.from(tags).sort();
    const filtered = query ? all.filter(t => t.startsWith(query)) : all;
    return filtered.slice(0, 8).map(t => ({ label: t, value: t, prefix: '#' as const }));
  }

  private renderDropdown(): void {
    this.dropdown.empty();
    this.selectedIndex = -1;
    this.isOpen = true;
    this.items.forEach((item, idx) => {
      const row = this.dropdown.createDiv('sc-inline-ac-item');

      if (item.prefix === '[[' || (item.prefix === '@' && item.icon)) {
        const iconEl = row.createSpan('sc-inline-ac-icon');
        const iconName = item.icon || (item.prefix === '[[' ? 'file-text' : 'at-sign');
        try { setIcon(iconEl, iconName); } catch { iconEl.textContent = item.prefix; }
        if (item.iconColor) {
          const colorMap: Record<string, string> = {
            red: 'var(--color-red)', orange: 'var(--color-orange)', yellow: 'var(--color-yellow)',
            green: 'var(--color-green)', cyan: 'var(--color-cyan)', blue: 'var(--color-blue)',
            purple: 'var(--color-purple)', pink: 'var(--color-pink)', magenta: 'var(--color-pink)',
            gray: 'var(--color-base-70)', grey: 'var(--color-base-70)',
          };
          const normalized = item.iconColor.trim().toLowerCase();
          iconEl.style.color = colorMap[normalized] ?? item.iconColor;
        }
      } else if (item.prefix === '@') {
        row.createSpan({ cls: 'sc-inline-ac-badge', text: '@' });
      } else {
        row.createSpan({ cls: 'sc-inline-ac-badge', text: '#' });
      }

      row.createSpan({ text: item.label });

      row.addEventListener('mousedown', (e) => { e.preventDefault(); this.selectItem(idx); });
      row.addEventListener('mouseenter', () => { this.selectedIndex = idx; this.highlightSelected(); });
    });
    this.dropdown.addClass('is-visible');
  }

  private positionDropdown(): void {
    const editorRect = this.editorEl.getBoundingClientRect();
    const parentRect = this.editorEl.parentElement!.getBoundingClientRect();

    let caretLeft = 0;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) caretLeft = rect.left - parentRect.left;
    }

    const bottomOffset = parentRect.bottom - editorRect.top + 4;
    const leftOffset = Math.max(0, caretLeft);

    // Default: above the editor
    this.dropdown.setCssProps({
      '--sc-ac-bottom': `${bottomOffset}px`,
      '--sc-ac-left': `${leftOffset}px`,
    });
    this.dropdown.removeClass('ac-below');
    this.dropdown.addClass('ac-above');

    // After paint, flip below if it goes off-screen
    requestAnimationFrame(() => {
      const dropRect = this.dropdown.getBoundingClientRect();
      if (dropRect.top < 0) {
        const topOffset = editorRect.top - parentRect.top + editorRect.height + 4;
        this.dropdown.setCssProps({ '--sc-ac-top': `${topOffset}px`, '--sc-ac-left': `${leftOffset}px` });
        this.dropdown.removeClass('ac-above');
        this.dropdown.addClass('ac-below');
      }
    });
  }

  private highlightSelected(): void {
    const rows = this.dropdown.querySelectorAll('.sc-inline-ac-item');
    rows.forEach((r, i) => r.toggleClass('is-selected', i === this.selectedIndex));
    // Scroll selected item into view
    if (this.selectedIndex >= 0 && rows[this.selectedIndex]) {
      (rows[this.selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }

  private selectItem(idx: number): void {
    const item = this.items[idx];
    if (!item) return;

    const fullText = this.editorEl.textContent || '';
    const caretOffset = this.getCaretInfo().offset;

    if (item.prefix === '[[') {
      // The text after [[ up to the caret is the partial query.
      // The text after the caret may contain auto-paired ]] — strip those too.
      const before = fullText.substring(0, this.triggerStart);
      let after = fullText.substring(caretOffset);
      // If auto-pairing inserted ]], remove them so we don't double up
      if (after.startsWith(']]')) after = after.substring(2);
      const replacement = '[[' + item.value + ']]';
      this.editorEl.textContent = before + replacement + after;
      this.setCaretAt(before.length + replacement.length);
    } else {
      const before = fullText.substring(0, this.triggerStart);
      const after = fullText.substring(caretOffset);
      const replacement = item.prefix + item.value + ' ';
      this.editorEl.textContent = before + replacement + after;
      this.setCaretAt(before.length + replacement.length);
    }

    this.editorEl.dispatchEvent(new Event('input'));
    this.hide();
  }

  private setCaretAt(offset: number): void {
    const sel = window.getSelection();
    if (!sel) return;
    let remaining = offset;
    const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      if (remaining <= n.length) { node = n; break; }
      remaining -= n.length;
    }
    const range = document.createRange();
    if (node) { range.setStart(node, remaining); }
    else { range.selectNodeContents(this.editorEl); range.collapse(false); }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.highlightSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.highlightSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.selectedIndex >= 0) {
        this.selectItem(this.selectedIndex);
      } else {
        this.hide();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      this.hide();
    }
  }

  hide(): void {
    this.dropdown.removeClass('is-visible', 'ac-above', 'ac-below');
    this.isOpen = false;
    this.items = [];
    this.selectedIndex = -1;
    this.triggerChar = null;
  }

  destroy(): void {
    this.dropdown.remove();
  }
}
