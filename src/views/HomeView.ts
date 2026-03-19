import { ItemView, WorkspaceLeaf, Menu, Notice, setIcon, Scope, Editor, TFile, Platform } from "obsidian";
import type SideCardsPlugin from "../core/Plugin";
import { CardStore } from "../services/CardStore";
import { Card } from "../models/Card";
import { CardComponent } from "./components/Card";
import { SortService, SortMode } from "../services/SortService";
import { resolveAutoColor } from "../utils/dom";
import { animateCardsEntrance } from "../utils/animations";
import { InlineAutocomplete } from "./components/InlineAutocomplete";

export class SideCardsHomeView extends ItemView {
  private selectedColor = 'var(--card-color-1)';
  private selectedTags: string[] = [];
  private filterType = '';
  private filterValue = '';
  private cardListEl: HTMLElement | null = null;
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

  private handleKeyWrap(event: KeyboardEvent): { handled: boolean } {
    if (event.ctrlKey || event.metaKey || event.altKey) return { handled: false };

    const key = event.key;
    const wrapMap: Record<string, [string, string]> = {
      "[": ["[", "]"],
      "(": ["(", ")"],
      "{": ["{", "}"],
      "`": ["`", "`"],
      "%": ["%", "%"],
      "=": ["=", "="],
    };

    const pair = wrapMap[key];
    if (!pair) return { handled: false };

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return { handled: false };

    const range = sel.getRangeAt(0);
    const editorEl = this.containerEl.querySelector('.sc-home-editor');
    if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) return { handled: false };

    const selectedText = range.toString();
    const [open, close] = pair;
    let newText = `${open}${selectedText}${close}`;

    // Upgrade logic
    if (key === "%") {
      if (selectedText.startsWith("%") && selectedText.endsWith("%") && !selectedText.startsWith("%%")) {
        const inner = selectedText.slice(1, -1).trim();
        newText = `%% ${inner} %%`;
      }
    } else if (key === "=") {
      if (selectedText.startsWith("=") && selectedText.endsWith("=") && !selectedText.startsWith("==")) {
        const inner = selectedText.slice(1, -1);
        newText = `==${inner}==`;
      }
    } else if (key === "[") {
      if (selectedText.startsWith("[") && selectedText.endsWith("]") && !selectedText.startsWith("[[")) {
        const inner = selectedText.slice(1, -1);
        newText = `[[${inner}]]`;
      }
    }

    range.deleteContents();
    const node = document.createTextNode(newText);
    range.insertNode(node);

    const newRange = document.createRange();
    newRange.selectNode(node);
    sel.removeAllRanges();
    sel.addRange(newRange);

