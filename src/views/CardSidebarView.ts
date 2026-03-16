
import { ItemView, WorkspaceLeaf, App, Notice, Menu, Modal, MarkdownView, TFile, setIcon } from "obsidian";
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

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SideCardsPlugin,
    private store: CardStore,
    private eventBus: EventBus,
    private filterService: FilterService,
    private sortService: SortService
  ) {
    super(leaf);
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
    container.addClass('card-sidebar-container');
    
    const mainContainer = container.createDiv('card-sidebar-main');
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'column';
    mainContainer.style.height = '100%';

    this.createHeader(mainContainer);
    this.createSearchBar(mainContainer);

    this.cardsContainer = mainContainer.createDiv('card-sidebar-cards-container');
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
    await this.renderCards();
    this.hideLoadingOverlay(300);
  }

  private showLoadingOverlay(maxMs = 2000) {
    const parent = this.cardsContainer || this.containerEl;
    if (!parent || this._loadingEl) return;

    this._loadingEl = parent.createDiv('card-sidebar-loading');
    this._loadingEl.style.position = 'absolute';
    this._loadingEl.style.inset = '0';
    this._loadingEl.style.display = 'flex';
    this._loadingEl.style.alignItems = 'center';
    this._loadingEl.style.justifyContent = 'center';
    this._loadingEl.style.background = 'var(--background-modifier-card, rgba(0,0,0,0.02))';
    this._loadingEl.style.zIndex = '9999';

    const box = this._loadingEl.createDiv();
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.alignItems = 'center';
    box.style.gap = '8px';

    const spinner = box.createDiv('card-sidebar-spinner');
    spinner.style.width = '36px';
    spinner.style.height = '36px';
    spinner.style.border = '4px solid var(--background-modifier-border)';
    spinner.style.borderTopColor = 'var(--interactive-accent)';
    spinner.style.borderRadius = '50%';
    // Inline animation if not in CSS
    spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 800, iterations: Infinity });

    box.createDiv({ text: 'Loading cards...', cls: 'card-sidebar-loading-text' });

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
    const header = container.createDiv('card-sidebar-header');
    const filterGroup = header.createDiv('category-group');
    filterGroup.addClass('card-sidebar-category-group');
    filterGroup.style.display = 'flex';
    filterGroup.style.gap = '8px';
    filterGroup.style.overflowX = 'auto';
    filterGroup.style.flexWrap = 'nowrap';
    filterGroup.style.whiteSpace = 'nowrap';

    const showTimeBasedChips = !this.plugin.settings.disableTimeBasedFiltering;
    const cats: Array<{ id: string; label: string; showInMenu?: boolean }> =
      Array.isArray(this.plugin.settings?.customCategories) ? this.plugin.settings.customCategories : [];

    const chips: Array<{ type: string, label: string, value: string }> = [];
    chips.push({ type: 'all', label: 'All', value: 'all' });
    if (showTimeBasedChips) {
      chips.push({ type: 'category', label: 'Today', value: 'today' });
      chips.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
    }
    if (this.plugin.settings?.enableCustomCategories) {
      cats.forEach((c) => {
        if (!c || c.showInMenu === false) return;
        chips.push({ type: 'category', label: c.label || '', value: c.id || c.label || '' });
      });
    }
    if (!(this.plugin as any).settings?.hideArchivedFilterButton) {
      chips.push({ type: 'archived', label: 'Archived', value: 'archived' });
    }

    chips.forEach(chip => {
      const btn = filterGroup.createEl('button', { text: chip.label });
      btn.addClass('card-category-btn');
      btn.dataset.filterType = chip.type;
      btn.dataset.filterValue = chip.value;
      btn.addEventListener('click', async () => {
        filterGroup.querySelectorAll('.card-category-btn').forEach(b => b.removeClass('active'));
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

  private createSearchBar(container: HTMLElement): void {
    const wrapper = container.createDiv('card-search-wrap');
    const row = wrapper.createDiv('card-search-row');

    const iconSpan = row.createSpan({ cls: 'card-search-input-icon' });
    try { setIcon(iconSpan as any, 'search'); } catch {}

    const input = row.createEl('input', { type: 'search', placeholder: 'Search cards…', cls: 'card-search-input' });
    const clearBtn = row.createEl('button', { text: '✕', cls: 'card-search-clear-btn' });
    clearBtn.style.display = 'none';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      input.value = '';
      this.activeFilters.query = '';
      this.renderCardsDebounced();
      clearBtn.style.display = 'none';
    });

    input.addEventListener('input', () => {
      this.activeFilters.query = input.value || '';
      clearBtn.style.display = this.activeFilters.query ? '' : 'none';
      this.renderCardsDebounced();
    });
  }

  private createInputBox(container: HTMLElement): void {
    const inputContainer = container.createDiv('card-sidebar-input-container');
    inputContainer.style.padding = '8px';
    inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    inputContainer.style.background = 'var(--background-primary)';
    inputContainer.style.position = 'sticky';
    inputContainer.style.bottom = '0';

    const textarea = inputContainer.createEl('textarea');
    textarea.addClass('card-sidebar-input');
    textarea.placeholder = 'Type your idea here... (Use @category and #tag)';
    textarea.rows = 1;
    textarea.style.width = '100%';
    textarea.style.minHeight = '36px';
    textarea.style.maxHeight = '200px';
    textarea.style.padding = '8px';
    textarea.style.border = '1px solid var(--background-modifier-border)';
    textarea.style.borderRadius = '4px';
    textarea.style.resize = 'vertical';
    textarea.style.overflowY = 'hidden';

    const autoResize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener('input', autoResize);
    setTimeout(autoResize, 0);
    const tagAutocomplete = new TagAutocomplete(textarea, this.store);
    tagAutocomplete.attach();

    const buttonContainer = inputContainer.createDiv('card-sidebar-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.marginTop = '8px';

    const searchBtn = buttonContainer.createEl('button');
    try { setIcon(searchBtn, 'search'); } catch { searchBtn.textContent = 'Search'; }
    searchBtn.title = 'Toggle search';
    searchBtn.addEventListener('click', () => {
      const wrap = this.containerEl.querySelector('.card-search-wrap') as HTMLElement;
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
    });

    const reloadBtn = buttonContainer.createEl('button');
    reloadBtn.title = 'Reload cards';
    try { setIcon(reloadBtn, 'refresh-cw'); } catch { reloadBtn.textContent = 'Reload'; }
    reloadBtn.addEventListener('click', async () => {
      await this.renderCards();
      new Notice('Cards reloaded');
    });

    const sortBtn = buttonContainer.createEl('button');
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
    try { setIcon(pinToggleBtn, 'pin'); } catch { pinToggleBtn.textContent = 'Pin'; }
    pinToggleBtn.title = 'Show pinned only';
    pinToggleBtn.addEventListener('click', async () => {
      this.activeFilters.pinnedOnly = !this.activeFilters.pinnedOnly;
      await this.renderCards();
    });

    const gridToggleBtn = buttonContainer.createEl('button');
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
    addButton.addClass('card-add-btn');
    addButton.textContent = 'Add Card';
    addButton.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;
      const card = new Card({ content, category: this.activeFilters.category || undefined });
      await this.store.add(card);
      textarea.value = '';
      await this.renderCards();
    });

    const clearButton = buttonContainer.createEl('button');
    clearButton.addClass('card-clear-btn');
    clearButton.textContent = 'Clear';
    clearButton.style.display = ((this.plugin as any).settings?.hideClearButton ? 'none' : '');
    clearButton.addEventListener('click', () => {
      textarea.value = '';
      textarea.focus();
      autoResize();
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

  private async renderCards(): Promise<void> {
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
    }, {}, this.store.settings);

    this.applyLayoutMode();
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
    const grid = !!(this.plugin as any).settings?.verticalCardMode;
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
      this.cardsContainer.querySelectorAll('.card-sidebar-card').forEach((el) => {
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
    this.cardsContainer.querySelectorAll('.card-sidebar-card').forEach(el => {
      this._masonryObserver?.observe(el);
    });
    this.setupMasonryMutationObserver();
  }

  private refreshMasonrySpans(): void {
    if (!(this.plugin as any).settings?.verticalCardMode || !this.cardsContainer) return;
    const cards = this.cardsContainer.querySelectorAll('.card-sidebar-card:not(.drag-spacer)');
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
  