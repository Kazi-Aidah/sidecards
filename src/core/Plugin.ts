
import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf, setIcon, Notice, TFile, Platform, requestUrl, Component, MarkdownRenderer, Modal, getIconIds, MarkdownView } from "obsidian";
import { CardSidebarView } from "../views/CardSidebarView";
import { CardStore } from "../services/CardStore";
import { FilterService } from "../services/FilterService";
import { SortService } from "../services/SortService";
import { EventBus } from "./EventBus";
import { SideCardsSettings, DEFAULT_SETTINGS, CustomCategory } from "./Settings";

import { QuickCardWithFilterModal } from "../views/modals/QuickCardWithFilterModal";
import { SearchModal } from "../views/modals/SearchModal";
import { SideCardsHomeView } from "../views/HomeView";

export default class SideCardsPlugin extends Plugin {
  public settings!: SideCardsSettings;
  public eventBus!: EventBus;
  public store!: CardStore;
  public filterService!: FilterService;
  public sortService!: SortService;

  async onload() {
    await this.loadSettings();
    (document.documentElement).setCssProps({
      '--card-color-1': this.settings.color1 || '#8392a4',
      '--card-color-2': this.settings.color2 || '#eb3b5a',
      '--card-color-3': this.settings.color3 || '#fa8231',
      '--card-color-4': this.settings.color4 || '#e5a216',
      '--card-color-5': this.settings.color5 || '#20bf6b',
      '--card-color-6': this.settings.color6 || '#2d98da',
      '--card-color-7': this.settings.color7 || '#8854d0',
      '--card-color-8': this.settings.color8 || '#e832c1',
      '--card-color-9': this.settings.color9 || '#e83289',
      '--card-color-10': this.settings.color10 || '#965b3b',
      '--card-border-radius': `${this.settings.borderRadius ?? 6}px`,
    });

    this.eventBus = new EventBus();
    this.filterService = new FilterService();
    this.sortService = new SortService(this.settings);
    this.store = new CardStore(this.app, this, this.eventBus, this.settings);
    await this.store.migrateCardColorFrontmatterFormat();

    this.registerView(
      'card-sidebar',
      (leaf) => new CardSidebarView(
        leaf,
        this,
        this.store,
        this.eventBus,
        this.filterService,
        this.sortService
      )
    );
    this.registerView(
      'sidecards-home',
      (leaf) => new SideCardsHomeView(
        leaf,
        this,
        this.store,
        this.sortService
      )
    );

    this.addCommand({
      id: 'open-sidebar',
      name: 'Open sidebar',
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: 'open-home',
      name: 'Open home',
      callback: () => void this.activateHomeView()
    });

    this.addCommand({
      id: 'quick-card-add',
      name: 'Quick card add',
      callback: () => new QuickCardWithFilterModal(this.app, this, this.store).open(),
    });

    this.addCommand({
      id: 'search-cards',
      name: 'Search cards',
      callback: () => new SearchModal(this.app, this, this.store).open()
    });

    this.addCommand({
      id: 'pin-to-homepage',
      name: 'Pin to homepage',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          const isPinned = this.settings.pinnedNotes?.includes(file.path);
          if (!this.settings.pinnedNotes) this.settings.pinnedNotes = [];
          if (isPinned) {
            this.settings.pinnedNotes = this.settings.pinnedNotes.filter(p => p !== file.path);
            new Notice(`Unpinned ${file.name} from SideCards Homepage.`);
          } else {
            if (this.settings.showPinnedNotes !== false) {
              this.settings.pinnedNotes.push(file.path);
              new Notice(`Pinned ${file.name} to SideCards Homepage.`);
            }
          }
          void this.saveSettings();
          const leaves = this.app.workspace.getLeavesOfType('sidecards-home');
          leaves.forEach((leaf) => {
            const v = leaf.view as unknown as { refreshPinnedNotes?: () => void };
            if (typeof v.refreshPinnedNotes === 'function') v.refreshPinnedNotes();
          });
        }
        return this.settings.showPinnedNotes !== false;
      }
    });

    this.addCommand({
      id: 'custom-wrap-comment',
      name: 'Wrap with comment %% (any focused editable)',
      checkCallback: (checking: boolean) => {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
          if (!checking) {
            this.wrapWith('%%', '%%');
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'custom-wrap-bold',
      name: 'Wrap with **bold**',
      checkCallback: (checking: boolean) => {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
          if (!checking) {
            this.wrapWith('**', '**');
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'custom-wrap-italic',
      name: 'Wrap with *italic*',
      checkCallback: (checking: boolean) => {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
          if (!checking) {
            this.wrapWith('*', '*');
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'custom-wrap-highlight',
      name: 'Wrap with ==highlight==',
      checkCallback: (checking: boolean) => {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
          if (!checking) {
            this.wrapWith('==', '==');
          }
          return true;
        }
        return false;
      },
    });

    this.addRibbonIcon('home', 'Open homepage', () => void this.activateHomeView());
    this.addRibbonIcon('rows-3', 'Open sidebar', () => void this.activateView());
    this.addRibbonIcon('rectangle-horizontal', 'Add card', () => new QuickCardWithFilterModal(this.app, this, this.store).open());

    this.addSettingTab(new SideCardsSettingTab(this.app, this));

    // Keep card.notePath in sync when a note is renamed/moved
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const card = this.store.getAll().find(c => c.notePath === oldPath);
        if (!card) return;
        // Update in-memory path and persist
        card.notePath = file.path;
        void this.store.saveCards();
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) {
          menu.addItem((item) => {
            const isPinned = this.settings.pinnedNotes?.includes(file.path);
            item
                            .setTitle(isPinned ? "Unpin from SideCards Homepage" : "Pin to SideCards Homepage")
              .setIcon("pin")
              .onClick(async () => {
                if (!this.settings.pinnedNotes) this.settings.pinnedNotes = [];
                if (isPinned) {
                  this.settings.pinnedNotes = this.settings.pinnedNotes.filter(p => p !== file.path);
                } else {
                  this.settings.pinnedNotes.push(file.path);
                }
                await this.saveSettings();
                
                // Refresh homepage if open
                const leaves = this.app.workspace.getLeavesOfType('sidecards-home');
                leaves.forEach((leaf) => {
                  const v = leaf.view as unknown as { refreshPinnedNotes?: () => void };
                  if (typeof v.refreshPinnedNotes === 'function') v.refreshPinnedNotes();
                });
              });
          });
        }
      })
    );

    // Replace new tab with homepage when enabled
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
        if (!this.settings.replaceHomepageWithSidecards) return;
        if (!leaf) return;
        try {
          const viewType = leaf.view?.getViewType?.();
          if (viewType === 'sidecards-home') return;
          const state = leaf.getViewState?.();
          if (state?.type === 'empty' && !state?.state?.file) {
            void this.replaceWithHomepage(leaf);
          }
        } catch { /* leaf state may not be accessible */ }
      })
    );

    // Apply styles immediately (don't wait for layout ready)
    this.injectStatusColors();
    this.applyButtonPadding();
    this.applyMaxCardHeight();

    // Allow drop on any element — needed so the browser accepts the drop
    this.registerDomEvent(document, 'dragover', (ev: DragEvent) => {
      if (!ev.dataTransfer) return;
      const types = Array.from(ev.dataTransfer.types || []);
      if (!types.includes('text/x-card-sidebar')) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    });

    // Drop card content into a markdown editor.
    // Must use capture phase so our handler runs before CodeMirror's own drop handler,
    // which would otherwise also insert the dragged text and cause duplicates.
    let lastDropTime = 0;
    const cardDropHandler = (ev: DragEvent) => {
      if (!ev.dataTransfer) return;
      const types = Array.from(ev.dataTransfer.types || []);
      if (!types.includes('text/x-card-sidebar')) return;

      // Deduplicate: ignore if we already handled a drop within 200ms
      const now = Date.now();
      if (now - lastDropTime < 200) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      lastDropTime = now;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      let content: string | null = null;
      try {
        const json = ev.dataTransfer.getData('text/x-card-sidebar');
        const payload = JSON.parse(json);
        content = payload.content ?? null;
      } catch { /* malformed payload */ }
      if (!content) return;

      // Find the MarkdownView whose editor DOM contains the drop target,
      // falling back to whichever MarkdownView is currently active.
      let mdView: MarkdownView | null = null;
      const target = ev.target as HTMLElement | null;
      if (target) {
        this.app.workspace.iterateAllLeaves((leaf) => {
          if (mdView) return;
          const view = leaf.view;
          if (!(view instanceof MarkdownView)) return;
      const editorEl = (view as unknown as { editor?: { containerEl?: HTMLElement }; contentEl?: HTMLElement }).editor?.containerEl ?? (view as unknown as { contentEl?: HTMLElement }).contentEl;
          if (editorEl && editorEl.contains(target)) mdView = view;
        });
      }
      if (!mdView) mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!mdView?.editor) return;

      // Place cursor at the drop position before inserting
      const cm = (mdView.editor as unknown as { cm?: { posAtCoords?: (pos: { x: number; y: number }, b: boolean) => number | null; dispatch?: (tr: { selection: { anchor: number } }) => void } }).cm;
      if (cm?.posAtCoords) {
        const pos = cm.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
        if (pos != null && cm.dispatch) cm.dispatch({ selection: { anchor: pos } });
      }

      mdView.editor.replaceSelection(content);
      mdView.editor.focus();
    };
    document.addEventListener('drop', cardDropHandler, true /* capture */);
    (this as unknown as { _cardDropCleanup?: () => void })._cardDropCleanup = () => document.removeEventListener('drop', cardDropHandler, true);

    // Auto-open sidebar on startup; show setup modal if no storage folder set
    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.storageFolder) {
        this.showStorageFolderSetupModal();
      } else {
        // Auto-import notes from storage folder silently
        void this.store.importNotesFromFolderToSettings(this.settings.storageFolder, true);
      }
      if (this.settings.autoOpen) {
        void this.activateView();
      }
    });
  }

  onunload() {
    // Remove the capture-phase drop handler registered in onload
    if ((this as unknown as { _cardDropCleanup?: () => void })._cardDropCleanup) (this as unknown as { _cardDropCleanup: () => void })._cardDropCleanup();
  }

  applyButtonPadding(): void {
    const paddingPx = this.settings.buttonPaddingBottom ?? 26;
    (document.documentElement).setCssProps({
      '--sc-button-padding-bottom': `${paddingPx}px`
    });
  }

  applyMaxCardHeight(): void {
    const h = this.settings.maxCardHeight;
    if (h && h > 0) {
      document.documentElement.setCssProps({ '--sc-max-card-height': `${h}px` });
      document.body.addClass('sc-max-card-height-active');
    } else {
      document.documentElement.style.removeProperty('--sc-max-card-height');
      document.body.removeClass('sc-max-card-height-active');
    }
  }

  injectStatusColors(): void {
    // We now apply status colors directly to elements in CardComponent
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType('card-sidebar');

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: 'card-sidebar', active: true });
      }
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);
    }
  }

  private wrapWith(start: string, end: string) {
    const activeEl = document.activeElement;
    if (!(activeEl instanceof HTMLElement) || activeEl.isContentEditable !== true) {
      new Notice('No editable field focused');
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const wordRange = this.getWordRangeAtCaret(sel);
      if (wordRange) {
        sel.removeAllRanges();
        sel.addRange(wordRange);
      }
    }

    // Simple wrap: insert start + text + end
    // (Better: use document.execCommand or Range.surroundContents for cleaner DOM)
    const text = range.toString();
    const wrapped = start + text + end;

    range.deleteContents();
    range.insertNode(document.createTextNode(wrapped));

    // Optional: place caret inside the wrapped text
    const newRange = document.createRange();
    newRange.setStart(range.startContainer, range.startOffset + start.length);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateHomeView() {
    const existing = this.app.workspace.getLeavesOfType('sidecards-home');
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    if (leaf) {
      await leaf.setViewState({ type: 'sidecards-home', active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  refreshHomepageViews() {
    this.app.workspace.getLeavesOfType('sidecards-home').forEach(leaf => {
      const view = leaf.view as unknown as { onOpen?: () => void | Promise<void> };
      if (typeof view.onOpen === 'function') {
        try { void view.onOpen(); } catch { /* view may not be ready */ }
      }
    });
  }

  private async replaceWithHomepage(leaf: WorkspaceLeaf) {
    try {
      await leaf.setViewState({ type: 'sidecards-home', active: true });
    } catch { /* leaf may have been detached */ }
  }

  showStorageFolderSetupModal(): void {
    const modal = new Modal(this.app);
    modal.modalEl.addClass('sc-setup-modal');
    modal.titleEl.setText('Welcome to sidecards');
    const content = modal.contentEl;

    content.createEl('p', { text: 'Set a storage folder to save your cards as notes.' });

    const folderRow = content.createDiv({ cls: 'sc-setup-folder-row' });
    const folderInput = folderRow.createEl('input', {
      type: 'text',
      placeholder: 'e.g. Cards',
      cls: 'sc-setup-folder-input',
    });

    // Folder suggestions dropdown
    const suggestEl = folderRow.createDiv({ cls: 'sc-setup-folder-suggest' });

    // Collect all unique folder paths from the vault
    const folderSet = new Set<string>();
    this.app.vault.getAllLoadedFiles().forEach((f) => {
      if ((f as { children?: unknown[] }).children) {
        // It's a TFolder
        if (f.path && f.path !== '/') folderSet.add(f.path);
      } else if (f.parent && f.parent.path && f.parent.path !== '/') {
        folderSet.add(f.parent.path);
      }
    });
    const allFolders = Array.from(folderSet).sort();

    const renderSuggestions = (query: string) => {
      suggestEl.empty();
      const matches = query
        ? allFolders.filter(p => p.toLowerCase().includes(query.toLowerCase()))
        : allFolders;
      if (matches.length === 0) { suggestEl.removeClass('is-visible'); return; }
      matches.slice(0, 10).forEach(path => {
        const item = suggestEl.createDiv({ cls: 'sc-setup-folder-item', text: path });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          folderInput.value = path;
          suggestEl.removeClass('is-visible');
        });
      });
      suggestEl.addClass('is-visible');
    };

    folderInput.addEventListener('focus', () => renderSuggestions(folderInput.value));
    folderInput.addEventListener('input', () => renderSuggestions(folderInput.value));
    folderInput.addEventListener('blur', () => window.setTimeout(() => suggestEl.removeClass('is-visible'), 150));

    const btnRow = content.createDiv({ cls: 'sc-setup-btn-row' });

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.settings.tutorialShown = true;
      void this.saveSettings();
      modal.close();
    });

    const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const val = folderInput.value.trim();
        if (val) {
          this.settings.storageFolder = val;
          this.settings.tutorialShown = true;
          await this.saveSettings();
          await this.store.switchStorageFolder(val);
        }
        modal.close();
      })();
    });

    modal.open();
    window.setTimeout(() => folderInput.focus(), 50);
  }

  async fetchAllReleases(): Promise<Array<{ name?: string; tag_name?: string; published_at?: string; created_at?: string; body?: string }>> {
    const allReleases: Array<{ name?: string; tag_name?: string; published_at?: string; created_at?: string; body?: string }> = [];
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const url = `https://api.github.com/repos/Kazi-Aidah/sidecards/releases?page=${page}&per_page=100`;
      try {
        const res = await requestUrl({
          url,
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Obsidian-Sidecards'
          }
        });
        const data = res.json;
        if (!Array.isArray(data) || data.length === 0) {
          hasMorePages = false;
        } else {
          allReleases.push(...data);
          if (data.length < 100) hasMorePages = false;
          else page++;
        }
      } catch {
        hasMorePages = false;
      }
    }
    return allReleases;
  }
}

