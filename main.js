const { Plugin, ItemView, Setting, PluginSettingTab, Modal, Menu, Notice, setIcon, MarkdownView } = require('obsidian');

// Modal for quick card creation with filter picker
class QuickCardWithFilterModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        console.log("🔍 Quick Card Add: Modal initialized", {
            hasPlugin: !!plugin,
            pluginSettings: plugin?.settings ? Object.keys(plugin.settings) : null
        });
    }

    getAvailableFilters() {
        console.log("🔍 Quick Card Add: Getting available filters");
        const filters = [
            { type: 'all', label: 'All', value: 'all' }
        ];
        console.log("Base filter added:", filters[0]);

        // Add time-based filters if not disabled
        console.log("🔍 Quick Card Add: Checking time-based filters");
        const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
        console.log("Time-based filters enabled:", showTimeBasedChips);
        if (showTimeBasedChips) {
            const timeBasedFilters = [
                { type: 'category', label: 'Today', value: 'today' },
                { type: 'category', label: 'Tomorrow', value: 'tomorrow' },
                { type: 'category', label: 'This Week', value: 'this_week' }
            ];
            filters.push(...timeBasedFilters);
            console.log("Added time-based filters:", timeBasedFilters);
        }

        // Add custom categories if enabled
        try {
            const enabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.enableCustomCategories);
            if (enabled) {
                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                cats.forEach(cat => {
                    if (cat && cat.showInMenu !== false) {
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
            console.log("🔍 Quick Card Add Debug: Create button clicked");
            console.log("Selected filter:", { value: select.value, type: select.selectedOptions[0].dataset.filterType });
            console.log("Card content:", textarea.value);
            console.log("Selected color:", selectedColor);
            console.log("Tags:", tagsInput.value);
            this.createCardAndFilter(textarea.value, select.value, select.selectedOptions[0].dataset.filterType, selectedColor, tagsInput.value);
            this.close();
        });

        // Handle Enter key
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                console.log("🔍 Quick Card Add Debug: Enter key pressed");
                console.log("Selected filter:", { value: select.value, type: select.selectedOptions[0].dataset.filterType });
                console.log("Card content:", textarea.value);
                this.createCardAndFilter(textarea.value, select.value, select.selectedOptions[0].dataset.filterType, selectedColor, tagsInput.value);
                this.close();
            }
        });
    }
    
    async createCardAndFilter(content, filterValue, filterType, selectedColor = 'var(--card-color-1)', tagsString = '') {
        console.log("🔍 Quick Card Add Debug: createCardAndFilter start", {
            content: content,
            filterValue: filterValue,
            filterType: filterType,
            selectedColor: selectedColor,
            tagsString: tagsString,
            timestamp: new Date().toISOString()
        });

        if (!content.trim()) {
            console.log("❌ Quick Card Add: Empty content detected");
            new Notice('Card content cannot be empty');
            return;
        }

        try {
            // Get first Sidebar view
            console.log("🔍 Looking for sidebar view...");
            const view = this.app.workspace.getLeavesOfType('card-sidebar')?.[0]?.view;
            if (!view) {
                console.log("❌ Quick Card Add: No sidebar view found");
                throw new Error('Card sidebar not found');
            }
            console.log("✅ Quick Card Add: Found sidebar view");
            
            // Create textarea to use existing addCardFromInput logic
            console.log("📝 Creating temporary input element");
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
                        b.style.backgroundColor = 'var(--background-primary)';
                        b.style.color = 'var(--text-muted)';
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
                console.log("🔍 Quick Card Add: Applying filters after card creation", {
                    filterValue: filterValue,
                    filterType: filterType,
                    currentCategoryFilter: view.currentCategoryFilter,
                    numCards: view.cards ? view.cards.length : 0
                });
                view.applyFilters();
                console.log("✅ Quick Card Add: Filters applied");
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
        this.activeFilters = { query: '', tags: [] };
        this._pendingTagWrites = {};
        this._reapplyingTags = {};
        this._universalCardOrder = [];  // Store complete universal order across all views
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
                console.warn('toggleArchive: file not found for path', cardData.notePath);
                return;
            }

            try {
                const content = await this.app.vault.read(file);
                const updated = this.updateFrontmatter(content, 'archived', !!setArchived);
                console.debug('sidecards: modify (toggleArchive) ->', file.path);
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

        this.createFixedInputBox(mainContainer);

        try {
            const folder = this.plugin.settings.storageFolder;
            const hasCardsInSettings = this.plugin.settings.cards && this.plugin.settings.cards.length > 0;
            if (folder && folder !== '/' && !hasCardsInSettings) {
                try {
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
            await this.loadCards(false);
        } catch (e) {
            console.error('Error during loadCards onOpen:', e);
        }

        
    try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
        try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}

        try {
            const openVal = (this.plugin && this.plugin.settings && this.plugin.settings.openCategoryOnLoad) ? String(this.plugin.settings.openCategoryOnLoad) : null;
            if (openVal) {
                const lower = String(openVal).toLowerCase();
                if (['all', 'archived'].includes(lower)) {
                    try {
                        if (lower === 'archived') await this.loadCards(true);
                        else await this.loadCards(false);
                    } catch (e) {}
                    try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
                } else {
                    
                    try { this.currentCategoryFilter = String(openVal).toLowerCase(); } catch (e) { this.currentCategoryFilter = String(openVal); }
                    try { this.applyFilters(); } catch (e) {}
                    try {
                        const btns = this.containerEl.querySelectorAll('.card-filter-btn');
                        btns.forEach(b => {
                            try {
                                const t = (b.dataset && b.dataset.filterType) ? String(b.dataset.filterType) : '';
                                const v = (b.dataset && b.dataset.filterValue) ? String(b.dataset.filterValue).toLowerCase() : '';
                                if (t === 'category' && v === String(this.currentCategoryFilter).toLowerCase()) {
                                    b.addClass('active');
                                    b.style.backgroundColor = 'var(--background-modifier-hover)';
                                    b.style.color = 'var(--text-normal)';
                                } else {
                                    b.removeClass('active');
                                    b.style.backgroundColor = 'var(--background-primary)';
                                    b.style.color = 'var(--text-muted)';
                                }
                            } catch (e) {}
                        });
                    } catch (e) {}
                }
            }
        } catch (e) {}

        try { this.hideLoadingOverlay(300); } catch (e) {}

        try {
            this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
                try {
                    if (!file || !file.path) return;
                    await this.updateCardFromNotePath(file.path);
                } catch (e) {
                    console.error('Error handling modified file for card update:', e);
                }
            }));
        } catch (e) {
            try {
                this._rawModifyListener = this.app.vault.on('modify', async (file) => {
                    if (!file || !file.path) return;
                    try { await this.updateCardFromNotePath(file.path); } catch (e) { console.error(e); }
                });
            } catch (err) {
                console.warn('Could not register vault modify listener for card updates:', err);
            }
        }

        
        
        try {
                this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
                try {
                    if (!file || !file.path) return;
                    const pending = this._pendingTagWrites && this._pendingTagWrites[file.path];
                    console.debug('sidecards: vault modify event for', file.path, 'pending?', !!pending);
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
                            console.debug('sidecards: modify (reapply pending tags) ->', file.path);
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
                    console.warn('Could not register document drop handler for card-to-editor insertion:', e);
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
            chips.push({ type: 'all', label: 'All', value: 'all' });

            // Always show time-based filters unless explicitly disabled
            const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
            if (showTimeBasedChips) {
                chips.push({ type: 'category', label: 'Today', value: 'today', icon: 'calendar-day' });
                chips.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow', icon: 'calendar-up' });
                chips.push({ type: 'category', label: 'This Week', value: 'this_week', icon: 'calendar-week' });
            }

            
            try {
                const enabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.enableCustomCategories);
                if (enabled) {
                    const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                    cats.forEach(cat => {
                        try {
                            // Optionally hide time-based custom categories (Today/Tomorrow/This Week)
                            const id = String(cat.id || '').toLowerCase();
                            const label = String(cat.label || '').toLowerCase();
                            const disabledTime = !!(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
                            if (disabledTime && (id === 'today' || id === 'tomorrow' || id === 'this_week' || label.includes('today') || label.includes('tomorrow') || label.includes('this week'))) {
                                return;
                            }
                            if (cat && cat.showInMenu !== false) {
                                chips.push({ type: 'category', label: cat.label || '', value: cat.id || cat.label || '' });
                            }
                        } catch (e) { }
                    });
                }
            } catch (e) {
                console.error('Error building custom category chips:', e);
            }

            
            if (!this.plugin.settings.hideArchivedFilterButton) {
                chips.push({ type: 'archived', label: 'Archived', value: 'archived' });
            }

            chips.forEach(chip => {
                const btn = filterGroup.createEl('button', { text: chip.label });
                btn.addClass('card-filter-btn');
                btn.style.padding = '4px 8px';
                btn.style.borderRadius = 'var(--button-radius)';
                btn.style.border = '1px solid var(--background-modifier-border)';
                btn.style.background = 'var(--background-primary)';
                btn.style.color = 'var(--text-muted)';
                btn.style.cursor = 'pointer';
                btn.style.fontSize = '12px';

                
                try { btn.dataset.filterType = chip.type || ''; } catch (e) {}
                try { btn.dataset.filterValue = chip.value || ''; } catch (e) {}

                btn.addEventListener('mouseenter', () => {
                    btn.style.backgroundColor = 'var(--background-modifier-hover)';
                });

                btn.addEventListener('mouseleave', () => {
                    if (!btn.hasClass('active')) {
                        btn.style.backgroundColor = 'var(--background-primary)';
                    }
                });

                btn.addEventListener('click', async () => {
                    
                    filterGroup.querySelectorAll('.card-filter-btn').forEach(b => {
                        b.removeClass('active');
                        b.style.backgroundColor = 'var(--background-primary)';
                        b.style.color = 'var(--text-muted)';
                    });

                    const wasActive = btn.hasClass('active');
                    btn.removeClass('active');

                    
                    if (chip.type === 'archived' || chip.type === 'all') {
                        
                        if (wasActive) {
                            try { this.showLoadingOverlay(); } catch (e) {}
                            try {
                                try { this.currentCategoryFilter = null; } catch (e) {}
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
                                        await this.loadCards(true);
                                    } else {
                                        await this.loadCards(false);
                                    }

                                    try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
                                    try { this.animateCardsEntrance({ duration: 300, offset: 28 }); } catch (e) {}
                                } finally {
                                    this._isViewSwitch = false;
                                }
                            } finally {
                                try { this.hideLoadingOverlay(300); } catch (e) {}
                            }
                            return;
                        }

                        btn.addClass('active');
                        btn.style.backgroundColor = 'var(--background-modifier-hover)';
                        btn.style.color = 'var(--text-normal)';
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
                                    await this.loadCards(true);
                                } else {
                                    await this.loadCards(false);
                                }
                            } finally {
                                this._isViewSwitch = false;
                            }

                            try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}

                            try { this.animateCardsEntrance({ duration: 300, offset: 28 }); } catch (e) {}
                        } finally {
                            try { this.hideLoadingOverlay(300); } catch (e) {}
                        }
                    } else if (chip.type === 'category') {
                        
                        const catId = String(chip.value || '').toLowerCase();
                        if (wasActive) {
                            
                            this.currentCategoryFilter = null;
                            
                            filterGroup.querySelectorAll('.card-filter-btn').forEach(b => { b.removeClass('active'); b.style.backgroundColor = 'var(--background-primary)'; b.style.color = 'var(--text-muted)'; });
                            this.applyFilters();
                            return;
                        }

                        this.currentCategoryFilter = catId;
                        btn.addClass('active');
                        btn.style.backgroundColor = 'var(--background-modifier-hover)';
                        btn.style.color = 'var(--text-normal)';
                        
                        // If the last load showed archived-only cards, reload the non-archived set !
                        try {
                            if (this._lastLoadArchived) {
                                await this.loadCards(false);
                            }
                        } catch (e) {}

                        this.applyFilters();
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
                const activeBtn = this.containerEl.querySelector('.card-filter-btn.active');
                const activeText = activeBtn ? activeBtn.textContent.toLowerCase() : 'all';
                const showArchived = activeText === 'archived';

                await this.loadCards(showArchived);
                try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}

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
                { key: 'alpha', label: 'Sort A → Z' }
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
                                try { console.log('sidecards: calling applySort (sort menu selection)', { from: currentMode, to: newMode }); } catch (e) {}
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
                                console.log('sidecards: calling applySort (toggle sort direction)', { 
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

        const addButton = buttonContainer.createEl('button');
        addButton.textContent = 'Add Card';
        addButton.addClass('mod-cta');
        addButton.style.marginLeft = 'auto';
        addButton.addEventListener('click', () => {
            this.addCardFromInput(input);
        });

        const clearButton = buttonContainer.createEl('button');
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

            cardData.notePath = filePath;
            await this.saveCards();

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
        const card = this.cardsContainer.createDiv();
        card.addClass('card-sidebar-card');
        card.style.position = 'relative';
        card.style.width = '100%';

        const cardColor = options.color || 'var(--card-color-1)';
        this.applyCardColorToElement(card, cardColor);
        card.setAttribute('draggable', 'true');

        const contentEl = card.createDiv();
        contentEl.addClass('card-content');
        contentEl.textContent = content;
        contentEl.setAttribute('contenteditable', 'true');

        contentEl.addEventListener('blur', () => {
            
            try {
                const text = contentEl.innerText != null ? contentEl.innerText : contentEl.textContent;
                this.updateCardContent(card, text);
            } catch (e) {
                
                this.updateCardContent(card, contentEl.innerHTML);
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

        const rightSection = footer.createDiv();
        rightSection.addClass('card-footer-right');

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showCardContextMenu(card, e);
        });

        const id = options.id || Date.now().toString();
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
            notePath: options.notePath || null
        };
        card.dataset.id = cardData.id;
        if (cardData.pinned) {
            try {
                if (this.cardsContainer && this.cardsContainer.firstChild) this.cardsContainer.insertBefore(card, this.cardsContainer.firstChild);
            } catch (e) { }
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
                                        console.debug('sidecards: modify (pin indicator) ->', file.path);
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

        return cardData;
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
            this.reindexCardsFromDOM();
        });

        if (!this._dragListenersAttached) {
            this.cardsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = this.getDragAfterElement(this.cardsContainer, e.clientY);
                const dragging = this.cardsContainer.querySelector('.dragging');
                if (!dragging) return;
                if (afterElement == null) {
                    this.cardsContainer.appendChild(dragging);
                } else {
                    this.cardsContainer.insertBefore(dragging, afterElement);
                }
            });

            this.cardsContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                this.reindexCardsFromDOM();
            });

            this._dragListenersAttached = true;
        }
    }

    reindexCardsFromDOM() {
        try { console.log('sidecards: reindexCardsFromDOM start', { settingsSortMode: this.plugin && this.plugin.settings ? this.plugin.settings.sortMode : null }); } catch (e) {}
        
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

        try { console.log('sidecards: reindexCardsFromDOM -> saving unified path order', { 
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

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.card-sidebar-card:not(.dragging)')];
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
            console.log("=== APPLYSORT START ===");
            console.log("Previous mode:", previousMode);
            console.log("New mode:", mode);
            console.log("Ascending:", ascending);
            
            // Load state check
            if (this._applySortLoadInProgress) {
                if (!this._applySortLoadSeen) {
                    this._applySortLoadSeen = true;
                    console.log('sidecards: applySort allowing first call during load');
                } else {
                    console.log('sidecards: applySort suppressed during load (duplicate)');
                    return;
                }
            }

            // Handle mode transition
            if (previousMode === 'manual' && mode !== 'manual') {
                console.log("Switching FROM manual mode - saving current order");
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
                    console.log("Restoring universal manual order");
                    
                    // Create new array maintaining saved order for current view
                    const newCardOrder = [];
                    const unmatchedCards = [...this.cards];
                    
                    // Debug manual order path matching
                    try {
                        console.log("=== Manual Order Path Matching Debug ===");
                        console.log("Manual order paths:", universalOrder);
                        console.log("Current cards:", unmatchedCards);
                        console.log("New card order:", newCardOrder);
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
                                console.log("Path", path, "matched card:", newCardOrder[newCardOrder.length - 1]);
                            } catch (e) {}
                        } else {
                            try {
                                console.log("⚠️ No card found for path:", path);
                            } catch (e) {}
                        }
                    });
                    
                    // Add any remaining cards in current view that weren't in universal order
                    if (unmatchedCards.length > 0) {
                        try {
                            console.log("Unmatched cards:", unmatchedCards);
                        } catch (e) {}
                        newCardOrder.push(...unmatchedCards);
                    }
                    
                    try {
                        console.log("================================");
                    } catch (e) {}
                    
                    // Update current view's cards while preserving universal order
                    this.cards = newCardOrder;
                    
                    // Only update universal order if this wasn't a view switch
                    if (!this._isViewSwitch) {
                        this._universalCardOrder = universalOrder;
                    }
                    
                    console.log("Manual order restored -", newCardOrder.length, "matched cards,", unmatchedCards.length, "new cards");
                } else {
                    // No saved order - initialize universal order
                    console.log("Initializing universal manual order");
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
            console.log("=== AFTER APPLYSORT ===");
            console.log("Final card count:", this.cards.length);
            console.log("Final manual order paths:", this.plugin?.settings?.manualOrder?.length || 0);
            console.log("Final card IDs:", this.cards.map(c => c.id));
            console.log("Final DOM card IDs:", Array.from(this.cardsContainer?.children || [])
                .filter(el => el.classList.contains('card-sidebar-card'))
                .map(el => el.dataset?.id));
            console.log("=======================");

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
                            console.debug('sidecards: modify (updateCardContent preserve frontmatter) ->', file.path);
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
                            console.debug('sidecards: modify (updateCardContent fallback write) ->', file.path);
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
    }

    debugManualOrderMatching(newCardOrder, currentCards, manualOrder) {
        console.log("=== Manual Order Path Matching Debug ===");
        console.log("Manual order paths:", manualOrder);
        console.log("Current cards:", currentCards.map(c => ({ id: c.id, path: c.notePath })));
        console.log("New card order:", newCardOrder.map(c => ({ id: c.id, path: c.notePath })));
        
        // Debug path matching
        manualOrder.forEach((path, index) => {
            const matchedCard = currentCards.find(c => c.notePath === path);
            if (matchedCard) {
                console.log(`Path ${path} matched card:`, { id: matchedCard.id, path: matchedCard.notePath });
            } else {
                console.log(`⚠️ No card found for path: ${path}`);
            }
        });
        
        // Debug unmatched cards
        const unmatchedCards = currentCards.filter(c => !manualOrder.includes(c.notePath));
        if (unmatchedCards.length > 0) {
            console.log("Unmatched cards:", unmatchedCards.map(c => ({ id: c.id, path: c.notePath })));
        }
        
        console.log("================================");
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
            const startTime = performance.now();
            console.log("🔍 Filter Application Started", {
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
                console.log("📌 Manual sort mode active - using universal order", {
                    orderLength: universalManualOrder.length,
                    samplePaths: universalManualOrder.slice(0, 3)
                });
            }

            // First collect all visible cards
            const visibleCards = [];
            const q = (this.activeFilters && this.activeFilters.query) ? String(this.activeFilters.query).trim().toLowerCase() : '';
            const tags = (this.activeFilters && Array.isArray(this.activeFilters.tags)) ? this.activeFilters.tags.slice() : [];
            const showPinnedOnly = !!(this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly);
            const catFilter = (this.currentCategoryFilter || null);
            
            (this.cards || []).forEach(c => {
                try {
                    if (!c || !c.element) return;
                    let visible = true;
                    const filterChecks = {
                        pinCheck: true,
                        tagCheck: true,
                        searchCheck: true,
                        categoryCheck: true
                    };

                    // Pin Check
                    if (showPinnedOnly && !c.pinned) {
                        filterChecks.pinCheck = false;
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

                            console.log("🏷️ Category Check", {
                                cardId: c.id,
                                filterCategory: filterNorm,
                                cardCategory: cardCat,
                                cardContent: c.content.slice(0, 30) + "..."
                            });

                            // Direct match (covers id == id or label == label if stored that way)
                            if (cardCat === filterNorm) {
                                catMatch = true;
                                console.log("✅ Direct category match");
                            } else {
                                // Be tolerant: allow matching id<->label across settings
                                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                                try {
                                    const byId = cats.find(x => String(x.id || '').toLowerCase() === filterNorm);
                                    if (byId && String(byId.label || '').toLowerCase() === cardCat) {
                                        catMatch = true;
                                        console.log("✅ Category matched by ID mapping");
                                    }
                                } catch (e) {}
                                try {
                                    const byLabel = cats.find(x => String(x.label || '').toLowerCase() === filterNorm);
                                    if (byLabel && String(byLabel.id || '').toLowerCase() === cardCat) {
                                        catMatch = true;
                                        console.log("✅ Category matched by label mapping");
                                    }
                                } catch (e) {}
                            }

                            if (!catMatch) {
                                filterChecks.categoryCheck = false;
                                visible = false;
                                console.log("❌ No category match found");
                            }
                        }
                    } catch (e) {
                        console.error("Error in category matching:", e);
                    }
                    
                    // Log filter results for each card
                    console.log("🔍 Card Filter Results", {
                        cardId: c.id,
                        content: c.content.slice(0, 30) + "...",
                        isVisible: visible,
                        checks: filterChecks,
                        category: c.category,
                        tags: c.tags,
                        pinned: c.pinned
                    });

                    if (visible) {
                        visibleCards.push(c);
                    }
                    c.element.style.display = 'none'; // Hide all initially
                } catch (e) { }
            });

            // Sort visible cards if in manual mode
            if (isManualSort && visibleCards.length > 0) {
                console.log("🔄 Sorting filtered cards by universal manual order");
                
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
                console.log("✅ Sorted cards:", visibleCards.map(c => ({
                    id: c.id,
                    path: c.notePath,
                    orderIndex: c.notePath ? universalManualOrder.indexOf(c.notePath) : -1,
                    pinned: !!c.pinned
                })));
            }

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
            console.log("✨ Filter Application Complete", {
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

            if (!skipAnimation) {
                try { this.animateCardsEntrance(); } catch (e) { }
            }
        } catch (err) {
            console.error('Error in applyFilters:', err);
            console.error('Stack trace:', err.stack);
        }
    }

    // Dedicated function for full reload when needed
    async reloadCards() {
        console.log("🔄 Performing full card reload");
        await this.loadCards(this._lastLoadArchived || false);
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
                if (this.activeFilters && Array.isArray(this.activeFilters.tags) && this.activeFilters.tags.length > 0) {
                    this.activeFilters.tags = [];
                    if (typeof this.updateSearchChips === 'function') this.updateSearchChips();
                }
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
                        if (cardData.element) this.applyCardColorToElement(cardData.element, cardData.color);
                    }
                } catch (e) {
                }
                
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
                                    console.debug('sidecards: modify (pin toggle) ->', file.path);
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
                { label: 'Add to Tomorrow', value: 'tomorrow', icon: 'calendar-days' },
                { label: 'Add to This Week', value: 'this_week', icon: 'calendar-range' }
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

                                                        console.debug('sidecards: modify (color change) ->', file.path);
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
                        if (cat && cat.showInMenu !== false) {
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
                                                        console.debug('sidecards: modify (add category) ->', file.path);
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
                                                            console.debug('sidecards: modify (remove category) ->', file.path);
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

        // Add/Edit Tags
        menu.addItem((item) => {
            item.setTitle('Add Tags')
                .setIcon('tag')
                .onClick(() => {
                    this.showTagsModal(cardData);
                });
        });

        menu.addSeparator();

        // Destructive actions at the bottom
        menu.addItem((item) => {
            item.setTitle('Delete Card')
                .setIcon('trash')
                .onClick(async () => {
                    console.log("🔴 DELETION STARTED - Card data:", { id: cardData.id, notePath: cardData.notePath });
                    if (cardData.notePath) {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                            if (file) {
                                console.log("📝 Attempting to delete note file:", file.path);
                                await this.app.vault.delete(file);
                                console.log("✅ Note file deleted successfully:", file.path);
                            }
                        } catch (err) {
                            console.error('Error deleting note:', err);
                        }
                    }
                    
                    console.log("🗑️ Removing card from DOM and internal state");
                    card.remove();
                    this.cards = this.cards.filter(c => c !== cardData);
                    await this.saveCards();
                    console.log("💾 Card state saved, remaining cards:", this.cards.length);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Archive Card')
                .setIcon('archive')
                .onClick(async () => {
                    try {
                        // Toggle archive state and write to frontmatter (centralized)
                        console.log('Archiving card', cardData.id, 'notePath:', cardData.notePath);
                        await this.toggleArchive(cardData, true);

                        // Remove from UI immediately
                        try { card.remove(); } catch (e) {}

                        new Notice('Card archived');
                    } catch (err) {
                        console.error('Error archiving card:', err);
                        new Notice('Error archiving card (see console)');
                    }
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

                        console.debug('sidecards: modify (showTagsModal) ->', file.path);
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

            modal.close();
        });
        
        modal.open();
    }

    // Convert an in-memory card to a persistent Markdown note with frontmatter metadata
    async createNoteFromCard(cardData) {
        console.log("🆕 createNoteFromCard called", { cardData: { id: cardData.id, content: cardData.content.slice(0, 50) + "..." } });
        console.log("📍 Creation stack trace:", new Error().stack);
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
                        console.log("🚫 Preventing creation of note similar to recently deleted file:", baseFileName);
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
            
            console.log("📄 About to create file", { filePath, contentPreview: noteContent.slice(0, 100) + "..." });
            const file = await this.app.vault.create(filePath, noteContent);
            console.log("✅ File created successfully:", file.path);
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

    async loadCards(showArchived = false) {
        console.log("📥 loadCards called with showArchived:", showArchived, "Stack trace:", new Error().stack);
        try {
            this._bulkLoading = true;
            try { if (this.cardsContainer) this.cardsContainer.style.visibility = 'hidden'; } catch (e) {}
            if (this.cardsContainer) this.cardsContainer.empty();
        } catch (e) {}

        try { this._lastLoadArchived = !!showArchived; } catch (e) {}
        this.cards = [];
        const folder = this.plugin.settings.storageFolder;

        // CRITICAL FIX: Initialize universal order before any card loading
        if (!this._universalCardOrder || this._universalCardOrder.length === 0) {
            this._universalCardOrder = this.plugin.settings.manualOrder || [];
            console.log("🔄 Initialized universal card order from settings:", {
                orderLength: this._universalCardOrder.length,
                samplePaths: this._universalCardOrder.slice(0, 3)
            });
        }

        if (folder && folder !== '/') {
            try {
                if (this.plugin._importedFromFolderOnLoad && this.plugin.settings.cards && this.plugin.settings.cards.length > 0) {
                    const saved = this.plugin.settings.cards || [];
                    for (const savedCard of saved) {
                        try {
                            let archivedFromNote = savedCard.archived || false;
                            if (savedCard.notePath) {
                                try {
                                    const f = this.app.vault.getAbstractFileByPath(savedCard.notePath);
                                    if (f) {
                                        const txt = await this.app.vault.read(f);
                                        const m2 = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                        if (m2 && m2[1]) {
                                            const fm_ = m2[1];
                                            if (/^\s*archived:\s*true$/mi.test(fm_)) archivedFromNote = true;
                                            else if (/^\s*archived:\s*false$/mi.test(fm_)) archivedFromNote = false;
                                        }
                                    }
                                } catch (e) { }
                            }

                            try {
                                if (Boolean(archivedFromNote) !== Boolean(showArchived)) {
                                    continue;
                                }
                            } catch (e) {}

                            const createdCard = this.createCard(savedCard.content || '', {
                                id: savedCard.id,
                                color: savedCard.color,
                                tags: savedCard.tags,
                                category: savedCard.category || null,
                                created: savedCard.created,
                                archived: archivedFromNote,
                                pinned: savedCard.pinned || false,
                                notePath: savedCard.notePath
                            });
                            try {
                                if (createdCard && createdCard.archived && !showArchived && createdCard.element) {
                                    createdCard.element.style.display = 'none';
                                }
                            } catch (e) {}
                        } catch (e) {
                            console.error('Error creating card from savedCard (folder block):', e);
                        }
                    }
                } else {
                    await this.importNotesFromFolder(folder, true, showArchived);
                }
            } catch (e) {
                console.error('Error importing notes from storage folder during load:', e);
            }

            // Apply saved sorting preference (mode + direction) so order persists across reloads
            try {
                const mode = (this.plugin && this.plugin.settings && this.plugin.settings.sortMode) || 'manual';
                const asc = (this.plugin && this.plugin.settings && typeof this.plugin.settings.sortAscending !== 'undefined') ? !!this.plugin.settings.sortAscending : true;
                console.log('sidecards: calling applySort (loadCards folder branch)', { mode, asc, universalOrder: this._universalCardOrder?.length });
                await this.applySort(mode, asc);
            } catch (e) {
                console.error('Error applying saved sort after folder-load:', e);
            }

            this.refreshAllCardTimestamps();
            try { this.animateCardsEntrance(); } catch (e) {}
            try { if (this.cardsContainer) this.cardsContainer.style.visibility = ''; } catch (e) {}
            try { this._applySortLoadInProgress = false; } catch (e) {}
            this._bulkLoading = false;
            return;
        }

        const saved = this.plugin.settings.cards || [];
        if (saved && saved.length > 0) {
            for (const savedCard of saved) {
                try {
                    let pinnedFromNote = savedCard.pinned || false;
                    let archivedFromNote = savedCard.archived || false;
                    if (savedCard.notePath) {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(savedCard.notePath);
                            if (file) {
                                const text = await this.app.vault.read(file);
                                const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                if (m && m[1]) {
                                    const fm = m[1];
                                    if (/^\s*pinned\s*:\s*true$/mi.test(fm)) pinnedFromNote = true;
                                    if (/^\s*pinned\s*:\s*false$/mi.test(fm)) pinnedFromNote = false;
                                    if (/^\s*archived\s*:\s*true$/mi.test(fm)) archivedFromNote = true;
                                    if (/^\s*archived\s*:\s*false$/mi.test(fm)) archivedFromNote = false;
                                }
                            }
                        } catch (e) { }
                    }

                    // Only create cards that match the requested archived filter
                    try {
                        if (Boolean(archivedFromNote) !== Boolean(showArchived)) {
                            continue;
                        }
                    } catch (e) {}

                    const createdCard = this.createCard(savedCard.content || '', {
                        id: savedCard.id,
                        color: savedCard.color,
                        tags: savedCard.tags,
                        category: savedCard.category || null,
                        created: savedCard.created,
                        archived: archivedFromNote,
                        pinned: pinnedFromNote || false,
                        notePath: savedCard.notePath
                    });
                    try {
                        if (createdCard && createdCard.archived && !showArchived && createdCard.element) {
                            createdCard.element.style.display = 'none';
                        }
                    } catch (e) {}
                } catch (err) { console.error('Error loading saved card', err); }
            }
        } else {
            console.log("⚠️ No existing cards found - checking if sample cards should be created");
            const sampleCards = [
                "Welcome to Card Sidebar! This is your quick note-taking space.",
                "Right-click on cards to change colors, manage categories, or add tags.",
                "Use the input box below to add new cards quickly.",
                "Drag cards to reorder them."
            ];

            console.log("🎴 Creating sample cards because no cards exist");
            sampleCards.forEach((card, index) => {
                const colorVar = `var(--card-color-${(index % 10) + 1})`;
                this.createCard(card, { color: colorVar });
            });
        }

        // CRITICAL FIX: Ensure manual order is applied consistently
        try {
            console.log('sidecards: calling applySort (loadCards end)', { 
                mode: this.plugin.settings.sortMode || 'manual', 
                ascending: this.plugin.settings.sortAscending != null ? this.plugin.settings.sortAscending : true,
                universalOrder: this._universalCardOrder?.length 
            });
            await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending != null ? this.plugin.settings.sortAscending : true);
        } catch (e) { 
            console.error('Error in final applySort call:', e);
        }
        
        this.refreshAllCardTimestamps();
        try { this.animateCardsEntrance(); } catch (e) {}
        // Reveal container now that only filtered cards will be visible
        try { if (this.cardsContainer) this.cardsContainer.style.visibility = ''; } catch (e) {}
        try { this._applySortLoadInProgress = false; } catch (e) {}
        this._bulkLoading = false;
    }

    async importNotesFromFolder(folder, silent = false, showArchived = false) {
        console.log("📁 importNotesFromFolder called", { folder, silent, showArchived, stack: new Error().stack });
        if (!folder) return 0;
        try {
            const allFiles = this.app.vault.getAllLoadedFiles();
            const prefix = folder.endsWith('/') ? folder : folder + '/';
            const mdFiles = allFiles.filter(f => {
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
                            console.log("🚫 Skipping import of recently deleted file:", f.path);
                            return false;
                        }
                    }
                }
                
                return true;
            });
            console.log("📄 Found markdown files in folder:", mdFiles.map(f => f.path));

            

            if (!mdFiles || mdFiles.length === 0) {
                if (!silent) new Notice('No markdown files found in selected folder');
                return 0;
            }

            let imported = 0;
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
                        if (/^\s*archived:\s*true$/mi.test(fm)) archived = true;
                        
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
                        if (Boolean(archived) !== Boolean(showArchived)) {
                            continue;
                        }
                    } catch (e) {}

                    const cardData = this.createCard(content, {
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
                        color: parsedColorVar || `var(--card-color-1)`,
                        tags,
                        created,
                        archived,
                        notePath: path,
                        pinned: pinned || false,
                        category: parsedCategoryId || null
                    });

                    createdSerial.push({
                        id: cardData.id,
                        content: cardData.content,
                        color: cardData.color,
                        tags: cardData.tags || [],
                        category: cardData.category || null,
                        created: cardData.created,
                        archived: cardData.archived || false,
                        pinned: cardData.pinned || false,
                        notePath: cardData.notePath || null
                    });

                    imported++;
                } catch (err) {
                    console.error('Error importing file', file.path, err);
                }
            }

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
                notePath: c.notePath || null
            }));

            this.plugin.settings.cards = serial;
            await this.plugin.saveSettings();
        } catch (err) {
            console.error('Error saving cards:', err);
        }
    }

    async onClose() {
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
                            new Notice('Imported notes from storage folder');
                        } catch (e) {
                            console.error('Error importing notes from selected storage folder:', e);
                            new Notice('Error importing notes from storage folder (see console)');
                        }
                    } else {
                        await new Promise(r => setTimeout(r, 300));
                        const leaf2 = this.app.workspace.getLeavesOfType('card-sidebar')[0];
                        const view2 = leaf2?.view;
                        if (view2 && typeof view2.importNotesFromFolder === 'function') {
                            try {
                                await view2.importNotesFromFolder(value, true);
                                new Notice('Imported notes from storage folder');
                            } catch (e) {
                                console.error('Error importing notes from selected storage folder:', e);
                                new Notice('Error importing notes from storage folder (see console)');
                            }
                        } else {
                            new Notice('Storage folder set!');
                        }
                    }
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

            (function() {
                let wasMouseDown = false;

                try {
                    cb.inputEl.addEventListener('mousedown', () => { wasMouseDown = true; });

                    cb.inputEl.addEventListener('focus', (e) => {
                        if (!wasMouseDown) {
                            setTimeout(() => { try { cb.inputEl.blur(); } catch (err) {} }, 0);
                        }
                        wasMouseDown = false;
                    }, true);
                } catch (e) {
                    console.error('Error setting folder input focus handlers:', e);
                }
            })();
        });

    containerEl.createEl('h3', { text: 'Colors' });
    
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

    colorVars.forEach(color => {
        new Setting(containerEl)
            .setName(color.name)
            .addColorPicker(cp => cp
                .setValue(this.plugin.settings[color.key] || color.default)
                .onChange(async (value) => {
                    this.plugin.settings[color.key] = value;
                    await this.plugin.saveSettings();
                    this.updateCSSVariables();
                }));
        
        const idx = Number(color.key.replace('color', '')) - 1;
        new Setting(containerEl)
            .setName(`${color.name} Label`)
            .setDesc('A short name used when writing this color into note frontmatter')
            .addText(txt => txt
                .setPlaceholder('e.g. Urgent')
                .setValue((this.plugin.settings.colorNames && this.plugin.settings.colorNames[idx]) || color.name)
                .onChange(async (v) => {
                    if (!this.plugin.settings.colorNames) this.plugin.settings.colorNames = [];
                    this.plugin.settings.colorNames[idx] = v || '';
                    await this.plugin.saveSettings();
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
                    view.cards.forEach(c => view.applyCardColorToElement(c.element, c.color));
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
                    view.cards.forEach(c => view.applyCardColorToElement(c.element, c.color));
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
                    view.cards.forEach(c => view.applyCardColorToElement(c.element, c.color));
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

        list.forEach((c, idx) => {
            const row = catsContainer.createDiv();
            row.addClass('category-row');
            
            try { row.dataset.catId = c.id || String(idx); } catch (e) {}
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            
            row.style.margin = '6px 0';
            
            
            const handle = row.createEl('button');
            handle.type = 'button';
            handle.className = 'category-drag-handle';
            handle.title = 'Drag to reorder';
            
            try {
                setIcon(handle, 'menu');
            } catch (e) {
                handle.textContent = '☰';
            }
            
            handle.style.cursor = 'grab';
            handle.style.border = 'none';
            handle.style.background = 'transparent';
            handle.style.fontSize = '14px';
            handle.style.padding = '4px';
            handle.style.marginRight = '0px';
            handle.style.display = 'inline-flex';
            handle.draggable = true;
            handle.color = 'var(--text-muted)';

            handle.addEventListener('dragstart', (e) => {
                try {
                    row.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', row.dataset.catId || '');
                } catch (err) {}
            });

            handle.addEventListener('dragend', async (e) => {
                try {
                    row.classList.remove('dragging');
                    
                    const orderedIds = Array.from(catsContainer.querySelectorAll('.category-row')).map(r => r.dataset.catId);
                    const newCats = (orderedIds || []).map(id => (this.plugin.settings.customCategories || []).find(x => String(x.id) === String(id))).filter(Boolean);
                    this.plugin.settings.customCategories = newCats;
                    await this.plugin.saveSettings();
                    
                    renderCategories();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        try {
                            const main = view.containerEl.querySelector('.card-sidebar-main');
                            const old = main?.querySelector('.card-sidebar-header');
                            if (old) old.remove();
                            if (main) view.createHeader(main);
                        } catch (e) { }
                    }
                } catch (err) { console.error('Error finalizing category reorder:', err); }
            });

            const txt = row.createEl('input');
            txt.type = 'text';
            txt.value = c.label || '';
            txt.style.flex = '1';
            txt.addEventListener('change', async (e) => {
                this.plugin.settings.customCategories[idx].label = e.target.value || '';
                await this.plugin.saveSettings();
                try { renderCategories(); } catch (e) {}
            });

            const chk = row.createEl('input');
            chk.type = 'checkbox';
            chk.checked = c.showInMenu !== false;
            chk.title = 'Show in context menu';
            chk.addEventListener('change', async (e) => {
                this.plugin.settings.customCategories[idx].showInMenu = !!e.target.checked;
                await this.plugin.saveSettings();
                try { renderCategories(); } catch (e) {}
            });

            const del = row.createEl('button');
            del.textContent = 'Remove';
            del.addClass('mod-warning');
            del.addEventListener('click', async () => {
                this.plugin.settings.customCategories.splice(idx, 1);
                await this.plugin.saveSettings();
                renderCategories();
            });

            
            row.appendChild(handle);
            row.appendChild(txt);
            row.appendChild(chk);
            row.appendChild(del);
    });

        
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
            } catch (err) {}
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
    async onload() {
        await this.loadSettings();
    try { console.log('sidecards: onload loaded settings', { manualOrder: this.settings && this.settings.manualOrder, sortMode: this.settings && this.settings.sortMode, sortAscending: this.settings && this.settings.sortAscending }); } catch (e) {}
    try { this._applySortLoadInProgress = true; this._applySortLoadSeen = false; } catch (e) {}

            // Track recently deleted files to prevent auto-recreation
            this._recentlyDeletedPaths = new Set();
            
            // Register file change watcher
            this.registerEvent(
                this.app.vault.on('delete', (file) => {
                    console.log("📁 File delete event detected:", file.path);
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
                    console.log("📝 File modify event detected:", file.path);
                })
            );
            
            this.registerEvent(
                this.app.vault.on('create', async (file) => {
                    console.log("➕ File create event detected:", file.path);
                    
                    // Skip if this is a user-initiated create
                    if (this._userInitiatedCreate) {
                        console.log("✨ Allowing user-initiated file creation:", file.path);
                        return;
                    }
                    
                    // Check if this is an auto-recreation of a recently deleted file
                    const normalizedPath = file.path.toLowerCase();
                    const baseName = file.path.split('/').pop().toLowerCase();
                    
                    // Check if any recently deleted file had a similar name
                    for (const deletedPath of this._recentlyDeletedPaths) {
                        const deletedBaseName = deletedPath.split('/').pop();
                        if (deletedBaseName.replace(/\s+\d+/g, '') === baseName.replace(/\s+\d+/g, '')) {
                            console.log("🚫 Preventing auto-recreation of recently deleted file:", file.path);
                            
                            // Add a small delay to avoid race conditions
                            await new Promise(resolve => setTimeout(resolve, 50));
                            
                            // Double check file still exists before trying to delete
                            try {
                                const exists = await this.app.vault.adapter.exists(file.path);
                                if (exists) {
                                    await this.app.vault.delete(file);
                                    console.log("✅ Successfully prevented auto-recreation");
                                }
                            } catch (e) {
                                console.log("ℹ️ File already removed or inaccessible");
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
            console.warn('Failed to load moment.js via CDN:', e);
        }
    
        if (typeof window.moment === 'undefined' && typeof moment !== 'undefined') {
            window.moment = moment;
        }
        if (window.moment) {
            this.momentAvailable = true;
            console.log('Moment.js loaded successfully');
        } else {
            this.momentAvailable = false;
            console.warn('Moment.js not available, falling back to simple formatter.');
        }

    
        this.registerView(
            'card-sidebar',
            (leaf) => new CardSidebarView(leaf, this)
        );

    
        if (this.settings.storageFolder && this.settings.storageFolder !== '/') {
            console.log("📂 Checking storage folder for auto-import:", this.settings.storageFolder);
            if (!this.settings.cards || this.settings.cards.length === 0) {
                console.log("🔄 No cards in settings, will attempt auto-import when layout is ready");
                this.app.workspace.onLayoutReady(async () => {
                    try {
                        console.log("🔃 Layout ready - starting auto-import from folder");
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
                                try { console.log('sidecards: reset-sorting command calling applySort on view', new Error().stack); } catch (e) {}
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
                this.activateView();
            });
        }

        console.log('Card Sidebar plugin loaded successfully');
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
                        console.log('sidecards: Midnight detected, running date transition...');
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
            cards: []
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
                                            console.debug('sidecards: modify (date change category) ->', file.path);
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
                                try { view.loadCards(); } catch (e) {}
                            }
                            if (view && typeof view.applyFilters === 'function') {
                                try { view.applyFilters(); } catch (e) {}
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
            console.error('Error in applyGlobalStyles:', e);
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

                        const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                        if (createdMatch) created = createdMatch[1].trim();
                        if (/^\s*archived:\s*true$/mi.test(fm)) archived = true;

                        
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
                this.settings.cards = createdSerial;
                await this.saveSettings();
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
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: 'card-sidebar',
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        console.log('Unloading Card Sidebar plugin');
        try {
            if (this._dateCheckInterval) {
                clearInterval(this._dateCheckInterval);
                this._dateCheckInterval = null;
            }
        } catch (e) {}
    }
}

module.exports = CardSidebarPlugin;
