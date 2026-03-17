import { ItemView, WorkspaceLeaf, Menu, Notice, setIcon, Scope, Editor, TFile } from "obsidian";
import type SideCardsPlugin from "../core/Plugin";
import { CardStore } from "../services/CardStore";
import { Card } from "../models/Card";
import { CardComponent } from "./components/Card";
import { SortService, SortMode } from "../services/SortService";

export class SideCardsHomeView extends ItemView {
  private selectedColor = 'var(--card-color-1)';
  private selectedTags: string[] = [];
  private filterType = '';
  private filterValue = '';
  private editorScope: Scope;
  private editor!: Editor;
  private owner!: any;
  private recentFiles: TFile[] = [];
  private pinnedFiles: TFile[] = [];
  private cardComponents: Map<string, CardComponent> = new Map();
  private currentSortMode: SortMode = 'created';
  private sortAscending: boolean = false;
  private pinnedOnly: boolean = false;
  private currentSearchQuery: string = '';
  private iconicFileIconsCache: Record<string, any> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SideCardsPlugin,
    private store: CardStore,
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
    container.addClass('sc-home-container');
    this.currentSortMode = (this.plugin.settings.sortMode as SortMode) || 'created';
    this.sortAscending = typeof this.plugin.settings.sortAscending === 'boolean' ? this.plugin.settings.sortAscending : false;

    const main = container.createDiv({ cls: 'sc-home-main' });
    
    // Top Section
    const topSection = main.createDiv({ cls: 'sc-home-top' });
    topSection.createEl('h2', { text: 'SideCards', cls: 'sc-home-title' });

    const paletteRow = topSection.createDiv({ cls: 'sc-home-palette-row' });
    const categoryBtn = paletteRow.createEl('button', { text: 'category', cls: 'sc-home-category-btn' });
    categoryBtn.addEventListener('click', (e) => {
      const menu = new Menu();
      this.getAvailableFilters().forEach((f) => {
        menu.addItem(item => item.setTitle(f.label).onClick(() => {
          this.filterType = f.type;
          this.filterValue = f.value;
          categoryBtn.textContent = f.label;
        }));
      });
      menu.showAtMouseEvent(e);
    });

    const separator = paletteRow.createDiv({ cls: 'sc-home-separator' });
    separator.textContent = '|';

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
      const swatch = paletteRow.createDiv({ cls: 'sc-home-color-dot' });
      const root = document.documentElement;
      const computedColor = getComputedStyle(root).getPropertyValue(color.var.replace('var(', '').replace(')', ''));
      swatch.style.backgroundColor = computedColor.trim() || color.var;
      if (this.selectedColor === color.var) swatch.addClass('is-selected');
      
