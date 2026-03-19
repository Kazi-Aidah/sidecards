
import { ItemView, WorkspaceLeaf, Notice, Menu, TFile, setIcon, Scope, Editor } from "obsidian";
import { CardStore } from "../services/CardStore";
import { FilterService, FilterOptions } from "../services/FilterService";
import { SortService, SortMode } from "../services/SortService";
import { EventBus } from "../core/EventBus";
import { CardComponent } from "./components/Card";
import { flipAnimateAsync } from "../utils/animations";
import { Card } from "../models/Card";
import SideCardsPlugin from "../core/Plugin";
import { InlineAutocomplete } from "./components/InlineAutocomplete";
import { resolveAutoColor } from "../utils/dom";

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
    this.setupMockEditor();
  }

  private setupMockEditor() {
    this.editor = {
      getSelection: () => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return "";
        const selectedText = sel.toString();
        if (selectedText.length > 0) return selectedText;
        const wordRange = this.getWordRangeAtCaret(sel);
        return wordRange ? wordRange.toString() : "";
      },
      replaceSelection: (text: string) => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const currentRange = sel.getRangeAt(0);
        const range = currentRange.collapsed
          ? (this.getWordRangeAtCaret(sel) || currentRange)
          : currentRange;
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
      toggleHighlight: () => this.toggleMarkdownWrapper("=="),
      toggleComment: () => this.toggleMarkdownWrapper("%%", "%%", true),
    } as any;

    this.owner = {
      editor: this.editor,
      editMode: true,
    };
  }

  private isWordChar(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char);
  }

  private getWordRangeAtCaret(selection: Selection): Range | null {
    if (!selection.rangeCount) return null;
    const baseRange = selection.getRangeAt(0);
    if (!baseRange.collapsed) return baseRange;
    const node = baseRange.startContainer;
    if (!(node instanceof Text)) return null;
    const text = node.data;
    if (!text) return null;
    const offset = baseRange.startOffset;
    const leftChar = offset > 0 ? text[offset - 1] : "";
    const rightChar = offset < text.length ? text[offset] : "";
    if (!this.isWordChar(leftChar) && !this.isWordChar(rightChar)) return null;
    let start = offset;
    let end = offset;
    while (start > 0 && this.isWordChar(text[start - 1])) start--;
    while (end < text.length && this.isWordChar(text[end])) end++;
    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);
    return wordRange;
  }

  private toggleMarkdownWrapper(wrapper: "**" | "*" | "~~" | "==" | "%%", closeWrapper?: string, includeInnerPadding = false) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const currentRange = sel.getRangeAt(0);
    const range = currentRange.collapsed
      ? (this.getWordRangeAtCaret(sel) || currentRange)
      : currentRange;
    const selectedText = range.toString();
    const endWrapper = closeWrapper ?? wrapper;
    if (selectedText.length === 0) {
      const text = wrapper + endWrapper;
      const node = document.createTextNode(text);
      range.insertNode(node);
      const cursorOffset = wrapper.length;
      range.setStart(node, cursorOffset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    const alreadyWrapped = selectedText.startsWith(wrapper) && selectedText.endsWith(endWrapper);
    const newText = alreadyWrapped
      ? selectedText.slice(wrapper.length, selectedText.length - endWrapper.length)
      : includeInnerPadding
        ? `${wrapper} ${selectedText} ${endWrapper}`
        : `${wrapper}${selectedText}${endWrapper}`;
    sel.removeAllRanges();
    sel.addRange(range);
    this.editor.replaceSelection(newText);
  }

  private applySelectionWrapShortcut(event: KeyboardEvent, root: HTMLElement): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const wrapMap: Record<string, [string, string]> = {
      "[": ["[", "]"],
      "(": ["(", ")"],
      "{": ["{", "}"],
      "`": ["`", "`"],
    };
    const pair = wrapMap[event.key];
    if (!pair) return false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    if (!selectedText || !root.contains(range.commonAncestorContainer)) return false;
    event.preventDefault();
    const [open, close] = pair;
    const newText = `${open}${selectedText}${close}`;
    this.editor.replaceSelection(newText);
    return true;
  }

  private getEffectiveHotkeys(commandId: string): Array<{ modifiers?: string[]; key?: string }> {
    const appAny = this.app as any;
    const fromManager = appAny.hotkeyManager?.getHotkeys?.(commandId);
    if (Array.isArray(fromManager) && fromManager.length > 0) return fromManager;
    const custom = appAny.hotkeyManager?.customKeys?.[commandId];
    if (Array.isArray(custom) && custom.length > 0) return custom;
    const defaults = appAny.commands?.commands?.[commandId]?.hotkeys;
    if (Array.isArray(defaults) && defaults.length > 0) return defaults;
    return [];
  }

  private getFormattingCommandIds(kind: "bold" | "italic" | "highlight" | "comment"): string[] {
    const defaults: Record<"bold" | "italic" | "highlight" | "comment", string[]> = {
      bold: ["editor:toggle-bold"],
      italic: ["editor:toggle-italic", "editor:toggle-emphasis"],
      highlight: ["editor:toggle-highlight"],
      comment: ["editor:toggle-comment"],
    };
    const appAny = this.app as any;
    const commands = appAny.commands?.commands || {};
    const matcher: Record<"bold" | "italic" | "highlight" | "comment", RegExp> = {
      bold: /bold/i,
      italic: /italic|emphasis/i,
      highlight: /highlight/i,
      comment: /comment/i,
    };
    const discovered = Object.values(commands)
      .filter((cmd: any) => typeof cmd?.id === "string" && cmd.id.startsWith("editor:"))
      .filter((cmd: any) => matcher[kind].test(String(cmd?.name || "")))
      .map((cmd: any) => String(cmd.id));
    return Array.from(new Set([...defaults[kind], ...discovered]));
  }

  private eventMatchesHotkey(event: KeyboardEvent, hotkey: { modifiers?: string[]; key?: string }): boolean {
    const key = String(hotkey?.key || "").toLowerCase();
    if (!key) return false;
    const eventKey = String(event.key || "").toLowerCase();
    if (eventKey !== key) return false;
    const modifierSet = new Set((hotkey.modifiers || []).map(m => String(m).toLowerCase()));
    const hasMod = modifierSet.has("mod");
    const expectsCtrl = hasMod || modifierSet.has("ctrl");
    const expectsMeta = hasMod || modifierSet.has("meta");
    const expectsAlt = modifierSet.has("alt");
    const expectsShift = modifierSet.has("shift");
    if (expectsCtrl !== event.ctrlKey) return false;
    if (expectsMeta !== event.metaKey) return false;
    if (expectsAlt !== event.altKey) return false;
    if (expectsShift !== event.shiftKey) return false;
    return true;
  }

  private applyFormattingHotkey(event: KeyboardEvent, root: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return false;
    const targets: Array<{ kind: "bold" | "italic" | "highlight" | "comment"; run: () => void }> = [
      { kind: "bold", run: () => this.toggleMarkdownWrapper("**") },
      { kind: "italic", run: () => this.toggleMarkdownWrapper("*") },
      { kind: "highlight", run: () => this.toggleMarkdownWrapper("==") },
      { kind: "comment", run: () => this.toggleMarkdownWrapper("%%", "%%", true) },
    ];
    for (const target of targets) {
      const commandIds = this.getFormattingCommandIds(target.kind);
      const hotkeys = commandIds.flatMap(id => this.getEffectiveHotkeys(id));
      if (!hotkeys.length) continue;
      if (!hotkeys.some(h => this.eventMatchesHotkey(event, h))) continue;
      event.preventDefault();
      event.stopPropagation();
      target.run();
      return true;
    }
    return false;
  }

  getViewType(): string {
    return 'card-sidebar';
  }

  getDisplayText(): string {
    return 'Card sidebar';
  }

  getIcon(): string {
    return 'rectangle-horizontal';
  }

  private _loadInProgress = false;
  private _loadingEl: HTMLElement | null = null;
  private _loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  private _masonryObserver: ResizeObserver | null = null;
  private _masonryMutationObserver: MutationObserver | null = null;
  private _masonryTimeout: ReturnType<typeof setTimeout> | null = null;

  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();
    container.addClass('sc-sidebar-container');
    this.currentSortMode = (this.plugin.settings.sortMode || 'manual') as SortMode;
    this.sortAscending = typeof this.plugin.settings.sortAscending === 'boolean'
      ? !!this.plugin.settings.sortAscending
      : true;
    
    const mainContainer = container.createDiv('sc-sidebar-main');

    this.createHeader(mainContainer);
    this.createSearchBar(mainContainer);

    this.cardsContainer = mainContainer.createDiv('sc-sidebar-cards-container');

    // Apply scrollbar visibility
    this.applyScrollbarSetting();

    this.createInputBox(mainContainer);

    this.setupListeners();
    this.setupPositionDetection();
    this.setupLayoutObservers();
    this.registerVaultEvents();

    // Apply openCategoryOnLoad
    const openOn = this.plugin.settings.openCategoryOnLoad || 'all';
    const btn = mainContainer.querySelector(`.sc-category-btn[data-filter-value="${openOn}"]`);
    if (btn instanceof HTMLElement) btn.click();

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

    const box = this._loadingEl.createDiv('sc-sidebar-loading-inner');

    const spinner = box.createDiv('sc-sidebar-spinner');
    // Inline animation fallback (CSS @keyframes preferred but this works without it)
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
      let current = this.containerEl;
      let depth = 0;
      while (current && depth < 10) {
        const cls = current.className || '';
        if (cls.includes('side-dock-left')) { position = 'left'; break; }
        if (cls.includes('side-dock-right')) { position = 'right'; break; }
        current = current.parentElement as HTMLElement;
        depth++;
      }
      if (this.plugin.settings.sidebarPosition !== position) {
        this.plugin.settings.sidebarPosition = position;
        void this.plugin.saveSettings();
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
      // Skip if we're the ones writing this file (prevents expiry/color wipe race)
      // @ts-ignore
      if (this.store._syncingPaths?.has(file.path)) return;
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

    const settings = this.plugin.settings;
    const cats: Array<{ id: string; label: string; showInMenu?: boolean }> =
      Array.isArray(settings.customCategories) ? settings.customCategories : [];

    // Build ordered chip list using allItemsOrder if available
    const defaultOrder = ['filter-all']
      .concat(!settings.hideTodayFilter ? ['filter-today'] : [])
      .concat(!settings.hideTomorrowFilter ? ['filter-tomorrow'] : [])
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
        if (!settings.hideTodayFilter) chips.push({ type: 'category', label: 'Today', value: 'today' });
        return;
      }
      if (itemId === 'filter-tomorrow') {
        if (!settings.hideTomorrowFilter) chips.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
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

      btn.addEventListener('click', () => {
        void (async () => {
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
        })();
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
    wrapper.toggleClass('sc-search-wrap--hidden', !this.plugin.settings.searchBarVisible);
    const row = wrapper.createDiv('sc-search-row');

    const iconSpan = row.createSpan({ cls: 'sc-search-input-icon' });
    try { setIcon(iconSpan as any, 'search'); } catch { /* icon may not exist */ }

    const input = row.createEl('input', { type: 'search', placeholder: 'Search cards…', cls: 'sc-search-input' });
    const clearBtn = row.createEl('button', { text: '✕', cls: 'sc-search-clear-btn' });
    clearBtn.toggleClass('sc-search-wrap--hidden', true);
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      input.value = '';
      this.activeFilters.query = '';
      this.renderCardsDebounced();
      clearBtn.toggleClass('sc-search-wrap--hidden', true);
      input.focus();
    });

    input.addEventListener('input', () => {
      this.activeFilters.query = input.value || '';
      clearBtn.toggleClass('sc-search-wrap--hidden', !this.activeFilters.query);
      this.renderCardsDebounced();
    });
  }

  private createInputBox(container: HTMLElement): void {
    const inputContainer = container.createDiv('sc-sidebar-input-container');

    const editorEl = inputContainer.createDiv({ cls: 'sc-sidebar-input' });

    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';
    const updatePlaceholder = () => {
      if (!editorEl.textContent?.trim()) {
        editorEl.addClass('is-empty');
      } else {
        editorEl.removeClass('is-empty');
      }
    };
    updatePlaceholder();
    editorEl.addEventListener('input', updatePlaceholder);

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

    // @category / #tag inline autocomplete
    new InlineAutocomplete(editorEl, this.store);

    editorEl.addEventListener('keydown', (e) => {
      if (this.applyFormattingHotkey(e, editorEl)) return;
      this.applySelectionWrapShortcut(e, editorEl);

      // Save key handling
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s+_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
      if (pressed === saveKey || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        addButton.click();
      }
    });

    const buttonContainer = inputContainer.createDiv('sc-sidebar-button-container');

    const searchBtn = buttonContainer.createEl('button');
    searchBtn.addClass('sc-icon-btn');
    try { setIcon(searchBtn, 'search'); } catch { searchBtn.textContent = 'Search'; }
    searchBtn.title = 'Toggle search';
    searchBtn.addEventListener('click', () => {
      const wrap = this.containerEl.querySelector('.sc-search-wrap');
      if (wrap) {
        const isHidden = wrap.hasClass('sc-search-wrap--hidden');
        wrap.toggleClass('sc-search-wrap--hidden', !isHidden);
        this.plugin.settings.searchBarVisible = isHidden;
        void this.plugin.saveSettings();
      }
    });

    const reloadBtn = buttonContainer.createEl('button');
    reloadBtn.addClass('sc-icon-btn');
    reloadBtn.title = 'Reload cards';
    try { setIcon(reloadBtn, 'refresh-cw'); } catch { reloadBtn.textContent = 'Reload'; }
    reloadBtn.addEventListener('click', () => {
      void (async () => {
        await this.renderCards(true);
        new Notice('Cards reloaded');
      })();
    });

    const sortBtn = buttonContainer.createEl('button');
    sortBtn.addClass('sc-icon-btn');
    sortBtn.title = 'Sort';
    try { setIcon(sortBtn, 'sort-desc'); } catch { sortBtn.textContent = 'Sort'; }
    sortBtn.addEventListener('click', (e) => {
      void (async () => {
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
            this.plugin.settings.sortMode = m.key;
            await this.plugin.saveSettings();
            await this.renderCards();
          });
        });
      });
      menu.addSeparator();
      menu.addItem(item => {
        item.setTitle(this.sortAscending ? 'Direction: Ascending' : 'Direction: Descending');
        item.onClick(async () => {
          this.sortAscending = !this.sortAscending;
          this.plugin.settings.sortAscending = this.sortAscending;
          await this.plugin.saveSettings();
          await this.renderCards();
        });
      });
      menu.showAtMouseEvent(e);
      })();
    });

    const pinToggleBtn = buttonContainer.createEl('button');
    pinToggleBtn.addClass('sc-icon-btn');
    try { setIcon(pinToggleBtn, 'pin'); } catch { pinToggleBtn.textContent = 'Pin'; }
    pinToggleBtn.title = 'Show pinned only';
    pinToggleBtn.addEventListener('click', () => {
      void (async () => {
        this.activeFilters.pinnedOnly = !this.activeFilters.pinnedOnly;
        await this.renderCards();
      })();
    });

    const gridToggleBtn = buttonContainer.createEl('button');
    gridToggleBtn.addClass('sc-icon-btn');
    try { setIcon(gridToggleBtn, 'layout-grid'); } catch { gridToggleBtn.textContent = 'Grid'; }
    gridToggleBtn.title = 'Toggle grid layout';
    gridToggleBtn.addEventListener('click', () => {
      void (async () => {
        this.plugin.settings.verticalCardMode = !this.plugin.settings.verticalCardMode;
        await this.plugin.saveSettings();
        await flipAnimateAsync(this.cardsContainer, async () => {
          this.applyLayoutMode();
        }, {}, this.store.settings);
      })();
    });

    const addButton = buttonContainer.createEl('button');
    addButton.addClass('sc-add-btn');
    addButton.textContent = 'Add card';
    addButton.addEventListener('click', () => {
      void (async () => {
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

        // Auto color
        const autoColor = resolveAutoColor(content, tags, this.plugin.settings);
        const color = autoColor || 'var(--card-color-1)';
        
        const card = new Card({ 
          content, 
          tags,
          color,
          category: category === 'all' ? undefined : category 
        });
        await this.store.add(card);
        editorEl.textContent = '';
        updatePlaceholder();
      })();
    });
  }

  private setupListeners(): void {
    this.eventBus.on('card:added', () => { void this.renderCards(); });
    this.eventBus.on('card:deleted', () => { void this.renderCards(); });
    this.eventBus.on('card:updated', () => { void this.renderCards(); });
    this.eventBus.on('filter:tag', (tag) => {
      if (this.activeFilters.tags.includes(tag)) {
        this.activeFilters.tags = this.activeFilters.tags.filter(t => t !== tag);
      } else {
        this.activeFilters.tags.push(tag);
      }
      void this.renderCards();
    });

    this.eventBus.on('card:contextmenu', ({ card, event }) => {
      const menu = new Menu();
      menu.addItem(item => {
        item.setTitle('Delete')
          .setIcon('trash')
          .onClick(() => { void this.store.delete(card.id); });
      });
      menu.addItem(item => {
        item.setTitle(card.archived ? 'Unarchive' : 'Archive')
          .setIcon('archive')
          .onClick(() => { void this.store.update(card.id, { archived: !card.archived }); });
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderTimeout: ReturnType<typeof setTimeout> | null = null;
  private renderCardsDebounced(): void {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => { void this.renderCards(); }, 300);
  }

  private async renderCards(isManualReload = false): Promise<void> {
    const settings = { ...this.store.settings };
    const scrollTop = this.cardsContainer?.scrollTop || 0;

    await flipAnimateAsync(this.cardsContainer, async () => {
      // Clear existing components
      this.cardComponents.forEach(comp => comp.destroy());
      this.cardComponents.clear();
      this.cardsContainer.empty();

      // Filter and sort
      let cards = this.store.getAll();
      cards = this.filterService.filter(cards, this.activeFilters);
      cards = this.sortService.sort(cards, this.currentSortMode, this.sortAscending, this.app);

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
        (el as HTMLElement).style.removeProperty('grid-row-end');
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
      card.style.removeProperty('grid-row-end');
      const h = card.getBoundingClientRect().height;
      if (h > 0) {
        const span = Math.max(1, Math.ceil(h + 8));
        card.style.setProperty('grid-row-end', `span ${span}`);
      }
    });
  }

  private setupMasonryMutationObserver(): void {
    if (!this.cardsContainer || typeof MutationObserver === 'undefined') return;
    if (this._masonryMutationObserver) this._masonryMutationObserver.disconnect();
    let recalcTimeout: ReturnType<typeof setTimeout> | null = null;
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