class SideCardsSettingTab extends PluginSettingTab {
  plugin: SideCardsPlugin;

  constructor(app: App, plugin: SideCardsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private updateCSSVariables(): void {
    const root = document.documentElement;
    root.setCssProps({
      '--card-color-1': this.plugin.settings.color1 || '#8392a4',
      '--card-color-2': this.plugin.settings.color2 || '#eb3b5a',
      '--card-color-3': this.plugin.settings.color3 || '#fa8231',
      '--card-color-4': this.plugin.settings.color4 || '#e5a216',
      '--card-color-5': this.plugin.settings.color5 || '#20bf6b',
      '--card-color-6': this.plugin.settings.color6 || '#2d98da',
      '--card-color-7': this.plugin.settings.color7 || '#8854d0',
      '--card-color-8': this.plugin.settings.color8 || '#e832c1',
      '--card-color-9': this.plugin.settings.color9 || '#e83289',
      '--card-color-10': this.plugin.settings.color10 || '#965b3b'
    });
  }

  private applyColorToDropdown(selectEl: HTMLSelectElement, colorIndex: string) {
    const colorKey = `color${colorIndex}` as keyof SideCardsSettings;
    const color = this.plugin.settings[colorKey] as string || '#ffffff';
    selectEl.style.backgroundColor = color;
    selectEl.style.color = this.getContrastColor(color);

    Array.from(selectEl.options).forEach((option, i) => {
      const idx = i + 1;
      const cKey = `color${idx}` as keyof SideCardsSettings;
      const c = this.plugin.settings[cKey] as string || '#ffffff';
      option.style.backgroundColor = c;
      option.style.color = this.getContrastColor(c);
    });
  }

  private getContrastColor(hex: string): string {
    if (hex && hex.startsWith('var')) {
      const varName = hex.match(/--[a-zA-Z0-9-]+/)?.[0];
      if (varName) {
        hex = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      }
    }

    if (typeof hex !== 'string' || !hex.startsWith('#')) {
      return '#000000'; // Return black for invalid input
    }

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        return '#000000';
    }

    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Helpers ──────────────────────────────────────────────────────────────
    const updateButtonPadding = (paddingPx: number) => {
      this.plugin.settings.buttonPaddingBottom = paddingPx;
      this.plugin.applyButtonPadding();
    };

    const refreshHomepage = () => this.plugin.refreshHomepageViews();

    const refreshSidebarHeader = () => {
      try {
        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view as unknown as {
          containerEl: HTMLElement;
          createHeader?: (el: HTMLElement) => void;
          applyFilters?: () => void;
        } | undefined;
        if (!view) return;
        const main = view.containerEl.querySelector('.sc-sidebar-main');
        const old = main?.querySelector('.sc-sidebar-header');
        if (old) old.remove();
        if (main && typeof view.createHeader === 'function') {
          view.createHeader(main as HTMLElement);
          const header = main.querySelector('.sc-sidebar-header');
          if (header) main.prepend(header);
        }
        try { if (typeof view.applyFilters === 'function') view.applyFilters(); } catch { /* applyFilters may not exist */ }
      } catch { /* sidebar may not be open */ }
      refreshHomepage();
    };
    const refreshSidebarCards = () => {
      try {
        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view as unknown as { renderCards?: () => void } | undefined;
        if (view && typeof view.renderCards === 'function') {
          view.renderCards();
        }
      } catch { /* sidebar may not be open */ }
    };

    // ── General ──────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Latest release notes')
      .setDesc('View the most recent plugin release notes.')
      .addButton(b => {
        b.setButtonText('Open changelog')
          .onClick(() => {
            new ChangelogModal(this.app, this.plugin).open();
          });
      });

    new Setting(containerEl)
      .setName('Storage folder')
      .setDesc('Choose where to save notes created from cards.')
      .addSearch(cb => {
        cb.setPlaceholder('Choose a folder')
          .setValue(this.plugin.settings.storageFolder || '')
          .onChange(async (value) => {
            const newFolder = value.trim();
            const oldFolder = this.plugin.settings.storageFolder;
            this.plugin.settings.storageFolder = newFolder;
            this.plugin.settings.tutorialShown = true;
            await this.plugin.saveSettings();
            if (newFolder !== oldFolder) {
              await this.plugin.store.switchStorageFolder(newFolder);
            }
          });
        const folders = new Set<string>(['/']);
        this.app.vault.getAllLoadedFiles().forEach((file) => { if (file.parent) folders.add(file.parent.path); });
        new FolderSuggest(this.app, cb.inputEl, folders);
      });

    // ── Behaviour ─────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Behaviour').setDesc('').setHeading();

    new Setting(containerEl)
      .setName('Note title format')
      .setDesc('Format used when creating a note from a card.')
      .addDropdown(dd => dd
        .addOption('words3_hhmm', 'First 3 words + hhmm')
        .addOption('words5_hhmm', 'First 5 words + hhmm')
        .addOption('datetime', 'Date and time')
        .setValue(this.plugin.settings.noteTitleFormat || 'words3_hhmm')
        .onChange(async (value) => {
          this.plugin.settings.noteTitleFormat = value as 'words3_hhmm' | 'words5_hhmm' | 'datetime';
          await this.plugin.saveSettings();
        }));


    new Setting(containerEl).setName('Save key').setDesc('Choose which key combo saves/submits a card').addDropdown(dropdown => dropdown.addOption('enter', 'Enter').addOption('shift-enter', 'Shift+Enter').addOption('ctrl-enter', 'Ctrl+Enter').addOption('alt-enter', 'Alt+Enter').addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter').setValue(this.plugin.settings.saveKey || 'enter').onChange(async (value) => {
      this.plugin.settings.saveKey = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Next line key').setDesc('Choose which key combo inserts a new line inside a card (does not save)').addDropdown(dropdown => dropdown.addOption('enter', 'Enter').addOption('shift-enter', 'Shift+Enter').addOption('ctrl-enter', 'Ctrl+Enter').addOption('alt-enter', 'Alt+Enter').addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter').setValue(this.plugin.settings.nextLineKey || 'shift-enter').onChange(async (value) => {
      this.plugin.settings.nextLineKey = value;
      await this.plugin.saveSettings();
    }));

