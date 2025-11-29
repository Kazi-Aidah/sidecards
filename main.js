const { Plugin, ItemView, Setting, PluginSettingTab, Modal, Menu, Notice, setIcon, MarkdownView, MarkdownRenderer } = require('obsidian');

// Modal for quick card creation with filter picker
class QuickCardWithFilterModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.plugin.debugLog("🔍 Quick Card Add: Modal initialized", {
            hasPlugin: !!plugin,
            pluginSettings: plugin?.settings ? Object.keys(plugin.settings) : null
        });
    }

    getAvailableFilters() {
        this.plugin.debugLog("🔍 Quick Card Add: Getting available filters");
        const filters = [
            { type: 'all', label: 'All', value: 'all' }
        ];
        this.plugin.debugLog("Base filter added:", filters[0]);

        // Add time-based filters if not disabled
        this.plugin.debugLog("🔍 Quick Card Add: Checking time-based filters");
        const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
        this.plugin.debugLog("Time-based filters enabled:", showTimeBasedChips);
        if (showTimeBasedChips) {
            const timeBasedFilters = [
                { type: 'category', label: 'Today', value: 'today' },
                { type: 'category', label: 'Tomorrow', value: 'tomorrow' }
            ];
            filters.push(...timeBasedFilters);
            this.plugin.debugLog("Added time-based filters:", timeBasedFilters);
        }

        // Add custom categories if enabled
        try {
            const enabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.enableCustomCategories);
            if (enabled) {
                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                cats.forEach(cat => {
                    if (cat) {
                        filters.push({ 
                            type: 'category', 
                            label: cat.label || '', 
                            value: cat.id || cat.label || ''
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Error loading custom categories:', e);
        }

        // Add archived filter if not hidden
        if (!this.plugin.settings.hideArchivedFilterButton) {
            filters.push({ type: 'archived', label: 'Archived', value: 'archived' });
        }

        return filters;
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        // Modal title
        const title = contentEl.createEl('h2', {text: 'Quick Card Add'});
        title.style.marginTop = '-8px';
        title.style.marginBottom = '12px';
        
        // Card content section
        const contentHeading = contentEl.createEl('h3', {text: 'Card Content'});
        contentHeading.style.marginTop = '8px';
        contentHeading.style.marginBottom = '6px';
        
        const textarea = contentEl.createEl('textarea', {
            placeholder: 'Enter your card content here...',
            cls: 'quick-card-textarea'
        });
        textarea.style.width = '100%';
        textarea.style.height = '120px';
        textarea.style.marginBottom = '8px';
        textarea.focus();
        
        // Color selection section
        const colorHeading = contentEl.createEl('h3', {text: 'Color'});
        colorHeading.style.marginTop = '8px';
        colorHeading.style.marginBottom = '6px';
        
        const colorContainer = contentEl.createDiv();
        colorContainer.style.display = 'flex';
        colorContainer.style.gap = '8px';
        colorContainer.style.marginBottom = '18px';
        colorContainer.style.flexWrap = 'wrap';
        
        let selectedColor = 'var(--card-color-1)';
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
        
        colors.forEach(color => {
            const swatch = colorContainer.createDiv();
            swatch.style.width = '24px';
            swatch.style.height = '24px';
            swatch.style.borderRadius = '50%';
            swatch.style.cursor = 'pointer';
            swatch.style.transition = 'transform 0.15s ease, border 0.15s ease';
            swatch.style.border = selectedColor === color.var 
                ? '2px solid var(--text-accent)' 
                : '2px solid var(--background-modifier-border)';
            
            try {
                const m = String(color.var).match(/--card-color-(\d+)/);
                if (m) {
                    const idx = Number(m[1]) - 1;
                    const lbl = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[idx]) || color.name;
                    swatch.title = lbl;
                }
            } catch (e) { }
            
            // Get computed color value
            const root = document.documentElement;
            const computedColor = getComputedStyle(root).getPropertyValue(color.var.replace('var(', '').replace(')', ''));
            swatch.style.backgroundColor = computedColor.trim() || color.var;
            
            swatch.addEventListener('mouseenter', () => {
                swatch.style.transform = 'scale(1.25)';
            });
            
            swatch.addEventListener('mouseleave', () => {
                swatch.style.transform = 'scale(1)';
            });
            
            swatch.addEventListener('click', () => {
                // Update all swatches
                colorContainer.querySelectorAll('div').forEach(s => {
                    s.style.border = '2px solid var(--background-modifier-border)';
                });
                swatch.style.border = '2px solid var(--text-accent)';
                selectedColor = color.var;
            });
        });
        
        // Tags section
        const tagsHeading = contentEl.createEl('h3', {text: 'Tags'});
        tagsHeading.style.marginTop = '6px';
        tagsHeading.style.marginBottom = '6px';
        
        const tagsInput = contentEl.createEl('input', {
            placeholder: 'Enter tags separated by commas (e.g., work, urgent)',
            cls: 'quick-card-tags-input'
        });
        tagsInput.style.width = '100%';
        tagsInput.style.padding = '8px';
        tagsInput.style.marginBottom = '8px';
        tagsInput.style.border = '1px solid var(--background-modifier-border)';
        tagsInput.style.borderRadius = '4px';
        tagsInput.style.boxSizing = 'border-box';
        
        // Filter selection section
        const filterHeading = contentEl.createEl('h3', {text: 'Apply Filters'});
        filterHeading.style.marginTop = '8px';
        filterHeading.style.marginBottom = '6px';
        
        const select = contentEl.createEl('select', {cls: 'filter-dropdown'});
        select.style.width = '100%';
        select.style.marginBottom = '12px';
        
        this.getAvailableFilters().forEach(filter => {
            const option = select.createEl('option', {
                value: filter.value,
                text: filter.label
            });
            option.dataset.filterType = filter.type;
        });
        
        // Action buttons
        const buttonContainer = contentEl.createEl('div', {cls: 'modal-button-container'});
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '8px';
        
        // Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => this.close());
        
        // Create button
        const createButton = buttonContainer.createEl('button', {
            text: 'Create Card',
            cls: 'mod-cta'
        });
        createButton.addEventListener('click', () => {
            this.plugin.debugLog("🔍 Quick Card Add Debug: Create button clicked");
            this.plugin.debugLog("Selected filter:", { value: select.value, type: select.selectedOptions[0].dataset.filterType });
            this.plugin.debugLog("Card content:", textarea.value);
            this.plugin.debugLog("Selected color:", selectedColor);
            this.plugin.debugLog("Tags:", tagsInput.value);
            this.createCardAndFilter(textarea.value, select.value, select.selectedOptions[0].dataset.filterType, selectedColor, tagsInput.value);
            this.close();
        });

        // Handle Enter key
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.plugin.debugLog("🔍 Quick Card Add Debug: Enter key pressed");
                this.plugin.debugLog("Selected filter:", { value: select.value, type: select.selectedOptions[0].dataset.filterType });
                this.plugin.debugLog("Card content:", textarea.value);
                this.createCardAndFilter(textarea.value, select.value, select.selectedOptions[0].dataset.filterType, selectedColor, tagsInput.value);
                this.close();
            }
        });

        const wrapSelectionInTextarea = (ta, before, after) => {
            try {
                const start = ta.selectionStart || 0;
                const end = ta.selectionEnd || 0;
                const sel = ta.value.slice(start, end);
                const replaced = before + sel + after;
                ta.value = ta.value.slice(0, start) + replaced + ta.value.slice(end);
                const pos = start + replaced.length;
                ta.selectionStart = ta.selectionEnd = pos;
            } catch (e) {}
        };

        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && !e.shiftKey && !e.altKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === 'b') { e.preventDefault(); wrapSelectionInTextarea(textarea, '**', '**'); }
                if (k === 'i') { e.preventDefault(); wrapSelectionInTextarea(textarea, '*', '*'); }
                if (k === 'k') { e.preventDefault(); wrapSelectionInTextarea(textarea, '[', ']( )'); }
                if (k === '`') { e.preventDefault(); wrapSelectionInTextarea(textarea, '`', '`'); }
            }
        });
    }
    
    async createCardAndFilter(content, filterValue, filterType, selectedColor = 'var(--card-color-1)', tagsString = '') {
        this.plugin.debugLog("🔍 Quick Card Add Debug: createCardAndFilter start", {
            content: content,
            filterValue: filterValue,
            filterType: filterType,
            selectedColor: selectedColor,
            tagsString: tagsString,
            timestamp: new Date().toISOString()
        });

        if (!content.trim()) {
            this.plugin.debugWarn("❌ Quick Card Add: Empty content detected");
            new Notice('Card content cannot be empty');
            return;
        }

        try {
            // Get first Sidebar view
            this.plugin.debugLog("🔍 Looking for sidebar view...");
            const view = this.app.workspace.getLeavesOfType('card-sidebar')?.[0]?.view;
            if (!view) {
                this.plugin.debugWarn("❌ Quick Card Add: No sidebar view found");
                throw new Error('Card sidebar not found');
            }
            this.plugin.debugLog("✅ Quick Card Add: Found sidebar view");
            
            // Create textarea to use existing addCardFromInput logic
            this.plugin.debugLog("📝 Creating temporary input element");
            const tempInput = document.createElement('textarea');
            tempInput.value = content;

            // Parse tags from comma-separated string
            const parsedTags = tagsString
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            // Set the category on creation if a category filter is selected
            let category = null;
            if (filterType === 'category' && filterValue) {
                // Convert filter value to proper category name
                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                const found = cats.find(x => String(x.id || '').toLowerCase() === String(filterValue).toLowerCase() || 
                                           String(x.label || '').toLowerCase() === String(filterValue).toLowerCase());
                category = found ? (found.label || String(found.id || filterValue)) : filterValue;
            }
            
            // Create the card using the existing proven implementation, passing filter info and color/tags
            await view.addCardFromInput(tempInput, { 
                category,
                filterType,
                filterValue,
                selectedColor,
                tags: parsedTags
            });
            
            // Apply the filter using the existing sidebar logic
            if (filterType && filterValue) {
                // Reset all filter buttons first
                const filterGroup = view.containerEl.querySelector('.filter-group');
                if (filterGroup) {
                    filterGroup.querySelectorAll('.card-filter-btn').forEach(b => {
                        b.removeClass('active');
                        const customBg = b.dataset.customBg;
                        const customText = b.dataset.customText;
                        if (customBg) {
                            b.style.setProperty('background-color', customBg, 'important');
                        } else {
                            b.style.setProperty('background-color', 'var(--background-primary)', 'important');
                        }
                        if (customText) {
                            b.style.setProperty('color', customText, 'important');
                        } else {
                            b.style.setProperty('color', 'var(--text-muted)', 'important');
                        }
                    });
                }

                // Set new filter state and activate appropriate button
                if (filterType === 'archived' || filterType === 'all') {
                    view.currentCategoryFilter = null;
                    await view.loadCards(filterType === 'archived');
                    
                    // Activate the corresponding button
                    if (filterGroup) {
                        const btn = filterGroup.querySelector(`[data-filter-type="${filterType}"]`);
                        if (btn) {
                            btn.addClass('active');
                            btn.style.backgroundColor = 'var(--background-modifier-hover)';
                            btn.style.color = 'var(--text-normal)';
                        }
                    }
                } else if (filterType === 'category') {
                    // Set the category filter and find the matching button
                    view.currentCategoryFilter = String(filterValue).toLowerCase();
                    if (filterGroup) {
                        const btn = filterGroup.querySelector(`[data-filter-type="category"][data-filter-value="${filterValue}"]`);
                        if (btn) {
                            btn.addClass('active');
                            btn.style.backgroundColor = 'var(--background-modifier-hover)';
                            btn.style.color = 'var(--text-normal)';
                        }
                    }
                }
                
                // Apply filters and animate
                this.plugin.debugLog("🔍 Quick Card Add: Applying filters after card creation", {
                    filterValue: filterValue,
                    filterType: filterType,
                    currentCategoryFilter: view.currentCategoryFilter,
                    numCards: view.cards ? view.cards.length : 0
                });
                view.applyFilters();
                this.plugin.debugLog("✅ Quick Card Add: Filters applied");
                view.animateCardsEntrance({ duration: 300, offset: 28 });
            }
        } catch (error) {
            console.error('Error creating card:', error);
            new Notice('Error creating card with filter');
        }
    }
}

