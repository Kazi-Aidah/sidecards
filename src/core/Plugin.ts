
import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf, setIcon, Notice, TFile } from "obsidian";
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
      callback: () => new QuickCardWithFilterModal(this.app, this, this.store).open()
    });

    this.addCommand({
      id: 'search-cards',
      name: 'Search Cards',
      callback: () => new SearchModal(this.app, this, this.store).open()
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
      
      const tagsEl = previewCard.createDiv({ cls: 'sc-tags' });
      ['ideas', 'project'].forEach(t => {
        const tag = tagsEl.createSpan({ cls: 'sc-tag', text: settings.omitTagHash ? t : `#${t}` });
      });
      
      if (settings.showTimestamps) {
        const ts = previewCard.createDiv({ cls: 'sc-timestamp', text: (window as any).moment ? (window as any).moment().format(settings.datetimeFormat || 'ddd D') : 'Today 12:00' });
        if (settings.groupTags && settings.timestampBelowTags) {
          ts.style.display = 'block';
          ts.style.marginTop = '4px';
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
      span.setCssStyles({
        fontWeight: 'bold',
        color: 'var(--color-accent)'
      });
    };
    updateTimestampPreview(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD hh:mma');
    
    new Setting(containerEl).setName('Bring timestamp below tags').setDesc('Render timestamp below grouped tags.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.timestampBelowTags).onChange(async (value) => {
      this.plugin.settings.timestampBelowTags = value;
      await this.plugin.saveSettings();
      updatePreview();
    }));

    new Setting(containerEl).setName('Categories').setDesc('Configure category display and reordering.').setHeading();
    new Setting(containerEl).setName('Enable Custom Categories').setDesc('Allow custom categories in the right-click menu.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCustomCategories).onChange(async (value) => {
      this.plugin.settings.enableCustomCategories = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    new Setting(containerEl).setName('Disable time-based categories').setDesc('Hide Today/Tomorrow from the topbar.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableTimeBasedFiltering).onChange(async (value) => {
      this.plugin.settings.disableTimeBasedFiltering = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    new Setting(containerEl).setName('Disable archived category').setDesc('Hide Archived from the topbar.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideArchivedFilterButton).onChange(async (value) => {
      this.plugin.settings.hideArchivedFilterButton = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    
    new Setting(containerEl).setName('Category order').setDesc('Drag to reorder. Colors apply to topbar buttons.').setHeading();
    
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
        const ids = Array.from(catsContainer.querySelectorAll('.category-row[data-cat-id]'))
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

        const row = catsContainer.createDiv({ cls: 'category-row' });
        row.dataset.catId = itemId;
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.padding = '8px';
        row.style.marginBottom = '6px';
        row.style.backgroundColor = 'var(--background-secondary)';
        row.style.borderRadius = '6px';
        row.style.border = '1px solid var(--background-modifier-border)';
        row.draggable = true;

        // Drag events
        row.addEventListener('dragstart', (e) => {
          dragSrcId = itemId;
          row.style.opacity = '0.5';
          e.dataTransfer?.setData('text/plain', itemId);
        });
        row.addEventListener('dragend', () => {
          row.style.opacity = '1';
          dragSrcId = null;
          saveOrder();
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (dragSrcId && dragSrcId !== itemId) {
            const rows = Array.from(catsContainer.querySelectorAll('.category-row[data-cat-id]'));
            const srcRow = rows.find(r => (r as HTMLElement).dataset.catId === dragSrcId);
            if (srcRow) {
              const rect = row.getBoundingClientRect();
              const midpoint = rect.top + rect.height / 2;
              if (e.clientY < midpoint) {
                catsContainer.insertBefore(srcRow, row);
              } else {
                catsContainer.insertBefore(srcRow, row.nextSibling);
              }
            }
          }
        });

        // Drag handle
        const handle = row.createEl('div', { cls: 'drag-handle' });
        try { setIcon(handle as any, 'grip-vertical'); } catch { handle.textContent = '⋮⋮'; }
        handle.style.cursor = 'grab';
        handle.style.color = 'var(--text-muted)';

        // Text color picker
        const textColorPicker = row.createEl('input');
        textColorPicker.type = 'color';
        textColorPicker.value = this.plugin.settings.filterColors?.[colorKey]?.textColor || '#c0c3c7';
        textColorPicker.title = 'Text color';
        textColorPicker.style.width = '24px';
        textColorPicker.style.height = '24px';
        textColorPicker.style.padding = '0';
        textColorPicker.style.border = 'none';
        textColorPicker.style.background = 'none';
        textColorPicker.style.cursor = 'pointer';
        textColorPicker.addEventListener('change', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
          this.plugin.settings.filterColors[colorKey].textColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
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
        bgColorPicker.style.background = 'none';
        bgColorPicker.style.cursor = 'pointer';
        bgColorPicker.addEventListener('change', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[colorKey]) this.plugin.settings.filterColors[colorKey] = {};
          this.plugin.settings.filterColors[colorKey].bgColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
        });

        // Reset button
        const resetBtn = row.createEl('button', { text: 'Reset' });
        resetBtn.style.padding = '2px 8px';
        resetBtn.style.fontSize = '11px';
        resetBtn.addEventListener('click', async () => {
          if (this.plugin.settings.filterColors?.[colorKey]) {
            delete this.plugin.settings.filterColors[colorKey];
            await this.plugin.saveSettings();
            renderCategories();
            refreshSidebarHeader();
          }
        });

        // Label / Input
        if (isBuiltin) {
          const label = row.createEl('span', { text: itemInfo.label });
          label.style.flex = '1';
          label.style.fontWeight = '500';
        } else {
          const input = row.createEl('input', { type: 'text' });
          input.value = itemInfo.label;
          input.style.flex = '1';
          input.style.background = 'transparent';
          input.style.border = 'none';
          input.style.borderBottom = '1px solid var(--background-modifier-border)';
          input.addEventListener('change', async (e: any) => {
            const idx = customList.findIndex(c => c.id === itemId);
            if (idx >= 0) {
              this.plugin.settings.customCategories[idx].label = e.target.value;
              await this.plugin.saveSettings();
              refreshSidebarHeader();
            }
          });
        }

        // Eye icon
        if (itemInfo.canHide) {
          const eyeBtn = row.createEl('button', { cls: 'clickable-icon' });
          eyeBtn.style.padding = '4px';
          const updateEye = () => {
            eyeBtn.empty();
            try { setIcon(eyeBtn as any, isVisible ? 'eye' : 'eye-off'); } catch { eyeBtn.textContent = isVisible ? '👁' : '🚫'; }
            eyeBtn.title = isVisible ? 'Visible' : 'Hidden';
          };
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
          });
        } else {
          // Spacer for consistency
          const spacer = row.createEl('div');
          spacer.style.width = '32px';
        }

        // Remove button
        if (itemInfo.canRemove) {
          const removeBtn = row.createEl('button', { cls: 'clickable-icon mod-warning' });
          removeBtn.style.padding = '4px';
          try { setIcon(removeBtn as any, 'trash'); } catch { removeBtn.textContent = '×'; }
          removeBtn.addEventListener('click', async () => {
            const idx = customList.findIndex(c => c.id === itemId);
            if (idx >= 0) {
              this.plugin.settings.customCategories.splice(idx, 1);
              this.plugin.settings.allItemsOrder = (this.plugin.settings.allItemsOrder || []).filter(id => id !== itemId);
              await this.plugin.saveSettings();
              renderCategories();
              refreshSidebarHeader();
            }
          });
        } else {
          // Spacer
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
      rules.forEach((r, idx) => {
        const row = rulesContainer.createDiv();
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        const typeSel = row.createEl('select');
        ['text', 'tag'].forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; typeSel.appendChild(opt); });
        typeSel.value = String(r.type || 'text');
        typeSel.addEventListener('change', async (e: any) => { this.plugin.settings.autoColorRules![idx].type = e.target.value; await this.plugin.saveSettings(); });
        const matchInput = row.createEl('input');
        matchInput.type = 'text';
        matchInput.placeholder = 'match';
        matchInput.value = r.match || '';
        matchInput.style.flex = '1';
        matchInput.addEventListener('input', async (e: any) => { this.plugin.settings.autoColorRules![idx].match = e.target.value; await this.plugin.saveSettings(); });
        const colorSel = row.createEl('select');
        for (let i = 1; i <= 10; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const names = this.plugin.settings.colorNames || [];
          const label = names[i - 1] ? String(names[i - 1]) : `Color ${i}`;
          opt.textContent = label;
          colorSel.appendChild(opt);
        }
        colorSel.value = String(r.colorIndex || 1);
        colorSel.addEventListener('change', async (e: any) => { this.plugin.settings.autoColorRules![idx].colorIndex = Number(e.target.value); await this.plugin.saveSettings(); });
        const delBtn = row.createEl('button', { text: 'Remove' });
        delBtn.addEventListener('click', async () => { this.plugin.settings.autoColorRules!.splice(idx, 1); await this.plugin.saveSettings(); renderRules(); });
      });
      const addRow = rulesContainer.createDiv();
      addRow.style.display = 'flex';
      addRow.style.justifyContent = 'flex-end';
      const addBtn = addRow.createEl('button', { text: 'Add Auto Color Rule' });
      addBtn.addClass('mod-cta');
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.autoColorRules)) this.plugin.settings.autoColorRules = [];
        this.plugin.settings.autoColorRules.push({ type: 'text', match: '', colorIndex: 1 });
        await this.plugin.saveSettings();
        renderRules();
      });
    };
    renderRules();

    new Setting(containerEl).setName('Status').setDesc('Dropdown colors take precedence over custom unless the dropdown is set to [custom].').setHeading();
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
      list.forEach((s, idx) => {
        const row = statusConfigContainer.createDiv();
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.margin = '4px 0';
        const handle = row.createEl('span', { text: '≡' });
        handle.style.cursor = 'grab';
        const nameInput = row.createEl('input'); nameInput.type = 'text'; nameInput.value = s.name || ''; nameInput.style.flex = '1';
        nameInput.addEventListener('input', async (e: any) => { this.plugin.settings.cardStatuses![idx].name = e.target.value; await this.plugin.saveSettings(); });
        const textColorInput = row.createEl('input'); textColorInput.type = 'color'; textColorInput.value = s.textColor || '#000000';
        textColorInput.addEventListener('change', async (e: any) => { this.plugin.settings.cardStatuses![idx].textColor = e.target.value; await this.plugin.saveSettings(); });
        const colorInput = row.createEl('input'); colorInput.type = 'color'; colorInput.value = s.color || '#20bf6b';
        colorInput.addEventListener('change', async (e: any) => { this.plugin.settings.cardStatuses![idx].color = e.target.value; await this.plugin.saveSettings(); });
        const presetSel = row.createEl('select');
        { const opt = document.createElement('option'); opt.value = 'custom'; opt.textContent = '[custom]'; presetSel.appendChild(opt); }
        for (let i = 1; i <= 10; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const names = this.plugin.settings.colorNames || [];
          opt.textContent = names[i - 1] ? String(names[i - 1]) : `Color ${i}`;
          presetSel.appendChild(opt);
        }
        presetSel.value = 'custom';
        presetSel.addEventListener('change', async (e: any) => {
          if (String(e.target.value) !== 'custom') {
            const idxSel = Number(e.target.value);
            const key = `color${idxSel}` as keyof SideCardsSettings;
            const hex = (this.plugin.settings[key] as string) || '#20bf6b';
            this.plugin.settings.cardStatuses![idx].color = hex;
          }
          await this.plugin.saveSettings();
        });
        const delBtn = row.createEl('button', { text: 'Remove' });
        delBtn.addEventListener('click', async () => { this.plugin.settings.cardStatuses!.splice(idx, 1); await this.plugin.saveSettings(); renderStatusConfig(); });
      });
      const addRow = statusConfigContainer.createDiv();
      addRow.style.display = 'flex';
      addRow.style.justifyContent = 'flex-end';
      const addBtn = addRow.createEl('button', { text: 'Add Status' });
      addBtn.addClass('mod-cta');
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.cardStatuses)) this.plugin.settings.cardStatuses = [];
        this.plugin.settings.cardStatuses.push({ name: 'focus', color: '#20bf6b', textColor: '#000000' });
        await this.plugin.saveSettings();
        renderStatusConfig();
      });
    };
    renderStatusConfig();
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