    new Setting(containerEl).setName('Auto-pair brackets, quotes and code').setDesc('Automatically wrap selected text or place cursor between pairs when typing (, [, {, `, =, %, or "').addToggle(toggle => toggle.setValue(this.plugin.settings.autoPairBrackets !== false).onChange(async (value) => {
      this.plugin.settings.autoPairBrackets = value;
      await this.plugin.saveSettings();
    }));

    new Setting(containerEl).setName('Auto-open sidebar').setDesc('Automatically open the sidebar when Obsidian starts').addToggle(toggle => toggle.setValue(!!this.plugin.settings.autoOpen).onChange(async (value) => {
      this.plugin.settings.autoOpen = value;
      await this.plugin.saveSettings();
    }));
    
    new Setting(containerEl).setName('Auto-archive on expiry').setDesc('Automatically archive cards when their expiry time passes').addToggle(toggle => toggle.setValue(!!this.plugin.settings.autoArchiveOnExpiry).onChange(async (value) => {
      this.plugin.settings.autoArchiveOnExpiry = value;
      await this.plugin.saveSettings();
    }));
    
    new Setting(containerEl)
      .setName('Show time left to expire')
      .setDesc('Show a pill on cards with the remaining time until expiry.')
      .addToggle(toggle => toggle.setValue(!!this.plugin.settings.showExpiryTimeLeft).onChange(async (value) => {
        this.plugin.settings.showExpiryTimeLeft = value;
        await this.plugin.saveSettings();
        refreshSidebarCards();
      }));
    new Setting(containerEl)
      .setName('Expiry time format')
      .setDesc('How to display the remaining expiry time.')
      .addDropdown(dd => dd
        .addOption('human', 'Human (2 years 3 months 5 days)')
        .addOption('short', 'Short (2y 3mo 5d 4h 3m)')
        .setValue(this.plugin.settings.expiryTimeFormat || 'human')
        .onChange(async (value) => {
          this.plugin.settings.expiryTimeFormat = value as 'human' | 'short';
          await this.plugin.saveSettings();
          refreshSidebarCards();
        }));

    // ── Homepage ──────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Homepage').setDesc('Configure the sidecards homepage tab.').setHeading();

