const { Plugin, ItemView, Setting, PluginSettingTab, Modal, Menu, Notice, setIcon, MarkdownView, MarkdownRenderer } = require('obsidian');

// Modal for quick card creation with filter picker
class QuickCardWithFilterModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    getAvailableFilters() {
        const filters = [
            { type: 'all', label: 'All', value: 'all' }
        ];

        // Add time-based filters if not disabled
        const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
        if (showTimeBasedChips) {
            const timeBasedFilters = [
                { type: 'category', label: 'Today', value: 'today' },
                { type: 'category', label: 'Tomorrow', value: 'tomorrow' }
            ];
            filters.push(...timeBasedFilters);
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
        const title = contentEl.createEl('h2', {text: 'Quick Card Add', cls: 'quick-card-modal-title'});
        
        // Card content section
        const contentHeading = contentEl.createEl('h3', {text: 'Card Content', cls: 'quick-card-section-heading'});
        
        const textarea = contentEl.createEl('textarea', {
            placeholder: 'Enter your card content here... (e.g., "@today Make coffee" or "#work Important task")',
            cls: 'quick-card-textarea'
        });
        textarea.focus();
        
        // Color selection section
        const colorHeading = contentEl.createEl('h3', {text: 'Color', cls: 'quick-card-section-heading'});
        
        const colorContainer = contentEl.createDiv({cls: 'color-container'});
        
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
            const swatch = colorContainer.createDiv({cls: 'color-swatch'});
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
        const tagsHeading = contentEl.createEl('h3', {text: 'Tags', cls: 'quick-card-section-heading'});
        
        const tagsWrapper = contentEl.createDiv({cls: 'tags-wrapper'});
        
        const tagsInput = tagsWrapper.createEl('input', {
            placeholder: 'Enter tags separated by commas (e.g., work, urgent)',
            cls: 'tags-input'
        });
        
        // Add tag autocomplete UI
        const tagsAutocompleteContainer = tagsWrapper.createDiv({cls: 'tags-autocomplete-container'});
        tagsAutocompleteContainer.addClass('tag-autocomplete');
        
        const getRecentTags = () => {
            try {
                const tags = new Set();
                const allCards = this.plugin.settings.cards || [];
                allCards.forEach(c => {
                    if (c.tags && Array.isArray(c.tags)) {
                        c.tags.forEach(t => tags.add(String(t).toLowerCase()));
                    }
                });
                return Array.from(tags).sort();
            } catch (e) { return []; }
        };
        
        let tagsAutocompleteSelectedIndex = -1;
        const updateTagsAutocomplete = () => {
            try {
                const cursorPos = tagsInput.selectionStart;
                const textBeforeCursor = tagsInput.value.substring(0, cursorPos);
                const lastCommaIdx = Math.max(
                    textBeforeCursor.lastIndexOf(','),
                    textBeforeCursor.lastIndexOf(' ')
                );
                
                const currentWord = (lastCommaIdx === -1 ? textBeforeCursor : textBeforeCursor.substring(lastCommaIdx + 1)).trim().toLowerCase();
                
                if (currentWord.length < 1) {
                    tagsAutocompleteContainer.style.display = 'none';
                    return;
                }
                
                const allTags = getRecentTags();
                const suggestions = allTags.filter(t => t.startsWith(currentWord) && t !== currentWord).slice(0, 8);
                
                if (suggestions.length === 0) {
                    tagsAutocompleteContainer.style.display = 'none';
                    return;
                }
                
                tagsAutocompleteContainer.empty();
                tagsAutocompleteSelectedIndex = -1;
                suggestions.forEach((tag, idx) => {
                    const item = tagsAutocompleteContainer.createDiv({cls: 'tags-autocomplete-item'});
                    item.textContent = tag;
                    item.dataset.index = String(idx);
                    
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--background-modifier-hover)';
                        tagsAutocompleteSelectedIndex = idx;
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = '';
                    });
                    
                    item.addEventListener('click', () => {
                        const before = tagsInput.value.substring(0, lastCommaIdx === -1 ? 0 : lastCommaIdx + 1);
                        const after = tagsInput.value.substring(cursorPos);
                        tagsInput.value = before + (lastCommaIdx === -1 ? '' : ' ') + tag + ', ' + after;
                        tagsInput.selectionStart = tagsInput.selectionEnd = before.length + (lastCommaIdx === -1 ? 0 : 1) + tag.length + 2;
                        tagsInput.focus();
                        updateTagsAutocomplete();
                    });
                });
                
