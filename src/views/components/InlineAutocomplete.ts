/**
 * InlineAutocomplete
 * Attaches to a contenteditable element and shows a dropdown when the user
 * types @ (categories) or # (tags) in the text.
 */
import { setIcon } from "obsidian";
import { CardStore } from "../../services/CardStore";

type SuggestionItem = { label: string; value: string; prefix: '@' | '#'; icon?: string };

export class InlineAutocomplete {
  private dropdown: HTMLElement;
  private selectedIndex = -1;
  private items: SuggestionItem[] = [];
  private triggerStart = -1;
  private triggerChar: '@' | '#' | null = null;
  public isOpen = false;

  constructor(
    private editorEl: HTMLElement,
    private store: CardStore
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

      if (item.prefix === '@' && item.icon) {
        const iconEl = row.createSpan('sc-inline-ac-icon');
        try { setIcon(iconEl, item.icon); } catch { iconEl.textContent = '@'; }
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
    this.dropdown.querySelectorAll('.sc-inline-ac-item')
      .forEach((r, i) => r.toggleClass('is-selected', i === this.selectedIndex));
  }

  private selectItem(idx: number): void {
    const item = this.items[idx];
    if (!item) return;

    const fullText = this.editorEl.textContent || '';
    const before = fullText.substring(0, this.triggerStart);
    const caretOffset = this.getCaretInfo().offset;
    const after = fullText.substring(caretOffset);

    const replacement = item.prefix + item.value + ' ';
    this.editorEl.textContent = before + replacement + after;
    this.setCaretAt(before.length + replacement.length);
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
      // Always prevent default and stop propagation when dropdown is open
      // so Enter never submits the card while autocomplete is active
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