    new Setting(containerEl)
      .setName('Replace default tab with homepage')
      .setDesc('Open the sidecards homepage instead of the default new tab.')
      .addToggle(toggle => toggle.setValue(!!this.plugin.settings.replaceHomepageWithSidecards).onChange(async (value) => {
        this.plugin.settings.replaceHomepageWithSidecards = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Replace sidecards name')
      .setDesc('Title shown in the homepage.')
      .addText(text => {
        text.setPlaceholder('Sidecards')
          .setValue(this.plugin.settings.homepageName || 'Sidecards')
          .onChange(async (value) => {
            this.plugin.settings.homepageName = value || 'Sidecards';
            await this.plugin.saveSettings();
            refreshHomepage();
          });
        text.inputEl.addClass('sc-full-width');
      })
      .addExtraButton(btn => {
        btn.setIcon('rotate-ccw').setTooltip('Reset to default').onClick(async () => {
          this.plugin.settings.homepageName = 'Sidecards';
          await this.plugin.saveSettings();
          refreshHomepage();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName('Hide category dropdown')
      .setDesc('Hides the category button and separator in the homepage palette row.')
      .addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideCategoryDropdown).onChange(async (value) => {
        this.plugin.settings.hideCategoryDropdown = value;
        await this.plugin.saveSettings();
        refreshHomepage();
      }));

    new Setting(containerEl)
      .setName('Hide color swatches')
      .setDesc('Hides the color dots from the homepage.')
      .addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideColorSwatches).onChange(async (value) => {
        this.plugin.settings.hideColorSwatches = value;
        await this.plugin.saveSettings();
        refreshHomepage();
      }));

    new Setting(containerEl)
      .setName('Show pinned notes')
      .setDesc('Show pinned notes in the homepage notes column.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.showPinnedNotes !== false).onChange((value) => {
        void (async () => {
          this.plugin.settings.showPinnedNotes = value;
          await this.plugin.saveSettings();
          refreshHomepage();
        })();
      }));

    new Setting(containerEl)
      .setName('Show recent notes')
      .setDesc('Show recently opened notes in the homepage notes column.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.showRecentNotes !== false).onChange((value) => {
        void (async () => {
          this.plugin.settings.showRecentNotes = value;
          await this.plugin.saveSettings();
          refreshHomepage();
        })();
      }));

    new Setting(containerEl)
      .setName('Recent notes limit')
      .setDesc('How many recent notes to show.')
      .addDropdown(dd => {
        [3, 5, 10, 15, 20, 25].forEach(n => { dd.addOption(String(n), String(n)); });
        dd.setValue(String(this.plugin.settings.recentNotesLimit ?? 5));
        dd.onChange((value) => {
          void (async () => {
            this.plugin.settings.recentNotesLimit = Number(value);
            await this.plugin.saveSettings();
            refreshHomepage();
          })();
        });
      });

    new Setting(containerEl)
      .setName('Notes column placement')
      .setDesc('Place the pinned/recent notes column on the left or right.')
      .addDropdown(dd => dd
        .addOption('left', 'Left')
        .addOption('right', 'Right')
        .setValue(this.plugin.settings.notesPlacement || 'left')
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.notesPlacement = value as 'left' | 'right';
            await this.plugin.saveSettings();
            refreshHomepage();
          })();
        }));

    new Setting(containerEl)
      .setName('Homepage max width')
      .setDesc('Maximum width of the homepage content area in pixels. Drag to adjust.')
      .addSlider(slider => {
        const label = containerEl.createSpan({ text: `${this.plugin.settings.homepageMaxWidth ?? 1000}px`, cls: 'sc-slider-label' });
        slider
          .setLimits(400, 2400, 50)
          .setValue(this.plugin.settings.homepageMaxWidth ?? 1000)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.homepageMaxWidth = value;
            label.textContent = `${value}px`;
            await this.plugin.saveSettings();
            // Apply live to open homepage views
            document.querySelectorAll('.sc-home-container').forEach((el) => {
              (el as HTMLElement).setCssProps({ '--sc-home-max-width': `${value}px` });
            });
          });
        // Append label after the slider control
        slider.sliderEl.insertAdjacentElement('afterend', label);
      });

    new Setting(containerEl)
      .setName('Homepage top spacing')
      .setDesc('Distance from the top of the homepage to the content area, in pixels.')
      .addSlider(slider => {
        const label = containerEl.createSpan({ text: `${this.plugin.settings.homepageTopMargin ?? 70}px`, cls: 'sc-slider-label' });
        slider
          .setLimits(0, 300, 5)
          .setValue(this.plugin.settings.homepageTopMargin ?? 70)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.homepageTopMargin = value;
            label.textContent = `${value}px`;
            await this.plugin.saveSettings();
            document.querySelectorAll('.sc-home-container').forEach((el) => {
              (el as HTMLElement).setCssProps({ '--sc-home-top-margin': `${value}px` });
            });
          });
        slider.sliderEl.insertAdjacentElement('afterend', label);
      });

    // ── Appearance ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Appearance').setDesc('Customize how cards and the sidebar look.').setHeading();

    // Card preview
    const previewContainer = containerEl.createDiv({ cls: 'sc-preview-wrapper' });

    const previewCard = previewContainer.createDiv({ cls: 'sc-card sc-settings-preview-card' });

    const updatePreview = () => {
      const settings = this.plugin.settings;
      previewCard.className = 'sc-card';
      previewCard.addClass(`sc-style-${settings.cardStyle || 2}`);
      const color1 = settings.color1 || '#8392a4';
      const root = document.documentElement;
      root.setCssProps({ '--card-color-1': color1 });
      previewCard.setCssProps({
        'border-radius': `${settings.borderRadius || 0}px`,
        'border-width': `${settings.borderThickness ?? 2}px`
      });
      const colorSettings = {
        cardStyle: settings.cardStyle,
        cardBgOpacity: settings.cardBgOpacity,
        borderThickness: settings.borderThickness,
        cardBorderShadowOpacity: settings.cardBorderShadowOpacity,
      };
      void import("../utils/dom").then(({ applyCardColorToElement }) => {
        applyCardColorToElement(previewCard, 'var(--card-color-1)', colorSettings);
      });
      previewCard.empty();
      previewCard.createDiv({ text: 'This is how yours cards will look like!', cls: 'sc-content' });
      if (settings.groupTags) {
        if (settings.showTimestamps && settings.timestampBelowTags) {
          previewCard.createDiv({ cls: 'sc-timestamp', text: (window as { moment?: (fmt?: string) => { format: (f: string) => string } }).moment ? (window as { moment: () => { format: (f: string) => string } }).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        }
        const tagsEl = previewCard.createDiv({ cls: 'sc-tags' });
        ['ideas', 'project'].forEach(t => {
          tagsEl.createSpan({ cls: 'sc-tag', text: settings.omitTagHash ? t : `#${t}` });
        });
        if (settings.showTimestamps && !settings.timestampBelowTags) {
          previewCard.createDiv({ cls: 'sc-timestamp sc-timestamp--inline-spaced', text: (window as { moment?: () => { format: (f: string) => string } }).moment ? (window as { moment: () => { format: (f: string) => string } }).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        }
      } else {
        if (settings.showTimestamps) {
          previewCard.createDiv({ cls: 'sc-timestamp', text: (window as { moment?: () => { format: (f: string) => string } }).moment ? (window as { moment: () => { format: (f: string) => string } }).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        }
      }
    };
    updatePreview();

    new Setting(containerEl).setName('Card style').setDesc('Choose card design style').addDropdown(dropdown => dropdown.addOption('1', 'Style 1 (flat)').addOption('2', 'Style 2 (shadow)').addOption('3', 'Style 3 (left accent)').setValue(String(this.plugin.settings.cardStyle || 2)).onChange(async (value) => {
      this.plugin.settings.cardStyle = Number(value);
      await this.plugin.saveSettings();
      updatePreview();
      refreshSidebarCards();
    }));
    new Setting(containerEl).setName('Card background opacity').setDesc('Set the transparency of the card background').addSlider(slider => slider.setLimits(0.01, 1, 0.01).setValue(this.plugin.settings.cardBgOpacity || 0.08).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.cardBgOpacity = value;
      await this.plugin.saveSettings();
      updatePreview();
      refreshSidebarCards();
    }));
    new Setting(containerEl).setName('Card border thickness').setDesc('Set the thickness of the card border').addSlider(slider => slider.setLimits(1, 20, 1).setValue(this.plugin.settings.borderThickness || 2).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.borderThickness = value;
      await this.plugin.saveSettings();
      updatePreview();
      refreshSidebarCards();
    }));
    new Setting(containerEl).setName('Card border and shadow opacity').setDesc('Set the opacity of the card border and shadow color').addSlider(slider => slider.setLimits(0, 1, 0.05).setValue(this.plugin.settings.cardBorderShadowOpacity ?? 1).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.cardBorderShadowOpacity = value;
      await this.plugin.saveSettings();
      updatePreview();
      refreshSidebarCards();
    }));
    new Setting(containerEl).setName('Card border radius').setDesc('Set the corner rounding of the card').addSlider(slider => slider.setLimits(0, 30, 1).setValue(this.plugin.settings.borderRadius || 0).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.borderRadius = value;
      await this.plugin.saveSettings();
      document.documentElement.setCssProps({ '--card-border-radius': `${value}px` });
      updatePreview();
      refreshSidebarCards();
    }));
    new Setting(containerEl).setName('Maximum card height').setDesc('Limit card height in pixels (0 = no limit)').addSlider(slider => slider.setLimits(0, 800, 10).setValue(this.plugin.settings.maxCardHeight || 0).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.maxCardHeight = Number(value) || 0;
      await this.plugin.saveSettings();
      this.plugin.applyMaxCardHeight();
    }));
    new Setting(containerEl).setName('Bottom space under input row').setDesc('Padding to accommodate the status bar').addSlider(slider => slider.setLimits(0, 100, 1).setValue(this.plugin.settings.buttonPaddingBottom || 26).onChange(async (value) => {
      this.plugin.settings.buttonPaddingBottom = Number(value) || 0;
      await this.plugin.saveSettings();
      updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 0);
    }));
    new Setting(containerEl).setName('Group tags under content').setDesc('Show tags grouped below card content.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.groupTags).onChange(async (value) => {
      this.plugin.settings.groupTags = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));
    new Setting(containerEl).setName('Omit # prefix for tags').setDesc('Display tags without the leading #').addToggle(toggle => toggle.setValue(this.plugin.settings.omitTagHash ?? true).onChange(async (value) => {
      this.plugin.settings.omitTagHash = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));
    new Setting(containerEl).setName('Show timestamps').setDesc('Show creation timestamps on cards').addToggle(toggle => toggle.setValue(!!this.plugin.settings.showTimestamps).onChange(async (value) => {
      this.plugin.settings.showTimestamps = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));

    const timestampSetting = new Setting(containerEl)
      .setName('Date and time format for timestamps')
      .addText(text => text.setPlaceholder('Example format').setValue(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD hh:mma').onChange(async (value) => {
        this.plugin.settings.datetimeFormat = value;
        await this.plugin.saveSettings();
        updateTimestampPreview(value);
        updatePreview();
      }));
    const updateTimestampPreview = (val: string) => {
      timestampSetting.descEl.empty();
      timestampSetting.descEl.createSpan({ text: 'Your current format: ' });
      const m = (window as { moment?: () => { format: (f: string) => string } }).moment;
      const span = timestampSetting.descEl.createSpan({ text: m ? m().format(val || 'ddd D') : new Date().toLocaleString() });
      span.setCssStyles({ fontWeight: 'bold', color: 'var(--color-accent)' });
    };
    updateTimestampPreview(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD hh:mma');

    new Setting(containerEl).setName('Bring timestamp above tags').setDesc('Render timestamp above grouped tags.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.timestampBelowTags).onChange(async (value) => {
      this.plugin.settings.timestampBelowTags = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));
    new Setting(containerEl).setName('Animate cards').setDesc('Cards slide and fade.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.animatedCards).onChange(async (value) => {
      this.plugin.settings.animatedCards = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Disable card fade in').setDesc('Cards appear without fading.').addToggle(toggle => toggle.setValue(this.plugin.settings.disableCardFadeIn ?? false).onChange(async (value) => {
      this.plugin.settings.disableCardFadeIn = value;
      await this.plugin.saveSettings();
    }));
    // new Setting(containerEl).setName('Disable card Markdown rendering').setDesc('Show raw text only.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableCardRendering).onChange(async (value) => {
    //   this.plugin.settings.disableCardRendering = value;
    //   await this.plugin.saveSettings();
    // }));
    new Setting(containerEl).setName('Hide card container scrollbar').setDesc('Hides the scrollbar visually.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideScrollbar).onChange(async (value) => {
      this.plugin.settings.hideScrollbar = value;
      await this.plugin.saveSettings();
      try {
        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view as unknown as { applyScrollbarSetting?: () => void } | undefined;
        if (view && typeof view.applyScrollbarSetting === 'function') view.applyScrollbarSetting();
      } catch { /* view may not be open */ }
    }));
    new Setting(containerEl).setName('Hide categories topbar').setDesc('Hide the category filter button bar.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableFilterButtons).onChange(async (value) => {
      this.plugin.settings.disableFilterButtons = value;
      await this.plugin.saveSettings();
      refreshSidebarHeader();
    }));
    new Setting(containerEl).setName('Enable copy card content').setDesc('Show a copy icon on card hover.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCopyCardContent).onChange(async (value) => {
      this.plugin.settings.enableCopyCardContent = value;
      await this.plugin.saveSettings();
    }));

    // Apply CSS on settings open
    this.updateCSSVariables();
    updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 26);
    this.plugin.applyMaxCardHeight();

    // ── Colors ────────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Colors').setDesc('Card colors used for tagging. Names are written to notes.').setHeading();
    new Setting(containerEl)
      .setName('Two row color swatches in menu')
      .setDesc('Show colors in 2 rows of 5 in the card menu.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.twoRowSwatches)
        .onChange(async (value) => {
          this.plugin.settings.twoRowSwatches = value;
          await this.plugin.saveSettings();
        }));

    const colorVars: Array<{ name: string; key: keyof SideCardsSettings; default: string }> = [
      { name: 'Color 1', key: 'color1', default: '#8392a4' }, { name: 'Color 2', key: 'color2', default: '#eb3b5a' },
      { name: 'Color 3', key: 'color3', default: '#fa8231' }, { name: 'Color 4', key: 'color4', default: '#e5a216' },
      { name: 'Color 5', key: 'color5', default: '#20bf6b' }, { name: 'Color 6', key: 'color6', default: '#2d98da' },
      { name: 'Color 7', key: 'color7', default: '#8854d0' }, { name: 'Color 8', key: 'color8', default: '#e832c1' },
      { name: 'Color 9', key: 'color9', default: '#e83289' }, { name: 'Color 10', key: 'color10', default: '#965b3b' }
    ];
    colorVars.forEach((color, i) => {
      const row = new Setting(containerEl).setName(color.name);
      row.addText(txt => txt
        .setPlaceholder('Example: red')
        .setValue((this.plugin.settings.colorNames && this.plugin.settings.colorNames[i]) || '')
        .onChange(async (v) => {
          if (!this.plugin.settings.colorNames) this.plugin.settings.colorNames = [];
          this.plugin.settings.colorNames[i] = v || '';
          await this.plugin.saveSettings();
        }));
      row.addColorPicker(cp => cp
        .setValue((this.plugin.settings[color.key] as string) || color.default)
        .onChange(async (value) => {
          (this.plugin.settings as Record<keyof SideCardsSettings, unknown>)[color.key] = value;
          await this.plugin.saveSettings();
          this.updateCSSVariables();
          if (color.key === 'color1') updatePreview();
          refreshSidebarCards();
        }));
      row.addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          (this.plugin.settings as Record<keyof SideCardsSettings, unknown>)[color.key] = color.default;
          await this.plugin.saveSettings();
          this.updateCSSVariables();
          if (color.key === 'color1') updatePreview();
          refreshSidebarCards();
          this.display();
        }));
    });
    // ── Categories ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Categories').setDesc('Configure category display and reordering.').setHeading();
    // new Setting(containerEl).setName('Enable custom categories').setDesc('Allow custom categories in the right-click menu.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCustomCategories).onChange(async (value) => {
    //   this.plugin.settings.enableCustomCategories = value;
    //   await this.plugin.saveSettings();
    //   this.display();
    //   refreshSidebarHeader();
    // }));

    const catsContainer = containerEl.createDiv({ cls: 'categories-list sc-cats-container' });

    const renderCategories = () => {
      catsContainer.empty();
      const customList = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];

      // Build the full list of all possible items
      interface CategoryItem {
        id: string;
        label: string;
        canHide: boolean;
        canRemove: boolean;
        settingKey?: 'hideTodayFilter' | 'hideTomorrowFilter' | 'hideArchivedFilterButton';
        isCustom?: boolean;
        data?: CustomCategory;
        defaultIcon?: string;
        builtinKey?: string; // key in builtinCategoryIcons
      }

      const builtinItems: CategoryItem[] = [
        { id: 'filter-all', label: 'All', canHide: false, canRemove: false },
        { id: 'filter-today', label: 'Today', canHide: true, canRemove: false, settingKey: 'hideTodayFilter', defaultIcon: 'calendar-check', builtinKey: 'today' },
        { id: 'filter-tomorrow', label: 'Tomorrow', canHide: true, canRemove: false, settingKey: 'hideTomorrowFilter', defaultIcon: 'calendar-plus', builtinKey: 'tomorrow' },
        { id: 'filter-archived', label: 'Archived', canHide: true, canRemove: false, settingKey: 'hideArchivedFilterButton', defaultIcon: 'archive', builtinKey: 'archived' }
      ];

      const customItems: CategoryItem[] = customList.map(c => ({
        id: c.id,
        label: c.label,
        canHide: true,
        canRemove: true,
        isCustom: true,
        data: c
      }));

      const allItems: CategoryItem[] = [...builtinItems, ...customItems];
      const validIds = new Set(allItems.map(item => item.id));

      // Get current order
      let orderedIds = (this.plugin.settings.allItemsOrder || [])
        .filter(id => validIds.has(id));
      
      // Add missing items to the end
      allItems.forEach(item => {
        if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
      });

      let dragSrcId: string | null = null;

      const renderRow = (itemId: string) => {
        const itemInfo = allItems.find(i => i.id === itemId);
        if (!itemInfo) return;

        const isBuiltin = itemId.startsWith('filter-');
        const colorKey = isBuiltin ? itemId.replace('filter-', '') : itemId;
        
        let isVisible = true;
        if (isBuiltin) {
          const sKey = itemInfo.settingKey;
          if (sKey === 'hideTodayFilter') {
            isVisible = !this.plugin.settings.hideTodayFilter;
          } else if (sKey === 'hideTomorrowFilter') {
            isVisible = !this.plugin.settings.hideTomorrowFilter;
          } else if (sKey === 'hideArchivedFilterButton') {
            isVisible = !this.plugin.settings.hideArchivedFilterButton;
          }
        } else {
          isVisible = itemInfo.data?.showInMenu !== false;
        }

        const setting = new Setting(catsContainer);

        setting.settingEl.setAttr('data-cat-id', itemId);
        setting.settingEl.setAttr('draggable', 'true');

        setting.settingEl.addEventListener('dragstart', (e) => {
          dragSrcId = itemId;
          e.dataTransfer?.setData('text/plain', itemId);
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
          }
          window.setTimeout(() => {
            setting.settingEl.addClass('sc-dragging');
          }, 0);
        });

        setting.settingEl.addEventListener('dragend', () => {
          catsContainer.querySelectorAll('.sc-dragging').forEach(el => el.removeClass('sc-dragging'));
          dragSrcId = null;
        });

        setting.settingEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (dragSrcId === itemId) return;
          const target = setting.settingEl;
          const rect = target.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            target.removeClass('sc-drag-over-bottom');
            target.addClass('sc-drag-over-top');
          } else {
            target.removeClass('sc-drag-over-top');
            target.addClass('sc-drag-over-bottom');
          }
        });

        setting.settingEl.addEventListener('dragleave', () => {
          setting.settingEl.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');
        });

        setting.settingEl.addEventListener('drop', (e) => {
          void (async () => {
          e.preventDefault();
          if (!dragSrcId || dragSrcId === itemId) return;

          const target = setting.settingEl;
          target.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');

          const allIds = Array.from(catsContainer.querySelectorAll('.setting-item[data-cat-id]'))
            .map(el => (el as HTMLElement).dataset.catId as string);
          
          const srcIndex = allIds.indexOf(dragSrcId);
          const destIndex = allIds.indexOf(itemId);

          if (srcIndex === -1 || destIndex === -1) return;

          const rect = target.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertBefore = e.clientY < midY;

          const newOrder = allIds.filter(id => id !== dragSrcId);
          let finalIndex = destIndex;
          if (srcIndex < destIndex && !insertBefore) {
            finalIndex = destIndex;
          } else if (srcIndex > destIndex && insertBefore) {
            finalIndex = destIndex;
          } else if (srcIndex < destIndex && insertBefore) {
            finalIndex = destIndex -1;
          } else if (srcIndex > destIndex && !insertBefore) {
            finalIndex = destIndex + 1;
          }

          newOrder.splice(finalIndex, 0, dragSrcId);

          this.plugin.settings.allItemsOrder = newOrder;
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
          })();
        });

        setting.infoEl.remove();

        const row = setting.controlEl;
        row.addClass('sc-cat-row-controls');

        // Drag handle
        const handle = row.createEl('div', { cls: 'drag-handle sc-drag-handle' });
        try { setIcon(handle, 'grip-vertical'); } catch { handle.textContent = '⋮⋮'; }

        // Eye icon (Round button)
        const eyeBtn = row.createEl('button', { cls: 'clickable-icon sc-eye sc-round-btn' });

        const updateEye = () => {
          eyeBtn.empty();
          const iconName = isVisible ? 'eye' : 'eye-off';
          try { setIcon(eyeBtn, iconName); } catch { eyeBtn.textContent = isVisible ? '👁' : '🚫'; }
          eyeBtn.title = isVisible ? 'Visible' : 'Hidden';
          eyeBtn.removeClass('sc-round-btn--green', 'sc-round-btn--red');
          eyeBtn.addClass(isVisible ? 'sc-round-btn--green' : 'sc-round-btn--red');
        };

        if (itemInfo.canHide) {
          updateEye();
          eyeBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            void (async () => {
              if (isBuiltin) {
                const sKey = itemInfo.settingKey;
                if (sKey === 'hideTodayFilter') {
                  this.plugin.settings.hideTodayFilter = !isVisible;
                } else if (sKey === 'hideTomorrowFilter') {
                  this.plugin.settings.hideTomorrowFilter = !isVisible;
                } else if (sKey === 'hideArchivedFilterButton') {
                  this.plugin.settings.hideArchivedFilterButton = !isVisible;
                }
              } else {
                const idx = customList.findIndex(c => c.id === itemId);
                if (idx >= 0) this.plugin.settings.customCategories[idx].showInMenu = isVisible;
              }
              await this.plugin.saveSettings();
              updateEye();
              refreshSidebarHeader();
              applyPreviewColors();
            })();
          });
        } else {
          isVisible = true;
          updateEye();
          eyeBtn.addClass('sc-round-btn--disabled');
        }

        // Icon picker button (for custom categories and builtins with a builtinKey)
        if (itemInfo.isCustom || itemInfo.builtinKey) {
          const iconBtn = row.createEl('button', { cls: 'clickable-icon sc-cat-icon-btn sc-round-btn' });

          const getCurrentIcon = (): string | undefined => {
            if (itemInfo.builtinKey) {
              return this.plugin.settings.builtinCategoryIcons?.[itemInfo.builtinKey] ?? itemInfo.defaultIcon;
            }
            return itemInfo.data?.icon;
          };

          const updateIconBtn = () => {
            iconBtn.empty();
            const currentIcon = getCurrentIcon();
            if (currentIcon) {
              try { setIcon(iconBtn, currentIcon); } catch { iconBtn.textContent = '+'; }
              iconBtn.removeClass('sc-icon-btn--plus');
            } else {
              iconBtn.textContent = '+';
              iconBtn.addClass('sc-icon-btn--plus');
            }
            iconBtn.title = 'Icon in context menu';
          };
          updateIconBtn();

          iconBtn.addEventListener('click', () => {
            const modal = new SidecardsIconPickerModal(
              this.plugin.app,
              (pickedIcon) => {
                void (async () => {
                  if (itemInfo.builtinKey) {
                    if (!this.plugin.settings.builtinCategoryIcons) this.plugin.settings.builtinCategoryIcons = {};
                    this.plugin.settings.builtinCategoryIcons[itemInfo.builtinKey] = pickedIcon;
                  } else {
                    const idx = customList.findIndex(c => c.id === itemId);
                    if (idx >= 0) {
                      this.plugin.settings.customCategories[idx].icon = pickedIcon;
                      if (itemInfo.data) itemInfo.data.icon = pickedIcon;
                    }
                  }
                  await this.plugin.saveSettings();
                  updateIconBtn();
                })();
              },
              itemInfo.isCustom ? () => {
                void (async () => {
                  const idx = customList.findIndex(c => c.id === itemId);
                  if (idx >= 0) {
                    this.plugin.settings.customCategories[idx].icon = undefined;
                    if (itemInfo.data) itemInfo.data.icon = undefined;
                  }
                  await this.plugin.saveSettings();
                  updateIconBtn();
                })();
              } : undefined
            );
            modal.open();
          });

        }

        // Text color picker
        const textColorPicker = row.createEl('input', { cls: 'sc-color-picker-btn' });
        textColorPicker.type = 'color';
        textColorPicker.value = this.plugin.settings.filterColors?.[colorKey]?.textColor || '#c0c3c7';
        textColorPicker.title = 'Text color';
        textColorPicker.addEventListener('input', (e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          void (async () => {
            if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
            if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
            this.plugin.settings.filterColors[colorKey].textColor = val;
            await this.plugin.saveSettings();
            refreshSidebarHeader();
            applyPreviewColors();
          })();
        });

        // BG color picker
        const bgColorPicker = row.createEl('input', { cls: 'sc-color-picker-btn' });
        bgColorPicker.type = 'color';
        bgColorPicker.value = this.plugin.settings.filterColors?.[colorKey]?.bgColor || '#1a1a1a';
        bgColorPicker.title = 'Background color';
        bgColorPicker.addEventListener('input', (e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          void (async () => {
            if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
            if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
            this.plugin.settings.filterColors[colorKey].bgColor = val;
            await this.plugin.saveSettings();
            refreshSidebarHeader();
            applyPreviewColors();
          })();
        });

        const previewBtn = row.createEl('button', { cls: 'sc-category-preview' });
        previewBtn.textContent = itemInfo.label;
        const applyPreviewColors = () => {
          const colors = this.plugin.settings.filterColors?.[colorKey];
          if (colors?.bgColor) previewBtn.setCssProps({ 'background-color': colors.bgColor });
          else previewBtn.style.removeProperty('background-color');
          if (colors?.textColor) previewBtn.setCssProps({ 'color': colors.textColor });
          else previewBtn.style.removeProperty('color');
        };
        applyPreviewColors();

        const nameInput = row.createEl('input', { cls: 'sc-cat-name-input' });
        nameInput.type = 'text';
        nameInput.value = itemInfo.label;
        nameInput.placeholder = 'Category name';
        if (isBuiltin) {
          nameInput.disabled = true;
          nameInput.addClass('sc-cat-name-input--disabled');
        } else {
          nameInput.addEventListener('input', (e: Event) => {
            const newLabel = String((e.target as HTMLInputElement).value || '').trim();
            void (async () => {
              const idx = customList.findIndex(c => c.id === itemId);
              if (idx >= 0) {
                this.plugin.settings.customCategories[idx].label = newLabel || 'New Category';
                await this.plugin.saveSettings();
                previewBtn.textContent = this.plugin.settings.customCategories[idx].label;
                refreshSidebarHeader();
              }
            })();
          });
        }

        // Reset colors button
        let resetBtn: HTMLElement;
        if (Platform.isMobile) {
          resetBtn = row.createEl('button', { cls: 'clickable-icon' });
          setIcon(resetBtn, 'rotate-ccw');
          resetBtn.title = 'Reset colors';
        } else {
          resetBtn = row.createEl('button', { text: 'Reset colors', cls: 'sc-reset-btn-small' });
        }
        resetBtn.addEventListener('click', () => {
          void (async () => {
            if (this.plugin.settings.filterColors?.[colorKey]) {
              delete this.plugin.settings.filterColors[colorKey];
              await this.plugin.saveSettings();
              renderCategories();
              refreshSidebarHeader();
            }
          })();
        });

        // Reset-to-default icon button — only for builtins
        if (itemInfo.builtinKey) {
          const resetIconBtn = row.createEl('button', { cls: 'clickable-icon sc-round-btn' });
          resetIconBtn.title = 'Reset to default icon';
          try { setIcon(resetIconBtn, 'rotate-ccw'); } catch { resetIconBtn.textContent = '↺'; }
          resetIconBtn.addEventListener('click', () => {
            void (async () => {
              if (!this.plugin.settings.builtinCategoryIcons) this.plugin.settings.builtinCategoryIcons = {};
              this.plugin.settings.builtinCategoryIcons[itemInfo.builtinKey!] = itemInfo.defaultIcon!;
              await this.plugin.saveSettings();
              // Refresh the icon picker button display
              const iconBtnEl = row.querySelector('.sc-cat-icon-btn');
              if (iconBtnEl instanceof HTMLElement) {
                iconBtnEl.empty();
                try { setIcon(iconBtnEl, itemInfo.defaultIcon!); } catch { iconBtnEl.textContent = '+'; }
              }
            })();
          });
        }

        // Delete/Remove button
        if (itemInfo.canRemove) {
          const removeBtn = row.createEl('button', { cls: 'clickable-icon' });
          setIcon(removeBtn, 'trash');
          removeBtn.setAttr('title', 'Delete category');
          removeBtn.addEventListener('click', () => {
            new ConfirmDeleteModal(this.app, `Delete category "${itemInfo.label}"?`, async () => {
              const idx = customList.findIndex(c => c.id === itemId);
              if (idx >= 0) {
                this.plugin.settings.customCategories.splice(idx, 1);
                this.plugin.settings.allItemsOrder = (this.plugin.settings.allItemsOrder || []).filter(id => id !== itemId);
                await this.plugin.saveSettings();
                renderCategories();
                refreshSidebarHeader();
              }
            }).open();
          });
        } else {
          row.createEl('div', { cls: 'sc-spacer-32' });
        }
      };

      orderedIds.forEach(id => renderRow(id));

      // Add category button
      const addRow = catsContainer.createDiv({ cls: 'sc-add-row' });
      const addBtn = addRow.createEl('button', { text: 'Add custom category', cls: 'mod-cta' });
      addBtn.addEventListener('click', () => {
        void (async () => {
          if (!Array.isArray(this.plugin.settings.customCategories)) this.plugin.settings.customCategories = [];
          const id = 'cat-' + Date.now();
          this.plugin.settings.customCategories.push({ id, label: 'New category', showInMenu: true });
          if (!Array.isArray(this.plugin.settings.allItemsOrder)) this.plugin.settings.allItemsOrder = [];
          this.plugin.settings.allItemsOrder.push(id);
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        })();
      });
    };
    renderCategories();

    new Setting(containerEl)
      .setName('Open category on load')
      .setDesc('Which category opens when the sidebar loads.')
      .addDropdown(dropdown => {
        const opts: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All' }];
        if (!this.plugin.settings.hideTodayFilter) {
          opts.push({ value: 'today', label: 'Today' });
        }
        if (!this.plugin.settings.hideTomorrowFilter) {
          opts.push({ value: 'tomorrow', label: 'Tomorrow' });
        }
        if (!this.plugin.settings.hideArchivedFilterButton) {
          opts.push({ value: 'archived', label: 'Archived' });
        }
        (this.plugin.settings.customCategories || []).forEach(c => opts.push({ value: String(c.id || c.label || ''), label: String(c.label || c.id || '') }));
        opts.forEach(o => { dropdown.addOption(o.value, o.label); });
        dropdown.setValue(String(this.plugin.settings.openCategoryOnLoad || 'all'));
        dropdown.onChange((v) => {
          void (async () => {
            this.plugin.settings.openCategoryOnLoad = v;
            await this.plugin.saveSettings();
          })();
        });
      });

    // ── Auto Color ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName('Auto color').setDesc('Cards inherit a color based on text or tag rules when no color is manually set.').setHeading();
    const rulesContainer = containerEl.createDiv();
    const renderRules = () => {
      rulesContainer.empty();
      const rules = Array.isArray(this.plugin.settings.autoColorRules) ? this.plugin.settings.autoColorRules : [];
      let ruleDragSrcId: string | null = null;
      
      rules.forEach((r, idx) => {
        const setting = new Setting(rulesContainer)
          .addExtraButton(btn => {
            btn.setIcon('grip-vertical').setTooltip('Drag to reorder');
            btn.extraSettingsEl.addClass('sc-drag-handle');
          })
          .addDropdown(dropdown => {
            dropdown
              .addOption('text', 'Text')
              .addOption('tag', 'Tag')
              .setValue(String(r.type || 'text'))
              .onChange(async (value) => {
                this.plugin.settings.autoColorRules![idx].type = value as 'text' | 'tag';
                await this.plugin.saveSettings();
              });
            dropdown.selectEl.addClass('sc-dropdown-normal');
          })
          .addText(text => {
            text
              .setPlaceholder('Match')
              .setValue(r.match || '')
              .onChange(async (value) => {
                this.plugin.settings.autoColorRules![idx].match = value;
                await this.plugin.saveSettings();
              });
            text.inputEl.addClass('sc-rule-text-input');
          })
          .addDropdown(dropdown => {
            const colors = this.plugin.settings.colorNames || [];
            for (let i = 1; i <= 10; i++) {
              const colorName = colors[i - 1] || `Color ${i}`;
              dropdown.addOption(String(i), colorName);
            }
            dropdown.setValue(String(r.colorIndex || 1));
            this.applyColorToDropdown(dropdown.selectEl, String(r.colorIndex || 1));
            dropdown.onChange(async (value) => {
              this.plugin.settings.autoColorRules![idx].colorIndex = Number(value);
              await this.plugin.saveSettings();
              this.applyColorToDropdown(dropdown.selectEl, value);
            });
            dropdown.selectEl.addClass('sc-dropdown-normal');
            Array.from(dropdown.selectEl.options).forEach(opt => opt.addClass('sc-dropdown-normal'));
          })
          .addExtraButton(button => {
            button
              .setIcon('trash')
              .setTooltip('Remove rule')
              .onClick(async () => {
                this.plugin.settings.autoColorRules!.splice(idx, 1);
                await this.plugin.saveSettings();
                renderRules();
              });
          });
        setting.infoEl.remove();
        setting.controlEl.addClass('sc-rule-row-controls');

        // Add drag events for Auto Color
        setting.settingEl.setAttr('draggable', 'true');
        setting.settingEl.addEventListener('dragstart', (e) => {
          ruleDragSrcId = `rule-${idx}`;
          e.dataTransfer?.setData('text/plain', ruleDragSrcId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          window.setTimeout(() => setting.settingEl.addClass('sc-dragging'), 0);
        });
        setting.settingEl.addEventListener('dragend', () => {
          rulesContainer.querySelectorAll('.sc-dragging').forEach(el => el.removeClass('sc-dragging'));
          ruleDragSrcId = null;
        });
        setting.settingEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (ruleDragSrcId && ruleDragSrcId.startsWith('rule-')) {
            const rect = setting.settingEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            setting.settingEl.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');
            setting.settingEl.addClass(e.clientY < midY ? 'sc-drag-over-top' : 'sc-drag-over-bottom');
          }
        });
        setting.settingEl.addEventListener('dragleave', () => {
          setting.settingEl.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');
        });
        setting.settingEl.addEventListener('drop', (e) => {
          void (async () => {
          e.preventDefault();
          if (!ruleDragSrcId || !ruleDragSrcId.startsWith('rule-')) return;
          const srcIdx = parseInt(ruleDragSrcId.replace('rule-', ''));
          if (srcIdx === idx) return;

          const rules = this.plugin.settings.autoColorRules || [];
          const [moved] = rules.splice(srcIdx, 1);
          rules.splice(idx, 0, moved);
          await this.plugin.saveSettings();
          renderRules();
          })();
        });
      });

      const addBtnContainer = rulesContainer.createDiv({ cls: 'sc-add-row' });
      const addBtn = addBtnContainer.createEl('button', { text: 'Add auto color rule', cls: 'mod-cta' });
      addBtn.addEventListener('click', () => {
        void (async () => {
          if (!Array.isArray(this.plugin.settings.autoColorRules)) this.plugin.settings.autoColorRules = [];
          this.plugin.settings.autoColorRules.push({ type: 'text', match: '', colorIndex: 1 });
          await this.plugin.saveSettings();
          renderRules();
        })();
      });
    };
    renderRules();

    new Setting(containerEl).setName('Status').setDesc('Dropdown colors take precedence over custom unless the dropdown is set to custom.').setHeading();
    const statusSection = containerEl.createDiv();
    new Setting(statusSection).setName('Enable card status').setDesc('Drag to reorder status pills and set their sorting priority.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCardStatus).onChange(async (value) => {
      this.plugin.settings.enableCardStatus = value;
      await this.plugin.saveSettings();
      renderStatusConfig();
    }));
    new Setting(statusSection).setName('Inherit status color').setDesc('When enabled, card color uses the status color').addToggle(toggle => toggle.setValue(!!this.plugin.settings.inheritStatusColor).onChange(async (value) => {
      this.plugin.settings.inheritStatusColor = value;
      await this.plugin.saveSettings();
    }));
    const statusConfigContainer = statusSection.createDiv();
    const renderStatusConfig = () => {
      statusConfigContainer.empty();
      if (!this.plugin.settings.enableCardStatus) return;
      const list = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
      let statusDragSrcId: string | null = null;
      list.forEach((s, idx) => {
        const setting = new Setting(statusConfigContainer)
          .addExtraButton(btn => {
            btn.setIcon('grip-vertical').setTooltip('Drag to reorder');
            btn.extraSettingsEl.addClass('sc-drag-handle');
          })
          .addText(text => {
            text
              .setValue(s.name || '')
              .onChange(async (value) => {
                this.plugin.settings.cardStatuses![idx].name = value;
                await this.plugin.saveSettings();
              });
            text.inputEl.addClass('sc-status-text-input');
          });
        setting.infoEl.remove();

        // Color pickers as plain inputs (not Setting instances, to avoid ghost setting-item rows)
        const colorPickerEl = setting.controlEl.createEl('input', { cls: 'sc-color-picker-inline sc-hidden' });
        colorPickerEl.type = 'color';
        colorPickerEl.value = s.color || '#20bf6b';
        colorPickerEl.addEventListener('input', (e: Event) => {
          void (async () => {
            this.plugin.settings.cardStatuses![idx].color = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
            this.plugin.injectStatusColors();
          })();
        });

        const textColorPickerEl = setting.controlEl.createEl('input', { cls: 'sc-color-picker-inline sc-hidden' });
        textColorPickerEl.type = 'color';
        textColorPickerEl.value = s.textColor || '#000000';
        textColorPickerEl.addEventListener('input', (e: Event) => {
          void (async () => {
            this.plugin.settings.cardStatuses![idx].textColor = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
          })();
        });

        const updatePickersVisibility = (val: string) => {
          if (val === 'custom') {
            colorPickerEl.removeClass('sc-hidden');
            textColorPickerEl.removeClass('sc-hidden');
          } else {
            colorPickerEl.addClass('sc-hidden');
            textColorPickerEl.addClass('sc-hidden');
          }
        };

        setting.addDropdown(dropdown => {
          dropdown.addOption('custom', 'Custom');
          for (let i = 1; i <= 10; i++) {
            const colorName = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[i - 1]) || `Color ${i}`;
            dropdown.addOption(String(i), colorName);
          }

          // Determine current value
          let currentVal = 'custom';
          if (s.colorIndex) {
            currentVal = String(s.colorIndex);
          } else {
            for (let i = 1; i <= 10; i++) {
              const colorKey = `color${i}` as keyof SideCardsSettings;
              if (this.plugin.settings[colorKey] === s.color) {
                currentVal = String(i);
                break;
              }
            }
          }
          dropdown.setValue(currentVal);

          const applyDropdownColors = (val: string) => {
            if (val === 'custom') {
              (dropdown.selectEl as HTMLElement).setCssProps({
                'background-color': 'var(--background-modifier-form-field)',
                'color': 'var(--text-normal)'
              });
            } else {
              const colorKey = `color${val}` as keyof SideCardsSettings;
              const color = this.plugin.settings[colorKey] as string;
              (dropdown.selectEl as HTMLElement).setCssProps({
                'background-color': color,
                'color': this.getContrastColor(color)
              });
            }
            Array.from(dropdown.selectEl.options).forEach(opt => {
              if (opt.value === 'custom') {
                (opt as HTMLElement).setCssProps({
                  'background-color': 'var(--background-modifier-form-field)',
                  'color': 'var(--text-normal)'
                });
              } else {
                const cKey = `color${opt.value}` as keyof SideCardsSettings;
                const c = this.plugin.settings[cKey] as string;
                (opt as HTMLElement).setCssProps({
                  'background-color': c,
                  'color': 'var(--text-normal)'
                });
              }
            });
          };

          applyDropdownColors(currentVal);
          updatePickersVisibility(currentVal);

          dropdown.onChange(async (value) => {
            if (value !== 'custom') {
              const colorKey = `color${value}` as keyof SideCardsSettings;
              const color = this.plugin.settings[colorKey] as string;
              this.plugin.settings.cardStatuses![idx].color = color;
              this.plugin.settings.cardStatuses![idx].colorIndex = Number(value);
            } else {
              this.plugin.settings.cardStatuses![idx].colorIndex = undefined;
            }
            await this.plugin.saveSettings();
            this.plugin.injectStatusColors();
            applyDropdownColors(value);
            updatePickersVisibility(value);
          });
        });

        setting.addExtraButton(button => {
          button
            .setIcon('trash')
            .setTooltip('Remove status')
            .onClick(async () => {
              this.plugin.settings.cardStatuses!.splice(idx, 1);
              await this.plugin.saveSettings();
              renderStatusConfig();
            });
        });

        setting.controlEl.addClass('sc-status-row-controls');

        // Add drag events for Status
        setting.settingEl.setAttr('draggable', 'true');
        setting.settingEl.addEventListener('dragstart', (e) => {
          statusDragSrcId = `status-${idx}`;
          e.dataTransfer?.setData('text/plain', statusDragSrcId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          window.setTimeout(() => setting.settingEl.addClass('sc-dragging'), 0);
        });
        setting.settingEl.addEventListener('dragend', () => {
          statusConfigContainer.querySelectorAll('.sc-dragging').forEach(el => el.removeClass('sc-dragging'));
          statusDragSrcId = null;
        });
        setting.settingEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (statusDragSrcId && statusDragSrcId.startsWith('status-')) {
            const rect = setting.settingEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            setting.settingEl.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');
            setting.settingEl.addClass(e.clientY < midY ? 'sc-drag-over-top' : 'sc-drag-over-bottom');
          }
        });
        setting.settingEl.addEventListener('dragleave', () => {
          setting.settingEl.removeClass('sc-drag-over-top', 'sc-drag-over-bottom');
        });
        setting.settingEl.addEventListener('drop', (e) => {
          void (async () => {
          e.preventDefault();
          if (!statusDragSrcId || !statusDragSrcId.startsWith('status-')) return;
          const srcIdx = parseInt(statusDragSrcId.replace('status-', ''));
          if (srcIdx === idx) return;

          const statuses = this.plugin.settings.cardStatuses || [];
          const [moved] = statuses.splice(srcIdx, 1);
          statuses.splice(idx, 0, moved);
          await this.plugin.saveSettings();
          renderStatusConfig();
          })();
        });
      });

      const addBtnContainer = statusConfigContainer.createDiv({ cls: 'sc-add-row' });
      const addBtn = addBtnContainer.createEl('button', { text: 'Add status', cls: 'mod-cta' });
      addBtn.addEventListener('click', () => {
        void (async () => {
          if (!Array.isArray(this.plugin.settings.cardStatuses)) this.plugin.settings.cardStatuses = [];
          this.plugin.settings.cardStatuses.push({ name: 'focus', color: '#20bf6b', textColor: '#000000' });
          await this.plugin.saveSettings();
          renderStatusConfig();
        })();
      });
    };
    renderStatusConfig();

    // ── Data Management ───────────────────────────────────────────────────────
    new Setting(containerEl).setName('Data management').setHeading();

    new Setting(containerEl)
      .setName('Export data')
      .setDesc('Download all cards as a JSON file.')
      .addButton(btn => btn
        .setButtonText('Export data')
        .onClick(() => {
          const cards = this.plugin.store.getAll().map(c => c.toJSON());
          const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards }, null, 2);
          const blob = new Blob([payload], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sidecards-export-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          new Notice('Cards exported.');
        }));

    new Setting(containerEl)
      .setName('Import data')
      .setDesc('Import cards from a previously exported JSON file. Existing cards with the same ID will be skipped.')
      .addButton(btn => btn
        .setButtonText('Import data')
        .onClick(() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(reader.result as string);
                  const incoming: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.cards) ? parsed.cards : []);
                  if (incoming.length === 0) { new Notice('No cards found in file.'); return; }
                  const existing = new Set(this.plugin.store.getAll().map(c => c.id));
                  let added = 0;
                  for (const raw of incoming) {
                    if (!raw?.id || existing.has(raw.id as string)) continue;
                    const { Card } = await import('../models/Card');
                    await this.plugin.store.add(new Card(raw));
                    added++;
                  }
                  new Notice(`Imported ${added} card${added !== 1 ? 's' : ''}.`);
                } catch (e) {
                  new Notice('Import failed: invalid JSON file.');
                  console.error('Sidecards import error:', e);
                }
              })();
            };
            reader.readAsText(file);
          });
          input.click();
        }));
  }
}