                tagsAutocompleteContainer.style.display = '';
            } catch (e) { }
        };
        
        tagsInput.addEventListener('input', updateTagsAutocomplete);
        tagsInput.addEventListener('keydown', (e) => {
            // Handle up/down arrow keys for tag suggestions
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tagsAutocompleteContainer.style.display !== 'none') {
                e.preventDefault();
                const items = tagsAutocompleteContainer.querySelectorAll('div');
                if (items.length === 0) return;
                
                if (e.key === 'ArrowDown') {
                    tagsAutocompleteSelectedIndex = (tagsAutocompleteSelectedIndex + 1) % items.length;
                } else {
                    tagsAutocompleteSelectedIndex = (tagsAutocompleteSelectedIndex - 1 + items.length) % items.length;
                }
                
                items.forEach((item, idx) => {
                    if (idx === tagsAutocompleteSelectedIndex) {
                        item.style.background = 'var(--background-modifier-hover)';
                    } else {
                        item.style.background = '';
                    }
                });
                
                return;
            }
            
            // Handle Enter to select highlighted tag
            if (e.key === 'Enter' && tagsAutocompleteContainer.style.display !== 'none' && tagsAutocompleteSelectedIndex >= 0) {
                e.preventDefault();
                const items = tagsAutocompleteContainer.querySelectorAll('div');
                const selectedItem = items[tagsAutocompleteSelectedIndex];
                if (selectedItem) {
                    selectedItem.click();
                }
                return;
            }
        });
        
        // Category selection section
        const filterHeading = contentEl.createEl('h3', {text: 'Apply Category', cls: 'filter-heading'});
        
        const select = contentEl.createEl('select', {cls: 'filter-select filter-dropdown'});
        
        this.getAvailableFilters().forEach(filter => {
            const option = select.createEl('option', {
                value: filter.value,
                text: filter.label
            });
            option.dataset.filterType = filter.type;
        });
        
        // Action buttons
        const buttonContainer = contentEl.createEl('div', {cls: 'button-container modal-button-container'});
        
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
            this.createCardAndFilter(textarea.value, select.value, select.selectedOptions[0].dataset.filterType, selectedColor, tagsInput.value);
            this.close();
        });

        // Handle Enter key
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
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
        if (!content.trim()) {
            new Notice('Card content cannot be empty');
            return;
        }

        try {
            // Get first Sidebar view
            const view = this.app.workspace.getLeavesOfType('card-sidebar')?.[0]?.view;
            if (!view) {
                throw new Error('Card sidebar not found');
            }
            
            // Create textarea to use existing addCardFromInput logic
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
                // Reset all category buttons first
                const filterGroup = view.containerEl.querySelector('.category-group');
                if (filterGroup) {
                    filterGroup.querySelectorAll('.card-category-btn').forEach(b => {
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
                view.applyFilters();
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
        
        const mainContainer = container.createDiv({cls: 'card-element-container card-sidebar-main'});

        this.createHeader(mainContainer);
        try { this.createSearchBar(mainContainer); } catch (e) { }

        this.cardsContainer = mainContainer.createDiv({cls: 'cards-container card-sidebar-cards-container'});
        try { 
            this.cardsContainer.style.contentVisibility = 'auto'; 
            this.cardsContainer.style.containIntrinsicSize = '600px'; 
        } catch (e) {}

        this.applyLayoutMode();
        this.createFixedInputBox(mainContainer);

        // Import check
        const folder = this.plugin.settings.storageFolder;
        if (folder && folder !== '/') {
            try {
                await this.plugin.importNotesFromFolderToSettings(folder, true);
                this.plugin._importedFromFolderOnLoad = true;
            } catch (e) {
                console.error('Error importing notes for view on open:', e);
            }
        }

        this.showLoadingOverlay();
        
        // Use requestAnimationFrame to ensure layout is ready
        await new Promise(r => requestAnimationFrame(() => r()));
        await this.loadCards(false);

        // Defer filter application until cards are fully rendered
        this._deferFiltersUntilReady = true;
        this.initializeFilterButtonStates();
        this.hideLoadingOverlay(0);

        // Detect and watch sidebar position
        this.setupPositionDetection();

        // Start timers and observers
        this.setupExpiryTimer();
        this.setupLayoutObservers();
        this.registerVaultEvents();
        this.registerDocumentDrop();
    }

    async loadCards(showArchived = false) {
        if (this._loadInProgress) return;
        this._loadInProgress = true;

        try {
            const container = this.cardsContainer;
            if (!container) return;

            // Use flipAnimateAsync for smooth transitions during reloads/reorders
            await this.flipAnimateAsync(async () => {
                container.empty();
                this.cards = [];
                this._bulkLoading = true;
                this._applySortLoadInProgress = true;
                
                try { container.style.visibility = 'hidden'; } catch (e) {}

                let cardsData = this.plugin.settings.cards || [];
                
                // If no cards exist, show sample cards
                if (cardsData.length === 0) {
                    this.plugin.debugLog("🎴 Creating sample cards because no cards exist");
                    const sampleCards = [
                        "Welcome to Card Sidebar! This is your quick note-taking space.",
                        "Right-click on cards to change colors, manage categories, or add tags.",
                        "Use the input box below to add new cards quickly.",
                        "Drag cards to reorder them."
                    ];
                    sampleCards.forEach((content, index) => {
                        const colorVar = `var(--card-color-${(index % 10) + 1})`;
                        this.createCard(content, { color: colorVar });
                    });
                    // Save sample cards to settings so they persist
                    await this.saveCards();
                } else {
                    // Filter by archived status
                    const filteredData = cardsData.filter(cd => !!cd.archived === !!showArchived);
                    
                    // Sort the data
                    const sortedData = this.getSortedCards(filteredData);
                    
                    // Create card elements
                    for (const data of sortedData) {
                        this.createCard(data.content || '', data);
                    }
                }

                // Batch append and render
                const cardsToRender = [...(this.cards || [])];
                await this.loadCardsPrioritized(cardsToRender, showArchived);
            }, { duration: 350 });

            // Re-attach masonry observers for the new cards
            this.setupMasonryObserver();
            
            this.refreshMasonrySpans();
            this.refreshAllCardTimestamps();
            try { this.animateCardsEntrance(); } catch (e) {}

        } catch (e) {
            console.error('Error in loadCards:', e);
        } finally {
            this._loadInProgress = false;
            this._bulkLoading = false;
            this._applySortLoadInProgress = false;
            try { if (this.cardsContainer) this.cardsContainer.style.visibility = ''; } catch (e) {}
            this.hideLoadingOverlay(200);
        }
    }

    initializeFilterButtonStates() {
        try {
            const openVal = this.plugin.settings.openCategoryOnLoad;
            if (!openVal) return;

            const lower = String(openVal).toLowerCase();
            const btns = this.containerEl.querySelectorAll('.card-category-btn');
            
            if (['all', 'archived'].includes(lower)) {
                this.updateFilterButtonsUI(lower, null);
            } else {
                this.currentCategoryFilter = lower;
                this.updateFilterButtonsUI('category', lower);
            }
        } catch (e) {
            console.error('Error initializing filter button states:', e);
        }
    }

    updateFilterButtonsUI(activeType, activeValue) {
        const btns = this.containerEl.querySelectorAll('.card-category-btn');
        btns.forEach(b => {
            const type = b.dataset.filterType;
            const value = b.dataset.filterValue?.toLowerCase();
            const isActive = (type === activeType && (!activeValue || value === activeValue));
            
            b.toggleClass('active', isActive);
            
            const customBg = b.dataset.customBg;
            const customText = b.dataset.customText;
            
            if (isActive) {
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
                b.style.filter = '';
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
            }
        });
    }

    setupPositionDetection() {
        const detectPosition = () => {
            let position = 'right';
            let current = this.containerEl;
            let depth = 0;
            
            while (current && depth < 10) {
                const className = current.className || '';
                if (className.includes('side-dock-left') || className.includes('mod-left-split')) {
                    position = 'left'; break;
                }
                if (className.includes('workspace-leaf-content') || className.includes('workspace-tabs')) {
                    position = 'tab'; break;
                }
                if (className.includes('side-dock-right') || className.includes('mod-right-split')) {
                    position = 'right'; break;
                }
                current = current.parentElement;
                depth++;
            }
            
            if (position !== this.plugin.settings.sidebarPosition) {
                this.plugin.settings.sidebarPosition = position;
                this.plugin.saveSettings();
            }
            return position;
        };

        detectPosition();

        if (this.containerEl?.parentElement) {
            const observer = new MutationObserver(() => detectPosition());
            observer.observe(this.containerEl.parentElement, { attributes: true, attributeFilter: ['class'] });
            if (this.containerEl.parentElement.parentElement) {
                observer.observe(this.containerEl.parentElement.parentElement, { attributes: true, attributeFilter: ['class'], subtree: true });
            }
            this._positionObserver = observer;
        }
    }

    setupLayoutObservers() {
        if (this.cardsContainer && typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => this.refreshMasonrySpans());
            ro.observe(this.cardsContainer);
            this._layoutResizeObserver = ro;
        }
    }

    registerVaultEvents() {
        this.plugin.registerEvent(this.app.vault.on('modify', async (file) => {
            if (!file?.path) return;
            const flagKey = `_statusModifying_${file.path}`;
            if (this.plugin[flagKey]) return;
            
            // Handle pending tag writes
            const pending = this._pendingTagWrites?.[file.path];
            if (pending) {
                if (Date.now() > pending.expiresAt) {
                    delete this._pendingTagWrites[file.path];
                } else if (!this._reapplyingTags?.[file.path]) {
                    await this.handlePendingTagReapply(file, pending);
                    return;
                }
            }
            
            await this.updateCardFromNotePath(file.path);
        }));
    }

    async handlePendingTagReapply(file, pending) {
        try {
            const text = await this.app.vault.read(file);
            const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            const existing = this.parseTagsFromFrontmatter(fmMatch?.[1] || '');
            const desired = Array.isArray(pending.tags) ? pending.tags.map(t => String(t).trim()).filter(Boolean) : [];
            
            if (existing.length === desired.length && desired.every(t => existing.includes(t))) {
                delete this._pendingTagWrites[file.path];
                return;
            }

            this._reapplyingTags = this._reapplyingTags || {};
            this._reapplyingTags[file.path] = true;
            
            let content = text;
            const tagsBlock = desired.length > 0
                ? 'Tags: [' + desired.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ') + ']'
                : 'Tags: []';

            if (fmMatch) {
                let fm = fmMatch[1];
                let fmLines = fm.split(/\r?\n/);
                const newLines = [];
                for (let i = 0; i < fmLines.length; i++) {
                    const line = fmLines[i];
                    if (/^\s*(Tags|tags)\s*:/i.test(line)) {
                        const rest = line.replace(/^\s*(Tags|tags)\s*:\s*/i, '').trim();
                        if (rest.startsWith('[')) continue;
                        i++;
                        while (i < fmLines.length && /^\s*-\s+/.test(fmLines[i])) i++;
                        i--; continue;
                    }
                    newLines.push(line);
                }
                const rebuiltFm = tagsBlock + '\n' + (newLines.length ? newLines.join('\n') + '\n' : '');
                content = content.replace(fmMatch[0], '---\n' + rebuiltFm + '---\n');
            } else {
                content = '---\n' + tagsBlock + '\n---\n\n' + content;
            }

            await this.app.vault.modify(file, content);
        } catch (e) {
            console.error('Error reapplying tags:', e);
        } finally {
            if (this._reapplyingTags) delete this._reapplyingTags[file.path];
            if (this._pendingTagWrites) delete this._pendingTagWrites[file.path];
        }
    }

    registerDocumentDrop() {
        if (this._documentDropRegistered) return;
        const handler = async (ev) => {
            if (!ev?.dataTransfer) return;
            const json = ev.dataTransfer.getData('text/x-card-sidebar');
            let payload = null;
            if (json) {
                try { payload = JSON.parse(json); } catch (e) { payload = { content: json }; }
            } else {
                const plain = ev.dataTransfer.getData('text/plain');
                if (!plain) return;
                const card = this.cards.find(c => c.id === plain || c.content === plain);
                payload = card ? { id: card.id, content: card.content } : { content: plain };
            }

            if (!payload?.content) return;
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!mdView?.editor) return;

            ev.preventDefault();
            ev.stopPropagation();
            mdView.editor.replaceSelection(String(payload.content));
            mdView.editor.focus();
        };

        try {
            this.plugin.registerDomEvent(document, 'drop', handler);
            this._documentDropRegistered = true;
        } catch (e) {
            document.addEventListener('drop', handler, true);
            this._documentDropRegistered = true;
        }
    }

    createHeader(container) {
        if (this.plugin.settings && this.plugin.settings.disableFilterButtons) return;
        const header = container.createDiv();
        
        
        
        
        try { if (container.firstChild && container.firstChild !== header) container.insertBefore(header, container.firstChild); } catch (e) {}
        header.addClass('card-sidebar-header');
        header.style.display = 'flex';

        if (!this.plugin.settings.disableFilterButtons) {
            const filterGroup = header.createDiv('category-group');
            filterGroup.addClass('card-sidebar-category-group');
            filterGroup.style.display = 'flex';
            filterGroup.style.gap = '8px';
            // Allow horizontal scrolling of filter chips without showing a scrollbar
            filterGroup.style.overflowX = 'auto';
            filterGroup.style.flexWrap = 'nowrap';
            filterGroup.style.whiteSpace = 'nowrap';
            filterGroup.style.webkitOverflowScrolling = 'touch';

            try {
                if (!document.getElementById('card-category-scroll-hide')) {
                    const s = document.createElement('style');
                    s.id = 'card-category-scroll-hide';
                    s.textContent = `
                        .card-sidebar-header .category-group { -ms-overflow-style: none; scrollbar-width: none; }
                        .card-sidebar-header .category-group::-webkit-scrollbar { display: none; width: 0; height: 0; }
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
                // Skip categories that have showInMenu disabled
                if (cat.showInMenu === false) return;
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
                btn.addClass('card-category-btn');
                btn.style.padding = '4px 8px';
                btn.style.borderRadius = 'var(--button-radius)';
                btn.style.border = '1px solid var(--background-modifier-border)';
                btn.style.cursor = 'pointer';
                btn.style.fontSize = '12px';
                btn.dataset.filterType = chip.type;
                btn.dataset.filterValue = chip.value;

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
                    
                    filterGroup.querySelectorAll('.card-category-btn').forEach(b => {
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

                                    await this.loadCards(true);
                                } else {
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
                        console.log('[SIDECARDS] 🔘 Category button - selected:', chip.value);
                        const catId = String(chip.value || '').toLowerCase();
                        if (wasActive) {
                            
                            this.currentCategoryFilter = null;
                            
                            filterGroup.querySelectorAll('.card-category-btn').forEach(b => { 
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

            const duration = opts.duration != null ? opts.duration : 300;
            const easing = opts.easing || 'cubic-bezier(0.2, 0.8, 0.2, 1.0)';
            
            // 1. First: Measure current positions
            const oldEls = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
            const oldMap = new Map();
            oldEls.forEach(el => {
                const id = el.dataset.id;
                if (id) oldMap.set(id, el.getBoundingClientRect());
            });

            // 2. Last: Apply DOM changes
            await asyncDomChange();

            // 3. Measure new positions
            const newEls = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
            const newMap = new Map();
            const elById = new Map();
            newEls.forEach(el => {
                const id = el.dataset.id;
                if (id) {
                    newMap.set(id, el.getBoundingClientRect());
                    elById.set(id, el);
                }
            });

            // 4. Invert: Apply transforms
            const ids = Array.from(elById.keys());
            
            // Handle moves
            ids.forEach(id => {
                const oldRect = oldMap.get(id);
                const newRect = newMap.get(id);
                const el = elById.get(id);
                
                if (oldRect && newRect && el) {
                    const dx = oldRect.left - newRect.left;
                    const dy = oldRect.top - newRect.top;
                    
                    if (dx !== 0 || dy !== 0) {
                        el.style.transition = 'none';
                        el.style.transform = `translate(${dx}px, ${dy}px)`;
                        el.style.willChange = 'transform';
                    }
                } else if (!oldRect && newRect && el) {
                    // New element entering
                    el.style.transition = 'none';
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(20px) scale(0.95)';
                    el.style.willChange = 'transform, opacity';
                }
            });

            // Force reflow
            void this.cardsContainer.offsetHeight;

            // 5. Play: Animate to zero
            requestAnimationFrame(() => {
                ids.forEach(id => {
                    const el = elById.get(id);
                    if (el) {
                        el.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
                        el.style.transform = '';
                        el.style.opacity = '1';
                    }
                });
                
                // Cleanup after animation
                setTimeout(() => {
                    ids.forEach(id => {
                        const el = elById.get(id);
                        if (el) {
                            el.style.transition = '';
                            el.style.transform = '';
                            el.style.opacity = '';
                            el.style.willChange = '';
                        }
                    });
                }, duration + 50);
            });

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
        input.placeholder = 'Type your idea here... (Use @category to set group, #tag to add tags.)';
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
        
        // Add tag autocomplete UI
        const autocompleteContainer = inputContainer.createDiv();
        autocompleteContainer.addClass('card-tag-autocomplete');
        autocompleteContainer.style.display = 'none';
        autocompleteContainer.style.position = 'absolute';
        autocompleteContainer.style.bottom = 'calc(100% + 4px)';
        autocompleteContainer.style.left = '8px';
        autocompleteContainer.style.right = '8px';
        autocompleteContainer.style.maxHeight = '150px';
        autocompleteContainer.style.overflowY = 'auto';
        autocompleteContainer.style.border = '1px solid var(--background-modifier-border)';
        autocompleteContainer.style.borderRadius = '4px';
        autocompleteContainer.style.background = 'var(--background-primary)';
        autocompleteContainer.style.zIndex = '1000';
        inputContainer.style.position = 'relative';
        
        let tagAutocompleteSelectedIndex = -1;
        const getRecentlyUsedTags = () => {
            try {
                const tags = new Set();
                (this.cards || []).forEach(c => {
                    if (c.tags && Array.isArray(c.tags)) {
                        c.tags.forEach(t => tags.add(String(t).toLowerCase()));
                    }
                });
                return Array.from(tags).sort();
            } catch (e) { return []; }
        };
        
        const updateTagAutocomplete = () => {
            try {
                const cursorPos = input.selectionStart;
                const textBeforeCursor = input.value.substring(0, cursorPos);
                const lastHashIdx = textBeforeCursor.lastIndexOf('#');
                
                if (lastHashIdx === -1 || lastHashIdx < textBeforeCursor.length - 1) {
                    autocompleteContainer.style.display = 'none';
                    return;
                }
                
                const currentWord = textBeforeCursor.substring(lastHashIdx + 1).toLowerCase();
                const allTags = getRecentlyUsedTags();
                
                // CRITICAL: Ensure we only suggest tags that aren't already being typed (to prevent # matching #tag)
                const suggestions = allTags.filter(t => t.startsWith(currentWord)).slice(0, 8);
                
                if (suggestions.length === 0 && currentWord.length > 0) {
                    autocompleteContainer.style.display = 'none';
                    return;
                }
                
                autocompleteContainer.empty();
                tagAutocompleteSelectedIndex = -1;
                
                // If currentWord is empty (just typed #), show all recently used tags
                const displayTags = currentWord.length === 0 ? allTags.slice(0, 8) : suggestions;
                
                if (displayTags.length === 0) {
                    autocompleteContainer.style.display = 'none';
                    return;
                }

                displayTags.forEach((tag, idx) => {
                    const item = autocompleteContainer.createDiv();
                    item.style.padding = '4px 8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid var(--background-modifier-border)';
                    item.textContent = '#' + tag;
                    item.dataset.index = String(idx);
                    
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--background-modifier-hover)';
                        tagAutocompleteSelectedIndex = idx;
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = '';
                    });
                    
                    item.addEventListener('click', () => {
                        const before = input.value.substring(0, lastHashIdx);
                        const after = input.value.substring(cursorPos);
                        input.value = before + '#' + tag + ' ' + after;
                        input.selectionStart = input.selectionEnd = before.length + tag.length + 2;
                        input.focus();
                        autoResize();
                        updateTagAutocomplete();
                    });
                });
                
                autocompleteContainer.style.display = '';
            } catch (e) { }
        };
        
        input.addEventListener('input', updateTagAutocomplete);
        
        // Add group autocomplete UI for @all, @today, @tomorrow, #category
        const groupAutocompleteContainer = inputContainer.createDiv();
        groupAutocompleteContainer.addClass('card-group-autocomplete');
        groupAutocompleteContainer.style.display = 'none';
        groupAutocompleteContainer.style.position = 'absolute';
        groupAutocompleteContainer.style.bottom = 'calc(100% + 4px)';
        groupAutocompleteContainer.style.left = '8px';
        groupAutocompleteContainer.style.right = '8px';
        groupAutocompleteContainer.style.maxHeight = '150px';
        groupAutocompleteContainer.style.overflowY = 'auto';
        groupAutocompleteContainer.style.border = '1px solid var(--background-modifier-border)';
        groupAutocompleteContainer.style.borderRadius = '4px';
        groupAutocompleteContainer.style.background = 'var(--background-primary)';
        groupAutocompleteContainer.style.zIndex = '999';
        
        let groupAutocompleteSelectedIndex = -1;
        const updateGroupAutocomplete = () => {
            try {
                const cursorPos = input.selectionStart;
                const textBeforeCursor = input.value.substring(0, cursorPos);
                
                const lines = textBeforeCursor.split('\n');
                const currentLine = lines[lines.length - 1];
                const atIdx = currentLine.lastIndexOf('@');

                if (atIdx === -1) {
                    groupAutocompleteContainer.style.display = 'none';
                    return;
                }
                
                const currentWord = currentLine.substring(atIdx + 1).toLowerCase();
                const groups = ['all', 'today', 'tomorrow'];
                const customCats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                
                // All suggestions use @ prefix (builtin and custom categories)
                const allSuggestions = [
                    ...groups.map(g => ({ text: '@' + g, label: g })),
                    ...customCats.map(c => ({ text: '@' + (c.id || c.label), label: c.label || c.id }))
                ];
                
                // Filter suggestions: if currentWord is empty, show all; otherwise filter by match
                const suggestions = currentWord.length === 0 
                    ? allSuggestions
                    : allSuggestions.filter(s => s.text.substring(1).startsWith(currentWord)).slice(0, 8);
                
                if (suggestions.length === 0) {
                    groupAutocompleteContainer.style.display = 'none';
                    return;
                }
                
                groupAutocompleteContainer.empty();
                groupAutocompleteSelectedIndex = -1;
                suggestions.forEach(({ text, label }, idx) => {
                    const item = groupAutocompleteContainer.createDiv();
                    item.style.padding = '4px 8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid var(--background-modifier-border)';
                    item.style.fontSize = '12px';
                    item.textContent = label;
                    item.dataset.index = String(idx);
                    
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--background-modifier-hover)';
                        groupAutocompleteSelectedIndex = idx;
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = '';
                    });
                    
                    item.addEventListener('click', () => {
                        const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
                        const atAbs = lineStart + atIdx;
                        const before = input.value.substring(0, atAbs);
                        const after = input.value.substring(cursorPos);
                        input.value = before + text + ' ' + after;
                        input.selectionStart = input.selectionEnd = before.length + text.length + 1;
                        input.focus();
                        autoResize();
                        updateGroupAutocomplete();
                    });
                });
                
                groupAutocompleteContainer.style.display = '';
            } catch (e) { }
        };
        
        input.addEventListener('input', updateGroupAutocomplete);
        input.addEventListener('keydown', (e) => {
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && groupAutocompleteContainer.style.display !== 'none') {
                e.preventDefault();
                const items = groupAutocompleteContainer.querySelectorAll('div');
                if (items.length === 0) return;
                if (e.key === 'ArrowDown') {
                    groupAutocompleteSelectedIndex = (groupAutocompleteSelectedIndex + 1) % items.length;
                } else {
                    groupAutocompleteSelectedIndex = (groupAutocompleteSelectedIndex - 1 + items.length) % items.length;
                }
                items.forEach((item, idx) => {
                    item.style.background = idx === groupAutocompleteSelectedIndex ? 'var(--background-modifier-hover)' : '';
                });
                return;
            }

            if (e.key === 'Enter' && groupAutocompleteContainer.style.display !== 'none' && groupAutocompleteSelectedIndex >= 0) {
                e.preventDefault();
                const items = groupAutocompleteContainer.querySelectorAll('div');
                const selectedItem = items[groupAutocompleteSelectedIndex];
                if (selectedItem) selectedItem.click();
                return;
            }
            // Handle up/down arrow keys for tag suggestions
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && autocompleteContainer.style.display !== 'none') {
                e.preventDefault();
                const items = autocompleteContainer.querySelectorAll('div');
                if (items.length === 0) return;
                
                if (e.key === 'ArrowDown') {
                    tagAutocompleteSelectedIndex = (tagAutocompleteSelectedIndex + 1) % items.length;
                } else {
                    tagAutocompleteSelectedIndex = (tagAutocompleteSelectedIndex - 1 + items.length) % items.length;
                }
                
                items.forEach((item, idx) => {
                    if (idx === tagAutocompleteSelectedIndex) {
                        item.style.background = 'var(--background-modifier-hover)';
                    } else {
                        item.style.background = '';
                    }
                });
                
                return;
            }
            
            // Handle Enter to select highlighted tag
            if (e.key === 'Enter' && autocompleteContainer.style.display !== 'none' && tagAutocompleteSelectedIndex >= 0) {
                e.preventDefault();
                const items = autocompleteContainer.querySelectorAll('div');
                const selectedItem = items[tagAutocompleteSelectedIndex];
                if (selectedItem) {
                    selectedItem.click();
                }
                return;
            }
            
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
            searchBtn.style.color = this._searchWrap && this._searchWrap.style.display !== 'none' ? 'var(--interactive-accent)' : 'var(--text-muted)';
        });
        searchBtn.addEventListener('click', () => {
            try {
                if (this._searchWrap) {
                    this._searchWrap.style.display = (this._searchWrap.style.display === 'none') ? '' : 'none';
                    if (this._searchWrap.style.display !== 'none' && this._searchInput) {
                        try { this._searchInput.focus(); } catch (e) {}
                        searchBtn.style.color = 'var(--text-normal)';
                    } else {
                        searchBtn.style.color = 'var(--text-muted)';
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
                const activeBtn = this.containerEl.querySelector('.card-category-btn.active');
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
        try { setIcon(sortBtn, this.plugin.settings.sortAscending ? 'sort-asc' : 'sort-desc'); } catch (e) { sortBtn.textContent = this.plugin.settings.sortAscending ? '↑' : '↓'; }

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
                        try { setIcon(sortBtn, this.plugin.settings.sortAscending ? 'sort-asc' : 'sort-desc'); } catch (e) { sortBtn.textContent = this.plugin.settings.sortAscending ? '↑' : '↓'; }
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

        /* removed '+ Category' button from sidebar toolbar */

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
        let content = input.value.trim();
        if (!content) return;

        // Extract filter type, value, color, and tags from the input
        let filterType = filterInfo.filterType || '';
        let filterValue = filterInfo.filterValue || '';
        const selectedColor = filterInfo.selectedColor || 'var(--card-color-1)';
        let additionalTags = filterInfo.tags || [];
        
        // Parse group prefixes from content: @all, @today, @tomorrow, or @customcategory
        // Also extract #tags from content
        let actualContent = content;
        let extractedTags = [];
        
        // Check for @ prefixes at the start - match as much as possible
        const customCats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
        
        // Try to match @category from start of content - check custom categories first (in case of multi-word labels)
        let matched = false;
        
        // Sort custom categories by label length (longest first) to match multi-word labels properly
        const sortedCustomCats = [...customCats].sort((a, b) => 
            String(b.label || b.id || '').length - String(a.label || a.id || '').length
        );
        
        for (const cat of sortedCustomCats) {
            const catId = String(cat.id || '').toLowerCase();
            const catLabel = String(cat.label || '').toLowerCase();
            
            // Check if content starts with @category or @id followed by space or end
            if (content.toLowerCase().startsWith('@' + catLabel + ' ') || 
                (content.toLowerCase().startsWith('@' + catLabel) && content.length === ('@' + catLabel).length)) {
                filterType = 'category';
                filterValue = cat.label || cat.id;
                actualContent = content.substring(('@' + catLabel).length).trim();
                matched = true;
                break;
            }
            if (content.toLowerCase().startsWith('@' + catId + ' ') || 
                (content.toLowerCase().startsWith('@' + catId) && content.length === ('@' + catId).length)) {
                filterType = 'category';
                filterValue = cat.label || cat.id;
                actualContent = content.substring(('@' + catId).length).trim();
                matched = true;
                break;
            }
        }
        
        // If no custom category matched, check built-in categories
        if (!matched) {
            const groupMatch = content.match(/^@(all|today|tomorrow)(?:\s+(.*))?$/i);
            if (groupMatch) {
                const prefix = groupMatch[1].toLowerCase();
                actualContent = groupMatch[2] ? groupMatch[2].trim() : '';
                
                if (prefix === 'all') {
                    filterType = 'all';
                    filterValue = '';
                } else if (prefix === 'today') {
                    filterType = 'today';
                    filterValue = 'today';
                } else if (prefix === 'tomorrow') {
                    filterType = 'tomorrow';
                    filterValue = 'tomorrow';
                }
                matched = true;
            }
        }

        if (!matched) {
            const anyMatch = content.match(/@([a-z0-9\-]+)/i);
            if (anyMatch) {
                const token = anyMatch[1].toLowerCase();
                const builtin = ['all', 'today', 'tomorrow'];
                if (builtin.includes(token)) {
                    if (token === 'all') { filterType = 'all'; filterValue = ''; }
                    else if (token === 'today') { filterType = 'today'; filterValue = 'today'; }
                    else if (token === 'tomorrow') { filterType = 'tomorrow'; filterValue = 'tomorrow'; }
                    actualContent = content.replace(new RegExp('@' + token + '(?![a-z0-9\-])', 'i'), '').trim();
                    matched = true;
                } else {
                    const found = customCats.find(c => String(c.id || '').toLowerCase() === token || String(c.label || '').toLowerCase() === token);
                    if (found) {
                        filterType = 'category';
                        filterValue = found.label || found.id;
                        actualContent = content.replace(new RegExp('@' + token + '(?![a-z0-9\-])', 'i'), '').trim();
                        matched = true;
                    }
                }
            }
        }
        
        // Extract #tags from content
        const tagMatches = actualContent.match(/#[a-zA-Z0-9_-]+/g) || [];
        if (tagMatches.length > 0) {
            extractedTags = tagMatches.map(t => t.substring(1));
            // Remove tags from content
            actualContent = actualContent.replace(/#[a-zA-Z0-9_-]+/g, '').trim();
        }
        
        // Combine extracted tags with additional tags, avoiding duplicates
        const allTags = [...new Set([...additionalTags, ...extractedTags])];
        additionalTags = allTags;
        
        content = actualContent;

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

            // Get the first 10 words for filename to prevent data loss
            const words = content.split(/\s+/).slice(0, 10).join(' ');
            let title = words.trim();
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

    // --- Card Helpers ---

    applyCardColor(cd, el) {
        if (!cd || !el) return;
        const color = cd.color || 'var(--card-color-1)';
        this.applyCardColorToElement(el, color);
    }

    formatTimeDiff(ms) {
        const totalMinutes = Math.max(0, Math.floor(ms / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) return `expiring in ${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        return `expiring in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    hexToRGBA(hex, alpha) {
        try {
            const h = hex.replace('#','');
            const bigint = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            const a = Math.max(0, Math.min(1, Number(alpha || 1)));
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        } catch (e) { return hex; }
    }

    createCard(content, options = {}) {
        const id = options.id || Date.now().toString();
        const card = document.createElement('div');
        card.addClass('card-sidebar-card');
        card.dataset.id = id;
        card.setAttribute('draggable', 'true');

        const cardColor = options.color || 'var(--card-color-1)';
        
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

        if (cardData.pinned) {
            this.cards.unshift(cardData);
        } else {
            this.cards.push(cardData);
        }

        this.applyCardColorToElement(card, cardColor);

        // 1. Render Structure
        const pillBar = card.createDiv('card-pill-bar');
        const contentEl = card.createDiv('card-content');
        contentEl.setAttribute('tabindex', '0');

        const footer = card.createDiv('card-footer');
        const leftSection = footer.createDiv('card-footer-left');
        const rightSection = footer.createDiv('card-footer-right');

        // 2. Render Content & UI Elements
        this.renderCardContent(contentEl, content, options);
        this.renderCardPills(pillBar, cardData);
        this.renderCardFooter(leftSection, rightSection, cardData);
        this.renderCardPinIndicator(card, cardData);
        this.renderCardCopyButton(card, cardData);

        // 3. Setup Events
        this.setupCardEvents(card, cardData);
        this.scheduleDeferredUiSetup(cardData);

        return cardData;
    }

    renderCardContent(el, content, options = {}) {
        if (!el) return;
        el.empty();
        
        // If disabled, just show text and enable editing directly
        if (this.plugin.settings.disableCardRendering) {
            el.setAttribute('contenteditable', 'true');
            el.textContent = content || '';
        } else {
            // Otherwise, set to non-editable and schedule for markdown rendering
            el.setAttribute('contenteditable', 'false');
            el.textContent = content || ''; // Show text as placeholder
            
            // Queue for markdown rendering
            if (!this._deferredRenderQueue) this._deferredRenderQueue = [];
            this._deferredRenderQueue.push({
                contentEl: el,
                content: content,
                notePath: options.notePath || ''
            });
        }
    }

    renderCardPills(el, cardData) {
        if (!el) return;
        el.empty();
        
        // Create standard layout elements expected by updateCardPills
        const expiryPill = el.createDiv('card-expiry-pill');
        const statusPill = el.createDiv('card-status-pill');
        
        // Use the existing logic to populate them
        this.updateCardPills(el, cardData);
    }

    getSortedCards(cards) {
        if (!cards || !Array.isArray(cards)) return [];
        const mode = (this.plugin && this.plugin.settings && this.plugin.settings.sortMode) || 'manual';
        const asc = (this.plugin && this.plugin.settings && typeof this.plugin.settings.sortAscending !== 'undefined') ? !!this.plugin.settings.sortAscending : true;
        
        const sorted = [...cards];
        
        if (mode === 'manual') {
            const order = (this.plugin && this.plugin.settings && this.plugin.settings.manualOrder) || [];
            if (order.length > 0) {
                sorted.sort((a, b) => {
                    const idxA = order.indexOf(a.notePath || a.id);
                    const idxB = order.indexOf(b.notePath || b.id);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }
        } else if (mode === 'created') {
            sorted.sort((a, b) => {
                const dA = new Date(a.created || 0);
                const dB = new Date(b.created || 0);
                return (dA - dB) * (asc ? 1 : -1);
            });
        } else if (mode === 'modified') {
            sorted.sort((a, b) => {
                const dA = new Date(a.created || 0);
                const dB = new Date(b.created || 0);
                return (dA - dB) * (asc ? 1 : -1);
            });
        } else if (mode === 'alpha') {
            sorted.sort((a, b) => {
                const textA = String(a.content || '').toLowerCase();
                const textB = String(b.content || '').toLowerCase();
                return textA.localeCompare(textB) * (asc ? 1 : -1);
            });
        }
        
        return sorted;
    }

    renderCardPinIndicator(card, cardData) {
        if (!cardData.pinned) return;

        const pinEl = card.createDiv('card-pin-indicator');
        pinEl.style.position = 'absolute';
        pinEl.style.top = '6px';
        pinEl.style.right = '8px';
        pinEl.style.cursor = 'pointer';
        pinEl.title = 'Pinned';
        
        try { setIcon(pinEl, 'pin'); } catch (e) { pinEl.textContent = '📌'; }
        pinEl.style.color = 'var(--interactive-accent)';

        pinEl.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            await this.togglePin(cardData, false);
        });
    }

    async updateNoteFrontmatter(path, data) {
        try {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file) return;
            
            let content = await this.app.vault.read(file);
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            
            if (fmMatch) {
                let fm = fmMatch[1];
                for (const [key, value] of Object.entries(data)) {
                    const regex = new RegExp(`^\\s*${key}\\s*:.*$`, 'gmi');
                    if (regex.test(fm)) {
                        fm = fm.replace(regex, `${key}: ${value}`);
                    } else {
                        fm = fm.trim() + '\n' + `${key}: ${value}`;
                    }
                }
                content = content.replace(fmMatch[0], `---\n${fm.trim()}\n---\n`);
            } else {
                let fm = '---\n';
                for (const [key, value] of Object.entries(data)) {
                    fm += `${key}: ${value}\n`;
                }
                fm += '---\n\n';
                content = fm + content;
            }
            await this.app.vault.modify(file, content);
        } catch (err) {
            console.error('Error updating frontmatter:', err);
        }
    }

    renderCardCopyButton(card, cardData) {
        const copyBtn = card.createDiv('card-copy-btn');
        copyBtn.style.position = 'absolute';
        copyBtn.style.top = '4px';
        copyBtn.style.right = '4px';
        copyBtn.style.opacity = '0';
        copyBtn.style.transition = 'opacity 0.15s ease-in-out';
        copyBtn.style.zIndex = '10';
        copyBtn.style.cursor = 'pointer';
        
        try { setIcon(copyBtn, 'copy'); } catch (e) { copyBtn.textContent = '📋'; }

        card.addEventListener('mouseenter', () => copyBtn.style.opacity = '1');
        card.addEventListener('mouseleave', () => copyBtn.style.opacity = '0');

        copyBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            let text = cardData.content || '';
            if (cardData.notePath) {
                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                if (file) {
                    const content = await this.app.vault.read(file);
                    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                    text = m ? content.slice(m[0].length).trim() : content.trim();
                }
            }
            await navigator.clipboard.writeText(text);
            new Notice('Card content copied');
        });
    }

    async updateCardContent(card, newText) {
        const data = this.cards.find(c => c.element === card);
        if (!data) return;

        data.content = newText;
        const settingsCard = this.plugin.settings.cards.find(c => c.id === data.id);
        if (settingsCard) settingsCard.content = newText;
        await this.plugin.saveSettings();

        if (data.notePath) {
            try {
                const file = this.app.vault.getAbstractFileByPath(data.notePath);
                if (file) {
                    const content = await this.app.vault.read(file);
                    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                    const newContent = fmMatch ? fmMatch[0] + '\n' + newText : newText;
                    await this.app.vault.modify(file, newContent);
                }
            } catch (e) {
                console.error('Error updating note content:', e);
            }
        }
    }

    async toggleArchive(cardData, archived) {
        cardData.archived = archived;
        if (cardData.notePath) {
            await this.updateNoteFrontmatter(cardData.notePath, { archived });
        }
        await this.plugin.saveSettings();
        this.applyFilters();
    }

    async togglePin(cardData, pinned) {
        cardData.pinned = pinned;
        if (cardData.notePath) {
            await this.updateNoteFrontmatter(cardData.notePath, { pinned });
        }
        await this.plugin.saveSettings();
        await this.applySort(this.plugin.settings.sortMode, this.plugin.settings.sortAscending);
    }

    async deleteCard(cardData) {
        if (cardData.notePath) {
            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
            if (file) await this.app.vault.delete(file);
        }
        this.plugin.settings.cards = this.plugin.settings.cards.filter(c => c.id !== cardData.id);
        await this.plugin.saveSettings();
        await this.loadCards(this._lastLoadArchived || false);
    }

    updateCardPills(pillBar, options) {
        const expiryPill = pillBar.querySelector('.card-expiry-pill');
        const statusPill = pillBar.querySelector('.card-status-pill');
        
        // Status Pill
        if (options.status?.name) {
            statusPill.style.display = '';
            statusPill.textContent = options.status.name;
            if (options.status.color) {
                const opacity = Math.max(0.1, this.plugin?.settings?.statusPillOpacity || 1);
                const bgColor = this.hexToRGBA(options.status.color, opacity);
                statusPill.style.setProperty('background-color', bgColor, 'important');
                statusPill.style.setProperty('color', options.status.textColor || '#000', 'important');
            }
        } else {
            statusPill.style.display = 'none';
        }

        // Expiry Pill
        if (options.expiresAt) {
            const t = new Date(options.expiresAt).getTime();
            const ms = t - Date.now();
            if (ms > 0) {
                expiryPill.style.display = '';
                expiryPill.textContent = this.formatTimeDiff(ms);
            } else {
                expiryPill.style.display = 'none';
            }
        } else {
            expiryPill.style.display = 'none';
        }

        const card = pillBar.closest('.card-sidebar-card');
        if (card) {
            const hasPills = (expiryPill.style.display !== 'none' || statusPill.style.display !== 'none');
            card.classList.toggle('has-pills', hasPills);
        }
    }

    renderCardFooter(left, right, options) {
        if (options.detached) return;

        const showTimestamps = this.plugin?.settings?.showTimestamps;
        const groupTags = this.plugin?.settings?.groupTags;

        if (showTimestamps) {
            const ts = left.createDiv('card-timestamp');
            ts.textContent = this.formatTimestamp(options.created || new Date().toISOString());
        }

        if (options.tags?.length > 0 && !groupTags) {
            const tagsEl = left.createDiv('card-tags');
            options.tags.forEach(t => {
                const tagEl = tagsEl.createDiv('card-tag');
                tagEl.textContent = this.plugin?.settings?.omitTagHash ? t : `#${t}`;
                tagEl.addEventListener('click', (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    this.applyTagFilter(t);
                });
            });
        }
    }

    applyTagFilter(tag) {
        if (this._searchWrap) this._searchWrap.style.display = '';
        const rawTag = String(tag).replace(/^#/, '');
        if (!this.activeFilters.tags) this.activeFilters.tags = [];
        if (!this.activeFilters.tags.includes(rawTag)) this.activeFilters.tags.push(rawTag);
        if (this._searchInput) this._searchInput.value = '';
        this.activeFilters.query = '';
        this.updateSearchChips?.();
        this.applyFilters();
    }

    setupCardEvents(card, options) {
        const contentEl = card.querySelector('.card-content');
        const renderingDisabled = !!(this.plugin?.settings?.disableCardRendering);

        contentEl.addEventListener('click', (ev) => {
            if (renderingDisabled || contentEl.getAttribute('contenteditable') === 'true') return;
            ev.stopPropagation();
            this.enableCardEditing(card, contentEl);
        });

        contentEl.addEventListener('focus', () => {
            if (contentEl.getAttribute('contenteditable') === 'true') {
                const cd = this.cards.find(c => c.element === card);
                if (cd?.content) contentEl.innerText = cd.content;
            }
        });

        contentEl.addEventListener('blur', async () => {
            if (contentEl.getAttribute('contenteditable') === 'true') {
                await this.finishCardEditing(card, contentEl, options);
            }
        });

        contentEl.addEventListener('keydown', (e) => this.handleCardContentKeyDown(contentEl, e));

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showCardContextMenu(card, e);
        });

        this.setupCardDragAndDrop(card);
    }

    handleCardContentKeyDown(contentEl, e) {
        if (contentEl.getAttribute('contenteditable') !== 'true') return;

        const pressed = (e.ctrlKey ? 'ctrl-' : '') + (e.shiftKey ? 'shift-' : '') + (e.altKey ? 'alt-' : '') + (e.key?.toLowerCase() || '');
        const saveKey = (this.plugin?.settings?.saveKey || 'enter').toLowerCase();
        const nextLineKey = (this.plugin?.settings?.nextLineKey || 'shift-enter').toLowerCase();

        if (pressed === saveKey) {
            e.preventDefault();
            contentEl.blur();
        } else if (pressed === nextLineKey) {
            e.preventDefault();
            this.insertLineBreak(contentEl);
        } else if (e.ctrlKey) {
            this.handleMarkdownShortcuts(contentEl, e);
        }
    }

    insertLineBreak(el) {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const range = sel.getRangeAt(0);
        const br = document.createElement('br');
        range.deleteContents();
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    handleMarkdownShortcuts(contentEl, e) {
        const k = e.key.toLowerCase();
        const shortcuts = {
            'b': ['**', '**'],
            'i': ['*', '*'],
            'k': ['[', ']( )'],
            '`': ['`', '`']
        };
        if (shortcuts[k]) {
            e.preventDefault();
            this.wrapSelection(contentEl, ...shortcuts[k]);
        }
    }

    wrapSelection(el, before, after) {
        const sel = window.getSelection();
        if (!sel?.rangeCount || !el.contains(sel.getRangeAt(0).startContainer)) return;
        const range = sel.getRangeAt(0);
        const text = range.toString();
        const node = document.createTextNode(before + text + after);
        range.deleteContents();
        range.insertNode(node);
        range.setStart(node, (before + text + after).length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    async finishCardEditing(card, contentEl, options) {
        const text = contentEl.innerText || contentEl.textContent || '';
        await this.updateCardContent(card, text);

        if (!this.plugin?.settings?.disableCardRendering) {
            contentEl.setAttribute('contenteditable', 'false');
            const cd = this.cards.find(c => c.element === card);
            const temp = document.createElement('div');
            await MarkdownRenderer.render(this.app, cd?.content || '', temp, this, cd?.notePath || options.notePath || '');
            contentEl.empty();
            while (temp.firstChild) contentEl.appendChild(temp.firstChild);
            if (cd) setTimeout(() => this.applyCardColor(cd, card), 0);
        }
    }

    enableCardEditing(card, contentEl) {
        contentEl.setAttribute('contenteditable', 'true');
        const cd = this.cards.find(c => c.element === card);
        contentEl.empty();
        contentEl.textContent = cd?.content ?? '';
        setTimeout(() => contentEl.focus(), 0);
    }

    enqueueCardCreate(content, options) {
        try {
            options = options || {};
            const c = this.createCard(content, options);
            if (!c?.element) {
                this.plugin.debugLog('⚠️ Card creation returned invalid object', { options });
                return null;
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
            const isGrid = this.plugin.settings.verticalCardMode;
            
            if (isGrid) {
                this.cardsContainer.addClass('grid-mode');
                this.cardsContainer.addClass('vertical-card-mode');
                // Clean up old styles
                this.cardsContainer.style.display = '';
                this.cardsContainer.style.gridTemplateColumns = '';
                this.cardsContainer.style.gridAutoRows = '';
                this.cardsContainer.style.gap = '';
                this.cardsContainer.style.alignItems = '';

                this.setupMasonryObserver();
                this.refreshMasonrySpans();
            } else {
                this.cardsContainer.removeClass('grid-mode');
                this.cardsContainer.removeClass('vertical-card-mode');
                this.cardsContainer.style.display = '';
                
                if (this._masonryObserver) {
                    this._masonryObserver.disconnect();
                    this._masonryObserver = null;
                }
                if (this._masonryMutationObserver) {
                    this._masonryMutationObserver.disconnect();
                    this._masonryMutationObserver = null;
                }

                // Reset grid row ends
                (this.cards || []).forEach(c => {
                    if (c.element) c.element.style.gridRowEnd = '';
                });
            }
        } catch (e) {
            this.plugin.debugLog('Error applying layout mode:', e);
        }
    }

    setupMasonryObserver() {
        try {
            if (!this.cardsContainer || typeof ResizeObserver === 'undefined') {
                this.setupMasonryMutationObserver();
                return;
            }

            if (this._masonryObserver) this._masonryObserver.disconnect();

            this._masonryObserver = new ResizeObserver(() => {
                if (this._masonryTimeout) clearTimeout(this._masonryTimeout);
                this._masonryTimeout = setTimeout(() => {
                    this.refreshMasonrySpans();
                }, 50);
            });

            this._masonryObserver.observe(this.cardsContainer);
            this.cardsContainer.querySelectorAll('.card-sidebar-card').forEach(el => {
                this._masonryObserver.observe(el);
            });
        } catch (e) {
            this.setupMasonryMutationObserver();
        }
    }

    refreshMasonrySpans() {
        try {
            if (!this.plugin.settings.verticalCardMode || !this.cardsContainer) return;
            
            const cards = this.cardsContainer.querySelectorAll('.card-sidebar-card:not(.drag-spacer)');
            cards.forEach(el => {
                // Temporarily remove span to measure true height
                el.style.gridRowEnd = 'auto';
                const h = el.getBoundingClientRect().height;
                if (h > 0) {
                    const span = Math.max(1, Math.ceil(h + 8));
                    el.style.gridRowEnd = 'span ' + span;
                }
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
            e.dataTransfer.effectAllowed = 'move';
            
            const cardData = this.cards.find(c => c.element === card);
            const payload = {
                id: card.dataset.id,
                content: cardData ? String(cardData.content) : card.textContent
            };

            try {
                e.dataTransfer.setData('text/x-card-sidebar', JSON.stringify(payload));
                e.dataTransfer.setData('text/plain', card.dataset.id);
            } catch (err) {
                try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (e) { }
            }

            // Create drag ghost image
            try {
                const dragImg = document.createElement('div');
                dragImg.className = 'card-sidebar-card dragging-ghost';
                dragImg.textContent = (cardData && cardData.content) ? cardData.content.slice(0, 50) + '...' : 'Moving card...';
                dragImg.style.width = '200px';
                dragImg.style.position = 'absolute';
                dragImg.style.top = '-9999px';
                document.body.appendChild(dragImg);
                e.dataTransfer.setDragImage(dragImg, 10, 10);
                setTimeout(() => { dragImg.remove(); }, 0);
            } catch (e) {}

            // Create spacer for reordering preview
            if (this.plugin.settings.sortMode === 'manual') {
                const spacer = document.createElement('div');
                spacer.className = 'card-sidebar-card drag-spacer';
                spacer.style.height = `${card.offsetHeight}px`;
                spacer.style.gridRowEnd = card.style.gridRowEnd;
                spacer.dataset.id = 'drag-spacer';
                this._dragSpacer = spacer;
                
                // Hide original card but keep it in DOM for dragend
                setTimeout(() => {
                    card.style.display = 'none';
                    card.after(this._dragSpacer);
                }, 0);
            }
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            card.style.display = '';
            
            if (this._dragSpacer) {
                this._dragSpacer.replaceWith(card);
                this._dragSpacer = null;
            }
            
            try {
                if (this.plugin.settings.sortMode === 'manual') {
                    this.reindexCardsFromDOM();
                }
            } catch (e) {}
        });

        if (!this._dragListenersAttached) {
            this.cardsContainer.addEventListener('dragover', (e) => {
                if (this.plugin.settings.sortMode !== 'manual' || !this._dragSpacer) return;
                e.preventDefault();
                
                const afterElement = this.getDragAfterElement(this.cardsContainer, e.clientY, e.clientX);
                if (afterElement == null) {
                    this.cardsContainer.appendChild(this._dragSpacer);
                } else if (afterElement !== this._dragSpacer) {
                    this.cardsContainer.insertBefore(this._dragSpacer, afterElement);
                }
            });

            this.cardsContainer.addEventListener('drop', (e) => {
                if (this.plugin.settings.sortMode !== 'manual') return;
                e.preventDefault();
            });

            this._dragListenersAttached = true;
        }
    }

    reindexCardsFromDOM() {
        if (this.plugin.settings.sortMode !== 'manual') return;
        
        const domIds = [...this.cardsContainer.querySelectorAll('.card-sidebar-card:not(.drag-spacer)')].map(el => el.dataset.id);
        const draggedOrder = [];
        domIds.forEach(id => {
            const found = this.cards.find(c => c.id === id);
            if (found) draggedOrder.push(found);
        });

        if (draggedOrder.length === 0) return;

        const allCards = this.plugin.settings.cards || [];
        const allPaths = new Set(allCards.map(c => c.notePath).filter(Boolean));
        
        const newUniversalOrder = [];
        const processedPaths = new Set();
        
        draggedOrder.forEach(card => {
            if (card.notePath) {
                newUniversalOrder.push(card.notePath);
                processedPaths.add(card.notePath);
            }
        });
        
        const existingOrder = this.plugin.settings.manualOrder || [];
        existingOrder.forEach(path => {
            if (path && !processedPaths.has(path) && allPaths.has(path)) {
                newUniversalOrder.push(path);
                processedPaths.add(path);
            }
        });
        
        allPaths.forEach(path => {
            if (!processedPaths.has(path)) {
                newUniversalOrder.push(path);
                processedPaths.add(path);
            }
        });

        this.plugin.settings.manualOrder = newUniversalOrder;
        this.plugin.saveSettings();
        
        const nonDraggedCards = this.cards.filter(c => !domIds.includes(c.id));
        const orderedNonDragged = nonDraggedCards.sort((a, b) => {
            const aIdx = newUniversalOrder.indexOf(a.notePath);
            const bIdx = newUniversalOrder.indexOf(b.notePath);
            return (aIdx === -1 ? 9999 : aIdx) - (bIdx === -1 ? 9999 : bIdx);
        });
        this.cards = draggedOrder.concat(orderedNonDragged);
        this.saveCards();
    }

    getDragAfterElement(container, y, x) {
        const draggableElements = [...container.querySelectorAll('.card-sidebar-card:not(.dragging):not(.drag-spacer)')];
        if (draggableElements.length === 0) return null;

        let closest = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        draggableElements.forEach(child => {
            const box = child.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = child;
            }
        });

        if (closest) {
            const box = closest.getBoundingClientRect();
            const isAfter = (x > box.left + box.width / 2) || (y > box.top + box.height / 2);
            return isAfter ? closest.nextElementSibling : closest;
        }
        return null;
    }

    async applySort(mode = 'manual', ascending = true) {
        try {
            this.plugin.settings.sortMode = mode;
            this.plugin.settings.sortAscending = ascending;
            await this.plugin.saveSettings();

            const sortedData = this.getSortedCards(this.plugin.settings.cards);
            const idToCard = new Map(this.cards.map(c => [c.id, c]));
            
            await this.flipAnimateAsync(async () => {
                const fragment = document.createDocumentFragment();
                const newCards = [];
                
                sortedData.forEach(data => {
                    const card = idToCard.get(data.id);
                    if (card?.element) {
                        fragment.appendChild(card.element);
                        newCards.push(card);
                    }
                });
                
                this.cardsContainer.empty();
                this.cardsContainer.appendChild(fragment);
                this.cards = newCards;
                this.refreshMasonrySpans();
            });
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
            let body = String(newContent || '').trim();
            let categoryFromBody = '';
            const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
            const mAny = body.match(/@([a-z0-9\-]+)/i);
            if (mAny) {
                const token = mAny[1].toLowerCase();
                if (token === 'today') { categoryFromBody = 'Today'; body = body.replace(new RegExp('@' + token + '(?![a-z0-9\-])', 'i'), '').trim(); }
                else if (token === 'tomorrow') { categoryFromBody = 'Tomorrow'; body = body.replace(new RegExp('@' + token + '(?![a-z0-9\-])', 'i'), '').trim(); }
                else if (token !== 'all') {
                    const found = cats.find(c => String(c.id || '').toLowerCase() === token || String(c.label || '').toLowerCase() === token);
                    if (found) { categoryFromBody = found.label || found.id; body = body.replace(new RegExp('@' + token + '(?![a-z0-9\-])', 'i'), '').trim(); }
                }
            }
            const tagMatches = body.match(/#[a-zA-Z0-9_-]+/g) || [];
            const extracted = tagMatches.map(t => t.substring(1));
            if (tagMatches.length > 0) body = body.replace(/#[a-zA-Z0-9_-]+/g, '').trim();

            cardData.content = body;
            if (categoryFromBody) cardData.category = categoryFromBody;
            if (extracted.length) {
                const existing = Array.isArray(cardData.tags) ? cardData.tags : [];
                cardData.tags = Array.from(new Set([...existing, ...extracted]));
            }

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
                                let fmBody = fmMatch[1];
                                if (categoryFromBody) {
                                    if (/^\s*Category\s*:\s*.*$/mi.test(fmBody)) {
                                        fmBody = fmBody.replace(/^\s*Category\s*:\s*.*$/mi, `Category: ${String(categoryFromBody).replace(/\n/g,' ')}`);
                                    } else {
                                        fmBody = fmBody + `\nCategory: ${String(categoryFromBody).replace(/\n/g,' ')}`;
                                    }
                                }
                                if (extracted.length) {
                                    const tagsYaml = 'Tags:\n' + extracted.map(t => `  - ${t}`).join('\n');
                                    if (/^\s*Tags\s*:\s*[\s\S]*?$/mi.test(fmBody)) {
                                        fmBody = fmBody.replace(/^\s*Tags\s*:\s*[\s\S]*?$/mi, tagsYaml);
                                    } else {
                                        fmBody = tagsYaml + '\n' + fmBody;
                                    }
                                }
                                const fm = '---\n' + fmBody + '\n---\n';
                                const contentTrimmed = body.replace(/^\n+/, '');
                                newText = fm + '\n' + contentTrimmed;
                            } else {
                                let fmLines = ['---'];
                                const tagArray = extracted;
                                const tagsYaml = tagArray.length > 0 ? ('Tags:\n' + tagArray.map(t => `  - ${t}`).join('\n')) : 'Tags: []';
                                fmLines.push(tagsYaml);
                                if (categoryFromBody) fmLines.push(`Category: ${String(categoryFromBody).replace(/\n/g,' ')}`);
                                fmLines.push('---');
                                newText = fmLines.join('\n') + '\n\n' + body;
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

    applyTextColoringToContentEl(contentEl, cardData) {
        try {
            if (!contentEl || !cardData) return;
            const rules = Array.isArray(this.plugin.settings.autoColorRules) ? this.plugin.settings.autoColorRules : [];
            if (!rules.length) return;
            const body = String(cardData.content || '').toLowerCase();
            const textRules = rules.filter(r => String(r.type || 'text') === 'text' && String(r.match || '').trim().length > 0);
            if (textRules.length === 0) return;

            const processTextNode = (node, lcMatch, colorVar) => {
                try {
                    const text = node.textContent;
                    const lower = text.toLowerCase();
                    let start = 0;
                    let any = false;
                    const frag = document.createDocumentFragment();
                    while (true) {
                        const idx = lower.indexOf(lcMatch, start);
                        if (idx === -1) break;
                        let left = idx;
                        while (left > 0 && !/\s/.test(text[left - 1])) left--;
                        let right = idx + lcMatch.length;
                        while (right < text.length && !/\s/.test(text[right])) right++;
                        const prefix = text.slice(start, left);
                        if (prefix) frag.appendChild(document.createTextNode(prefix));
                        const token = text.slice(left, right);
                        const span = document.createElement('span');
                        span.textContent = token;
                        span.setAttribute('data-auto-color-text', 'true');
                        span.style.color = colorVar;
                        frag.appendChild(span);
                        start = right;
                        any = true;
                    }
                    if (!any) return false;
                    const suffix = text.slice(start);
                    if (suffix) frag.appendChild(document.createTextNode(suffix));
                    node.parentNode.replaceChild(frag, node);
                    return true;
                } catch (_) { return false; }
            };

            const traverse = (el, lcMatch, colorVar) => {
                try {
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
                    const toProcess = [];
                    while (walker.nextNode()) {
                        const n = walker.currentNode;
                        const p = n.parentElement;
                        if (p && p.getAttribute && p.getAttribute('data-auto-color-text') === 'true') continue;
                        if (!n.textContent || n.textContent.trim().length === 0) continue;
                        if (n.textContent.toLowerCase().includes(lcMatch)) toProcess.push(n);
                    }
                    toProcess.forEach(n => processTextNode(n, lcMatch, colorVar));
                } catch (_) {}
            };

            for (const rule of textRules) {
                const lcMatch = String(rule.match || '').toLowerCase();
                if (!lcMatch) continue;
                if (!body.includes(lcMatch)) continue;
                const idx = Number(rule.colorIndex || 1);
                const colorVar = `var(--card-color-${Math.min(Math.max(idx, 1), 10)})`;
                traverse(contentEl, lcMatch, colorVar);
            }
        } catch (_) {}
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

    async applyFilters(skipAnimation = false) {
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

                    // Untagged Check
                    if (visible && untaggedOnly) {
                        const hasTags = !!(c.tags && Array.isArray(c.tags) && c.tags.length > 0);
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

            // Apply DOM changes with FLIP animation for smooth reordering/filtering
            await this.flipAnimateAsync(async () => {
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
            }, { duration: 300 });

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
            if (this.getViewType() === 'sidecards-home') {
                searchWrap.addClass('sidecards-home-search-wrap');
            }
            searchWrap.style.display = 'none';
            searchWrap.style.padding = '6px 8px';
            // searchWrap.style.borderBottom = '1px solid var(--background-modifier-border)';

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

        if (!(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering)) {
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
                const catsAll = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                const cats = catsAll.filter(c => c && c.showInMenu !== false);
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
                        MarkdownRenderer.render(this.app, item.content, tmp, this, item.notePath);
                        const frag = document.createDocumentFragment();
                        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(() => {
                        if (!item.contentEl.isConnected || token !== this._markdownRenderToken) { setTimeout(next, 1); return; }
                        item.contentEl.empty();
                        item.contentEl.appendChild(frag);
                        try {
                            const card = item.contentEl.closest('.card-sidebar-card');
                            if (card) {
                                const cd = (this.cards || []).find(c => c.element === card);
                                if (cd) {
                                    this.applyTextColoringToContentEl(item.contentEl, cd);
                                }
                            }
                        } catch (_) {}
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
                        // If groupTags is enabled, update the grouped tag display
                        if (this.plugin.settings.groupTags && cd.tags && cd.tags.length > 0) {
                            try { this.updateCardTagDisplay(cd); } catch (e) {}
                        }
                    }
                    try {
                        const contentEl = cd.element.querySelector('.card-content');
                        if (contentEl) this.applyTextColoringToContentEl(contentEl, cd);
                    } catch (_) {}
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

    async onClose() {
        try {
            if (this._positionObserver) {
                this._positionObserver.disconnect();
                this._positionObserver = null;
            }
        } catch (e) {}
        await this.saveCards();
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
                notePath: c.notePath || null,
                expiresAt: c.expiresAt || null,
                status: c.status || null
            }));

            // Merge with existing to preserve cards not in current view
            const existing = this.plugin.settings.cards || [];
            const existingMap = new Map(existing.map(c => [c.id, c]));
            
            serial.forEach(card => existingMap.set(card.id, card));
            
            this.plugin.settings.cards = Array.from(existingMap.values());
            await this.plugin.saveSettings();
        } catch (err) {
            console.error('Error saving cards:', err);
        }
    }
}

class SideCardsHomeView extends CardSidebarView {
    constructor(leaf, plugin) {
        super(leaf, plugin);
        this._homeSelectedColor = 'var(--card-color-1)';
        this._homeSelectedTags = [];
        this._homeFilterType = '';
        this._homeFilterValue = '';
    }
    getViewType() {
        return 'sidecards-home';
    }
    getDisplayText() {
        return 'SideCards';
    }
    getIcon() {
        return 'home';
    }
    getAvailableFilters() {
        const filters = [{ type: 'all', label: 'All', value: 'all' }];
        const showTimeBasedChips = !(this.plugin && this.plugin.settings && this.plugin.settings.disableTimeBasedFiltering);
        if (showTimeBasedChips) {
            filters.push({ type: 'category', label: 'Today', value: 'today' });
            filters.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
        }
        try {
            const enabled = !!(this.plugin && this.plugin.settings && this.plugin.settings.enableCustomCategories);
            if (enabled) {
                const cats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                cats.forEach(cat => {
                    if (cat) filters.push({ type: 'category', label: cat.label || '', value: cat.id || cat.label || '' });
                });
            }
        } catch (e) {}
        if (!this.plugin.settings.hideArchivedFilterButton) {
            filters.push({ type: 'archived', label: 'Archived', value: 'archived' });
        }
        return filters;
    }
    getAllUsedTags() {
        try {
            const tags = new Set();
            const allCards = (this.cards && this.cards.length > 0 ? this.cards : (this.plugin.settings.cards || [])) || [];
            allCards.forEach(c => {
                if (c.tags && Array.isArray(c.tags)) {
                    c.tags.forEach(t => tags.add(String(t).toLowerCase()));
                }
            });
            return Array.from(tags).sort();
        } catch (e) { return []; }
    }
    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.addClass('sidecards-home-container');
        const main = container.createDiv({ cls: 'sidecards-home-main' });
        main.style.padding = '32px';
        const title = main.createEl('h2', { text: 'SideCards' });
        title.style.margin = '0 0 12px 0';
        const inputBox = main.createDiv();
        inputBox.addClass('sidecards-home-input');
        inputBox.style.margin = '12px 0';
        const input = inputBox.createEl('textarea');
        input.placeholder = 'Type card content…';
        input.rows = 4;
        input.style.width = '100%';
        input.style.minHeight = '100px';
        input.style.padding = '12px';
        input.style.border = '1px solid var(--background-modifier-border)';
        input.style.borderRadius = '6px';
        input.style.resize = 'vertical';
        const paletteRow = main.createDiv({ cls: 'sidecards-home-palette-row' });
        paletteRow.style.display = 'flex';
        paletteRow.style.gap = '6px';
        paletteRow.style.alignItems = 'center';
        paletteRow.style.marginTop = '8px';
        paletteRow.style.marginBottom = '20px';

        const categoryBtn = paletteRow.createEl('button', { text: 'category', cls: 'sidecards-home-category-btn' });
        categoryBtn.style.padding = '6px 10px';
        categoryBtn.style.border = '1px solid var(--background-modifier-border)';
        categoryBtn.style.borderRadius = '6px';
        categoryBtn.addEventListener('click', (e) => {
            const menu = new Menu(this.app);
            const filters = this.getAvailableFilters();
            filters.forEach(f => {
                menu.addItem(item => {
                    item.setTitle(f.label);
                    item.onClick(() => {
                        this._homeFilterType = f.type;
                        this._homeFilterValue = f.value;
                        categoryBtn.textContent = f.label;
                    });
                });
            });
            const r = categoryBtn.getBoundingClientRect();
            menu.showAtPosition({ x: r.left, y: r.bottom });
        });

        const separator = paletteRow.createDiv({ cls: 'sidecards-home-separator' });
        separator.textContent = '|';
        separator.style.color = 'var(--background-modifier-border)';
        separator.style.margin = '0 8px';
        separator.style.fontSize = '18px';
        separator.style.opacity = '0.6';

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
        const swatches = [];
        colors.forEach(color => {
            const swatch = paletteRow.createDiv({ cls: 'sidecards-home-color-dot' });
            swatch.style.width = '28px';
            swatch.style.height = '28px';
            swatch.style.borderRadius = '4px';
            swatch.style.border = this._homeSelectedColor === color.var ? '2px solid var(--text-accent)' : '2px solid var(--background-modifier-border)';
            const root = document.documentElement;
            const computedColor = getComputedStyle(root).getPropertyValue(color.var.replace('var(', '').replace(')', ''));
            swatch.style.backgroundColor = computedColor.trim() || color.var;
            swatch.style.cursor = 'pointer';
            swatch.style.transition = 'transform 0.15s ease';
            swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.1)'; });
            swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
            swatch.addEventListener('click', () => {
                swatches.forEach(s => { s.style.border = '2px solid var(--background-modifier-border)'; });
                swatch.style.border = '2px solid var(--text-accent)';
                this._homeSelectedColor = color.var;
            });
            swatches.push(swatch);
        });

        // Add Autocomplete to Home View Input
        const autocompleteWrap = main.createDiv({ cls: 'sidecards-home-autocomplete-wrap' });
        autocompleteWrap.style.position = 'relative';
        autocompleteWrap.appendChild(inputBox);

        const homeTagAutocompleteContainer = autocompleteWrap.createDiv({ cls: 'card-tag-autocomplete' });
        homeTagAutocompleteContainer.style.display = 'none';
        homeTagAutocompleteContainer.style.position = 'absolute';
        homeTagAutocompleteContainer.style.bottom = 'calc(100% + 4px)';
        homeTagAutocompleteContainer.style.left = '0';
        homeTagAutocompleteContainer.style.right = '0';
        homeTagAutocompleteContainer.style.maxHeight = '150px';
        homeTagAutocompleteContainer.style.overflowY = 'auto';
        homeTagAutocompleteContainer.style.border = '1px solid var(--background-modifier-border)';
        homeTagAutocompleteContainer.style.borderRadius = '4px';
        homeTagAutocompleteContainer.style.background = 'var(--background-primary)';
        homeTagAutocompleteContainer.style.zIndex = '1000';

        const homeGroupAutocompleteContainer = autocompleteWrap.createDiv({ cls: 'card-group-autocomplete' });
        homeGroupAutocompleteContainer.style.display = 'none';
        homeGroupAutocompleteContainer.style.position = 'absolute';
        homeGroupAutocompleteContainer.style.bottom = 'calc(100% + 4px)';
        homeGroupAutocompleteContainer.style.left = '0';
        homeGroupAutocompleteContainer.style.right = '0';
        homeGroupAutocompleteContainer.style.maxHeight = '150px';
        homeGroupAutocompleteContainer.style.overflowY = 'auto';
        homeGroupAutocompleteContainer.style.border = '1px solid var(--background-modifier-border)';
        homeGroupAutocompleteContainer.style.borderRadius = '4px';
        homeGroupAutocompleteContainer.style.background = 'var(--background-primary)';
        homeGroupAutocompleteContainer.style.zIndex = '999';

        let homeTagSelectedIndex = -1;
        let homeGroupSelectedIndex = -1;

        const updateHomeTagAutocomplete = () => {
            try {
                const cursorPos = input.selectionStart;
                const textBeforeCursor = input.value.substring(0, cursorPos);
                const lastHashIdx = textBeforeCursor.lastIndexOf('#');
                if (lastHashIdx === -1 || lastHashIdx < textBeforeCursor.length - 1) {
                    homeTagAutocompleteContainer.style.display = 'none';
                    return;
                }
                const currentWord = textBeforeCursor.substring(lastHashIdx + 1).toLowerCase();
                const allTags = this.getAllUsedTags();
                const suggestions = allTags.filter(t => t.startsWith(currentWord)).slice(0, 8);
                if (suggestions.length === 0 && currentWord.length > 0) {
                    homeTagAutocompleteContainer.style.display = 'none';
                    return;
                }
                homeTagAutocompleteContainer.empty();
                homeTagSelectedIndex = -1;
                const displayTags = currentWord.length === 0 ? allTags.slice(0, 8) : suggestions;
                if (displayTags.length === 0) {
                    homeTagAutocompleteContainer.style.display = 'none';
                    return;
                }
                displayTags.forEach((tag, idx) => {
                    const item = homeTagAutocompleteContainer.createDiv();
                    item.style.padding = '4px 8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid var(--background-modifier-border)';
                    item.textContent = '#' + tag;
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--background-modifier-hover)';
                        homeTagSelectedIndex = idx;
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = '';
                    });
                    item.addEventListener('click', () => {
                        const before = input.value.substring(0, lastHashIdx);
                        const after = input.value.substring(cursorPos);
                        input.value = before + '#' + tag + ' ' + after;
                        input.selectionStart = input.selectionEnd = before.length + tag.length + 2;
                        input.focus();
                        updateHomeTagAutocomplete();
                    });
                });
                homeTagAutocompleteContainer.style.display = '';
            } catch (e) {}
        };

        const updateHomeGroupAutocomplete = () => {
            try {
                const cursorPos = input.selectionStart;
                const textBeforeCursor = input.value.substring(0, cursorPos);
                const lines = textBeforeCursor.split('\n');
                const currentLine = lines[lines.length - 1];
                const atIdx = currentLine.lastIndexOf('@');
                if (atIdx === -1) {
                    homeGroupAutocompleteContainer.style.display = 'none';
                    return;
                }
                const currentWord = currentLine.substring(atIdx + 1).toLowerCase();
                const groups = ['all', 'today', 'tomorrow'];
                const customCats = Array.isArray(this.plugin.settings.customCategories) ? this.plugin.settings.customCategories : [];
                const allSuggestions = [
                    ...groups.map(g => ({ text: '@' + g, label: g })),
                    ...customCats.map(c => ({ text: '@' + (c.id || c.label), label: c.label || c.id }))
                ];
                const suggestions = currentWord.length === 0 
                    ? allSuggestions
                    : allSuggestions.filter(s => s.text.substring(1).startsWith(currentWord)).slice(0, 8);
                if (suggestions.length === 0) {
                    homeGroupAutocompleteContainer.style.display = 'none';
                    return;
                }
                homeGroupAutocompleteContainer.empty();
                homeGroupSelectedIndex = -1;
                suggestions.forEach(({ text, label }, idx) => {
                    const item = homeGroupAutocompleteContainer.createDiv();
                    item.style.padding = '4px 8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid var(--background-modifier-border)';
                    item.style.fontSize = '12px';
                    item.textContent = label;
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--background-modifier-hover)';
                        homeGroupSelectedIndex = idx;
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = '';
                    });
                    item.addEventListener('click', () => {
                        const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
                        const atAbs = lineStart + atIdx;
                        const before = input.value.substring(0, atAbs);
                        const after = input.value.substring(cursorPos);
                        input.value = before + text + ' ' + after;
                        input.selectionStart = input.selectionEnd = before.length + text.length + 1;
                        input.focus();
                        updateHomeGroupAutocomplete();
                    });
                });
                homeGroupAutocompleteContainer.style.display = '';
            } catch (e) {}
        };

        input.addEventListener('input', () => {
            updateHomeTagAutocomplete();
            updateHomeGroupAutocomplete();
        });

        input.addEventListener('keydown', (e) => {
            // Group Autocomplete Navigation
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && homeGroupAutocompleteContainer.style.display !== 'none') {
                e.preventDefault();
                const items = homeGroupAutocompleteContainer.querySelectorAll('div');
                if (items.length === 0) return;
                if (e.key === 'ArrowDown') homeGroupSelectedIndex = (homeGroupSelectedIndex + 1) % items.length;
                else homeGroupSelectedIndex = (homeGroupSelectedIndex - 1 + items.length) % items.length;
                items.forEach((item, idx) => { item.style.background = idx === homeGroupSelectedIndex ? 'var(--background-modifier-hover)' : ''; });
                return;
            }
            if (e.key === 'Enter' && homeGroupAutocompleteContainer.style.display !== 'none' && homeGroupSelectedIndex >= 0) {
                e.preventDefault();
                const items = homeGroupAutocompleteContainer.querySelectorAll('div');
                if (items[homeGroupSelectedIndex]) items[homeGroupSelectedIndex].click();
                return;
            }
            // Tag Autocomplete Navigation
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && homeTagAutocompleteContainer.style.display !== 'none') {
                e.preventDefault();
                const items = homeTagAutocompleteContainer.querySelectorAll('div');
                if (items.length === 0) return;
                if (e.key === 'ArrowDown') homeTagSelectedIndex = (homeTagSelectedIndex + 1) % items.length;
                else homeTagSelectedIndex = (homeTagSelectedIndex - 1 + items.length) % items.length;
                items.forEach((item, idx) => { item.style.background = idx === homeTagSelectedIndex ? 'var(--background-modifier-hover)' : ''; });
                return;
            }
            if (e.key === 'Enter' && homeTagAutocompleteContainer.style.display !== 'none' && homeTagSelectedIndex >= 0) {
                e.preventDefault();
                const items = homeTagAutocompleteContainer.querySelectorAll('div');
                if (items[homeTagSelectedIndex]) items[homeTagSelectedIndex].click();
                return;
            }
        });

        const toolbarRow = main.createDiv({ cls: 'sidecards-home-toolbar' });
        toolbarRow.style.display = 'flex';
        toolbarRow.style.gap = '6px';
        toolbarRow.style.alignItems = 'center';

        // Reload button
        const reloadBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-reload-btn' });
        reloadBtn.style.background = 'none';
        reloadBtn.style.border = '1px solid var(--background-modifier-border)';
        reloadBtn.style.borderRadius = '6px';
        reloadBtn.style.cursor = 'pointer';
        reloadBtn.style.padding = '6px';
        reloadBtn.style.color = 'var(--text-muted)';
        reloadBtn.title = 'Reload cards';
        try { setIcon(reloadBtn, 'refresh-cw'); } catch (e) { reloadBtn.textContent = '↻'; }
        reloadBtn.addEventListener('mouseenter', () => { reloadBtn.style.color = 'var(--text-normal)'; });
        reloadBtn.addEventListener('mouseleave', () => { reloadBtn.style.color = 'var(--text-muted)'; });
        reloadBtn.addEventListener('click', async () => {
            try {
                await this.loadCards(this._lastLoadArchived || false);
                new Notice('Cards reloaded');
            } catch (err) {
                console.error('Error reloading cards:', err);
            }
        });

        // Untagged button
        const untaggedBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-untagged-btn' });
        untaggedBtn.style.background = 'none';
        untaggedBtn.style.border = '1px solid var(--background-modifier-border)';
        untaggedBtn.style.borderRadius = '6px';
        untaggedBtn.style.cursor = 'pointer';
        untaggedBtn.style.padding = '6px';
        untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
        untaggedBtn.title = 'Show untagged only';
        try { setIcon(untaggedBtn, 'tag'); } catch (e) { untaggedBtn.textContent = '∅'; }
        untaggedBtn.addEventListener('mouseenter', () => { untaggedBtn.style.color = 'var(--text-normal)'; });
        untaggedBtn.addEventListener('mouseleave', () => { untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)'; });
        untaggedBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            this.activeFilters.untaggedOnly = !this.activeFilters.untaggedOnly;
            untaggedBtn.style.color = this.activeFilters.untaggedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
            await this.applyFilters();
        });

        // Pinned button
        const pinToggleBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-pinned-btn' });
        pinToggleBtn.style.background = 'none';
        pinToggleBtn.style.border = '1px solid var(--background-modifier-border)';
        pinToggleBtn.style.borderRadius = '6px';
        pinToggleBtn.style.cursor = 'pointer';
        pinToggleBtn.style.padding = '6px';
        pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
        pinToggleBtn.title = 'Show pinned only';
        try { setIcon(pinToggleBtn, 'pin'); } catch (e) { pinToggleBtn.textContent = '📌'; }
        pinToggleBtn.addEventListener('mouseenter', () => { pinToggleBtn.style.color = 'var(--text-normal)'; });
        pinToggleBtn.addEventListener('mouseleave', () => { pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)'; });
        pinToggleBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                this.plugin.settings.showPinnedOnly = !this.plugin.settings.showPinnedOnly;
                await this.plugin.saveSettings();
                pinToggleBtn.style.color = this.plugin.settings.showPinnedOnly ? 'var(--interactive-accent)' : 'var(--text-muted)';
                await this.applyFilters();
            } catch (err) { console.error('Error toggling showPinnedOnly', err); }
        });

        // Grid toggle button
        const gridToggleBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-grid-toggle-btn' });
        gridToggleBtn.style.background = 'none';
        gridToggleBtn.style.border = '1px solid var(--background-modifier-border)';
        gridToggleBtn.style.borderRadius = '6px';
        gridToggleBtn.style.cursor = 'pointer';
        gridToggleBtn.style.padding = '6px';
        gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)';
        gridToggleBtn.title = 'Toggle grid layout';
        try { setIcon(gridToggleBtn, 'layout-grid'); } catch (e) { gridToggleBtn.textContent = '▦'; }
        gridToggleBtn.addEventListener('mouseenter', () => { gridToggleBtn.style.color = 'var(--text-normal)'; });
        gridToggleBtn.addEventListener('mouseleave', () => { gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)'; });
        gridToggleBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                this.plugin.settings.verticalCardMode = !this.plugin.settings.verticalCardMode;
                await this.plugin.saveSettings();
                gridToggleBtn.style.color = this.plugin.settings.verticalCardMode ? 'var(--text-normal)' : 'var(--text-muted)';
                this.applyLayoutMode();
            } catch (err) { console.error('Error toggling grid layout', err); }
        });

        const sortIconBtn = toolbarRow.createEl('button', { cls: 'sidecards-home-sort-btn' });
        sortIconBtn.style.background = 'none';
        sortIconBtn.style.border = '1px solid var(--background-modifier-border)';
        sortIconBtn.style.borderRadius = '6px';
        sortIconBtn.style.cursor = 'pointer';
        sortIconBtn.style.padding = '6px';
        sortIconBtn.style.color = 'var(--text-muted)';
        try { setIcon(sortIconBtn, this.plugin.settings.sortAscending ? 'sort-asc' : 'sort-desc'); } catch (e) { sortIconBtn.textContent = this.plugin.settings.sortAscending ? '↑' : '↓'; }
        sortIconBtn.addEventListener('mouseenter', () => { sortIconBtn.style.color = 'var(--text-normal)'; });
        sortIconBtn.addEventListener('mouseleave', () => { sortIconBtn.style.color = 'var(--text-muted)'; });
        sortIconBtn.addEventListener('click', (e) => {
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
                            if (currentMode === newMode) return;
                            this.plugin.settings.sortMode = newMode;
                            if (this.plugin.saveSettings) await this.plugin.saveSettings();
                            if (typeof this.applySort === 'function') await this.applySort(newMode, this.plugin.settings.sortAscending);
                        } catch (err) {}
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
                        try { setIcon(sortIconBtn, this.plugin.settings.sortAscending ? 'sort-asc' : 'sort-desc'); } catch (e) { sortIconBtn.textContent = this.plugin.settings.sortAscending ? '↑' : '↓'; }
                        if (typeof this.applySort === 'function') await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending);
                    } catch (err) {}
                });
            });
            menu.showAtMouseEvent(e);
        });
        this.createSearchBar(toolbarRow);
        if (this._searchWrap) {
            this._searchWrap.style.display = '';
            this._searchWrap.style.flex = '1';
        }
        this.cardsContainer = main.createDiv({ cls: 'cards-container card-sidebar-cards-container' });
        this.applyLayoutMode();
        await this.loadCards(false);
        input.addEventListener('keydown', (e) => {
            let pressed = '';
            if (e.ctrlKey) pressed += 'ctrl-';
            if (e.shiftKey) pressed += 'shift-';
            if (e.altKey) pressed += 'alt-';
            if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
            const normalizeKey = (v) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const saveKey = normalizeKey(this.plugin.settings.saveKey || 'enter');
            if (pressed === saveKey || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
                e.preventDefault();
                this.addCardFromInput(input, {
                    filterType: this._homeFilterType,
                    filterValue: this._homeFilterValue,
                    selectedColor: this._homeSelectedColor,
                    tags: this._homeSelectedTags
                });
                this._homeSelectedTags = [];
            }
        });
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

    new Setting(containerEl)
        .setName('Card Sidebar Settings')
        .setHeading();

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

    new Setting(containerEl)
        .setName('Colors')
        .setDesc('Customize card colors. Names are written to notes if frontmatter is missing.')
        .setHeading();

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

    new Setting(containerEl)
        .setName('Appearance')
        .setDesc('Customize how your cards and sidebar look.')
        .setHeading();

    new Setting(containerEl)
        .setName('Card Styling')
        .setHeading();

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

            
    new Setting(containerEl)
        .setName('Animation')
        .setHeading();

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
        .setName('Visibility')
        .setHeading();

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
                            MarkdownRenderer.render(this.app, String(cd.content || ''), el, this, cd.notePath || '');
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
        .setName('Hide Categories Topbar')
        .setDesc('When enabled, the topbar containing category buttons are hidden.')
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

    new Setting(containerEl)
        .setName('Layout')
        .setHeading();

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


    
    new Setting(containerEl)
        .setName('Categories')
        .setDesc('Configure how categories are displayed and reordered.')
        .setHeading();

    new Setting(containerEl)
        .setName('Enable Custom Categories')
        .setDesc('When enabled, custom category buttons appear in the card right-click menu')
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
        .setName('Disable Time-based Categories')
        .setDesc('Hides the default Today / Tomorrow Categories')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.disableTimeBasedFiltering || false)
            .onChange(async (value) => {
                this.plugin.settings.disableTimeBasedFiltering = value;
                await this.plugin.saveSettings();
                try { renderCategories(); } catch (e) {}
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
        .setName('Disable Archived category')
        .setDesc('When enabled, Archived is omitted from header and the reorder panel.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.hideArchivedFilterButton || false)
            .onChange(async (value) => {
                this.plugin.settings.hideArchivedFilterButton = value;
                await this.plugin.saveSettings();
                try { renderCategories(); } catch (e) {}
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

        const defaultCombined = ['filter-all']
            .concat(this.plugin.settings.disableTimeBasedFiltering ? [] : ['filter-today', 'filter-tomorrow'])
            .concat(this.plugin.settings.hideArchivedFilterButton ? [] : ['filter-archived'])
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
            resetBtn.title = 'Reset colors';
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
            if (this.plugin.settings.hideArchivedFilterButton) return;
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
            txt.addEventListener('change', async (e) => {
                const i = list.findIndex(x => String(x.id || '') === String(cat.id || ''));
                if (i >= 0) {
                    const newLabel = e.target.value || '';
                    const slugBase = String(newLabel).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const existingIds = new Set(list.map(c => String(c.id || '').toLowerCase()).filter(id => id !== String(cat.id || '').toLowerCase()));
                    let newId = slugBase || 'category';
                    let k = 2;
                    while (existingIds.has(newId)) { newId = (slugBase || 'category') + '-' + k; k++; }
                    const oldId = this.plugin.settings.customCategories[i].id;
                    this.plugin.settings.customCategories[i].label = newLabel;
                    this.plugin.settings.customCategories[i].id = newId;
                    if (Array.isArray(this.plugin.settings.allItemsOrder)) {
                        const idx = this.plugin.settings.allItemsOrder.findIndex(x => String(x) === String(oldId));
                        if (idx >= 0) this.plugin.settings.allItemsOrder[idx] = newId;
                    }
                    await this.plugin.saveSettings();
                    renderCategories();
                    const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                    if (view) {
                        const main = view.containerEl.querySelector('.card-sidebar-main');
                        const old = main?.querySelector('.card-sidebar-header');
                        if (old) old.remove();
                        if (main) view.createHeader(main);
                    }
                }
            });

            const showToggle = row.createEl('button');
            try { setIcon(showToggle, (cat.showInMenu !== false) ? 'eye' : 'eye-off'); } catch (e) { showToggle.textContent = (cat.showInMenu !== false) ? '👁' : '⊘'; }
            showToggle.title = (cat.showInMenu !== false) ? 'Hide filter button' : 'Show filter button';
            showToggle.style.width = '40px';
            showToggle.addEventListener('click', async () => {
                const i = list.findIndex(x => String(x.id || '') === String(cat.id || ''));
                if (i >= 0) {
                    this.plugin.settings.customCategories[i].showInMenu = !cat.showInMenu;
                    await this.plugin.saveSettings();
                    renderCategories();
                    // Refresh sidebar to show/hide filter button
                    try {
                        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view;
                        if (view) {
                            const main = view.containerEl.querySelector('.card-sidebar-main');
                            const old = main?.querySelector('.card-sidebar-header');
                            if (old) old.remove();
                            if (main) view.createHeader(main);
                        }
                    } catch (e) {}
                    try { setIcon(showToggle, (this.plugin.settings.customCategories[i].showInMenu !== false) ? 'eye' : 'eye-off'); } catch (e) {}
                    showToggle.title = (this.plugin.settings.customCategories[i].showInMenu !== false) ? 'Hide filter button' : 'Show filter button';
                }
            });

            const del = row.createEl('button'); del.textContent = 'Remove'; del.addClass('mod-warning');
            del.addEventListener('click', async () => { const i = list.findIndex(x => String(x.id || '') === String(cat.id || '')); if (i >= 0) { this.plugin.settings.customCategories.splice(i, 1); await this.plugin.saveSettings(); renderCategories(); } });

            row.appendChild(handle); row.appendChild(textColorPicker); row.appendChild(bgColorPicker); row.appendChild(resetBtn); row.appendChild(txt); row.appendChild(showToggle); row.appendChild(del);
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
        addRow.style.justifyContent = 'flex-end';

        const addBtn = addRow.createEl('button');
        addBtn.textContent = 'Add Category';
        addBtn.style.marginTop = '4px';
        addBtn.addClass('mod-cta');
        addBtn.addEventListener('click', async () => {
            if (!Array.isArray(this.plugin.settings.customCategories)) this.plugin.settings.customCategories = [];
            const slug = 'new';
            const existing = new Set(this.plugin.settings.customCategories.map(c => String(c.id || '').toLowerCase()));
            let id = slug;
            let i = 2;
            while (existing.has(id)) { id = slug + '-' + i; i++; }
            this.plugin.settings.customCategories.push({ id, label: 'New', showInMenu: true });
            if (!Array.isArray(this.plugin.settings.allItemsOrder) || this.plugin.settings.allItemsOrder.length === 0) {
                const defaultCombined = ['filter-all', 'filter-today', 'filter-tomorrow']
                    .concat(this.plugin.settings.customCategories.map(c => String(c.id || '')));
                this.plugin.settings.allItemsOrder = defaultCombined;
            } else {
                const order = this.plugin.settings.allItemsOrder;
                if (!order.includes(id)) order.push(id);
            }
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

    new Setting(containerEl)
        .setName('Behaviour')
        .setDesc('Configure how you interact with cards and the sidebar.')
        .setHeading();

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

    new Setting(containerEl)
        .setName('Automation')
        .setDesc('Settings for automated card handling.')
        .setHeading();

    new Setting(containerEl)
        .setName('Auto-archive on expiry')
        .setDesc('Automatically archive cards when expiry time passes')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.autoArchiveOnExpiry != null ? this.plugin.settings.autoArchiveOnExpiry : false)
            .onChange(async (value) => {
                this.plugin.settings.autoArchiveOnExpiry = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Auto Color')
        .setDesc('Cards can inherit a color based on text or tags. Choose rules below; names are used when card-color frontmatter is absent.')
        .setHeading();

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

    new Setting(containerEl)
        .setName('Status')
        .setDesc('Dropdown colors take precedence over custom unless the dropdown is set to [custom].')
        .setHeading();

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

        this.registerView(
            'sidecards-home',
            (leaf) => new SideCardsHomeView(leaf, this)
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

        this.addCommand({
            id: 'open-home-view',
            name: 'Open home view',
            callback: () => {
                this.activateHomeView();
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
            showTimestamps: false,
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

            const hoverId = 'card-hover-animated';
            let hoverEl = document.getElementById(hoverId);
            if (hoverEl) hoverEl.remove();
            if (this.settings.animatedCards) {
                hoverEl = document.createElement('style');
                hoverEl.id = hoverId;
                hoverEl.textContent = ` .card-sidebar-card:hover { transform: translateY(-2px); transition: transform 0.2s ease-out; } `;
                document.head.appendChild(hoverEl);
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

    async activateHomeView() {
        const existing = this.app.workspace.getLeavesOfType('sidecards-home');
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        let leaf = null;
        try {
            leaf = this.app.workspace.getLeaf(true);
        } catch (e) {
            leaf = this.app.workspace.getLeaf(true);
        }
        if (leaf) {
            await leaf.setViewState({
                type: 'sidecards-home',
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
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

module.exports = require('./main.js').default
