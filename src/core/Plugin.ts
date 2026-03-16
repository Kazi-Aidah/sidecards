
import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import { CardSidebarView } from "../views/CardSidebarView";
import { CardStore } from "../services/CardStore";
import { FilterService } from "../services/FilterService";
import { SortService } from "../services/SortService";
import { EventBus } from "./EventBus";
import { SideCardsSettings, DEFAULT_SETTINGS } from "./Settings";

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

    this.eventBus = new EventBus();
    this.filterService = new FilterService();
    this.sortService = new SortService(this.settings);
    this.store = new CardStore(this.app, this, this.eventBus, this.settings);

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
        this.store
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
    containerEl.addClass('card-sidebar-settings');
    const updateCardRadius = (radius: number) => {
      const styleEl = document.createElement('style');
      styleEl.id = 'card-border-radius';
      styleEl.textContent = `.card-sidebar-card { border-radius: ${radius}px !important; }`;
      document.getElementById('card-border-radius')?.remove();
      document.head.appendChild(styleEl);
    };
    const updateButtonPadding = (paddingPx: number) => {
      const styleEl = document.createElement('style');
      styleEl.id = 'card-button-padding';
      styleEl.textContent = `.card-sidebar-button-container { padding-bottom: ${paddingPx}px !important; }`;
      document.getElementById('card-button-padding')?.remove();
      document.head.appendChild(styleEl);
    };
    const refreshSidebarHeader = () => {
      try {
        const view: any = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
        if (!view) return;
        const main = view.containerEl.querySelector('.card-sidebar-main');
        const old = main?.querySelector('.card-sidebar-header');
        if (old) old.remove();
        if (main && typeof view.createHeader === 'function') view.createHeader(main);
        try { if (typeof view.applyFilters === 'function') view.applyFilters(); } catch {}
      } catch {}
    };

    new Setting(containerEl).setName('Storage Folder').setHeading();
    new Setting(containerEl)
      .setName('Storage folder')
      .setDesc('Choose where to save notes created from cards')
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

    new Setting(containerEl).setName('Colors').setDesc('Customize card colors used for tagging.').setHeading();
    new Setting(containerEl)
      .setName('Two-row color swatches in menu')
      .setDesc('Display colors in menu as 5 per row.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.twoRowSwatches)
        .onChange(async (value) => {
          this.plugin.settings.twoRowSwatches = value;
          await this.plugin.saveSettings();
          this.display();
        }));
    
    const colorVars: Array<{ name: string; key: keyof SideCardsSettings; default: string }> = [
      { name: 'Color 1', key: 'color1', default: '#8392a4' }, { name: 'Color 2', key: 'color2', default: '#eb3b5a' },
      { name: 'Color 3', key: 'color3', default: '#fa8231' }, { name: 'Color 4', key: 'color4', default: '#e5a216' },
      { name: 'Color 5', key: 'color5', default: '#20bf6b' }, { name: 'Color 6', key: 'color6', default: '#2d98da' },
      { name: 'Color 7', key: 'color7', default: '#8854d0' }, { name: 'Color 8', key: 'color8', default: '#e832c1' },
      { name: 'Color 9', key: 'color9', default: '#e83289' }, { name: 'Color 10', key: 'color10', default: '#965b3b' }
    ];
    
    if (this.plugin.settings.twoRowSwatches) {
      // Display in 2 rows (5 colors per row)
      const rows = [colorVars.slice(0, 5), colorVars.slice(5, 10)];
      rows.forEach((rowColors, rowIdx) => {
        const rowContainer = containerEl.createDiv({ cls: 'color-row-container' });
        rowContainer.style.display = 'flex';
        rowContainer.style.gap = '12px';
        rowContainer.style.marginBottom = '12px';
        rowContainer.style.flexWrap = 'wrap';
        rowContainer.style.alignItems = 'flex-end';
        
        rowColors.forEach((color, colIdx) => {
          const idx = rowIdx * 5 + colIdx;
          const itemContainer = rowContainer.createDiv({ cls: 'color-item' });
          itemContainer.style.display = 'flex';
          itemContainer.style.flexDirection = 'column';
          itemContainer.style.gap = '4px';
          itemContainer.style.flex = '1';
          itemContainer.style.minWidth = '80px';
          
          const nameLabel = itemContainer.createEl('label', { text: color.name });
          nameLabel.style.fontSize = '12px';
          nameLabel.style.fontWeight = 'bold';
          
          const inputContainer = itemContainer.createDiv();
          inputContainer.style.display = 'flex';
          inputContainer.style.gap = '4px';
          
          const txtInput = inputContainer.createEl('input');
          txtInput.type = 'text';
          txtInput.placeholder = 'e.g. red';
          txtInput.value = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[idx]) || '';
          txtInput.style.flex = '1';
          txtInput.style.fontSize = '12px';
          txtInput.addEventListener('change', async (v: any) => {
            if (!this.plugin.settings.colorNames) this.plugin.settings.colorNames = [];
            this.plugin.settings.colorNames[idx] = v.target.value || '';
            await this.plugin.saveSettings();
          });
          
          const colorPicker = inputContainer.createEl('input');
          colorPicker.type = 'color';
          colorPicker.value = (this.plugin.settings[color.key] as string) || color.default;
          colorPicker.style.cursor = 'pointer';
          colorPicker.style.width = '40px';
          colorPicker.style.height = '32px';
          colorPicker.style.border = 'none';
          colorPicker.style.borderRadius = '4px';
          colorPicker.addEventListener('change', async (e: any) => {
            (this.plugin.settings as any)[color.key] = e.target.value;
            await this.plugin.saveSettings();
            this.updateCSSVariables();
          });
        });
      });
    } else {
      // Display as individual settings (original style)
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
          }));
      });
    }

    new Setting(containerEl).setName('Appearance').setDesc('Customize how cards and the sidebar look.').setHeading();
    
    // Card preview
    const previewContainer = containerEl.createDiv({ cls: 'card-preview' });
    previewContainer.style.marginBottom = '16px';
    previewContainer.style.padding = '12px';
    previewContainer.style.borderRadius = '6px';
    previewContainer.style.backgroundColor = 'var(--background-secondary)';
    previewContainer.style.border = '1px solid var(--background-modifier-border)';
    previewContainer.style.fontSize = '13px';
    previewContainer.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: var(--text-normal);">Card Preview</div>
      <div class="card-sidebar-card" style="padding: 12px; margin: 0; opacity: 0.9;">
        <div style="color: var(--text-normal); margin-bottom: 4px;">Sample card content here</div>
        <div style="font-size: 12px; color: var(--text-muted);">Tag1 Tag2</div>
      </div>
    `;
    
    new Setting(containerEl).setName('Card Styling').setHeading();
    const styleSetting = new Setting(containerEl)
      .setName('Card Style')
      .setDesc('Choose the visual style applied to cards')
      .addDropdown(drop => {
        drop.addOption('1', 'Style 1 (Full border)').addOption('2', 'Style 2 (Full border + Shadow)').addOption('3', 'Style 3 (left accent)');
        drop.setValue(String(this.plugin.settings.cardStyle || 2));
        drop.onChange(async (val) => {
          this.plugin.settings.cardStyle = Number(val);
          await this.plugin.saveSettings();
          this.updateCSSVariables();
        });
      });
    const opacityContainer = containerEl.createDiv();
    opacityContainer.style.display = '';
    new Setting(opacityContainer)
      .setName('Card background opacity')
      .setDesc('Tint opacity for Style 1/3 (0 = transparent)')
      .addSlider(slider => slider.setLimits(0, 1, 0.01).setValue(this.plugin.settings.cardBgOpacity ?? 0.08).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.cardBgOpacity = Number(value);
        await this.plugin.saveSettings();
      }));
    const borderThicknessContainer = containerEl.createDiv();
    new Setting(borderThicknessContainer)
      .setName('Card border thickness')
      .setDesc('Border width in pixels for Style 1 & 2')
      .addSlider(slider => slider.setLimits(0, 8, 1).setValue(this.plugin.settings.borderThickness ?? 2).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.borderThickness = Number(value);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName('Card Border Radius')
      .setDesc('Roundness of card corners in pixels')
      .addSlider(slider => slider.setLimits(0, 16, 1).setValue(this.plugin.settings.borderRadius || 6).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.borderRadius = value;
        await this.plugin.saveSettings();
        updateCardRadius(value);
      }));

    new Setting(containerEl).setName('Animation').setHeading();
    new Setting(containerEl).setName('Animated Cards').setDesc('Cards will slide and fade when switching categories.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.animatedCards).onChange(async (value) => {
      this.plugin.settings.animatedCards = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Disable card fade in').setDesc('Turn off opacity fade animation on load or category switch.').addToggle(toggle => toggle.setValue(this.plugin.settings.disableCardFadeIn ?? false).onChange(async (value) => {
      this.plugin.settings.disableCardFadeIn = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Visibility').setHeading();
    new Setting(containerEl).setName('Disable card markdown rendering').setDesc('Show raw text without formatting.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableCardRendering).onChange(async (value) => {
      this.plugin.settings.disableCardRendering = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Enable copy card content').setDesc('Show copy icon on hover.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCopyCardContent).onChange(async (value) => {
      this.plugin.settings.enableCopyCardContent = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Hide card container scrollbar').setDesc('Hide scrollbar (scrolling still works).').addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideScrollbar).onChange(async (value) => {
      this.plugin.settings.hideScrollbar = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Hide Categories Topbar').setDesc('Hide the category button bar.').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableFilterButtons).onChange(async (value) => {
      this.plugin.settings.disableFilterButtons = value;
      await this.plugin.saveSettings();
      refreshSidebarHeader();
    }));
    this.updateCSSVariables();
    updateCardRadius(this.plugin.settings.borderRadius || 6);
    updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 26);

    new Setting(containerEl).setName('Layout').setHeading();
    new Setting(containerEl).setName('Maximum Card Height').setDesc('Limit height in pixels (0 = no limit)').addSlider(slider => slider.setLimits(0, 800, 10).setValue(this.plugin.settings.maxCardHeight || 0).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.maxCardHeight = Number(value) || 0;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Bottom Space under Input/Button Row').setDesc('Padding to accommodate the status bar').addSlider(slider => slider.setLimits(0, 100, 1).setValue(this.plugin.settings.buttonPaddingBottom || 26).onChange(async (value) => {
      this.plugin.settings.buttonPaddingBottom = Number(value) || 0;
      await this.plugin.saveSettings();
      updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 0);
    }));
    new Setting(containerEl).setName('Group tags under content').setDesc('Place tags below card content').addToggle(toggle => toggle.setValue(!!this.plugin.settings.groupTags).onChange(async (value) => {
      this.plugin.settings.groupTags = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Omit # prefix for tags').setDesc('Display tags without the leading #').addToggle(toggle => toggle.setValue(this.plugin.settings.omitTagHash ?? true).onChange(async (value) => {
      this.plugin.settings.omitTagHash = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName('Show Timestamps').setDesc('Show creation timestamps on cards').addToggle(toggle => toggle.setValue(!!this.plugin.settings.showTimestamps).onChange(async (value) => {
      this.plugin.settings.showTimestamps = value;
      await this.plugin.saveSettings();
    }));
    
    const timestampSetting = new Setting(containerEl)
      .setName('Timestamp date & time format')
      .addText(text => text.setPlaceholder('YYYY-MM-DD HH:mm').setValue(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD HH:mm').onChange(async (value) => {
        this.plugin.settings.datetimeFormat = value;
        await this.plugin.saveSettings();
        updateTimestampPreview(value);
      }));
    
    const updateTimestampPreview = (format: string) => {
      timestampSetting.descEl.empty();
      timestampSetting.descEl.createSpan({ text: 'Preview: ' });
      try {
        const moment = require('moment');
        const preview = moment().format(format || 'YYYY-MM-DD HH:mm');
        const span = timestampSetting.descEl.createSpan({ text: preview });
        span.style.fontWeight = 'bold';
        span.style.color = 'var(--color-accent)';
      } catch (e) {
        timestampSetting.descEl.createSpan({ text: '(requires moment.js)' });
      }
    };
    updateTimestampPreview(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD HH:mm');
    
    new Setting(containerEl).setName('Bring Timestamp below tags').setDesc('Render timestamp below grouped tags').addToggle(toggle => toggle.setValue(!!this.plugin.settings.timestampBelowTags).onChange(async (value) => {
      this.plugin.settings.timestampBelowTags = value;
      await this.plugin.saveSettings();
    }));

    new Setting(containerEl).setName('Categories').setDesc('Configure category display and reordering.').setHeading();
    new Setting(containerEl).setName('Enable Custom Categories').setDesc('Allow custom categories in right-click menu').addToggle(toggle => toggle.setValue(!!this.plugin.settings.enableCustomCategories).onChange(async (value) => {
      this.plugin.settings.enableCustomCategories = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    new Setting(containerEl).setName('Disable Time-based Categories').setDesc('Hide Today/Tomorrow/This Week').addToggle(toggle => toggle.setValue(!!this.plugin.settings.disableTimeBasedFiltering).onChange(async (value) => {
      this.plugin.settings.disableTimeBasedFiltering = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    new Setting(containerEl).setName('Disable Archived Category').setDesc('Hide Archived from buttons').addToggle(toggle => toggle.setValue(!!this.plugin.settings.hideArchivedFilterButton).onChange(async (value) => {
      this.plugin.settings.hideArchivedFilterButton = value;
      await this.plugin.saveSettings();
      this.display();
      refreshSidebarHeader();
    }));
    
    new Setting(containerEl).setName('Category Order').setDesc('Drag to reorder. Text color | Background color | [Reset] [Name] [Eye icon] [Remove]').setHeading();
    
    const catsContainer = containerEl.createDiv();
    catsContainer.style.marginTop = '8px';
    
    let draggedIdx: number | null = null;
    
    const renderCategories = () => {
      catsContainer.empty();
      const list = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
      
      // Add built-in categories at the top
      const builtinCategories: Array<{ id: string; label: string; type: 'builtin' }> = [];
      builtinCategories.push({ id: 'all', label: 'All', type: 'builtin' });
      if (!this.plugin.settings.disableTimeBasedFiltering) {
        builtinCategories.push({ id: 'today', label: 'Today', type: 'builtin' });
        builtinCategories.push({ id: 'tomorrow', label: 'Tomorrow', type: 'builtin' });
        builtinCategories.push({ id: 'this-week', label: 'This Week', type: 'builtin' });
      }
      if (!this.plugin.settings.hideArchivedFilterButton) {
        builtinCategories.push({ id: 'archived', label: 'Archived', type: 'builtin' });
      }
      
      // Render built-in categories
      builtinCategories.forEach((cat, idx) => {
        const row = catsContainer.createDiv({ cls: 'category-row builtin' });
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.padding = '8px';
        row.style.marginBottom = '6px';
        row.style.backgroundColor = 'var(--background-secondary)';
        row.style.borderRadius = '4px';
        row.style.borderLeft = '3px solid var(--color-accent)';
        
        const handle = row.createEl('span', { text: '≡' });
        handle.style.cursor = 'grab';
        handle.style.color = 'var(--text-muted)';
        handle.style.fontSize = '14px';
        handle.style.width = '20px';
        
        const textColorPicker = row.createEl('input');
        textColorPicker.type = 'color';
        textColorPicker.value = (this.plugin.settings.filterColors?.[cat.id]?.textColor) || '#ffffff';
        textColorPicker.title = 'Text color';
        textColorPicker.style.width = '40px';
        textColorPicker.style.height = '32px';
        textColorPicker.style.cursor = 'pointer';
        textColorPicker.addEventListener('change', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
          this.plugin.settings.filterColors[cat.id].textColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
        });
        
        const bgColorPicker = row.createEl('input');
        bgColorPicker.type = 'color';
        bgColorPicker.value = (this.plugin.settings.filterColors?.[cat.id]?.bgColor) || '#4a5568';
        bgColorPicker.title = 'Background color';
        bgColorPicker.style.width = '40px';
        bgColorPicker.style.height = '32px';
        bgColorPicker.style.cursor = 'pointer';
        bgColorPicker.addEventListener('change', async (e: any) => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
          this.plugin.settings.filterColors[cat.id].bgColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
        });
        
        const resetBtn = row.createEl('button', { text: '[Reset]' });
        resetBtn.style.padding = '4px 8px';
        resetBtn.style.fontSize = '12px';
        resetBtn.addEventListener('click', async () => {
          if (this.plugin.settings.filterColors) {
            delete this.plugin.settings.filterColors[cat.id];
          }
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        });
        
        const labelSpan = row.createEl('span', { text: cat.label });
        labelSpan.style.flex = '1';
        labelSpan.style.fontWeight = 'bold';
        labelSpan.style.color = 'var(--text-normal)';
      });
      
      // Render custom categories
      list.forEach((cat, idx) => {
        const row = catsContainer.createDiv({ cls: 'category-row custom' });
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.padding = '8px';
        row.style.marginBottom = '6px';
        row.style.backgroundColor = 'var(--background-secondary)';
        row.style.borderRadius = '4px';
        row.draggable = true;
        row.dataset.idx = String(idx);
        
        // Drag handle
        const handle = row.createEl('span', { text: '≡' });
        handle.style.cursor = 'grab';
        handle.style.color = 'var(--text-muted)';
        handle.style.fontSize = '14px';
        handle.style.width = '20px';
        
        row.addEventListener('dragstart', (e) => {
          draggedIdx = idx;
          (row as any).style.opacity = '0.5';
        });
        
        row.addEventListener('dragend', (e) => {
          (row as any).style.opacity = '1';
          draggedIdx = null;
        });
        
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedIdx !== null && draggedIdx !== idx) {
            const arr = [...list];
            const temp = arr[draggedIdx];
            arr[draggedIdx] = arr[idx];
            arr[idx] = temp;
            this.plugin.settings.customCategories = arr;
            draggedIdx = idx;
            renderCategories();
          }
        });
        
        // Text color picker
        const textColorPicker = row.createEl('input');
        textColorPicker.type = 'color';
        textColorPicker.value = cat.textColor || '#ffffff';
        textColorPicker.title = 'Text color';
        textColorPicker.style.width = '40px';
        textColorPicker.style.height = '32px';
        textColorPicker.style.cursor = 'pointer';
        textColorPicker.addEventListener('change', async (e: any) => {
          this.plugin.settings.customCategories[idx].textColor = e.target.value;
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
          this.plugin.settings.filterColors[cat.id].textColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
        });
        
        // Background color picker
        const bgColorPicker = row.createEl('input');
        bgColorPicker.type = 'color';
        bgColorPicker.value = cat.bgColor || '#4a5568';
        bgColorPicker.title = 'Background color';
        bgColorPicker.style.width = '40px';
        bgColorPicker.style.height = '32px';
        bgColorPicker.style.cursor = 'pointer';
        bgColorPicker.addEventListener('change', async (e: any) => {
          this.plugin.settings.customCategories[idx].bgColor = e.target.value;
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
          this.plugin.settings.filterColors[cat.id].bgColor = e.target.value;
          await this.plugin.saveSettings();
          refreshSidebarHeader();
        });
        
        // Reset button
        const resetBtn = row.createEl('button', { text: '[Reset]' });
        resetBtn.style.padding = '4px 8px';
        resetBtn.style.fontSize = '12px';
        resetBtn.addEventListener('click', async () => {
          if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
          delete this.plugin.settings.filterColors[cat.id];
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        });
        
        // Name input
        const txt = row.createEl('input');
        txt.type = 'text';
        txt.value = cat.label || '';
        txt.placeholder = 'Category name';
        txt.style.flex = '1';
        txt.style.padding = '4px 8px';
        txt.addEventListener('change', async (e: any) => {
          const newLabel = e.target.value || '';
          const slugBase = String(newLabel).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const existingIds = new Set(list.map(c => String(c.id || '').toLowerCase()).filter(id => id !== String(cat.id || '').toLowerCase()));
          let newId = slugBase || 'category';
          let k = 2;
          while (existingIds.has(newId)) { newId = (slugBase || 'category') + '-' + k; k++; }
          const oldId = this.plugin.settings.customCategories[idx].id;
          this.plugin.settings.customCategories[idx].label = newLabel;
          this.plugin.settings.customCategories[idx].id = newId;
          if (Array.isArray(this.plugin.settings.allItemsOrder)) {
            const i = this.plugin.settings.allItemsOrder.findIndex(x => String(x) === String(oldId));
            if (i >= 0) this.plugin.settings.allItemsOrder[i] = newId;
          }
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        });
        
        // Visibility toggle
        const showToggle = row.createEl('button');
        const isVisible = cat.showInMenu !== false;
        try { 
          setIcon(showToggle, isVisible ? 'eye' : 'eye-off'); 
        } catch { 
          showToggle.textContent = isVisible ? '👁' : '👁‍🗨'; 
        }
        showToggle.style.width = '40px';
        showToggle.style.padding = '4px';
        showToggle.title = isVisible ? 'Visible' : 'Hidden';
        showToggle.addEventListener('click', async () => {
          this.plugin.settings.customCategories[idx].showInMenu = !cat.showInMenu;
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        });
        
        // Remove button
        const del = row.createEl('button', { text: '[Remove]' });
        del.style.padding = '4px 8px';
        del.style.fontSize = '12px';
        del.classList.add('mod-warning');
        del.addEventListener('click', async () => {
          this.plugin.settings.customCategories.splice(idx, 1);
          await this.plugin.saveSettings();
          renderCategories();
          refreshSidebarHeader();
        });
      });
      
      // Add category button
      const addRow = catsContainer.createDiv({ cls: 'categories-add-row' });
      addRow.style.display = 'flex';
      addRow.style.justifyContent = 'flex-end';
      addRow.style.marginTop = '12px';
      const addBtn = addRow.createEl('button', { text: '+ Add Custom Category' });
      addBtn.classList.add('mod-cta');
      addBtn.addEventListener('click', async () => {
        if (!Array.isArray(this.plugin.settings.customCategories)) this.plugin.settings.customCategories = [];
        const slug = 'new';
        const existing = new Set(this.plugin.settings.customCategories.map(c => String(c.id || '').toLowerCase()));
        let id = slug;
        let i = 2;
        while (existing.has(id)) { id = slug + '-' + i; i++; }
        this.plugin.settings.customCategories.push({ id, label: 'New Category', showInMenu: true });
        await this.plugin.saveSettings();
        renderCategories();
        refreshSidebarHeader();
      });
    };
    renderCategories();
    
    new Setting(containerEl)
      .setName('Open category on load')
      .setDesc('Which category opens when sidebar is loaded')
      .addDropdown(dropdown => {
        const opts: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All' }];
        if (!this.plugin.settings.disableTimeBasedFiltering) {
          opts.push({ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'this-week', label: 'This Week' });
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