class ConfirmDeleteModal extends Modal {
  constructor(app: App, private message: string, private onConfirm: () => Promise<void>) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('p', { text: this.message });
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
    btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const confirmBtn = btnRow.createEl('button', { text: 'Delete', cls: 'mod-warning' });
    confirmBtn.addEventListener('click', () => { this.close(); void this.onConfirm(); });
  }
  onClose() { this.contentEl.empty(); }
}

class ChangelogModal extends Modal {
  plugin: SideCardsPlugin;
  _mdComp: Component | null = null;

  constructor(app: App, plugin: SideCardsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    try {
      this.modalEl.setCssStyles({
        maxWidth: '900px',
        width: '900px',
        padding: '25px'
      });
    } catch { /* ignore */ }

    const header = contentEl.createEl('div');
    header.setCssStyles({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '0px',
      paddingBottom: '16px',
      borderBottom: '1px solid var(--divider-color)'
    });

    const title = header.createEl('h2', { text: 'Sidecards' });
    title.setCssStyles({ margin: '0', fontSize: '1.5em', fontWeight: '600' });

    const link = header.createEl('a', { text: 'View on GitHub' });
    link.href = 'https://github.com/Kazi-Aidah/sidecards/releases';
    link.target = '_blank';
    link.setCssStyles({ fontSize: '0.9em', opacity: '0.8', transition: 'opacity 0.2s' });
    link.addEventListener('mouseenter', () => link.setCssStyles({ opacity: '1' }));
    link.addEventListener('mouseleave', () => link.setCssStyles({ opacity: '0.8' }));

    const body = contentEl.createDiv();
    body.setCssStyles({ maxHeight: '70vh', overflow: 'auto' });

    const loading = body.createEl('div', { text: 'Loading releases...' });
    loading.setCssStyles({ opacity: '0.7', fontSize: '0.95em', marginTop: '12px' });

    try {
      const rels = await this.plugin.fetchAllReleases();
      body.empty();
      if (!Array.isArray(rels) || rels.length === 0) {
        body.createEl('div', { text: 'No release information available.' }).setCssStyles({ marginTop: '12px' });
        return;
      }

      rels.forEach((rel) => { void (async () => {
        const meta = body.createEl('div');
        meta.setCssStyles({ marginBottom: '6px', borderBottom: '1px solid var(--divider-color)' });

        const releaseName = meta.createEl('div', { text: rel.name || rel.tag_name || 'Release' });
        releaseName.setCssStyles({
          fontSize: '2em',
          fontWeight: '900',
          marginTop: '12px',
          marginBottom: '12px',
          color: 'var(--text-normal)'
        });

        try {
          const dateRaw = rel.published_at || rel.created_at || null;
          if (dateRaw) {
            const dt = new Date(dateRaw);
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const formatted = `${dt.getFullYear()} ${monthNames[dt.getMonth()]} ${String(dt.getDate()).padStart(2, '0')}`;
            const dateEl = meta.createEl('div', { text: formatted });
            dateEl.setCssStyles({ display: 'block', opacity: '0.8', fontSize: '0.9em', marginTop: '-4px', marginBottom: '16px' });
          }
        } catch { /* ignore */ }

        const notes = body.createEl('div');
        notes.setCssStyles({ marginTop: '0px', lineHeight: '1.6', fontSize: '0.95em' });
        notes.addClass('markdown-preview-view');
        try { notes.setCssStyles({ padding: '0 var(--file-margin)' }); } catch { /* ignore */ }

        const md = rel.body || 'No notes';
        try {
          if (!this._mdComp) this._mdComp = new Component();
          await MarkdownRenderer.render(this.plugin.app, md, notes, '', this._mdComp);
        } catch {
          const preEl = notes.createEl('pre');
          preEl.setCssStyles({
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            backgroundColor: 'var(--background-secondary)',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '0.9em',
            lineHeight: '1.5'
          });
          preEl.textContent = md;
        }
      })(); });
    } catch {
      body.empty();
      body.createEl('div', { text: 'Failed to load release notes.' }).setCssStyles({ marginTop: '12px' });
    }
  }