// View component for the sidebar that manages card state and UI interactions
class CardSidebarView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.cards = [];
        this.activeFilters = { query: '', tags: [], status: null, untaggedOnly: false };
        this._pendingTagWrites = {};
        this._reapplyingTags = {};
        this._universalCardOrder = [];  // Store complete universal order across all views
        this._deletedCardIds = new Set();  // Track deleted cards to remove from settings
    }

    // Toggle archive state for a card and write to note frontmatter (or create frontmatter if missing)
    async toggleArchive(cardData, setArchived = true) {
        try {
            if (!cardData) return;

            // Update in-memory state immediately
            cardData.archived = !!setArchived;
            try { await this.saveCards(); } catch (e) { console.error('Error saving cards after archive toggle:', e); }

            if (!cardData.notePath) return;

            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
            if (!file) {
                this.plugin.debugWarn('toggleArchive: file not found for path', cardData.notePath);
                return;
            }

            try {
                const content = await this.app.vault.read(file);
                const updated = this.updateFrontmatter(content, 'archived', !!setArchived);
                this.plugin.debugLog('sidecards: modify (toggleArchive) ->', file.path);
                await this.app.vault.modify(file, updated);
            } catch (err) {
                console.error('Error writing archived flag to note frontmatter:', err);
            }
        } catch (err) {
            console.error('Error in toggleArchive:', err);
        }
    }

    // Update YAML frontmatter in a note content string.
    // - content: full file content (string)
    // - key: frontmatter key to add/update/remove
    // - value: new value. If null/undefined, the key will be removed.
    updateFrontmatter(content, key, value) {
        try {
            if (typeof content !== 'string') return content;

            const keyName = String(key || '').trim();
            if (!keyName) return content;

            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            const fm = fmMatch ? fmMatch[1] : '';
            const rest = fmMatch ? content.slice(fmMatch[0].length) : content;

            // Build array of existing frontmatter lines (if any)
            const lines = fm ? fm.split(/\r?\n/) : [];

            // Remove existing lines for the key (case-insensitive)
            const escKey = keyName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const keyRegex = new RegExp('^\\s*' + escKey + '\\s*:\\s*.*$', 'i');
            const filtered = lines.filter(l => !keyRegex.test(l));

            // If value is null or undefined, just remove the key
            if (value === null || typeof value === 'undefined') {
                if (filtered.length === 0) {
                    // No frontmatter left - return body only
                    return rest.startsWith('\n') ? rest.slice(1) : rest;
                }
                const rebuilt = filtered.join('\n');
                return '---\n' + rebuilt + '\n---\n' + rest;
            }

            // Serialize the value appropriately
            let valueStr;
            if (typeof value === 'boolean' || typeof value === 'number') {
                valueStr = String(value);
            } else {
                const s = String(value);
                // Use unquoted simple tokens when safe
                if (/^[A-Za-z0-9 _\-]+$/.test(s)) valueStr = s;
                else valueStr = '"' + s.replace(/"/g, '\\"') + '"';
            }

            filtered.push(keyName + ': ' + valueStr);
            const newFm = filtered.join('\n');
            return '---\n' + newFm + '\n---\n' + rest;
        } catch (err) {
            console.error('Error in updateFrontmatter:', err);
            return content;
        }
    }

    // Convert hex color codes to RGBA for card background transparency
    hexToRgba(hex, alpha = 1) {
        if (!hex) return '';
        const h = hex.replace('#', '').trim();
        let r, g, b;
        if (h.length === 3) {
            r = parseInt(h[0] + h[0], 16);
            g = parseInt(h[1] + h[1], 16);
            b = parseInt(h[2] + h[2], 16);
        } else if (h.length === 6) {
            r = parseInt(h.substring(0, 2), 16);
            g = parseInt(h.substring(2, 4), 16);
            b = parseInt(h.substring(4, 6), 16);
        } else {
            return hex;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    
    // Resolve CSS color variables to hex values, handling both direct hex codes and theme variables
    resolveColorVarToHex(colorVar) {
        if (!colorVar) return null;
        if (colorVar.startsWith('#')) return colorVar;
        const m = colorVar.match(/--card-color-(\d+)/);
        if (m) {
            const idx = m[1];
            const key = `color${idx}`;
            const fromSettings = (this.plugin && this.plugin.settings && this.plugin.settings[key]) || null;
            if (fromSettings) return fromSettings;
            try {
                const root = window && window.getComputedStyle ? window.getComputedStyle(document.documentElement) : null;
                if (root) {
                    const val = root.getPropertyValue(`--card-color-${idx}`);
                    if (val) {
                        const v = String(val).trim();
                        if (v) return v;
                    }
                }
            } catch (e) { }
            return null;
        }
        return null;
    }

    
    // Helper function to apply the correct color to a card, respecting status color inheritance
    applyCardColor(cardData, cardEl) {
        if (!cardEl || !cardData) return;
        
        try {
            // If inherit status color is enabled and card has a status with color, use status color
            if (this.plugin.settings.inheritStatusColor && cardData.status && cardData.status.color) {
                this.applyCardColorToElement(cardEl, cardData.status.color);
                return;
            }
            
            // Otherwise use the card's color
            const colorToApply = cardData.color || 'var(--card-color-1)';
            this.applyCardColorToElement(cardEl, colorToApply);
        } catch (e) {
            this.plugin.debugLog('Error in applyCardColor:', e);
        }
    }

    applyCardColorToElement(cardEl, colorVar) {
        const style = (this.plugin.settings.cardStyle != null) ? this.plugin.settings.cardStyle : 2;
        const opacity = (this.plugin.settings.cardBgOpacity != null) ? this.plugin.settings.cardBgOpacity : 0.08;
        const borderThickness = Number(this.plugin.settings.borderThickness != null ? this.plugin.settings.borderThickness : 2);

        cardEl.style.borderLeft = '';
        cardEl.style.border = '';
        cardEl.style.backgroundColor = '';
        cardEl.style.boxShadow = '';

        const hex = this.resolveColorVarToHex(colorVar) || colorVar;

        if (style === 1) {
            cardEl.style.border = `${borderThickness}px solid ${colorVar}`;
            cardEl.style.backgroundColor = this.hexToRgba(hex, opacity);
        } else if (style === 3) {
            cardEl.style.borderLeft = `4px solid ${colorVar}`;
            cardEl.style.backgroundColor = this.hexToRgba(hex, opacity);
        } else {
            cardEl.style.border = `${borderThickness}px solid ${colorVar}`;
            cardEl.style.backgroundColor = this.hexToRgba(hex, opacity);
            cardEl.style.boxShadow = `2px 2px 0 0 ${colorVar}`;
        }
    }

    getViewType() {
        return 'card-sidebar';
    }

    getDisplayText() {
        return 'Card Sidebar';
    }

    getIcon() {
        return 'rectangle-horizontal';
    }

    // Initialize sidebar view and import cards from configured storage folder
    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.addClass('card-sidebar-container');
        
        const mainContainer = container.createDiv();
        mainContainer.addClass('card-sidebar-main');
        mainContainer.style.display = 'flex';
        mainContainer.style.flexDirection = 'column';
        mainContainer.style.height = '100%';

        this.createHeader(mainContainer);
        try { this.createSearchBar(mainContainer); } catch (e) { }

        this.cardsContainer = mainContainer.createDiv();
        this.cardsContainer.addClass('card-sidebar-cards-container');
        this.cardsContainer.style.flex = '1';
        this.cardsContainer.style.position = 'relative';
        this.cardsContainer.style.overflow = 'auto';
        this.cardsContainer.style.minHeight = '200px';
        try { this.cardsContainer.style.contentVisibility = 'auto'; } catch (e) {}
        try { this.cardsContainer.style.containIntrinsicSize = '600px'; } catch (e) {}

        // Apply layout mode early to avoid layout flash
        try { this.applyLayoutMode(); } catch (e) {}
        try {
            if (this.plugin.settings.verticalCardMode && this.cardsContainer) {
                this.cardsContainer.style.visibility = 'hidden';
            }
        } catch (e) {}

        

        this.createFixedInputBox(mainContainer);

        try {
            const folder = this.plugin.settings.storageFolder;
            if (folder && folder !== '/') {
                try {
                    // Always import from folder to get all cards, then merge with existing settings
                    await this.plugin.importNotesFromFolderToSettings(folder, true);
                    this.plugin._importedFromFolderOnLoad = true;
                } catch (e) {
                    console.error('Error importing notes for view on open:', e);
                }
            }
        } catch (e) {
            console.error('Error during onOpen import check:', e);
        }

        try { this.showLoadingOverlay(); } catch (e) {}
        try {
            // Let layout calculate before first card creation to prevent flash
            await new Promise(r => {
                try { requestAnimationFrame(() => r()); } catch (e) { setTimeout(r, 0); }
            });
            await this.scheduleLoadCards(false);
        } catch (e) {
            console.error('Error during loadCards onOpen:', e);
        }

        // Defer filter application until cards are fully rendered
        this._deferFiltersUntilReady = true;

        // NOTE: Do NOT call applyFilters() here - loadCardsPrioritized already handles card visibility.
        // Calling applyFilters() causes an unnecessary show/hide cycle that creates the double rendering effect.
        // Only apply filters if user explicitly changes them via UI interactions.

        try {
            const openVal = (this.plugin && this.plugin.settings && this.plugin.settings.openCategoryOnLoad) ? String(this.plugin.settings.openCategoryOnLoad) : null;
            if (openVal) {
                const lower = String(openVal).toLowerCase();
                if (['all', 'archived'].includes(lower)) {
                    // Don't call applyFilters - just update UI button states
                    try {
                        const btns = this.containerEl.querySelectorAll('.card-filter-btn');
                        btns.forEach(b => {
                            try {
                                const t = (b.dataset && b.dataset.filterType) ? String(b.dataset.filterType) : '';
                                const v = (b.dataset && b.dataset.filterValue) ? String(b.dataset.filterValue).toLowerCase() : '';
                                const customBg = b.dataset.customBg;
                                const customText = b.dataset.customText;
                                
                                if (t === lower) {
                                    b.addClass('active');
                                    if (customBg) {
                                        b.style.setProperty('background-color', customBg, 'important');
                                        b.style.filter = 'brightness(1.2)';
                                    } else {
                                        b.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
                                    }
                                    if (customText) {
                                        b.style.setProperty('color', customText, 'important');
                                    } else {
                                        b.style.setProperty('color', 'var(--text-normal)', 'important');
                                    }
                                } else {
                                    b.removeClass('active');
                                    if (customBg) {
                                        b.style.setProperty('background-color', customBg, 'important');
                                    } else {
                                        b.style.setProperty('background-color', 'var(--background-primary)', 'important');
                                    }
                                    if (customText) {
                                        b.style.setProperty('color', customText, 'important');
                                    } else {
                                        b.style.setProperty('color', 'var(--text-muted)', 'important');
                                    }
                                    b.style.filter = '';
                                }
                            } catch (e) {}
                        });
                    } catch (e) {}
                } else {
                    
                    try { this.currentCategoryFilter = String(openVal).toLowerCase(); } catch (e) { this.currentCategoryFilter = String(openVal); }
                    // Don't call applyFilters on initial load - cards are already filtered appropriately
                    try {
                        const btns = this.containerEl.querySelectorAll('.card-filter-btn');
                        btns.forEach(b => {
                            try {
                                const t = (b.dataset && b.dataset.filterType) ? String(b.dataset.filterType) : '';
                                const v = (b.dataset && b.dataset.filterValue) ? String(b.dataset.filterValue).toLowerCase() : '';
                                const customBg = b.dataset.customBg;
                                const customText = b.dataset.customText;
                                
                                if (t === 'category' && v === String(this.currentCategoryFilter).toLowerCase()) {
                                    b.addClass('active');
                                    if (customBg) {
                                        b.style.setProperty('background-color', customBg, 'important');
                                        b.style.filter = 'brightness(1.2)';
                                    } else {
                                        b.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
                                    }
                                    if (customText) {
                                        b.style.setProperty('color', customText, 'important');
                                    } else {
                                        b.style.setProperty('color', 'var(--text-normal)', 'important');
                                    }
                                } else {
                                    b.removeClass('active');
                                    if (customBg) {
                                        b.style.setProperty('background-color', customBg, 'important');
                                    } else {
                                        b.style.setProperty('background-color', 'var(--background-primary)', 'important');
                                    }
                                    if (customText) {
                                        b.style.setProperty('color', customText, 'important');
                                    } else {
                                        b.style.setProperty('color', 'var(--text-muted)', 'important');
                                    }
                                    b.style.filter = '';
                                }
                            } catch (e) {}
                        });
                    } catch (e) {}
                }
            }
        } catch (e) {}

        // Don't fade cards during initial load - they already animate in via loadCardsPrioritized
        // Calling hideLoadingOverlay(300) causes an unnecessary fade-out/fade-in cycle
        // that creates the appearance of cards disappearing and re-entering
        // Only show the overlay without fading during initial load
        try { this.hideLoadingOverlay(0); } catch (e) {}

        // Detect and save sidebar position - CRITICAL: detect where the sidebar was actually placed
        try {
            const detectPosition = () => {
                let position = 'right';
                let detectionDetails = {};
                
                // Traverse up the DOM tree to find the actual container
                let current = this.containerEl;
                let depth = 0;
                const maxDepth = 10;
                
                while (current && depth < maxDepth) {
                    const className = current.className || '';
                    detectionDetails[`depth_${depth}`] = className;
                    
                    // Left sidebar detection
                    if (className.includes('side-dock-left') || className.includes('mod-left-split')) {
                        position = 'left';
                        this.plugin.debugLog('Position detected as LEFT at depth', depth, '- class:', className);
                        break;
                    }
                    
                    // Main tab area detection (editor area / homepage)
                    if (className.includes('workspace-leaf-content') || className.includes('workspace-tabs')) {
                        position = 'tab';
                        this.plugin.debugLog('Position detected as TAB at depth', depth, '- class:', className);
                        break;
                    }
                    
                    // Right sidebar detection
                    if (className.includes('side-dock-right') || className.includes('mod-right-split')) {
                        position = 'right';
                        this.plugin.debugLog('Position detected as RIGHT at depth', depth, '- class:', className);
                        break;
                    }
                    
                    current = current.parentElement;
                    depth++;
                }
                
                // Save position if different from what's currently saved
                if (position !== this.plugin.settings.sidebarPosition) {
                    this.plugin.settings.sidebarPosition = position;
                    this.plugin.saveSettings().catch(e => {
                        this.plugin.debugLog('Error saving sidebar position:', e);
                    });
                    this.plugin.debugLog('🎯 SIDEBAR POSITION UPDATED TO:', position, detectionDetails);
                }
                
                return position;
            };
            
            detectPosition();
            
            // Set up a mutation observer to detect if the sidebar is moved (e.g., via drag)
            // This is CRITICAL for detecting drag operations
            if (typeof MutationObserver !== 'undefined' && this.containerEl && this.containerEl.parentElement) {
                const observer = new MutationObserver((mutations) => {
                    try {
                        // Check if any structural changes occurred
                        let hasStructuralChange = false;
                        for (const mutation of mutations) {
                            if (mutation.attributeName === 'class') {
                                hasStructuralChange = true;
                                break;
                            }
                        }
                        
                        if (hasStructuralChange) {
                            const newPos = detectPosition();
                            this.plugin.debugLog('🔄 MUTATION DETECTED: Sidebar position changed to:', newPos);
                        }
                    } catch (e) {
                        this.plugin.debugLog('Error in position mutation observer:', e);
                    }
                });
                
                // Observe the parent element for class changes
                observer.observe(this.containerEl.parentElement, {
                    attributes: true,
                    attributeFilter: ['class'],
                    subtree: false
                });
                
                // Also observe higher up to catch moves between sidebars
                if (this.containerEl.parentElement.parentElement) {
                    observer.observe(this.containerEl.parentElement.parentElement, {
                        attributes: true,
                        attributeFilter: ['class'],
                        subtree: true,
                        attributeOldValue: true
                    });
                }
                
                // Store observer for cleanup
                this._positionObserver = observer;
            }
        } catch (e) {
            this.plugin.debugLog('Error setting up position detection:', e);
        }

        try { this.setupExpiryTimer(); } catch (e) { try { this.checkExpiries(); } catch (ee) {} }
        try { this.applyLayoutMode(); } catch (e) {}
        try {
            if (this.cardsContainer && typeof ResizeObserver !== 'undefined') {
                const ro = new ResizeObserver(() => { try { this.refreshMasonrySpans(); } catch (e) {} });
                ro.observe(this.cardsContainer);
                this._layoutResizeObserver = ro;
            }
        } catch (e) {}

        try {
            this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
                try {
                    if (!file || !file.path) return;
                    // Skip reload if status was just being modified (prevents flickering)
                    const flagKey = `_statusModifying_${file.path}`;
                    if (this.plugin[flagKey]) return;
                    await this.updateCardFromNotePath(file.path);
                } catch (e) {
                    console.error('Error handling modified file for card update:', e);
                }
            }));
        } catch (e) {
            try {
                this._rawModifyListener = this.app.vault.on('modify', async (file) => {
                    if (!file || !file.path) return;
                    // Skip reload if status was just being modified (prevents flickering)
                    const flagKey = `_statusModifying_${file.path}`;
                    if (this.plugin[flagKey]) return;
                    try { await this.updateCardFromNotePath(file.path); } catch (e) { console.error(e); }
                });
            } catch (err) {
                this.plugin.debugWarn('Could not register vault modify listener for card updates:', err);
            }
        }

        
        
        try {
                this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
                try {
                    if (!file || !file.path) return;
                    const pending = this._pendingTagWrites && this._pendingTagWrites[file.path];
                    this.plugin.debugLog('sidecards: vault modify event for', file.path, 'pending?', !!pending);
                    if (!pending) return;
                    if (Date.now() > pending.expiresAt) {
                        delete this._pendingTagWrites[file.path];
                        return;
                    }
                    
                    if (this._reapplyingTags && this._reapplyingTags[file.path]) return;

                    try {
                        const text = await this.app.vault.read(file);
                        const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                        const fm = fmMatch ? fmMatch[1] : '';
                        const existing = this.parseTagsFromFrontmatter(fm || '');

                        const desired = Array.isArray(pending.tags) ? pending.tags.map(t => String(t).trim()).filter(Boolean) : [];
                        
                        const same = (existing.length === desired.length) && desired.every(t => existing.includes(t));
                        if (same) {
                            delete this._pendingTagWrites[file.path];
                            return;
                        }

                        
                        let content = text;
                        const tagsBlock = desired.length > 0
                            ? 'Tags: [' + desired.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ') + ']'
                            : 'Tags: []';

                        if (fmMatch) {
                            let fmLines = fm.split(/\r?\n/);
                            const newLines = [];
                            for (let i = 0; i < fmLines.length; i++) {
                                const line = fmLines[i];
                                if (/^\s*(Tags|tags)\s*:/i.test(line)) {
                                    const rest = line.replace(/^\s*(Tags|tags)\s*:\s*/i, '').trim();
                                    if (rest.startsWith('[')) {
                                        continue;
                                    }
                                    i++;
                                    while (i < fmLines.length && /^\s*-\s+/.test(fmLines[i])) i++;
                                    i--;
                                    continue;
                                }
                                newLines.push(line);
                            }

                            const rebuiltFm = tagsBlock + '\n' + (newLines.length ? newLines.join('\n') + '\n' : '');
                            const newFmFull = '---\n' + rebuiltFm + '---\n';
                            content = content.replace(fmMatch[0], newFmFull);
                        } else {
                            const newFmFull = '---\n' + tagsBlock + '\n---\n\n' + content;
                            content = newFmFull;
                        }

                        this._reapplyingTags[file.path] = true;
                            try {
                            this.plugin.debugLog('sidecards: modify (reapply pending tags) ->', file.path);
                            await this.app.vault.modify(file, content);
                        } catch (e) {
                            console.error('Error reapplying tags after external modify:', e);
                        } finally {
                            delete this._reapplyingTags[file.path];
                            delete this._pendingTagWrites[file.path];
                        }
                    } catch (e) {
                        console.error('Error while checking/reapplying pending tags for', file.path, e);
                    }
                } catch (e) {}
            }));
        } catch (e) {}

        if (!this._documentDropRegistered) {
            try {
                this.plugin.registerDomEvent(document, 'drop', async (ev) => {
                    try {
                        if (!ev || !ev.dataTransfer) return;
                        const types = ev.dataTransfer.types || [];
                        const hasCustom = Array.from(types).includes('text/x-card-sidebar');
                        if (hasCustom) {
                            try { ev.preventDefault(); } catch (e) { }
                            try { ev.stopImmediatePropagation(); } catch (e) { }
                        }

                        let payload = null;
                        const json = ev.dataTransfer.getData('text/x-card-sidebar');
                        if (json) {
                            try { payload = JSON.parse(json); } catch (e) { payload = { content: json }; }
                        } else {
                            const plain = ev.dataTransfer.getData('text/plain');
                            if (!plain) return;
                            const byId = this.cards.find(c => c.id === plain);
                            if (byId) payload = { id: byId.id, content: byId.content };
                            else {
                                const byContent = this.cards.find(c => c.content === plain);
                                if (byContent) payload = { id: byContent.id, content: byContent.content };
                                else payload = { content: plain };
                            }
                        }

                        if (!payload || !payload.content) return;
                        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (!mdView || !mdView.editor) return;

                        try { ev.preventDefault(); } catch (e) { }
                        try { ev.stopPropagation(); } catch (e) { }

                        try {
                            mdView.editor.replaceSelection(String(payload.content));
                            mdView.editor.focus();
                        } catch (err) {
                            console.error('Failed to insert card content into editor:', err);
                        }
                    } catch (err) {
                        console.error('Error handling document drop for card content:', err);
                    }
                });
                this._documentDropRegistered = true;
            } catch (err) {
                try {
                    document.addEventListener('drop', async (ev) => {
                        try {
                            if (!ev || !ev.dataTransfer) return;
                            const types = ev.dataTransfer.types || [];
                            const hasCustom = Array.from(types).includes('text/x-card-sidebar');
                            if (hasCustom) {
                                try { ev.preventDefault(); } catch (e) { }
                                try { ev.stopImmediatePropagation(); } catch (e) { }
                            }

                            let payload = null;
                            const json = ev.dataTransfer.getData('text/x-card-sidebar');
                            if (json) {
                                try { payload = JSON.parse(json); } catch (e) { payload = { content: json }; }
                            } else {
                                const plain = ev.dataTransfer.getData('text/plain');
                                if (!plain) return;
                                const byId = this.cards.find(c => c.id === plain);
                                if (byId) payload = { id: byId.id, content: byId.content };
                                else {
                                    const byContent = this.cards.find(c => c.content === plain);
                                    if (byContent) payload = { id: byContent.id, content: byContent.content };
                                    else payload = { content: plain };
                                }
                            }
                            if (!payload || !payload.content) return;
                            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
                            if (!mdView || !mdView.editor) return;
                            try { ev.preventDefault(); } catch (e) { }
                            try { ev.stopPropagation(); } catch (e) { }
                            mdView.editor.replaceSelection(String(payload.content));
                            mdView.editor.focus();
                        } catch (e) {
                            console.error('Drop fallback handler error:', e);
                        }
                    }, true);
                    this._documentDropRegistered = true;
                } catch (e) {
                    this.plugin.debugWarn('Could not register document drop handler for card-to-editor insertion:', e);
                }
            }
        }
    }

    createHeader(container) {
        if (this.plugin.settings && this.plugin.settings.disableFilterButtons) return;
        const header = container.createDiv();
        
        
        
        
        try { if (container.firstChild && container.firstChild !== header) container.insertBefore(header, container.firstChild); } catch (e) {}
        header.addClass('card-sidebar-header');
        header.style.display = 'flex';

        if (!this.plugin.settings.disableFilterButtons) {
            const filterGroup = header.createDiv('filter-group');
            filterGroup.addClass('card-sidebar-filter-group');
            filterGroup.style.display = 'flex';
            filterGroup.style.gap = '8px';
            // Allow horizontal scrolling of filter chips without showing a scrollbar
            filterGroup.style.overflowX = 'auto';
            filterGroup.style.flexWrap = 'nowrap';
            filterGroup.style.whiteSpace = 'nowrap';
            filterGroup.style.webkitOverflowScrolling = 'touch';

            try {
                if (!document.getElementById('card-filter-scroll-hide')) {
                    const s = document.createElement('style');
                    s.id = 'card-filter-scroll-hide';
                    s.textContent = `
                        .card-sidebar-header .filter-group { -ms-overflow-style: none; scrollbar-width: none; }
                        .card-sidebar-header .filter-group::-webkit-scrollbar { display: none; width: 0; height: 0; }
                    `;
                    document.head.appendChild(s);
                }
            } catch (e) {}

            
            
            const chips = [];

            // Build a single combined order for filters and custom categories
            const filterMap = {
                'filter-all': { type: 'all', label: 'All', value: 'all' },
                'filter-today': { type: 'category', label: 'Today', value: 'today' },
                'filter-tomorrow': { type: 'category', label: 'Tomorrow', value: 'tomorrow' }
            };

            const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
            const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];

            // Default combined order when none saved: filters then custom categories by current order
            const defaultCombined = ['filter-all', 'filter-today', 'filter-tomorrow']
                .concat(cats.map(c => String(c.id || '')));

            const combinedOrder = Array.isArray(this.plugin.settings.allItemsOrder) && this.plugin.settings.allItemsOrder.length > 0
                ? this.plugin.settings.allItemsOrder
                : defaultCombined;

            combinedOrder.forEach(itemId => {
                if (!itemId) return;
                if (itemId.startsWith('filter-')) {
                    const mapped = filterMap[itemId];
                    if (!mapped) return;
                    if (itemId === 'filter-all' || showTimeBasedChips) chips.push(mapped);
                    return;
                }
                const cat = cats.find(c => String(c.id) === String(itemId));
                if (!cat) return;
                const id = String(cat.id || '').toLowerCase();
                const label = String(cat.label || '').toLowerCase();
                const disabledTime = !!(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
                if (disabledTime && (id === 'today' || id === 'tomorrow' || id === 'this_week' || label.includes('today') || label.includes('tomorrow') || label.includes('this week'))) return;
                chips.push({ type: 'category', label: cat.label || '', value: cat.id || cat.label || '' });
            });

            
            if (!this.plugin.settings.hideArchivedFilterButton) {
                chips.push({ type: 'archived', label: 'Archived', value: 'archived' });
            }

            

            chips.forEach(chip => {
                const btn = filterGroup.createEl('button', { text: chip.label });
                btn.addClass('card-filter-btn');
                btn.style.padding = '4px 8px';
                btn.style.borderRadius = 'var(--button-radius)';
                btn.style.border = '1px solid var(--background-modifier-border)';
                btn.style.cursor = 'pointer';
                btn.style.fontSize = '12px';

                // Store the custom colors if available so we can restore them
                let customBgColor = null;
                let customTextColor = null;
                
                // Apply custom colors if available from filterColors settings
                if (this.plugin.settings.filterColors && this.plugin.settings.filterColors[chip.value]) {
                    const colors = this.plugin.settings.filterColors[chip.value];
                    if (colors.textColor) {
                        customTextColor = colors.textColor;
                    }
                    if (colors.bgColor) {
                        customBgColor = colors.bgColor;
                    }
                }
                
                // Store colors as data attributes for persistence
                if (customBgColor) btn.dataset.customBg = customBgColor;
                if (customTextColor) btn.dataset.customText = customTextColor;
                
                // Apply styles with !important to ensure they stick
                if (customBgColor) {
                    btn.style.setProperty('background-color', customBgColor, 'important');
                } else {
                    btn.style.setProperty('background-color', 'var(--background-primary)', 'important');
                }
                
                if (customTextColor) {
                    btn.style.setProperty('color', customTextColor, 'important');
                } else {
                    btn.style.setProperty('color', 'var(--text-muted)', 'important');
                }
                
                try { btn.dataset.filterType = chip.type || ''; } catch (e) {}
                try { btn.dataset.filterValue = chip.value || ''; } catch (e) {}

                btn.addEventListener('mouseenter', () => {
                    if (!btn.hasClass('active')) {
                        // Use custom background color if available, otherwise default hover
                        if (customBgColor) {
                            btn.style.setProperty('background-color', customBgColor, 'important');
                            btn.style.filter = 'brightness(1.1)'; // Slight highlight on hover
                        } else {
                            btn.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
                        }
                    }
                });

                btn.addEventListener('mouseleave', () => {
                    if (!btn.hasClass('active')) {
                        // Reset to custom colors if available
                        if (customBgColor) {
                            btn.style.setProperty('background-color', customBgColor, 'important');
                        } else {
                            btn.style.setProperty('background-color', 'var(--background-primary)', 'important');
                        }
                        if (customTextColor) {
                            btn.style.setProperty('color', customTextColor, 'important');
                        } else {
                            btn.style.setProperty('color', 'var(--text-muted)', 'important');
                        }
                        btn.style.filter = ''; // Remove brightness filter
                    }
                });

                btn.addEventListener('click', async () => {
                    console.log('[SIDECARDS] 🔘 Filter button clicked, type:', chip.type, 'value:', chip.value);
                    
                    filterGroup.querySelectorAll('.card-filter-btn').forEach(b => {
                        const btnChip = b.dataset.filterValue;
                        b.removeClass('active');
                        // Get the stored custom colors for this button
                        const btnCustomBg = b.dataset.customBg || (this.plugin.settings.filterColors && this.plugin.settings.filterColors[btnChip]) ? this.plugin.settings.filterColors[btnChip].bgColor : null;
                        const btnCustomText = b.dataset.customText || (this.plugin.settings.filterColors && this.plugin.settings.filterColors[btnChip]) ? this.plugin.settings.filterColors[btnChip].textColor : null;
                        
                        // Restore to custom colors if they exist
                        if (btnCustomBg) {
                            b.style.setProperty('background-color', btnCustomBg, 'important');
                        } else {
                            b.style.setProperty('background-color', 'var(--background-primary)', 'important');
                        }
                        if (btnCustomText) {
                            b.style.setProperty('color', btnCustomText, 'important');
                        } else {
                            b.style.setProperty('color', 'var(--text-muted)', 'important');
                        }
                    });

                    const wasActive = btn.hasClass('active');
                    btn.removeClass('active');

                    
                    if (chip.type === 'archived' || chip.type === 'all') {
                        console.log('[SIDECARDS] 🔘 Archived/All button - calling loadCards with archived=' + (chip.type === 'archived'));
                        btn.addClass('active');
                        // For active state, use a brighter version of custom colors or default
                        if (customBgColor) {
                            btn.style.setProperty('background-color', customBgColor, 'important');
                            btn.style.filter = 'brightness(1.2)'; // Make active state brighter
                        } else {
                            btn.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
                        }
                        // Preserve custom text color if set
                        if (customTextColor) {
                            btn.style.setProperty('color', customTextColor, 'important');
                        } else {
                            btn.style.setProperty('color', 'var(--text-normal)', 'important');
                        }
                        // Clear any category filter when switching to 'all' or 'archived'
                        try { this.currentCategoryFilter = null; } catch (e) { this.currentCategoryFilter = null; }
                        
                        try { this.showLoadingOverlay(); } catch (e) {}
                        try {
                            try {
                                if (this.cardsContainer) {
                                    const oldCards = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
                                    oldCards.forEach(c => { try { c.style.visibility = 'hidden'; } catch (e) {} });
                                }
                            } catch (e) {}

                            await new Promise(r => setTimeout(r, 20));

                            this._isViewSwitch = true;
                            try {
                                if (chip.type === 'archived') {
                                    console.log('[SIDECARDS] 🔘 Calling loadCards(true) for archived');
                                    await this.loadCards(true);
                                } else {
                                    console.log('[SIDECARDS] 🔘 Calling loadCards(false) for all');
                                    await this.loadCards(false);
                                }
                            } finally {
                                this._isViewSwitch = false;
                            }

                            // Don't call applyFilters() here - loadCards() already handles card visibility
                            // applyFilters() would cause a redundant second load cycle
                            // Also don't call animateCardsEntrance() here - loadCardsPrioritized already calls it

                            try { this.hideLoadingOverlay(0); } catch (e) {}
                        } catch (e) {}
                    } else if (chip.type === 'category') {
                        console.log('[SIDECARDS] 🔘 Category button - type:', chip.type, 'wasActive:', wasActive);
                        const catId = String(chip.value || '').toLowerCase();
                        if (wasActive) {
                            
                            this.currentCategoryFilter = null;
                            
                            filterGroup.querySelectorAll('.card-filter-btn').forEach(b => { 
                                const btnChip = b.dataset.filterValue;
                                b.removeClass('active'); 
                                const btnBg = b.dataset.customBg || (this.plugin.settings.filterColors && this.plugin.settings.filterColors[btnChip]) ? this.plugin.settings.filterColors[btnChip].bgColor : null;
                                const btnText = b.dataset.customText || (this.plugin.settings.filterColors && this.plugin.settings.filterColors[btnChip]) ? this.plugin.settings.filterColors[btnChip].textColor : null;
                                
                                if (btnBg) {
                                    b.style.setProperty('background-color', btnBg, 'important');
                                } else {
                                    b.style.setProperty('background-color', 'var(--background-primary)', 'important');
                                }
                                if (btnText) {
                                    b.style.setProperty('color', btnText, 'important');
                                } else {
                                    b.style.setProperty('color', 'var(--text-muted)', 'important');
                                }
                            });
                            this.applyFilters();
                            return;
                        }

                        this.currentCategoryFilter = catId;
                        btn.addClass('active');
                        // For active state, use a brighter version of custom colors or default
                        if (customBgColor) {
                            btn.style.setProperty('background-color', customBgColor, 'important');
                            btn.style.filter = 'brightness(1.2)'; // Make active state brighter
                        } else {
                            btn.style.backgroundColor = 'var(--background-modifier-hover)';
                        }
                        // Preserve custom text color if set
                        if (!(this.plugin.settings.filterColors && this.plugin.settings.filterColors[chip.value] && this.plugin.settings.filterColors[chip.value].textColor)) {
                            btn.style.color = 'var(--text-normal)';
                        }
                        
                        // If the last load showed archived-only cards, reload the non-archived set
                        try {
                            if (this._lastLoadArchived) {
                                // This will reload all non-archived cards, so don't call applyFilters after
                                await this.scheduleLoadCards(false);
                            } else {
                                // If we're already showing non-archived cards, just apply the category filter
                                this.applyFilters();
                            }
                        } catch (e) {}

                    }
                });
            });
        }
    }
    
    

    
    animateCardsEntrance(options = {}) {
        try {
            if (!this.plugin || !this.plugin.settings) return;
            if (!this.cardsContainer) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            if (!this.plugin.settings.animatedCards) return;

            const els = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'))
                .filter(el => el && el.style && el.style.display !== 'none');
            if (!els || els.length === 0) return;

            const duration = options.duration != null ? options.duration : 260;
            const stagger = options.stagger != null ? options.stagger : 28;
            const offsetPx = options.offset != null ? Number(options.offset) : 28;
            
            els.forEach(el => {
                try {
                    el.style.transition = 'none';
                    try { el.style.visibility = ''; } catch (e) {}
                    el.style.transform = `translateY(${offsetPx}px)`;
                    el.style.opacity = this.plugin.settings.disableCardFadeIn ? '1' : '0';
                    el.style.willChange = 'transform, opacity';
                } catch (e) { }
            });

            void this.cardsContainer.offsetHeight;

            els.forEach((el, i) => {
                const delay = i * stagger;
                setTimeout(() => {
                    try {
                        const transitions = [`transform ${duration}ms cubic-bezier(.2,.8,.2,1)`];
                        if (!this.plugin.settings.disableCardFadeIn) {
                            transitions.push(`opacity ${duration}ms ease-out`);
                        }
                        el.style.transition = transitions.join(', ');
                        el.style.transform = '';
                        el.style.opacity = '1';
                    } catch (e) { }
                }, delay);
            });

            const total = duration + (els.length * stagger) + 50;
            setTimeout(() => {
                els.forEach(el => {
                    try {
                        el.style.transition = '';
                        el.style.willChange = '';
                        el.style.transform = '';
                        el.style.opacity = '';
                    } catch (e) { }
                });
            }, total);
        } catch (err) {
            console.error('Error running animateCardsEntrance:', err);
        }
    }

    
    // Implement FLIP animation technique for smooth card reordering and transitions
    async flipAnimateAsync(asyncDomChange, opts = {}) {
        try {
            if (!this.plugin || !this.plugin.settings || !this.plugin.settings.animatedCards) {
                await asyncDomChange();
                return;
            }

            if (!this.cardsContainer) { await asyncDomChange(); return; }
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                await asyncDomChange();
                return;
            }

            const duration = opts.duration != null ? opts.duration : 260;
            const easing = opts.easing || 'cubic-bezier(.2,.8,.2,1)';
            const stagger = opts.stagger != null ? opts.stagger : 20;
            const entranceOffset = opts.offset != null ? Number(opts.offset) : 28;

            
            const oldEls = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
            const oldMap = new Map();
            oldEls.forEach(el => {
                try {
                    const id = el.dataset && el.dataset.id;
                    if (!id) return;
                    oldMap.set(id, el.getBoundingClientRect());
                } catch (e) {}
            });

            
            await asyncDomChange();

            
            const newEls = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
            const newMap = new Map();
            const elById = new Map();
            newEls.forEach(el => {
                try {
                    const id = el.dataset && el.dataset.id;
                    if (!id) return;
                    newMap.set(id, el.getBoundingClientRect());
                    elById.set(id, el);
                } catch (e) {}
            });

            
            const ids = Array.from(elById.keys());
            ids.forEach(id => {
                try {
                    const oldRect = oldMap.get(id);
                    const newRect = newMap.get(id);
                    const el = elById.get(id);
                    if (!oldRect || !newRect || !el) return;
                    const dx = oldRect.left - newRect.left;
                    const dy = oldRect.top - newRect.top;
                    if (dx === 0 && dy === 0) return;
                    
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${dy}px)`;
                    el.style.willChange = 'transform';
                } catch (e) { }
            });

            
            ids.forEach(id => {
                try {
                    if (oldMap.has(id)) return;
                    const el = elById.get(id);
                    if (!el) return;
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${entranceOffset}px)`;
                    el.style.willChange = 'transform';
                } catch (e) { }
            });

            
            void this.cardsContainer.offsetHeight;

            ids.forEach((id, i) => {
                const el = elById.get(id);
                if (!el) return;
                const delay = i * stagger;
                setTimeout(() => {
                    try {
                        
                        const existingIds = [];
                        const newIds = [];
                        ids.forEach(id => {
                            if (oldMap.has(id)) existingIds.push(id);
                            else newIds.push(id);
                        });

                        
                        existingIds.forEach(id => {
                            try {
                                const oldRect = oldMap.get(id);
                                const newRect = newMap.get(id);
                                const el = elById.get(id);
                                if (!oldRect || !newRect || !el) return;
                                const dx = oldRect.left - newRect.left;
                                const dy = oldRect.top - newRect.top;
                                if (dx === 0 && dy === 0) return;
                                el.style.transition = 'none';
                                el.style.transform = `translateY(${dy}px)`;
                                el.style.willChange = 'transform';
                            } catch (e) { }
                        });

                        
                        newIds.forEach(id => {
                            try {
                                const el = elById.get(id);
                                if (!el) return;
                                el.style.transition = 'none';
                                el.style.transform = `translateY(${entranceOffset}px)`;
                                el.style.willChange = 'transform';
                                
                                el.style.visibility = 'hidden';
                            } catch (e) { }
                        });

                        el.style.transform = '';
                    } catch (e) {}
                });
            }, total);
        } catch (err) {
            console.error('Error in flipAnimateAsync:', err);
            
            try { await asyncDomChange(); } catch (e) {}
        }
    }

    
    showLoadingOverlay(maxMs = 2000) {
        try {
            
            const parent = this.cardsContainer || this.containerEl;
            if (!parent) return;

            if (!this._loadingEl) {
                const overlay = parent.createDiv();
                overlay.addClass('card-sidebar-loading');
                
                try {
                    if (parent === this.cardsContainer) parent.style.position = parent.style.position || 'relative';
                } catch (e) {}

                overlay.style.position = 'absolute';
                overlay.style.left = '0';
                overlay.style.top = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.background = 'var(--background-modifier-card, rgba(0,0,0,0.02))';
                overlay.style.zIndex = '9999';
                overlay.style.pointerEvents = 'auto';

                const box = overlay.createDiv();
                box.style.display = 'flex';
                box.style.flexDirection = 'column';
                box.style.alignItems = 'center';
                box.style.gap = '8px';

                const spinner = box.createDiv();
                spinner.style.width = '36px';
                spinner.style.height = '36px';
                spinner.style.border = '4px solid var(--background-modifier-border)';
                spinner.style.borderTopColor = 'var(--interactive-accent)';
                spinner.style.borderRadius = '50%';
                spinner.style.animation = 'card-sidebar-spin 800ms linear infinite';

                const txt = box.createDiv();
                txt.textContent = 'Loading cards…';
                txt.style.color = 'var(--text-muted)';

                
                if (!document.getElementById('card-sidebar-loading-anim')) {
                    const s = document.createElement('style');
                    s.id = 'card-sidebar-loading-anim';
                    s.textContent = `@keyframes card-sidebar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
                    document.head.appendChild(s);
                }

                this._loadingEl = overlay;
            }

            
            
            try { this._loadingEl.style.display = 'none'; } catch (e) {}

            if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
            this._loadingTimeout = setTimeout(() => {
                try { if (this._loadingEl) { try { this._loadingEl.remove(); } catch (e) { this._loadingEl.style.display = 'none'; } this._loadingEl = null; } } catch (e) {}
            }, Math.max(0, Number(maxMs) || 2000));
        } catch (err) {
            console.error('Error showing loading overlay:', err);
        }
    }

    
    hideLoadingOverlay(fadeMs = 0) {
        try {
            if (this._loadingTimeout) { clearTimeout(this._loadingTimeout); this._loadingTimeout = null; }
            if (this._loadingEl) {
                try { this._loadingEl.remove(); } catch (e) { try { this._loadingEl.style.display = 'none'; } catch (ee) {} }
                this._loadingEl = null;
            }

            
            try {
                
                
                
                const fadeMsNum = Number(fadeMs) || 0;
                const disabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.disableCardFadeIn);
                const animated = !!(this.plugin && this.plugin.settings && this.plugin.settings.animatedCards);
                const doFade = fadeMsNum > 0 && (!disabled || animated);
                if (doFade) {
                    this.fadeVisibleCards(fadeMsNum);
                }
            } catch (e) { }
        } catch (err) {
            console.error('Error hiding loading overlay:', err);
        }
    }

    
    fadeVisibleCards(duration = 300) {
        try {
            if (!this.cardsContainer) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const els = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'))
                .filter(el => el && el.style && el.style.display !== 'none');
            if (!els || els.length === 0) return;

            
            els.forEach(el => {
                try {
                    el.style.transition = 'none';
                    el.style.opacity = '0';
                } catch (e) { }
            });

            
            void this.cardsContainer.offsetHeight;

            
            els.forEach(el => {
                try {
                    el.style.transition = `opacity ${duration}ms ease`;
                    el.style.opacity = '1';
                } catch (e) { }
            });

            
            setTimeout(() => {
                els.forEach(el => {
                    try {
                        el.style.transition = '';
                        el.style.opacity = '';
                    } catch (e) { }
                });
            }, duration + 50);
        } catch (err) {
            console.error('Error running fadeVisibleCards:', err);
        }
    }
    
    showSearchModal() {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Search Cards');
        
        const searchContainer = modal.contentEl.createDiv();
        searchContainer.style.padding = '0 0 8px 0';
        
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search cards...'
        });
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px';
        
        const resultsContainer = modal.contentEl.createDiv();
        resultsContainer.style.maxHeight = '400px';
        resultsContainer.style.overflow = 'auto';
        
        let selectedIndex = -1;
        const searchResults = [];

        const updateSelection = () => {
            const els = resultsContainer.querySelectorAll('.search-result');
            els.forEach(el => el.removeClass('selected'));
            if (selectedIndex >= 0 && selectedIndex < els.length) {
                const sel = els[selectedIndex];
                if (sel) {
                    sel.addClass('selected');
                    sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }
        };

        const renderResults = () => {
            const query = searchInput.value.toLowerCase();
            resultsContainer.empty();
            searchResults.length = 0;
            selectedIndex = -1;

            this.cards.forEach(cardData => {
                if (cardData.content.toLowerCase().includes(query)) {
                    const idx = searchResults.length;
                    searchResults.push(cardData);

                    const result = resultsContainer.createDiv();
                    result.addClass('search-result');
                    result.style.padding = '8px';
                    result.style.margin = '4px 0';
                    result.style.cursor = 'pointer';
                    result.style.borderRadius = '4px';
                    result.style.borderLeft = `4px solid ${cardData.color}`;
                    result.textContent = cardData.content;
                    result.dataset.index = String(idx);
                    result.tabIndex = 0;

                    result.addEventListener('mouseenter', () => {
                        selectedIndex = idx;
                        updateSelection();
                    });

                    result.addEventListener('mouseleave', () => {
                    });

                    result.addEventListener('click', () => {
                        const cd = searchResults[idx];
                        if (cd) {
                            cd.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            cd.element.style.animation = 'highlight 2s';
                            modal.close();
                        }
                    });
                }
            });

            if (searchResults.length > 0) {
                selectedIndex = 0;
                updateSelection();
            }
        };

        searchInput.addEventListener('input', () => {
            renderResults();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (searchResults.length === 0) return;
                selectedIndex = Math.min(searchResults.length - 1, Math.max(0, selectedIndex + 1));
                updateSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (searchResults.length === 0) return;
                selectedIndex = Math.max(0, selectedIndex - 1);
                updateSelection();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
                    const cd = searchResults[selectedIndex];
                    if (cd) {
                        cd.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        cd.element.style.animation = 'highlight 2s';
                        modal.close();
                    }
                }
            } else if (e.key === 'Escape') {
                modal.close();
            }
        });

        renderResults();
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes highlight {
                0% { background-color: var(--background-modifier-hover); }
                100% { background-color: transparent; }
            }
        `;
        document.head.appendChild(style);
        
        modal.open();
        searchInput.focus();
    }

    createFixedInputBox(container) {
        const inputContainer = container.createDiv();
        inputContainer.addClass('card-sidebar-input-container');
        inputContainer.style.padding = '8px';
        inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        inputContainer.style.background = 'var(--background-primary)';
        inputContainer.style.position = 'sticky';
        inputContainer.style.bottom = '0';

        const input = inputContainer.createEl('textarea');
        input.addClass('card-sidebar-input');
        input.placeholder = 'Type your idea here...';
        input.rows = 1;
        input.style.width = '100%';
        input.style.minHeight = '36px';
        input.style.maxHeight = '200px';
        input.style.padding = '8px';
        input.style.border = '1px solid var(--background-modifier-border)';
        input.style.borderRadius = '4px';
        input.style.resize = 'vertical';
        input.style.overflowY = 'hidden';

        const autoResize = () => {
            input.style.height = 'auto';
            input.style.height = (input.scrollHeight) + 'px';
        };

        input.addEventListener('input', autoResize);
        input.addEventListener('keydown', (e) => {
            let pressed = '';
            if (e.ctrlKey) pressed += 'ctrl-';
            if (e.shiftKey) pressed += 'shift-';
            if (e.altKey) pressed += 'alt-';
            if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';

            const normalizeKey = (v) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
            const nextLineKey = normalizeKey(this.plugin.settings.nextLineKey || 'shift-enter');

            if (pressed === saveKey) {
                e.preventDefault();
                this.addCardFromInput(input);
                return;
            }

            if (pressed === nextLineKey) {
                e.preventDefault();
                try {
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const val = input.value;
                    input.value = val.slice(0, start) + '\n' + val.slice(end);
                    input.selectionStart = input.selectionEnd = start + 1;
                    setTimeout(autoResize, 0);
                } catch (err) {
                    console.error('Error inserting newline into textarea:', err);
                }
                return;
            }

            setTimeout(autoResize, 0);
        });

        setTimeout(autoResize, 0);

        const buttonContainer = inputContainer.createDiv();
        buttonContainer.addClass('card-sidebar-button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.marginTop = '8px';

        const searchBtn = buttonContainer.createEl('button');
        searchBtn.addClass('card-search-btn');
        searchBtn.setAttribute('aria-label', 'Search cards');
        searchBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        searchBtn.style.background = 'none';
        searchBtn.style.border = 'none';
        searchBtn.style.cursor = 'pointer';
        searchBtn.style.padding = '4px';
        searchBtn.style.color = 'var(--text-muted)';
        searchBtn.style.display = 'flex';
        searchBtn.style.alignItems = 'center';
        searchBtn.style.justifyContent = 'center';

        searchBtn.addEventListener('mouseenter', () => {
            searchBtn.style.color = 'var(--text-normal)';
        });
        searchBtn.addEventListener('mouseleave', () => {
            searchBtn.style.color = 'var(--text-muted)';
        });
        searchBtn.addEventListener('click', () => {
            try {
                if (this._searchWrap) {
                    this._searchWrap.style.display = (this._searchWrap.style.display === 'none') ? '' : 'none';
                    if (this._searchWrap.style.display !== 'none' && this._searchInput) {
                        try { this._searchInput.focus(); } catch (e) {}
                    }
                    if (typeof this.updateSearchChips === 'function') this.updateSearchChips();
                }
            } catch (e) { console.error('Error toggling search bar:', e); }
        });

        const reloadBtn = buttonContainer.createEl('button');
        reloadBtn.addClass('card-reload-btn');
        reloadBtn.setAttribute('aria-label', 'Reload cards');
        reloadBtn.title = 'Reload cards';
        reloadBtn.style.background = 'none';
        reloadBtn.style.border = 'none';
        reloadBtn.style.cursor = 'pointer';
        reloadBtn.style.padding = '4px';
        reloadBtn.style.color = 'var(--text-muted)';
        reloadBtn.style.display = 'flex';
        reloadBtn.style.alignItems = 'center';
        reloadBtn.style.justifyContent = 'center';
        try {
            setIcon(reloadBtn, 'refresh-cw');
        } catch (e) {
            reloadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="reload-icon"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>`;
        }

        reloadBtn.addEventListener('mouseenter', () => { reloadBtn.style.color = 'var(--text-normal)'; });
        reloadBtn.addEventListener('mouseleave', () => { reloadBtn.style.color = 'var(--text-muted)'; });

        reloadBtn.addEventListener('click', async () => {
            try {
                this._justReloaded = Date.now();
                const activeBtn = this.containerEl.querySelector('.card-filter-btn.active');
                const activeText = activeBtn ? activeBtn.textContent.toLowerCase() : 'all';
                const showArchived = activeText === 'archived';

                await this.scheduleLoadCards(showArchived);
                // Don't call applyFilters here - loadCards already renders cards with proper visibility
                // Calling applyFilters causes unnecessary hide/show cycles

                new Notice('Cards reloaded');
            } catch (err) {
                console.error('Error reloading cards:', err);
                new Notice('Error reloading cards (see console)');
            }
        });

        const sortBtn = buttonContainer.createEl('button');
        sortBtn.addClass('card-sort-btn');
        sortBtn.setAttribute('aria-label', 'Sort cards');
        sortBtn.title = 'Sort cards';
        sortBtn.style.background = 'none';
        sortBtn.style.border = 'none';
        sortBtn.style.cursor = 'pointer';
        sortBtn.style.padding = '4px';
        sortBtn.style.color = 'var(--text-muted)';
        try { setIcon(sortBtn, 'filter'); } catch (e) { sortBtn.textContent = '↕'; }

        sortBtn.addEventListener('mouseenter', () => { sortBtn.style.color = 'var(--text-normal)'; });
        sortBtn.addEventListener('mouseleave', () => { sortBtn.style.color = 'var(--text-muted)'; });

        sortBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = new Menu(this.app);

            const modes = [
                { key: 'manual', label: 'Manual sorting' },
                { key: 'created', label: 'Sort by time created' },
                { key: 'modified', label: 'Sort by date modified' },
                { key: 'alpha', label: 'Sort A → Z' },
                { key: 'status', label: 'Sort by status' }
            ];

            modes.forEach(m => {
                menu.addItem(item => {
                    item.setTitle(m.label);
                    if (this.plugin.settings.sortMode === m.key) item.setChecked(true);
                    item.onClick(async () => {
                        try {
                            const currentMode = this.plugin.settings.sortMode;
                            const newMode = m.key;
                            // If selecting the same mode, do nothing
                            if (currentMode === newMode) return;
                            
                            this.plugin.settings.sortMode = newMode;
                            if (this.plugin.saveSettings) await this.plugin.saveSettings();
                            if (typeof this.applySort === 'function') {
        try { this.plugin.debugLog('sidecards: calling applySort (sort menu selection)', { from: currentMode, to: newMode }); } catch (e) {}
                                await this.applySort(newMode, this.plugin.settings.sortAscending);
                            }
                        } catch (err) { console.error('Error applying sort mode', err); }
                    });
                });
            });

            menu.addSeparator();
            menu.addItem(item => {
                item.setTitle(this.plugin.settings.sortAscending ? 'Ascending' : 'Descending');
                item.setIcon(this.plugin.settings.sortAscending ? 'arrow-up' : 'arrow-down');
                item.onClick(async () => {
                    try {
                        this.plugin.settings.sortAscending = !this.plugin.settings.sortAscending;
                        if (this.plugin.saveSettings) this.plugin.saveSettings();
                        if (typeof this.applySort === 'function') {
                            try { 
                                this.plugin.debugLog('sidecards: calling applySort (toggle sort direction)', { 
                                    mode: this.plugin.settings.sortMode,
                                    ascending: this.plugin.settings.sortAscending 
                                }); 
                            } catch (e) {}
                            await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending);
                        }
                    } catch (err) { console.error('Error toggling sort direction', err); }
                });
            });

            menu.showAtMouseEvent(e);
        });

        const untaggedBtn = buttonContainer.createEl('button');
        untaggedBtn.addClass('card-untagged-filter-btn');
        untaggedBtn.setAttribute('aria-label', 'Show untagged only');
        untaggedBtn.title = 'Show untagged only';
        untaggedBtn.style.background = 'none';
        untaggedBtn.style.border = 'none';
        untaggedBtn.style.cursor = 'pointer';
        untaggedBtn.style.padding = '4px';
        untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
        try { setIcon(untaggedBtn, 'tag'); } catch (e) { untaggedBtn.textContent = '∅'; }
        untaggedBtn.addEventListener('mouseenter', () => { untaggedBtn.style.color = 'var(--text-normal)'; });
        untaggedBtn.addEventListener('mouseleave', () => { untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)'; });
        untaggedBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.activeFilters.untaggedOnly = !this.activeFilters.untaggedOnly;
            untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
            this.applyFilters();
        });
        try { buttonContainer.insertBefore(untaggedBtn, sortBtn); } catch (e) {}

        const pinToggleBtn = buttonContainer.createEl('button');
        pinToggleBtn.addClass('card-pin-toggle-btn');
        pinToggleBtn.setAttribute('aria-label', 'Show pinned only');
        pinToggleBtn.title = 'Show pinned only';
        pinToggleBtn.style.background = 'none';
        pinToggleBtn.style.border = 'none';
        pinToggleBtn.style.cursor = 'pointer';
        pinToggleBtn.style.padding = '4px';
        pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
        try { setIcon(pinToggleBtn, 'pin'); } catch (e) { pinToggleBtn.textContent = '📌'; }

        pinToggleBtn.addEventListener('mouseenter', () => { pinToggleBtn.style.color = 'var(--text-normal)'; });
        pinToggleBtn.addEventListener('mouseleave', () => { pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)'; });

        pinToggleBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                this.plugin.settings.showPinnedOnly = !this.plugin.settings.showPinnedOnly;
                if (this.plugin.saveSettings) this.plugin.saveSettings();
                pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
                if (typeof this.applyFilters === 'function') this.applyFilters();
            } catch (err) { console.error('Error toggling showPinnedOnly', err); }
        });

        const gridToggleBtn = buttonContainer.createEl('button');
        gridToggleBtn.addClass('card-grid-toggle-btn');
        gridToggleBtn.setAttribute('aria-label', 'Toggle grid layout');
        gridToggleBtn.title = 'Toggle grid layout';
        gridToggleBtn.style.background = 'none';
        gridToggleBtn.style.border = 'none';
        gridToggleBtn.style.cursor = 'pointer';
        gridToggleBtn.style.padding = '4px';
        gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)';
        try { setIcon(gridToggleBtn, 'layout-grid'); } catch (e) { gridToggleBtn.textContent = '▦'; }
        gridToggleBtn.addEventListener('mouseenter', () => { gridToggleBtn.style.color = 'var(--text-normal)'; });
        gridToggleBtn.addEventListener('mouseleave', () => { gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)'; });
        gridToggleBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                this.plugin.settings.verticalCardMode = !this.plugin.settings.verticalCardMode;
                await this.plugin.saveSettings();
                gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)';
                try { if (this.cardsContainer) this.cardsContainer.style.visibility = 'hidden'; } catch (e) {}
                this.applyLayoutMode();
                try { if (this.plugin.settings.verticalCardMode) this.refreshMasonrySpans(); } catch (e) {}
                const showAfter = () => {
                    try { if (this.cardsContainer) this.cardsContainer.style.visibility = ''; } catch (e) {}
                    try { this.animateCardsEntrance(); } catch (e) {}
                };
                if (window.requestAnimationFrame) requestAnimationFrame(() => showAfter()); else setTimeout(showAfter, 0);
            } catch (err) { console.error('Error toggling grid layout', err); }
        });

        const addButton = buttonContainer.createEl('button');
        addButton.addClass('card-add-btn');
        addButton.textContent = 'Add Card';
        addButton.addClass('mod-cta');
        addButton.style.marginLeft = 'auto';
        addButton.addEventListener('click', () => {
            this.addCardFromInput(input);
        });

        const clearButton = buttonContainer.createEl('button');
        clearButton.addClass('card-clear-btn');
        clearButton.textContent = 'Clear';
        clearButton.addEventListener('click', () => {
            input.value = '';
            input.focus();
        });
        try { this._clearButton = clearButton; } catch (e) { }
        try { clearButton.style.display = (this.plugin.settings.hideClearButton != null ? (this.plugin.settings.hideClearButton ? 'none' : '') : 'none'); } catch (e) { }

        input.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.addCardFromInput(input);
            }
        });
    }

    getFormattedDate() {
        const now = new Date();
        return now.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: '2-digit'
        }) + ', ' + now.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async addCardFromInput(input, filterInfo = {}) {
        const content = input.value.trim();
        if (!content) return;

        // Extract filter type, value, color, and tags from the input
        const filterType = filterInfo.filterType || '';
        const filterValue = filterInfo.filterValue || '';
        const selectedColor = filterInfo.selectedColor || 'var(--card-color-1)';
        const additionalTags = filterInfo.tags || [];
        
        // Determine category and additional metadata
        let category = '';
        let archived = false;
        let pinned = false;
        let tagsArray = [...additionalTags]; // Start with provided tags
        
        if (filterType === 'today') {
            category = 'Today';
            if (!tagsArray.includes('today')) tagsArray.push('today');
        } else if (filterType === 'tomorrow') {
            category = 'Tomorrow';
            if (!tagsArray.includes('tomorrow')) tagsArray.push('tomorrow');
        } else if (filterType === 'archived') {
            category = 'Archived';
            archived = true;
        } else if (filterType === 'pinned') {
            category = 'Pinned';
            pinned = true;
        } else if (filterType === 'category' && filterValue) {
            category = filterValue;
        }

        // Create card in memory (without frontmatter displayed)
        const cardData = this.createCard(content, { 
            category: category,
            archived: archived,
            pinned: pinned,
            tags: tagsArray,
            color: selectedColor
        });
        
        try {
            const folder = this.plugin.settings.storageFolder || '';
            if (folder && !(await this.app.vault.adapter.exists(folder))) {
                await this.app.vault.createFolder(folder);
            }

            // Get the first sentence (up to the period) for filename
            const firstSentence = (content.split('.')[0] || content).trim();
            let title = firstSentence.substring(0, 50); // Limit title length
            const timestamp = new Date();
            let fileName = `${title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()} ${timestamp.getHours().toString().padStart(2, '0')}${timestamp.getMinutes().toString().padStart(2, '0')}`;
            let filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
            if (await this.app.vault.adapter.exists(filePath)) {
                fileName += `-${Date.now()}`;
                filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
            }

            // Build frontmatter
            const createdDate = new Date(cardData.created);
            const pad = n => String(n).padStart(2, '0');
            const yamlDate = `${pad(createdDate.getDate())}${createdDate.toLocaleString('en-US', { month: 'short' })}${String(createdDate.getFullYear()).slice(-2)}, ${pad(createdDate.getHours())}:${pad(createdDate.getMinutes())}`;

            let tagArray = (tagsArray || []).map(t => String(t).trim()).filter(t => t.length > 0);
            const tagsYaml = tagArray.length > 0 ? ('Tags:\n' + tagArray.map(t => `  - ${t}`).join('\n')) : 'Tags: []';
            
            let colorKey = 'color-1';
            let colorLabel = '';
            try {
                const cv = selectedColor || '';
                const m = String(cv).match(/--card-color-(\d+)/);
                if (m) {
                    colorKey = `color-${m[1]}`;
                    colorLabel = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[Number(m[1]) - 1]) || '';
                } else if (cv && cv.startsWith('#')) {
                    colorKey = cv;
                }
            } catch (e) { }

            const colorLine = `card-color: ${colorKey}`;
            const colorNameLine = colorLabel ? `card-color-name: "${String(colorLabel).replace(/"/g, '\\"')}"` : 'card-color-name: "Gray"';

            // Build full frontmatter
            let frontmatterLines = [
                '---',
                tagsYaml,
                colorLine,
                colorNameLine,
                `Created-Date: ${yamlDate}`
            ];

            if (archived) {
                frontmatterLines.push('Archived: true');
            }
            
            if (pinned) {
                frontmatterLines.push('Pinned: true');
            }
            
            if (category) {
                frontmatterLines.push(`Category: ${String(category).replace(/\n/g, ' ')}`);
            }

            frontmatterLines.push('---');

            const noteContent = frontmatterLines.join('\n') + '\n\n' + content;

            await this.app.vault.create(filePath, noteContent);
            
            // Force a small delay to ensure file is fully written to disk
            await new Promise(r => setTimeout(r, 50));
            
            // Force vault to recognize the new file
            try {
                const folder = filePath.split('/').slice(0, -1).join('/');
                await this.app.vault.adapter.list(folder);
            } catch (e) {
                this.plugin.debugLog("Could not refresh folder cache after card creation:", e);
            }

            cardData.notePath = filePath;
            await this.saveCards();
            
            // Reload cards to ensure new card appears in sidebar
            try {
                await new Promise(r => setTimeout(r, 50));
                
                // Force re-import from folder to get all cards including the one we just created
                const folder = this.plugin.settings.storageFolder;
                if (folder && folder !== '/') {
                    try {
                        await this.plugin.importNotesFromFolderToSettings(folder, true);
                    } catch (e) {
                        this.plugin.debugLog("Could not re-import from folder after card creation:", e);
                    }
                }
                
                // Clear any active filters to ensure new card is visible
                this.currentCategoryFilter = null;
                this.activeFilters = { query: '', tags: [], status: null };
                
                await this.scheduleLoadCards(this._lastLoadArchived || false);
                await this.applyFilters();
                await this.animateCardsEntrance({ duration: 300, offset: 28 });
            } catch (e) {
                console.error('Error reloading cards after addCardFromInput:', e);
            }

        } catch (error) {
            console.error('Error auto-saving card to note:', error);
            new Notice('Error saving card to note');
        }

        input.value = '';
        input.focus();
        
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    }

    createCard(content, options = {}) {
        const card = document.createElement('div');
        card.addClass('card-sidebar-card');
        card.style.position = 'relative';
        card.style.width = '100%';

        const cardColor = options.color || 'var(--card-color-1)';
        this.applyCardColorToElement(card, cardColor);
        card.setAttribute('draggable', 'true');

        const pillBar = card.createDiv();
        pillBar.addClass('card-pill-bar');
        pillBar.style.display = 'flex';
        pillBar.style.gap = '6px';
        pillBar.style.alignItems = 'center';
        pillBar.style.marginBottom = '6px';

        const contentEl = card.createDiv();
        contentEl.addClass('card-content');
        contentEl.setAttribute('tabindex', '0');
        const renderingDisabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.disableCardRendering);
        if (renderingDisabled) {
            contentEl.setAttribute('contenteditable', 'true');
            contentEl.textContent = content;
        } else {
            contentEl.setAttribute('contenteditable', 'false');
            // PERFORMANCE: Defer markdown rendering to avoid blocking card creation
            // Set plain text first, then render asynchronously
            contentEl.textContent = content;
            
            // Queue this for deferred rendering
            if (!this._deferredRenderQueue) this._deferredRenderQueue = [];
            this._deferredRenderQueue.push({
                contentEl,
                content: String(content || ''),
                notePath: options.notePath || ''
            });
        }

        contentEl.addEventListener('click', (ev) => {
            try {
                if (renderingDisabled) return;
                if (contentEl.getAttribute('contenteditable') === 'false') {
                    ev.stopPropagation();
                    contentEl.setAttribute('contenteditable', 'true');
                    const cd = this.cards.find(c => c.element === card);
                    contentEl.empty();
                    contentEl.textContent = cd && cd.content != null ? cd.content : content;
                    setTimeout(() => { try { contentEl.focus(); } catch (_) {} }, 0);
                }
            } catch (_) {}
        });

        contentEl.addEventListener('blur', () => {
            try {
                const text = contentEl.innerText != null ? contentEl.innerText : contentEl.textContent;
                this.updateCardContent(card, text);
            } catch (e) {
                this.updateCardContent(card, contentEl.innerHTML);
            }
            if (renderingDisabled) {
                try {
                    const cd = this.cards.find(c => c.element === card);
                    contentEl.setAttribute('contenteditable', 'true');
                    contentEl.empty();
                    contentEl.textContent = (cd && cd.content) || '';
                } catch (_) {}
            } else {
                try {
                    const cd = this.cards.find(c => c.element === card);
                    contentEl.setAttribute('contenteditable', 'false');
                    contentEl.empty();
                    MarkdownRenderer.render(this.app, String((cd && cd.content) || ''), contentEl, (cd && cd.notePath) || options.notePath || '');
                    
                    // CRITICAL FIX: Always reapply the correct color after editing
                    // This ensures status color inheritance is maintained
                    if (cd) {
                        setTimeout(() => {
                            try {
                                this.applyCardColor(cd, card);
                            } catch (e) {
                                this.plugin.debugLog('Error applying card color after edit:', e);
                            }
                        }, 0);
                    }
                } catch (_) {}
            }
        });

        const insertLineBreakInContentEditable = (el) => {
            try {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                const br = document.createElement('br');
                range.deleteContents();
                range.insertNode(br);
                const newRange = document.createRange();
                newRange.setStartAfter(br);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } catch (err) {
                console.error('Error inserting line break into contenteditable:', err);
            }
        };

        contentEl.addEventListener('keydown', (e) => {
            let pressed = '';
            if (e.ctrlKey) pressed += 'ctrl-';
            if (e.shiftKey) pressed += 'shift-';
            if (e.altKey) pressed += 'alt-';
            if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';

            const normalizeKey = (v) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
            const nextLineKey = normalizeKey(this.plugin.settings.nextLineKey || 'shift-enter');

            if (pressed === saveKey) {
                e.preventDefault();
                contentEl.blur();
                return;
            }

            if (pressed === nextLineKey) {
                e.preventDefault();
                insertLineBreakInContentEditable(contentEl);
                return;
            }

            const wrapSelectionEditable = (el, before, after) => {
                try {
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;
                    const range = sel.getRangeAt(0);
                    if (!el.contains(range.startContainer)) return;
                    const text = range.toString();
                    const node = document.createTextNode(before + text + after);
                    range.deleteContents();
                    range.insertNode(node);
                    const newRange = document.createRange();
                    newRange.setStart(node, (before + text + after).length);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } catch (err) {}
            };

            if (e.ctrlKey && !e.shiftKey && !e.altKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === 'b') { e.preventDefault(); wrapSelectionEditable(contentEl, '**', '**'); return; }
                if (k === 'i') { e.preventDefault(); wrapSelectionEditable(contentEl, '*', '*'); return; }
                if (k === 'k') { e.preventDefault(); wrapSelectionEditable(contentEl, '[', ']( )'); return; }
                if (k === '`') { e.preventDefault(); wrapSelectionEditable(contentEl, '`', '`'); return; }
            }
        });

        const footer = card.createDiv();

        const leftSection = footer.createDiv();
        leftSection.addClass('card-footer-left');

        const createTimestampNode = (parent) => {
            const ts = parent.createDiv();
            ts.addClass('card-timestamp');
            const createdISO = options.created || new Date().toISOString();
            ts.textContent = this.formatTimestamp(createdISO);
            return ts;
        };

        const createTagsNode = (parent) => {
            const tagsEl = parent.createDiv();
            tagsEl.addClass('card-tags');
            (options.tags || []).forEach(t => {
                const tagText = (this.plugin.settings.omitTagHash ? t : `#${t}`);
                const tagEl = tagsEl.createDiv();
                tagEl.addClass('card-tag');
                tagEl.textContent = tagText;
                try {
                    tagEl.style.cursor = 'pointer';
                    tagEl.addEventListener('click', (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        try {
                            if (this._searchWrap) this._searchWrap.style.display = '';
                            const rawTag = String(t).replace(/^#/, '');
                            if (!this.activeFilters.tags) this.activeFilters.tags = [];
                            if (!this.activeFilters.tags.includes(rawTag)) this.activeFilters.tags.push(rawTag);
                            if (this._searchInput) this._searchInput.value = '';
                            this.activeFilters.query = '';
                            if (typeof this.updateSearchChips === 'function') this.updateSearchChips();
                            this.applyFilters();
                        } catch (err) { console.error('Error applying tag filter:', err); }
                    });
                } catch (e) { }
            });
            return tagsEl;
        };

        if (!options.detached) {
            if (this.plugin.settings.timestampBelowTags && options.tags && options.tags.length > 0) {
                const tagsEl = createTagsNode(leftSection);
                if (this.plugin.settings.showTimestamps) {
                    createTimestampNode(leftSection);
                }
            } else {
                if (this.plugin.settings.showTimestamps) {
                    createTimestampNode(leftSection);
                }
                if (options.tags && options.tags.length > 0) {
                    const tagsEl = createTagsNode(leftSection);
                    if (!this.plugin.settings.groupTags) tagsEl.remove();
                }
            }
        }

        const rightSection = footer.createDiv();
        rightSection.addClass('card-footer-right');

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showCardContextMenu(card, e);
        });

        const id = options.id || Date.now().toString();
        const expiryPill = pillBar.createDiv();
        expiryPill.addClass('card-expiry-pill');
        expiryPill.style.padding = '2px 6px';
        expiryPill.style.borderRadius = '999px';
        expiryPill.style.fontSize = '11px';
        expiryPill.style.display = 'none';

        const statusPill = pillBar.createDiv();
        statusPill.addClass('card-status-pill');
        statusPill.style.padding = '2px 6px';
        statusPill.style.borderRadius = '999px';
        statusPill.style.fontSize = '11px';
        statusPill.style.display = 'none';
        statusPill.style.cursor = 'pointer';

        // Add click listener to status pill for filtering
        statusPill.addEventListener('click', (e) => {
            try {
                e.stopPropagation();
                const statusName = statusPill.textContent.trim();
                if (statusName) {
                    // Open search bar
                    if (this._searchWrap) this._searchWrap.style.display = '';
                    // Add status as a filter chip
                    if (!this.activeFilters) this.activeFilters = {};
                    this.activeFilters.status = statusName;
                    // Add status chip to search bar
                    if (typeof this.updateSearchChips === 'function') this.updateSearchChips();
                    this.applyFilters();
                }
            } catch (err) { console.error('Error filtering by status:', err); }
        });

        const updateCardPadding = () => {
            try {
                const anyVisible = (expiryPill.style.display !== 'none') || (statusPill.style.display !== 'none');
                if (anyVisible) { card.classList.add('has-pills'); }
                else { card.classList.remove('has-pills'); }
            } catch (e) {}
        };

        const hexToRGBA = (hex, alpha) => {
            try {
                const h = hex.replace('#','');
                const bigint = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
                const r = (bigint >> 16) & 255;
                const g = (bigint >> 8) & 255;
                const b = bigint & 255;
                const a = Math.max(0, Math.min(1, Number(alpha || 1)));
                return `rgba(${r}, ${g}, ${b}, ${a})`;
            } catch (e) { return hex; }
        };

        const applyStatusPill = (cd) => {
            try {
                const s = cd.status;
                if (!statusPill) return;
                
                if (s && s.name) {
                    statusPill.style.display = '';
                    statusPill.textContent = s.name;
                    if (s.color) {
                        const a = (this.plugin && this.plugin.settings && typeof this.plugin.settings.statusPillOpacity !== 'undefined') ? this.plugin.settings.statusPillOpacity : 1;
                        // Ensure opacity is at least 0.1 for status pills to be visible
                        const opacity = Math.max(0.1, a);
                        const bgColor = hexToRGBA(s.color, opacity);
                        const textColor = s.textColor || '#000';
                        
                        // Use setProperty with !important to override any CSS
                        statusPill.style.setProperty('background-color', bgColor, 'important');
                        statusPill.style.setProperty('color', textColor, 'important');
                        
                        // Also set via regular properties as fallback
                        statusPill.style.backgroundColor = bgColor;
                        statusPill.style.color = textColor;
                        if (this.plugin.settings.inheritStatusColor && s.color) {
                            cd.color = s.color;
                            if (cd.element) this.applyCardColorToElement(cd.element, s.color);
                        }
                    }
                    updateCardPadding();
                } else {
                    statusPill.style.display = 'none';
                    updateCardPadding();
                }
            } catch (e) {}
        };

        const formatTimeDiff = (ms) => {
            const totalMinutes = Math.max(0, Math.floor(ms / 60000));
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            if (hours > 0) return `expiring in ${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
            return `expiring in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        };

        const applyExpiryPill = (cd) => {
            try {
                if (!cd.expiresAt) return;
                const t = new Date(cd.expiresAt).getTime();
                if (isNaN(t)) return;
                const now = Date.now();
                const ms = t - now;
                if (ms <= 0) {
                    expiryPill.style.display = 'none';
                    updateCardPadding();
                    return;
                }
                expiryPill.style.display = '';
                expiryPill.style.backgroundColor = 'var(--background-modifier-hover)';
                expiryPill.style.color = 'var(--text-normal)';
                expiryPill.textContent = formatTimeDiff(ms);
                updateCardPadding();
            } catch (e) {}
        };

        const scheduleExpiryRemoval = (cd) => {
            try {
                if (!cd.expiresAt) return;
                const t = new Date(cd.expiresAt).getTime();
                if (isNaN(t)) return;
                const delay = Math.max(0, t - Date.now());
                if (cd._expiryTimeout) { try { clearTimeout(cd._expiryTimeout); } catch (e) {} }
                cd._expiryTimeout = setTimeout(() => {
                    try {
                        if (this.plugin && this.plugin.settings && this.plugin.settings.autoArchiveOnExpiry && delay > 0) {
                            this.toggleArchive(cd, true).catch(() => {});
                        } else {
                            try { cd.element.remove(); } catch (e) {}
                            this.cards = (this.cards || []).filter(x => x.id !== cd.id);
                        }
                    } catch (e) {}
                }, delay);
                if (cd._expiryUpdateInterval) { try { clearInterval(cd._expiryUpdateInterval); } catch (e) {} }
                cd._expiryUpdateInterval = setInterval(() => {
                        try { applyExpiryPill(cd); } catch (e) {}
                        try { this.refreshMasonrySpans(); } catch (e) {}
                }, 60000);
            } catch (e) {}
        };

        const cardData = { 
            id,
            content, 
            element: card,
            color: cardColor,
            tags: options.tags || [],
            category: options.category || null,
            created: options.created || new Date().toISOString(),
            archived: options.archived || false,
            pinned: options.pinned || false,
            notePath: options.notePath || null,
            expiresAt: options.expiresAt || null,
            status: options.status || null,
            
        };
        card.dataset.id = cardData.id;
        if (cardData.pinned) {
            this.cards.unshift(cardData);
        } else {
            this.cards.push(cardData);
        }

        this.setupCardDragAndDrop(card);

        try {
            if (cardData.pinned) {
                const pinEl = card.createDiv();
                pinEl.addClass('card-pin-indicator');
                pinEl.style.position = 'absolute';
                pinEl.style.top = '6px';
                pinEl.style.right = '8px';
                pinEl.style.cursor = 'pointer';
                pinEl.style.fontSize = '14px';
                pinEl.title = 'Pinned';
                try { setIcon(pinEl, 'pin'); } catch (e) { pinEl.textContent = '📌'; }

                const updatePinVisual = () => {
                    try {
                        pinEl.style.color = 'var(--interactive-accent)';
                    } catch (e) { }
                };

                updatePinVisual();

                pinEl.addEventListener('click', async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        cardData.pinned = false;
                        this.cards = this.cards.filter(c => c.id !== cardData.id);
                        this.cards.push(cardData);

                        if (this.plugin && this.plugin.saveSettings) this.plugin.saveSettings();
                        await this.saveCards();

                        try {
                            if (cardData.notePath) {
                                try {
                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                        if (file) {
                                        let content = await this.app.vault.read(file);
                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                        if (fmMatch) {
                                            let fm = fmMatch[1];
                                            if (/^\s*pinned\s*:/gmi.test(fm)) {
                                                fm = fm.replace(/^\s*pinned\s*:.*$/gmi, 'pinned: false');
                                            } else {
                                                fm = fm + '\n' + 'pinned: false';
                                            }
                                            const newFm = '---\n' + fm + '\n---\n';
                                            content = content.replace(fmMatch[0], newFm);
                                        } else {
                                            const newFm = '---\n' + 'pinned: false' + '\n---\n\n';
                                            content = newFm + content;
                                        }
                                        this.plugin.debugLog('sidecards: modify (pin indicator) ->', file.path);
                                        await this.app.vault.modify(file, content);
                                    }
                                } catch (err) { console.error('Error updating pinned in note frontmatter (indicator):', err); }
                            }
                        } catch (e) { }

                        try {
                            if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                                this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                                if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
                            }
                        } catch (e) { }

                        try { pinEl.remove(); } catch (err) { }
                        try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
                    } catch (err) {
                        console.error('Error toggling pin on card', err);
                    }
                });
            }
        } catch (e) {
        }

        try { this.applyAutoColorRules(cardData); } catch (e) {}
        try { applyStatusPill(cardData); } catch (e) {}
        try { applyExpiryPill(cardData); scheduleExpiryRemoval(cardData); } catch (e) {}
        
        // CRITICAL: Always apply the correct color based on status inheritance and auto-color rules
        try { this.applyCardColor(cardData, card); } catch (e) {
            this.plugin.debugLog('Error applying card color on creation:', e);
        }
        
        try { this.refreshMasonrySpans(); } catch (e) {}

        try {
            if (this.plugin.settings.enableCopyCardContent && !options.detached) {
                const copyBtn = card.createDiv();
                copyBtn.addClass('card-copy-btn');
                try { copyBtn.classList.add('sidecards-copy-btn'); } catch (e) {}
                copyBtn.style.position = 'absolute';
                copyBtn.style.bottom = '2px';
                copyBtn.style.right = '8px';
                copyBtn.style.border = 'none';
                copyBtn.style.background = 'none';
                copyBtn.style.cursor = 'pointer';
                copyBtn.style.padding = '4px';
                copyBtn.style.color = 'var(--text-muted)';
                copyBtn.style.display = 'none';
                try { setIcon(copyBtn, 'copy'); } catch (e) { copyBtn.textContent = '⎘'; }
                card.addEventListener('mouseenter', () => { copyBtn.style.display = ''; copyBtn.style.color = 'var(--text-normal)'; });
                card.addEventListener('mouseleave', () => { copyBtn.style.display = 'none'; copyBtn.style.color = 'var(--text-muted)'; });
                copyBtn.addEventListener('click', async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        let text = String(cardData.content || '');
                        if (cardData.notePath) {
                            try {
                                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                if (file) {
                                    const content = await this.app.vault.read(file);
                                    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                    text = m ? content.slice(m[0].length) : content;
                                }
                            } catch (err) {}
                        }
                        try { await navigator.clipboard.writeText(text); } catch (err) {}
                        try { new Notice('Card content copied'); } catch (err) {}
                    } catch (err) {}
                });
            }
        } catch (e) {}
        // Defer non-essential UI setup until idle
        try {
            if (!this._deferredUiSetupQueue) this._deferredUiSetupQueue = [];
            this._deferredUiSetupQueue.push({ cardData });
            this.scheduleDeferredUiSetup();
        } catch (e) {}
        return cardData;
    }

    enqueueCardCreate(content, options) {
        try {
            options = options || {};
            if (this._bulkLoading || this._applySortLoadInProgress) options.detached = true;
            const c = this.createCard(content, options);
            if (!c || !c.element) {
                this.plugin.debugLog('⚠️ Card creation returned invalid object', { options });
                return c;
            }
            if (c.pinned) {
                try { c.element.style.order = '-1'; } catch (e) {}
            }
            return c;
        } catch (e) {
            console.error('Error in enqueueCardCreate:', e);
            return null;
        }
    }

    

    async checkExpiries() {
        try {
            const now = Date.now();
            for (const c of (this.cards || [])) {
                try {
                    if (c.expiresAt) {
                        const t = new Date(c.expiresAt).getTime();
                        if (!isNaN(t) && t <= now && !c.archived) {
                            const withinReloadWindow = this._justReloaded && (Date.now() - this._justReloaded < 5000);
                            if (this.plugin.settings.autoArchiveOnExpiry && !withinReloadWindow) {
                                await this.toggleArchive(c, true);
                            } else {
                                try { c.element.remove(); } catch (e) {}
                                this.cards = (this.cards || []).filter(x => x.id !== c.id);
                            }
                        }
                    }
                } catch (e){}
            }
        } catch (e){}
    }

    setupExpiryTimer() {
        try {
            if (this._expiryTimer) clearInterval(this._expiryTimer);
            this._expiryTimer = setInterval(() => {
                try { this.checkExpiries(); } catch (e) {}
            }, 60000);
        } catch (e) {}
    }

    applyLayoutMode() {
        try {
            if (!this.cardsContainer) return;
            if (this.plugin.settings.verticalCardMode) {
                this.cardsContainer.addClass('vertical-card-mode');
                this.cardsContainer.style.display = 'grid';
                this.cardsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(260px, 1fr))';
                this.cardsContainer.style.gridAutoRows = '1px';
                this.cardsContainer.style.gap = '0px 6px'; // imp
                this.cardsContainer.style.alignItems = 'start';
                try { this.refreshMasonrySpans(); } catch (e) {}
                try { this.setupMasonryMutationObserver(); } catch (e) {}
            } else {
                this.cardsContainer.removeClass('vertical-card-mode');
                this.cardsContainer.style.display = '';
                this.cardsContainer.style.gridTemplateColumns = '';
                this.cardsContainer.style.gap = '';
                this.cardsContainer.style.alignItems = '';
                this.cardsContainer.style.gridAutoFlow = '';
                this.cardsContainer.style.gridAutoRows = '';
                // Clean up observer when leaving grid mode
                if (this._masonryMutationObserver) {
                    this._masonryMutationObserver.disconnect();
                    this._masonryMutationObserver = null;
                }
            }
        } catch (e) {}
    }

    refreshMasonrySpans() {
        try {
            if (!this.plugin.settings.verticalCardMode) return;
            const gridAutoRows = 1;  // 1px for maximum precision
            (this.cards || []).forEach(c => {
                try {
                    const el = c.element;
                    if (!el) return;
                    el.style.gridRowEnd = '';
                    const h = el.getBoundingClientRect().height;
                    // Calculate span based on exact card height with small margin
                    const span = Math.max(1, Math.ceil(h + 6)); // Add 6px for small vertical margin
                    el.style.gridRowEnd = 'span ' + span;
                } catch (e) {}
            });
        } catch (e) {}
    }

    setupMasonryMutationObserver() {
        try {
            if (!this.cardsContainer || !window.MutationObserver) return;
            
            // Debounce recalculation to avoid excessive calls
            let recalcTimeout;
            const debouncedRecalc = () => {
                clearTimeout(recalcTimeout);
                recalcTimeout = setTimeout(() => {
                    try { this.refreshMasonrySpans(); } catch (e) {}
                }, 150);
            };
            
            const observer = new MutationObserver((mutations) => {
                // Watch for content changes, class changes, or new elements
                // that might affect card heights (tags, pills, etc.)
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' || 
                        mutation.type === 'characterData' || 
                        (mutation.type === 'attributes' && mutation.attributeName === 'class')) {
                        debouncedRecalc();
                        break;
                    }
                }
            });
            
            observer.observe(this.cardsContainer, {
                childList: true,        // Watch for added/removed cards
                subtree: true,          // Watch all descendants
                characterData: true,    // Watch text content changes
                attributes: true,       // Watch class/attribute changes
                attributeFilter: ['class'], // Only watch class attribute
                attributeOldValue: false,
                characterDataOldValue: false
            });
            
            this._masonryMutationObserver = observer;
        } catch (e) {
            this.plugin.debugLog('Error setting up masonry mutation observer:', e);
        }
    }

    // Enable drag-and-drop for cards with custom data transfer for note content insertion
    setupCardDragAndDrop(card) {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copyMove';

            const cardData = this.cards.find(c => c.element === card);
            const payload = {
                id: card.dataset.id,
                content: cardData ? String(cardData.content) : card.textContent
            };

            try {
                e.dataTransfer.setData('text/x-card-sidebar', JSON.stringify(payload));
                try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (e) { }
            } catch (err) {
                try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (e) { }
            }

            try {
                const dragImg = document.createElement('div');
                dragImg.textContent = (cardData && cardData.content) ? cardData.content.slice(0, 80) : card.textContent.slice(0, 80);
                dragImg.style.padding = '8px';
                dragImg.style.background = 'var(--background-modifier-hover)';
                dragImg.style.color = 'var(--text-normal)';
                dragImg.style.position = 'absolute';
                dragImg.style.top = '-9999px';
                document.body.appendChild(dragImg);
                e.dataTransfer.setDragImage(dragImg, 10, 10);
                setTimeout(() => { dragImg.remove(); }, 0);
            } catch (e) {
            }
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            try {
                if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                    this.reindexCardsFromDOM();
                }
            } catch (e) {}
        });

        if (!this._dragListenersAttached) {
            this.cardsContainer.addEventListener('dragover', (e) => {
                if (!(this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual')) return;
                e.preventDefault();
                const afterElement = this.getDragAfterElement(this.cardsContainer, e.clientY, e.clientX);
                const dragging = this.cardsContainer.querySelector('.dragging');
                if (!dragging) return;
                if (afterElement == null) {
                    this.cardsContainer.appendChild(dragging);
                } else {
                    this.cardsContainer.insertBefore(dragging, afterElement);
                }
            });

            this.cardsContainer.addEventListener('drop', (e) => {
                if (!(this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual')) return;
                e.preventDefault();
                this.reindexCardsFromDOM();
            });

            this._dragListenersAttached = true;
        }
    }

    reindexCardsFromDOM() {
        try { this.plugin.debugLog('sidecards: reindexCardsFromDOM start', { settingsSortMode: this.plugin && this.plugin.settings ? this.plugin.settings.sortMode : null }); } catch (e) {}
        if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode !== 'manual') {
            return;
        }
        
        // Get ALL cards and current universal order
        const allCards = this.plugin.settings.cards || [];
        const existingUniversalOrder = this._universalCardOrder || this.plugin.settings.manualOrder || [];
        
        // Get the current visible card order from DOM
        const domIds = [...this.cardsContainer.querySelectorAll('.card-sidebar-card')].map(el => el.dataset.id);
        const draggedOrder = [];
        domIds.forEach(id => {
            const found = this.cards.find(c => c.id === id);
            if (found) draggedOrder.push(found);
        });
        
        // Build a map of all paths (including archived and non-archived)
        const allPaths = new Set();
        allCards.forEach(card => {
            if (card.notePath) allPaths.add(card.notePath);
        });
        this.cards.forEach(card => {
            if (card.notePath) allPaths.add(card.notePath);
        });
        
        // Update universal order:
        // 1. Reflect changes from current drag operation
        // 2. Preserve order of non-visible cards
        // 3. Ensure ALL cards are included
        const newUniversalOrder = [];
        const processedPaths = new Set();
        
        // First add dragged cards in their new order
        draggedOrder.forEach(card => {
            if (card.notePath) {
                newUniversalOrder.push(card.notePath);
                processedPaths.add(card.notePath);
            }
        });
        
        // Then preserve order of non-dragged cards from existing universal order
        existingUniversalOrder.forEach(path => {
            if (path && !processedPaths.has(path) && allPaths.has(path)) {
                newUniversalOrder.push(path);
                processedPaths.add(path);
            }
        });
        
        // Finally add any remaining paths not yet ordered
        allPaths.forEach(path => {
            if (!processedPaths.has(path)) {
                newUniversalOrder.push(path);
                processedPaths.add(path);
            }
        });

        try { this.plugin.debugLog('sidecards: reindexCardsFromDOM -> saving unified path order', { 
            draggedCount: draggedOrder.length,
            totalCards: allCards.length,
            thisCards: this.cards.length,
            universalPaths: newUniversalOrder.length,
            order: newUniversalOrder 
        }); } catch (e) {}

        // Save the universal order that includes ALL cards
        this._universalCardOrder = newUniversalOrder;
        
        // Only update plugin settings manual order if this is a real drag operation
        // (not just a view switch)
        if (draggedOrder.length > 0) {
            this.plugin.settings.manualOrder = newUniversalOrder;
            if (this.plugin && typeof this.plugin.saveSettings === 'function') {
                this.plugin.saveSettings();
            }
        }

        // Update current visible card order while preserving all cards
        try {
            // Get cards that weren't part of the drag
            const nonDraggedCards = this.cards.filter(c => !domIds.includes(c.id));
            
            if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                // For manual mode:
                // 1. Start with dragged cards in their new order
                // 2. Add non-dragged cards in their universal order
                const orderedNonDragged = nonDraggedCards.sort((a, b) => {
                    const aIdx = newUniversalOrder.indexOf(a.notePath);
                    const bIdx = newUniversalOrder.indexOf(b.notePath);
                    if (aIdx === -1) return 1;
                    if (bIdx === -1) return -1;
                    return aIdx - bIdx;
                });
                this.cards = draggedOrder.concat(orderedNonDragged);
            } else {
                // For non-manual modes, respect pinning:
                const draggedPinned = draggedOrder.filter(c => c.pinned);
                const draggedUnpinned = draggedOrder.filter(c => !c.pinned);
                const otherPinned = nonDraggedCards.filter(c => c.pinned);
                const otherUnpinned = nonDraggedCards.filter(c => !c.pinned);
                this.cards = [...draggedPinned, ...otherPinned, ...draggedUnpinned, ...otherUnpinned];
            }
        } catch (e) {
            console.error('Error updating card order:', e);
            // Fallback: Preserve drag order while keeping all cards
            this.cards = draggedOrder.concat(this.cards.filter(c => !domIds.includes(c.id)));
        }
        
        this.saveCards();
    }

    getDragAfterElement(container, y, x = null) {
        const draggableElements = [...container.querySelectorAll('.card-sidebar-card:not(.dragging)')];
        
        // Check if we're in grid mode
        const isGridMode = this.plugin && this.plugin.settings && this.plugin.settings.verticalCardMode;
        
        if (isGridMode && x !== null) {
            // For grid mode: use both X and Y coordinates for better placement
            let closest = null;
            let closestDistance = Number.POSITIVE_INFINITY;
            
            draggableElements.forEach(child => {
                const box = child.getBoundingClientRect();
                const containerBox = container.getBoundingClientRect();
                
                // Calculate distance from cursor to element center
                const elementCenterX = box.left + box.width / 2;
                const elementCenterY = box.top + box.height / 2;
                const distanceX = Math.abs(x - elementCenterX);
                const distanceY = Math.abs(y - elementCenterY);
                
                // Weight: Y distance is more important, but X helps with grid alignment
                const distance = distanceY + (distanceX * 0.5);
                
                // Only consider elements below and to the right of cursor (or very close)
                const isAfter = (y > box.top - box.height / 4) && (y < box.bottom + box.height / 4);
                
                if (isAfter && distance < closestDistance) {
                    closestDistance = distance;
                    closest = child;
                }
            });
            
            return closest;
        } else {
            // For vertical mode: use only Y coordinate (original behavior)
            let closest = null;
            let closestOffset = Number.NEGATIVE_INFINITY;
            draggableElements.forEach(child => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closestOffset) {
                    closestOffset = offset;
                    closest = child;
                }
            });
            return closest;
        }
    }

    parseDateToMs(s) {
        if (!s) return 0;
        try {
            const d = new Date(s);
            if (!isNaN(d)) return d.getTime();
        } catch (e) { }
        const p = Date.parse(s);
        if (!isNaN(p)) return p;
        return 0;
    }

    async applySort(mode = 'manual', ascending = true) {
        try {
            // Store current mode before updating
            const previousMode = this.plugin?.settings?.sortMode;
            
            // Debug logging
            this.plugin.debugLog("=== APPLYSORT START ===");
            this.plugin.debugLog("Previous mode:", previousMode);
            this.plugin.debugLog("New mode:", mode);
            this.plugin.debugLog("Ascending:", ascending);
            
            // Load state check
            if (this._applySortLoadInProgress) {
                if (!this._applySortLoadSeen) {
                    this._applySortLoadSeen = true;
                    this.plugin.debugLog('sidecards: applySort allowing first call during load');
                } else {
                    this.plugin.debugLog('sidecards: applySort suppressed during load (duplicate)');
                    return;
                }
            }

            // Handle mode transition
            if (previousMode === 'manual' && mode !== 'manual') {
                this.plugin.debugLog("Switching FROM manual mode - saving current order");
                // Save current order before switching modes
                this.plugin.settings.manualOrder = (this.cards || [])
                    .map(c => c.notePath)
                    .filter(path => path !== null);
                await this.plugin.saveSettings();
            }

            // Apply sort based on mode
            if (mode === 'manual') {
                // Use universal order if available, otherwise fall back to settings
                const universalOrder = this._universalCardOrder || 
                                     (this.plugin && this.plugin.settings && this.plugin.settings.manualOrder) || [];
                
                // Get complete list of all paths for current view context
                const allCurrentViewPaths = new Set(this.cards.map(c => c.notePath).filter(Boolean));
                
                if (universalOrder && universalOrder.length > 0) {
                    this.plugin.debugLog("Restoring universal manual order");
                    
                    // Create new array maintaining saved order for current view
                    const newCardOrder = [];
                    const unmatchedCards = [...this.cards];
                    
                    // Debug manual order path matching
                    try {
                        this.plugin.debugLog("=== Manual Order Path Matching Debug ===");
                        this.plugin.debugLog("Manual order paths:", universalOrder);
                        this.plugin.debugLog("Current cards:", unmatchedCards);
                        this.plugin.debugLog("New card order:", newCardOrder);
                    } catch (e) {}
                    
                    // First add cards that exist in universal order
                    universalOrder.forEach(path => {
                        if (!path) return;
                        if (!allCurrentViewPaths.has(path)) return; // Skip paths not in current view
                        
                        const cardIndex = unmatchedCards.findIndex(c => c.notePath === path);
                        if (cardIndex !== -1) {
                            newCardOrder.push(unmatchedCards[cardIndex]);
                            unmatchedCards.splice(cardIndex, 1);
                            try {
                                this.plugin.debugLog("Path", path, "matched card:", newCardOrder[newCardOrder.length - 1]);
                            } catch (e) {}
                        } else {
                            try {
                                this.plugin.debugLog("⚠️ No card found for path:", path);
                            } catch (e) {}
                        }
                    });
                    
                    // Add any remaining cards in current view that weren't in universal order
                    if (unmatchedCards.length > 0) {
                        try {
                            this.plugin.debugLog("Unmatched cards:", unmatchedCards);
                        } catch (e) {}
                        newCardOrder.push(...unmatchedCards);
                    }
                    
                    try {
                        this.plugin.debugLog("================================");
                    } catch (e) {}
                    
                    // Update current view's cards while preserving universal order
                    this.cards = newCardOrder;
                    
                    // Only update universal order if this wasn't a view switch
                    if (!this._isViewSwitch) {
                        this._universalCardOrder = universalOrder;
                    }
                    
                    this.plugin.debugLog("Manual order restored -", newCardOrder.length, "matched cards,", unmatchedCards.length, "new cards");
                } else {
                    // No saved order - initialize universal order
                    this.plugin.debugLog("Initializing universal manual order");
                    const newUniversalOrder = this.cards
                        .map(c => c.notePath)
                        .filter(Boolean);
                    
                    this._universalCardOrder = newUniversalOrder;
                    
                    // Only update settings if not switching views
                    if (!this._isViewSwitch) {
                        this.plugin.settings.manualOrder = newUniversalOrder;
                    }
                }

                // Update DOM order to match card order
                if (this.cardsContainer) {
                    // Remove all cards first
                    this.cards.forEach(cardData => {
                        if (cardData.element && cardData.element.parentNode === this.cardsContainer) {
                            this.cardsContainer.removeChild(cardData.element);
                        }
                    });
                    // Then add them back in the correct order
                    this.cards.forEach(cardData => {
                        if (cardData.element) {
                            this.cardsContainer.appendChild(cardData.element);
                        }
                    });
                }
            } else if (mode === 'created') {
                this.cards.sort((a, b) => {
                    const ta = this.parseDateToMs(a.created);
                    const tb = this.parseDateToMs(b.created);
                    return ascending ? ta - tb : tb - ta;
                });
            } else if (mode === 'modified') {
                const withTimes = await Promise.all(this.cards.map(async (c) => {
                    let mtime = 0;
                    try {
                        if (c.notePath) {
                            const file = this.app.vault.getAbstractFileByPath(c.notePath);
                            if (file && file.stat && file.stat.mtime) mtime = file.stat.mtime;
                            else if (file && file.mtime) mtime = file.mtime;
                        }
                    } catch (e) { }
                    if (!mtime) mtime = this.parseDateToMs(c.created);
                    return { c, mtime };
                }));

                withTimes.sort((x, y) => ascending ? x.mtime - y.mtime : y.mtime - x.mtime);
                this.cards = withTimes.map(x => x.c);
            } else if (mode === 'alpha') {
                this.cards.sort((a, b) => {
                    const ta = (a.content || '').toLowerCase();
                    const tb = (b.content || '').toLowerCase();
                    if (ta < tb) return ascending ? -1 : 1;
                    if (ta > tb) return ascending ? 1 : -1;
                    return 0;
                });
            } else if (mode === 'status') {
                // Sort by status - order them by the hierarchy defined in settings
                const statusSettings = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
                this.cards.sort((a, b) => {
                    const aStatus = a.status ? String(a.status.name || '').toLowerCase() : '';
                    const bStatus = b.status ? String(b.status.name || '').toLowerCase() : '';
                    
                    // Find positions in status hierarchy
                    const aIdx = statusSettings.findIndex(s => String(s.name || '').toLowerCase() === aStatus);
                    const bIdx = statusSettings.findIndex(s => String(s.name || '').toLowerCase() === bStatus);
                    
                    // Cards with status come before cards without
                    if (aIdx === -1 && bIdx === -1) return 0;
                    if (aIdx === -1) return 1;
                    if (bIdx === -1) return -1;
                    
                    // Both have status - sort by hierarchy order
                    const result = aIdx - bIdx;
                    return ascending ? result : -result;
                });
            }

            // Always keep pinned cards at top
            const pinned = this.cards.filter(c => c.pinned);
            const unpinned = this.cards.filter(c => !c.pinned);
            this.cards = pinned.concat(unpinned);

            // Update DOM to reflect new order
            if (this.cardsContainer) {
                this.cards.forEach(cd => {
                    if (cd.element && cd.element.parentNode === this.cardsContainer) {
                        this.cardsContainer.appendChild(cd.element);
                    }
                });
            }

            // Save settings and manual order
            await this.plugin.saveSettings();
            await this.saveCards();
            
            if (mode === 'manual') {
                // Update saved manual order with file paths
                this.plugin.settings.manualOrder = (this.cards || [])
                    .map(c => c.notePath)
                    .filter(path => path !== null);
                await this.plugin.saveSettings();
            }

            // Log final state for debugging
            this.plugin.debugLog("=== AFTER APPLYSORT ===");
            this.plugin.debugLog("Final card count:", this.cards.length);
            this.plugin.debugLog("Final manual order paths:", this.plugin?.settings?.manualOrder?.length || 0);
            this.plugin.debugLog("Final card IDs:", this.cards.map(c => c.id));
            this.plugin.debugLog("Final DOM card IDs:", Array.from(this.cardsContainer?.children || [])
                .filter(el => el.classList.contains('card-sidebar-card'))
                .map(el => el.dataset?.id));
            this.plugin.debugLog("=======================");

        } catch (err) {
            console.error('Error in applySort:', err);
        }
    }

    updatePinnedFilterView() {
        try {
            const showOnly = !!(this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly);
            const list = this.cards || [];
            list.forEach(c => {
                try {
                    if (!c || !c.element) return;
                    if (showOnly) {
                        c.element.style.display = c.pinned ? '' : 'none';
                    } else {
                        c.element.style.display = '';
                    }
                } catch (e) { }
            });

            if (showOnly && this.cardsContainer) {
                try {
                    const pinned = list.filter(x => x.pinned && x.element);
                    pinned.forEach(p => { try { this.cardsContainer.appendChild(p.element); } catch (e) {} });
                } catch (e) { }
            }
        } catch (err) {
            console.error('Error updating pinned filter view:', err);
        }
    }

    async updateCardContent(card, newContent) {
        const cardData = this.cards.find(c => c.element === card);
        if (!cardData) return;

        try {
            cardData.content = newContent;

            if (this.plugin.settings.groupTags) {
                try { this.updateCardTagDisplay(cardData); } catch (e) {}
            }

            try { await this.saveCards(); } catch (e) { console.error('Error saving cards after content edit:', e); }

            try {
                if (cardData.notePath) {
                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                    if (file) {
                        let text = await this.app.vault.read(file);
                        try {
                            const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                            let newText;
                            if (fmMatch) {
                                newText = fmMatch[0] + newContent;
                            } else {
                                newText = newContent;
                            }
                            this.plugin.debugLog('sidecards: modify (updateCardContent preserve frontmatter) ->', file.path);
                            await this.app.vault.modify(file, newText);
                        } catch (err) {
                            console.error('Error updating note body while preserving frontmatter:', err);
                            const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                            let fmBlock = '';
                            if (fmMatch) fmBlock = fmMatch[0];
                            let separator = '';
                            if (fmBlock) {
                                separator = fmBlock.endsWith('\n\n') ? '' : '\n\n';
                            }
                            const updated = fmBlock ? (fmBlock + separator + newContent) : newContent;
                            this.plugin.debugLog('sidecards: modify (updateCardContent fallback write) ->', file.path);
                            await this.app.vault.modify(file, updated);
                        }
                    } else {
                        try {
                            const folder = this.plugin.settings.storageFolder || '';
                            const firstLine = (newContent || '').split('\n')[0] || 'card';
                            let title = firstLine.slice(0, 30).trim();
                            let fileName = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}` || `card-${Date.now()}`;
                            let filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
                            
                            if (await this.app.vault.adapter.exists(filePath)) {
                                fileName += `-${Date.now()}`;
                                filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
                            }
                            await this.app.vault.create(filePath, newContent);
                            cardData.notePath = filePath;
                            try { await this.saveCards(); } catch (e) {}
                        } catch (e) { console.error('Error creating note for card content update:', e); }
                    }
                }
            } catch (e) {
                console.error('Error writing card content to note:', e);
            }
        } catch (err) {
            console.error('Error in updateCardContent:', err);
        }

        try { this.applyAutoColorRules(cardData); } catch (e) {}
        
        // CRITICAL FIX: Always reapply the correct color after all changes
        // This ensures status color inheritance is never lost
        if (cardData.element) {
            try {
                this.applyCardColor(cardData, cardData.element);
            } catch (e) {
                this.plugin.debugLog('Error reapplying card color after content update:', e);
            }
        }
    }

    applyAutoColorRules(cardData) {
        try {
            const rules = Array.isArray(this.plugin.settings.autoColorRules) ? this.plugin.settings.autoColorRules : [];
            if (!rules.length) return;
            const body = String(cardData.content || '').toLowerCase();
            const tags = Array.isArray(cardData.tags) ? cardData.tags.map(t => String(t).toLowerCase()) : [];
            for (const rule of rules) {
                const match = String(rule.match || '').toLowerCase();
                if (!match) continue;
                let hit = false;
                if (String(rule.type) === 'tag') hit = tags.includes(match);
                else hit = body.includes(match);
                if (!hit) continue;

                const idx = Number(rule.colorIndex || 1);
                const colorVar = `var(--card-color-${Math.min(Math.max(idx, 1), 10)})`;
                if (cardData.element) this.applyCardColorToElement(cardData.element, colorVar);
                cardData.color = colorVar;
                this.saveCards();

                if (cardData.notePath) {
                    (async () => {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                            if (!file) return;
                            let content = await this.app.vault.read(file);
                            const m = String(colorVar).match(/--card-color-(\d+)/);
                            let colorKey = '';
                            let colorLabel = '';
                            if (m) {
                                colorKey = `color-${m[1]}`;
                                colorLabel = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[Number(m[1]) - 1]) || '';
                            }
                            const colorLine = colorKey ? `card-color: ${colorKey}` : '';
                            const colorNameLine = colorLabel ? `card-color-name: "${String(colorLabel).replace(/"/g, '\\"')}"` : '';
                            if (/^\s*card-color:.*$/mi.test(content)) {
                                content = content.replace(/^\s*card-color:.*$/mi, colorLine || '');
                            } else if (colorLine) {
                                const fmStart = content.match(/^---\r?\n/);
                                if (fmStart) {
                                    const insertPos = fmStart.index + fmStart[0].length;
                                    content = content.slice(0, insertPos) + colorLine + '\n' + content.slice(insertPos);
                                } else {
                                    content = '---\n' + colorLine + '\n---\n\n' + content;
                                }
                            }
                            if (/^\s*card-color-name:.*$/mi.test(content)) {
                                content = content.replace(/^\s*card-color-name:.*$/mi, colorNameLine || '');
                            } else if (colorNameLine) {
                                const fmStart = content.match(/^---\r?\n/);
                                if (fmStart) {
                                    const insertPos = fmStart.index + fmStart[0].length;
                                    content = content.slice(0, insertPos) + colorNameLine + '\n' + content.slice(insertPos);
                                } else {
                                    content = '---\n' + colorNameLine + '\n---\n\n' + content;
                                }
                            }
                            await this.app.vault.modify(file, content);
                        } catch (e) {}
                    })();
                }
                break;
            }
        } catch (e) {}
    }

    debugManualOrderMatching(newCardOrder, currentCards, manualOrder) {
        this.plugin.debugLog("=== Manual Order Path Matching Debug ===");
        this.plugin.debugLog("Manual order paths:", manualOrder);
        this.plugin.debugLog("Current cards:", currentCards.map(c => ({ id: c.id, path: c.notePath })));
        this.plugin.debugLog("New card order:", newCardOrder.map(c => ({ id: c.id, path: c.notePath })));
        
        // Debug path matching
        manualOrder.forEach((path, index) => {
            const matchedCard = currentCards.find(c => c.notePath === path);
            if (matchedCard) {
                this.plugin.debugLog(`Path ${path} matched card:`, { id: matchedCard.id, path: matchedCard.notePath });
            } else {
                this.plugin.debugLog(`⚠️ No card found for path: ${path}`);
            }
        });
        
        // Debug unmatched cards
        const unmatchedCards = currentCards.filter(c => !manualOrder.includes(c.notePath));
        if (unmatchedCards.length > 0) {
            this.plugin.debugLog("Unmatched cards:", unmatchedCards.map(c => ({ id: c.id, path: c.notePath })));
        }
        
        this.plugin.debugLog("================================");
    }

    formatTimestamp(dateISO) {
        const fmt = (this.plugin.settings.datetimeFormat || 'YYYY-MM-DD HH:mm').trim();
        try {
            if (window.moment) {
                return window.moment(dateISO).format(fmt);
            }
        } catch (e) {
        }

        const d = new Date(dateISO);
        if (isNaN(d)) return '';
        const pad = (n) => String(n).padStart(2, '0');

        const monthNameShort = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
        const monthNameLong = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(d);

        let out = fmt
            .replace('YYYY', d.getFullYear())
            .replace('MM', pad(d.getMonth() + 1))
            .replace('DD', pad(d.getDate()))
            .replace('HH', pad(d.getHours()))
            .replace('mm', pad(d.getMinutes()))
            .replace('ss', pad(d.getSeconds()))
            .replace('MMM', monthNameShort)
            .replace('MMMM', monthNameLong);

        return out;
    }

    updateCardTagDisplay(cardData) {
        const card = cardData.element;
        if (!card) return;

        const footerLeft = card.querySelector('.card-footer-left');
        const existingTagsEl = card.querySelector('.card-tags');

        if (existingTagsEl) existingTagsEl.remove();

        if (cardData.tags && cardData.tags.length > 0) {
            const tagsEl = footerLeft.createDiv();
            tagsEl.addClass('card-tags');
            cardData.tags.forEach(t => {
                const tagEl = tagsEl.createDiv();
                tagEl.addClass('card-tag');
                tagEl.textContent = (this.plugin.settings.omitTagHash ? t : `#${t}`);
                try {
                    tagEl.style.cursor = 'pointer';
                    tagEl.addEventListener('click', (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        try {
                            if (this._searchWrap) this._searchWrap.style.display = '';
                            const rawTag = String(t).replace(/^#/, '');
                            if (!this.activeFilters.tags) this.activeFilters.tags = [];
                            if (!this.activeFilters.tags.includes(rawTag)) this.activeFilters.tags.push(rawTag);
                            if (this._searchInput) this._searchInput.value = '';
                            this.activeFilters.query = '';
                            if (typeof this.updateSearchChips === 'function') this.updateSearchChips();
                            this.applyFilters();
                        } catch (err) { console.error('Error applying tag filter:', err); }
                    });
                } catch (e) { }
            });
            try {
                const ts = card.querySelector('.card-timestamp');
                if (ts) {
                    if (this.plugin.settings.timestampBelowTags) {
                        if (tagsEl.parentNode) tagsEl.parentNode.insertBefore(ts, tagsEl.nextSibling);
                    } else {
                        if (tagsEl.parentNode) tagsEl.parentNode.insertBefore(ts, tagsEl);
                    }
                }
            } catch (e) { }
        }
    }

    refreshAllCardTags() {
        const cards = this.cards || [];
        cards.forEach(cardData => {
            const existingTagsEl = cardData.element?.querySelector('.card-tags');
            if (this.plugin.settings.groupTags) {
                this.updateCardTagDisplay(cardData);
            } else if (existingTagsEl) {
                existingTagsEl.remove();
            }
        });
    }

    applyFilters(skipAnimation = false) {
        try {
            const nowTs = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
            this._lastFilterRun = nowTs;
            const startTime = performance.now();
            this.plugin.debugLog("🔍 Filter Application Started", {
                totalCards: this.cards.length,
                currentCategory: this.currentCategoryFilter,
                activeFilters: {
                    query: this.activeFilters?.query || '',
                    tags: this.activeFilters?.tags || []
                },
                sortMode: this.plugin?.settings?.sortMode || 'manual',
                showArchived: this._lastLoadArchived || false,
                showPinnedOnly: this.plugin?.settings?.showPinnedOnly || false
            });
            
            const isManualSort = this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual';
            const universalManualOrder = isManualSort ? (this.plugin.settings.manualOrder || []) : [];
            
            if (isManualSort) {
                this.plugin.debugLog("📌 Manual sort mode active - using universal order", {
                    orderLength: universalManualOrder.length,
                    samplePaths: universalManualOrder.slice(0, 3)
                });
            }

            // First collect all visible cards
            const visibleCards = [];
            const q = (this.activeFilters && this.activeFilters.query) ? String(this.activeFilters.query).trim().toLowerCase() : '';
            const tags = (this.activeFilters && Array.isArray(this.activeFilters.tags)) ? this.activeFilters.tags.slice() : [];
            const statusFilter = (this.activeFilters && this.activeFilters.status) ? String(this.activeFilters.status).trim() : null;
            const untaggedOnly = !!(this.activeFilters && this.activeFilters.untaggedOnly);
            const showPinnedOnly = !!(this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly);
            let catFilter = (this.currentCategoryFilter || null);
            try {
                const norm = String(catFilter || '').toLowerCase();
                if (norm === 'all' || norm === 'archived') catFilter = null;
            } catch (e) {}
            
            (this.cards || []).forEach(c => {
                try {
                    if (!c || !c.element) return;
                    let visible = true;
                    const filterChecks = {
                        pinCheck: true,
                        archivedCheck: true,
                        tagCheck: true,
                        searchCheck: true,
                        categoryCheck: true,
                        untaggedCheck: true
                    };

                    // Pin Check
                    if (showPinnedOnly && !c.pinned) {
                        filterChecks.pinCheck = false;
                        visible = false;
                    }

                    // Archived Check - Filter based on showArchived state
                    const showArchived = this._lastLoadArchived || false;
                    if (showArchived && !c.archived) {
                        // When showing archived cards, skip non-archived cards
                        filterChecks.archivedCheck = false;
                        visible = false;
                    } else if (!showArchived && c.archived) {
                        // When showing non-archived cards, skip archived cards
                        filterChecks.archivedCheck = false;
                        visible = false;
                    }

                    // Tag Check
                    if (tags && tags.length > 0) {
                        for (const tg of tags) {
                            if (!c.tags || !c.tags.map(t => String(t)).includes(tg)) { 
                                filterChecks.tagCheck = false;
                                visible = false;
                                break;
                            }
                        }
                    }

                    if (visible && untaggedOnly) {
                        const hasTags = !!(c.tags && c.tags.length > 0);
                        const hasCategory = !!(c.category && String(c.category).trim() !== '');
                        if (hasTags || hasCategory) {
                            filterChecks.untaggedCheck = false;
                            visible = false;
                        }
                    }

                    // Search Check
                    if (visible && q) {
                        const hay = String(c.content || '').toLowerCase();
                        const tagText = (c.tags || []).join(' ').toLowerCase();
                        if (hay.indexOf(q) === -1 && tagText.indexOf(q) === -1) {
                            filterChecks.searchCheck = false;
                            visible = false;
                        }
                    }

                    // Category Check
                    try {
                        if (catFilter) {
                            const filterNorm = String(catFilter || '').toLowerCase();
                            const cardCat = (c.category || '').toString().toLowerCase();
                            let catMatch = false;

                            this.plugin.debugLog("🏷️ Category Check", {
                                cardId: c.id,
                                filterCategory: filterNorm,
                                cardCategory: cardCat,
                                cardContent: c.content.slice(0, 30) + "..."
                            });

                            // Direct match (covers id == id or label == label if stored that way)
                            if (cardCat === filterNorm) {
                                catMatch = true;
                                this.plugin.debugLog("✅ Direct category match");
                            } else {
                                // Be tolerant: allow matching id<->label across settings
                                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                                try {
                                    const byId = cats.find(x => String(x.id || '').toLowerCase() === filterNorm);
                                    if (byId && String(byId.label || '').toLowerCase() === cardCat) {
                                        catMatch = true;
                                        this.plugin.debugLog("✅ Category matched by ID mapping");
                                    }
                                } catch (e) {}
                                try {
                                    const byLabel = cats.find(x => String(x.label || '').toLowerCase() === filterNorm);
                                    if (byLabel && String(byLabel.id || '').toLowerCase() === cardCat) {
                                        catMatch = true;
                                        this.plugin.debugLog("✅ Category matched by label mapping");
                                    }
                                } catch (e) {}
                            }

                            if (!catMatch) {
                                filterChecks.categoryCheck = false;
                                visible = false;
                                this.plugin.debugLog("❌ No category match found");
                            }
                        }
                    } catch (e) {
                        console.error("Error in category matching:", e);
                    }

                    // Status Check
                    if (visible && statusFilter) {
                        const cardStatus = c.status && c.status.name ? String(c.status.name).trim() : null;
                        if (cardStatus !== statusFilter) {
                            filterChecks.statusCheck = false;
                            visible = false;
                        }
                    }
                    
                    // Log filter results for each card
                    this.plugin.debugLog("🔍 Card Filter Results", {
                        cardId: c.id,
                        content: c.content.slice(0, 30) + "...",
                        isVisible: visible,
                        checks: filterChecks,
                        category: c.category,
                        tags: c.tags,
                        pinned: c.pinned,
                        archived: c.archived
                    });

                    if (visible) {
                        visibleCards.push(c);
                    }
                    c.element.style.display = 'none'; // Hide all initially
                } catch (e) { }
            });

            // Sort visible cards if in manual mode
            if (isManualSort && visibleCards.length > 0) {
                this.plugin.debugLog("🔄 Sorting filtered cards by universal manual order");
                
                // Debug manual order matching before sort
                try {
                    this.debugManualOrderMatching(visibleCards, visibleCards, universalManualOrder);
                } catch (e) {
                    console.error("Error in debug logging:", e);
                }
                
                visibleCards.sort((a, b) => {
                    // Pinned cards always go to top regardless of manual order
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    
                    // For cards with same pinned status, use universal manual order
                    if (a.notePath && b.notePath) {
                        const aIndex = universalManualOrder.indexOf(a.notePath);
                        const bIndex = universalManualOrder.indexOf(b.notePath);
                        
                        // Both cards are in manual order
                        if (aIndex !== -1 && bIndex !== -1) {
                            return aIndex - bIndex;
                        }
                        
                        // Handle cards not in manual order
                        if (aIndex !== -1) return -1; // Only a is in order
                        if (bIndex !== -1) return 1;  // Only b is in order
                    }
                    
                    // Fallback to created date for cards not in manual order
                    return (new Date(b.created || 0)) - (new Date(a.created || 0));
                });
                
                // Log sort results
                this.plugin.debugLog("✅ Sorted cards:", visibleCards.map(c => ({
                    id: c.id,
                    path: c.notePath,
                    orderIndex: c.notePath ? universalManualOrder.indexOf(c.notePath) : -1,
                    pinned: !!c.pinned
                })));
            }

            // First, hide all cards and clear animation styles
            (this.cards || []).forEach(c => {
                if (c && c.element) {
                    try {
                        c.element.style.display = 'none';
                        c.element.style.transition = '';
                        c.element.style.transform = '';
                        c.element.style.opacity = '';
                        c.element.style.willChange = '';
                    } catch (e) {}
                }
            });

            // Show visible cards in correct order
            visibleCards.forEach(c => {
                if (c.element) {
                    if (this.cardsContainer && c.element.parentNode !== this.cardsContainer) {
                        this.cardsContainer.appendChild(c.element);
                    }
                    c.element.style.display = '';
                }
            });

            const endTime = performance.now();
            this.plugin.debugLog("✨ Filter Application Complete", {
                visibleCards: visibleCards.length,
                totalCards: this.cards.length,
                timeElapsed: Math.round(endTime - startTime) + "ms",
                appliedFilters: {
                    category: catFilter,
                    searchQuery: q,
                    tags: tags,
                    pinnedOnly: showPinnedOnly
                },
                sortMode: isManualSort ? "manual" : this.plugin?.settings?.sortMode || "none",
                cardOrder: visibleCards.map(c => ({
                    id: c.id,
                    content: c.content.slice(0, 30) + "...",
                    category: c.category,
                    pinned: c.pinned
                }))
            });

            if (!skipAnimation && this.plugin.settings.animatedCards) {
                try { 
                    // Use requestAnimationFrame to ensure DOM has been updated before animation
                    requestAnimationFrame(() => {
                        try {
                            this.animateCardsEntrance(); 
                        } catch (e) { }
                    });
                } catch (e) { }
            }
        } catch (err) {
            console.error('Error in applyFilters:', err);
            console.error('Stack trace:', err.stack);
        }
    }

    // Dedicated function for full reload when needed
    async reloadCards() {
        this.plugin.debugLog("🔄 Performing full card reload");
        await this.scheduleLoadCards(this._lastLoadArchived || false);
    }

    scheduleLoadCards(showArchived = false, delay = 100) {
        this._lastRequestedLoadArchived = !!showArchived;
        if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
        return new Promise((resolve) => {
            this._reloadTimeout = setTimeout(async () => {
                this._reloadTimeout = null;
                await this.loadCards(this._lastRequestedLoadArchived);
                resolve();
            }, Math.max(0, Number(delay || 100)));
        });
    }

    createSearchBar(container) {
        try {
            const searchWrap = container.createDiv();
            searchWrap.addClass('card-search-wrap');
            searchWrap.style.display = 'none';
            searchWrap.style.padding = '6px 8px';
            searchWrap.style.borderBottom = '1px solid var(--background-modifier-border)';

            const row = searchWrap.createDiv();
            row.style.display = 'flex';
            row.style.gap = '8px';

            const input = row.createEl('input');
            input.type = 'search';
            input.placeholder = 'Search cards…';
            input.addClass('card-search-input');
            input.style.flex = '1';
            input.style.padding = '6px 8px';

        const clearBtn = row.createEl('button');
        clearBtn.textContent = '✕';
        clearBtn.title = 'Clear search';
        clearBtn.style.border = 'none';
        clearBtn.style.background = 'none';
        clearBtn.style.cursor = 'pointer';

            const chipRow = searchWrap.createDiv();
            chipRow.addClass('card-search-chips');
            chipRow.style.marginTop = '6px';
            chipRow.style.display = 'flex';
            chipRow.style.gap = '6px';

            let t;
            input.addEventListener('input', (e) => {
                clearTimeout(t);
                t = setTimeout(() => {
                    this.activeFilters.query = input.value || '';
                    this.applyFilters();
                }, 300);
            });

            clearBtn.addEventListener('click', () => {
                input.value = '';
                this.activeFilters.query = '';
                let chipsUpdated = false;
                if (this.activeFilters && Array.isArray(this.activeFilters.tags) && this.activeFilters.tags.length > 0) {
                    this.activeFilters.tags = [];
                    chipsUpdated = true;
                }
                if (this.activeFilters && this.activeFilters.status) {
                    this.activeFilters.status = null;
                    chipsUpdated = true;
                }
                if (chipsUpdated && typeof this.updateSearchChips === 'function') this.updateSearchChips();
                this.applyFilters();
            });

            this._searchWrap = searchWrap;
            this._searchInput = input;
            this._searchChipRow = chipRow;
        } catch (e) {
            console.error('Error creating search bar:', e);
        }
    }

    updateSearchChips() {
        try {
            const row = this._searchChipRow;
            if (!row) return;
            row.innerHTML = '';
            // Tag chips
            const tags = (this.activeFilters && Array.isArray(this.activeFilters.tags)) ? this.activeFilters.tags.slice() : [];
            tags.forEach(tag => {
                const chip = document.createElement('div');
                chip.className = 'card-filter-chip';
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '8px';
                chip.style.padding = '4px 8px';
                chip.style.border = '1px solid var(--background-modifier-border)';
                chip.style.borderRadius = '12px';
                chip.style.background = 'var(--background-secondary)';
                chip.style.cursor = 'default';

                const label = document.createElement('span');
                label.textContent = (this.plugin.settings.omitTagHash ? tag : `#${tag}`);
                label.style.userSelect = 'none';
                label.style.pointerEvents = 'auto';

                const close = document.createElement('span');
                close.textContent = '✕';
                close.title = 'Remove this tag filter';
                close.style.marginLeft = '6px';
                close.style.fontSize = '11px';
                close.style.cursor = 'pointer';
                close.style.opacity = '0.9';
                close.style.userSelect = 'none';

                close.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        this.activeFilters.tags = (this.activeFilters.tags || []).filter(t => t !== tag);
                        this.applyFilters();
                        this.updateSearchChips();
                    } catch (err) { console.error('Error removing tag chip via close button:', err); }
                });

                label.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        this.activeFilters.tags = (this.activeFilters.tags || []).filter(t => t !== tag);
                        this.applyFilters();
                        this.updateSearchChips();
                    } catch (err) { console.error('Error removing tag chip via label click:', err); }
                });

                chip.appendChild(label);
                chip.appendChild(close);
                row.appendChild(chip);
            });
            // Status chip
            if (this.activeFilters && this.activeFilters.status) {
                const statusChip = document.createElement('div');
                statusChip.className = 'card-filter-chip card-status-chip';
                statusChip.style.display = 'inline-flex';
                statusChip.style.alignItems = 'center';
                statusChip.style.gap = '8px';
                statusChip.style.padding = '4px 8px';
                statusChip.style.border = '1px solid var(--background-modifier-border)';
                statusChip.style.borderRadius = '12px';
                statusChip.style.background = 'var(--background-secondary)';
                statusChip.style.cursor = 'default';

                const label = document.createElement('span');
                label.textContent = this.activeFilters.status;
                label.style.userSelect = 'none';
                label.style.pointerEvents = 'auto';

                const close = document.createElement('span');
                close.textContent = '✕';
                close.title = 'Remove this status filter';
                close.style.marginLeft = '6px';
                close.style.fontSize = '11px';
                close.style.cursor = 'pointer';
                close.style.opacity = '0.9';
                close.style.userSelect = 'none';
                close.style.pointerEvents = 'auto';

                close.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        this.activeFilters.status = null;
                        this.applyFilters();
                        this.updateSearchChips();
                    } catch (err) { console.error('Error removing status chip via close button:', err); }
                });

                label.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                        this.activeFilters.status = null;
                        this.applyFilters();
                        this.updateSearchChips();
                    } catch (err) { console.error('Error removing status chip via label click:', err); }
                });

                statusChip.appendChild(label);
                statusChip.appendChild(close);
                row.appendChild(statusChip);
            }
        } catch (err) { console.error('Error updating search chips:', err); }
    }

    refreshAllCardTimestamps() {
        const cards = this.cards || [];
        cards.forEach(cardData => {
            const el = cardData.element;
            if (!el) return;

            const existing = el.querySelector('.card-timestamp');
            if (this.plugin.settings.showTimestamps) {
                if (existing) {
                    existing.textContent = this.formatTimestamp(cardData.created || new Date().toISOString());
                } else {
                    const footerLeft = el.querySelector('.card-footer-left');
                    if (footerLeft) {
                        const ts = footerLeft.createDiv();
                        ts.addClass('card-timestamp');
                        ts.textContent = this.formatTimestamp(cardData.created || new Date().toISOString());
                    }
                }

                try {
                    const tagsEl = el.querySelector('.card-tags');
                    const tsEl = el.querySelector('.card-timestamp');
                    const footerLeft = el.querySelector('.card-footer-left');
                    if (tsEl && footerLeft) {
                        if (this.plugin.settings.timestampBelowTags && tagsEl) {
                            if (tagsEl.parentNode) tagsEl.parentNode.insertBefore(tsEl, tagsEl.nextSibling);
                        } else if (tagsEl) {
                            if (tagsEl.parentNode) tagsEl.parentNode.insertBefore(tsEl, tagsEl);
                        }
                    }
                } catch (e) { }
            } else {
                if (existing) existing.remove();
            }
        });
    }

    // Parse YAML frontmatter tags supporting both array and list formats with quotes handling
    parseTagsFromFrontmatter(fm) {
        if (!fm) return [];
        const lines = fm.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const m = line.match(/^\s*(?:Tags|tags)\s*:\s*(.*)$/i);
            if (!m) continue;
            const rest = (m[1] || '').trim();

            if (rest.startsWith('[')) {
                const inner = rest.replace(/^\[/, '').replace(/\]$/, '');
                return inner.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }

            if (rest.length > 0) {
                return rest.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }

            const collected = [];
            for (let j = i + 1; j < lines.length; j++) {
                const l = lines[j];
                const mm = l.match(/^\s*-\s*(.+)$/);
                if (mm) {
                    collected.push(mm[1].trim().replace(/^"|"$/g, ''));
                } else {
                    break;
                }
            }
            return collected;
        }

        return [];
    }

    // Sync card state with its associated note file when external changes occur
    async updateCardFromNotePath(notePath) {
        if (!notePath) return;
        const cardData = this.cards.find(c => c.notePath === notePath);
        if (!cardData) return;

        try {
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (!file) return;
            const text = await this.app.vault.read(file);

            let fm = null;
            const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            if (m) fm = m[1];

            const tags = [];
            let created = cardData.created || new Date().toISOString();
            let archived = cardData.archived || false;
            let pinned = cardData.pinned || false;

            if (fm) {
                try {
                    const parsed = this.parseTagsFromFrontmatter(fm);
                    parsed.forEach(t => { if (t) tags.push(t); });
                } catch (e) { }
                try {
                    let parsedColorVar = null;
                    const ccMatch = fm.match(/^\s*card-color:\s*(.*)$/mi);
                    if (ccMatch) {
                        const val = ccMatch[1].trim().replace(/^"|"$/g, '');
                        const m2 = String(val).match(/^color-(\d+)$/i);
                        if (m2) {
                            parsedColorVar = `var(--card-color-${m2[1]})`;
                        } else if (/^#/.test(val)) {
                            parsedColorVar = val;
                        } else {
                            const idx = (this.plugin.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(val).toLowerCase());
                            if (idx >= 0) parsedColorVar = `var(--card-color-${idx+1})`;
                        }
                    }
                    if (!parsedColorVar) {
                        const nameMatch = fm.match(/^\s*card-color-name:\s*(?:"|')?(.*?)(?:"|')?\s*$/mi);
                        if (nameMatch) {
                            const nameVal = nameMatch[1].trim();
                            const idx2 = (this.plugin.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(nameVal).toLowerCase());
                            if (idx2 >= 0) parsedColorVar = `var(--card-color-${idx2+1})`;
                        }
                    }
                    if (parsedColorVar) {
                        cardData.color = parsedColorVar;
                        // Apply the correct color (status or original) to element
                        if (cardData.element) {
                            this.applyCardColor(cardData, cardData.element);
                        }
                    }
                } catch (e) {
                }
                
                // Read Status frontmatter and update cardData.status
                try {
                    const stMatch = fm.match(/^\s*Status\s*:\s*(.*)$/mi);
                    if (this.plugin.settings.enableCardStatus && stMatch) {
                        const sName = String(stMatch[1]).trim().replace(/^"|"$/g, '');
                        
                        // Always look up colors from settings, never from frontmatter
                        const statusSettings = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
                        const matchedStatus = statusSettings.find(st => String(st.name || '').toLowerCase() === String(sName).toLowerCase());
                        if (matchedStatus) {
                            cardData.status = { name: sName, color: matchedStatus.color || '', textColor: matchedStatus.textColor || '' };
                            // Update the status pill if it exists
                            try {
                                const pill = cardData.element.querySelector('.card-status-pill');
                                if (pill) {
                                    pill.style.display = '';
                                    pill.textContent = sName || '';
                                    pill.style.backgroundColor = matchedStatus.color || '#ccc';
                                    pill.style.color = matchedStatus.textColor || '#000';
                                }
                            } catch (e) {}
                            // Reapply status color to card
                            if (cardData.element) {
                                this.applyCardColor(cardData, cardData.element);
                            }
                        } else {
                            cardData.status = { name: sName, color: '', textColor: '' };
                        }
                    } else {
                        // Clear status if not enabled or not found in frontmatter
                        cardData.status = null;
                    }
                } catch (e) {}
                
                try {
                    // Read Category frontmatter
                    const catLabelMatch = fm.match(/^\s*Category\s*:\s*(.*)$/mi);
                    if (catLabelMatch && catLabelMatch[1]) {
                        const catVal = String(catLabelMatch[1]).trim().replace(/^"|"$/g, '');
                        const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                        const found = cats.find(x => String(x.id || '').toLowerCase() === String(catVal).toLowerCase() || String(x.label || '').toLowerCase() === String(catVal).toLowerCase());
                        cardData.category = found ? (found.label || String(found.id || catVal)) : catVal;
                    } else {
                        cardData.category = cardData.category || null;
                    }
                } catch (e) { }
                    try {
                        if (/^\s*pinned\s*:\s*true$/mi.test(fm || '')) {
                            pinned = true;
                        }
                    } catch (e) { }
                
                const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                if (createdMatch) created = createdMatch[1].trim();
                if (/^\s*archived:\s*true$/mi.test(fm)) archived = true; else archived = false;
            }

            if (tags.length > 0) cardData.tags = tags; else cardData.tags = [];
            
            cardData.created = created;
            cardData.archived = archived;
            cardData.pinned = !!pinned;

            try {
                const el = cardData.element;
                if (el) {
                    const existing = el.querySelector('.card-pin-indicator');
                    if (cardData.pinned) {
                        if (!existing) {
                            const pinEl = el.createDiv();
                            pinEl.addClass('card-pin-indicator');
                            pinEl.style.position = 'absolute';
                            pinEl.style.top = '6px';
                            pinEl.style.right = '8px';
                            pinEl.style.cursor = 'pointer';
                            pinEl.style.fontSize = '14px';
                            pinEl.title = 'Pinned';
                            try { setIcon(pinEl, 'pin'); } catch (e) { pinEl.textContent = '📌'; }
                            pinEl.style.color = 'var(--interactive-accent)';
                            pinEl.addEventListener('click', async (ev) => {
                                ev.preventDefault(); ev.stopPropagation();
                                try {
                                    cardData.pinned = false;
                                    this.cards = this.cards.filter(c => c.id !== cardData.id);
                                    this.cards.push(cardData);
                                    await this.saveCards();
                                    try {
                                        if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                                            this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                                            if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
                                        }
                                    } catch (e) { }
                                    try { pinEl.remove(); } catch (err) {}
                                    try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
                                } catch (err) { console.error('Error unpinning from indicator:', err); }
                            });
                        }
                        try { if (cardData.element && this.cardsContainer) this.cardsContainer.insertBefore(cardData.element, this.cardsContainer.firstChild); } catch (e) {}
                        this.cards = this.cards.filter(c => c.id !== cardData.id);
                        this.cards.unshift(cardData);
                    } else {
                        try { if (existing) existing.remove(); } catch (e) {}
                        this.cards = this.cards.filter(c => c.id !== cardData.id);
                        this.cards.push(cardData);
                    }
                }
            } catch (e) { console.error('Error applying pinned UI from note update:', e); }

            if (this.plugin.settings.groupTags) this.updateCardTagDisplay(cardData);
            const tsEl = cardData.element.querySelector('.card-timestamp');
            if (tsEl) tsEl.textContent = this.formatTimestamp(cardData.created || new Date().toISOString());

            const folder = this.plugin.settings.storageFolder;
            if (archived && (!folder || folder === '/')) {
            }

            await this.saveCards();
            try {
                if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                    this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                    if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
                }
            } catch (e) { }
        } catch (err) {
            console.error('Error updating card from note path:', notePath, err);
        }
    }
    
    showCardContextMenu(card, event) {
        const menu = new Menu(this.app);
        const cardData = this.cards.find(c => c.element === card);
        
        if (!cardData) return;

        // Pin/unpin card (1)
        menu.addItem((item) => {
            item.setTitle(cardData.pinned ? 'Unpin Card' : 'Pin Card')
                .setIcon('pin')
                .onClick(async () => {
                        try {
                            // Toggle pinned state
                            const newPinnedState = !cardData.pinned;
                            cardData.pinned = newPinnedState;
                        
                            // Update card ordering
                            this.cards = this.cards.filter(c => c.id !== cardData.id);
                            if (newPinnedState) {
                                this.cards.unshift(cardData);
                            } else {
                                this.cards.push(cardData);
                            }
                        
                            // Update note frontmatter if it exists
                            if (cardData.notePath) {
                                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                if (file) {
                                    let content = await this.app.vault.read(file);
                                    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                    if (fmMatch) {
                                        let fm = fmMatch[1];
                                        if (/^\s*pinned\s*:/mi.test(fm)) {
                                            fm = fm.replace(/^\s*pinned\s*:.*$/mi, `pinned: ${newPinnedState}`);
                                        } else {
                                            fm = fm + `\npinned: ${newPinnedState}`;
                                        }
                                        const newFm = '---\n' + fm + '\n---\n';
                                        content = content.replace(fmMatch[0], newFm);
                                    } else {
                                        // No existing frontmatter, create new
                                        content = `---\npinned: ${newPinnedState}\n---\n\n${content}`;
                                    }
                                    this.plugin.debugLog('sidecards: modify (pin toggle) ->', file.path);
                                    await this.app.vault.modify(file, content);
                                }
                            }

                            // Update UI
                            if (newPinnedState) {
                                // Add pin indicator if needed
                                if (!card.querySelector('.card-pin-indicator')) {
                                    const pinEl = card.createDiv();
                                    pinEl.addClass('card-pin-indicator');
                                    pinEl.style.position = 'absolute';
                                    pinEl.style.top = '6px';
                                    pinEl.style.right = '8px';
                                    pinEl.style.cursor = 'pointer';
                                    pinEl.style.fontSize = '14px';
                                    pinEl.title = 'Pinned';
                                    try { setIcon(pinEl, 'pin'); } catch (e) { pinEl.textContent = '📌'; }
                                    pinEl.style.color = 'var(--interactive-accent)';
                                }
                                // Move card to top
                                if (this.cardsContainer && this.cardsContainer.firstChild) {
                                    this.cardsContainer.insertBefore(card, this.cardsContainer.firstChild);
                                }
                            } else {
                                // Remove pin indicator
                                const indicator = card.querySelector('.card-pin-indicator');
                                if (indicator) indicator.remove();
                            }

                            await this.saveCards();
                            if (typeof this.applyFilters === 'function') this.applyFilters();

                        } catch (error) {
                            console.error('Error updating pinned state:', error);
                            new Notice('Error updating pinned state');
                        }
                });
        });

        if (!(this.plugin && this.plugin.settings && this.plugin.settings.hideTimeBasedAddButtonsInContextMenu)) {
            [
                { label: 'Add to Today', value: 'today', icon: 'calendar-clock' },
                { label: 'Add to Tomorrow', value: 'tomorrow', icon: 'calendar-days' }
            ].forEach(opt => {
                menu.addItem(item => {
                    item.setTitle(opt.label)
                        .setIcon(opt.icon)
                        .onClick(async () => {
                            cardData.category = opt.value;
                            if (typeof this.saveCards === 'function') await this.saveCards();
                            try {
                                if (cardData.notePath) {
                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                    if (file) {
                                        let content = await this.app.vault.read(file);
                                        const catLabelLine = `Category: ${opt.value}`;
                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                        if (fmMatch) {
                                            let fm = fmMatch[1];
                                            if (/^\s*Category\s*:/gmi.test(fm)) {
                                                fm = fm.replace(/^\s*Category\s*:.*$/gmi, catLabelLine);
                                            } else {
                                                fm = fm + '\n' + catLabelLine;
                                            }
                                            const newFm = '---\n' + fm + '\n---\n';
                                            content = content.replace(fmMatch[0], newFm);
                                        } else {
                                            content = '---\n' + catLabelLine + '\n---\n\n' + content;
                                        }
                                        await this.app.vault.modify(file, content);
                                    }
                                }
                            } catch (err) {
                                console.error('Error updating category in note frontmatter:', err);
                            }
                            if (typeof this.applyFilters === 'function') this.applyFilters();
                        });
                });
            });
        }

        menu.addSeparator();

        // Colors (5)
        menu.addItem((item) => {
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

            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.gap = '4px';
            container.style.padding = '6px 0px';
            container.style.justifyContent = 'center';
            try {
                if (this.plugin && this.plugin.settings && this.plugin.settings.twoRowSwatches) {
                    container.style.flexWrap = 'wrap';
                    container.style.width = '140px';
                }
            } catch (e) { }
            
            colors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.setAttribute('aria-label', color.name);
                swatch.style.width = '24px';
                swatch.style.height = '24px';
                swatch.style.borderRadius = '50%';
                swatch.style.backgroundColor = color.var;
                swatch.style.cursor = 'pointer';
                swatch.style.transition = 'transform 0.15s ease';
                swatch.style.border = cardData.color === color.var 
                    ? '2px solid var(--text-accent)' 
                    : '1px solid var(--background-modifier-border)';
                if (this.plugin && this.plugin.settings && this.plugin.settings.twoRowSwatches) {
                    swatch.style.marginBottom = '6px';
                }
                try {
                        const m = String(color.var).match(/--card-color-(\d+)/);
                    if (m) {
                        const idx = Number(m[1]) - 1;
                        const lbl = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[idx]) || '';
                        if (lbl) swatch.title = lbl;
                    }
                } catch (e) { }

                swatch.addEventListener('mouseenter', () => {
                    swatch.style.transform = 'scale(1.2)';
                });
                
                swatch.addEventListener('mouseleave', () => {
                    swatch.style.transform = 'scale(1)';
                });
                
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.applyCardColorToElement(card, color.var);
                    cardData.color = color.var;
                    this.saveCards();

                    if (cardData.notePath) {
                        (async () => {
                            try {
                                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                if (!file) return;
                                let content = await this.app.vault.read(file);

                                let colorKey = '';
                                let colorLabel = '';
                                const m = String(color.var).match(/--card-color-(\d+)/);
                                if (m) {
                                    colorKey = `color-${m[1]}`;
                                    colorLabel = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[Number(m[1]) - 1]) || '';
                                }

                                const colorLine = colorKey ? `card-color: ${colorKey}` : '';
                                const colorNameLine = colorLabel ? `card-color-name: "${String(colorLabel).replace(/"/g, '\\"')}"` : '';

                                if (/^\s*card-color:.*$/mi.test(content)) {
                                    content = content.replace(/^\s*card-color:.*$/mi, colorLine || '');
                                } else if (colorLine) {
                                    const fmStart = content.match(/^---\r?\n/);
                                    if (fmStart) {
                                        const insertPos = fmStart.index + fmStart[0].length;
                                        content = content.slice(0, insertPos) + colorLine + '\n' + content.slice(insertPos);
                                    } else {
                                        content = '---\n' + colorLine + '\n---\n\n' + content;
                                    }
                                }

                                if (/^\s*card-color-name:.*$/mi.test(content)) {
                                    content = content.replace(/^\s*card-color-name:.*$/mi, colorNameLine || '');
                                } else if (colorNameLine) {
                                    const fmStart = content.match(/^---\r?\n/);
                                    if (fmStart) {
                                        const insertPos = fmStart.index + fmStart[0].length;
                                        content = content.slice(0, insertPos) + colorNameLine + '\n' + content.slice(insertPos);
                                    } else {
                                        content = '---\n' + colorNameLine + '\n---\n\n' + content;
                                    }
                                }

                                                        this.plugin.debugLog('sidecards: modify (color change) ->', file.path);
                                                        await this.app.vault.modify(file, content);
                            } catch (err) {
                                console.error('Error updating card color in note frontmatter:', err);
                            }
                        })();
                    }

                    menu.hide();
                });
                
                container.appendChild(swatch);
            });
            
            item.setTitle("Colors");
            if (item.titleEl) {
                item.titleEl.appendChild(container);
            }
        });

        
        try {
            const enabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.enableCustomCategories);
            if (enabled) {
                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                if (cats.length > 0) {
                    menu.addSeparator();
                    cats.forEach(cat => {
                        if (cat) {
                            menu.addItem(item => {
                                item.setTitle(`Add to ${cat.label}`)
                                    .setIcon('plus-square')
                                    .onClick(async () => {
                                        try {
                                            // store category as label
                                            cardData.category = String(cat.label || '');
                                            if (typeof this.saveCards === 'function') await this.saveCards();

                                            
                                            
                                            try {
                                                const assigned = String(cat.id || cat.label || '').toLowerCase();
                                                if (this.currentCategoryFilter && String(this.currentCategoryFilter).toLowerCase() === assigned) {
                                                    try { if (cardData.element) cardData.element.style.display = ''; } catch (e) {}
                                                }
                                                if (typeof this.applyFilters === 'function') this.applyFilters();
                                            } catch (e) { }

                                            
                                            if (cardData.notePath) {
                                                try {
                                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                                    if (file) {
                                                        let content = await this.app.vault.read(file);
                                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                                        const clabel = String(cat.label || cat.id || '').trim();
                                                        const catLabelLine = `Category: ${clabel}`;
                                                        if (fmMatch) {
                                                            let fm = fmMatch[1];
                                                            if (/^\s*Category\s*:/gmi.test(fm)) {
                                                                fm = fm.replace(/^\s*Category\s*:.*$/gmi, catLabelLine);
                                                            } else {
                                                                fm = fm + '\n' + catLabelLine;
                                                            }
                                                            const newFm = '---\n' + fm + '\n---\n';
                                                            content = content.replace(fmMatch[0], newFm);
                                                        } else {
                                                            content = '---\n' + catLabelLine + '\n---\n\n' + content;
                                                        }
                                                        this.plugin.debugLog('sidecards: modify (add category) ->', file.path);
                                                        await this.app.vault.modify(file, content);
                                                    }
                                                } catch (err) { console.error('Error writing category to note frontmatter:', err); }
                                            }
                                        } catch (err) { console.error('Error setting custom category on card:', err); }
                                    });
                            });
                        }
                    });
                    
                    try {
                        if (cardData.category) {
                            
                            let currentLabel = String(cardData.category || '');
                            try {
                                const found = cats.find(x => String(x.id || '').toLowerCase() === String(cardData.category || '').toLowerCase() || String(x.label || '').toLowerCase() === String(cardData.category || '').toLowerCase());
                                if (found) currentLabel = found.label || found.id || currentLabel;
                            } catch (e) {}

                            menu.addItem(item => {
                                item.setTitle(`Remove from ${currentLabel}`)
                                    .setIcon('trash')
                                    .onClick(async () => {
                                        try {
                                            const prev = cardData.category;
                                            cardData.category = null;
                                            if (typeof this.saveCards === 'function') await this.saveCards();
                                            try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}

                                            
                                            if (cardData.notePath) {
                                                try {
                                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                                    if (file) {
                                                        let content = await this.app.vault.read(file);
                                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                                        if (fmMatch) {
                                                            let fm = fmMatch[1];
                                                            
                                                            fm = fm.replace(/^\s*Category\s*:.*$/gmi, '');
                                                            
                                                            fm = fm.split(/\r?\n/).filter(l => l.trim() !== '').join('\n');
                                                            const newFm = '---\n' + fm + (fm ? '\n' : '') + '---\n';
                                                            content = content.replace(fmMatch[0], newFm);
                                                            this.plugin.debugLog('sidecards: modify (remove category) ->', file.path);
                                                            await this.app.vault.modify(file, content);
                                                        }
                                                    }
                                                } catch (err) { console.error('Error removing category from note frontmatter:', err); }
                                            }
                                        } catch (err) { console.error('Error clearing category on card:', err); }
                                    });
                            });
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { console.error('Error adding custom category menu items:', e); }

        

        
        menu.addSeparator();

        // Create/View Note (based on whether note exists)
        if (cardData.notePath) {
            menu.addItem((item) => {
                item.setTitle('View Note')
                    .setIcon('link')
                    .onClick(async () => {
                        const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                        if (file) {
                            const leaf = this.app.workspace.getLeaf();
                            await leaf.openFile(file);
                        }
                    });
            });
        } else {
            menu.addItem((item) => {
                item.setTitle('Create Note')
                    .setIcon('document')
                    .onClick(async () => {
                        await this.createNoteFromCard(cardData);
                        this.saveCards();
                    });
            });
        }

        

        // Set Expiry
        menu.addItem((item) => {
            item.setTitle('Set Expiry')
                .setIcon('alarm-clock')
                .onClick(() => {
                    this.showDatetimeModal(cardData, 'expiresAt');
                });
        });

        // Add/Edit Tags
        menu.addItem((item) => {
            item.setTitle('Add Tags')
                .setIcon('tag')
                .onClick(() => {
                    this.showTagsModal(cardData);
                });
        });

        if (this.plugin.settings.enableCardStatus) {
            const statuses = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
            if (statuses.length > 0) {
                menu.addItem((item) => {
                    item.setTitle('Set Status')
                        .setIcon('flag')
                        .onClick(async () => {
                            const menu2 = new Menu(this.app);
                            statuses.forEach(st => {
                                menu2.addItem((it) => {
                                    it.setTitle(st.name || '')
                                        .onClick(async () => {
                                            // Update cardData with status including textColor from settings
                                            cardData.status = { name: st.name || '', color: st.color || '', textColor: st.textColor || '#000' };
                                            
                                            try {
                                                const pill = card.querySelector('.card-status-pill');
                                                if (pill) {
                                                    pill.style.display = '';
                                                    pill.textContent = st.name || '';
                                                    const a = (this.plugin && this.plugin.settings && typeof this.plugin.settings.statusPillOpacity !== 'undefined') ? this.plugin.settings.statusPillOpacity : 1;
                                                    // Ensure opacity is at least 0.1 for status pills to be visible
                                                    const opacity = Math.max(0.1, a);
                                                    const rgba = (() => { try { const h = String(st.color || '').replace('#',''); const n = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16); const r=(n>>16)&255,g=(n>>8)&255,b=n&255; return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`; } catch (e) { return st.color || ''; } })();
                                                    
                                                    // Apply color with high priority
                                                    pill.style.setProperty('background-color', rgba, 'important');
                                                    pill.style.setProperty('color', st.textColor || '#000', 'important');
                                                    pill.style.backgroundColor = rgba;
                                                    pill.style.color = st.textColor || '#000';
                                                    
                                                    // Force immediate DOM repaint by triggering a reflow
                                                    try { void pill.offsetHeight; } catch (e) {}
                                                    try { card.classList.add('has-pills'); } catch (e) {}
                                                }
                                            } catch (e) {}
                                            
                                            // Refresh masonry spans after status pill changes height
                                            try { this.refreshMasonrySpans(); } catch (e) {}
                                            
                                            // CRITICAL: Immediately apply the correct color to the card
                                            // If inherit status color is enabled, the card MUST show the status color
                                            try {
                                                if (this.plugin.settings.inheritStatusColor && st.color) {
                                                    // Immediately apply status color without any delay
                                                    // DO NOT overwrite cardData.color - keep original color stored
                                                    this.applyCardColorToElement(card, st.color);
                                                } else {
                                                    // If not inheriting, keep the original color
                                                    this.applyCardColor(cardData, card);
                                                }
                                            } catch (e) {
                                                this.plugin.debugLog('Error applying status color:', e);
                                            }
                                            
                                            // Save all changes at once (avoid flickering from multiple saves)
                                            try { await this.saveCards(); } catch (e) {}
                                            
                                            if (cardData.notePath) {
                                                try {
                                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                                    if (file) {
                                                        // Set flag to prevent file modification from triggering a reload
                                                        const flagKey = `_statusModifying_${file.path}`;
                                                        this.plugin[flagKey] = true;
                                                        try {
                                                            let content = await this.app.vault.read(file);
                                                            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                                            if (fmMatch) {
                                                                let fm = fmMatch[1];
                                                                fm = fm.replace(/^\s*Status\s*:.*$/gmi, '').replace(/^\s*Status-Color\s*:.*$/gmi, '').replace(/^\s*Status-Text-Color\s*:.*$/gmi, '');
                                                                fm = fm.split(/\r?\n/).filter(l => l.trim() !== '').join('\n');
                                                                fm += `\nStatus: "${(st.name || '').replace(/"/g,'\\"')}"`;
                                                                const newFm = '---\n' + fm + '\n---\n';
                                                                content = content.replace(fmMatch[0], newFm);
                                                                await this.app.vault.modify(file, content);
                                                            }
                                                        } finally {
                                                            // Clear flag after a brief delay to allow the modify to complete
                                                            setTimeout(() => { 
                                                                delete this.plugin[flagKey]; 
                                                            }, 100);
                                                        }
                                                    }
                                                } catch (e) {}
                                            }
                                        });
                                });
                            });
                            // Color dropdown for status colors
                            const container = document.createElement('div');
                            container.style.display = 'flex';
                            container.style.gap = '6px';
                            container.style.padding = '6px 0px';
                            const label = document.createElement('span');
                            label.textContent = 'Status Color:';
                            label.style.color = 'var(--text-muted)';
                            const colorInput = document.createElement('input');
                            colorInput.type = 'color';
                            colorInput.value = cardData.status?.color || '#20bf6b';
                            colorInput.addEventListener('change', async (e) => {
                                try {
                                    const newColor = e.target.value;
                                    if (cardData.status) {
                                        cardData.status.color = newColor;
                                        await this.saveCards();
                                        const pill = card.querySelector('.card-status-pill');
                                        if (pill) {
                                            const a = (this.plugin && this.plugin.settings && typeof this.plugin.settings.statusPillOpacity !== 'undefined') ? this.plugin.settings.statusPillOpacity : 1;
                                            const hex = String(newColor || '').replace('#','');
                                            const n = parseInt(hex.length === 3 ? hex.split('').map(x=>x+x).join('') : hex, 16);
                                            const r=(n>>16)&255,g=(n>>8)&255,b=n&255; const rgba = `rgba(${r}, ${g}, ${b}, ${Math.max(0.1, Math.min(1, a))})`;
                                            pill.style.backgroundColor = rgba;
                                        }
                                    }
                                } catch (err) {}
                            });
                            container.appendChild(label);
                            container.appendChild(colorInput);
                            if (menu2.titleEl) menu2.titleEl.appendChild(container);
                            menu2.showAtMouseEvent(event);
                        });
                });
            }
        }

        // Remove Status (if status exists)
        if (this.plugin.settings.enableCardStatus && cardData.status) {
            menu.addItem((item) => {
                item.setTitle('Remove Status')
                    .setIcon('trash')
                    .onClick(async () => {
                        try {
                            cardData.status = null;
                            await this.saveCards();
                            
                            // Update UI - hide status pill
                            try {
                                const pill = card.querySelector('.card-status-pill');
                                if (pill) {
                                    pill.style.display = 'none';
                                }
                            } catch (e) {}
                            
                            // Refresh masonry spans after status pill changes height
                            try { this.refreshMasonrySpans(); } catch (e) {}
                            
                            // Remove status color if it was applied
                            if (this.plugin.settings.inheritStatusColor) {
                                try { card.style.backgroundColor = ''; card.style.borderColor = ''; } catch (e) {}
                            }
                            
                            // Update note frontmatter
                            if (cardData.notePath) {
                                try {
                                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                    if (file) {
                                        let content = await this.app.vault.read(file);
                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                        if (fmMatch) {
                                            let fm = fmMatch[1];
                                            fm = fm.replace(/^\s*Status\s*:.*$/gmi, '').replace(/^\s*Status-Color\s*:.*$/gmi, '').replace(/^\s*Status-Text-Color\s*:.*$/gmi, '');
                                            fm = fm.split(/\r?\n/).filter(l => l.trim() !== '').join('\n');
                                            const newFm = '---\n' + fm + (fm ? '\n' : '') + '---\n';
                                            content = content.replace(fmMatch[0], newFm);
                                            this.plugin.debugLog('sidecards: modify (remove status) ->', file.path);
                                            await this.app.vault.modify(file, content);
                                        }
                                    }
                                } catch (e) { console.error('Error removing status from note frontmatter:', e); }
                            }
                        } catch (err) { console.error('Error clearing status on card:', err); }
                    });
            });
        }

        menu.addSeparator();

        // Destructive actions at the bottom
        menu.addItem((item) => {
            item.setTitle('Delete Card')
                .setIcon('trash')
                .onClick(async () => {
        this.plugin.debugLog("🔴 DELETION STARTED - Card data:", { id: cardData.id, notePath: cardData.notePath });
                    if (cardData.notePath) {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                            if (file) {
                                this.plugin.debugLog("📝 Attempting to delete note file:", file.path);
                                await this.app.vault.delete(file);
                                this.plugin.debugLog("✅ Note file deleted successfully:", file.path);
                            }
                        } catch (err) {
                            console.error('Error deleting note:', err);
                        }
                    }
                    
                    this.plugin.debugLog("🗑️ Removing card from DOM and internal state");
                    card.remove();
                    this.cards = this.cards.filter(c => c !== cardData);
                    this._deletedCardIds.add(cardData.id);  // Track deletion
                    await this.saveCards();
                    this.plugin.debugLog("💾 Card state saved, remaining cards:", this.cards.length);
                });
        });

        menu.addItem((item) => {
            item.setTitle(cardData.archived ? 'Unarchive Card' : 'Archive Card')
                .setIcon('archive')
                .onClick(async () => {
                    try {
                        const target = !cardData.archived;
                        this.plugin.debugLog(target ? 'Archiving card' : 'Unarchiving card', cardData.id, 'notePath:', cardData.notePath);
                        await this.toggleArchive(cardData, target);

                        // Remove from UI immediately
                        try {
                            if (target) { card.remove(); }
                            else { card.style.display = ''; }
                        } catch (e) {}

                        new Notice(target ? 'Card archived' : 'Card unarchived');
                        if (!target) {
                            try { await this.reloadCards(); } catch (e) {}
                        }
                    } catch (err) {
                        console.error('Error archiving card:', err);
                        new Notice('Error updating archive state (see console)');
                    }
                });
        });

        menu.addItem((item) => {
            item.setTitle('Duplicate Card')
                .setIcon('copy')
                .onClick(async () => {
                    try {
                        await this.duplicateCard(cardData);
                    } catch (e) { console.error('Error duplicating card:', e); new Notice('Error duplicating card'); }
                });
        });
        
        menu.showAtMouseEvent(event);
    }
    
    showTagsModal(cardData) {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Add Tags');
        
        const contentEl = modal.contentEl;
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Enter tags separated by spaces'
        });
        inputEl.style.width = '100%';
        inputEl.style.marginBottom = '10px';
        
        if (cardData.tags) {
            inputEl.value = cardData.tags.join(' ');
        }

        
        try {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    try { saveButton.click(); } catch (err) {  }
                }
            });
        } catch (e) { }
        
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        const saveButton = buttonContainer.createEl('button', { text: 'Save' });
        saveButton.addClass('mod-cta');
        
        cancelButton.addEventListener('click', () => modal.close());
        saveButton.addEventListener('click', async () => {
            const tags = inputEl.value.split(' ').filter(t => t.trim().length > 0);
            cardData.tags = tags;
            const tagsEl = cardData.element.querySelector('.card-tags');
            if (tagsEl) tagsEl.remove();
            if (tags.length > 0) {
                const footerLeft = cardData.element.querySelector('.card-footer-left');
                const newTagsEl = footerLeft.createDiv();
                newTagsEl.addClass('card-tags');
                tags.forEach(t => {
                    const tagEl = newTagsEl.createDiv();
                    tagEl.addClass('card-tag');
                    tagEl.textContent = (this.plugin.settings.omitTagHash ? t : `#${t}`);
                });
                if (!this.plugin.settings.groupTags) newTagsEl.remove();
            }

            await this.saveCards();

            
            if (cardData.notePath) {
                try {
                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                    if (file) {
                        let content = await this.app.vault.read(file);

                        const tagArray = (cardData.tags || []).map(t => String(t).trim()).filter(t => t.length > 0);
                        
                        const tagsBlock = tagArray.length > 0
                            ? 'Tags: [' + tagArray.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ') + ']'
                            : 'Tags: []';

                        try {
                            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                            
                            
                            
                            try {
                                const pendingEntry = { tags: tagArray.slice(), expiresAt: Date.now() + 3000 };
                                this._pendingTagWrites = this._pendingTagWrites || {};
                                if (file && file.path) this._pendingTagWrites[file.path] = pendingEntry;
                            } catch (e) {}

                            if (fmMatch) {
                                let fm = fmMatch[1];
                                
                                const lines = fm.split(/\r?\n/);
                                const newLines = [];
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i];
                                    if (/^\s*(Tags|tags)\s*:/i.test(line)) {
                                        
                                        const rest = line.replace(/^\s*(Tags|tags)\s*:\s*/i, '').trim();
                                        if (rest.startsWith('[')) {
                                            continue;
                                        }
                                        
                                        i++;
                                        while (i < lines.length && /^\s*-\s+/.test(lines[i])) i++;
                                        i--;
                                        continue;
                                    }
                                    newLines.push(line);
                                }

                                const rebuiltFm = tagsBlock + '\n' + (newLines.length ? newLines.join('\n') + '\n' : '');
                                const newFmFull = '---\n' + rebuiltFm + '---\n';
                                content = content.replace(fmMatch[0], newFmFull);
                            } else {
                                const newFmFull = '---\n' + tagsBlock + '\n---\n\n' + content;
                                content = newFmFull;
                            }
                        } catch (err) {
                            console.error('Error updating Tags in frontmatter:', err);
                        }

                        this.plugin.debugLog('sidecards: modify (showTagsModal) ->', file.path);
                        await this.app.vault.modify(file, content);

                        
                        
                        
                        try {
                            const mdLeaves = this.app.workspace.getLeavesOfType('markdown') || [];
                            for (const leaf of mdLeaves) {
                                try {
                                    const mv = leaf.view;
                                    if (!mv || !mv.file || !mv.file.path) continue;
                                    if (mv.file.path !== file.path) continue;
                                    if (!mv.editor || typeof mv.editor.setValue !== 'function') continue;

                                    
                                    try {
                                        const latest = await this.app.vault.read(file);
                                        let cursor = null;
                                        try { cursor = mv.editor.getCursor && mv.editor.getCursor(); } catch (e) { cursor = null; }
                                        mv.editor.setValue(latest);
                                        try { if (cursor && mv.editor.setCursor) mv.editor.setCursor(cursor); } catch (e) {}
                                    } catch (e) {
                                        
                                    }
                                } catch (e) {}
                            }
                        } catch (e) {}
                    }
                } catch (err) {
                    console.error('Error updating tags in note frontmatter:', err);
                }
            }

            try { this.applyAutoColorRules(cardData); } catch (e) {}
            modal.close();
        });
        
        modal.open();
    }

    showDatetimeModal(cardData, field) {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Set Expiry');
        const contentEl = modal.contentEl;

        const toLocalInputValue = (iso) => {
            try {
                const d = new Date(iso);
                if (isNaN(d)) return '';
                const pad = (n) => String(n).padStart(2, '0');
                const yyyy = d.getFullYear();
                const mm = pad(d.getMonth() + 1);
                const dd = pad(d.getDate());
                const hh = pad(d.getHours());
                const mi = pad(d.getMinutes());
                return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            } catch (e) { return ''; }
        };

        const inputEl = contentEl.createEl('input', { type: 'datetime-local' });
        inputEl.style.width = '100%';
        inputEl.style.marginBottom = '10px';
        if (cardData[field]) inputEl.value = toLocalInputValue(cardData[field]);

        const btnRow = contentEl.createDiv();
        btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'space-between'; btnRow.style.gap = '8px'; btnRow.style.flexWrap = 'wrap';
        const quickToday = btnRow.createEl('button', { text: 'Today 23:59' });
        const quickTomorrow = btnRow.createEl('button', { text: 'Tomorrow 18:00' });
        quickToday.addEventListener('click', () => {
            const d = new Date(); d.setHours(23,59,0,0);
            inputEl.value = toLocalInputValue(d.toISOString());
        });
        quickTomorrow.addEventListener('click', () => {
            const d = new Date(Date.now() + 24*3600*1000); d.setHours(18,0,0,0);
            inputEl.value = toLocalInputValue(d.toISOString());
        });

        const actionRow = contentEl.createDiv();
        actionRow.style.display = 'flex'; actionRow.style.justifyContent = 'flex-end'; actionRow.style.gap = '8px'; actionRow.style.marginTop = '10px';
        const clearBtn = actionRow.createEl('button', { text: 'Clear' });
        const saveBtn = actionRow.createEl('button', { text: 'Save' });
        saveBtn.addClass('mod-cta');

        clearBtn.addEventListener('click', async () => {
            cardData[field] = null;
            await this.saveCards();
            if (cardData.notePath) {
                try {
                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                    if (file) {
                        const text = await this.app.vault.read(file);
                        const updated = this.updateFrontmatter(text, 'Expires-At', null);
                        await this.app.vault.modify(file, updated);
                    }
                } catch (e) { }
            }
            try {
                const pill = cardData.element?.querySelector('.card-expiry-pill');
                if (pill) pill.style.display = 'none';
                if (cardData._expiryTimeout) { clearTimeout(cardData._expiryTimeout); cardData._expiryTimeout = null; }
                if (cardData._expiryUpdateInterval) { clearInterval(cardData._expiryUpdateInterval); cardData._expiryUpdateInterval = null; }
            } catch (e) {}
            modal.close();
        });

        saveBtn.addEventListener('click', async () => {
            const raw = inputEl.value.trim();
            let iso = '';
            try {
                if (raw) {
                    const d = new Date(raw);
                    if (!isNaN(d)) iso = d.toISOString();
                }
            } catch (e) {}
            cardData[field] = iso || null;
            await this.saveCards();
            if (cardData.notePath) {
                try {
                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                    if (file) {
                        const text = await this.app.vault.read(file);
                        const updated = this.updateFrontmatter(text, 'Expires-At', iso || null);
                        await this.app.vault.modify(file, updated);
                    }
                } catch (e) { }
            }
            try {
                const pill = cardData.element?.querySelector('.card-expiry-pill');
                if (pill) {
                    const t = new Date(cardData[field]).getTime();
                    if (!isNaN(t)) {
                        const now = Date.now();
                        const ms = t - now;
                        const totalMinutes = Math.max(0, Math.floor(ms / 60000));
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        const txt = hours > 0 ? `expiring in ${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}` : `expiring in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
                        pill.style.display = '';
                        pill.style.backgroundColor = 'var(--background-modifier-hover)';
                        pill.style.color = 'var(--text-normal)';
                        pill.textContent = txt;
                    }
                }
                if (cardData._expiryTimeout) { clearTimeout(cardData._expiryTimeout); }
                const delay = Math.max(0, new Date(cardData[field]).getTime() - Date.now());
                cardData._expiryTimeout = setTimeout(() => {
                    try {
                        if (this.plugin && this.plugin.settings && this.plugin.settings.autoArchiveOnExpiry) {
                            this.toggleArchive(cardData, true).catch(() => {});
                        } else {
                            try { cardData.element?.remove(); } catch (e) {}
                            this.cards = (this.cards || []).filter(x => x.id !== cardData.id);
                        }
                    } catch (e) {}
                }, delay);
                if (cardData._expiryUpdateInterval) { clearInterval(cardData._expiryUpdateInterval); }
                cardData._expiryUpdateInterval = setInterval(() => {
                    try {
                        const pill2 = cardData.element?.querySelector('.card-expiry-pill');
                        if (!pill2) return;
                        const t2 = new Date(cardData[field]).getTime();
                        if (isNaN(t2)) { pill2.style.display = 'none'; return; }
                        const ms2 = t2 - Date.now();
                        const totalMinutes2 = Math.max(0, Math.floor(ms2 / 60000));
                        const hours2 = Math.floor(totalMinutes2 / 60);
                        const minutes2 = totalMinutes2 % 60;
                        pill2.textContent = hours2 > 0 ? `expiring in ${hours2} hour${hours2 !== 1 ? 's' : ''} and ${minutes2} minute${minutes2 !== 1 ? 's' : ''}` : `expiring in ${minutes2} minute${minutes2 !== 1 ? 's' : ''}`;
                        try {
                            const statusVisible = cardData.element?.querySelector('.card-status-pill')?.style.display !== 'none';
                            const any = (pill2.style.display !== 'none') || statusVisible;
                            if (any) cardData.element?.classList.add('has-pills'); else cardData.element?.classList.remove('has-pills');
                        } catch (e) {}
                    } catch (e) {}
                }, 60000);
            } catch (e) {}
            modal.close();
        });
        modal.open();
    }

    // Convert an in-memory card to a persistent Markdown note with frontmatter metadata
    async createNoteFromCard(cardData) {
        this.plugin.debugLog("🆕 createNoteFromCard called", { cardData: { id: cardData.id, content: cardData.content.slice(0, 50) + "..." } });
        try {
            // Mark this as a user-initiated create
            if (this.plugin) {
                this.plugin._userInitiatedCreate = true;
                setTimeout(() => {
                    this.plugin._userInitiatedCreate = false;
                }, 1000); // Reset after 1 second
            }
            const firstLine = cardData.content.split('\n')[0] || cardData.content;
            const title = firstLine.slice(0, 30).trim();
            const baseFileName = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.md`;
            
            // Check if a similar file was recently deleted
            if (this.plugin && this.plugin._recentlyDeletedPaths) {
                const normalizedBase = baseFileName.toLowerCase();
                for (const deletedPath of this.plugin._recentlyDeletedPaths) {
                    const deletedBaseName = deletedPath.split('/').pop().toLowerCase();
                    if (deletedBaseName.replace(/\s+\d+/g, '') === normalizedBase.replace(/\s+\d+/g, '')) {
                        this.plugin.debugLog("🚫 Preventing creation of note similar to recently deleted file:", baseFileName);
                        throw new Error("Cannot create note - similar file was recently deleted");
                    }
                }
            }
            
            const fileName = baseFileName;
            let filePath;
            
            if (this.plugin.settings.storageFolder === '/') {
                filePath = fileName;
            } else {
                const folder = this.plugin.settings.storageFolder;
                if (!(await this.app.vault.adapter.exists(folder))) {
                    await this.app.vault.createFolder(folder);
                }
                filePath = `${folder}/${fileName}`;
            }
            
            const created = this.formatTimestamp(new Date());
            
            let tagArray = (cardData.tags || []).map(t => String(t).trim()).filter(t => t.length > 0);
            const tagsYaml = tagArray.length > 0 ? `Tags: [${tagArray.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ')}]` : 'Tags: []';

            let colorKey = '';
            let colorLabel = '';
            try {
                const cv = cardData.color || '';
                const m = String(cv).match(/--card-color-(\d+)/);
                if (m) {
                    colorKey = `color-${m[1]}`;
                    colorLabel = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[Number(m[1]) - 1]) || '';
                } else if (cv && cv.startsWith('#')) {
                    colorKey = cv;
                }
            } catch (e) { }

            const colorLine = colorKey ? `card-color: ${colorKey}` : '';
            const colorNameLine = colorLabel ? `card-color-name: "${String(colorLabel).replace(/"/g, '\\"')}"` : '';

            
            let categoryBlock = '';
            try {
                if (cardData.category) {
                    const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                    const found = cats.find(x => String(x.id || '').toLowerCase() === String(cardData.category || '').toLowerCase() || String(x.label || '').toLowerCase() === String(cardData.category || '').toLowerCase());
                    const clabel = found ? (found.label || found.id) : cardData.category;
                    categoryBlock = `Category: ${clabel}\n`;
                }
            } catch (e) { }

            const noteContent = `---\nCreated-Date: ${created}\n${tagsYaml}${colorLine ? '\n' + colorLine : ''}${colorNameLine ? '\n' + colorNameLine : ''}\n${categoryBlock}---\n\n${cardData.content}`;
            
            this.plugin.debugLog("📄 About to create file", { filePath, contentPreview: noteContent.slice(0, 100) + "..." });
            const file = await this.app.vault.create(filePath, noteContent);
            this.plugin.debugLog("✅ File created successfully:", file.path);
            const leaf = this.app.workspace.getLeaf();
            await leaf.openFile(file);

            try {
                cardData.notePath = file.path || filePath;
                this.saveCards();
            } catch (e) {
            }

            new Notice(`Note created in ${this.plugin.settings.storageFolder || 'root folder'}`);
        } catch (error) {
            new Notice('Error creating note');
            console.error('Error creating note:', error);
        }
    }

    async duplicateCard(source) {
        try {
            const content = source.content || '';
            const copiedTags = Array.isArray(source.tags) ? source.tags.slice() : [];
            const colorVar = source.color || 'var(--card-color-1)';
            const category = source.category || null;

            const newCard = this.createCard(content, {
                color: colorVar,
                tags: copiedTags,
                category: category,
                archived: false,
                pinned: false
            });

            try {
                const folder = this.plugin.settings.storageFolder || '';
                if (folder && !(await this.app.vault.adapter.exists(folder))) {
                    await this.app.vault.createFolder(folder);
                }

                const firstSentence = (content.split('.')[0] || content).trim();
                let title = firstSentence.substring(0, 50);
                const timestamp = new Date();
                let fileName = `${title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()} copy ${timestamp.getHours().toString().padStart(2, '0')}${timestamp.getMinutes().toString().padStart(2, '0')}`;
                let filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
                if (await this.app.vault.adapter.exists(filePath)) {
                    fileName += `-${Date.now()}`;
                    filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
                }

                const createdDateISO = new Date().toISOString();
                const createdDate = new Date(createdDateISO);
                const pad = n => String(n).padStart(2, '0');
                const yamlDate = `${pad(createdDate.getDate())}${createdDate.toLocaleString('en-US', { month: 'short' })}${String(createdDate.getFullYear()).slice(-2)}, ${pad(createdDate.getHours())}:${pad(createdDate.getMinutes())}`;

                const tagArray = copiedTags.map(t => String(t).trim()).filter(t => t.length > 0);
                const tagsYaml = tagArray.length > 0 ? ('Tags:\n' + tagArray.map(t => `  - ${t}`).join('\n')) : 'Tags: []';

                let colorKey = 'color-1';
                let colorLabel = '';
                try {
                    const m = String(colorVar).match(/--card-color-(\d+)/);
                    if (m) {
                        colorKey = `color-${m[1]}`;
                        colorLabel = (this.plugin.settings.colorNames && this.plugin.settings.colorNames[Number(m[1]) - 1]) || '';
                    } else if (colorVar && colorVar.startsWith('#')) {
                        colorKey = colorVar;
                    }
                } catch (e) {}

                const colorLine = `card-color: ${colorKey}`;
                const colorNameLine = colorLabel ? `card-color-name: "${String(colorLabel).replace(/"/g, '\\"')}"` : '';

                const fm = [
                    '---',
                    tagsYaml,
                    colorLine,
                    colorNameLine,
                    `Created-Date: ${yamlDate}`,
                ];
                if (category) fm.push(`Category: ${String(category).replace(/\n/g, ' ')}`);
                fm.push('---');

                const noteContent = fm.join('\n') + '\n\n' + content;
                await this.app.vault.create(filePath, noteContent);
                newCard.notePath = filePath;
                await this.saveCards();
                if (typeof this.applyFilters === 'function') this.applyFilters();
                this.animateCardsEntrance({ duration: 260, offset: 28 });
            } catch (err) {
                console.error('Error creating duplicated note:', err);
            }
        } catch (err) {
            console.error('Error in duplicateCard:', err);
        }
    }

    async loadCardsPrioritized(cardsToRender, showArchived = false) {
        const renderStartTime = performance.now();
        console.log("[SIDECARDS] 🚀 IMMEDIATE visibility rendering with", cardsToRender.length, "total cards");
        
        try {
            // STEP 1: Batch append all cards to DOM (all at once, not in batches)
            // This is the key: get them all in the DOM with plain text immediately
            const appendStartTime = performance.now();
            
            if (this.cardsContainer && cardsToRender.length > 0) {
                // Use a document fragment for optimal batch DOM operations
                const fragment = document.createDocumentFragment();
                
                for (const cardData of cardsToRender) {
                    try {
                        if (cardData.element && !cardData.element.parentNode) {
                            fragment.appendChild(cardData.element);
                        }
                    } catch (e) {
                        console.error('[SIDECARDS] Error adding card to fragment:', e);
                    }
                }
                
                // Append all cards in one DOM operation
                if (fragment.childNodes.length > 0) {
                    this.cardsContainer.appendChild(fragment);
                }
            }
            
            console.log(`[SIDECARDS] ⚡ Batch appended ${cardsToRender.length} cards in ${(performance.now() - appendStartTime).toFixed(2)}ms`);
            
            // STEP 2: If grid mode, calculate masonry spans BEFORE making visible
            try {
                if (this.plugin.settings.verticalCardMode) {
                    try { this.refreshMasonrySpans(); } catch (e) {}
                }
            } catch (e) {}
            
            // STEP 3: Make container visible in rAF after layout is stable, then animate
            const makeVisible = () => {
                try {
                    if (this.cardsContainer) {
                        this.cardsContainer.style.visibility = '';
                    }
                } catch (e) {}
                try { this.animateCardsEntrance(); } catch (e) {}
            };
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(() => makeVisible());
            } else {
                setTimeout(makeVisible, 0);
            }
            
            // STEP 4: Schedule markdown rendering asynchronously and return its completion
            return this.scheduleMarkdownRenderingIdle(cardsToRender);
            
        } catch (e) {
            console.error('[SIDECARDS] Error in progressive render:', e);
            // Fallback: show all cards
            try { if (this.cardsContainer) this.cardsContainer.style.visibility = ''; } catch (e2) {}
        }
        return Promise.resolve();
    }

    scheduleMarkdownRenderingIdle(cardsToRender) {
        const markdownQueueRaw = this._deferredRenderQueue || [];
        this._deferredRenderQueue = [];
        if (markdownQueueRaw.length === 0) {
            return Promise.resolve();
        }
        const visibleFirst = [];
        const nonVisible = [];
        for (const item of markdownQueueRaw) {
            try {
                const el = item.contentEl;
                const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                const inView = r ? (r.top < window.innerHeight && r.bottom > 0) : false;
                (inView ? visibleFirst : nonVisible).push(item);
            } catch (e) { nonVisible.push(item); }
        }
        const markdownQueue = visibleFirst.concat(nonVisible);
        let index = 0;
        const token = (this._markdownRenderToken || 0) + 1;
        this._markdownRenderToken = token;
        const onUserInteract = () => { this._markdownRenderToken++; };
        try {
            if (this.cardsContainer) {
                this.cardsContainer.addEventListener('scroll', onUserInteract, { passive: true });
                this.cardsContainer.addEventListener('wheel', onUserInteract, { passive: true });
                this.cardsContainer.addEventListener('touchstart', onUserInteract, { passive: true });
                this.cardsContainer.addEventListener('keydown', onUserInteract, { passive: true });
                this.cardsContainer.addEventListener('mousemove', onUserInteract, { passive: true });
            }
        } catch (e) {}
        const detach = () => {
            try {
                if (this.cardsContainer) {
                    this.cardsContainer.removeEventListener('scroll', onUserInteract);
                    this.cardsContainer.removeEventListener('wheel', onUserInteract);
                    this.cardsContainer.removeEventListener('touchstart', onUserInteract);
                    this.cardsContainer.removeEventListener('keydown', onUserInteract);
                    this.cardsContainer.removeEventListener('mousemove', onUserInteract);
                }
            } catch (e) {}
        };
        return new Promise((resolve) => {
            const processOne = () => {
                if (token !== this._markdownRenderToken) { detach(); resolve(); return; }
                if (index >= markdownQueue.length) { 
                    detach(); 
                    // CRITICAL: Recalculate masonry spans after ALL markdown rendering is complete
                    try { this.refreshMasonrySpans(); } catch (e) {}
                    resolve(); 
                    return; 
                }
                const item = markdownQueue[index++];
                try {
                    if (item.contentEl && item.contentEl.isConnected) {
                        const tmp = document.createElement('div');
                        MarkdownRenderer.render(this.app, item.content, tmp, item.notePath);
                        const frag = document.createDocumentFragment();
                        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
                        if (window.requestAnimationFrame) {
                            window.requestAnimationFrame(() => {
                                if (!item.contentEl.isConnected || token !== this._markdownRenderToken) { setTimeout(next, 1); return; }
                                item.contentEl.empty();
                                item.contentEl.appendChild(frag);
                                // Schedule a small delay to allow DOM to update card height
                                setTimeout(() => {
                                    try {
                                        // Trigger a micro-update for this card's masonry span after content renders
                                        const card = item.contentEl.closest('.card-sidebar-card');
                                        if (card && this.plugin.settings.verticalCardMode) {
                                            const h = card.getBoundingClientRect().height;
                                            const span = Math.max(1, Math.ceil(h + 6));
                                            card.style.gridRowEnd = 'span ' + span;
                                        }
                                    } catch (e) {}
                                    next();
                                }, 8);
                            });
                        } else {
                            item.contentEl.empty();
                            item.contentEl.appendChild(frag);
                            next();
                        }
                    } else {
                        setTimeout(next, 1);
                    }
                } catch (e) {
                    setTimeout(next, 1);
                }
            };
            const next = () => {
                if (token !== this._markdownRenderToken) { detach(); resolve(); return; }
                if (index >= markdownQueue.length) { 
                    detach(); 
                    // CRITICAL: Recalculate masonry spans after ALL markdown rendering is complete
                    try { this.refreshMasonrySpans(); } catch (e) {}
                    resolve(); 
                    return; 
                }
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(() => processOne(), { timeout: 5000 });
                } else {
                    setTimeout(processOne, 1);
                }
            };
            next();
        });
    }

    scheduleDeferredUiSetup() {
        const queue = this._deferredUiSetupQueue || [];
        if (queue.length === 0) return;
        const run = () => {
            const items = queue.splice(0, queue.length);
            for (const item of items) {
                try {
                    const cd = item.cardData;
                    if (!cd || !cd.element) continue;
                    const footer = cd.element.querySelector('.card-footer-left')?.parentElement || cd.element.querySelector('.card-footer-right')?.parentElement;
                    if (footer) {
                        const leftExists = cd.element.querySelector('.card-footer-left');
                        const rightExists = cd.element.querySelector('.card-footer-right');
                        if (!leftExists) {
                            const left = footer.createDiv();
                            left.addClass('card-footer-left');
                            if (this.plugin.settings.showTimestamps) {
                                const ts = left.createDiv();
                                ts.addClass('card-timestamp');
                                ts.textContent = this.formatTimestamp(cd.created || new Date().toISOString());
                            }
                            if (cd.tags && cd.tags.length > 0 && !this.plugin.settings.groupTags) {
                                const tagsEl = left.createDiv();
                                tagsEl.addClass('card-tags');
                                (cd.tags || []).forEach(t => {
                                    const tagText = (this.plugin.settings.omitTagHash ? t : `#${t}`);
                                    const tagEl = tagsEl.createDiv();
                                    tagEl.addClass('card-tag');
                                    tagEl.textContent = tagText;
                                });
                            }
                        }
                        if (!rightExists) {
                            const right = footer.createDiv();
                            right.addClass('card-footer-right');
                        }
                    }
                } catch (e) {}
            }
        };
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => run());
        } else {
            setTimeout(run, 0);
        }
    }

    scheduleFrontmatterSyncIdle(cards) {
        const list = Array.isArray(cards) ? cards.slice() : [];
        const run = async () => {
            for (const cd of list) {
                try {
                    if (!cd || !cd.notePath) continue;
                    const file = this.app.vault.getAbstractFileByPath(cd.notePath);
                    if (!file || !file.stat) continue;
                    const mtime = file.stat.mtime || 0;
                    const cache = (this.plugin.settings.frontmatterCache || {});
                    const cached = cache[cd.notePath];
                    if (cached && cached.mtime >= mtime) continue;
                    const text = await this.app.vault.read(file);
                    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                    let fm = m ? m[1] : '';
                    let archived = cd.archived || false;
                    let pinned = cd.pinned || false;
                    let statusName = (cd.status && cd.status.name) || '';
                    let statusColor = (cd.status && cd.status.color) || '';
                    let statusTextColor = (cd.status && cd.status.textColor) || '';
                    let expiresAt = cd.expiresAt || null;
                    let category = cd.category || null;
                    let colorVar = cd.color || null;
                    let tags = Array.isArray(cd.tags) ? cd.tags.slice() : [];
                    if (fm) {
                        const archMatch = fm.match(/^\s*archived\s*:\s*(true|false)\s*$/mi);
                        if (archMatch) archived = archMatch[1].toLowerCase() === 'true';
                        const pinMatch = fm.match(/^\s*pinned\s*:\s*(true|false)\s*$/mi);
                        if (pinMatch) pinned = pinMatch[1].toLowerCase() === 'true';
                        const eMatch = fm.match(/^\s*Expires-At\s*:\s*(.*)$/mi);
                        if (eMatch) expiresAt = String(eMatch[1]).trim().replace(/^"|"$/g, '');
                        const stMatch = fm.match(/^\s*Status\s*:\s*(.*)$/mi);
                        if (this.plugin.settings.enableCardStatus && stMatch) {
                            const sName = String(stMatch[1]).trim().replace(/^"|"$/g, '');
                            const statusSettings = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
                            const matchedStatus = statusSettings.find(st => String(st.name || '').toLowerCase() === String(sName).toLowerCase());
                            statusName = sName;
                            statusColor = matchedStatus ? (matchedStatus.color || '') : '';
                            statusTextColor = matchedStatus ? (matchedStatus.textColor || '') : '';
                        }
                        const catMatch = fm.match(/^\s*Category\s*:\s*(.*)$/mi);
                        if (catMatch && catMatch[1]) category = String(catMatch[1]).trim().replace(/^"|"$/g, '');
                        const ccMatch = fm.match(/^\s*card-color:\s*(.*)$/mi);
                        if (ccMatch) {
                            const val = ccMatch[1].trim().replace(/^"|"$/g, '');
                            const m2 = String(val).match(/^color-(\d+)$/i);
                            if (m2) colorVar = `var(--card-color-${m2[1]})`;
                            else if (/^#/.test(val)) colorVar = val;
                            else {
                                const idx = (this.plugin.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(val).toLowerCase());
                                if (idx >= 0) colorVar = `var(--card-color-${idx+1})`;
                            }
                        }
                        const parsedTags = this.parseTagsFromFrontmatter ? this.parseTagsFromFrontmatter(fm) : [];
                        if (parsedTags && parsedTags.length > 0) tags = parsedTags;
                    }
                    cd.archived = archived;
                    cd.pinned = pinned;
                    cd.expiresAt = expiresAt;
                    cd.category = category;
                    cd.color = colorVar || cd.color;
                    if (statusName) cd.status = { name: statusName, color: statusColor, textColor: statusTextColor };
                    cd.tags = tags;
                    if (cd.element) this.applyCardColorToElement(cd.element, cd.color);
                    this.plugin.settings.frontmatterCache = this.plugin.settings.frontmatterCache || {};
                    this.plugin.settings.frontmatterCache[cd.notePath] = {
                        archived,
                        pinned,
                        color: colorVar || '',
                        statusName,
                        category,
                        expiresAt,
                        tags,
                        mtime
                    };
                } catch (e) {}
            }
            try { await this.scheduleSaveCards(300); } catch (e) {}
        };
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => { run(); });
        } else {
            setTimeout(() => { run(); }, 0);
        }
    }

    async loadCards(showArchived = false) {
        const loadStartTime = performance.now();
        console.log("[SIDECARDS] 📥 loadCards called with showArchived:", showArchived);
        console.log("[SIDECARDS] 📦 Total saved cards in settings:", (this.plugin.settings.cards || []).length);
        // Prevent multiple simultaneous loads; queue the latest request ONLY if it's different from current load
        if (this._loadInProgress) {
            // Only queue if the archived state is different from what's currently loading
            const currentLoadArchived = this._lastLoadArchived || false;
            if (!!showArchived !== currentLoadArchived) {
                this._queuedLoad = !!showArchived;
                console.log('[SIDECARDS] ⏭️ Different archived state queued: current=' + currentLoadArchived + ' queued=' + !!showArchived);
            } else {
                console.log('[SIDECARDS] ⏭️ Skipping loadCards - already loading same state (archived=' + currentLoadArchived + ')');
            }
            try { console.trace('[SIDECARDS] 🔍 loadCards called from:'); } catch (e) {}
            return;
        }
        this._loadInProgress = true;
        try { console.trace('[SIDECARDS] 🔍 loadCards called from:'); } catch (e) {}
        const _finishLoad = () => {
            this._loadInProgress = false;
            const hasQueued = typeof this._queuedLoad !== 'undefined';
            const next = this._queuedLoad;
            this._queuedLoad = undefined;
            if (hasQueued) {
                try {
                    if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
                } catch (e) {}
                this._reloadTimeout = setTimeout(() => {
                    try { this.loadCards(next); } catch (e) {}
                }, 100);
            }
        };
        try {
            this._bulkLoading = true;
            this._applySortLoadInProgress = true;
            try { if (this.cardsContainer) this.cardsContainer.style.visibility = 'hidden'; } catch (e) {}
            if (this.cardsContainer) this.cardsContainer.empty();
        } catch (e) {}

        try { this._lastLoadArchived = !!showArchived; } catch (e) {}
        this._initialLoadInProgress = true;
        this.cards = [];
        this.plugin.debugLog('🧹 Cleared existing cards array before load');
        try { this.applyLayoutMode(); } catch (e) {}
        const folder = this.plugin.settings.storageFolder;

        // CRITICAL FIX: Initialize universal order before any card loading
        if (!this._universalCardOrder || this._universalCardOrder.length === 0) {
            this._universalCardOrder = this.plugin.settings.manualOrder || [];
            this.plugin.debugLog("🔄 Initialized universal card order from settings:", {
                orderLength: this._universalCardOrder.length,
                samplePaths: this._universalCardOrder.slice(0, 3)
            });
        }

        if (folder && folder !== '/') {
            try {
                // Use hybrid approach: use cached settings if available, only import from folder on first load
                const savedCardsCount = (this.plugin.settings.cards || []).length;
                this.plugin.debugLog('📦 Saved cards available in settings:', savedCardsCount);
                
                if (this.plugin._importedFromFolderOnLoad && savedCardsCount > 0) {
                    this.plugin.debugLog('💾 Using cached cards from settings (already imported on load)');
                    const savedRaw = this.plugin.settings.cards || [];
                    const seenPaths = new Set();
                    const saved = savedRaw.filter(sc => {
                        const key = (sc.notePath || sc.id || '').toLowerCase();
                        if (!key) return true;
                        if (seenPaths.has(key)) return false;
                        seenPaths.add(key);
                        return true;
                    });
                    const cardCreationStart = performance.now();
                    for (const savedCard of saved) {
                        try {
                            const pinnedFromNote = savedCard.pinned || false;
                            const archivedFromNote = savedCard.archived || false;

                            // Only create cards that match the requested archived filter
                            try {
                                if (showArchived && !archivedFromNote) {
                                    // When showing archived cards, skip non-archived cards
                                    continue;
                                }
                                if (!showArchived && archivedFromNote) {
                                    // When showing non-archived cards, skip archived cards
                                    continue;
                                }
                            } catch (e) {}

                            const createOpts = {
                                id: savedCard.id,
                                color: savedCard.color,
                                tags: savedCard.tags,
                                category: savedCard.category || null,
                                created: savedCard.created,
                                archived: archivedFromNote,
                                pinned: pinnedFromNote || false,
                                notePath: savedCard.notePath,
                                expiresAt: savedCard.expiresAt || null,
                                status: savedCard.status || null
                            };
                            const createdCard = this.enqueueCardCreate(savedCard.content || '', createOpts);
                            try {
                                if (createdCard && createdCard.archived && !showArchived && createdCard.element) {
                                    createdCard.element.style.display = 'none';
                                }
                            } catch (e) {}
                        } catch (err) { console.error('Error loading cached card', err); }
                    }
                    console.log(`[SIDECARDS] ⚡ Card creation (cached) took ${(performance.now() - cardCreationStart).toFixed(2)}ms for ${this.cards.length} cards`);
                } else {
                    // First load or cache is empty - do a full import from folder
                    this.plugin.debugLog('📁 Initial import from storage folder:', folder);
                    const importedCount = await this.importNotesFromFolder(folder, true, showArchived);
                    this.plugin._importedFromFolderOnLoad = true;
                    this.plugin.debugLog('📁 Imported from folder count:', importedCount);
                }
            } catch (e) {
                console.error('Error importing notes from storage folder during load:', e);
            }

            // Reveal cards immediately after creation, before sorting
            this.refreshAllCardTimestamps();
            try { if (!this.plugin.settings.verticalCardMode) this.animateCardsEntrance(); } catch (e) {}
            // DON'T reveal yet - wait for rendering to complete
            console.log(`[SIDECARDS] ⚡ Card creation and sorting complete, waiting for rendering...`);

            // Apply saved sorting preference (mode + direction) so order persists across reloads
            try {
                const mode = (this.plugin && this.plugin.settings && this.plugin.settings.sortMode) || 'manual';
                const asc = (this.plugin && this.plugin.settings && typeof this.plugin.settings.sortAscending !== 'undefined') ? !!this.plugin.settings.sortAscending : true;
                
                if (this.plugin.settings.inheritStatusColor) {
                    try {
                        (this.cards || []).forEach(c => {
                            if (c && c.status && c.status.color) {
                                c.color = c.status.color;
                                if (c.element) this.applyCardColorToElement(c.element, c.status.color);
                            }
                        });
                    } catch (e) {}
                }
                this.plugin.debugLog('sidecards: calling applySort (loadCards folder branch)', { mode, asc, universalOrder: this._universalCardOrder?.length });
                await this.applySort(mode, asc);
            } catch (e) {
                console.error('Error applying saved sort after folder-load:', e);
            }

            try { this._applySortLoadInProgress = false; } catch (e) {}
            this._bulkLoading = false;
            this.plugin.debugLog('✅ Folder branch load complete', { finalCount: (this.cards || []).length });
            
            // PERFORMANCE: Use progressive rendering
            this.refreshAllCardTimestamps();
            try { if (!this.plugin.settings.verticalCardMode) this.animateCardsEntrance(); } catch (e) {}
            
            const cardsToRender = [...(this.cards || [])];
            await this.loadCardsPrioritized(cardsToRender, showArchived);
            
            // DO NOT sync frontmatter during initial load - this causes saveCards to be called,
            // which triggers the double-render issue. Frontmatter should only sync after user interaction.
            
            console.log(`[SIDECARDS] 🏁 Total loadCards time: ${(performance.now() - loadStartTime).toFixed(2)}ms`);
            this._initialLoadInProgress = false;
            _finishLoad();
            return;
        }

        const saved = this.plugin.settings.cards || [];
        this.plugin.debugLog('🧾 Settings cards count:', saved.length);
        if (saved && saved.length > 0) {
            const seenPaths2 = new Set();
            const savedUnique = saved.filter(sc => {
                const key = (sc.notePath || sc.id || '').toLowerCase();
                if (!key) return true;
                if (seenPaths2.has(key)) return false;
                seenPaths2.add(key);
                return true;
            });
            const cardCreationStart2 = performance.now();
            for (const savedCard of savedUnique) {
                try {
                    const pinnedFromNote = savedCard.pinned || false;
                    const archivedFromNote = savedCard.archived || false;

                    // Only create cards that match the requested archived filter
                    try {
                        if (showArchived && !archivedFromNote) {
                            // When showing archived cards, skip non-archived cards
                            continue;
                        }
                        if (!showArchived && archivedFromNote) {
                            // When showing non-archived cards, skip archived cards
                            continue;
                        }
                    } catch (e) {}

                    const createOpts = {
                        id: savedCard.id,
                        color: savedCard.color,
                        tags: savedCard.tags,
                        category: savedCard.category || null,
                        created: savedCard.created,
                        archived: archivedFromNote,
                        pinned: pinnedFromNote || false,
                        notePath: savedCard.notePath,
                        expiresAt: savedCard.expiresAt || null,
                        status: savedCard.status || null
                    };
                    const createdCard = this.enqueueCardCreate(savedCard.content || '', createOpts);
                    try {
                        if (createdCard && createdCard.archived && !showArchived && createdCard.element) {
                            createdCard.element.style.display = 'none';
                        }
                    } catch (e) {}
                } catch (err) { console.error('Error loading saved card', err); }
            }
            console.log(`[SIDECARDS] ⚡ Card creation (non-folder cached) took ${(performance.now() - cardCreationStart2).toFixed(2)}ms for ${this.cards.length} cards`);
        } else {
            this.plugin.debugLog("⚠️ No existing cards found - checking if sample cards should be created");
            const sampleCards = [
                "Welcome to Card Sidebar! This is your quick note-taking space.",
                "Right-click on cards to change colors, manage categories, or add tags.",
                "Use the input box below to add new cards quickly.",
                "Drag cards to reorder them."
            ];

            this.plugin.debugLog("🎴 Creating sample cards because no cards exist");
            sampleCards.forEach((card, index) => {
                const colorVar = `var(--card-color-${(index % 10) + 1})`;
                this.createCard(card, { color: colorVar });
            });
        }

        // Don't process deferred rendering here - it will be done after sorting in loadCardsPrioritized
        
        // CRITICAL FIX: Ensure manual order is applied consistently
        try {
            if (this.plugin.settings.inheritStatusColor) {
                try {
                    (this.cards || []).forEach(c => {
                        if (c && c.status && c.status.color) {
                            c.color = c.status.color;
                            if (c.element) this.applyCardColorToElement(c.element, c.status.color);
                        }
                    });
                } catch (e) {}
            }
            this.plugin.debugLog('sidecards: calling applySort (loadCards end)', { 
                mode: this.plugin.settings.sortMode || 'manual', 
                ascending: this.plugin.settings.sortAscending != null ? this.plugin.settings.sortAscending : true,
                universalOrder: this._universalCardOrder?.length 
            });
            const sortStart = performance.now();
            await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending != null ? this.plugin.settings.sortAscending : true);
            console.log(`[SIDECARDS] ⚡ applySort took ${(performance.now() - sortStart).toFixed(2)}ms`);
        } catch (e) { 
            console.error('Error in final applySort call:', e);
        }

        this.plugin.debugLog('🏁 Non-folder branch load complete', { finalCount: (this.cards || []).length });
        try { this._applySortLoadInProgress = false; } catch (e) {}
        this._bulkLoading = false;
        try { this.plugin.validateLoadedCounts(this); } catch (e) {}
        
        // PERFORMANCE: Use progressive rendering
        this.refreshAllCardTimestamps();
        try { this.animateCardsEntrance(); } catch (e) {}
        
        const cardsToRender2 = [...(this.cards || [])];
        await this.loadCardsPrioritized(cardsToRender2, showArchived);
        
        // DO NOT sync frontmatter during initial load - this causes saveCards to be called,
        // which triggers the double-render issue. Frontmatter should only sync after user interaction.
        
        console.log(`[SIDECARDS] 🏁 Total loadCards time: ${(performance.now() - loadStartTime).toFixed(2)}ms`);
        this._initialLoadInProgress = false;
        _finishLoad();
    }

    async importNotesFromFolder(folder, silent = false, showArchived = false) {
        this.plugin.debugLog("📁 importNotesFromFolder called", { folder, silent, showArchived });
        if (!folder) return 0;
        try {
            // First, force refresh the vault to ensure newly created files are detected
            try {
                await this.app.vault.adapter.list(folder);
            } catch (e) {
                this.plugin.debugLog("Could not force-refresh folder cache:", e);
            }
            
            const allFiles = this.app.vault.getAllLoadedFiles();
            const prefix = folder.endsWith('/') ? folder : folder + '/';
            let mdFiles = allFiles.filter(f => {
                if (!f.path || !f.path.startsWith(prefix) || !f.path.toLowerCase().endsWith('.md')) {
                    return false;
                }
                
                // Check if this file was recently deleted
                if (this.plugin && this.plugin._recentlyDeletedPaths) {
                    const normalizedPath = f.path.toLowerCase();
                    const baseName = f.path.split('/').pop().toLowerCase();
                    
                    for (const deletedPath of this.plugin._recentlyDeletedPaths) {
                        const deletedBaseName = deletedPath.split('/').pop();
                        if (deletedBaseName.replace(/\s+\d+/g, '') === baseName.replace(/\s+\d+/g, '')) {
                            this.plugin.debugLog("🚫 Skipping import of recently deleted file:", f.path);
                            return false;
                        }
                    }
                }
                
                return true;
            });
            
            // If no files found in cache, try to directly list the folder
            if (mdFiles.length === 0) {
                try {
                    this.plugin.debugLog("📁 No files in cache, attempting direct folder scan:", folder);
                    const folderObj = this.app.vault.getAbstractFileByPath(folder);
                    if (folderObj && folderObj.children) {
                        mdFiles = folderObj.children.filter(f => {
                            if (!f.path || !f.path.toLowerCase().endsWith('.md')) {
                                return false;
                            }
                            // Check deleted paths
                            if (this.plugin && this.plugin._recentlyDeletedPaths) {
                                const baseName = f.path.split('/').pop().toLowerCase();
                                for (const deletedPath of this.plugin._recentlyDeletedPaths) {
                                    const deletedBaseName = deletedPath.split('/').pop();
                                    if (deletedBaseName.replace(/\s+\d+/g, '') === baseName.replace(/\s+\d+/g, '')) {
                                        return false;
                                    }
                                }
                            }
                            return true;
                        });
                        this.plugin.debugLog("📁 Direct scan found files:", mdFiles.map(f => f.path));
                    }
                } catch (e) {
                    this.plugin.debugLog("Direct folder scan failed:", e);
                }
            }
            
            this.plugin.debugLog("📄 Found markdown files in folder:", mdFiles.map(f => f.path));

            

            if (!mdFiles || mdFiles.length === 0) {
                if (!silent) new Notice('No markdown files found in selected folder');
                return 0;
            }

            let imported = 0;
            let considered = 0;
            let archivedCount = 0;
            const createdSerial = [];

            for (const file of mdFiles) {
                try {
                    const path = file.path;
                    if (this.cards.find(c => c.notePath === path)) continue;

                    const text = await this.app.vault.read(file);

                    let fm = null;
                    let body = text;
                    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                    if (m) {
                        fm = m[1];
                        body = text.slice(m[0].length);
                    }

                    const tags = [];
                    
                    let created = new Date().toISOString();
                    let archived = false;
                    let parsedColorVar = null;
                    let pinned = false;
                    let parsedCategoryId = null;

                    if (fm) {
                        const parsedTags = this.parseTagsFromFrontmatter(fm);
                        parsedTags.forEach(t => { if (t) tags.push(t); });
                        
                        const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                        if (createdMatch) created = createdMatch[1].trim();
                        
                        // Better archived detection - handle various spacing
                        const archMatch = fm.match(/^\s*archived\s*:\s*(true|false)\s*$/mi);
                        if (archMatch && archMatch[1].toLowerCase() === 'true') archived = true;
                        try {
                            const eMatch = fm.match(/^\s*Expires-At\s*:\s*(.*)$/mi);
                            if (eMatch) {
                                const v2 = String(eMatch[1]).trim().replace(/^"|"$/g, '');
                                var parsedExpiresAt = v2;
                            }
                            const stMatch = fm.match(/^\s*Status\s*:\s*(.*)$/mi);
                            if (this.plugin.settings.enableCardStatus && stMatch) {
                                const sName = String(stMatch[1]).trim().replace(/^"|"$/g, '');
                                
                                // Always look up colors from settings, never from frontmatter
                                const statusSettings = Array.isArray(this.plugin.settings.cardStatuses) ? this.plugin.settings.cardStatuses : [];
                                const matchedStatus = statusSettings.find(st => String(st.name || '').toLowerCase() === String(sName).toLowerCase());
                                if (matchedStatus) {
                                    var parsedStatus = { name: sName, color: matchedStatus.color || '', textColor: matchedStatus.textColor || '' };
                                } else {
                                    var parsedStatus = { name: sName, color: '', textColor: '' };
                                }
                            }
                        } catch (e) {}
                        
                        try {
                            const catLabelMatch = fm.match(/^\s*Category\s*:\s*(.*)$/mi);
                            if (catLabelMatch && catLabelMatch[1]) {
                                const catVal = String(catLabelMatch[1]).trim().replace(/^"|"$/g, '');
                                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                                const found = cats.find(x => String(x.id || '').toLowerCase() === String(catVal).toLowerCase() || String(x.label || '').toLowerCase() === String(catVal).toLowerCase());
                                parsedCategoryId = found ? (found.label || String(found.id || catVal)) : catVal;
                            }
                        } catch (e) {}
                        if (archived) archivedCount++;
                        try {
                            if (/^\s*pinned\s*:\s*true$/mi.test(fm)) {
                                pinned = true;
                            } else if (/^\s*pinned\s*:\s*false$/mi.test(fm)) {
                                pinned = false;
                            }
                        } catch (e) { }
                        try {
                            const ccMatch = fm.match(/^\s*card-color:\s*(.*)$/mi);
                            if (ccMatch) {
                                const val = ccMatch[1].trim().replace(/^"|"$/g, '');
                                const m2 = String(val).match(/^color-(\d+)$/i);
                                if (m2) {
                                    parsedColorVar = `var(--card-color-${m2[1]})`;
                                } else if (/^#/.test(val)) {
                                    parsedColorVar = val;
                                } else {
                                    const idx = (this.plugin.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(val).toLowerCase());
                                    if (idx >= 0) parsedColorVar = `var(--card-color-${idx+1})`;
                                }
                            }

                            if (!parsedColorVar) {
                                const nameMatch = fm.match(/^\s*card-color-name:\s*(?:"|')?(.*?)(?:"|')?\s*$/mi);
                                if (nameMatch) {
                                    const nameVal = nameMatch[1].trim();
                                    const idx2 = (this.plugin.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(nameVal).toLowerCase());
                                    if (idx2 >= 0) parsedColorVar = `var(--card-color-${idx2+1})`;
                                }
                            }
                        } catch (e) {
                        }
                    }


                    const content = body.trim() || '(empty)';
                    if (archived && !showArchived) {
                    }

                    // Only create cards that match the requested archived filter
                    try {
                        if (showArchived && !archived) {
                            // When showing archived cards, skip non-archived cards
                            continue;
                        }
                        if (!showArchived && archived) {
                            // When showing non-archived cards, skip archived cards
                            continue;
                        }
                    } catch (e) {}

                    const newId = Date.now().toString() + Math.random().toString(36).slice(2, 8);
                    const createOpts = {
                        id: newId,
                        color: parsedColorVar || `var(--card-color-1)`,
                        tags,
                        created,
                        archived,
                        notePath: path,
                        pinned: pinned || false,
                        category: parsedCategoryId || null,
                        expiresAt: typeof parsedExpiresAt !== 'undefined' ? parsedExpiresAt : null,
                        status: typeof parsedStatus !== 'undefined' ? parsedStatus : null
                    };
                    considered++;
                    const cardData = this.enqueueCardCreate(content, createOpts);
                    
                    createdSerial.push({
                        id: createOpts.id,
                        content: content,
                        color: createOpts.color,
                        tags: createOpts.tags || [],
                        category: createOpts.category || null,
                        created: createOpts.created,
                        archived: createOpts.archived || false,
                        pinned: createOpts.pinned || false,
                        notePath: createOpts.notePath || null,
                        expiresAt: createOpts.expiresAt || null,
                        status: createOpts.status || null
                    });

                    imported++;
                } catch (err) {
                    console.error('Error importing file', file.path, err);
                }
            }

            this.plugin.debugLog('📊 Import stats', { considered, imported, finalCount: createdSerial.length });
            if (imported > 0) {
                if (silent) {
                    this.plugin.settings.cards = createdSerial;
                    await this.plugin.saveSettings();
                } else {
                    await this.saveCards();
                    new Notice(`Imported ${imported} cards from ${folder}`);
                }
            } else if (!silent) {
                new Notice('No new markdown files to import');
            }

            return imported;
        } catch (err) {
            console.error('Error importing notes from folder:', err);
            if (!silent) new Notice('Failed to import notes from folder (see console)');
            return 0;
        }
    }

    async saveCards() {
        if (this._initialLoadInProgress) return Promise.resolve();
        // PERFORMANCE: Debounce saves during load to prevent multiple writes
        const isLoading = this._bulkLoading || this._applySortLoadInProgress;
        
        if (isLoading) {
            // During load, debounce saves to prevent thrashing
            if (this._saveDebouncedTimeout) clearTimeout(this._saveDebouncedTimeout);
            
            return new Promise((resolve) => {
                this._saveDebouncedTimeout = setTimeout(async () => {
                    this._saveDebouncedTimeout = null;
                    await this._performSaveCards();
                    resolve();
                }, 800);
            });
        }
        
        // Normal save when not loading: coalesce rapid calls
        if (this._saveNormalTimeout) clearTimeout(this._saveNormalTimeout);
        return new Promise((resolve) => {
            this._saveNormalTimeout = setTimeout(async () => {
                this._saveNormalTimeout = null;
                await this._performSaveCards();
                resolve();
            }, 250);
        });
    }

    async scheduleSaveCards(delay = 250) {
        if (this._initialLoadInProgress) return Promise.resolve();
        if (this._bulkLoading || this._applySortLoadInProgress) return this.saveCards();
        if (this._saveNormalTimeout) clearTimeout(this._saveNormalTimeout);
        return new Promise((resolve) => {
            this._saveNormalTimeout = setTimeout(async () => {
                this._saveNormalTimeout = null;
                await this._performSaveCards();
                resolve();
            }, Math.max(0, Number(delay || 250)));
        });
    }

    async _performSaveCards() {
        try {
            const serial = this.cards.map(c => ({
                id: c.id,
                content: c.content,
                color: c.color,
                tags: c.tags || [],
                category: c.category || null,
                created: c.created,
                archived: c.archived || false,
                pinned: c.pinned || false,
                notePath: c.notePath || null,
                expiresAt: c.expiresAt || null,
                status: c.status || null
            }));

            // Merge with existing cards to preserve cards filtered out of current view
            // Only update cards that are in this.cards, preserve everything else
            const existingCards = this.plugin.settings.cards || [];
            const existingById = new Map(existingCards.map(c => [c.id, c]));
            
            // Remove explicitly deleted cards
            for (const id of this._deletedCardIds) {
                existingById.delete(id);
            }
            this._deletedCardIds.clear();  // Clear after processing
            
            // Update existing cards with current values from this.cards
            // This preserves archived cards when viewing non-archived, and vice versa
            serial.forEach(card => {
                existingById.set(card.id, card);
            });
            
            const mergedCards = Array.from(existingById.values());
            console.log('[SIDECARDS] 💾 saveCards - visible:', serial.length, 'existing:', existingCards.length, 'merged:', mergedCards.length);
            
            this.plugin.settings.cards = mergedCards;
            await this.plugin.saveSettings();
        } catch (err) {
            console.error('Error saving cards:', err);
        }
    }

    async onClose() {
        // Clean up position observer
        try {
            if (this._positionObserver) {
                this._positionObserver.disconnect();
                this._positionObserver = null;
            }
        } catch (e) {}
        
        await this.saveCards();
    }
}

class CardSidebarSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('card-sidebar-settings');

    const updateCardRadius = (radius) => {
        const styleEl = document.createElement('style');
        styleEl.id = 'card-border-radius';
        styleEl.textContent = `
            .card-sidebar-card {
                border-radius: ${radius}px !important;
            }
        `;
        const existing = document.getElementById('card-border-radius');
        if (existing) existing.remove();
        document.head.appendChild(styleEl);
    };

    const updateButtonPadding = (paddingPx) => {
        const styleEl = document.createElement('style');
        styleEl.id = 'card-button-padding';
        styleEl.textContent = `
            .card-sidebar-button-container {
                padding-bottom: ${paddingPx}px !important;
            }
        `;
        const existing = document.getElementById('card-button-padding');
        if (existing) existing.remove();
        document.head.appendChild(styleEl);
    };

    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .card-sidebar-settings .setting-item-name,
        .card-sidebar-settings .setting-item-description {
            text-align: left;
        }
    `;
    document.head.appendChild(styleEl);

    containerEl.createEl('h2', { text: 'Card Sidebar Settings' });

            new Setting(containerEl)
                .setName('Storage folder')
                .setDesc('Choose where to save notes created from cards')
                .addSearch(cb => {
                    cb.setPlaceholder('Choose a folder')
                        .setValue(this.plugin.settings.storageFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.storageFolder = value;
                            
                            
                            try {
                                this.plugin.settings.tutorialShown = true;
                            } catch (e) {}
                            await this.plugin.saveSettings();
                        });

            const folders = new Set(['/']);
            this.app.vault.getAllLoadedFiles().forEach(file => {
                if (file.parent) {
                    folders.add(file.parent.path);
                }
            });

            
            let folderSuggest;
            try {
                if (window && window.FolderSuggest) {
                    folderSuggest = new window.FolderSuggest(this.app, cb.inputEl);
                } else {
                    folderSuggest = new FolderSuggest(this.app, cb.inputEl, folders);
                }
            } catch (e) {
                
                try { folderSuggest = new FolderSuggest(this.app, cb.inputEl, folders); } catch (err) { console.error('Failed to create FolderSuggest:', err); }
            }

            (() => {
                let wasMouseDown = false;

                try {
                    cb.inputEl.addEventListener('mousedown', () => { wasMouseDown = true; });

                    cb.inputEl.addEventListener('focus', (e) => {
                        if (!wasMouseDown) {
                            setTimeout(() => { try { cb.inputEl.blur(); } catch (err) {} }, 0);
                        }
                        wasMouseDown = false;
                    }, true);

                    cb.inputEl.addEventListener('blur', async () => {
                        try {
                            if (!this || !this.plugin) {
                                console.error('Storage folder blur: this or this.plugin is undefined');
                                return;
                            }
                            const value = cb.inputEl.value || '';
                            if (!value) return;
                            if (this.plugin._storageFolderLastApplied === value) return;
                            this.plugin._storageFolderLastApplied = value;
                            try {
                                const modals = Array.from(document.querySelectorAll('.modal'));
                                modals.forEach(m => {
                                    try {
                                        if (m && m.textContent && m.textContent.includes('Welcome to SideCards')) {
                                            m.remove();
                                        }
                                    } catch (e) {}
                                });
                            } catch (e) {}

                            const leaf = this.app.workspace.getLeavesOfType('card-sidebar')[0];
                            const view = leaf?.view;
                            if (view && typeof view.importNotesFromFolder === 'function') {
                                try {
                                    await view.importNotesFromFolder(value, true);
                                } catch (e) {
                                    console.error('Error importing notes from selected storage folder:', e);
                                }
                            } else {
                                await new Promise(r => setTimeout(r, 300));
                                const leaf2 = this.app.workspace.getLeavesOfType('card-sidebar')[0];
                                const view2 = leaf2?.view;
                                if (view2 && typeof view2.importNotesFromFolder === 'function') {
                                    try {
                                        await view2.importNotesFromFolder(value, true);
                                    } catch (e) {
                                        console.error('Error importing notes from selected storage folder:', e);
                                    }
                                }
                            }
                            new Notice('Storage folder set');
                        } catch (err) { console.error('Error applying storage folder on blur:', err); }
                    });
                } catch (e) {
                    console.error('Error setting folder input focus handlers:', e);
                }
            })();
        });

    containerEl.createEl('h3', { text: 'Colors' });
    const colorsDesc = containerEl.createEl('p', { text: 'The name writes into the note when card-color frontmatter is absent (uses card-color-name fallback).' });
    colorsDesc.style.margin = '6px 0 12px';
    colorsDesc.style.color = 'var(--text-muted)';
    
    const colorVars = [
        { name: 'Color 1', key: 'color1', default: '#8392a4' },
        { name: 'Color 2', key: 'color2', default: '#eb3b5a' },
        { name: 'Color 3', key: 'color3', default: '#fa8231' },
        { name: 'Color 4', key: 'color4', default: '#e5a216' },
        { name: 'Color 5', key: 'color5', default: '#20bf6b' },
        { name: 'Color 6', key: 'color6', default: '#2d98da' },
        { name: 'Color 7', key: 'color7', default: '#8854d0' },
        { name: 'Color 8', key: 'color8', default: '#e832c1' },
        { name: 'Color 9', key: 'color9', default: '#e83289' },
        { name: 'Color 10', key: 'color10', default: '#965b3b' }
    ];

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
            .setValue(this.plugin.settings[color.key] || color.default)
            .onChange(async (value) => {
                this.plugin.settings[color.key] = value;
                await this.plugin.saveSettings();
                this.updateCSSVariables();
            }));
    });

    new Setting(containerEl)
        .setName('Two-row color swatches in menu')
        .setDesc('When enabled, the color picker shown in the card context menu will use two rows (5 swatches per row) to save horizontal space.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.twoRowSwatches || false)
            .onChange(async (value) => {
                this.plugin.settings.twoRowSwatches = value;
                await this.plugin.saveSettings();
            }));

    containerEl.createEl('h3', { text: 'Appearance' });
    containerEl.createEl('h4', { text: 'Card Styling' });

    const styleOptions = {
        '1': 'Style 1 (Full border)',
        '2': 'Style 2 (Full border + Shadow)',
        '3': 'Style 3 (left accent)'
    };

    const styleSetting = new Setting(containerEl)
        .setName('Card Style')
        .setDesc('Choose the visual style applied to cards')
        .addDropdown(drop => {
            Object.entries(styleOptions).forEach(([k, v]) => drop.addOption(k, v));
            drop.setValue(String(this.plugin.settings.cardStyle || 2));
            drop.onChange(async (val) => {
                this.plugin.settings.cardStyle = Number(val);
                await this.plugin.saveSettings();
                this.updateCSSVariables();

                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && view.cards) {
                    view.cards.forEach(c => view.applyCardColor(c, c.element));
                }
                opacityContainer.style.display = (String(this.plugin.settings.cardStyle) === '1' || String(this.plugin.settings.cardStyle) === '2' || String(this.plugin.settings.cardStyle) === '3') ? '' : 'none';
                if (typeof borderThicknessContainer !== 'undefined' && borderThicknessContainer) {
                    borderThicknessContainer.style.display = (String(this.plugin.settings.cardStyle) === '1' || String(this.plugin.settings.cardStyle) === '2') ? '' : 'none';
                }
            });
        });

    const opacityContainer = containerEl.createDiv();
    opacityContainer.style.marginTop = '8px';
    opacityContainer.style.display = (String(this.plugin.settings.cardStyle || 2) === '1' || String(this.plugin.settings.cardStyle || 2) === '2' || String(this.plugin.settings.cardStyle || 2) === '3') ? '' : 'none';

    new Setting(opacityContainer)
        .setName('Background Opacity')
        .setDesc('When using a style with a tinted background (Style 1 or 3), how opaque should the tint be (0 = transparent)')
        .addSlider(slider => slider
            .setLimits(0, 1.0, 0.01)
            .setValue(this.plugin.settings.cardBgOpacity != null ? this.plugin.settings.cardBgOpacity : 0.08)
            .setDynamicTooltip()
            .onChange(async (value) => {
                this.plugin.settings.cardBgOpacity = Number(value);
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && view.cards) {
                    view.cards.forEach(c => view.applyCardColor(c, c.element));
                }
            }));

    const borderThicknessContainer = containerEl.createDiv();
    borderThicknessContainer.style.marginTop = '8px';
    borderThicknessContainer.style.display = (String(this.plugin.settings.cardStyle || 2) === '1' || String(this.plugin.settings.cardStyle || 2) === '2') ? '' : 'none';

    new Setting(borderThicknessContainer)
        .setName('Border thickness')
        .setDesc('Thickness of the card border in pixels (applies to Style 1 and Style 2)')
        .addSlider(slider => slider
            .setLimits(0, 8, 1)
            .setValue(this.plugin.settings.borderThickness != null ? this.plugin.settings.borderThickness : 2)
            .setDynamicTooltip()
            .onChange(async (value) => {
                this.plugin.settings.borderThickness = Number(value);
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && view.cards) {
                    view.cards.forEach(c => view.applyCardColor(c, c.element));
                }
            }));

    new Setting(containerEl)
        .setName('Card Border Radius')
        .setDesc('Adjust the roundness of card corners')
        .addSlider(slider => slider
            .setLimits(0, 16, 1)
            .setValue(this.plugin.settings.borderRadius || 6)
            .setDynamicTooltip()
            .onChange(async (value) => {
                this.plugin.settings.borderRadius = value;
                await this.plugin.saveSettings();
                updateCardRadius(value);
            }));

            
    containerEl.createEl('h4', { text: 'Animation' });
    new Setting(containerEl)
        .setName('Animated Cards')
                .setDesc('When enabled, cards will slide/fade in when switching categories or on load.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.animatedCards || false)
                    .onChange(async (value) => {
                        this.plugin.settings.animatedCards = value;
                        await this.plugin.saveSettings();
                        try {
                            const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                            if (view && value) {
                                
                                try { view.animateCardsEntrance(); } catch (e) {}
                            }
                        } catch (e) { }
                    }));

                
                new Setting(containerEl)
                    .setName('Disable card fade in')
                    .setDesc('Experimental: When enabled, cards will not perform an opacity fade on load or category switch. Slide animations are unaffected.')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.disableCardFadeIn != null ? this.plugin.settings.disableCardFadeIn : true)
                        .onChange(async (value) => {
                            this.plugin.settings.disableCardFadeIn = value;
                            await this.plugin.saveSettings();
                        }));

    containerEl.createEl('h4', { text: 'Visibility' });
    new Setting(containerEl)
        .setName('Disable card markdown rendering')
        .setDesc('When enabled, cards display raw text and never switch to rendered markdown on blur. Links, images, and formatting won’t render in the sidebar.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.disableCardRendering || false)
            .onChange(async (value) => {
                this.plugin.settings.disableCardRendering = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && view.cards) {
                    view.cards.forEach(cd => {
                        const el = cd.element?.querySelector('.card-content');
                        if (!el) return;
                        if (value) {
                            el.setAttribute('contenteditable', 'true');
                            el.innerHTML = '';
                            el.textContent = cd.content || '';
                        } else {
                            el.setAttribute('contenteditable', 'false');
                            el.innerHTML = '';
                            MarkdownRenderer.render(this.app, String(cd.content || ''), el, cd.notePath || '');
                        }
                    });
                }
            }));
    new Setting(containerEl)
        .setName('Hide Clear button')
        .setDesc('Hide the Clear button in the input area (hidden by default)')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideClearButton != null ? this.plugin.settings.hideClearButton : true)
            .onChange(async (value) => {
                this.plugin.settings.hideClearButton = value;
                await this.plugin.saveSettings();
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view && view._clearButton) view._clearButton.style.display = value ? 'none' : '';
                } catch (e) { }
            }));

    new Setting(containerEl)
        .setName('Enable copy card content')
        .setDesc('Show a copy icon on hover to copy card content (frontmatter excluded). Disabled by default.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableCopyCardContent || false)
            .onChange(async (value) => {
                this.plugin.settings.enableCopyCardContent = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Hide card container scrollbar')
        .setDesc('Hide the scrollbar for the card list container (only visual; scrolling still works)')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideScrollbar != null ? this.plugin.settings.hideScrollbar : false)
            .onChange(async (value) => {
                this.plugin.settings.hideScrollbar = value;
                await this.plugin.saveSettings();
                try { if (this.plugin && typeof this.plugin.applyGlobalStyles === 'function') this.plugin.applyGlobalStyles(); } catch (e) { }
                try { const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view; if (view && typeof view.updateCSSVariables === 'function') view.updateCSSVariables(); } catch (e) { }
            }));
            
    new Setting(containerEl)
        .setName('Hide Filters Topbar')
        .setDesc('When enabled, the topbar containing filter buttons are hidden.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.disableFilterButtons || false)
            .onChange(async (value) => {
                this.plugin.settings.disableFilterButtons = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view) {
                    try {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    } catch (e) { console.error('Error refreshing header after disableFilterButtons change', e); }
                }
            }));

    this.updateCSSVariables();
            updateCardRadius(this.plugin.settings.borderRadius || 6);
            updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 26);

    containerEl.createEl('h4', { text: 'Layout' });
    new Setting(containerEl)
        .setName('Maximum Card Height')
                .setDesc('Limit card height in pixels; set to 0 to disable')
                .addSlider(slider => slider
                    .setLimits(0, 800, 10)
                    .setValue(this.plugin.settings.maxCardHeight || 0)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxCardHeight = Number(value) || 0;
                        await this.plugin.saveSettings();
                        try { const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view; if (view && typeof view.updateCSSVariables === 'function') view.updateCSSVariables(); } catch (e) {}
                    }));

    
    try {
            new Setting(containerEl)
                .setName('Bottom Space under Input/Button Row')
            .setDesc('Adjust bottom padding under the input/button row to make room for the Statusbar.')
            .addSlider(slider => slider
                .setLimits(0, 100, 1)
                .setValue(this.plugin.settings.buttonPaddingBottom || 26)
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.buttonPaddingBottom = Number(value) || 0;
                        await this.plugin.saveSettings();
                        updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 0);
                    } catch (e) { console.error('Error saving buttonPaddingBottom', e); }
                }));
    } catch (e) { }

    new Setting(containerEl)
        .setName('Group tags under content')
        .setDesc('When enabled, tags will be grouped below the card content. When disabled, tags remain inline.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.groupTags)
            .onChange(async (value) => {
                this.plugin.settings.groupTags = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && typeof view.refreshAllCardTags === 'function') {
                    view.refreshAllCardTags();
                }
            }));

    new Setting(containerEl)
        .setName('Omit # prefix for tags')
        .setDesc('When enabled, tags will be displayed without the leading #')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.omitTagHash != null ? this.plugin.settings.omitTagHash : true)
            .onChange(async (value) => {
                this.plugin.settings.omitTagHash = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && typeof view.refreshAllCardTags === 'function') {
                    view.refreshAllCardTags();
                }
            }));

    const previewEl = document.createElement('span');
    previewEl.style.display = 'inline-block';
    previewEl.style.marginLeft = '6px';
    previewEl.style.color = 'var(--interactive-accent)';
    previewEl.style.fontWeight = '700';
    previewEl.style.fontSize = '14px';
    previewEl.className = 'card-ts-preview-inline';

    const updatePreview = (fmt) => {
        fmt = (fmt && String(fmt).trim()) || this.plugin.settings.datetimeFormat || 'YYYY-MM-DD HH:mm';
        try {
            if (window.moment) {
                previewEl.textContent = window.moment().format(fmt);
                return;
            }

            const d = new Date();
            if (isNaN(d)) { previewEl.textContent = ''; return; }
            const pad = (n) => String(n).padStart(2, '0');
            const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
            const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(d);

            let out = fmt
                .replace(/YYYY/g, d.getFullYear())
                .replace(/YY/g, String(d.getFullYear()).slice(-2))
                .replace(/MMMM/g, monthLong)
                .replace(/MMM/g, monthShort)
                .replace(/MM/g, pad(d.getMonth() + 1))
                .replace(/DD/g, pad(d.getDate()))
                .replace(/HH/g, pad(d.getHours()))
                .replace(/hh/g, pad((d.getHours() % 12) || 12))
                .replace(/mm/g, pad(d.getMinutes()))
                .replace(/ss/g, pad(d.getSeconds()))
                .replace(/A/g, d.getHours() < 12 ? 'AM' : 'PM')
                .replace(/a/g, d.getHours() < 12 ? 'am' : 'pm');

            previewEl.textContent = out;
        } catch (e) {
            previewEl.textContent = '';
        }
    };

    const showTsSetting = new Setting(containerEl)
        .setName('Show Timestamps')
        .setDesc('Show creation timestamps on cards')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showTimestamps)
            .onChange(async (value) => {
                this.plugin.settings.showTimestamps = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view && typeof view.refreshAllCardTimestamps === 'function') {
                    view.refreshAllCardTimestamps();
                }
            }));

    const timeSetting = new Setting(containerEl)
        .setName('Timestamp Date & Time format')
        .setDesc('Your current timestamp looks like this:')
        .addText(text => {
            text.setPlaceholder('YYYY-MM-DD HH:mm')
                .setValue(this.plugin.settings.datetimeFormat || 'YYYY-MM-DD HH:mm')
                .onChange(async (value) => {
                    this.plugin.settings.datetimeFormat = value;
                    await this.plugin.saveSettings();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view && typeof view.refreshAllCardTimestamps === 'function') {
                        view.refreshAllCardTimestamps();
                    }
                    updatePreview(value);
                });

            try {
                const inputEl = text.inputEl;
                if (inputEl) {
                    inputEl.addEventListener('input', (e) => {
                        const v = e.target.value;
                        updatePreview(v);
                    });
                }
            } catch (e) {
            }

            return text;
        });

    new Setting(containerEl)
        .setName('Bring Timestamp below tags')
        .setDesc('When enabled, the timestamp will be rendered below grouped tags (tags remain directly under content).')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.timestampBelowTags || false)
            .onChange(async (value) => {
                this.plugin.settings.timestampBelowTags = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view) {
                    if (typeof view.refreshAllCardTags === 'function') view.refreshAllCardTags();
                    if (typeof view.refreshAllCardTimestamps === 'function') view.refreshAllCardTimestamps();
                }
            }));


    
    containerEl.createEl('h3', { text: 'Filters' });

    new Setting(containerEl)
        .setName('Enable custom filters')
        .setDesc('When enabled, custom filter buttons appear in the card right-click menu')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableCustomCategories || false)
            .onChange(async (value) => {
                this.plugin.settings.enableCustomCategories = value;
                await this.plugin.saveSettings();
                
                // Immediately refresh any open sidecards header so filter buttons update
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                        try { if (typeof view.applyFilters === 'function') view.applyFilters(); } catch (e) {}
                    }
                } catch (e) {}
            }));

    new Setting(containerEl)
        .setName('Disable Time-based Filtering')
        .setDesc('Hides the default Today / Tomorrow / This Week filters')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.disableTimeBasedFiltering || false)
            .onChange(async (value) => {
                this.plugin.settings.disableTimeBasedFiltering = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view) {
                    try {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    } catch (e) { console.error('Error refreshing header after disableTimeBasedFiltering change', e); }
                }
            }));

    new Setting(containerEl)
        .setName('Hide time-based add buttons in right-click menu')
        .setDesc('When enabled, the Today / Tomorrow / This Week items are hidden from the card context menu')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideTimeBasedAddButtonsInContextMenu || false)
            .onChange(async (value) => {
                this.plugin.settings.hideTimeBasedAddButtonsInContextMenu = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Hide Archived filter button')
        .setDesc('When enabled, the Archived filter button will be omitted from the header filters.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideArchivedFilterButton || false)
            .onChange(async (value) => {
                this.plugin.settings.hideArchivedFilterButton = value;
                await this.plugin.saveSettings();
                const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                if (view) {
                    try {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    } catch (e) { console.error('Error refreshing header after hideArchivedFilterButton change', e); }
                }
            }));

    const catsContainer = containerEl.createDiv();
    catsContainer.style.marginTop = '8px';

    const renderCategories = () => {
        catsContainer.empty();
        const list = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
        
        const getDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll('.category-row:not(.dragging)')];
            let closest = null;
            let closestOffset = Number.NEGATIVE_INFINITY;
            draggableElements.forEach(child => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closestOffset) {
                    closestOffset = offset;
                    closest = child;
                }
            });
            return closest;
        };

        const filterMap = {
            'filter-all': { id: 'all', label: 'All', value: 'all' },
            'filter-today': { id: 'today', label: 'Today', value: 'today' },
            'filter-tomorrow': { id: 'tomorrow', label: 'Tomorrow', value: 'tomorrow' },
            'filter-archived': { id: 'archived', label: 'Archived', value: 'archived' }
        };

        const defaultCombined = ['filter-all', 'filter-today', 'filter-tomorrow', 'filter-archived']
            .concat(list.map(c => String(c.id || '')));

        const combinedOrder = Array.isArray(this.plugin.settings.allItemsOrder) && this.plugin.settings.allItemsOrder.length > 0
            ? this.plugin.settings.allItemsOrder
            : defaultCombined;

        const renderAllRow = () => {
            const row = catsContainer.createDiv();
            row.addClass('category-row');
            row.dataset.catId = 'filter-all';
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.margin = '6px 0';

            const handle = row.createEl('button');
            handle.type = 'button';
            handle.className = 'category-drag-handle';
            handle.title = 'Drag to reorder';
            try { setIcon(handle, 'menu'); } catch (e) { handle.textContent = '☰'; }
            handle.style.cursor = 'grab';
            handle.style.border = 'none';
            handle.style.background = 'transparent';
            handle.style.fontSize = '14px';
            handle.style.padding = '4px';
            handle.style.marginRight = '0px';
            handle.style.display = 'inline-flex';
            handle.style.color = 'var(--text-muted)';
            handle.draggable = true;

            handle.addEventListener('dragstart', (e) => {
                try { row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.catId || ''); } catch (err) {}
            });
            handle.addEventListener('dragend', async () => {
                try {
                    row.classList.remove('dragging');
                    const orderedIds = Array.from(catsContainer.querySelectorAll('.category-row')).map(r => r.dataset.catId).filter(Boolean);
                    this.plugin.settings.allItemsOrder = orderedIds;
                    await this.plugin.saveSettings();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        try { const main = view.containerEl.querySelector('.card-sidebar-main'); const old = main?.querySelector('.card-sidebar-header'); if (old) old.remove(); if (main) view.createHeader(main); } catch (e) { }
                    }
                } catch (err) { console.error('Error finalizing category reorder:', err); }
            });

            const textColor = row.createEl('input');
            textColor.type = 'color';
            textColor.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors.all && this.plugin.settings.filterColors.all.textColor) || '#c0c3c7';
            textColor.title = 'Text Color';
            textColor.style.width = '24px'; textColor.style.height = '24px'; textColor.style.cursor = 'pointer';
            textColor.addEventListener('change', async (e) => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                if (!this.plugin.settings.filterColors.all) this.plugin.settings.filterColors.all = {};
                this.plugin.settings.filterColors.all.textColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const bgColor = row.createEl('input');
            bgColor.type = 'color';
            bgColor.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors.all && this.plugin.settings.filterColors.all.bgColor) || '#1a1a1a';
            bgColor.title = 'Background Color';
            bgColor.style.width = '24px'; bgColor.style.height = '24px'; bgColor.style.cursor = 'pointer';
            bgColor.addEventListener('change', async (e) => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                if (!this.plugin.settings.filterColors.all) this.plugin.settings.filterColors.all = {};
                this.plugin.settings.filterColors.all.bgColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const resetBtn = row.createEl('button');
            resetBtn.textContent = 'Reset';
            resetBtn.title = 'Reset this filter button colors';
            resetBtn.style.width = '50px';
            resetBtn.addEventListener('click', async () => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                delete this.plugin.settings.filterColors.all;
                await this.plugin.saveSettings();
                renderCategories();
                // Refresh sidebar to show reset colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const txt = row.createEl('input');
            txt.type = 'text';
            txt.value = 'All';
            txt.style.flex = '1';
            txt.disabled = true;
            txt.style.cursor = 'not-allowed';

            row.appendChild(handle); row.appendChild(textColor); row.appendChild(bgColor); row.appendChild(resetBtn); row.appendChild(txt);
        };

        const renderTimeRow = (id, label) => {
            if (this.plugin.settings.disableTimeBasedFiltering) return;
            const row = catsContainer.createDiv();
            row.addClass('category-row');
            row.dataset.catId = `filter-${id}`;
            row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '6px 0';

            const handle = row.createEl('button');
            handle.type = 'button'; handle.className = 'category-drag-handle'; handle.title = 'Drag to reorder';
            try { setIcon(handle, 'menu'); } catch (e) { handle.textContent = '☰'; }
            handle.style.cursor = 'grab'; handle.style.border = 'none'; handle.style.background = 'transparent'; handle.style.fontSize = '14px'; handle.style.padding = '4px'; handle.style.marginRight = '0px'; handle.style.display = 'inline-flex'; handle.style.color = 'var(--text-muted)'; handle.draggable = true;
            handle.addEventListener('dragstart', (e) => { try { row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.catId || ''); } catch (err) {} });
            handle.addEventListener('dragend', async () => {
                try {
                    row.classList.remove('dragging');
                    const orderedIds = Array.from(catsContainer.querySelectorAll('.category-row')).map(r => r.dataset.catId).filter(Boolean);
                    this.plugin.settings.allItemsOrder = orderedIds; await this.plugin.saveSettings();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) { try { const main = view.containerEl.querySelector('.card-sidebar-main'); const old = main?.querySelector('.card-sidebar-header'); if (old) old.remove(); if (main) view.createHeader(main); } catch (e) { } }
                } catch (err) { console.error('Error finalizing category reorder:', err); }
            });

            const textColorPicker = row.createEl('input'); textColorPicker.type = 'color'; textColorPicker.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors[id] && this.plugin.settings.filterColors[id].textColor) || '#ffffff'; textColorPicker.title = 'Text Color'; textColorPicker.style.width = '24px'; textColorPicker.style.height = '24px'; textColorPicker.style.cursor = 'pointer';
            textColorPicker.addEventListener('change', async (e) => { 
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {}; 
                if (!this.plugin.settings.filterColors[id]) this.plugin.settings.filterColors[id] = {}; 
                this.plugin.settings.filterColors[id].textColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const bgColorPicker = row.createEl('input'); bgColorPicker.type = 'color'; bgColorPicker.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors[id] && this.plugin.settings.filterColors[id].bgColor) || '#4a5568'; bgColorPicker.title = 'Background Color'; bgColorPicker.style.width = '24px'; bgColorPicker.style.height = '24px'; bgColorPicker.style.cursor = 'pointer';
            bgColorPicker.addEventListener('change', async (e) => { 
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {}; 
                if (!this.plugin.settings.filterColors[id]) this.plugin.settings.filterColors[id] = {}; 
                this.plugin.settings.filterColors[id].bgColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const resetBtn = row.createEl('button');
            resetBtn.textContent = 'Reset';
            resetBtn.title = 'Reset this filter button colors';
            resetBtn.style.width = '50px';
            resetBtn.addEventListener('click', async () => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                delete this.plugin.settings.filterColors[id];
                await this.plugin.saveSettings();
                renderCategories();
                // Refresh sidebar to show reset colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const txt = row.createEl('input'); txt.type = 'text'; txt.value = label || ''; txt.style.flex = '1'; txt.disabled = true; txt.style.cursor = 'not-allowed';

            row.appendChild(handle); row.appendChild(textColorPicker); row.appendChild(bgColorPicker); row.appendChild(resetBtn); row.appendChild(txt);
        };

        const renderArchivedRow = () => {
            const row = catsContainer.createDiv();
            row.addClass('category-row');
            row.dataset.catId = 'filter-archived';
            row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '6px 0';

            const handle = row.createEl('button');
            handle.type = 'button'; handle.className = 'category-drag-handle'; handle.title = 'Drag to reorder';
            try { setIcon(handle, 'menu'); } catch (e) { handle.textContent = '☰'; }
            handle.style.cursor = 'grab'; handle.style.border = 'none'; handle.style.background = 'transparent'; handle.style.fontSize = '14px'; handle.style.padding = '4px'; handle.style.marginRight = '0px'; handle.style.display = 'inline-flex'; handle.style.color = 'var(--text-muted)'; handle.draggable = true;
            handle.addEventListener('dragstart', (e) => { try { row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.catId || ''); } catch (err) {} });
            handle.addEventListener('dragend', async () => {
                try {
                    row.classList.remove('dragging');
                    const orderedIds = Array.from(catsContainer.querySelectorAll('.category-row')).map(r => r.dataset.catId).filter(Boolean);
                    this.plugin.settings.allItemsOrder = orderedIds; await this.plugin.saveSettings();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) { try { const main = view.containerEl.querySelector('.card-sidebar-main'); const old = main?.querySelector('.card-sidebar-header'); if (old) old.remove(); if (main) view.createHeader(main); } catch (e) { } }
                } catch (err) { console.error('Error finalizing category reorder:', err); }
            });

            const textColorPicker = row.createEl('input'); textColorPicker.type = 'color'; textColorPicker.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors.archived && this.plugin.settings.filterColors.archived.textColor) || '#ffffff'; textColorPicker.title = 'Text Color'; textColorPicker.style.width = '24px'; textColorPicker.style.height = '24px'; textColorPicker.style.cursor = 'pointer';
            textColorPicker.addEventListener('change', async (e) => { 
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {}; 
                if (!this.plugin.settings.filterColors.archived) this.plugin.settings.filterColors.archived = {}; 
                this.plugin.settings.filterColors.archived.textColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const bgColorPicker = row.createEl('input'); bgColorPicker.type = 'color'; bgColorPicker.value = (this.plugin.settings.filterColors && this.plugin.settings.filterColors.archived && this.plugin.settings.filterColors.archived.bgColor) || '#4a5568'; bgColorPicker.title = 'Background Color'; bgColorPicker.style.width = '24px'; bgColorPicker.style.height = '24px'; bgColorPicker.style.cursor = 'pointer';
            bgColorPicker.addEventListener('change', async (e) => { 
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {}; 
                if (!this.plugin.settings.filterColors.archived) this.plugin.settings.filterColors.archived = {}; 
                this.plugin.settings.filterColors.archived.bgColor = e.target.value; 
                await this.plugin.saveSettings();
                // Refresh sidebar to show new colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const resetBtn = row.createEl('button');
            resetBtn.textContent = 'Reset';
            resetBtn.title = 'Reset this filter button colors';
            resetBtn.style.width = '50px';
            resetBtn.addEventListener('click', async () => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                delete this.plugin.settings.filterColors.archived;
                await this.plugin.saveSettings();
                renderCategories();
                // Refresh sidebar to show reset colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const txt = row.createEl('input'); txt.type = 'text'; txt.value = 'Archived'; txt.style.flex = '1'; txt.disabled = true; txt.style.cursor = 'not-allowed';

            row.appendChild(handle); row.appendChild(textColorPicker); row.appendChild(bgColorPicker); row.appendChild(resetBtn); row.appendChild(txt);
        };

        const renderCustomRow = (cat) => {
            const idx = list.findIndex(x => String(x.id || '') === String(cat.id || ''));
            const row = catsContainer.createDiv(); row.addClass('category-row');
            try { row.dataset.catId = cat.id || String(idx); } catch (e) {}
            row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '6px 0';

            const handle = row.createEl('button'); handle.type = 'button'; handle.className = 'category-drag-handle'; handle.title = 'Drag to reorder';
            try { setIcon(handle, 'menu'); } catch (e) { handle.textContent = '☰'; }
            handle.style.cursor = 'grab'; handle.style.border = 'none'; handle.style.background = 'transparent'; handle.style.fontSize = '14px'; handle.style.padding = '4px'; handle.style.marginRight = '0px'; handle.style.display = 'inline-flex'; handle.draggable = true; handle.color = 'var(--text-muted)';
            handle.addEventListener('dragstart', (e) => { try { row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.catId || ''); } catch (err) {} });
            handle.addEventListener('dragend', async () => {
                try {
                    row.classList.remove('dragging');
                    const orderedIds = Array.from(catsContainer.querySelectorAll('.category-row')).map(r => r.dataset.catId).filter(Boolean);
                    this.plugin.settings.allItemsOrder = orderedIds; await this.plugin.saveSettings();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) { try { const main = view.containerEl.querySelector('.card-sidebar-main'); const old = main?.querySelector('.card-sidebar-header'); if (old) old.remove(); if (main) view.createHeader(main); } catch (e) { } }
                } catch (err) { console.error('Error finalizing category reorder:', err); }
            });

            const textColorPicker = row.createEl('input'); textColorPicker.type = 'color'; textColorPicker.value = cat.textColor || '#ffffff'; textColorPicker.title = 'Text Color'; textColorPicker.style.width = '24px'; textColorPicker.style.height = '24px'; textColorPicker.style.cursor = 'pointer';
            textColorPicker.addEventListener('change', async (e) => { 
                const i = list.findIndex(x => String(x.id || '') === String(cat.id || '')); 
                if (i >= 0) { 
                    this.plugin.settings.customCategories[i].textColor = e.target.value;
                    // Also update filterColors for consistency
                    if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                    if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
                    this.plugin.settings.filterColors[cat.id].textColor = e.target.value;
                    await this.plugin.saveSettings(); 
                    try { renderCategories(); } catch (ee) {} 
                    // Refresh sidebar to show new colors
                    try {
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view) {
                            const main = view.containerEl.querySelector('.card-sidebar-main');
                            const old = main?.querySelector('.card-sidebar-header');
                            if (old) old.remove();
                            if (main) view.createHeader(main);
                        }
                    } catch (e) {}
                } 
            });

            const bgColorPicker = row.createEl('input'); bgColorPicker.type = 'color'; bgColorPicker.value = cat.bgColor || '#4a5568'; bgColorPicker.title = 'Background Color'; bgColorPicker.style.width = '24px'; bgColorPicker.style.height = '24px'; bgColorPicker.style.cursor = 'pointer';
            bgColorPicker.addEventListener('change', async (e) => { 
                const i = list.findIndex(x => String(x.id || '') === String(cat.id || '')); 
                if (i >= 0) { 
                    this.plugin.settings.customCategories[i].bgColor = e.target.value;
                    // Also update filterColors for consistency
                    if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                    if (!this.plugin.settings.filterColors[cat.id]) this.plugin.settings.filterColors[cat.id] = {};
                    this.plugin.settings.filterColors[cat.id].bgColor = e.target.value;
                    await this.plugin.saveSettings(); 
                    try { renderCategories(); } catch (ee) {} 
                    // Refresh sidebar to show new colors
                    try {
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view) {
                            const main = view.containerEl.querySelector('.card-sidebar-main');
                            const old = main?.querySelector('.card-sidebar-header');
                            if (old) old.remove();
                            if (main) view.createHeader(main);
                        }
                    } catch (e) {}
                } 
            });

            const resetBtn = row.createEl('button');
            resetBtn.textContent = 'Reset';
            resetBtn.title = 'Reset this filter button colors';
            resetBtn.style.width = '50px';
            resetBtn.addEventListener('click', async () => {
                if (!this.plugin.settings.filterColors) this.plugin.settings.filterColors = {};
                delete this.plugin.settings.filterColors[cat.id];
                await this.plugin.saveSettings();
                renderCategories();
                // Refresh sidebar to show reset colors
                try {
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                } catch (e) {}
            });

            const txt = row.createEl('input'); txt.type = 'text'; txt.value = cat.label || ''; txt.style.flex = '1';
            txt.addEventListener('change', async (e) => { const i = list.findIndex(x => String(x.id || '') === String(cat.id || '')); if (i >= 0) { this.plugin.settings.customCategories[i].label = e.target.value || ''; await this.plugin.saveSettings(); try { renderCategories(); } catch (ee) {} } });

            const del = row.createEl('button'); del.textContent = 'Remove'; del.addClass('mod-warning');
            del.addEventListener('click', async () => { const i = list.findIndex(x => String(x.id || '') === String(cat.id || '')); if (i >= 0) { this.plugin.settings.customCategories.splice(i, 1); await this.plugin.saveSettings(); renderCategories(); } });

            row.appendChild(handle); row.appendChild(textColorPicker); row.appendChild(bgColorPicker); row.appendChild(resetBtn); row.appendChild(txt); row.appendChild(del);
        };

        combinedOrder.forEach(itemId => {
            if (!itemId) return;
            if (itemId === 'filter-all') { renderAllRow(); return; }
            if (itemId === 'filter-today') { renderTimeRow('today', 'Today'); return; }
            if (itemId === 'filter-tomorrow') { renderTimeRow('tomorrow', 'Tomorrow'); return; }
            if (itemId === 'filter-archived') { renderArchivedRow(); return; }
            const cat = list.find(c => String(c.id || '') === String(itemId));
            if (cat) renderCustomRow(cat);
        });

        // Append any missing items not present in combined order
        const seen = new Set(combinedOrder);
        if (!seen.has('filter-all')) renderAllRow();
        if (!seen.has('filter-today')) renderTimeRow('today', 'Today');
        if (!seen.has('filter-tomorrow')) renderTimeRow('tomorrow', 'Tomorrow');
        if (!seen.has('filter-archived')) renderArchivedRow();
        list.forEach(cat => { if (!seen.has(String(cat.id || ''))) renderCustomRow(cat); });

        
    catsContainer.addEventListener('dragover', (e) => {
        try {
            e.preventDefault();
            const afterElement = getDragAfterElement(catsContainer, e.clientY);
            const dragging = catsContainer.querySelector('.dragging');
            if (!dragging) return;
            if (afterElement == null) {
                catsContainer.appendChild(dragging);
            } else {
                catsContainer.insertBefore(dragging, afterElement);
            }
            
            // Debug logging
            this.plugin.debugLog("🔄 Dragover - current order:", 
                Array.from(catsContainer.querySelectorAll('.category-row'))
                    .map(r => r.dataset.catId)
                    .filter(Boolean)
            );
        } catch (err) {
            console.error('Error in dragover:', err);
        }
    });

    const addRow = catsContainer.createDiv();
    addRow.className = 'categories-add-row';
    addRow.style.display = 'flex';
        addRow.style.gap = '8px';
        addRow.style.marginTop = '8px';

        const addBtn = addRow.createEl('button');
        addBtn.textContent = 'Add Filter';
        addBtn.addEventListener('click', async () => {
            if (!Array.isArray(this.plugin.settings.customCategories)) this.plugin.settings.customCategories = [];
            this.plugin.settings.customCategories.push({ id: 'cat-' + Date.now(), label: 'New', showInMenu: true });
            await this.plugin.saveSettings();
            renderCategories();
        });
        addRow.appendChild(addBtn);
        
        // After rendering categories, update the header in any open Card Sidebar views
        try {
            const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
            if (view) {
                const main = view.containerEl.querySelector('.card-sidebar-main');
                const old = main?.querySelector('.card-sidebar-header');
                if (old) old.remove();
                if (main) view.createHeader(main);
                try { if (typeof view.applyFilters === 'function') view.applyFilters(); } catch (e) {}
            }
        } catch (e) {}
    };

    try { renderCategories(); } catch (e) { console.error('Error rendering custom categories UI:', e); }

    
    try {
        const buildOptions = () => {
            const opts = [
                { value: 'all', label: 'All' },
                { value: 'today', label: 'Today' },
                { value: 'Tomorrow', label: 'Tomorrow' },
                { value: 'This Week', label: 'This Week' }
            ];
            const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
            cats.forEach(c => {
                try { opts.push({ value: String(c.id || c.label || ''), label: String(c.label || c.id || '') }); } catch (e) {}
            });
            return opts;
        };

        const current = this.plugin.settings.openCategoryOnLoad || 'all';
        new Setting(containerEl)
            .setName('Open category on load')
            .setDesc('Choose which filter the sidebar should open with')
            .addDropdown(dropdown => {
                const opts = buildOptions();
                opts.forEach(o => dropdown.addOption(o.value, o.label));
                dropdown.setValue(current);
                dropdown.onChange(async (v) => {
                    this.plugin.settings.openCategoryOnLoad = v;
                    await this.plugin.saveSettings();
                });
            });
    } catch (e) { console.error('Error adding Open category on load setting:', e); }

    const previewSpan = timeSetting.descEl.querySelector('.card-ts-preview');
    if (previewSpan) {
        previewSpan.appendChild(previewEl);
    } else {
        timeSetting.descEl.appendChild(previewEl);
    }

    updatePreview(this.plugin.settings.datetimeFormat);

    containerEl.createEl('h3', { text: 'Behaviour' });

    new Setting(containerEl)
        .setName('Next line key')
        .setDesc('Choose which key combo inserts a new line inside a card (does not save)')
        .addDropdown(dropdown => dropdown
            .addOption('enter', 'Enter')
            .addOption('shift-enter', 'Shift+Enter')
            .addOption('ctrl-enter', 'Ctrl+Enter')
            .addOption('alt-enter', 'Alt+Enter')
            .addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter')
            .setValue(this.plugin.settings.nextLineKey || 'shift-enter')
            .onChange(async (value) => {
                this.plugin.settings.nextLineKey = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Save key')
        .setDesc('Choose which key combo saves the card (submission / commit)')
        .addDropdown(dropdown => dropdown
            .addOption('enter', 'Enter')
            .addOption('shift-enter', 'Shift+Enter')
            .addOption('ctrl-enter', 'Ctrl+Enter')
            .addOption('alt-enter', 'Alt+Enter')
            .addOption('ctrl-shift-enter', 'Ctrl+Shift+Enter')
            .setValue(this.plugin.settings.saveKey || 'enter')
            .onChange(async (value) => {
                this.plugin.settings.saveKey = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Auto-open sidebar')
        .setDesc('Automatically open the sidebar when Obsidian starts')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.autoOpen)
            .onChange(async (value) => {
                this.plugin.settings.autoOpen = value;
                await this.plugin.saveSettings();
            }));

    // new Setting(containerEl)
    //     .setName('Replace empty tab/home with SideCards')
    //     .setDesc('When enabled, the default empty tab/homepage opens SideCards')
    //     .addToggle(toggle => toggle
    //         .setValue(this.plugin.settings.replaceHomepageWithSidecards || false)
    //         .onChange(async (value) => {
    //             this.plugin.settings.replaceHomepageWithSidecards = value;
    //             await this.plugin.saveSettings();
    //         }));

    containerEl.createEl('h3', { text: 'Automation' });

    

    new Setting(containerEl)
        .setName('Auto-archive on expiry')
        .setDesc('Automatically archive cards when expiry time passes')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.autoArchiveOnExpiry != null ? this.plugin.settings.autoArchiveOnExpiry : false)
            .onChange(async (value) => {
                this.plugin.settings.autoArchiveOnExpiry = value;
                await this.plugin.saveSettings();
            }));

    containerEl.createEl('h3', { text: 'Auto Color' });
    const autoColorDesc = containerEl.createEl('p', { text: 'Cards can inherit a color based on text or tags. Choose rules below; names are used when card-color frontmatter is absent.' });
    autoColorDesc.style.margin = '6px 0 12px';
    autoColorDesc.style.color = 'var(--text-muted)';

    const rulesContainer = containerEl.createDiv();
    rulesContainer.style.marginTop = '8px';
    const renderRules = () => {
        rulesContainer.empty();
        const rules = Array.isArray(this.plugin.settings.autoColorRules) ? this.plugin.settings.autoColorRules : [];
        rules.forEach((r, idx) => {
            const row = rulesContainer.createDiv();
            row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '4px 0';
            const typeSel = row.createEl('select');
            ['text','tag'].forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; typeSel.appendChild(opt); });
            typeSel.value = String(r.type || 'text');
            typeSel.addEventListener('change', async (e) => { this.plugin.settings.autoColorRules[idx].type = e.target.value; await this.plugin.saveSettings(); });
            const matchInput = row.createEl('input');
            matchInput.type = 'text'; matchInput.placeholder = 'match'; matchInput.value = r.match || ''; matchInput.style.flex = '1';
            matchInput.addEventListener('input', async (e) => { this.plugin.settings.autoColorRules[idx].match = e.target.value; await this.plugin.saveSettings(); });
            const colorSel = row.createEl('select');
            colorSel.style.minWidth = '220px';
            for (let i = 1; i <= 10; i++) {
                const opt = document.createElement('option');
                opt.value = String(i);
                const names = this.plugin.settings.colorNames || [];
                const label = names[i - 1] ? String(names[i - 1]) : `Color ${i}`;
                opt.textContent = label;
                colorSel.appendChild(opt);
            }
            colorSel.value = String(r.colorIndex || 1);
            colorSel.addEventListener('change', async (e) => { this.plugin.settings.autoColorRules[idx].colorIndex = Number(e.target.value); await this.plugin.saveSettings(); });
            const delBtn = row.createEl('button', { text: 'Remove' });
            delBtn.addEventListener('click', async () => { this.plugin.settings.autoColorRules.splice(idx,1); await this.plugin.saveSettings(); renderRules(); });
            row.appendChild(typeSel); row.appendChild(matchInput); row.appendChild(colorSel); row.appendChild(delBtn);
        });
        const addRow = rulesContainer.createDiv();
        addRow.style.display = 'flex';
        addRow.style.justifyContent = 'flex-end';
        addRow.style.marginTop = '12px';
        const addBtn = addRow.createEl('button', { text: 'Add Auto Color Rule' });
        addBtn.addClass('mod-cta');
        addBtn.addEventListener('click', async () => { if (!Array.isArray(this.plugin.settings.autoColorRules)) this.plugin.settings.autoColorRules = []; this.plugin.settings.autoColorRules.push({ type:'text', match:'', colorIndex:1 }); await this.plugin.saveSettings(); renderRules(); });
    };
    renderRules();

    containerEl.createEl('h3', { text: 'Status' });
    const statusDesc = containerEl.createEl('p', { text: 'Dropdown colors take precedence over custom unless the dropdown is set to [custom].' });
    statusDesc.style.marginTop = '-12px';
    statusDesc.style.color = 'var(--text-muted)';
    const statusSection = containerEl.createDiv();
    statusSection.addClass('card-status-settings');
    new Setting(statusSection)
        .setName('Enable Card Status')
        .setDesc('Drag to reorder status pills and set their sorting priority.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableCardStatus || false)
            .onChange(async (value) => {
                this.plugin.settings.enableCardStatus = value;
                await this.plugin.saveSettings();
                try { renderStatusConfig(); } catch (e) {}
            }));

    new Setting(statusSection)
        .setName('Inherit status color')
        .setDesc('When enabled, card color uses the status color')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.inheritStatusColor || false)
            .onChange(async (value) => {
                this.plugin.settings.inheritStatusColor = value;
                await this.plugin.saveSettings();
            }));

    new Setting(statusSection)
        .setName('Status pill opacity')
        .setDesc('Controls the background opacity of status pills')
        .addSlider(sl => sl
            .setLimits(0, 1, 0.05)
            .setValue(typeof this.plugin.settings.statusPillOpacity !== 'undefined' ? this.plugin.settings.statusPillOpacity : 1)
            .onChange(async (v) => {
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
                row.addClass('card-status-row');
                row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '4px 0';
                // Drag handle
                const handle = row.createEl('span', { text: '≡' });
                handle.title = 'Drag to reorder';
                handle.style.cursor = 'grab';
                handle.style.padding = '4px';
                handle.style.userSelect = 'none';
                // Inputs
                const nameInput = row.createEl('input'); nameInput.type = 'text'; nameInput.placeholder = 'Status name'; nameInput.value = s.name || ''; nameInput.style.flex = '1';
                nameInput.addEventListener('input', async (e) => { this.plugin.settings.cardStatuses[idx].name = e.target.value; await this.plugin.saveSettings(); });
                const textColorInput = row.createEl('input'); textColorInput.type = 'color'; textColorInput.value = s.textColor || '#000000';
                textColorInput.title = 'Text color';
                textColorInput.addEventListener('change', async (e) => { 
                    this.plugin.settings.cardStatuses[idx].textColor = e.target.value; 
                    await this.plugin.saveSettings();
                    // Instantly refresh cards to show new color
                    try {
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view && view.cards) {
                            view.cards.forEach(card => {
                                if (card.status && card.status.name === this.plugin.settings.cardStatuses[idx].name) {
                                    card.status.textColor = e.target.value;
                                    const statusPill = card.element?.querySelector('.card-status-pill');
                                    if (statusPill) statusPill.style.color = e.target.value;
                                }
                            });
                        }
                    } catch (err) {}
                });
                const colorInput = row.createEl('input'); colorInput.type = 'color'; colorInput.value = s.color || '#20bf6b';
                colorInput.title = 'Background color';
                colorInput.addEventListener('change', async (e) => { 
                    this.plugin.settings.cardStatuses[idx].color = e.target.value; 
                    await this.plugin.saveSettings();
                    // Instantly refresh cards to show new color
                    try {
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view && view.cards) {
                            const statusName = this.plugin.settings.cardStatuses[idx].name;
                            const hexToRGBA = (hex, alpha) => {
                                try {
                                    const h = hex.replace('#','');
                                    const bigint = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
                                    const r = (bigint >> 16) & 255;
                                    const g = (bigint >> 8) & 255;
                                    const b = bigint & 255;
                                    const a = Math.max(0, Math.min(1, Number(alpha || 1)));
                                    return `rgba(${r}, ${g}, ${b}, ${a})`;
                                } catch (err) { return hex; }
                            };
                            const opacityVal = (this.plugin.settings.statusPillOpacity !== undefined) ? this.plugin.settings.statusPillOpacity : 1;
                            view.cards.forEach(card => {
                                if (card.status && card.status.name === statusName) {
                                    card.status.color = e.target.value;
                                    const statusPill = card.element?.querySelector('.card-status-pill');
                                    if (statusPill) statusPill.style.backgroundColor = hexToRGBA(e.target.value, opacityVal);
                                }
                            });
                        }
                    } catch (err) {}
                });
                const presetSel = row.createEl('select');
                // First option: custom
                { const opt = document.createElement('option'); opt.value = 'custom'; opt.textContent = '[custom]'; presetSel.appendChild(opt); }
                for (let i = 1; i <= 10; i++) {
                    const opt = document.createElement('option');
                    opt.value = String(i);
                    const names = this.plugin.settings.colorNames || [];
                    opt.textContent = names[i - 1] ? String(names[i - 1]) : `Color ${i}`;
                    presetSel.appendChild(opt);
                }
                presetSel.title = 'Choose preset color';
                presetSel.style.minWidth = '160px';
                // Initialize selection based on current status color
                try {
                    const current = String(this.plugin.settings.cardStatuses[idx].color || '').toLowerCase();
                    const presets = Array.from({length: 10}, (_, k) => String(this.plugin.settings[`color${k+1}`] || '').toLowerCase());
                    const foundIdx = presets.findIndex(h => h && h === current);
                    presetSel.value = foundIdx >= 0 ? String(foundIdx + 1) : 'custom';
                } catch (e) { presetSel.value = 'custom'; }
                presetSel.addEventListener('change', async (e) => {
                    try {
                        if (String(e.target.value) === 'custom') {
                            // Do not overwrite; custom color input remains authoritative
                            await this.plugin.saveSettings();
                        } else {
                            const idxSel = Number(e.target.value);
                            const key = `color${idxSel}`;
                            const hex = this.plugin.settings[key] || '#20bf6b';
                            this.plugin.settings.cardStatuses[idx].color = hex;
                            await this.plugin.saveSettings();
                        }
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view && view.cards) {
                            const statusName = this.plugin.settings.cardStatuses[idx].name;
                            const statusPillOpacity = (this.plugin.settings.statusPillOpacity !== undefined) ? this.plugin.settings.statusPillOpacity : 1;
                            const hexToRGBA = (h, a) => { try { const H=h.replace('#',''); const n=parseInt(H.length===3?H.split('').map(x=>x+x).join(''):H,16); const r=(n>>16)&255,g=(n>>8)&255,b=n&255; return `rgba(${r}, ${g}, ${b}, ${Math.max(0.1, Math.min(1, a))})`; } catch (err) { return h; } };
                            view.cards.forEach(card => {
                                if (card.status && card.status.name === statusName) {
                                    if (String(e.target.value) !== 'custom') {
                                        const hex = this.plugin.settings[`color${Number(e.target.value)}`] || card.status.color || '#20bf6b';
                                        card.status.color = hex;
                                        const pill = card.element?.querySelector('.card-status-pill');
                                        if (pill) pill.style.backgroundColor = hexToRGBA(hex, statusPillOpacity);
                                    } else {
                                        const pill = card.element?.querySelector('.card-status-pill');
                                        if (pill) pill.style.backgroundColor = hexToRGBA(card.status.color || '#20bf6b', statusPillOpacity);
                                    }
                                }
                            });
                        }
                    } catch (err) {}
                });
                const delBtn = row.createEl('button', { text: 'Remove' }); delBtn.addEventListener('click', async () => { this.plugin.settings.cardStatuses.splice(idx,1); await this.plugin.saveSettings(); renderStatusConfig(); });

                // Make the entire row draggable and handle drop to reorder
                row.draggable = true;
                row.dataset.idx = idx;
            row.addEventListener('dragstart', (e) => {
                try { e.dataTransfer.setData('text/plain', String(idx)); row.style.opacity = '0.5'; } catch (err) {}
            });
            row.addEventListener('dragend', () => { try { row.style.opacity = ''; } catch (err) {} });
            row.addEventListener('dragover', (e) => { e.preventDefault(); row.style.borderTop = '2px solid var(--background-modifier-accent)'; });
            row.addEventListener('dragleave', () => { try { row.style.borderTop = ''; } catch (err) {} });
            row.addEventListener('drop', async (e) => {
                try {
                    e.preventDefault();
                    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                    const toIdx = Number(row.dataset.idx);
                    row.style.borderTop = '';
                    if (!Array.isArray(this.plugin.settings.cardStatuses)) return;
                    if (isNaN(fromIdx) || isNaN(toIdx)) return;
                    if (fromIdx === toIdx) return;
                    const arr = this.plugin.settings.cardStatuses;
                    const item = arr.splice(fromIdx, 1)[0];
                    arr.splice(toIdx, 0, item);
                    await this.plugin.saveSettings();
                    renderStatusConfig();
                } catch (err) { console.error('Error reordering statuses:', err); }
            });

                row.appendChild(handle);
                row.appendChild(nameInput); row.appendChild(textColorInput); row.appendChild(colorInput); row.appendChild(presetSel); row.appendChild(delBtn);
            });
            const addRow = statusConfigContainer.createDiv(); addRow.style.display = 'flex'; addRow.style.justifyContent = 'flex-end'; addRow.style.marginTop = '12px';
            const addBtn = addRow.createEl('button', { text: 'Add Status' }); addBtn.addClass('mod-cta');
            addBtn.addEventListener('click', async () => { if (!Array.isArray(this.plugin.settings.cardStatuses)) this.plugin.settings.cardStatuses = []; this.plugin.settings.cardStatuses.push({ name: 'focus', color: '#20bf6b', textColor: '#000000' }); await this.plugin.saveSettings(); renderStatusConfig(); });
        };
    renderStatusConfig();

    // Note: status rows are draggable within the main config above; ordering defines hierarchy.

    
    
}

updateCSSVariables() {
    try {
        if (this.plugin && typeof this.plugin.applyGlobalStyles === 'function') {
            this.plugin.applyGlobalStyles();
        }
    } catch (e) { console.error('Error delegating updateCSSVariables to plugin:', e); }
}
}

// Provides folder path autocompletion for the storage location setting
class FolderSuggest {
    constructor(app, inputEl, folders) {
        this.app = app;
        this.inputEl = inputEl;
        this.folders = Array.from(folders).sort();

        this.suggestEl = createDiv('suggestion-container');
        this.suggestEl.style.display = 'none';
        this.suggestEl.style.position = 'absolute';
        this.suggestEl.style.zIndex = '1000';
        this.suggestEl.style.left = '0';
        this.suggestEl.style.width = '100%';
        this.suggestEl.style.backgroundColor = 'var(--background-primary)';
        this.suggestEl.style.border = '1px solid var(--background-modifier-border)';
        this.suggestEl.style.borderRadius = '4px';
        this.suggestEl.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        this.suggestEl.style.maxHeight = '200px';
        this.suggestEl.style.overflowY = 'auto';
        
        this.inputEl.parentElement.appendChild(this.suggestEl);
        
    
    
    this.inputEl.addEventListener('click', this.onFocus.bind(this));
    this.inputEl.addEventListener('input', this.onInput.bind(this));
        document.addEventListener('click', this.onClick.bind(this));
    }
    
    onFocus() {
        
        
        try {
            const foldersSet = new Set(['/']);
            const root = this.app.vault.getRoot && this.app.vault.getRoot();
            const walk = (node) => {
                try {
                    if (!node) return;
                    const children = node.children || [];
                    for (const c of children) {
                        
                        if (c && c.path && c.children) {
                            foldersSet.add(c.path || '/');
                            walk(c);
                        }
                    }
                } catch (err) { }
            };
            if (root) walk(root);
            
            try {
                this.app.vault.getAllLoadedFiles().forEach(file => {
                    if (file && file.parent) foldersSet.add(file.parent.path);
                });
            } catch (e) {}

            this.folders = Array.from(foldersSet).sort();
        } catch (e) {
            console.error('Error rebuilding folder list on focus for FolderSuggest:', e);
        }

        this.updateSuggestions();
        this.suggestEl.style.display = 'block';
    }
    
    onInput() {
        this.updateSuggestions();
    }
    
    onClick(event) {
        if (!this.inputEl.contains(event.target) && !this.suggestEl.contains(event.target)) {
            this.suggestEl.style.display = 'none';
        }
    }
    
    updateSuggestions() {
        const inputValue = this.inputEl.value.toLowerCase();
        this.suggestEl.empty();

        
        
        const foldersList = this.folders && this.folders.length > 0 ? this.folders.slice() : [];
        if (!foldersList || foldersList.length === 0) {
            try {
                const foldersSet = new Set(['/']);
                const root = this.app.vault.getRoot && this.app.vault.getRoot();
                const walk = (node) => {
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
                this.folders = Array.from(foldersSet).sort();
                foldersList.push(...this.folders);
            } catch (err) {
                console.error('Error computing folders in updateSuggestions fallback:', err);
            }
        }

        const matchingFolders = (foldersList || []).filter(folder =>
            String(folder || '').toLowerCase().includes(inputValue));
        
        matchingFolders.forEach(folder => {
            const suggestionEl = this.suggestEl.createDiv('suggestion-item');
            suggestionEl.style.padding = '8px';
            suggestionEl.style.cursor = 'pointer';
            suggestionEl.textContent = folder || '/';
            
            suggestionEl.addEventListener('mouseenter', () => {
                suggestionEl.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            
            suggestionEl.addEventListener('mouseleave', () => {
                suggestionEl.style.backgroundColor = '';
            });
            
            suggestionEl.addEventListener('click', () => {
                this.inputEl.value = folder;
                this.suggestEl.style.display = 'none';
                this.inputEl.dispatchEvent(new Event('input'));
            });
        });
        
        if (matchingFolders.length > 0) {
            this.suggestEl.style.display = 'block';
        } else {
            this.suggestEl.style.display = 'none';
        }
    }
}

// Core plugin class managing card persistence, view registration, and global styles
class CardSidebarPlugin extends Plugin {
    debugLog() {
        try { if (this.settings && this.settings.debug) console.log.apply(console, arguments); } catch (e) {}
    }
    validateLoadedCounts(view) {
        try {
            const expected = (this.settings.cards || []).length;
            const actual = (view.cards || []).length;
            this.debugLog('🔍 Validation', { expected, actual });
            if (actual < expected) {
                console.warn('SideCards: Fewer cards loaded than expected', { expected, actual });
            }
        } catch (e) {}
    }
    debugWarn() {
        try { if (this.settings && this.settings.debug) console.warn.apply(console, arguments); } catch (e) {}
    }
    async onload() {
        await this.loadSettings();
    try { this.debugLog('sidecards: onload loaded settings', { manualOrder: this.settings && this.settings.manualOrder, sortMode: this.settings && this.settings.sortMode, sortAscending: this.settings && this.settings.sortAscending }); } catch (e) {}
    try { this._applySortLoadInProgress = true; this._applySortLoadSeen = false; } catch (e) {}

            // Track recently deleted files to prevent auto-recreation
            this._recentlyDeletedPaths = new Set();
            
            // Register file change watcher
            this.registerEvent(
                this.app.vault.on('delete', (file) => {
                    this.debugLog("📁 File delete event detected:", file.path);
                    // Track deleted path for 5 seconds to prevent recreation
                    const normalizedPath = file.path.toLowerCase();
                    this._recentlyDeletedPaths.add(normalizedPath);
                    setTimeout(() => {
                        this._recentlyDeletedPaths.delete(normalizedPath);
                    }, 5000);
                })
            );
            
            this.registerEvent(
                this.app.vault.on('modify', (file) => {
                    this.debugLog("📝 File modify event detected:", file.path);
                })
            );
            
            this.registerEvent(
                this.app.vault.on('create', async (file) => {
                    this.debugLog("➕ File create event detected:", file.path);
                    
                    // Skip if this is a user-initiated create
                    if (this._userInitiatedCreate) {
                        this.debugLog("✨ Allowing user-initiated file creation:", file.path);
                        return;
                    }
                    
                    // Check if this is an auto-recreation of a recently deleted file
                    const normalizedPath = file.path.toLowerCase();
                    const baseName = file.path.split('/').pop().toLowerCase();
                    
                    // Check if any recently deleted file had a similar name
                    for (const deletedPath of this._recentlyDeletedPaths) {
                        const deletedBaseName = deletedPath.split('/').pop();
                        if (deletedBaseName.replace(/\s+\d+/g, '') === baseName.replace(/\s+\d+/g, '')) {
                            this.debugLog("🚫 Preventing auto-recreation of recently deleted file:", file.path);
                            
                            // Add a small delay to avoid race conditions
                            await new Promise(resolve => setTimeout(resolve, 50));
                            
                            // Double check file still exists before trying to delete
                            try {
                                const exists = await this.app.vault.adapter.exists(file.path);
                                if (exists) {
                                    await this.app.vault.delete(file);
                                    this.debugLog("✅ Successfully prevented auto-recreation");
                                }
                            } catch (e) {
                                this.debugLog("ℹ️ File already removed or inaccessible");
                            }
                            return;
                        }
                    }
                })
            );        
        try {
            if (typeof this.applyGlobalStyles === 'function') this.applyGlobalStyles();
        } catch (e) { console.error('Error applying global styles on load:', e); }

    
        this.momentAvailable = false;
        const loadScript = (url) => new Promise((resolve, reject) => {
            try {
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => { resolve(); };
                s.onerror = () => reject(new Error('Failed to load ' + url));
                document.head.appendChild(s);
            } catch (e) {
                reject(e);
            }
        });

    
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js');
        } catch (e) {
            this.debugWarn('Failed to load moment.js via CDN:', e);
        }
    
        if (typeof window.moment === 'undefined' && typeof moment !== 'undefined') {
            window.moment = moment;
        }
        if (window.moment) {
            this.momentAvailable = true;
            this.debugLog('Moment.js loaded successfully');
        } else {
            this.momentAvailable = false;
            this.debugWarn('Moment.js not available, falling back to simple formatter.');
        }

    
        this.registerView(
            'card-sidebar',
            (leaf) => new CardSidebarView(leaf, this)
        );

    
        if (this.settings.storageFolder && this.settings.storageFolder !== '/') {
            this.debugLog("📂 Checking storage folder for auto-import:", this.settings.storageFolder);
            if (!this.settings.cards || this.settings.cards.length === 0) {
                this.debugLog("🔄 No cards in settings, will attempt auto-import when layout is ready");
                this.app.workspace.onLayoutReady(async () => {
                    try {
                        this.debugLog("🔃 Layout ready - starting auto-import from folder");
                        await this.importNotesFromFolderToSettings(this.settings.storageFolder, true);
                        this._importedFromFolderOnLoad = true;
                    } catch (e) {
                        console.error('Error importing notes from storage folder on layout ready:', e);
                    }
                });
            }
        }

    
        this.addRibbonIcon('cards', 'Card Sidebar', () => {
            this.activateView();
        });

    
        this.addCommand({
            id: 'open-card-sidebar',
            name: 'Open Card Sidebar',
            callback: () => {
                this.activateView();
            }
        });

        // Add Quick Card Add with Filter command
        this.addCommand({
            id: 'quick-card-add-with-filter',
            name: 'Quick Card Add',
            callback: () => {
                new QuickCardWithFilterModal(this.app, this).open();
            }
        });

        // Command to reset sorting (clear manual order and set default sort)
        this.addCommand({
            id: 'sidecards-reset-sorting',
            name: 'SideCards: Reset Sorting to Default',
            callback: async () => {
                try {
                    this.settings.manualOrder = [];
                    this.settings.sortMode = 'manual';
                    this.settings.sortAscending = true;
                    await this.saveSettings();

                    // Reapply to any open views
                    const leaves = this.app.workspace.getLeavesOfType('card-sidebar');
                    leaves.forEach(async (l) => {
                        try {
                            const view = l.view;
                            if (view && typeof view.applySort === 'function') {
                                try { this.debugLog('sidecards: reset-sorting command calling applySort on view', new Error().stack); } catch (e) {}
                                await view.applySort('manual', true);
                            }
                        } catch (e) {}
                    });

                    new Notice('SideCards sorting reset to default');
                } catch (e) {
                    console.error('Error resetting SideCards sorting:', e);
                    new Notice('Failed to reset SideCards sorting (see console)');
                }
            }
        });

    
    this.addSettingTab(new CardSidebarSettingTab(this.app, this));

    
        if (this.settings.autoOpen) {
            this.app.workspace.onLayoutReady(() => {
                try {
                    // If homepage replacement is enabled, avoid double-opening
                    if (this.settings.replaceHomepageWithSidecards) {
                        setTimeout(() => {
                            const leaves = this.app.workspace.getLeavesOfType('card-sidebar');
                            if (!leaves || leaves.length === 0) this.activateView();
                        }, 100);
                    } else {
                        const leaves = this.app.workspace.getLeavesOfType('card-sidebar');
                        if (!leaves || leaves.length === 0) this.activateView();
                    }
                } catch (e) { this.debugLog('Error in autoOpen onLayoutReady:', e); }
            });
        }

        // Optionally replace homepage/empty leaf with SideCards view
        try {
            const replaceEmptyWithSidecards = () => {
                try {
                    const getType = (lf) => {
                        try { return (lf.view && typeof lf.view.getViewType === 'function') ? lf.view.getViewType() : (lf.view && lf.view.getViewType) || ''; } catch (e) { return ''; }
                    };
                    const isEmptyType = (t) => ['empty','welcome','start','home'].includes(String(t || '').toLowerCase());
                    
                    // Check active leaf first
                    const active = this.app.workspace.getActiveLeaf();
                    if (active && isEmptyType(getType(active))) {
                        this.debugLog('🔄 Replacing empty active leaf with SideCards');
                        try { 
                            active.setViewState({ type: 'card-sidebar' }); 
                            return true; 
                        } catch (e) {
                            this.debugLog('Error replacing active leaf:', e);
                        }
                    }
                    
                    // Check all leaves for empty ones
                    const leaves = this.app.workspace.getLeaves();
                    for (const leaf of leaves) {
                        const vt = getType(leaf);
                        if (isEmptyType(vt)) {
                            this.debugLog('🔄 Replacing empty leaf with SideCards');
                            try { 
                                leaf.setViewState({ type: 'card-sidebar' }); 
                                return true;
                            } catch (e) {
                                this.debugLog('Error replacing leaf:', e);
                            }
                        }
                    }
                } catch (e) {
                    this.debugLog('Error in replaceEmptyWithSidecards:', e);
                }
                return false;
            };
            
            if (this.settings.replaceHomepageWithSidecards) {
                // Replace empty leaves on layout ready
                this.app.workspace.onLayoutReady(() => {
                    try {
                        setTimeout(() => {
                            replaceEmptyWithSidecards();
                        }, 100);
                    } catch (e) {}
                });
                
                // Set up continuous monitoring for empty tabs
                // This checks periodically and on various workspace events
                const checkAndReplaceEmpty = () => {
                    try {
                        const getType = (lf) => {
                            try { return (lf.view && typeof lf.view.getViewType === 'function') ? lf.view.getViewType() : (lf.view && lf.view.getViewType) || ''; } catch (e) { return ''; }
                        };
                        const isEmptyType = (t) => ['empty','welcome','start','home'].includes(String(t || '').toLowerCase());
                        
                        // Get active leaf and check if it's empty
                        const active = this.app.workspace.getActiveLeaf();
                        if (active && isEmptyType(getType(active))) {
                            this.debugLog('🎯 Active leaf is empty, replacing with SideCards');
                            active.setViewState({ type: 'card-sidebar' }).catch(e => {
                                this.debugLog('Error setting view state:', e);
                            });
                        }
                    } catch (e) {
                        this.debugLog('Error in checkAndReplaceEmpty:', e);
                    }
                };
                
                // Listen for leaf-open event
                this.registerEvent(
                    this.app.workspace.on('leaf-open', (leaf) => {
                        if (this.settings.replaceHomepageWithSidecards) {
                            checkAndReplaceEmpty();
                        }
                    })
                );
                
                // Also listen for active-leaf-change
                this.registerEvent(
                    this.app.workspace.on('active-leaf-change', (leaf) => {
                        if (this.settings.replaceHomepageWithSidecards && leaf) {
                            checkAndReplaceEmpty();
                        }
                    })
                );
                
                // Patch the workspace containerEl's click handler for the new tab button
                try {
                    const workspaceEl = this.app.workspace.containerEl;
                    const originalClick = workspaceEl.onclick;
                    
                    // Create a new click handler that will catch new tab button clicks
                    workspaceEl.addEventListener('click', (e) => {
                        try {
                            // Check if this was a "new tab" button click
                            const target = e.target;
                            if (target && (target.classList.contains('workspace-tab-header-new-tab') || 
                                          target.closest('.workspace-tab-header-new-tab') ||
                                          (target.title && target.title.includes('New tab')) ||
                                          (target.getAttribute('aria-label') && target.getAttribute('aria-label').includes('New tab')))) {
                                
                                this.debugLog('🆕 New tab button clicked');
                                
                                // Give the new leaf time to be created
                                setTimeout(() => {
                                    checkAndReplaceEmpty();
                                }, 100);
                            }
                        } catch (e) {
                            this.debugLog('Error in new tab click handler:', e);
                        }
                    }, true); // Use capture phase to catch the event early
                    
                    this.debugLog('✅ Attached new tab click listener');
                } catch (e) {
                    this.debugLog('Could not attach new tab click listener:', e);
                }
                
                // Also set up a periodic check every 500ms for empty tabs
                this._emptyTabCheckInterval = setInterval(() => {
                    if (this.settings.replaceHomepageWithSidecards) {
                        try {
                            checkAndReplaceEmpty();
                        } catch (e) {}
                    }
                }, 500);
            }
        } catch (e) {
            this.debugLog('Error setting up empty tab replacement:', e);
        }

        this.debugLog('Card Sidebar plugin loaded successfully');
        try {
            if (!this.settings || !this.settings.tutorialShown) {
                
                try { this.showFirstRunTutorial(); } catch (e) { console.error('Error showing first-run tutorial:', e); }
            }
        } catch (e) { }

        // Track local date changes and move items from 'tomorrow' to 'today' when date rolls over
        try {
            // Initialize last check time to current hour
            const now = new Date();
            this._lastCheckHour = now.getHours();
            
            // Check every minute for date/time transitions
            this._dateCheckInterval = setInterval(async () => {
                try {
                    const now = new Date();
                    const currentHour = now.getHours();
                    
                    // If we've crossed midnight (e.g. from hour 23 to 0)
                    if (this._lastCheckHour === 23 && currentHour === 0) {
                        this.debugLog('sidecards: Midnight detected, running date transition...');
                        try { 
                            await this._handleDateChange(); 
                            new Notice('Cards have been updated for the new day');
                        } catch (e) { 
                            console.error('Error handling date change:', e); 
                        }
                    }
                    
                    this._lastCheckHour = currentHour;
                } catch (e) {
                    console.error('Error in date check interval:', e);
                }
            }, 60 * 1000); // Check every minute
        } catch (e) { console.error('Error setting up date rollover checker:', e); }
    }

    // Initialize plugin settings with defaults for colors, animations, and card behavior
    async loadSettings() {
        this.settings = Object.assign({
            storageFolder: 'Cards',
            autoOpen: true,
            tutorialShown: false,
            showTimestamps: true,
            datetimeFormat: 'YYYY-MM-DD HH:mm',
            
            animatedCards: true,
            disableCardFadeIn: false,
            color1: '#8392a4',
            color2: '#eb3b5a',
            color3: '#fa8231',
            color4: '#e5a216',
            color5: '#20bf6b',
            color6: '#2d98da',
            color7: '#8854d0',
            color8: '#e832c1',
            color9: '#e83289',
            color10: '#965b3b',
            
            colorNames: ['Gray','Red','Orange','Yellow','Green','Blue','Purple','Magenta','Pink','Brown'],
            twoRowSwatches: false,
            cardStyle: 1, 
            cardBgOpacity: 0.45, 
            borderThickness: 2,
            buttonPaddingBottom: 26,
            groupTags: true,
            disableFilterButtons: false, 
            hideArchivedFilterButton: false,
            enableCustomCategories: true,
            disableTimeBasedFiltering: false,
            hideTimeBasedAddButtonsInContextMenu: false,
            customCategories: [
                { id: 'backlog', label: 'Backlog', showInMenu: true }
            ],
            sortMode: 'manual', 
            sortAscending: true, 
            manualOrder: [],
            showPinnedOnly: false,
            hideClearButton: true,
            hideScrollbar: false,
            omitTagHash: true,
            nextLineKey: 'shift-enter',
            saveKey: 'enter',
            autoColorRules: [],
            autoArchiveOnExpiry: false,
            defaultExpiryDays: 7,
            enableCardStatus: false,
            cardStatuses: [],
            inheritStatusColor: false,
            statusPillOpacity: 1,
            verticalCardMode: false,
            maxCardHeight: 0,
            debug: true, // DEBUGMODE AH
            cards: [],
            frontmatterCache: {},
            replaceHomepageWithSidecards: false,
            filterColors: {},
            sidebarPosition: 'right',
            disableCardRendering: false
        }, await this.loadData());
    }

    // Move cards from 'tomorrow' category into 'today' category on local date change
    async _handleDateChange() {
        try {
            const cats = Array.isArray(this.settings.customCategories) ? this.settings.customCategories : [];
            // Find a 'today' category id if present (by id or label)
            let todayCat = cats.find(c => String(c.id || '').toLowerCase() === 'today' || String(c.label || '').toLowerCase().includes('today'));
            const todayId = todayCat ? todayCat.id : 'today';

            // Identify category ids that represent 'tomorrow' and 'this week'
            const tomorrowIds = cats.filter(c => String(c.id || '').toLowerCase() === 'tomorrow' || String(c.label || '').toLowerCase().includes('tomorrow')).map(c => c.id);
            const thisWeekIds = cats.filter(c => String(c.id || '').toLowerCase() === 'this_week' || String(c.label || '').toLowerCase().includes('this week')).map(c => c.id);

            // Get current date for this week calculations
            const now = new Date();
            const isMonday = now.getDay() === 1;

            let changed = false;
            if (Array.isArray(this.settings.cards)) {
                await Promise.all(this.settings.cards.map(async card => {
                    try {
                        const cat = String(card.category || '').toLowerCase();
                        let newCategory = null;
                        
                        // Handle tomorrow -> today transition
                        if (cat === 'tomorrow' || (tomorrowIds.length > 0 && tomorrowIds.includes(card.category))) {
                            newCategory = todayId;
                        }
                        // Handle this week -> today transition on Monday
                        // else if (isMonday && (cat === 'this_week' || (thisWeekIds.length > 0 && thisWeekIds.includes(card.category)))) {
                        //     newCategory = todayId;
                        // }

                        if (newCategory) {
                            card.category = newCategory;
                            changed = true;

                            // Update the frontmatter in the note file if it exists
                            if (card.notePath) {
                                try {
                                    const file = this.app.vault.getAbstractFileByPath(card.notePath);
                                    if (file) {
                                        let content = await this.app.vault.read(file);
                                        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                        if (fmMatch) {
                                            let fm = fmMatch[1];
                                            const regex = /^(\s*Category\s*:).*$/mi;
                                            if (regex.test(fm)) {
                                                fm = fm.replace(regex, `$1 "${newCategory}"`);
                                            } else {
                                                fm = fm + `\nCategory: "${newCategory}"`;
                                            }
                                            const newFmFull = `---\n${fm}\n---\n`;
                                            content = content.replace(fmMatch[0], newFmFull);
                                            this.debugLog('sidecards: modify (date change category) ->', file.path);
                                            await this.app.vault.modify(file, content);
                                        }
                                    }
                                } catch (e) {
                                    console.error('Error updating note frontmatter during date change:', e);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error processing card during date change:', e);
                    }
                }));
            }

            if (changed) {
                try { await this.saveSettings(); } catch (e) { console.error('Error saving settings after date rollover category update:', e); }

                // Show notification about transitions
                new Notice('Cards have been moved to Today based on date change');

                // Refresh any open views
                try {
                    const leaves = this.app.workspace.getLeavesOfType('card-sidebar');
                    leaves.forEach(l => {
                        try {
                            const view = l.view;
                            if (view && typeof view.loadCards === 'function') {
                                try {
                                    if (typeof view.scheduleLoadCards === 'function') view.scheduleLoadCards();
                                    else view.loadCards();
                                } catch (e) { this.debugWarn('Error reloading view during date change:', e); }
                            }
                            if (view && typeof view.applyFilters === 'function') {
                                try { view.applyFilters(); } catch (e) { this.debugWarn('Error applying filters during date change:', e); }
                            }
                        } catch (e) {}
                    });
                } catch (e) {}
            }
        } catch (e) {
            console.error('Error in _handleDateChange:', e);
        }
    }

    showFirstRunTutorial() {
    try {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Welcome to SideCards');

        const content = modal.contentEl;
        
        content.createEl('p', { 
            text: 'Get started with SideCards in 3 steps:',
            cls: 'sidecards-tutorial-intro'
        });

        const ol = content.createEl('ol');
        ol.style.paddingLeft = '20px';
        ol.style.marginBottom = '20px';
        ol.style.lineHeight = '1.5';

        const steps = [
            'Go to Settings → SideCards and set a Storage Folder.',
            'Add cards using the input box below, type and press Enter.',
            'Drag cards from the sidebar into your notes.'
        ];

        steps.forEach(stepText => {
            const li = ol.createEl('li');
            li.textContent = stepText;
            li.style.marginBottom = '8px';
        });

        const tip = content.createEl('p', {
            text: '💡 Tip: Customize card appearance in settings.\nReload using the button below the input box after changes.'
        });
        tip.style.whiteSpace = 'pre-line';

        tip.style.marginTop = '15px';
        tip.style.fontSize = '0.9em';
        tip.style.color = 'var(--text-muted)';

        const btnRow = content.createDiv();
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.marginTop = '20px';
        btnRow.style.gap = '8px'; 

        const openSettings = btnRow.createEl('button', { text: 'Open Settings' });
        openSettings.addEventListener('click', () => {
            this.app.setting.open();
            this.app.setting.openTabById('sidecards');
            modal.close();
        });

        const gotIt = btnRow.createEl('button', { text: 'Got It' });
        gotIt.addClass('mod-cta');
        gotIt.addEventListener('click', async () => {
            this.settings.tutorialShown = true;
            await this.saveSettings();
            modal.close();
        });

        modal.open();
    } catch (e) {
        console.error('Error showing first-run tutorial:', e);
    }
}


    
    applyGlobalStyles() {
        try {
            
            const styleId = 'card-sidebar-colors';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = `:root {\n` +
                `--card-color-1: ${this.settings.color1 || '#8392a4'};\n` +
                `--card-color-2: ${this.settings.color2 || '#eb3b5a'};\n` +
                `--card-color-3: ${this.settings.color3 || '#fa8231'};\n` +
                `--card-color-4: ${this.settings.color4 || '#e5a216'};\n` +
                `--card-color-5: ${this.settings.color5 || '#20bf6b'};\n` +
                `--card-color-6: ${this.settings.color6 || '#2d98da'};\n` +
                `--card-color-7: ${this.settings.color7 || '#8854d0'};\n` +
                `--card-color-8: ${this.settings.color8 || '#e832c1'};\n` +
                `--card-color-9: ${this.settings.color9 || '#e83289'};\n` +
                `--card-color-10: ${this.settings.color10 || '#965b3b'};\n` +
            `}`;
            
            const existing = document.getElementById(styleId);
            if (existing) existing.remove();
            document.head.appendChild(styleEl);

            
            const radiusId = 'card-border-radius';
            const radius = Number(this.settings.borderRadius != null ? this.settings.borderRadius : 6);
            let radiusEl = document.getElementById(radiusId);
            if (radiusEl) radiusEl.remove();
            radiusEl = document.createElement('style');
            radiusEl.id = radiusId;
            radiusEl.textContent = ` .card-sidebar-card { border-radius: ${radius}px !important; } `;
            document.head.appendChild(radiusEl);

            
            const padId = 'card-button-padding';
            const pad = Number(this.settings.buttonPaddingBottom != null ? this.settings.buttonPaddingBottom : 26);
            let padEl = document.getElementById(padId);
            if (padEl) padEl.remove();
            padEl = document.createElement('style');
            padEl.id = padId;
            padEl.textContent = ` .card-sidebar-button-container { padding-bottom: ${pad}px !important; } `;
            document.head.appendChild(padEl);

            const maxHId = 'card-max-height';
            let maxHEl = document.getElementById(maxHId);
            if (maxHEl) maxHEl.remove();
            const maxH = Number(this.settings.maxCardHeight || 0);
            if (maxH > 0) {
                maxHEl = document.createElement('style');
                maxHEl.id = maxHId;
                maxHEl.textContent = ` .card-sidebar-card { max-height: ${maxH}px; } .card-sidebar-card .card-content { overflow-y: auto; } `;
                document.head.appendChild(maxHEl);
            }

            const hideId = 'card-hide-scrollbar';
            let hideEl = document.getElementById(hideId);
            if (hideEl) hideEl.remove();
            if (this.settings.hideScrollbar) {
                hideEl = document.createElement('style');
                hideEl.id = hideId;
                hideEl.textContent = `
                    .card-sidebar-cards-container {
                        scrollbar-width: none !important;
                        -ms-overflow-style: none !important;
                    }
                    .card-sidebar-cards-container::-webkit-scrollbar { display: none !important; }
                    .card-sidebar-cards-container { margin-right: 3px !important; }
                `;
                document.head.appendChild(hideEl);
            }
            else {
            }
        } catch (e) {
            this.debugWarn('Error in applyGlobalStyles:', e);
        }
    }

    
    async importNotesFromFolderToSettings(folder, silent = false) {
        if (!folder) return 0;
        try {
            const allFiles = this.app.vault.getAllLoadedFiles();
            const prefix = folder.endsWith('/') ? folder : folder + '/';
            const mdFiles = allFiles.filter(f => f.path && f.path.startsWith(prefix) && f.path.toLowerCase().endsWith('.md'));
            if (!mdFiles || mdFiles.length === 0) {
                if (!silent) new Notice('No markdown files found in selected folder');
                return 0;
            }

            const createdSerial = [];
            let imported = 0;

            for (const file of mdFiles) {
                try {
                    const path = file.path;
                    const text = await this.app.vault.read(file);

                    let fm = null;
                    let body = text;
                    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                    if (m) {
                        fm = m[1];
                        body = text.slice(m[0].length);
                    }

                    const tags = [];
                    let created = new Date().toISOString();
                    let archived = false;
                    let parsedColorVar = null;
                    let parsedCategoryId = null;

                    if (fm) {
                        
                        try {
                            const viewProto = CardSidebarView.prototype;
                            if (viewProto && typeof viewProto.parseTagsFromFrontmatter === 'function') {
                                const pts = viewProto.parseTagsFromFrontmatter.call({ plugin: this }, fm);
                                pts.forEach(t => { if (t) tags.push(t); });
                            } else {
                                
                                const parsedTags = (fm.match(/^\s*(?:Tags|tags)\s*:\s*(.*)$/mi) || [])[1];
                                if (parsedTags) {
                                    const rest = parsedTags.trim();
                                    if (rest.startsWith('[')) {
                                        const inner = rest.replace(/^\[/, '').replace(/\]$/, '');
                                        inner.split(',').map(s => s.trim().replace(/^"|"$/g, '')).forEach(t => { if (t) tags.push(t); });
                                    } else if (rest.length > 0) {
                                        rest.split(',').map(s => s.trim().replace(/^"|"$/g, '')).forEach(t => { if (t) tags.push(t); });
                                    }
                                }
                            }
                        } catch (e) {  }

                        // Better archived detection - handle various spacing
                        const archMatch = fm.match(/^\s*archived\s*:\s*(true|false)\s*$/mi);
                        if (archMatch && archMatch[1].toLowerCase() === 'true') archived = true;
                        try {
                            const catLabelMatch = fm.match(/^\s*Category\s*:\s*(.*)$/mi);
                            if (catLabelMatch && catLabelMatch[1]) {
                                const catVal = String(catLabelMatch[1]).trim().replace(/^"|"$/g, '');
                                const cats = Array.isArray(this.settings.customCategories) ? this.settings.customCategories : [];
                                const found = cats.find(x => String(x.id || '').toLowerCase() === String(catVal).toLowerCase() || String(x.label || '').toLowerCase() === String(catVal).toLowerCase());
                                parsedCategoryId = found ? (found.label || String(found.id || catVal)) : catVal;
                            }
                        } catch (e) {}

                        try {
                            const ccMatch = fm.match(/^\s*card-color:\s*(.*)$/mi);
                            if (ccMatch) {
                                const val = ccMatch[1].trim().replace(/^"|"$/g, '');
                                const m2 = String(val).match(/^color-(\d+)$/i);
                                if (m2) parsedColorVar = `var(--card-color-${m2[1]})`;
                                else if (/^#/.test(val)) parsedColorVar = val;
                                else {
                                    const idx = (this.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(val).toLowerCase());
                                    if (idx >= 0) parsedColorVar = `var(--card-color-${idx+1})`;
                                }
                            }
                            if (!parsedColorVar) {
                                const nameMatch = fm.match(/^\s*card-color-name:\s*(?:"|')?(.*?)(?:"|')?\s*$/mi);
                                if (nameMatch) {
                                    const nameVal = nameMatch[1].trim();
                                    const idx2 = (this.settings.colorNames || []).findIndex(n => String(n).toLowerCase() === String(nameVal).toLowerCase());
                                    if (idx2 >= 0) parsedColorVar = `var(--card-color-${idx2+1})`;
                                }
                            }
                        } catch (e) {  }
                    }

                    const content = body.trim() || '(empty)';

                    createdSerial.push({
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
                        content,
                        color: parsedColorVar || `var(--card-color-1)`,
                        tags,
                        category: parsedCategoryId || null,
                        created,
                        archived: archived || false,
                        pinned: false,
                        notePath: path
                    });

                    imported++;
                } catch (err) {
                    console.error('Error importing file to settings', file.path, err);
                }
            }

            if (imported > 0) {
                // Merge imported cards with existing cards, avoiding duplicates
                const existingCards = this.settings.cards || [];
                const existingPaths = new Set(existingCards.map(c => c.notePath));
                
                // Only add cards that aren't already in settings
                const newCards = createdSerial.filter(c => !existingPaths.has(c.notePath));
                
                if (newCards.length > 0) {
                    this.settings.cards = [...existingCards, ...newCards];
                    await this.saveSettings();
                }
                
                if (!silent) new Notice(`Imported ${imported} cards from ${folder}`);
            } else if (!silent) {
                new Notice('No new markdown files to import');
            }

            return imported;
        } catch (err) {
            console.error('Error importing notes to settings:', err);
            if (!silent) new Notice('Failed to import notes from folder (see console)');
            return 0;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        try {
            if (typeof this.applyGlobalStyles === 'function') this.applyGlobalStyles();
        } catch (e) { console.error('Error applying global styles after saveSettings:', e); }
    }

    async activateView() {
        const existing = this.app.workspace.getLeavesOfType('card-sidebar');
        if (existing.length > 0) {
            // View already exists - reveal it in its CURRENT location without moving it
            // This is critical: we should NEVER try to move it to a different location
            this.app.workspace.revealLeaf(existing[0]);
            
            // Detect and update the current position
            try {
                const leaf = existing[0];
                let detectedPosition = 'right';
                
                // Traverse up the DOM to find where this leaf actually is
                let current = leaf.containerEl || (leaf.view && leaf.view.containerEl);
                let depth = 0;
                const maxDepth = 10;
                
                while (current && depth < maxDepth) {
                    const className = current.className || '';
                    
                    if (className.includes('side-dock-left') || className.includes('mod-left-split')) {
                        detectedPosition = 'left';
                        this.debugLog('✅ Existing view detected in LEFT sidebar');
                        break;
                    }
                    
                    if (className.includes('workspace-leaf-content') || className.includes('workspace-tabs')) {
                        detectedPosition = 'tab';
                        this.debugLog('✅ Existing view detected in MAIN tabs/editor area');
                        break;
                    }
                    
                    if (className.includes('side-dock-right') || className.includes('mod-right-split')) {
                        detectedPosition = 'right';
                        this.debugLog('✅ Existing view detected in RIGHT sidebar');
                        break;
                    }
                    
                    current = current.parentElement;
                    depth++;
                }
                
                // Update settings with detected position
                if (detectedPosition !== this.settings.sidebarPosition) {
                    this.settings.sidebarPosition = detectedPosition;
                    await this.saveSettings();
                    this.debugLog('✅ Position updated to match actual location:', detectedPosition);
                }
            } catch (e) {
                this.debugLog('⚠️ Could not detect sidebar position:', e);
            }
            return;
        }

        // Create new view - restore to saved position
        let savedPosition = this.settings.sidebarPosition || 'right';
        this.debugLog('Creating new card-sidebar view, saved position:', savedPosition);
        
        let leaf = null;
        
        try {
            if (savedPosition === 'left') {
                this.debugLog('Opening card-sidebar in LEFT sidebar');
                leaf = this.app.workspace.getLeftLeaf(false);
            } else if (savedPosition === 'tab') {
                // Create in the main editor area as a tab
                this.debugLog('Opening card-sidebar in MAIN editor area (as tab)');
                leaf = this.app.workspace.getLeaf(true);
            } else {
                // Default to right sidebar
                this.debugLog('Opening card-sidebar in RIGHT sidebar');
                leaf = this.app.workspace.getRightLeaf(false);
            }
        } catch (e) {
            // Fallback to right sidebar if there's an error
            this.debugLog('Error getting leaf for saved position, falling back to right sidebar:', e);
            leaf = this.app.workspace.getRightLeaf(false);
        }
        
        if (leaf) {
            await leaf.setViewState({
                type: 'card-sidebar',
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
            
            // Verify and save the actual position where it was opened
            try {
                let detectedPosition = 'right';
                let current = leaf.containerEl || (leaf.view && leaf.view.containerEl);
                let depth = 0;
                const maxDepth = 10;
                
                while (current && depth < maxDepth) {
                    const className = current.className || '';
                    
                    if (className.includes('side-dock-left') || className.includes('mod-left-split')) {
                        detectedPosition = 'left';
                        break;
                    }
                    
                    if (className.includes('workspace-leaf-content') || className.includes('workspace-tabs')) {
                        detectedPosition = 'tab';
                        break;
                    }
                    
                    if (className.includes('side-dock-right') || className.includes('mod-right-split')) {
                        detectedPosition = 'right';
                        break;
                    }
                    
                    current = current.parentElement;
                    depth++;
                }
                
                if (detectedPosition !== this.settings.sidebarPosition) {
                    this.settings.sidebarPosition = detectedPosition;
                    await this.saveSettings();
                    this.debugLog('✅ Sidebar opened and saved at position:', detectedPosition);
                }
            } catch (e) {
                this.debugLog('⚠️ Could not verify sidebar position:', e);
            }
        } else {
            this.debugLog('❌ Failed to create leaf');
        }
    }

    onunload() {
        this.debugLog('Unloading Card Sidebar plugin');
        try {
            if (this._dateCheckInterval) {
                clearInterval(this._dateCheckInterval);
                this._dateCheckInterval = null;
            }
            if (this._emptyTabCheckInterval) {
                clearInterval(this._emptyTabCheckInterval);
                this._emptyTabCheckInterval = null;
            }
        } catch (e) {}
    }
}

module.exports = CardSidebarPlugin;