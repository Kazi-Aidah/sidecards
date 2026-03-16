import { ItemView, WorkspaceLeaf, Menu, Notice, setIcon } from "obsidian";
import type SideCardsPlugin from "../core/Plugin";
import { CardStore } from "../services/CardStore";
import { Card } from "../models/Card";

export class SideCardsHomeView extends ItemView {
  private selectedColor = 'var(--card-color-1)';
  private selectedTags: string[] = [];
  private filterType = '';
  private filterValue = '';

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SideCardsPlugin,
    private store: CardStore
  ) {
    super(leaf);
  }

  getViewType(): string {
    return 'sidecards-home';
  }

  getDisplayText(): string {
    return 'SideCards';
  }

  getIcon(): string {
    return 'home';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();
    container.addClass('sidecards-home-container');

    const main = container.createDiv({ cls: 'sidecards-home-main' });
    main.style.padding = '32px';
    const title = main.createEl('h2', { text: 'SideCards' });
    title.style.margin = '0 0 12px 0';

    const inputBox = main.createDiv({ cls: 'sidecards-home-input' });
    inputBox.style.margin = '12px 0';
    const input = inputBox.createEl('textarea');
    input.placeholder = 'Type card content…';
    input.rows = 4;
    input.style.width = '100%';
    input.style.minHeight = '100px';
    input.style.padding = '12px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.borderRadius = '6px';
    input.style.resize = 'vertical';

    const paletteRow = main.createDiv({ cls: 'sidecards-home-palette-row' });
    paletteRow.style.display = 'flex';
    paletteRow.style.gap = '6px';
    paletteRow.style.alignItems = 'center';
    paletteRow.style.marginTop = '8px';
    paletteRow.style.marginBottom = '20px';

    const categoryBtn = paletteRow.createEl('button', { text: 'category', cls: 'sidecards-home-category-btn' });
    categoryBtn.style.padding = '6px 10px';
    categoryBtn.style.border = '1px solid var(--background-modifier-border)';
    categoryBtn.style.borderRadius = '6px';
    categoryBtn.addEventListener('click', () => {
      const menu = new Menu();
      this.getAvailableFilters().forEach((f) => {
        menu.addItem(item => item.setTitle(f.label).onClick(() => {
          this.filterType = f.type;
          this.filterValue = f.value;
          categoryBtn.textContent = f.label;
        }));
      });
      const r = categoryBtn.getBoundingClientRect();
      menu.showAtPosition({ x: r.left, y: r.bottom });
    });

    const separator = paletteRow.createDiv({ cls: 'sidecards-home-separator' });
    separator.textContent = '|';
    separator.style.color = 'var(--background-modifier-border)';
    separator.style.margin = '0 8px';
    separator.style.fontSize = '18px';
    separator.style.opacity = '0.6';

    const colors = [
      { name: 'gray', var: 'var(--card-color-1)' },
      { name: 'red', var: 'var(--card-color-2)' },
      { name: 'orange', var: 'var(--card-color-3)' },
      { name: 'yellow', var: 'var(--card-color-4)' },
      { name: 'green', var: 'var(--card-color-5)' },
      { name: 'blue', var: 'var(--card-color-6)' },
      { name: 'purple', var: 'var(--card-color-7)' },
      { name: 'magenta', var: 'var(--card-color-8)' },
      { name: 'pink', var: 'var(--card-color-9)' },
      { name: 'brown', var: 'var(--card-color-10)' }
    ];
    const swatches: HTMLElement[] = [];
    colors.forEach((color) => {
      const swatch = paletteRow.createDiv({ cls: 'sidecards-home-color-dot' });
      swatch.style.width = '28px';
      swatch.style.height = '28px';
      swatch.style.borderRadius = '4px';
      swatch.style.border = this.selectedColor === color.var ? '2px solid var(--text-accent)' : '2px solid var(--background-modifier-border)';
      const root = document.documentElement;
      const computedColor = getComputedStyle(root).getPropertyValue(color.var.replace('var(', '').replace(')', ''));
      swatch.style.backgroundColor = computedColor.trim() || color.var;
      swatch.style.cursor = 'pointer';
      swatch.style.transition = 'transform 0.15s ease';
      swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.1)'; });
      swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
      swatch.addEventListener('click', () => {
        swatches.forEach((s) => s.style.border = '2px solid var(--background-modifier-border)');
        swatch.style.border = '2px solid var(--text-accent)';
        this.selectedColor = color.var;
      });
      swatches.push(swatch);
    });

    const autocompleteWrap = main.createDiv({ cls: 'sidecards-home-autocomplete-wrap' });
    autocompleteWrap.style.position = 'relative';
    autocompleteWrap.appendChild(inputBox);

    const homeTagAutocompleteContainer = autocompleteWrap.createDiv({ cls: 'card-tag-autocomplete' });
    homeTagAutocompleteContainer.style.display = 'none';
    homeTagAutocompleteContainer.style.position = 'absolute';
    homeTagAutocompleteContainer.style.bottom = 'calc(100% + 4px)';
    homeTagAutocompleteContainer.style.left = '0';
    homeTagAutocompleteContainer.style.right = '0';

    const homeGroupAutocompleteContainer = autocompleteWrap.createDiv({ cls: 'card-group-autocomplete' });
    homeGroupAutocompleteContainer.style.display = 'none';
    homeGroupAutocompleteContainer.style.position = 'absolute';
    homeGroupAutocompleteContainer.style.bottom = 'calc(100% + 4px)';
    homeGroupAutocompleteContainer.style.left = '0';
    homeGroupAutocompleteContainer.style.right = '0';

    let homeTagSelectedIndex = -1;
    let homeGroupSelectedIndex = -1;

    const updateHomeTagAutocomplete = () => {
      try {
        const cursorPos = input.selectionStart || 0;
        const textBeforeCursor = input.value.substring(0, cursorPos);
        const lastHashIdx = textBeforeCursor.lastIndexOf('#');
        if (lastHashIdx === -1 || lastHashIdx < textBeforeCursor.length - 1) {
          homeTagAutocompleteContainer.style.display = 'none';
          return;
        }
        const currentWord = textBeforeCursor.substring(lastHashIdx + 1).toLowerCase();
        const allTags = this.getAllUsedTags();
        const suggestions = allTags.filter(t => t.startsWith(currentWord)).slice(0, 8);
        if (suggestions.length === 0 && currentWord.length > 0) {
          homeTagAutocompleteContainer.style.display = 'none';
          return;
        }
        homeTagAutocompleteContainer.empty();
        homeTagSelectedIndex = -1;
        const displayTags = currentWord.length === 0 ? allTags.slice(0, 8) : suggestions;
        if (displayTags.length === 0) {
          homeTagAutocompleteContainer.style.display = 'none';
          return;
        }
        displayTags.forEach((tag, idx) => {
          const item = homeTagAutocompleteContainer.createDiv();
          item.style.padding = '4px 8px';
          item.style.cursor = 'pointer';
          item.style.borderBottom = '1px solid var(--background-modifier-border)';
          item.textContent = '#' + tag;
          item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-modifier-hover)'; homeTagSelectedIndex = idx; });
          item.addEventListener('mouseleave', () => { item.style.background = ''; });
          item.addEventListener('click', () => {
            const before = input.value.substring(0, lastHashIdx);
            const after = input.value.substring(cursorPos);
            input.value = before + '#' + tag + ' ' + after;
            input.selectionStart = input.selectionEnd = before.length + tag.length + 2;
            input.focus();
            updateHomeTagAutocomplete();
          });
        });
        homeTagAutocompleteContainer.style.display = '';
      } catch {}
    };

    const updateHomeGroupAutocomplete = () => {
      try {
        const cursorPos = input.selectionStart || 0;
        const textBeforeCursor = input.value.substring(0, cursorPos);
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];
        const atIdx = currentLine.lastIndexOf('@');
        if (atIdx === -1) {
          homeGroupAutocompleteContainer.style.display = 'none';
          return;
        }
        const currentWord = currentLine.substring(atIdx + 1).toLowerCase();
        const groups = ['all', 'today', 'tomorrow'];
        const customCats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
        const allSuggestions = [
          ...groups.map(g => ({ text: '@' + g, label: g })),
          ...customCats.map(c => ({ text: '@' + (c.id || c.label), label: c.label || c.id }))
        ];
        const suggestions = currentWord.length === 0 ? allSuggestions : allSuggestions.filter(s => s.text.substring(1).startsWith(currentWord)).slice(0, 8);
        if (suggestions.length === 0) {
          homeGroupAutocompleteContainer.style.display = 'none';
          return;
        }
        homeGroupAutocompleteContainer.empty();
        homeGroupSelectedIndex = -1;
        suggestions.forEach(({ text, label }, idx) => {
          const item = homeGroupAutocompleteContainer.createDiv();
          item.style.padding = '4px 8px';
          item.style.cursor = 'pointer';
          item.style.borderBottom = '1px solid var(--background-modifier-border)';
          item.style.fontSize = '12px';
          item.textContent = String(label || '');
          item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-modifier-hover)'; homeGroupSelectedIndex = idx; });
          item.addEventListener('mouseleave', () => { item.style.background = ''; });
          item.addEventListener('click', () => {
            const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
            const atAbs = lineStart + atIdx;
            const before = input.value.substring(0, atAbs);
            const after = input.value.substring(cursorPos);
            input.value = before + text + ' ' + after;
            input.selectionStart = input.selectionEnd = before.length + text.length + 1;
            input.focus();
            updateHomeGroupAutocomplete();
          });
        });
        homeGroupAutocompleteContainer.style.display = '';
      } catch {}
    };

    input.addEventListener('input', () => {
      updateHomeTagAutocomplete();
      updateHomeGroupAutocomplete();
    });

    input.addEventListener('keydown', async (e) => {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && homeGroupAutocompleteContainer.style.display !== 'none') {
        e.preventDefault();
        const items = homeGroupAutocompleteContainer.querySelectorAll('div');
        if (items.length === 0) return;
        if (e.key === 'ArrowDown') homeGroupSelectedIndex = (homeGroupSelectedIndex + 1) % items.length;
        else homeGroupSelectedIndex = (homeGroupSelectedIndex - 1 + items.length) % items.length;
        items.forEach((item, idx) => (item as HTMLElement).style.background = idx === homeGroupSelectedIndex ? 'var(--background-modifier-hover)' : '');
        return;
      }
      if (e.key === 'Enter' && homeGroupAutocompleteContainer.style.display !== 'none' && homeGroupSelectedIndex >= 0) {
        e.preventDefault();
        const items = homeGroupAutocompleteContainer.querySelectorAll('div');
        (items[homeGroupSelectedIndex] as HTMLElement)?.click();
        return;
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && homeTagAutocompleteContainer.style.display !== 'none') {
        e.preventDefault();
        const items = homeTagAutocompleteContainer.querySelectorAll('div');
        if (items.length === 0) return;
        if (e.key === 'ArrowDown') homeTagSelectedIndex = (homeTagSelectedIndex + 1) % items.length;
        else homeTagSelectedIndex = (homeTagSelectedIndex - 1 + items.length) % items.length;
        items.forEach((item, idx) => (item as HTMLElement).style.background = idx === homeTagSelectedIndex ? 'var(--background-modifier-hover)' : '');
        return;
      }
      if (e.key === 'Enter' && homeTagAutocompleteContainer.style.display !== 'none' && homeTagSelectedIndex >= 0) {
        e.preventDefault();
        const items = homeTagAutocompleteContainer.querySelectorAll('div');
        (items[homeTagSelectedIndex] as HTMLElement)?.click();
        return;
      }

      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
      if (pressed === saveKey || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        await this.createCardFromHomeInput(input);
      }
    });

    const toolbarRow = main.createDiv({ cls: 'sidecards-home-toolbar' });
    toolbarRow.style.display = 'flex';
    toolbarRow.style.gap = '6px';
    toolbarRow.style.alignItems = 'center';

    const openSidebarBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-reload-btn' });
    openSidebarBtn.title = 'Open sidebar';
    setIcon(openSidebarBtn, 'panel-right');
    openSidebarBtn.addEventListener('click', async () => this.plugin.activateView());

    const searchBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-sort-btn' });
    searchBtn.title = 'Search cards';
    setIcon(searchBtn, 'search');
    searchBtn.addEventListener('click', async () => {
      await this.plugin.activateView();
      const view: any = this.app.workspace.getLeavesOfType('card-sidebar')?.[0]?.view;
      if (view?._searchWrap) view._searchWrap.style.display = '';
      if (view?._searchInput) view._searchInput.focus();
    });

    const addBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-pinned-btn' });
    addBtn.title = 'Add card';
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', async () => {
      await this.createCardFromHomeInput(input);
    });
  }

  private getAvailableFilters(): Array<{ type: string; label: string; value: string }> {
    const filters = [{ type: 'all', label: 'All', value: 'all' }];
    const showTimeBasedChips = !this.plugin.settings.disableTimeBasedFiltering;
    if (showTimeBasedChips) {
      filters.push({ type: 'category', label: 'Today', value: 'today' });
      filters.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
    }
    if (this.plugin.settings.enableCustomCategories) {
      const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
      cats.forEach(cat => {
        if (cat) filters.push({ type: 'category', label: cat.label || '', value: cat.id || cat.label || '' });
      });
    }
    if (!this.plugin.settings.hideArchivedFilterButton) {
      filters.push({ type: 'archived', label: 'Archived', value: 'archived' });
    }
    return filters;
  }

  private getAllUsedTags(): string[] {
    try {
      const tags = new Set<string>();
      const allCards = this.store.getAll();
      allCards.forEach(c => c.tags.forEach(t => tags.add(String(t).toLowerCase())));
      return Array.from(tags).sort();
    } catch {
      return [];
    }
  }

  private async createCardFromHomeInput(input: HTMLTextAreaElement): Promise<void> {
    let content = input.value.trim();
    if (!content) return;
    const tagMatches = content.match(/#[a-zA-Z0-9_-]+/g) || [];
    const tags = Array.from(new Set([...this.selectedTags, ...tagMatches.map(t => t.substring(1))]));
    content = content.replace(/#[a-zA-Z0-9_-]+/g, '').trim();

    const card = new Card({
      content,
      color: this.selectedColor,
      tags,
      category: this.filterType === 'category' ? this.filterValue : null,
      archived: this.filterType === 'archived'
    });
    await this.store.add(card);
    input.value = '';
    this.selectedTags = [];
    new Notice('Card added');
  }
}
