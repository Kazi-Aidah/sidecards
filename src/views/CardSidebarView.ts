
import { ItemView, WorkspaceLeaf, App, Notice, Menu, Modal, MarkdownView, TFile, setIcon, Scope, Editor } from "obsidian";
import { CardStore } from "../services/CardStore";
import { FilterService, FilterOptions } from "../services/FilterService";
import { SortService, SortMode } from "../services/SortService";
import { EventBus } from "../core/EventBus";
import { CardComponent } from "./components/Card";
import { TagAutocomplete } from "./components/TagAutocomplete";
import { flipAnimateAsync, animateCardsEntrance } from "../utils/animations";
import { Card } from "../models/Card";
import SideCardsPlugin from "../core/Plugin";

import { SearchModal } from "./modals/SearchModal";
import { QuickCardWithFilterModal } from "./modals/QuickCardWithFilterModal";

export class CardSidebarView extends ItemView {
  private cardsContainer!: HTMLElement;
  private cardComponents: Map<string, CardComponent> = new Map();
  private activeFilters: FilterOptions = { query: '', tags: [] };
  private currentSortMode: SortMode = 'manual';
  private sortAscending: boolean = true;
  private editorScope: Scope;
  private editor!: Editor;
  private owner!: any;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SideCardsPlugin,
    private store: CardStore,
    private eventBus: EventBus,
    private filterService: FilterService,
    private sortService: SortService
  ) {
    super(leaf);
    this.editorScope = new Scope(this.app.scope);
    // Block native formatting keys so Obsidian's global commands take over
    this.editorScope.register(["Mod"], "b", () => true);
    this.editorScope.register(["Mod"], "i", () => true);
    this.editorScope.register(["Mod"], "u", () => true);
    this.setupMockEditor();
  }

  private setupMockEditor() {
    this.editor = {
      getSelection: () => {
        const sel = window.getSelection();
        return sel ? sel.toString() : "";
      },
      replaceSelection: (text: string) => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      },
      toggleBold: () => this.toggleMarkdownWrapper("**"),
      toggleItalic: () => this.toggleMarkdownWrapper("*"),
    } as any;

    this.owner = {
      editor: this.editor,
      editMode: true,
    };
  }

  private toggleMarkdownWrapper(wrapper: "**" | "*" | "~~" | "==") {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    
    if (selectedText.length === 0) {
      // Empty selection: insert **** and place cursor in middle
      const text = wrapper + wrapper;
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStart(node, wrapper.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const alreadyWrapped = selectedText.startsWith(wrapper) && selectedText.endsWith(wrapper);
      const newText = alreadyWrapped
        ? selectedText.slice(wrapper.length, -wrapper.length)
        : wrapper + selectedText + wrapper;
      
      this.editor.replaceSelection(newText);
    }
  }

  getViewType(): string {
    return 'card-sidebar';
  }

  getDisplayText(): string {
    return 'Card Sidebar';
  }

  getIcon(): string {
    return 'rectangle-horizontal';
  }

  private _loadInProgress = false;
  private _loadingEl: HTMLElement | null = null;
  private _loadingTimeout: any;
  private _masonryObserver: ResizeObserver | null = null;
  private _masonryMutationObserver: MutationObserver | null = null;
  private _masonryTimeout: any = null;

  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();
    container.addClass('sc-sidebar-container');
    this.currentSortMode = ((this.plugin as any).settings.sortMode || 'manual') as SortMode;
    this.sortAscending = typeof (this.plugin as any).settings.sortAscending === 'boolean'
      ? !!(this.plugin as any).settings.sortAscending
      : true;
    
    const mainContainer = container.createDiv('sc-sidebar-main');
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'column';
    mainContainer.style.height = '100%';

    this.createHeader(mainContainer);
    this.createSearchBar(mainContainer);

    this.cardsContainer = mainContainer.createDiv('sc-sidebar-cards-container');
    this.cardsContainer.style.flex = '1';
    this.cardsContainer.style.overflow = 'auto';
    this.cardsContainer.style.position = 'relative';

    // Apply scrollbar visibility
    this.applyScrollbarSetting();

    this.createInputBox(mainContainer);

    this.setupListeners();
    this.setupPositionDetection();
    this.setupLayoutObservers();
    this.registerVaultEvents();

    this.showLoadingOverlay();
    try {
      await this.renderCards();
    } finally {
      this.hideLoadingOverlay(300);
    }
  }

  private showLoadingOverlay(maxMs = 2000) {
    const parent = this.cardsContainer || this.containerEl;
    if (!parent || this._loadingEl) return;

    this._loadingEl = parent.createDiv('sc-sidebar-loading');
    this._loadingEl.style.position = 'absolute';
    this._loadingEl.style.inset = '0';
    this._loadingEl.style.display = 'flex';
    this._loadingEl.style.alignItems = 'center';
    this._loadingEl.style.justifyContent = 'center';
    this._loadingEl.style.background = 'var(--background-primary)';
    this._loadingEl.style.zIndex = '9999';

    const box = this._loadingEl.createDiv();
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.alignItems = 'center';
    box.style.gap = '8px';

    const spinner = box.createDiv('sc-sidebar-spinner');
    spinner.style.width = '36px';
    spinner.style.height = '36px';
    spinner.style.border = '4px solid var(--background-modifier-border)';
    spinner.style.borderTopColor = 'var(--interactive-accent)';
    spinner.style.borderRadius = '50%';
    // Inline animation if not in CSS
    spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 800, iterations: Infinity });

    box.createDiv({ text: 'Loading cards...', cls: 'sc-sidebar-loading-text' });

    this._loadingTimeout = setTimeout(() => this.hideLoadingOverlay(), maxMs);
  }

  private hideLoadingOverlay(fadeMs = 0) {
    if (this._loadingTimeout) {
      clearTimeout(this._loadingTimeout);
      this._loadingTimeout = null;
    }
    if (this._loadingEl) {
      this._loadingEl.remove();
      this._loadingEl = null;
    }
  }

  private setupPositionDetection() {
    const detect = () => {
      let position = 'right';
      let current = this.containerEl as HTMLElement;
      let depth = 0;
      while (current && depth < 10) {
        const cls = current.className || '';
        if (cls.includes('side-dock-left')) { position = 'left'; break; }
        if (cls.includes('side-dock-right')) { position = 'right'; break; }
        current = current.parentElement as HTMLElement;
        depth++;
      }
      // @ts-ignore
      if (this.plugin.settings.sidebarPosition !== position) {
        // @ts-ignore
        this.plugin.settings.sidebarPosition = position;
        // @ts-ignore
        this.plugin.saveSettings();
      }
    };
    detect();
    const observer = new MutationObserver(detect);
    if (this.containerEl.parentElement) {
      observer.observe(this.containerEl.parentElement, { attributes: true, attributeFilter: ['class'] });
    }
  }

  private setupLayoutObservers() {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        // Refresh masonry or layout if needed
      });
      ro.observe(this.cardsContainer);
    }
  }

  private registerVaultEvents() {
    this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
      if (!(file instanceof TFile)) return;
      // @ts-ignore
      const pending = this.store._pendingTagWrites.get(file.path);
      if (pending) {
        // @ts-ignore
        await this.store.handlePendingTagReapply(file, pending);
      } else {
        await this.store.updateCardFromNotePath(file.path);
      }
    }));
  }

  private createHeader(container: HTMLElement): void {
    if (this.plugin.settings.disableFilterButtons) return;

    const header = container.createDiv('sc-sidebar-header');
    const filterGroup = header.createDiv('sc-category-group');
    filterGroup.style.display = 'flex';
    filterGroup.style.gap = '8px';
    filterGroup.style.overflowX = 'auto';
    filterGroup.style.flexWrap = 'nowrap';
    filterGroup.style.whiteSpace = 'nowrap';

    const settings = this.plugin.settings;
    const cats: Array<{ id: string; label: string; showInMenu?: boolean }> =
      Array.isArray(settings.customCategories) ? settings.customCategories : [];

    // Build ordered chip list using allItemsOrder if available
    const defaultOrder = ['filter-all']
      .concat(!settings.disableTimeBasedFiltering ? ['filter-today', 'filter-tomorrow'] : [])
      .concat(!settings.hideArchivedFilterButton ? ['filter-archived'] : [])
      .concat(cats.map(c => String(c.id || '')));

    const combinedOrder = Array.isArray(settings.allItemsOrder) && settings.allItemsOrder.length > 0
      ? settings.allItemsOrder
      : defaultOrder;

    const chips: Array<{ type: string; label: string; value: string }> = [];

    combinedOrder.forEach(itemId => {
      if (!itemId) return;
      if (itemId === 'filter-all') {
        chips.push({ type: 'all', label: 'All', value: 'all' });
        return;
      }
      if (itemId === 'filter-today') {
        if (!settings.disableTimeBasedFiltering) chips.push({ type: 'category', label: 'Today', value: 'today' });
        return;
      }
      if (itemId === 'filter-tomorrow') {
        if (!settings.disableTimeBasedFiltering) chips.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
        return;
      }
      if (itemId === 'filter-archived') {
        if (!settings.hideArchivedFilterButton) chips.push({ type: 'archived', label: 'Archived', value: 'archived' });
        return;
      }
      const cat = cats.find(c => String(c.id) === String(itemId));
      if (cat && cat.showInMenu !== false) {
        chips.push({ type: 'category', label: cat.label || '', value: cat.id || cat.label || '' });
      }
    });

    // Ensure 'All' is always present
    if (!chips.find(c => c.value === 'all')) {
      chips.unshift({ type: 'all', label: 'All', value: 'all' });
    }

    chips.forEach(chip => {
      const btn = filterGroup.createEl('button', { text: chip.label });
      btn.addClass('sc-category-btn');
      btn.dataset.filterType = chip.type;
      btn.dataset.filterValue = chip.value;

      // Apply custom colors from filterColors settings
      const colorKey = chip.value === 'all' ? 'all'
        : chip.value === 'today' ? 'today'
        : chip.value === 'tomorrow' ? 'tomorrow'
        : chip.value === 'archived' ? 'archived'
        : chip.value;

      const customColors = settings.filterColors?.[colorKey];
      if (customColors?.bgColor) btn.style.setProperty('background-color', customColors.bgColor, 'important');
      if (customColors?.textColor) btn.style.setProperty('color', customColors.textColor, 'important');

      btn.addEventListener('click', async () => {
        filterGroup.querySelectorAll('.sc-category-btn').forEach(b => {
          (b as HTMLElement).removeClass('active');
          const bVal = (b as HTMLElement).dataset.filterValue || '';
          const bColors = settings.filterColors?.[bVal];
          if (bColors?.bgColor) (b as HTMLElement).style.setProperty('background-color', bColors.bgColor, 'important');
          else (b as HTMLElement).style.removeProperty('background-color');
          if (bColors?.textColor) (b as HTMLElement).style.setProperty('color', bColors.textColor, 'important');
          else (b as HTMLElement).style.removeProperty('color');
        });
        btn.addClass('active');
        if (chip.type === 'archived') {
          this.activeFilters.archivedOnly = true;
          this.activeFilters.category = undefined;
        } else if (chip.type === 'all') {
          this.activeFilters.archivedOnly = false;
          this.activeFilters.category = undefined;
        } else if (chip.type === 'category') {
          this.activeFilters.archivedOnly = false;
          this.activeFilters.category = chip.value;
        }
        await this.renderCards();
      });
    });
  }

  private applyScrollbarSetting(): void {
    if (!this.cardsContainer) return;
    if (this.plugin.settings.hideScrollbar) {
      this.cardsContainer.addClass('hide-scrollbar');
      // Also apply to parent if needed
      this.containerEl.querySelector('.view-content')?.addClass('hide-scrollbar');
    } else {
      this.cardsContainer.removeClass('hide-scrollbar');
      this.containerEl.querySelector('.view-content')?.removeClass('hide-scrollbar');
    }
  }

  private createSearchBar(container: HTMLElement): void {
    const wrapper = container.createDiv('sc-search-wrap');
    if (this.plugin.settings.searchBarVisible) {
      wrapper.style.display = '';
    } else {
      wrapper.style.display = 'none';
    }
    const row = wrapper.createDiv('sc-search-row');

    const iconSpan = row.createSpan({ cls: 'sc-search-input-icon' });
    try { setIcon(iconSpan as any, 'search'); } catch {}

    const input = row.createEl('input', { type: 'search', placeholder: 'Search cards…', cls: 'sc-search-input' });
    const clearBtn = row.createEl('button', { text: '✕', cls: 'sc-search-clear-btn' });
    clearBtn.style.display = 'none';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      input.value = '';
      this.activeFilters.query = '';
      this.renderCardsDebounced();
      clearBtn.style.display = 'none';
      input.focus();
    });

    input.addEventListener('input', () => {
      this.activeFilters.query = input.value || '';
      clearBtn.style.display = this.activeFilters.query ? '' : 'none';
      this.renderCardsDebounced();
    });
  }

  private createInputBox(container: HTMLElement): void {
    const inputContainer = container.createDiv('sc-sidebar-input-container');
    inputContainer.style.padding = '8px';
    inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    inputContainer.style.background = 'var(--background-primary)';
    inputContainer.style.position = 'sticky';
    inputContainer.style.bottom = '0';

    const editorEl = inputContainer.createDiv({
      cls: 'sc-sidebar-input',
    });
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';
    editorEl.style.width = '100%';
    editorEl.style.minHeight = '36px';
    editorEl.style.maxHeight = '200px';
    editorEl.style.padding = '8px';
    editorEl.style.border = '1px solid var(--background-modifier-border)';
    editorEl.style.overflowY = 'auto';
    editorEl.style.whiteSpace = 'pre-wrap';
    editorEl.style.position = 'relative';

    // Simple placeholder logic for contenteditable
    const updatePlaceholder = () => {
      if (!editorEl.textContent?.trim()) {
        editorEl.addClass('is-empty');
      } else {
        editorEl.removeClass('is-empty');
      }
    };
    updatePlaceholder();
    editorEl.addEventListener('input', updatePlaceholder);

    const autoResize = () => {
      // For contenteditable, it auto-resizes by default, but we might want to enforce max-height
    };
    
    editorEl.addEventListener('focusin', () => {
      // @ts-ignore
      this.app.keymap.pushScope(this.editorScope);
      // @ts-ignore
      this.app.workspace.activeEditor = this.owner;
    });

    editorEl.addEventListener('blur', () => {
      // @ts-ignore
      this.app.keymap.popScope(this.editorScope);
      // @ts-ignore
      if (this.app.workspace.activeEditor === this.owner) {
        // @ts-ignore
        this.app.workspace.activeEditor = null;
      }
    });

    // Tag autocomplete logic for contenteditable (simplified version for now)
    editorEl.addEventListener('input', () => {
      // Simplified autocomplete trigger or use the TagAutocomplete class if compatible
    });

    const buttonContainer = inputContainer.createDiv('sc-sidebar-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.marginTop = '8px';

    const searchBtn = buttonContainer.createEl('button');
    searchBtn.addClass('sc-icon-btn');
    try { setIcon(searchBtn, 'search'); } catch { searchBtn.textContent = 'Search'; }
    searchBtn.title = 'Toggle search';
    searchBtn.addEventListener('click', () => {
      const wrap = this.containerEl.querySelector('.sc-search-wrap') as HTMLElement;
      if (wrap) {
        const isVisible = wrap.style.display !== 'none';
        wrap.style.display = isVisible ? 'none' : '';
        this.plugin.settings.searchBarVisible = !isVisible;
        this.plugin.saveSettings();
      }
    });

    const reloadBtn = buttonContainer.createEl('button');
    reloadBtn.addClass('sc-icon-btn');
    reloadBtn.title = 'Reload cards';
    try { setIcon(reloadBtn, 'refresh-cw'); } catch { reloadBtn.textContent = 'Reload'; }
    reloadBtn.addEventListener('click', async () => {
      await this.renderCards(true);
      new Notice('Cards reloaded');
    });

    const sortBtn = buttonContainer.createEl('button');
    sortBtn.addClass('sc-icon-btn');
    sortBtn.title = 'Sort';
    try { setIcon(sortBtn, 'sort-desc'); } catch { sortBtn.textContent = 'Sort'; }
    sortBtn.addEventListener('click', async (e) => {
      const menu = new Menu();
      const modes: Array<{ key: SortMode; label: string }> = [
        { key: 'manual', label: 'Manual' },
        { key: 'created', label: 'Created Time' },
        { key: 'modified', label: 'Modified Time' },
        { key: 'alpha', label: 'A → Z' },
        { key: 'status', label: 'Status' }
      ];
      modes.forEach(m => {
        menu.addItem(item => {
          item.setTitle(m.label);
          if (this.currentSortMode === m.key) item.setChecked(true);
          item.onClick(async () => {
            this.currentSortMode = m.key;
            (this.plugin as any).settings.sortMode = m.key;
            await (this.plugin as any).saveSettings();
            await this.renderCards();
          });
        });
      });
      menu.addSeparator();
      menu.addItem(item => {
        item.setTitle(this.sortAscending ? 'Direction: Ascending' : 'Direction: Descending');
        item.onClick(async () => {
          this.sortAscending = !this.sortAscending;
          (this.plugin as any).settings.sortAscending = this.sortAscending;
          await (this.plugin as any).saveSettings();
          await this.renderCards();
        });
      });
      menu.showAtMouseEvent(e);
    });

    const pinToggleBtn = buttonContainer.createEl('button');
    pinToggleBtn.addClass('sc-icon-btn');
    try { setIcon(pinToggleBtn, 'pin'); } catch { pinToggleBtn.textContent = 'Pin'; }
    pinToggleBtn.title = 'Show pinned only';
    pinToggleBtn.addEventListener('click', async () => {
      this.activeFilters.pinnedOnly = !this.activeFilters.pinnedOnly;
      await this.renderCards();
    });

    const gridToggleBtn = buttonContainer.createEl('button');
    gridToggleBtn.addClass('sc-icon-btn');
    try { setIcon(gridToggleBtn, 'layout-grid'); } catch { gridToggleBtn.textContent = 'Grid'; }
    gridToggleBtn.title = 'Toggle grid layout';
    gridToggleBtn.addEventListener('click', async () => {
      const s = (this.plugin as any).settings;
      s.verticalCardMode = !s.verticalCardMode;
      await (this.plugin as any).saveSettings();
      await flipAnimateAsync(this.cardsContainer, async () => {
        this.applyLayoutMode();
      }, {}, this.store.settings);
    });

    const addButton = buttonContainer.createEl('button');
    addButton.addClass('sc-add-btn');
    addButton.textContent = 'Add Card';
    addButton.addEventListener('click', async () => {
      const content = editorEl.textContent?.trim();
      if (!content) return;

      // Extract tags (#tag) and categories (@category)
      const tags: string[] = [];
      const tagRegex = /#([^\s#@,.]+)/g;
      let match;
      while ((match = tagRegex.exec(content)) !== null) {
        tags.push(match[1]);
      }

      const catRegex = /@([^\s#@,.]+)/g;
      const catMatch = catRegex.exec(content);
      const category = catMatch ? catMatch[1] : (this.activeFilters.category || undefined);

      // Clean content (optional: user might want to keep them)
      // For now, keep them in content but also add to metadata
      
      const card = new Card({ 
        content, 
        tags,
        category: category === 'all' ? undefined : category 
      });
      await this.store.add(card);
      editorEl.textContent = '';
      updatePlaceholder();
      await this.renderCards();
    });
  }

  private setupListeners(): void {
    this.eventBus.on('card:added', () => this.renderCards());
    this.eventBus.on('card:deleted', () => this.renderCards());
    this.eventBus.on('card:updated', () => this.renderCards());
    this.eventBus.on('filter:tag', (tag) => {
      if (this.activeFilters.tags.includes(tag)) {
        this.activeFilters.tags = this.activeFilters.tags.filter(t => t !== tag);
      } else {
        this.activeFilters.tags.push(tag);
      }
      this.renderCards();
    });

    this.eventBus.on('card:contextmenu', ({ card, event }) => {
      const menu = new Menu();
      menu.addItem(item => {
        item.setTitle('Delete')
          .setIcon('trash')
          .onClick(() => this.store.delete(card.id));
      });
      menu.addItem(item => {
        item.setTitle(card.archived ? 'Unarchive' : 'Archive')
          .setIcon('archive')
          .onClick(() => this.store.update(card.id, { archived: !card.archived }));
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderTimeout: any;
  private renderCardsDebounced(): void {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => this.renderCards(), 300);
  }

  private async renderCards(isManualReload = false): Promise<void> {
    const settings = { ...this.store.settings };
    if (isManualReload) {
      // If manually reloading, we might want to skip animation or use a faster one
      // But user said "reload cards makes the cards come in with the fade in" as if it's an issue
      // Let's make reload NOT fade in if they prefer instant
      settings.animatedCards = false;
      settings.disableCardFadeIn = true;
    }
    
    const scrollTop = this.cardsContainer?.scrollTop || 0;

    await flipAnimateAsync(this.cardsContainer, async () => {
      // Clear existing components
      this.cardComponents.forEach(comp => comp.destroy());
      this.cardComponents.clear();
      this.cardsContainer.empty();

      // Filter and sort
      let cards = this.store.getAll();
      cards = this.filterService.filter(cards, this.activeFilters);
      cards = this.sortService.sort(cards, this.currentSortMode, this.sortAscending);

      // Render each card
      for (const card of cards) {
        const comp = new CardComponent(this.cardsContainer, card, this.store, this.app, this.plugin);
        this.cardComponents.set(card.id, comp);
      }

      // Apply layout mode (Masonry) BEFORE measurements are taken by flipAnimateAsync
      this.applyLayoutMode();

      // Restore scroll position BEFORE measurements are taken
      if (this.cardsContainer) {
        this.cardsContainer.scrollTop = scrollTop;
      }
    }, {}, settings);
  }

  async onClose(): Promise<void> {
    if (this._masonryObserver) {
      this._masonryObserver.disconnect();
      this._masonryObserver = null;
    }
    if (this._masonryMutationObserver) {
      this._masonryMutationObserver.disconnect();
      this._masonryMutationObserver = null;
    }
    if (this._masonryTimeout) {
      clearTimeout(this._masonryTimeout);
      this._masonryTimeout = null;
    }
    this.cardComponents.forEach(comp => comp.destroy());
    this.cardComponents.clear();
  }

  private applyLayoutMode(): void {
    if (!this.cardsContainer) return;
    const grid = !!this.plugin.settings.verticalCardMode;
    if (grid) {
      this.cardsContainer.addClass('grid-mode');
      this.cardsContainer.addClass('vertical-card-mode');
      this.setupMasonryObserver();
      this.refreshMasonrySpans();
    } else {
      this.cardsContainer.removeClass('grid-mode');
      this.cardsContainer.removeClass('vertical-card-mode');
      if (this._masonryObserver) {
        this._masonryObserver.disconnect();
        this._masonryObserver = null;
      }
      if (this._masonryMutationObserver) {
        this._masonryMutationObserver.disconnect();
        this._masonryMutationObserver = null;
      }
      this.cardsContainer.querySelectorAll('.sc-card').forEach((el) => {
        (el as HTMLElement).style.gridRowEnd = '';
      });
    }
  }

  private setupMasonryObserver(): void {
    if (!this.cardsContainer) return;
    if (typeof ResizeObserver === 'undefined') {
      this.setupMasonryMutationObserver();
      return;
    }
    if (this._masonryObserver) this._masonryObserver.disconnect();
    this._masonryObserver = new ResizeObserver(() => {
      if (this._masonryTimeout) clearTimeout(this._masonryTimeout);
      this._masonryTimeout = setTimeout(() => this.refreshMasonrySpans(), 50);
    });
    this._masonryObserver.observe(this.cardsContainer);
    this.cardsContainer.querySelectorAll('.sc-card').forEach(el => {
      this._masonryObserver?.observe(el);
    });
    this.setupMasonryMutationObserver();
  }

  private refreshMasonrySpans(): void {
    if (!this.plugin.settings.verticalCardMode || !this.cardsContainer) return;
    const cards = this.cardsContainer.querySelectorAll('.sc-card:not(.drag-spacer)');
    cards.forEach((el) => {
      const card = el as HTMLElement;
      card.style.gridRowEnd = 'auto';
      const h = card.getBoundingClientRect().height;
      if (h > 0) {
        const span = Math.max(1, Math.ceil(h + 8));
        card.style.gridRowEnd = `span ${span}`;
      }
    });
  }

  private setupMasonryMutationObserver(): void {
    if (!this.cardsContainer || typeof MutationObserver === 'undefined') return;
    if (this._masonryMutationObserver) this._masonryMutationObserver.disconnect();
    let recalcTimeout: any = null;
    const debounced = () => {
      if (recalcTimeout) clearTimeout(recalcTimeout);
      recalcTimeout = setTimeout(() => this.refreshMasonrySpans(), 120);
    };
    this._masonryMutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'childList' ||
          mutation.type === 'characterData' ||
          (mutation.type === 'attributes' && mutation.attributeName === 'class')
        ) {
          debounced();
          break;
        }
      }
    });
    this._masonryMutationObserver.observe(this.cardsContainer, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }
}