  onClose() {
    try { if (this._mdComp) this._mdComp.unload(); } catch { /* ignore */ }
    this._mdComp = null;
    this.contentEl.empty();
  }
}

class FolderSuggest {
  private suggestEl: HTMLElement;
  private folders: string[];

  constructor(private app: App, private inputEl: HTMLInputElement, folders: Set<string>) {
    this.folders = Array.from(folders).sort();
    this.suggestEl = document.createElement('div');
    this.suggestEl.className = 'suggestion-container sc-folder-suggest';
    this.inputEl.parentElement?.appendChild(this.suggestEl);
    this.inputEl.addEventListener('click', () => this.onFocus());
    this.inputEl.addEventListener('input', () => this.onInput());
    document.addEventListener('click', (event) => this.onClick(event));
  }

  private onFocus(): void {
    const foldersSet = new Set<string>(['/']);
    type VaultNode = { path?: string; children?: VaultNode[] };
    const vaultWithRoot = this.app.vault as unknown as { getRoot?: () => VaultNode };
    const root: VaultNode | undefined = vaultWithRoot.getRoot?.();
    const walk = (node: VaultNode) => {
      if (!node) return;
      const children = node.children || [];
      for (const c of children) {
        if (c && c.path && c.children) {
          foldersSet.add(c.path || '/');
          walk(c);
        }
      }
    };
    if (root) walk(root);
    try {
      this.app.vault.getAllLoadedFiles().forEach((file) => {
        if (file && file.parent) foldersSet.add(file.parent.path);
      });
    } catch { /* ignore */ }
    this.folders = Array.from(foldersSet).sort();
    this.updateSuggestions();
    this.suggestEl.addClass('is-visible');
  }