      swatch.addEventListener('click', () => {
        swatches.forEach((s) => s.removeClass('is-selected'));
        swatch.addClass('is-selected');
        this.selectedColor = color.var;
      });
      swatches.push(swatch);
    });

    const editorEl = topSection.createDiv({ cls: 'sc-home-editor' });
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';

    const updatePlaceholder = () => {
      if (!editorEl.textContent?.trim()) editorEl.addClass('is-empty');
      else editorEl.removeClass('is-empty');
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
      if (this.app.workspace.activeEditor === this.owner) this.app.workspace.activeEditor = null;
    });

    // Content Section (Two Columns)
    const contentGrid = main.createDiv({ cls: 'sc-home-grid' });
    
    // Left Column: Notes
    const leftCol = contentGrid.createDiv({ cls: 'sc-home-left' });
    
    leftCol.createEl('h3', { text: 'Pinned Notes', cls: 'sc-home-section-title' });
    const pinnedList = leftCol.createDiv({ cls: 'sc-home-file-list pinned' });
    await this.renderFileList(pinnedList, 'pinned');

    leftCol.createEl('h3', { text: 'Recent Notes', cls: 'sc-home-section-title' });
    const recentList = leftCol.createDiv({ cls: 'sc-home-file-list' });
    await this.renderFileList(recentList, 'recent');

    // Right Column: Cards
    const rightCol = contentGrid.createDiv({ cls: 'sc-home-right' });
    
    const toolbar = rightCol.createDiv({ cls: 'sc-home-toolbar' });
    const cardList = rightCol.createDiv({ cls: 'sc-home-card-list' });
    
    // Category Buttons Bar (Create before card list)
    const categoryBar = rightCol.createDiv({ cls: 'sc-home-category-bar' });
    rightCol.insertBefore(categoryBar, cardList);
    
    this.renderToolbar(toolbar, editorEl, cardList, pinnedList, recentList);
    this.renderCategoryBar(categoryBar, cardList);

    await this.renderCards(cardList);

    // Keydown for input
    editorEl.addEventListener('keydown', async (e) => {
      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
      if (pressed === saveKey || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        await this.createCardFromHomeInput(editorEl, cardList);
      }
    });
  }

  private async renderFileList(container: HTMLElement, type: 'recent' | 'pinned') {
    container.empty();
    const files = type === 'recent' ? await this.getRecentFiles() : await this.getPinnedFiles();
    
    if (files.length === 0) {
      container.createDiv({ text: `No ${type} notes found`, cls: 'sc-home-empty-msg' });
      return;
    }

    for (const file of files) {
      const item = container.createDiv({ cls: 'sc-home-file-item' });
      const iconSpan = item.createSpan({ cls: 'sc-home-file-icon' });
      await this.renderCustomFileIcon(iconSpan, file);
      item.createSpan({ text: file.basename, cls: 'sc-home-file-name' });
      
      item.addEventListener('click', () => {
        this.app.workspace.getLeaf(false).openFile(file);
      });
    }
  }

  private async renderCustomFileIcon(iconEl: HTMLElement, file: TFile): Promise<void> {
    const iconInfo = await this.getIconicFileIcon(file);
    if (!iconInfo) {
      setIcon(iconEl, 'file-text');
      return;
    }

    const iconValue = String(iconInfo.icon || '').trim();
    if (!iconValue) {
      setIcon(iconEl, 'file-text');
      return;
    }

    let rendered = false;
    const normalizedLucide = this.normalizeLucideIconName(iconValue);
    if (normalizedLucide) {
      try {
        setIcon(iconEl, normalizedLucide);
        rendered = true;
      } catch (e) {}
    }

    if (!rendered && iconValue.includes('<svg')) {
      iconEl.innerHTML = iconValue;
      rendered = true;
    }

    if (!rendered && /^:.*:$/.test(iconValue)) {
      iconEl.setText(iconValue);
      rendered = true;
    }

    if (!rendered) {
      iconEl.setText(iconValue);
      rendered = true;
    }

    if (iconInfo.color) {
      iconEl.style.color = iconInfo.color;
    }
  }

  private normalizeLucideIconName(rawIcon: string): string | null {
    const cleaned = rawIcon.trim();
    if (!cleaned) return null;
    if (cleaned.includes('<svg')) return null;
    if (/^:.*:$/.test(cleaned)) return null;
    if (/[\u{1F300}-\u{1FAFF}]/u.test(cleaned)) return null;

    let iconName = cleaned;
    const prefixes = ['lucide:', 'lucide/', 'lucide-'];
    for (const prefix of prefixes) {
      if (iconName.startsWith(prefix)) {
        iconName = iconName.slice(prefix.length);
      }
    }
    if (iconName.includes(':')) {
      const parts = iconName.split(':');
      iconName = parts[parts.length - 1];
    }
    if (iconName.includes('/')) {
      const parts = iconName.split('/');
      iconName = parts[parts.length - 1];
    }
    iconName = iconName.trim();

    if (!/^[a-z0-9\-]+$/i.test(iconName)) return null;
    return iconName.toLowerCase();
  }

  private resolveIconicIconEntry(entry: any): { icon: string; color?: string } | null {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { icon: entry };
    }
    if (typeof entry === 'object') {
      const iconValue = entry.icon ?? entry.name ?? entry.value;
      if (!iconValue) return null;
      return {
        icon: String(iconValue),
        color: typeof entry.color === 'string' ? entry.color : undefined,
      };
    }
    return null;
  }

  private async getIconicFileIcon(file: TFile): Promise<{ icon: string; color?: string } | null> {
    const iconicPlugin = (this.app as any).plugins?.getPlugin?.('iconic');
    if (!iconicPlugin) return null;

    const path = file.path;

    const immediateEntry = this.resolveIconicIconEntry(
      iconicPlugin.settings?.fileIcons?.[path]
      ?? iconicPlugin.data?.fileIcons?.[path]
      ?? iconicPlugin.fileIcons?.[path]
    );
    if (immediateEntry) return immediateEntry;

    if (this.iconicFileIconsCache === null) {
      try {
        const loaded = await iconicPlugin.loadData?.();
        this.iconicFileIconsCache = loaded?.fileIcons && typeof loaded.fileIcons === 'object'
          ? loaded.fileIcons
          : {};
      } catch (e) {
        this.iconicFileIconsCache = {};
      }
    }

    const cache = this.iconicFileIconsCache || {};
    return this.resolveIconicIconEntry(cache[path]);
  }

  private async getRecentFiles(): Promise<TFile[]> {
    return this.app.vault.getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 5);
  }

  private async getPinnedFiles(): Promise<TFile[]> {
    const pinned: TFile[] = [];
    
    // 1. Get from settings
    if (this.plugin.settings.pinnedNotes) {
      this.plugin.settings.pinnedNotes.forEach(path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) pinned.push(file);
      });
    }

    // 2. Get from bookmarks plugin if available
    try {
      const bookmarks = (this.app as any).internalPlugins?.getPluginById("bookmarks")?.instance;
      if (bookmarks && bookmarks.items) {
        bookmarks.items.forEach((item: any) => {
          if (item.type === 'file') {
            const file = this.app.vault.getAbstractFileByPath(item.path);
            if (file instanceof TFile && !pinned.includes(file)) pinned.push(file);
          }
        });
      }
    } catch (e) {}
    
    return pinned.slice(0, 10); // Limit to 10 pinned notes
  }

  public async refreshPinnedNotes() {
    const pinnedList = this.containerEl.querySelector('.sc-home-file-list.pinned');
    if (pinnedList) {
      await this.renderFileList(pinnedList as HTMLElement, 'pinned');
    }
  }

  private async refreshHomeContent(cardList: HTMLElement, pinnedList: HTMLElement, recentList: HTMLElement): Promise<void> {
    this.iconicFileIconsCache = null;
    await this.renderFileList(pinnedList, 'pinned');
    await this.renderFileList(recentList, 'recent');
    await this.renderCards(cardList);
  }

  private renderToolbar(container: HTMLElement, editorEl: HTMLElement, cardList: HTMLElement, pinnedList: HTMLElement, recentList: HTMLElement) {
    container.empty();
    
    const leftActions = container.createDiv({ cls: 'sc-home-toolbar-left' });
    const searchWrap = container.createDiv({ cls: 'sc-home-search-wrap' });
    const rightActions = container.createDiv({ cls: 'sc-home-toolbar-right' });

    // Left Actions
    const sortBtn = leftActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(sortBtn, 'sort-desc');
    sortBtn.title = 'Sort';
    sortBtn.addEventListener('click', (e) => {
      const menu = new Menu();
      
      const modes: { label: string, mode: SortMode }[] = [
        { label: 'Manual', mode: 'manual' },
        { label: 'Created Time', mode: 'created' },
        { label: 'Modified Time', mode: 'modified' },
        { label: 'A → Z', mode: 'alpha' },
        { label: 'Status', mode: 'status' }
      ];

      modes.forEach(({ label, mode }) => {
        menu.addItem(item => {
          item.setTitle(label)
              .setChecked(this.currentSortMode === mode)
              .onClick(async () => {
                this.currentSortMode = mode;
                this.plugin.settings.sortMode = mode;
                await this.plugin.saveSettings();
                await this.renderCards(cardList);
              });
        });
      });

      menu.addSeparator();

      menu.addItem(item => {
        item.setTitle('Direction: ' + (this.sortAscending ? 'Ascending' : 'Descending'))
            .onClick(async () => {
              this.sortAscending = !this.sortAscending;
              this.plugin.settings.sortAscending = this.sortAscending;
              await this.plugin.saveSettings();
              await this.renderCards(cardList);
            });
      });

      menu.showAtMouseEvent(e);
    });

    const refreshBtn = leftActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', async () => {
      await this.refreshHomeContent(cardList, pinnedList, recentList);
    });

    // Search Bar
    const searchIcon = searchWrap.createSpan({ cls: 'sc-home-search-icon' });
    setIcon(searchIcon, 'search');
    const searchInput = searchWrap.createEl('input', { cls: 'sc-home-search-input', placeholder: 'Search card...' });
    searchInput.addEventListener('input', () => {
      this.currentSearchQuery = searchInput.value;
      this.renderCards(cardList);
    });

    // Right Actions
    const pinBtn = rightActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(pinBtn, 'pin');
    pinBtn.title = 'Pinned';
    pinBtn.addEventListener('click', () => {
      pinBtn.toggleClass('active', !pinBtn.hasClass('active'));
      this.pinnedOnly = pinBtn.hasClass('active');
      this.renderCards(cardList);
    });

    const moreBtn = rightActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(moreBtn, 'more-vertical');
    moreBtn.title = 'More';
    moreBtn.addEventListener('click', (e) => {
      const menu = new Menu();
      menu.addItem(item => {
        item.setTitle('Show tags')
            .setChecked(!this.plugin.settings.groupTags)
            .onClick(async () => {
              this.plugin.settings.groupTags = !this.plugin.settings.groupTags;
              await this.plugin.saveSettings();
              this.renderCards(cardList);
            });
      });
      menu.addItem(item => {
        item.setTitle('Show timestamps')
            .setChecked(this.plugin.settings.showTimestamps)
            .onClick(async () => {
              this.plugin.settings.showTimestamps = !this.plugin.settings.showTimestamps;
              await this.plugin.saveSettings();
              this.renderCards(cardList);
            });
      });
      menu.showAtMouseEvent(e);
    });

    const sidebarBtn = rightActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(sidebarBtn, 'panel-right');
    sidebarBtn.title = 'Open Sidebar';
    sidebarBtn.addEventListener('click', async () => {
      this.plugin.activateView();
    });
  }

  private renderCategoryBar(container: HTMLElement, cardList: HTMLElement) {
    container.empty();
    const filters = this.getAvailableFilters();
    
    filters.forEach(f => {
      const btn = container.createEl('button', { text: f.label, cls: 'sc-category-btn' });
      if (this.filterValue === f.value) btn.addClass('active');
      
      const colorKey = f.value === 'all' ? 'all'
        : f.value === 'today' ? 'today'
        : f.value === 'tomorrow' ? 'tomorrow'
        : f.value === 'archived' ? 'archived'
        : f.value;
      btn.dataset.filterValue = f.value;
      btn.dataset.filterColorKey = colorKey;

      const customColors = this.plugin.settings.filterColors?.[colorKey];
      if (customColors?.bgColor) btn.style.setProperty('background-color', customColors.bgColor, 'important');
      if (customColors?.textColor) btn.style.setProperty('color', customColors.textColor, 'important');

      btn.addEventListener('click', () => {
        container.querySelectorAll('.sc-category-btn').forEach(b => {
          (b as HTMLElement).removeClass('active');
          const bColorKey = (b as HTMLElement).dataset.filterColorKey || '';
          const bColors = this.plugin.settings.filterColors?.[bColorKey];
          if (bColors?.bgColor) (b as HTMLElement).style.setProperty('background-color', bColors.bgColor, 'important');
          else (b as HTMLElement).style.removeProperty('background-color');
          if (bColors?.textColor) (b as HTMLElement).style.setProperty('color', bColors.textColor, 'important');
          else (b as HTMLElement).style.removeProperty('color');
        });
        btn.addClass('active');
        this.filterType = f.type;
        this.filterValue = f.value;
        this.renderCards(cardList);
      });
    });
  }

  private async renderCards(container: HTMLElement) {
    container.empty();
    this.cardComponents.forEach(c => c.destroy());
    this.cardComponents.clear();

    let cards = this.store.getAll();
    
    if (this.pinnedOnly) {
      cards = cards.filter(c => c.pinned);
    }

    if (this.currentSearchQuery) {
      cards = cards.filter(c => c.content.toLowerCase().includes(this.currentSearchQuery.toLowerCase()));
    }
    
    const category = this.filterValue;
    if (category && category !== 'all') {
      if (category === 'today') {
        const today = new Date().toDateString();
        cards = cards.filter(c => new Date(c.created).toDateString() === today);
      } else if (category === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toDateString();
        cards = cards.filter(c => new Date(c.created).toDateString() === tomorrowStr);
      } else {
        cards = cards.filter(c => c.category === category);
      }
    }

    cards = this.sortService.sort(cards, this.currentSortMode, this.sortAscending);
    
    cards.slice(0, 10).forEach(card => {
      const comp = new CardComponent(container, card, this.store, this.app, this.plugin);
      this.cardComponents.set(card.id, comp);
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

  private async createCardFromHomeInput(editorEl: HTMLElement, cardList: HTMLElement) {
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
    const category = catMatch ? catMatch[1] : (this.filterValue === 'all' ? undefined : this.filterValue);

    const card = new Card({ 
      content, 
      color: this.selectedColor, 
      tags: [...new Set([...tags, ...this.selectedTags])],
      category 
    });
    await this.store.add(card);
    editorEl.textContent = '';
    // @ts-ignore
    editorEl.dispatchEvent(new Event('input')); // trigger placeholder
    
    // Clear selection state
    this.selectedTags = [];
    
    new Notice('Card created');
    this.renderCards(cardList);
  }
}