    return { handled: true };
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
      bold: ["editor:toggle-bold", "custom-wrap-bold"],
      italic: ["editor:toggle-italic", "editor:toggle-emphasis", "custom-wrap-italic"],
      highlight: ["editor:toggle-highlight", "custom-wrap-highlight"],
      comment: ["editor:toggle-comment", "custom-wrap-comment"],
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
    const expectsCtrl = modifierSet.has("ctrl") || (hasMod && !Platform.isMacOS);
    const expectsMeta = modifierSet.has("meta") || (hasMod && Platform.isMacOS);
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
      root.dispatchEvent(new Event('input'));
      return true;
    }
    return false;
  }

  getViewType(): string {
    return 'sidecards-home';
  }

  getDisplayText(): string {
    return 'SideCards'; // eslint-disable-line obsidianmd/ui/sentence-case
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
    // Apply user-configured max width via CSS variable so it overrides correctly
    const maxW = this.plugin.settings.homepageMaxWidth ?? 1000;
    container.style.setProperty('--sc-home-max-width', `${maxW}px`);
    
    // Top Section
    const topSection = main.createDiv({ cls: 'sc-home-top' });
    topSection.createEl('h2', { text: this.plugin.settings.homepageName || 'SideCards', cls: 'sc-home-title' });

    const paletteRow = topSection.createDiv({ cls: 'sc-home-palette-row' });

    // Hide palette row entirely if both category and swatches are hidden
    if (this.plugin.settings.hideCategoryDropdown && this.plugin.settings.hideColorSwatches) {
      paletteRow.addClass('sc-hidden');
    }

    if (!this.plugin.settings.hideCategoryDropdown) {
      const categoryBtn = paletteRow.createEl('button', { text: 'Category', cls: 'sc-home-category-btn' });
      categoryBtn.addEventListener('click', (e) => {
        const menu = new Menu();
        this.getAvailableFilters().forEach((f) => {
          menu.addItem(item => item.setTitle(f.label).onClick(() => {
            this.filterType = f.type;
            this.filterValue = f.value;
            categoryBtn.textContent = f.label;
            if (this.cardListEl) void this.renderCards(this.cardListEl);
          }));
        });
        menu.showAtMouseEvent(e);
      });

      const separator = paletteRow.createDiv({ cls: 'sc-home-separator' });
      separator.textContent = '|';
    }

    if (!this.plugin.settings.hideColorSwatches) {

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
    } // end hideColorSwatches check

    const editorEl = topSection.createDiv({ cls: 'sc-home-editor' });
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';

    // @category / #tag inline autocomplete
    new InlineAutocomplete(editorEl, this.store);

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

    // Keydown for input
    editorEl.addEventListener('keydown', (e) => {
      if (this.applyFormattingHotkey(e, editorEl)) return;

      const wrapResult = this.handleKeyWrap(e);
      if (wrapResult.handled) {
        e.preventDefault();
        e.stopPropagation();
        editorEl.dispatchEvent(new Event('input'));
        return;
      }
      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s+_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
      if (pressed === saveKey || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        void this.createCardFromHomeInput(editorEl, cardList);
      }
    });

    // Content Section (Two Columns)
    const contentGrid = main.createDiv({ cls: 'sc-home-grid' });
    
    const bothNotesHidden = this.plugin.settings.showPinnedNotes === false && this.plugin.settings.showRecentNotes === false;
    const notesOnRight = this.plugin.settings.notesPlacement === 'right';

    if (notesOnRight) contentGrid.addClass('notes-right');

    // Left Column: Notes
    const leftCol = contentGrid.createDiv({ cls: 'sc-home-left' });
    // Right Column: Cards
    const rightCol = contentGrid.createDiv({ cls: 'sc-home-right' });

    // Swap visual order via CSS order property (avoids grid width issues)
    if (notesOnRight) {
      leftCol.addClass('sc-home-left--right');
      rightCol.addClass('sc-home-right--left');
    }

    if (bothNotesHidden) {
      leftCol.addClass('sc-home-left--hidden');
      contentGrid.addClass('sc-home-grid--full');
    }

    let pinnedList: HTMLElement | null = null;
    let recentList: HTMLElement | null = null;

    if (this.plugin.settings.showPinnedNotes !== false) {
      leftCol.createEl('h3', { text: 'Pinned notes', cls: 'sc-home-section-title' });
      pinnedList = leftCol.createDiv({ cls: 'sc-home-file-list pinned' });
      await this.renderFileList(pinnedList, 'pinned');
    }

    if (this.plugin.settings.showRecentNotes !== false) {
      leftCol.createEl('h3', { text: 'Recent notes', cls: 'sc-home-section-title' });
      recentList = leftCol.createDiv({ cls: 'sc-home-file-list' });
      await this.renderFileList(recentList, 'recent');
    }
    
    const toolbar = rightCol.createDiv({ cls: 'sc-home-toolbar' });
    const cardList = rightCol.createDiv({ cls: 'sc-home-card-list' });
    this.cardListEl = cardList;
    
    // Category Buttons Bar (Create before card list)
    const categoryBar = rightCol.createDiv({ cls: 'sc-home-category-bar' });
    rightCol.insertBefore(categoryBar, cardList);
    
    this.renderToolbar(toolbar, editorEl, cardList, pinnedList ?? leftCol, recentList ?? leftCol);

    // Apply openCategoryOnLoad
    const openOn = this.plugin.settings.openCategoryOnLoad || 'all';
    const availableFilters = this.getAvailableFilters();
    const matchedFilter = availableFilters.find(f => f.value === openOn);
    if (matchedFilter) {
      this.filterType = matchedFilter.type;
      this.filterValue = matchedFilter.value;
    }

    this.renderCategoryBar(categoryBar, cardList);

    // Live-update when cards change
    const onCardChange = () => { void this.renderCards(cardList); };
    this.store.eventBus.on('card:added', onCardChange);
    this.store.eventBus.on('card:updated', onCardChange);
    this.store.eventBus.on('card:deleted', onCardChange);

    await this.renderCards(cardList);
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
        void this.app.workspace.getLeaf(false).openFile(file);
      });

      if (type === 'pinned') {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const menu = new Menu();
          menu.addItem(i => i.setTitle('Unpin from SideCards').setIcon('pin-off').onClick(async () => { // eslint-disable-line obsidianmd/ui/sentence-case
            this.plugin.settings.pinnedNotes = (this.plugin.settings.pinnedNotes || []).filter(p => p !== file.path);
            await this.plugin.saveSettings();
            await this.renderFileList(container, 'pinned');
          }));
          menu.showAtMouseEvent(e);
        });
      }
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
      } catch { /* icon not found, fall through */ }
    }

    if (!rendered && iconValue.includes('<svg')) {
      // eslint-disable-next-line @microsoft/sdl/no-inner-html
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
      // Map Iconic color names to Obsidian CSS variables
      const colorNameToVar: Record<string, string> = {
        red: 'var(--color-red)',
        orange: 'var(--color-orange)',
        yellow: 'var(--color-yellow)',
        green: 'var(--color-green)',
        cyan: 'var(--color-cyan)',
        blue: 'var(--color-blue)',
        purple: 'var(--color-purple)',
        pink: 'var(--color-pink)',
        magenta: 'var(--color-pink)',
        gray: 'var(--color-base-70)',
        grey: 'var(--color-base-70)',
      };
      const normalized = iconInfo.color.trim().toLowerCase();
      iconEl.style.color = colorNameToVar[normalized] ?? iconInfo.color;
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

    if (!/^[a-z0-9-]+$/i.test(iconName)) return null;
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
      } catch {
        this.iconicFileIconsCache = {};
      }
    }

    const cache = this.iconicFileIconsCache || {};
    return this.resolveIconicIconEntry(cache[path]);
  }

  private async getRecentFiles(): Promise<TFile[]> {
    const limit = this.plugin.settings.recentNotesLimit ?? 5;
    return this.app.vault.getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit);
  }

  private async getPinnedFiles(): Promise<TFile[]> {
    const pinned: TFile[] = [];
    if (this.plugin.settings.pinnedNotes) {
      this.plugin.settings.pinnedNotes.forEach(path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) pinned.push(file);
      });
    }
    return pinned;
  }

  public async refreshPinnedNotes() {
    const pinnedList = this.containerEl.querySelector('.sc-home-file-list.pinned');
    if (pinnedList) {
      await this.renderFileList(pinnedList as HTMLElement, 'pinned');
    }
  }

  public async refresh() {
    const main = this.containerEl.querySelector('.sc-home-main') as HTMLElement;
    if (!main) return;

    // Refresh title and max width
    const titleEl = main.querySelector('.sc-home-title');
    if (titleEl) titleEl.textContent = this.plugin.settings.homepageName || 'SideCards';
    const maxW = this.plugin.settings.homepageMaxWidth ?? 1000;
    this.containerEl.style.setProperty('--sc-home-max-width', `${maxW}px`);

    // Refresh category bar
    const categoryBar = main.querySelector('.sc-home-category-bar') as HTMLElement;
    if (categoryBar) {
      this.renderCategoryBar(categoryBar, this.cardListEl!);
    }

    // Refresh file lists
    const pinnedList = main.querySelector('.sc-home-file-list.pinned') as HTMLElement;
    if (pinnedList) await this.renderFileList(pinnedList, 'pinned');
    const recentList = main.querySelector('.sc-home-file-list:not(.pinned)') as HTMLElement;
    if (recentList) await this.renderFileList(recentList, 'recent');

    // Refresh cards
    if (this.cardListEl) await this.renderCards(this.cardListEl);
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
    refreshBtn.addEventListener('click', () => {
      void this.refreshHomeContent(cardList, pinnedList, recentList);
    });

    // Search Bar
    const searchIcon = searchWrap.createSpan({ cls: 'sc-home-search-icon' });
    setIcon(searchIcon, 'search');
    const searchInput = searchWrap.createEl('input', { cls: 'sc-home-search-input', placeholder: 'Search card...' });
    searchInput.addEventListener('input', () => {
      this.currentSearchQuery = searchInput.value;
      void this.renderCards(cardList);
    });

    // Right Actions
    const pinBtn = rightActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(pinBtn, 'pin');
    pinBtn.title = 'Pinned';
    pinBtn.addEventListener('click', () => {
      pinBtn.toggleClass('active', !pinBtn.hasClass('active'));
      this.pinnedOnly = pinBtn.hasClass('active');
      void this.renderCards(cardList);
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
              void this.renderCards(cardList);
            });
      });
      menu.addItem(item => {
        item.setTitle('Show timestamps')
            .setChecked(this.plugin.settings.showTimestamps)
            .onClick(async () => {
              this.plugin.settings.showTimestamps = !this.plugin.settings.showTimestamps;
              await this.plugin.saveSettings();
              void this.renderCards(cardList);
            });
      });
      menu.showAtMouseEvent(e);
    });

    const sidebarBtn = rightActions.createEl('button', { cls: 'sc-icon-btn' });
    setIcon(sidebarBtn, 'panel-right');
    sidebarBtn.title = 'Open sidebar';
    sidebarBtn.addEventListener('click', () => {
      void this.plugin.activateView();
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
        void this.renderCards(cardList);
      });
    });
  }

  private cardRenderGen = 0;

  private async renderCards(container: HTMLElement) {
    const gen = ++this.cardRenderGen;
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
      if (category === 'archived') {
        cards = cards.filter(c => c.archived);
      } else if (category === 'today') {
        cards = cards.filter(c => (c.category || '').toLowerCase() === 'today' && !c.archived);
      } else if (category === 'tomorrow') {
        cards = cards.filter(c => (c.category || '').toLowerCase() === 'tomorrow' && !c.archived);
      } else {
        // Resolve id → label for custom categories
        const customCats = this.plugin.settings.customCategories || [];
        const matched = customCats.find(c => c.id === category || c.label === category);
        const categoryLabel = matched ? matched.label : category;
        cards = cards.filter(c => (c.category === categoryLabel || c.category === category) && !c.archived);
      }
    } else if (!category || category === 'all') {
      // "All" shows non-archived cards only
      cards = cards.filter(c => !c.archived);
    }

    cards = this.sortService.sort(cards, this.currentSortMode, this.sortAscending, this.app);

    // Render in chunks — bail out if a newer renderCards call has started
    const CHUNK_SIZE = 10;
    const renderChunk = (startIdx: number) => {
      if (gen !== this.cardRenderGen) return; // stale, abort
      const chunk = cards.slice(startIdx, startIdx + CHUNK_SIZE);
      if (chunk.length === 0) return;
      chunk.forEach(card => {
        const comp = new CardComponent(container, card, this.store, this.app, this.plugin);
        this.cardComponents.set(card.id, comp);
      });
      if (startIdx + CHUNK_SIZE < cards.length) {
        requestAnimationFrame(() => renderChunk(startIdx + CHUNK_SIZE));
      }
    };

    renderChunk(0);
    // Trigger entrance animation after first chunk is painted
    requestAnimationFrame(() => animateCardsEntrance(container, {}, this.plugin.settings));
  }

  private getAvailableFilters(): Array<{ type: string; label: string; value: string }> {
    const filters = [{ type: 'all', label: 'All', value: 'all' }];
    if (!this.plugin.settings.hideTodayFilter) {
      filters.push({ type: 'category', label: 'Today', value: 'today' });
    }
    if (!this.plugin.settings.hideTomorrowFilter) {
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

    // Strip @category and #tag tokens from the saved content
    const cleanContent = content.replace(/@[^\s#@,.]+/g, '').replace(/#[^\s#@,.]+/g, '').replace(/\s{2,}/g, ' ').trim();

    const allTags = [...new Set([...tags, ...this.selectedTags])];
    const autoColor = resolveAutoColor(content, allTags, this.plugin.settings);
    const effectiveColor = autoColor || this.selectedColor;

    const card = new Card({ 
      content: cleanContent, 
      color: effectiveColor, 
      tags: allTags,
      category 
    });
    await this.store.add(card);
    editorEl.textContent = '';
    // @ts-ignore
    editorEl.dispatchEvent(new Event('input')); // trigger placeholder
    
    // Clear selection state
    this.selectedTags = [];
    
    new Notice('Card created');
  }
}