  private onInput(): void {
    this.updateSuggestions();
  }

  private onClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.inputEl.contains(target) && !this.suggestEl.contains(target)) {
      this.suggestEl.removeClass('is-visible');
    }
  }

  private updateSuggestions(): void {
    const inputValue = this.inputEl.value.toLowerCase();
    this.suggestEl.empty();
    const filtered = this.folders.filter(folder => folder.toLowerCase().includes(inputValue)).slice(0, 100);
    filtered.forEach(folder => {
      const item = document.createElement('div');
      item.className = 'suggestion-item sc-folder-suggest-item';
      item.textContent = folder;
      item.addEventListener('click', () => {
        this.inputEl.value = folder;
        this.inputEl.dispatchEvent(new Event('input'));
        this.suggestEl.removeClass('is-visible');
      });
      this.suggestEl.appendChild(item);
    });
  }
}

class SidecardsIconPickerModal extends Modal {
  onPick: (icon: string) => void;
  onRemove?: () => void;
  private allIcons: string[] = [];

  constructor(app: App, onPick: (icon: string) => void, onRemove?: () => void) {
    super(app);
    this.onPick = onPick;
    this.onRemove = onRemove;
  }

  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.addClass('sc-icon-picker-content');

    const searchInput = c.createEl('input', { type: 'text', attr: { placeholder: 'Search icons...' }, cls: 'sc-icon-picker-search' });

