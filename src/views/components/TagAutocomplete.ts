import { CardStore } from "../../services/CardStore";

export class TagAutocomplete {
  private container: HTMLElement;
  private selectedIndex = -1;
  private suggestions: string[] = [];

  constructor(
    private input: HTMLTextAreaElement,
    private store: CardStore
  ) {
    const parent = this.input.parentElement || document.body;
    this.container = parent.createDiv('sc-tag-autocomplete');
    this.container.style.display = 'none';
    this.container.style.position = 'absolute';
    this.container.style.bottom = 'calc(100% + 4px)';
    this.container.style.left = '0';
    this.container.style.right = '0';
    this.container.style.maxHeight = '150px';
    this.container.style.overflowY = 'auto';
    this.container.style.border = '1px solid var(--background-modifier-border)';
    this.container.style.borderRadius = '4px';
    this.container.style.background = 'var(--background-primary)';
    this.container.style.zIndex = '1000';
  }

  attach(): void {
    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private update(): void {
    const cursorPos = this.input.selectionStart || 0;
    const textBeforeCursor = this.input.value.substring(0, cursorPos);
    const lastHashIdx = textBeforeCursor.lastIndexOf('#');
    if (lastHashIdx === -1 || lastHashIdx < textBeforeCursor.length - 1) {
      this.hide();
      return;
    }
    const currentWord = textBeforeCursor.substring(lastHashIdx + 1).toLowerCase();
    const allTags = this.getAllTags();
    const suggestions = allTags.filter(t => t.startsWith(currentWord)).slice(0, 8);
    this.suggestions = currentWord.length === 0 ? allTags.slice(0, 8) : suggestions;
    if (this.suggestions.length === 0) {
      this.hide();
      return;
    }
    this.renderSuggestions(lastHashIdx, cursorPos);
  }

  private renderSuggestions(lastHashIdx: number, cursorPos: number): void {
    this.container.empty();
    this.selectedIndex = -1;
    this.suggestions.forEach((tag, idx) => {
      const item = this.container.createDiv('sc-autocomplete-item');
      item.textContent = '#' + tag;
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--background-modifier-hover)';
        this.selectedIndex = idx;
      });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        const before = this.input.value.substring(0, lastHashIdx);
        const after = this.input.value.substring(cursorPos);
        this.input.value = before + '#' + tag + ' ' + after;
        this.input.selectionStart = this.input.selectionEnd = before.length + tag.length + 2;
        this.input.focus();
        this.update();
      });
    });
    this.container.style.display = '';
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.container.style.display === 'none') return;
    const items = this.container.querySelectorAll('.sc-autocomplete-item');
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && items.length > 0) {
      e.preventDefault();
      if (e.key === 'ArrowDown') this.selectedIndex = (this.selectedIndex + 1) % items.length;
      else this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
      items.forEach((item, idx) => ((item as HTMLElement).style.background = idx === this.selectedIndex ? 'var(--background-modifier-hover)' : ''));
      return;
    }
    if (e.key === 'Enter' && this.selectedIndex >= 0 && items[this.selectedIndex]) {
      e.preventDefault();
      (items[this.selectedIndex] as HTMLElement).click();
    }
  }

  private getAllTags(): string[] {
    const tags = new Set<string>();
    this.store.getAll().forEach(c => (c.tags || []).forEach(t => tags.add(String(t).toLowerCase())));
    return Array.from(tags).sort();
  }

  private hide(): void {
    this.container.style.display = 'none';
  }
}
