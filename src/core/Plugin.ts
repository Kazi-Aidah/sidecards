
import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf, setIcon, Notice, TFile, Platform, requestUrl, Component, MarkdownRenderer, Modal } from "obsidian";
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
    const root = document.documentElement;
    root.style.setProperty('--card-color-1', this.settings.color1 || '#8392a4');
    root.style.setProperty('--card-color-2', this.settings.color2 || '#eb3b5a');
    root.style.setProperty('--card-color-3', this.settings.color3 || '#fa8231');
    root.style.setProperty('--card-color-4', this.settings.color4 || '#e5a216');
    root.style.setProperty('--card-color-5', this.settings.color5 || '#20bf6b');
    root.style.setProperty('--card-color-6', this.settings.color6 || '#2d98da');
    root.style.setProperty('--card-color-7', this.settings.color7 || '#8854d0');
    root.style.setProperty('--card-color-8', this.settings.color8 || '#e832c1');
    root.style.setProperty('--card-color-9', this.settings.color9 || '#e83289');
    root.style.setProperty('--card-color-10', this.settings.color10 || '#965b3b');
    root.style.setProperty('--card-border-radius', `${this.settings.borderRadius ?? 6}px`);

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
        this as any,
        this.store,
        this.sortService
      )
    );

    this.addCommand({
      id: 'open-card-sidebar',
      name: 'Open Card Sidebar',
      callback: () => this.activateView()
    });
    this.addCommand({
      id: 'open-sidecards-home',
      name: 'Open SideCards Home',
      callback: () => this.activateHomeView()
    });

    this.addCommand({
      id: 'quick-card-add',
      name: 'Quick Card Add',
      callback: () => new QuickCardWithFilterModal(this.app, this, this.store).open(),
    });

    this.addCommand({
      id: 'search-cards',
      name: 'Search Cards',
      callback: () => new SearchModal(this.app, this, this.store).open()
    });

    this.addCommand({
      id: 'pin-to-homepage',
      name: 'Pin to Sidecards Homepage',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          const isPinned = this.settings.pinnedNotes?.includes(file.path);
          if (!this.settings.pinnedNotes) this.settings.pinnedNotes = [];
          if (isPinned) {
            this.settings.pinnedNotes = this.settings.pinnedNotes.filter(p => p !== file.path);
            new Notice(`Unpinned ${file.name} from Sidecards Homepage.`);
          } else {
            if (this.settings.showPinnedNotes !== false) {
              this.settings.pinnedNotes.push(file.path);
              new Notice(`Pinned ${file.name} to Sidecards Homepage.`);
            }
          }
          this.saveSettings();
          const leaves = this.app.workspace.getLeavesOfType('sidecards-home');
          leaves.forEach((leaf) => {
            if (leaf.view && typeof (leaf.view as any).refreshPinnedNotes === 'function') {
              (leaf.view as any).refreshPinnedNotes();
            }
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

    this.addSettingTab(new SideCardsSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) {
          menu.addItem((item) => {
            const isPinned = this.settings.pinnedNotes?.includes(file.path);
            item
              .setTitle(isPinned ? "Unpin from Sidecards Homepage" : "Pin to Sidecards Homepage")
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
                  if (leaf.view && typeof (leaf.view as any).refreshPinnedNotes === 'function') {
                    (leaf.view as any).refreshPinnedNotes();
                  }
                });
              });
          });
        }
      })
    );

    // Replace new tab with homepage when enabled
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf: any) => {
        if (!this.settings.replaceHomepageWithSidecards) return;
        if (!leaf) return;
        try {
          const viewType = leaf.view?.getViewType?.();
          if (viewType === 'sidecards-home') return;
          const state = leaf.getViewState?.();
          if (state?.type === 'empty' && !state?.state?.file) {
            void this.replaceWithHomepage(leaf);
          }
        } catch {}
      })
    );
  }

  onunload() {
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
      workspace.revealLeaf(leaf);
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
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    if (leaf) {
      await leaf.setViewState({ type: 'sidecards-home', active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  refreshHomepageViews() {
    this.app.workspace.getLeavesOfType('sidecards-home').forEach(leaf => {
      const view = leaf.view as any;
      if (typeof view.onOpen === 'function') {
        try { view.onOpen(); } catch {}
      }
    });
  }

  private async replaceWithHomepage(leaf: any) {
    try {
      await leaf.setViewState({ type: 'sidecards-home', active: true });
    } catch {}
  }

  async fetchAllReleases() {
    const allReleases: any[] = [];
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const url = `https://api.github.com/repos/Kazi-Aidah/sidecards/releases?page=${page}&per_page=100`;
      try {
        const res = await requestUrl({
          url,
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Obsidian-SideCards'
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
    root.style.setProperty('--card-color-1', this.plugin.settings.color1 || '#8392a4');
    root.style.setProperty('--card-color-2', this.plugin.settings.color2 || '#eb3b5a');
    root.style.setProperty('--card-color-3', this.plugin.settings.color3 || '#fa8231');
    root.style.setProperty('--card-color-4', this.plugin.settings.color4 || '#e5a216');
    root.style.setProperty('--card-color-5', this.plugin.settings.color5 || '#20bf6b');
    root.style.setProperty('--card-color-6', this.plugin.settings.color6 || '#2d98da');
    root.style.setProperty('--card-color-7', this.plugin.settings.color7 || '#8854d0');
    root.style.setProperty('--card-color-8', this.plugin.settings.color8 || '#e832c1');
    root.style.setProperty('--card-color-9', this.plugin.settings.color9 || '#e83289');
    root.style.setProperty('--card-color-10', this.plugin.settings.color10 || '#965b3b');
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
    
    const updateButtonPadding = (paddingPx: number) => {
      const styleEl = document.createElement('style');
      styleEl.id = 'card-button-padding';
      styleEl.textContent = `.sc-sidebar-button-container { padding-bottom: ${paddingPx}px !important; }`;
      document.getElementById('card-button-padding')?.remove();
      document.head.appendChild(styleEl);
    };
    const refreshSidebarHeader = () => {
      try {
        const view: any = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
        if (!view) return;
        const main = view.containerEl.querySelector('.sc-sidebar-main');
        const old = main?.querySelector('.sc-sidebar-header');
        if (old) old.remove();
        if (main && typeof view.createHeader === 'function') {
          view.createHeader(main);
          const header = main.querySelector('.sc-sidebar-header');
          if (header) main.prepend(header);
        }
        try { if (typeof view.applyFilters === 'function') view.applyFilters(); } catch {}
      } catch {}
    };
    const refreshSidebarCards = () => {
      try {
        const view: any = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
        if (view && typeof view.renderCards === 'function') {
          view.renderCards();
        }
      } catch {}
    };

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
            this.plugin.settings.storageFolder = value;
            this.plugin.settings.tutorialShown = true;
            await this.plugin.saveSettings();
          });
        const folders = new Set<string>(['/']);
        this.app.vault.getAllLoadedFiles().forEach((file: any) => { if (file.parent) folders.add(file.parent.path); });
        new FolderSuggest(this.app, cb.inputEl, folders);
      });

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
    
    // Always display as individual settings in the settings tab
    colorVars.forEach((color, i) => {
      const row = new Setting(containerEl).setName(color.name);
      row.addText(txt => txt
        .setPlaceholder('e.g. red')
        .setValue((this.plugin.settings.colorNames && this.plugin.settings.colorNames[i]) || '')
        .onChange(async (v) => {
          if (!this.plugin.settings.colorNames) this.plugin.settings.colorNames = [];
          this.plugin.settings.colorNames[i] = v || '';
          await this.plugin.saveSettings();
        }));
      row.addColorPicker(cp => cp
        .setValue((this.plugin.settings[color.key] as string) || color.default)
        .onChange(async (value) => {
          (this.plugin.settings as any)[color.key] = value;
          await this.plugin.saveSettings();
          this.updateCSSVariables();
          if (color.key === 'color1') updatePreview();
          refreshSidebarCards();
        }));
    });

    new Setting(containerEl).setName('Appearance').setDesc('Customize how cards and the sidebar look.').setHeading();
    
    // Card preview
    const previewContainer = containerEl.createDiv({ cls: 'sc-preview-wrapper' });
    previewContainer.style.marginBottom = '24px';
    previewContainer.style.padding = '20px';
    previewContainer.style.borderRadius = '8px';
    previewContainer.style.backgroundColor = 'var(--background-secondary)';
    previewContainer.style.border = '1px solid var(--background-modifier-border)';
    previewContainer.style.display = 'flex';
    previewContainer.style.flexDirection = 'column';
    previewContainer.style.alignItems = 'center';

    // const previewLabel = previewContainer.createEl('div', { text: 'Card Preview' });
    // previewLabel.style.fontWeight = 'bold';
    // previewLabel.style.marginBottom = '12px';
    // previewLabel.style.fontSize = '12px';
    // previewLabel.style.color = 'var(--text-muted)';
    // previewLabel.style.width = '100%';

    const previewCard = previewContainer.createDiv({ cls: 'sc-card' });
    previewCard.style.width = '100%';
    previewCard.style.maxWidth = '300px';
    previewCard.style.margin = '0';
    previewCard.style.pointerEvents = 'none';
    
    const updatePreview = () => {
      const settings = this.plugin.settings;
      previewCard.className = 'sc-card';
      previewCard.addClass(`sc-style-${settings.cardStyle || 2}`);
      
      // Apply color 1 to preview
      const color1 = settings.color1 || '#8392a4';
      const root = document.documentElement;
      root.style.setProperty('--card-color-1', color1);
      
      previewCard.style.setProperty('border-radius', `${settings.borderRadius || 0}px`, 'important');
      previewCard.style.setProperty('border-width', `${settings.borderThickness ?? 2}px`, 'important');
      
      // Use helper to apply color (simulating color 1)
      import("../utils/dom").then(({ applyCardColorToElement }) => {
        applyCardColorToElement(previewCard, 'var(--card-color-1)', settings);
      });
      
      // Clear and re-render preview content
      previewCard.empty();
      previewCard.createDiv({ text: 'This is how yours cards will look!', cls: 'sc-content' });

      if (settings.groupTags) {
        if (settings.showTimestamps && settings.timestampBelowTags) {
          // timestamp ABOVE tags
          previewCard.createDiv({ cls: 'sc-timestamp', text: (window as any).moment ? (window as any).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        }
        const tagsEl = previewCard.createDiv({ cls: 'sc-tags' });
        ['ideas', 'project'].forEach(t => {
          tagsEl.createSpan({ cls: 'sc-tag', text: settings.omitTagHash ? t : `#${t}` });
        });
        if (settings.showTimestamps && !settings.timestampBelowTags) {
          // timestamp inline after tags
          const ts = previewCard.createDiv({ cls: 'sc-timestamp', text: (window as any).moment ? (window as any).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
          ts.style.display = 'inline-block';
          ts.style.marginLeft = '8px';
        }
      } else {
        if (settings.showTimestamps) {
          previewCard.createDiv({ cls: 'sc-timestamp', text: (window as any).moment ? (window as any).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        }
      }
    };
    updatePreview();
    
    new Setting(containerEl).setName('Card Style').setDesc('Choose card design style').addDropdown(dropdown => dropdown.addOption('1', 'Style 1 (Flat)').addOption('2', 'Style 2 (Shadow)').addOption('3', 'Style 3 (Left Accent)').setValue(String(this.plugin.settings.cardStyle || 2)).onChange(async (value) => {
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
    new Setting(containerEl).setName('Card border radius').setDesc('Set the corner rounding of the card').addSlider(slider => slider.setLimits(0, 30, 1).setValue(this.plugin.settings.borderRadius || 0).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.borderRadius = value;
      await this.plugin.saveSettings();
      document.documentElement.style.setProperty('--card-border-radius', `${value}px`);
      updatePreview();
      refreshSidebarCards();
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
      .setName('Timestamp date & time format')
      .addText(text => text.setPlaceholder('YYYY-MM-DD hh:mma').setValue(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD hh:mma').onChange(async (value) => {
        this.plugin.settings.datetimeFormat = value;
        await this.plugin.saveSettings();
        updateTimestampPreview(value);
        updatePreview();
      }));

    const updateTimestampPreview = (val: string) => {
      timestampSetting.descEl.empty();
      timestampSetting.descEl.createSpan({ text: 'Your current format: ' });
      const m = (window as any).moment;
      const span = timestampSetting.descEl.createSpan({ text: m ? m().format(val || 'ddd D') : new Date().toLocaleString() });
      span.setCssStyles({ fontWeight: 'bold', color: 'var(--color-accent)' });
    };
    updateTimestampPreview(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD hh:mma');

    new Setting(containerEl).setName('Bring timestamp above tags').setDesc('Render timestamp above grouped tags.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.timestampBelowTags).onChange(async (value) => {
      this.plugin.settings.timestampBelowTags = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));

    new Setting(containerEl).setName('Animation').setHeading();
    new Setting(containerEl).setName('Animated Cards').setDesc('Cards slide and fade.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.animatedCards).onChange(async (value) => {
      this.plugin.settings.animatedCards = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Disable card fade in').setDesc('Cards appear without fading.').addToggle(toggle => toggle.setValue(this.plugin.settings.disableCardFadeIn ?? false).onChange(async (value) => {
      this.plugin.settings.disableCardFadeIn = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Visibility').setHeading();
    new Setting(containerEl).setName('Disable Card Markdown rendering').setDesc('Show raw text only.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableCardRendering).onChange(async (value) => {
      this.plugin.settings.disableCardRendering = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Enable copy card content').setDesc('Show a copy icon on hover.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCopyCardContent).onChange(async (value) => {
      this.plugin.settings.enableCopyCardContent = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Hide card container scrollbar').setDesc('Hides the scrollbar visually.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideScrollbar).onChange(async (value) => {
      this.plugin.settings.hideScrollbar = value;
      await this.plugin.saveSettings();
      // Apply immediately to open sidebar
      try {
        const view: any = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
        if (view && typeof view.applyScrollbarSetting === 'function') view.applyScrollbarSetting();
      } catch {}
    }));
    new Setting(containerEl).setName('Hide categories topbar').setDesc('Hide the category filter button bar.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableFilterButtons).onChange(async (value) => {
      this.plugin.settings.disableFilterButtons = value;
      await this.plugin.saveSettings();
      refreshSidebarHeader();
    }));
    this.updateCSSVariables();
    updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 26);
    // Apply max card height on load
    const styleId = 'card-max-height-style';
    document.getElementById(styleId)?.remove();
    if (this.plugin.settings.maxCardHeight && this.plugin.settings.maxCardHeight > 0) {
      const s = document.createElement('style');
      s.id = styleId;
      s.textContent = `.sc-card { max-height: ${this.plugin.settings.maxCardHeight}px !important; overflow: hidden !important; }`;
      document.head.appendChild(s);
    }

    new Setting(containerEl).setName('Layout').setHeading();
    new Setting(containerEl).setName('Maximum Card Height').setDesc('Limit card height in pixels (0 = no limit)').addSlider(slider => slider.setLimits(0, 800, 10).setValue(this.plugin.settings.maxCardHeight || 0).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.maxCardHeight = Number(value) || 0;
      await this.plugin.saveSettings();
      // Apply immediately via CSS variable
      const styleId = 'card-max-height-style';
      document.getElementById(styleId)?.remove();
      if (this.plugin.settings.maxCardHeight && this.plugin.settings.maxCardHeight > 0) {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `.sc-card { max-height: ${this.plugin.settings.maxCardHeight}px !important; overflow: hidden !important; }`;
        document.head.appendChild(s);
      }
    }));
    new Setting(containerEl).setName('Bottom Space under Input/Button Row').setDesc('Padding to accommodate the status bar').addSlider(slider => slider.setLimits(0, 100, 1).setValue(this.plugin.settings.buttonPaddingBottom || 26).onChange(async (value) => {
      this.plugin.settings.buttonPaddingBottom = Number(value) || 0;
      await this.plugin.saveSettings();
      updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 0);
    }));

    new Setting(containerEl).setName('Category Management').setDesc('Configure category display and reordering.').setHeading();
    new Setting(containerEl).setName('Enable Custom Categories').setDesc('Allow custom categories in the right-click menu.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCustomCategories).onChange(async (value) => {
      this.plugin.settings.enableCustomCategories = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));


    
    const catsContainer = containerEl.createDiv({ cls: 'categories-list' });
    catsContainer.style.marginTop = '8px';

    const renderCategories = () => {
      catsContainer.empty();
      const customList = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];

      // Build the full list of all possible items
      interface CategoryItem {
        id: string;
        label: string;
        canHide: boolean;
        canRemove: boolean;
        settingKey?: 'disableTimeBasedFiltering' | 'hideArchivedFilterButton';
        isCustom?: boolean;
        data?: CustomCategory;
      }

      const builtinItems: CategoryItem[] = [
        { id: 'filter-all', label: 'All', canHide: false, canRemove: false },
        { id: 'filter-today', label: 'Today', canHide: true, canRemove: false, settingKey: 'disableTimeBasedFiltering' },
        { id: 'filter-tomorrow', label: 'Tomorrow', canHide: true, canRemove: false, settingKey: 'disableTimeBasedFiltering' },
        { id: 'filter-archived', label: 'Archived', canHide: true, canRemove: false, settingKey: 'hideArchivedFilterButton' }
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

      const saveOrder = async () => {
        const ids = Array.from(catsContainer.querySelectorAll('.setting-item[data-cat-id]'))
          .map(r => (r as HTMLElement).dataset.catId)
          .filter(Boolean) as string[];
        this.plugin.settings.allItemsOrder = ids;
        await this.plugin.saveSettings();
        refreshSidebarHeader();
      };

      let dragSrcId: string | null = null;

      const renderRow = (itemId: string) => {
        const itemInfo = allItems.find(i => i.id === itemId);
        if (!itemInfo) return;

        const isBuiltin = itemId.startsWith('filter-');
        const colorKey = isBuiltin ? itemId.replace('filter-', '') : itemId;
        
        let isVisible = true;
        if (isBuiltin) {
          const sKey = itemInfo.settingKey;
          if (sKey === 'disableTimeBasedFiltering') {
            isVisible = !this.plugin.settings.disableTimeBasedFiltering;
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
          setTimeout(() => {
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

        setting.settingEl.addEventListener('drop', async (e) => {
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
        });

        setting.infoEl.remove();

        const row = setting.controlEl;
        row.style.flex = '1';
        row.style.justifyContent = 'flex-start';

        // Drag handle
        const handle = row.createEl('div', { cls: 'drag-handle' });
        try { setIcon(handle as any, 'grip-vertical'); } catch { handle.textContent = '⋮⋮'; }
        handle.style.cursor = 'grab';
        handle.style.color = 'var(--text-muted)';
        handle.style.marginRight = '10px';

        // Eye icon (Round button)
        const eyeBtn = row.createEl('button', { cls: 'clickable-icon sc-eye' });
        eyeBtn.style.borderRadius = '50%';
        eyeBtn.style.width = '32px';
        eyeBtn.style.minWidth = '32px';
        eyeBtn.style.height = '32px';
        eyeBtn.style.display = 'flex';
        eyeBtn.style.alignItems = 'center';
        eyeBtn.style.justifyContent = 'center';
        eyeBtn.style.padding = '0';
        eyeBtn.style.border = 'none';
        eyeBtn.style.marginRight = '10px';

        const updateEye = () => {
          eyeBtn.empty();
          const iconName = isVisible ? 'eye' : 'eye-off';
          try { setIcon(eyeBtn as any, iconName); } catch { eyeBtn.textContent = isVisible ? '👁' : '🚫'; }
          eyeBtn.title = isVisible ? 'Visible' : 'Hidden';
          
          if (isVisible) {
            eyeBtn.style.color = 'var(--color-green)';
            eyeBtn.style.backgroundColor = 'rgba(var(--color-green-rgb), 0.2)';
          } else {
            eyeBtn.style.color = 'var(--color-red)';
            eyeBtn.style.backgroundColor = 'rgba(var(--color-red-rgb), 0.2)';
          }
        };

        if (itemInfo.canHide) {
          updateEye();
          eyeBtn.addEventListener('click', async () => {
            isVisible = !isVisible;
            if (isBuiltin) {
              const sKey = itemInfo.settingKey;
              if (sKey === 'disableTimeBasedFiltering') {
                this.plugin.settings.disableTimeBasedFiltering = !isVisible;
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
          });
        } else {
          isVisible = true;
          updateEye();
          eyeBtn.style.opacity = '0.5';
          eyeBtn.style.cursor = 'default';
        }

        // Text color picker
        const textColorPicker = row.createEl('input');
        textColorPicker.type = 'color';
        textColorPicker.value = this.plugin.settings.filterColors?.[colorKey]?.textColor || '#c0c3c7';
        textColorPicker.title = 'Text color';
        textColorPicker.style.width = '24px';
        textColorPicker.style.height = '24px';
        textColorPicker.style.padding = '0';
        textColorPicker.style.border = 'none';
        textColorPicker.style.borderRadius = '50%';
        textColorPicker.style.background = 'none';
        textColorPicker.style.cursor = 'pointer';
        textColorPicker.style.overflow = 'hidden';
        textColorPicker.addEventListener('input', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
          this.plugin.settings.filterColors[colorKey].textColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
          applyPreviewColors();
        });

        // BG color picker
        const bgColorPicker = row.createEl('input');
        bgColorPicker.type = 'color';
        bgColorPicker.value = this.plugin.settings.filterColors?.[colorKey]?.bgColor || '#1a1a1a';
        bgColorPicker.title = 'Background color';
        bgColorPicker.style.width = '24px';
        bgColorPicker.style.height = '24px';
        bgColorPicker.style.padding = '0';
        bgColorPicker.style.border = 'none';
        bgColorPicker.style.borderRadius = '50%';
        bgColorPicker.style.background = 'none';
        bgColorPicker.style.cursor = 'pointer';
        bgColorPicker.style.overflow = 'hidden';
        bgColorPicker.addEventListener('input', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
          this.plugin.settings.filterColors[colorKey].bgColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
          applyPreviewColors();
        });

        const previewBtn = row.createEl('button', { cls: 'sc-category-preview' });
        previewBtn.textContent = itemInfo.label;
        const applyPreviewColors = () => {
          const colors = this.plugin.settings.filterColors?.[colorKey];
          if (colors?.bgColor) previewBtn.style.setProperty('background-color', colors.bgColor, 'important');
          else previewBtn.style.removeProperty('background-color');
          if (colors?.textColor) previewBtn.style.setProperty('color', colors.textColor, 'important');
          else previewBtn.style.removeProperty('color');
        };
        applyPreviewColors();

        const nameInput = row.createEl('input');
        nameInput.type = 'text';
        nameInput.value = itemInfo.label;
        nameInput.style.width = '100%';
        nameInput.placeholder = 'Category name';
        if (isBuiltin) {
          nameInput.disabled = true;
          nameInput.style.opacity = '0.6';
        } else {
          nameInput.addEventListener('input', async (e: any) => {
            const newLabel = String(e.target.value || '').trim();
            const idx = customList.findIndex(c => c.id === itemId);
            if (idx >= 0) {
              this.plugin.settings.customCategories[idx].label = newLabel || 'New Category';
              await this.plugin.saveSettings();
              previewBtn.textContent = this.plugin.settings.customCategories[idx].label;
              refreshSidebarHeader();
            }
          });
        }

        // Reset colors button
        let resetBtn: HTMLElement;
        if (Platform.isMobile) {
          resetBtn = row.createEl('button', { cls: 'clickable-icon' });
          setIcon(resetBtn, 'rotate-ccw');
          resetBtn.title = 'reset colors';
        } else {
          resetBtn = row.createEl('button', { text: 'Reset colors' });
          resetBtn.style.padding = '2px 8px';
          resetBtn.style.fontSize = '11px';
        }
        resetBtn.addEventListener('click', async () => {
          if (this.plugin.settings.filterColors?.[colorKey]) {
            delete this.plugin.settings.filterColors[colorKey];
            await this.plugin.saveSettings();
            renderCategories();
            refreshSidebarHeader();
          }
        });

        // Delete/Remove button
        if (itemInfo.canRemove) {
          const removeBtn = row.createEl('button', { cls: 'clickable-icon' });
          setIcon(removeBtn, 'trash');
          removeBtn.setAttr('title', 'Delete category');
          removeBtn.style.padding = 'var(--size-4-1) var(--size-4-1)';
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
          const spacer = row.createEl('div');
          spacer.style.width = '32px';
        }
      };

      orderedIds.forEach(id => renderRow(id));

      // Add category button
      const addRow = catsContainer.createDiv();
      addRow.style.display = 'flex';
      addRow.style.justifyContent = 'flex-end';
      addRow.style.marginTop = '12px';
      addRow.style.marginBottom = '24px';
      const addBtn = addRow.createEl('button', { text: '+ Add Custom Category', cls: 'mod-cta' });
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.customCategories)) this.plugin.settings.customCategories = [];
        const id = 'cat-' + Date.now();
        this.plugin.settings.customCategories.push({ id, label: 'New Category', showInMenu: true });
        if (!Array.isArray(this.plugin.settings.allItemsOrder)) this.plugin.settings.allItemsOrder = [];
        this.plugin.settings.allItemsOrder.push(id);
        await this.plugin.saveSettings();
        renderCategories();
        refreshSidebarHeader();
      });
    };
    renderCategories();
    
    new Setting(containerEl)
      .setName('Open category on load')
      .setDesc('Which category opens when the sidebar loads.')
      .addDropdown(dropdown => {
        const opts: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All' }];
        if (!this.plugin.settings.disableTimeBasedFiltering) {
          opts.push({ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' });
        }
        if (!this.plugin.settings.hideArchivedFilterButton) {
          opts.push({ value: 'archived', label: 'Archived' });
        }
        (this.plugin.settings.customCategories || []).forEach(c => opts.push({ value: String(c.id || c.label || ''), label: String(c.label || c.id || '') }));
        opts.forEach(o => dropdown.addOption(o.value, o.label));
        dropdown.setValue(String(this.plugin.settings.openCategoryOnLoad || 'all'));
        dropdown.onChange(async (v) => {
          this.plugin.settings.openCategoryOnLoad = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName('Behaviour').setDesc('Configure how you interact with cards and the sidebar.').setHeading();
    new Setting(containerEl).setName('Next line key').setDesc('Choose which key combo inserts a new line inside a card (does not save)').addDropdown(dropdown => dropdown.addOption('enter', 'Enter').addOption('shift-enter', 'Shift+Enter').addOption('ctrl-enter', 'Ctrl+Enter').addOption('alt-enter', 'Alt+Enter').addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter').setValue(this.plugin.settings.nextLineKey || 'shift-enter').onChange(async (value) => {
      this.plugin.settings.nextLineKey = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Save key').setDesc('Choose which key combo saves the card (submission / commit)').addDropdown(dropdown => dropdown.addOption('enter', 'Enter').addOption('shift-enter', 'Shift+Enter').addOption('ctrl-enter', 'Ctrl+Enter').addOption('alt-enter', 'Alt+Enter').addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter').setValue(this.plugin.settings.saveKey || 'enter').onChange(async (value) => {
      this.plugin.settings.saveKey = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Auto-open sidebar').setDesc('Automatically open the sidebar when Obsidian starts').addToggle(toggle => toggle.setValue(!!this.plugin.settings.autoOpen).onChange(async (value) => {
      this.plugin.settings.autoOpen = value;
      await this.plugin.saveSettings();
    }));

    new Setting(containerEl).setName('Automation').setDesc('Settings for automated card handling.').setHeading();
    new Setting(containerEl).setName('Auto-archive on expiry').setDesc('Automatically archive cards when expiry time passes').addToggle(toggle => toggle.setValue(!!this.plugin.settings.autoArchiveOnExpiry).onChange(async (value) => {
      this.plugin.settings.autoArchiveOnExpiry = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Auto Color').setDesc('Cards can inherit a color based on text or tags. Choose rules below; names are used when card-color frontmatter is absent.').setHeading();
    const rulesContainer = containerEl.createDiv();
    const renderRules = () => {
      rulesContainer.empty();
      const rules = Array.isArray(this.plugin.settings.autoColorRules) ? this.plugin.settings.autoColorRules : [];
      let ruleDragSrcId: string | null = null;
      
      rules.forEach((r, idx) => {
        const setting = new Setting(rulesContainer)
          .addExtraButton(btn => {
            btn.setIcon('grip-vertical').setTooltip('Drag to reorder');
            btn.extraSettingsEl.style.cursor = 'grab';
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
            dropdown.selectEl.style.color = 'var(--text-normal)';
          })
          .addText(text => {
            text
              .setPlaceholder('match')
              .setValue(r.match || '')
              .onChange(async (value) => {
                this.plugin.settings.autoColorRules![idx].match = value;
                await this.plugin.saveSettings();
              });
            text.inputEl.style.width = '100%';
            text.inputEl.style.maxWidth = 'none';
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
            dropdown.selectEl.style.color = 'var(--text-normal)';
            Array.from(dropdown.selectEl.options).forEach(opt => opt.style.color = 'var(--text-normal)');
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
        setting.controlEl.style.flex = '1';
        setting.controlEl.style.justifyContent = 'flex-start';

        // Add drag events for Auto Color
        setting.settingEl.setAttr('draggable', 'true');
        setting.settingEl.addEventListener('dragstart', (e) => {
          ruleDragSrcId = `rule-${idx}`;
          e.dataTransfer?.setData('text/plain', ruleDragSrcId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => setting.settingEl.addClass('sc-dragging'), 0);
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
        setting.settingEl.addEventListener('drop', async (e) => {
          e.preventDefault();
          if (!ruleDragSrcId || !ruleDragSrcId.startsWith('rule-')) return;
          const srcIdx = parseInt(ruleDragSrcId.replace('rule-', ''));
          if (srcIdx === idx) return;

          const rules = this.plugin.settings.autoColorRules || [];
          const [moved] = rules.splice(srcIdx, 1);
          rules.splice(idx, 0, moved);
          await this.plugin.saveSettings();
          renderRules();
        });
      });

      const addBtnContainer = rulesContainer.createDiv();
      addBtnContainer.style.display = 'flex';
      addBtnContainer.style.justifyContent = 'flex-end';
      addBtnContainer.style.marginTop = '12px';
      addBtnContainer.style.marginBottom = '24px';
      const addBtn = addBtnContainer.createEl('button', { text: 'Add Auto Color Rule', cls: 'mod-cta' });
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.autoColorRules)) this.plugin.settings.autoColorRules = [];
        this.plugin.settings.autoColorRules.push({ type: 'text', match: '', colorIndex: 1 });
        await this.plugin.saveSettings();
        renderRules();
      });
    };
    renderRules();

    new Setting(containerEl).setName('Status').setDesc('Dropdown colors take precedence over custom unless the dropdown is set to custom.').setHeading();
    const statusSection = containerEl.createDiv();
    new Setting(statusSection).setName('Enable Card Status').setDesc('Drag to reorder status pills and set their sorting priority.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCardStatus).onChange(async (value) => {
      this.plugin.settings.enableCardStatus = value;
      await this.plugin.saveSettings();
      renderStatusConfig();
    }));
    new Setting(statusSection).setName('Inherit status color').setDesc('When enabled, card color uses the status color').addToggle(toggle => toggle.setValue(!!this.plugin.settings.inheritStatusColor).onChange(async (value) => {
      this.plugin.settings.inheritStatusColor = value;
      await this.plugin.saveSettings();
    }));
    new Setting(statusSection).setName('Status pill opacity').setDesc('Controls the background opacity of status pills').addSlider(sl => sl.setLimits(0, 1, 0.05).setValue(typeof this.plugin.settings.statusPillOpacity !== 'undefined' ? this.plugin.settings.statusPillOpacity : 1).onChange(async (v) => {
      this.plugin.settings.statusPillOpacity = v;
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
            btn.extraSettingsEl.style.cursor = 'grab';
          })
          .addText(text => {
            text
              .setValue(s.name || '')
              .onChange(async (value) => {
                this.plugin.settings.cardStatuses![idx].name = value;
                await this.plugin.saveSettings();
              });
            text.inputEl.style.width = '100%';
            text.inputEl.style.maxWidth = 'none';
          });
        setting.infoEl.remove();

        const colorPickerContainer = createDiv();
        const colorPicker = new Setting(colorPickerContainer);
        const textColorPicker = new Setting(colorPickerContainer);

        const updatePickersVisibility = (val: string) => {
          if (val === 'custom') {
            setting.controlEl.appendChild(colorPicker.controlEl);
            setting.controlEl.appendChild(textColorPicker.controlEl);
            colorPicker.controlEl.style.display = 'flex';
            textColorPicker.controlEl.style.display = 'flex';
          } else {
            colorPicker.controlEl.style.display = 'none';
            textColorPicker.controlEl.style.display = 'none';
          }
        };

        colorPicker.addColorPicker(cp => cp
          .setValue(s.color || '#20bf6b')
          .onChange(async (value) => {
            this.plugin.settings.cardStatuses![idx].color = value;
            await this.plugin.saveSettings();
          }));
        colorPicker.controlEl.style.padding = '0';
        colorPicker.infoEl.remove();

        textColorPicker.addColorPicker(cp => cp
          .setValue(s.textColor || '#000000')
          .onChange(async (value) => {
            this.plugin.settings.cardStatuses![idx].textColor = value;
            await this.plugin.saveSettings();
          }));
        textColorPicker.controlEl.style.padding = '0';
        textColorPicker.infoEl.remove();

        setting.addDropdown(dropdown => {
          dropdown.addOption('custom', 'custom');
          for (let i = 1; i <= 10; i++) {
            const colorName = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[i - 1]) || `Color ${i}`;
            dropdown.addOption(String(i), colorName);
          }

          // Determine current value
          let currentVal = 'custom';
          for (let i = 1; i <= 10; i++) {
            const colorKey = `color${i}` as keyof SideCardsSettings;
            if (this.plugin.settings[colorKey] === s.color) {
              currentVal = String(i);
              break;
            }
          }
          dropdown.setValue(currentVal);

          const applyDropdownColors = (val: string) => {
            if (val === 'custom') {
              dropdown.selectEl.style.backgroundColor = 'var(--background-modifier-form-field)';
              dropdown.selectEl.style.color = 'var(--text-normal)';
            } else {
              const colorKey = `color${val}` as keyof SideCardsSettings;
              const color = this.plugin.settings[colorKey] as string;
              dropdown.selectEl.style.backgroundColor = color;
              dropdown.selectEl.style.color = this.getContrastColor(color);
            }
            Array.from(dropdown.selectEl.options).forEach(opt => {
              if (opt.value === 'custom') {
                opt.style.backgroundColor = 'var(--background-modifier-form-field)';
                opt.style.color = 'var(--text-normal)';
              } else {
                const cKey = `color${opt.value}` as keyof SideCardsSettings;
                const c = this.plugin.settings[cKey] as string;
                opt.style.backgroundColor = c;
                opt.style.color = 'var(--text-normal)'; // Per user request: var(--text-normal) for options
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
            }
            await this.plugin.saveSettings();
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

        setting.controlEl.style.flex = '1';
        setting.controlEl.style.justifyContent = 'flex-start';

        // Add drag events for Status
        setting.settingEl.setAttr('draggable', 'true');
        setting.settingEl.addEventListener('dragstart', (e) => {
          statusDragSrcId = `status-${idx}`;
          e.dataTransfer?.setData('text/plain', statusDragSrcId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => setting.settingEl.addClass('sc-dragging'), 0);
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
        setting.settingEl.addEventListener('drop', async (e) => {
          e.preventDefault();
          if (!statusDragSrcId || !statusDragSrcId.startsWith('status-')) return;
          const srcIdx = parseInt(statusDragSrcId.replace('status-', ''));
          if (srcIdx === idx) return;

          const statuses = this.plugin.settings.cardStatuses || [];
          const [moved] = statuses.splice(srcIdx, 1);
          statuses.splice(idx, 0, moved);
          await this.plugin.saveSettings();
          renderStatusConfig();
        });
      });

      const addBtnContainer = statusConfigContainer.createDiv();
      addBtnContainer.style.display = 'flex';
      addBtnContainer.style.justifyContent = 'flex-end';
      addBtnContainer.style.marginTop = '12px';
      addBtnContainer.style.marginBottom = '24px';
      const addBtn = addBtnContainer.createEl('button', { text: 'Add Status', cls: 'mod-cta' });
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.cardStatuses)) this.plugin.settings.cardStatuses = [];
        this.plugin.settings.cardStatuses.push({ name: 'focus', color: '#20bf6b', textColor: '#000000' });
        await this.plugin.saveSettings();
        renderStatusConfig();
      });
    };
    renderStatusConfig();

    new Setting(containerEl).setName('Homepage').setDesc('Configure the Sidecards homepage tab.').setHeading();

    const refreshHomepage = () => this.plugin.refreshHomepageViews();

    new Setting(containerEl)
      .setName('Replace default tab with homepage')
      .setDesc('Open the Sidecards homepage instead of the default new tab.')
      .addToggle(toggle => toggle.setValue(!!this.plugin.settings.replaceHomepageWithSidecards).onChange(async (value) => {
        this.plugin.settings.replaceHomepageWithSidecards = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Replace "SideCards" name')
      .setDesc('Title shown in the homepage.')
      .addText(text => {
        text.setPlaceholder('SideCards')
          .setValue(this.plugin.settings.homepageName || 'SideCards')
          .onChange(async (value) => {
            this.plugin.settings.homepageName = value || 'SideCards';
            await this.plugin.saveSettings();
            refreshHomepage();
          });
        text.inputEl.style.width = '100%';
      })
      .addExtraButton(btn => {
        btn.setIcon('rotate-ccw').setTooltip('Reset to default').onClick(async () => {
          this.plugin.settings.homepageName = 'SideCards';
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
      .addToggle(toggle => toggle.setValue(this.plugin.settings.showPinnedNotes !== false).onChange(async (value) => {
        this.plugin.settings.showPinnedNotes = value;
        await this.plugin.saveSettings();
        refreshHomepage();
      }));

    new Setting(containerEl)
      .setName('Show recent notes')
      .setDesc('Show recently opened notes in the homepage notes column.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.showRecentNotes !== false).onChange(async (value) => {
        this.plugin.settings.showRecentNotes = value;
        await this.plugin.saveSettings();
        refreshHomepage();
      }));

    new Setting(containerEl)
      .setName('Notes column placement')
      .setDesc('Place the pinned/recent notes column on the left or right.')
      .addDropdown(dd => dd
        .addOption('left', 'Left')
        .addOption('right', 'Right')
        .setValue(this.plugin.settings.notesPlacement || 'left')
        .onChange(async (value) => {
          this.plugin.settings.notesPlacement = value as 'left' | 'right';
          await this.plugin.saveSettings();
          refreshHomepage();
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
    confirmBtn.addEventListener('click', async () => { this.close(); await this.onConfirm(); });
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

    const title = header.createEl('h2', { text: 'SideCards' });
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

      rels.forEach(async (rel) => {
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
      });
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
    this.suggestEl.className = 'suggestion-container';
    this.suggestEl.style.display = 'none';
    this.suggestEl.style.position = 'absolute';
    this.suggestEl.style.zIndex = '1000';
    this.suggestEl.style.left = '0';
    this.suggestEl.style.width = '100%';
    this.suggestEl.style.backgroundColor = 'var(--background-primary)';
    this.suggestEl.style.border = '1px solid var(--background-modifier-border)';
    this.suggestEl.style.borderRadius = '4px';
    this.suggestEl.style.maxHeight = '200px';
    this.suggestEl.style.overflowY = 'auto';
    this.inputEl.parentElement?.appendChild(this.suggestEl);
    this.inputEl.addEventListener('click', () => this.onFocus());
    this.inputEl.addEventListener('input', () => this.onInput());
    document.addEventListener('click', (event) => this.onClick(event));
  }

  private onFocus(): void {
    const foldersSet = new Set<string>(['/']);
    const root: any = (this.app.vault as any).getRoot && (this.app.vault as any).getRoot();
    const walk = (node: any) => {
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
      this.app.vault.getAllLoadedFiles().forEach((file: any) => {
        if (file && file.parent) foldersSet.add(file.parent.path);
      });
    } catch {}
    this.folders = Array.from(foldersSet).sort();
    this.updateSuggestions();
    this.suggestEl.style.display = 'block';
  }

  private onInput(): void {
    this.updateSuggestions();
  }

  private onClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.inputEl.contains(target) && !this.suggestEl.contains(target)) {
      this.suggestEl.style.display = 'none';
    }
  }

  private updateSuggestions(): void {
    const inputValue = this.inputEl.value.toLowerCase();
    this.suggestEl.innerHTML = '';
    const filtered = this.folders.filter(folder => folder.toLowerCase().includes(inputValue)).slice(0, 100);
    filtered.forEach(folder => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.textContent = folder;
      item.style.padding = '6px 10px';
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        this.inputEl.value = folder;
        this.inputEl.dispatchEvent(new Event('input'));
        this.suggestEl.style.display = 'none';
      });
      this.suggestEl.appendChild(item);
    });
  }
}