    const list = c.createDiv({ cls: 'sc-icon-picker-list' });

    const footer = c.createDiv({ cls: 'sc-icon-picker-footer' });
    const removeBtn = footer.createEl('button', { text: 'Remove icon' });
    removeBtn.addEventListener('click', () => { if (this.onRemove) this.onRemove(); this.close(); });

    if (!this.allIcons.length) {
      try {
        const ids = getIconIds();
        this.allIcons = ids && ids.length > 0 ? ids : [];
      } catch { this.allIcons = []; }
    }

    const renderList = (icons: string[], limit = 98) => {
      list.empty();
      const toShow = limit > 0 ? icons.slice(0, limit) : icons;
      toShow.forEach(id => {
        const btn = list.createEl('button', { cls: 'sc-icon-picker-btn' });
        btn.title = id;
        try { setIcon(btn, id); } catch { btn.textContent = id.slice(0, 2); }
        btn.addEventListener('click', () => { this.onPick(id); this.close(); });
      });
    };

    const applyFilter = () => {
      const q = (searchInput.value || '').toLowerCase();
      if (!q) renderList(this.allIcons, 98);
      else renderList(this.allIcons.filter(id => id.toLowerCase().includes(q)), 500);
    };

    searchInput.addEventListener('input', applyFilter);
    renderList(this.allIcons, 98);
  }

  onClose() { this.contentEl.empty(); }
}
