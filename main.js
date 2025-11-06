const { Plugin, ItemView, Setting, PluginSettingTab, Modal, Menu, Notice, setIcon, MarkdownView } = require('obsidian');

class CardSidebarView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.cards = [];
        this.activeFilters = { query: '', tags: [] };
        this.currentRecurrenceFilter = 'all';
    }

    // convert hex color to rgba with alpha
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

    // resolve CSS variable to hex color value
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

    // Apply color styling to card element based on selected style
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

        // Show a short loading overlay while bringing in cards
        try { this.showLoadingOverlay(); } catch (e) {}
        try {
            await this.loadCards(false);
        } catch (e) {
            console.error('Error during loadCards onOpen:', e);
        }

        // Ensure recurrence filtering (which hides archived items for 'all') runs first,
        // then apply the active search/pinned filters. This prevents archived cards from
        // appearing in the 'All' view on initial load.
        try { if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all'); } catch (e) {}
        try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}

        // Now that the filtered set is rendered, hide the loading overlay and trigger
        // the fade of visible cards (300ms) so the opacity animation only begins
        // once the filtered cards are ready.
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
        header.addClass('card-sidebar-header');
        header.style.display = 'flex';
        

        if (!this.plugin.settings.disableFilterButtons) {
            const filterGroup = header.createDiv('filter-group');
            filterGroup.style.display = 'flex';
            filterGroup.style.gap = '8px';
            const filters = ['All', 'Daily', 'Weekly', 'Monthly'];
            if (!this.plugin.settings.hideArchivedFilterButton) filters.push('Archived');

            filters.forEach(filter => {
                const btn = filterGroup.createEl('button', { text: filter });
                btn.addClass('card-filter-btn');
                btn.style.padding = '4px 8px';
                btn.style.borderRadius = 'var(--button-radius)';
                btn.style.border = '1px solid var(--background-modifier-border)';
                btn.style.background = 'var(--background-primary)';
                btn.style.color = 'var(--text-muted)';
                btn.style.cursor = 'pointer';
                btn.style.fontSize = '12px';
                
                btn.addEventListener('mouseenter', () => {
                    btn.style.backgroundColor = 'var(--background-modifier-hover)';
                });
                
                btn.addEventListener('mouseleave', () => {
                    if (!btn.hasClass('active')) {
                        btn.style.backgroundColor = 'var(--background-primary)';
                    }
                });
                
                btn.addEventListener('click', async () => {
                    const recurrence = String(filter || '').toLowerCase();
                    try { this.currentRecurrenceFilter = recurrence; } catch (e) { this.currentRecurrenceFilter = 'all'; }
                    filterGroup.querySelectorAll('.card-filter-btn').forEach(b => {
                        b.removeClass('active');
                        b.style.backgroundColor = 'var(--background-primary)';
                        b.style.color = 'var(--text-muted)';
                    });

                    const wasActive = btn.hasClass('active');
                    btn.removeClass('active');

                    if (wasActive) {
                        try { this.showLoadingOverlay(); } catch (e) {}
                        try {
                            // Immediately hide existing cards so only the filtered set
                            // will appear and animate. Use visibility to preserve layout
                            // and avoid flashes of the old content.
                            try {
                                if (this.cardsContainer) {
                                    const oldCards = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
                                    oldCards.forEach(c => { try { c.style.visibility = 'hidden'; } catch (e) {} });
                                }
                            } catch (e) {}

                            // allow the browser a tick to apply the visibility change
                            await new Promise(r => setTimeout(r, 20));

                            await this.loadCards(false, null);
                            this.filterCardsByRecurrence('all');

                            // Animate the entrance of the visible (filtered) cards
                            try { this.animateCardsEntrance({ duration: 300, offset: 28 }); } catch (e) {}
                        } finally {
                            try { this.hideLoadingOverlay(300); } catch (e) {}
                        }
                        return;
                    }

                    // mark active visually before running the flip animation so the
                    // measured 'before' state includes the button change if it affects layout
                    btn.addClass('active');
                    btn.style.backgroundColor = 'var(--background-modifier-hover)';
                    btn.style.color = 'var(--text-normal)';

                    try { this.showLoadingOverlay(); } catch (e) {}
                    try {
                        // Hide existing cards immediately so only the newly filtered
                        // set is visible and animated. This avoids ghost frames of
                        // the previous set appearing during the transition.
                        try {
                            if (this.cardsContainer) {
                                const oldCards = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
                                oldCards.forEach(c => { try { c.style.visibility = 'hidden'; } catch (e) {} });
                            }
                        } catch (e) {}

                        await new Promise(r => setTimeout(r, 20));

                        if (recurrence === 'archived') {
                            await this.loadCards(true, null);
                        } else {
                            await this.loadCards(false, recurrence);
                        }

                        this.filterCardsByRecurrence(recurrence);

                        try { this.animateCardsEntrance({ duration: 300, offset: 28 }); } catch (e) {}
                    } finally {
                        try { this.hideLoadingOverlay(300); } catch (e) {}
                    }
                });
            });
        }
    }

    // Loading overlay helpers
    showLoadingOverlay() {
        try {
            if (!this.containerEl) return;
            if (this._loadingOverlay) return;
            const overlay = this.containerEl.createDiv();
            overlay.addClass('card-sidebar-loading-overlay');
            overlay.style.position = 'absolute';
            overlay.style.inset = '0';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.background = 'var(--background-modifier-transparent)';
            overlay.style.zIndex = '999';

            const box = overlay.createDiv();
            box.style.padding = '12px 16px';
            box.style.borderRadius = '8px';
            box.style.background = 'var(--background-secondary)';
            box.style.boxShadow = 'var(--shadow-elevation-2)';
            box.style.color = 'var(--text-normal)';
            box.style.fontSize = '13px';
            box.textContent = 'Loading cards...';

            this._loadingOverlay = overlay;
            // Keep overlay present in the DOM for logic, but keep it hidden
            try { this._loadingOverlay.style.display = 'none'; } catch (e) {}
        } catch (e) {
            console.error('Error showing loading overlay:', e);
        }
    }

    hideLoadingOverlay() {
        try {
            if (this._loadingOverlay) {
                try { this._loadingOverlay.remove(); } catch (e) {}
                this._loadingOverlay = null;
            }
        } catch (e) {
            console.error('Error hiding loading overlay:', e);
        }
    }
    
    filterCardsByRecurrence(filter) {
        console.log('Filtering by:', filter);
        const cards = this.cardsContainer.querySelectorAll('.card-sidebar-card');
        const now = new Date();
        
        cards.forEach(card => {
            const cardData = this.cards.find(c => c.element === card);
            if (!cardData) return;
            
            if (filter === 'all') {
                const isArchived = !!cardData.archived;
                card.style.display = isArchived ? 'none' : '';
                return;
            }

            const created = new Date(cardData.created);
            let show = false;

            if (filter === 'archived') {
                show = !!cardData.archived;
                card.style.display = show ? '' : 'none';
                return;
            }

            switch (filter) {
                case 'daily':
                    show = !cardData.archived && cardData.recurrence === 'daily';
                    break;
                case 'weekly':
                    show = !cardData.archived && cardData.recurrence === 'weekly';
                    break;
                case 'monthly':
                    show = !cardData.archived && cardData.recurrence === 'monthly';
                    break;
                default:
                    show = !cardData.archived;
            }

            card.style.display = show ? '' : 'none';
        });
        
        const filterBtns = this.containerEl.querySelectorAll('.card-filter-btn');
        filterBtns.forEach(btn => {
            if (btn.textContent.toLowerCase() === filter) {
                btn.addClass('active');
                btn.style.backgroundColor = 'var(--background-modifier-hover)';
                btn.style.color = 'var(--text-normal)';
            } else {
                btn.removeClass('active');
                btn.style.backgroundColor = 'var(--background-primary)';
                btn.style.color = 'var(--text-muted)';
            }
        });

        if (this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly) {
            this.cards.forEach(cd => {
                try {
                    if (cd && cd.element) cd.element.style.display = cd.pinned ? '' : 'none';
                } catch (e) { }
            });
        }
        try { this.animateCardsEntrance(); } catch (e) {}
    }

    // Slide-up entrance for visible cards (uses `animatedCards` setting).
    animateCardsEntrance(options = {}) {
        try {
            if (!this.plugin || !this.plugin.settings) return;
            if (!this.cardsContainer) return;

            // Respect reduced motion
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            // Only run slide animation when animatedCards is enabled
            if (!this.plugin.settings.animatedCards) return;

            const els = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'))
                .filter(el => el && el.style && el.style.display !== 'none');
            if (!els || els.length === 0) return;

            const duration = options.duration != null ? options.duration : 260;
            const stagger = options.stagger != null ? options.stagger : 28;

            // Prepare initial state: slide-only from below into place. Use a fixed
            // positive offset so cards always animate upward.
            const offsetPx = options.offset != null ? Number(options.offset) : 28;
            els.forEach(el => {
                try {
                    el.style.transition = 'none';
                    // Ensure any elements hidden earlier (visibility:hidden) are
                    // revealed before running the entrance transform.
                    try { el.style.visibility = ''; } catch (e) {}
                    el.style.transform = `translateY(${offsetPx}px)`;
                    el.style.willChange = 'transform';
                } catch (e) { }
            });

            // Force reflow
            void this.cardsContainer.offsetHeight;

            // Play animations with small stagger (transform only)
            els.forEach((el, i) => {
                const delay = i * stagger;
                setTimeout(() => {
                    try {
                        el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
                        el.style.transform = '';
                    } catch (e) { }
                }, delay);
            });

            // Cleanup after max duration + stagger
            const total = duration + (els.length * stagger) + 50;
            setTimeout(() => {
                els.forEach(el => {
                    try {
                        el.style.transition = '';
                        el.style.willChange = '';
                        el.style.transform = '';
                    } catch (e) { }
                });
            }, total);
        } catch (err) {
            console.error('Error running animateCardsEntrance:', err);
        }
    }

    // FLIP wrapper: animate DOM reorder/show/hide when enabled.
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

            // Map old positions by card id
            const oldEls = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'));
            const oldMap = new Map();
            oldEls.forEach(el => {
                try {
                    const id = el.dataset && el.dataset.id;
                    if (!id) return;
                    oldMap.set(id, el.getBoundingClientRect());
                } catch (e) {}
            });

            // Perform DOM change
            await asyncDomChange();

            // New elements after change
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

            // Apply inverse transforms (vertical-only) to animate movement.
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
                    // Slide in Animation Y Axis
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${dy}px)`;
                    el.style.willChange = 'transform';
                } catch (e) { }
            });

            // always animate upward into place. down > up
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

            // Force reflow
            void this.cardsContainer.offsetHeight;

            ids.forEach((id, i) => {
                const el = elById.get(id);
                if (!el) return;
                const delay = i * stagger;
                setTimeout(() => {
                    try {
                        // Prepare existing vs new element lists
                        const existingIds = [];
                        const newIds = [];
                        ids.forEach(id => {
                            if (oldMap.has(id)) existingIds.push(id);
                            else newIds.push(id);
                        });

                        // FLIP inverse transform
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

                        // New elements: hide them and position below so they don't flash at final spot
                        newIds.forEach(id => {
                            try {
                                const el = elById.get(id);
                                if (!el) return;
                                el.style.transition = 'none';
                                el.style.transform = `translateY(${entranceOffset}px)`;
                                el.style.willChange = 'transform';
                                // hide until we start the transition to avoid ghosting
                                el.style.visibility = 'hidden';
                            } catch (e) { }
                        });

                        el.style.transform = '';
                    } catch (e) {}
                });
            }, total);
        } catch (err) {
            console.error('Error in flipAnimateAsync:', err);
            // fallback to just doing the change if not already executed
            try { await asyncDomChange(); } catch (e) {}
        }
    }

    // Show loading overlay (attached to cards container when available).
    showLoadingOverlay(maxMs = 2000) {
        try {
            // Prefer attaching the overlay to the cards area so it doesn't cover the header/filter chips.
            const parent = this.cardsContainer || this.containerEl;
            if (!parent) return;

            if (!this._loadingEl) {
                const overlay = parent.createDiv();
                overlay.addClass('card-sidebar-loading');
                // Ensure parent can be the positioning context
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

                // basic keyframes (inject once)
                if (!document.getElementById('card-sidebar-loading-anim')) {
                    const s = document.createElement('style');
                    s.id = 'card-sidebar-loading-anim';
                    s.textContent = `@keyframes card-sidebar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
                    document.head.appendChild(s);
                }

                this._loadingEl = overlay;
            }

            // Keep the loading element hidden visually while preserving its
            // presence in the DOM for later removal or debugging.
            try { this._loadingEl.style.display = 'none'; } catch (e) {}

            if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
            this._loadingTimeout = setTimeout(() => {
                try { if (this._loadingEl) { try { this._loadingEl.remove(); } catch (e) { this._loadingEl.style.display = 'none'; } this._loadingEl = null; } } catch (e) {}
            }, Math.max(0, Number(maxMs) || 2000));
        } catch (err) {
            console.error('Error showing loading overlay:', err);
        }
    }

    // Hide loading overlay and optionally trigger a card opacity fade.
    hideLoadingOverlay(fadeMs = 0) {
        try {
            if (this._loadingTimeout) { clearTimeout(this._loadingTimeout); this._loadingTimeout = null; }
            if (this._loadingEl) {
                try { this._loadingEl.remove(); } catch (e) { try { this._loadingEl.style.display = 'none'; } catch (ee) {} }
                this._loadingEl = null;
            }

            // Determine whether to run the opacity fade based on settings.
            try {
                // Respect the disableCardFadeIn setting: when true, skip the opacity
                // fade unless animatedCards is enabled (per user preference, animated
                // cards are unaffected by this toggle).
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

    // Fade visible cards (opacity) over `duration` milliseconds.
    fadeVisibleCards(duration = 300) {
        try {
            if (!this.cardsContainer) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const els = Array.from(this.cardsContainer.querySelectorAll('.card-sidebar-card'))
                .filter(el => el && el.style && el.style.display !== 'none');
            if (!els || els.length === 0) return;

            // Prepare: set no-transition and opacity 0
            els.forEach(el => {
                try {
                    el.style.transition = 'none';
                    el.style.opacity = '0';
                } catch (e) { }
            });

            // Force reflow
            void this.cardsContainer.offsetHeight;

            // Enable opacity transition and trigger to 1
            els.forEach(el => {
                try {
                    el.style.transition = `opacity ${duration}ms ease`;
                    el.style.opacity = '1';
                } catch (e) { }
            });

            // Cleanup after animation
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

                if (activeText && typeof this.filterCardsByRecurrence === 'function') {
                    this.filterCardsByRecurrence(activeText);
                } else {
                    this.filterCardsByRecurrence('all');
                }

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
                            if (this.plugin.settings.sortMode === 'manual' && m.key !== 'manual') {
                                this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                                if (this.plugin.saveSettings) this.plugin.saveSettings();
                            }
                            this.plugin.settings.sortMode = m.key;
                            if (this.plugin.saveSettings) this.plugin.saveSettings();
                            if (typeof this.applySort === 'function') await this.applySort(m.key, this.plugin.settings.sortAscending);
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
                        if (typeof this.applySort === 'function') await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending);
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

    async addCardFromInput(input) {
        const content = input.value.trim();
        if (!content) return;

        const cardData = this.createCard(content);
        
        try {
            const folder = this.plugin.settings.storageFolder || '';
            if (folder && !(await this.app.vault.adapter.exists(folder))) {
                await this.app.vault.createFolder(folder);
            }

            const firstLine = content.split('\n')[0] || content;
            let title = firstLine.slice(0, 30).trim();
            let fileName = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
            let filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
            if (await this.app.vault.adapter.exists(filePath)) {
                fileName += `-${Date.now()}`;
                filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
            }

            const createdDate = new Date(cardData.created);
            const pad = n => String(n).padStart(2, '0');
            const yamlDate = `${pad(createdDate.getDate())}${createdDate.toLocaleString('en-US', { month: 'short' })}${String(createdDate.getFullYear()).slice(-2)}, ${pad(createdDate.getHours())}:${pad(createdDate.getMinutes())}`;

            const tagArray = (cardData.tags || []).map(t => String(t).trim()).filter(t => t.length > 0);
            const tagsYaml = tagArray.length > 0 ? ('Tags:\n' + tagArray.map(t => `  - ${t}`).join('\n')) : 'Tags: []';
            const recurrence = cardData.recurrence || 'none';
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

            const noteContent = `---\n${tagsYaml}${colorLine ? '\n' + colorLine : ''}${colorNameLine ? '\n' + colorNameLine : ''}\nRecurrence: ${recurrence}\nCreated-Date: ${yamlDate}\n---\n\n${content}`;

            await this.app.vault.create(filePath, noteContent);

            cardData.notePath = filePath;
            this.saveCards();

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
            // Use plain text so characters like '>' are not HTML-escaped to '&gt;' ;-;
            try {
                const text = contentEl.innerText != null ? contentEl.innerText : contentEl.textContent;
                this.updateCardContent(card, text);
            } catch (e) {
                // fallback to innerHTML if something unexpected happens
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
            recurrence: (options.recurrence != null ? options.recurrence : 'none'),
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
                        try { if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all'); } catch (e) {}
                    } catch (err) {
                        console.error('Error toggling pin on card', err);
                    }
                });
            }
        } catch (e) {
        }

        return cardData;
    }

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
        const domIds = [...this.cardsContainer.querySelectorAll('.card-sidebar-card')].map(el => el.dataset.id);
        const newOrder = [];
        domIds.forEach(id => {
            const found = this.cards.find(c => c.id === id);
            if (found) newOrder.push(found);
        });
        try {
            const others = this.cards.filter(c => !domIds.includes(c.id));
            if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                this.cards = newOrder.concat(others);
            } else {
                const pinned = newOrder.filter(c => c.pinned);
                const unpinned = newOrder.filter(c => !c.pinned);
                this.cards = pinned.concat(unpinned).concat(others);
            }
        } catch (e) {
            this.cards = newOrder.concat(this.cards.filter(c => !domIds.includes(c.id)));
        }
        try {
            this.plugin.settings.manualOrder = domIds;
            if (this.plugin && typeof this.plugin.saveSettings === 'function') this.plugin.saveSettings();
        } catch (e) {
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
            if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual' && mode !== 'manual') {
                this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                if (this.plugin.saveSettings) this.plugin.saveSettings();
            }

            if (mode === 'manual') {
                const order = (this.plugin && this.plugin.settings && this.plugin.settings.manualOrder) || [];
                if (order && order.length > 0) {
                    const ordered = [];
                    order.forEach(id => {
                        const found = this.cards.find(c => c.id === id);
                        if (found) ordered.push(found);
                    });
                    this.cards.forEach(c => { if (!order.includes(c.id)) ordered.push(c); });
                    this.cards = ordered;
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

            try {
                if (mode === 'manual') {
                } else {
                    const pinned = this.cards.filter(c => c.pinned);
                    const unpinned = this.cards.filter(c => !c.pinned);
                    this.cards = pinned.concat(unpinned);
                }
            } catch (e) { }

            try {
                if (this.cardsContainer) {
                    this.cards.forEach(cd => {
                        if (cd.element && cd.element.parentNode === this.cardsContainer) this.cardsContainer.appendChild(cd.element);
                    });
                }
            } catch (e) { }

            if (this.plugin && this.plugin.saveSettings) await this.plugin.saveSettings();
            await this.saveCards();

            try {
                if (mode === 'manual' && this.plugin && this.plugin.settings) {
                    this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                    if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
                }
            } catch (e) { }
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
            const tagRegex = /#[\w\-]+/g;
            const tags = newContent.match(tagRegex) || [];
            cardData.tags = tags.map(t => t.substring(1));

            if (this.plugin.settings.groupTags) {
                try { this.updateCardTagDisplay(cardData); } catch (e) {}
            }

            // Persist to plugin settings immediately
            try { await this.saveCards(); } catch (e) { console.error('Error saving cards after content edit:', e); }

            // If the card has an associated note, update its body while preserving frontmatter
            try {
                if (cardData.notePath) {
                    const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                    if (file) {
                        let text = await this.app.vault.read(file);
                        const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                        let fmBlock = '';
                        if (fmMatch) fmBlock = fmMatch[0];

                        // Ensure there's a blank line between frontmatter and body (like when creating notes)
                        let separator = '';
                        if (fmBlock) {
                            separator = fmBlock.endsWith('\n\n') ? '' : '\n\n';
                        }

                        const newText = fmBlock ? (fmBlock + separator + newContent) : newContent;
                        await this.app.vault.modify(file, newText);
                    } else {
                        // If note file is missing, try to create it in storage folder
                        try {
                            const folder = this.plugin.settings.storageFolder || '';
                            const firstLine = (newContent || '').split('\n')[0] || 'card';
                            let title = firstLine.slice(0, 30).trim();
                            let fileName = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}` || `card-${Date.now()}`;
                            let filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
                            // avoid overwrite
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

    applyFilters() {
        try {
            const q = (this.activeFilters && this.activeFilters.query) ? String(this.activeFilters.query).trim().toLowerCase() : '';
            const tags = (this.activeFilters && Array.isArray(this.activeFilters.tags)) ? this.activeFilters.tags.slice() : [];
            const showPinnedOnly = !!(this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly);
            (this.cards || []).forEach(c => {
                try {
                    if (!c || !c.element) return;
                    let visible = true;

                    // Respect recurrence filter: when viewing 'all' we must treat archived cards as non-existent
                    // so they are never shown by applyFilters. If a recurrence filter other than 'all' is active,
                    // archived visibility is handled by filterCardsByRecurrence.
                    try {
                        const rec = String(this.currentRecurrenceFilter || 'all').toLowerCase();
                        if (rec === 'all' && c.archived) {
                            visible = false;
                        }
                    } catch (e) { }
                    if (showPinnedOnly && !c.pinned) visible = false;
                    if (tags && tags.length > 0) {
                        for (const tg of tags) {
                            if (!c.tags || !c.tags.map(t => String(t)).includes(tg)) { visible = false; break; }
                        }
                    }
                    if (visible && q) {
                        const hay = String(c.content || '').toLowerCase();
                        const tagText = (c.tags || []).join(' ').toLowerCase();
                        if (hay.indexOf(q) === -1 && tagText.indexOf(q) === -1) visible = false;
                    }
                    c.element.style.display = visible ? '' : 'none';
                } catch (e) { }
            });
        } catch (err) {
            console.error('Error in applyFilters:', err);
        }
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
            let recurrence = cardData.recurrence || 'none';
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
                        if (/^\s*pinned\s*:\s*true$/mi.test(fm || '')) {
                            pinned = true;
                        }
                    } catch (e) { }
                const recMatch = fm.match(/^\s*Recurrence:\s*(.*)$/mi);
                if (recMatch) recurrence = recMatch[1].trim();
                const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                if (createdMatch) created = createdMatch[1].trim();
                if (/^\s*archived:\s*true$/mi.test(fm)) archived = true; else archived = false;
            }

            if (tags.length > 0) cardData.tags = tags; else cardData.tags = [];
            cardData.recurrence = recurrence;
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
                                    try { if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all'); } catch (e) {}
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

        menu.addItem((item) => {
                item.setTitle(cardData.pinned ? 'Unpin Card' : 'Pin Card')
                .setIcon('pin')
                .onClick(async () => {
                    try {
                        cardData.pinned = !cardData.pinned;
                        try {
                            this.cards = this.cards.filter(c => c.id !== cardData.id);
                            if (cardData.pinned) {
                                this.cards.unshift(cardData);
                                if (cardData.element && this.cardsContainer) {
                                    try { this.cardsContainer.insertBefore(cardData.element, this.cardsContainer.firstChild); } catch (e) { }
                                }
                            } else {
                                this.cards.push(cardData);
                            }
                        } catch (e) { }

                        try {
                            const el = cardData.element;
                            if (el) {
                                const existing = el.querySelector('.card-pin-indicator');
                                if (cardData.pinned) {
                                    try { if (typeof this.applyFilters === 'function') this.applyFilters(); } catch (e) {}
                                    try { if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all'); } catch (e) {}

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
                                                try { if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all'); } catch (e) {}
                                            } catch (err) { console.error('Error unpinning from indicator:', err); }
                                        });
                                    }
                                } else {
                                    try { if (existing) existing.remove(); } catch (e) {}
                                    if (this.plugin && this.plugin.settings && this.plugin.settings.showPinnedOnly) {
                                        try { el.style.display = 'none'; } catch (e) { }
                                    }
                                }
                            }
                        } catch (e) { console.error('Error updating DOM pin indicator:', e); }

                            try {
                                if (cardData.notePath) {
                                    try {
                                        const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                        if (file) {
                                            let content = await this.app.vault.read(file);
                                            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                                            if (fmMatch) {
                                                let fm = fmMatch[1];
                                                if (cardData.pinned) {
                                                    if (/^\s*pinned\s*:/gmi.test(fm)) {
                                                        fm = fm.replace(/^\s*pinned\s*:.*$/gmi, 'pinned: true');
                                                    } else {
                                                        fm = fm + '\n' + 'pinned: true';
                                                    }
                                                } else {
                                                    if (/^\s*pinned\s*:/gmi.test(fm)) {
                                                        fm = fm.replace(/^\s*pinned\s*:.*$/gmi, 'pinned: false');
                                                    } else {
                                                        fm = fm + '\n' + 'pinned: false';
                                                    }
                                                }
                                                const newFm = '---\n' + fm + '\n---\n';
                                                content = content.replace(fmMatch[0], newFm);
                                            } else {
                                                const newFm = '---\n' + (cardData.pinned ? 'pinned: true' : 'pinned: false') + '\n---\n\n';
                                                content = newFm + content;
                                            }
                                            await this.app.vault.modify(file, content);
                                        }
                                    } catch (err) {
                                        console.error('Error updating pinned in note frontmatter:', err);
                                    }
                                }
                            } catch (e) { }

                            await this.saveCards();
                            try {
                                if (this.plugin && this.plugin.settings && this.plugin.settings.sortMode === 'manual') {
                                    this.plugin.settings.manualOrder = (this.cards || []).map(c => c.id);
                                    if (typeof this.plugin.saveSettings === 'function') await this.plugin.saveSettings();
                                }
                            } catch (e) { }
                    } catch (e) { console.error('Error toggling pin state:', e); }
                });
        });

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
        
        menu.addSeparator();
        
        const options = [
            { label: 'No Recurrence', value: 'none', icon: 'x' },
            { label: 'Daily', value: 'daily', icon: 'calendar-clock' },
            { label: 'Weekly', value: 'weekly', icon: 'calendar-range' },
            { label: 'Monthly', value: 'monthly', icon: 'calendar-days' }
        ];
        
        options.forEach(option => {
            menu.addItem((item) => {
                item.setTitle(option.label)
                    .setIcon(option.icon);

                if (cardData.recurrence === option.value) {
                    item.setChecked(true);
                }

                item.onClick(async () => {
                    try {
                        // Update recurrence on the in-memory card and persist
                        cardData.recurrence = option.value;
                        if (typeof this.saveCards === 'function') await this.saveCards();

                        // Also update the associated note frontmatter when present
                        if (cardData.notePath) {
                            try {
                                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                if (file) {
                                    let content = await this.app.vault.read(file);
                                    content = content.replace(/(Recurrence:\s*)(.*)/, `$1${option.value}`);
                                    await this.app.vault.modify(file, content);
                                }
                            } catch (err) {
                                console.error('Error updating recurrence in note:', err);
                            }
                        }

                        // Re-apply the current recurrence filter so the card visibility updates immediately
                        try {
                            if (typeof this.filterCardsByRecurrence === 'function') this.filterCardsByRecurrence(this.currentRecurrenceFilter || 'all');
                        } catch (e) { /* ign */ }
                    } catch (err) {
                        console.error('Error setting recurrence on card:', err);
                    }
                });
            });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('Edit Tags')
                .setIcon('tag')
                .onClick(() => {
                    this.showTagsModal(cardData);
                });
        });

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
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('Delete Card')
                .setIcon('trash')
                .onClick(async () => {
                    if (cardData.notePath) {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                            if (file) {
                                await this.app.vault.delete(file);
                            }
                        } catch (err) {
                            console.error('Error deleting note:', err);
                        }
                    }
                    
                    card.remove();
                    this.cards = this.cards.filter(c => c !== cardData);
                    this.saveCards();
                });
        });
        menu.addItem((item) => {
            item.setTitle('Archive Card')
                .setIcon('archive')
                .onClick(async () => {
                    try {
                        console.log('Archiving card', cardData.id, 'notePath:', cardData.notePath);
                        cardData.archived = true;
                        await this.saveCards();

                        card.remove();

                        if (cardData.notePath) {
                            try {
                                const file = this.app.vault.getAbstractFileByPath(cardData.notePath);
                                if (file) {
                                    let content = await this.app.vault.read(file);
                                    const archivedLine = 'archived: true';

                                    const hasFrontmatter = /^---\r?\n/.test(content);
                                    console.log('Note has frontmatter?', hasFrontmatter);

                                    if (/^\s*archived:.*$/mi.test(content)) {
                                        content = content.replace(/^\s*archived:.*$/mi, archivedLine);
                                        console.log('Replaced existing archived line in note');
                                    } else {
                                        const fmStart = content.match(/^---\r?\n/);
                                        if (fmStart) {
                                            const insertPos = fmStart.index + fmStart[0].length;
                                            content = content.slice(0, insertPos) + archivedLine + '\n' + content.slice(insertPos);
                                            console.log('Inserted archived line into existing frontmatter');
                                        } else {
                                            content = '---\n' + archivedLine + '\n---\n\n' + content;
                                            console.log('Created new frontmatter with archived line');
                                        }
                                    }

                                    await this.app.vault.modify(file, content);
                                    console.log('Modified file to set archived flag:', cardData.notePath);
                                    new Notice('Card archived and note updated');
                                } else {
                                    console.warn('Associated note file not found for path:', cardData.notePath);
                                    new Notice('Card archived (no associated note found)');
                                }
                            } catch (err) {
                                console.error('Error updating archived flag in note:', err);
                                new Notice('Archived flag could not be written to note (see console)');
                            }
                        } else {
                            new Notice('Card archived');
                        }
                    } catch (err) {
                        console.error('Error archiving card:', err);
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

        // Allow saving tags by pressing Enter in the input
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
                        let tagsBlock = '';
                        if (tagArray.length > 0) {
                            tagsBlock = 'Tags:\n' + tagArray.map(t => `  - ${t}`).join('\n');
                        } else {
                            tagsBlock = 'Tags: []';
                        }

                        try {
                            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                            if (fmMatch) {
                                let fm = fmMatch[1];
                                const lines = fm.split(/\r?\n/);
                                const newLines = [];
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i];
                                    if (/^\s*(Tags|tags)\s*:/i.test(line)) {
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
                                const newFmFull = '---\n' + tagsBlock + '\n---\n\n';
                                content = newFmFull + content;
                            }
                        } catch (err) {
                            console.error('Error updating Tags in frontmatter:', err);
                            const fallback = tagArray.length > 0 ? ('Tags: [' + tagArray.map(t => '"' + String(t).replace(/"/g, '\\"') + '"').join(', ') + ']') : 'Tags: []';
                            if (/^\s*Tags:.*$/mi.test(content) || /^\s*tags:.*$/mi.test(content)) {
                                content = content.replace(/^\s*Tags:.*$/mi, fallback);
                            } else {
                                const fmStart = content.match(/^---\r?\n/);
                                if (fmStart) {
                                    const insertPos = fmStart.index + fmStart[0].length;
                                    content = content.slice(0, insertPos) + fallback + '\n' + content.slice(insertPos);
                                } else {
                                    content = '---\n' + fallback + '\n---\n\n' + content;
                                }
                            }
                        }

                        await this.app.vault.modify(file, content);
                    }
                } catch (err) {
                    console.error('Error updating tags in note frontmatter:', err);
                }
            }

            modal.close();
        });
        
        modal.open();
    }

    async createNoteFromCard(cardData) {
        try {
            const firstLine = cardData.content.split('\n')[0] || cardData.content;
            const title = firstLine.slice(0, 30).trim();
            const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.md`;
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
            const tagArray = (cardData.tags || []).map(t => String(t).trim()).filter(t => t.length > 0);
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

            const noteContent = `---\nCreated-Date: ${created}\n${tagsYaml}${colorLine ? '\n' + colorLine : ''}${colorNameLine ? '\n' + colorNameLine : ''}\nRecurrence: ${cardData.recurrence || 'none'}\n---\n\n${cardData.content}`;
            
            const file = await this.app.vault.create(filePath, noteContent);
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

    async loadCards(showArchived = false, recurrenceFilter = null) {
        try {
            if (this.cardsContainer) this.cardsContainer.empty();
        } catch (e) {
        }
        this.cards = [];
        const folder = this.plugin.settings.storageFolder;

        if (folder && folder !== '/') {
            try {
                if (this.plugin._importedFromFolderOnLoad && this.plugin.settings.cards && this.plugin.settings.cards.length > 0) {
                    const saved = this.plugin.settings.cards || [];
                    for (const savedCard of saved) {
                        // Always create cards from settings; visibility will be handled by filters later.
                        if (recurrenceFilter && recurrenceFilter !== 'all' && String(savedCard.recurrence || 'none').toLowerCase() !== String(recurrenceFilter).toLowerCase()) continue;
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
                                } catch (e) { /* ign */ }
                            }

                            // debug: report archived state discovered when loading this saved card
                            const createdCard = this.createCard(savedCard.content || '', {
                                id: savedCard.id,
                                color: savedCard.color,
                                tags: savedCard.tags,
                                recurrence: savedCard.recurrence,
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
                    await this.importNotesFromFolder(folder, true, recurrenceFilter, showArchived);
                }
            } catch (e) {
                console.error('Error importing notes from storage folder during load:', e);
            }

            this.refreshAllCardTimestamps();
            try { this.animateCardsEntrance(); } catch (e) {}
            return;
        }

        const saved = this.plugin.settings.cards || [];
        if (saved && saved.length > 0) {
            for (const savedCard of saved) {
                try {
                    // Always create cards from settings; filtering will hide archived items when appropriate.
                    if (recurrenceFilter && recurrenceFilter !== 'all' && String(savedCard.recurrence || 'none').toLowerCase() !== String(recurrenceFilter).toLowerCase()) continue;

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

                    const createdCard = this.createCard(savedCard.content || '', {
                        id: savedCard.id,
                        color: savedCard.color,
                        tags: savedCard.tags,
                        recurrence: savedCard.recurrence,
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
            const sampleCards = [
                "Welcome to Card Sidebar! This is your quick note-taking space.",
                "Right-click on cards to change colors, set recurrence, or add tags.",
                "Use the input box below to add new cards quickly.",
                "Drag cards to reorder them."
            ];

            sampleCards.forEach((card, index) => {
                const colorVar = `var(--card-color-${(index % 10) + 1})`;
                this.createCard(card, { color: colorVar });
            });
        }

        try {
            await this.applySort(this.plugin.settings.sortMode || 'manual', this.plugin.settings.sortAscending != null ? this.plugin.settings.sortAscending : true);
        } catch (e) { }
        this.refreshAllCardTimestamps();
        try { this.animateCardsEntrance(); } catch (e) {}
    }

    async importNotesFromFolder(folder, silent = false, recurrenceFilter = null, showArchived = false) {
        if (!folder) return 0;
        try {
            const allFiles = this.app.vault.getAllLoadedFiles();
            const prefix = folder.endsWith('/') ? folder : folder + '/';
            const mdFiles = allFiles.filter(f => f.path && f.path.startsWith(prefix) && f.path.toLowerCase().endsWith('.md'));

            // (debug logs removed)

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
                    let recurrence = 'none';
                    let created = new Date().toISOString();
                    let archived = false;
                    let parsedColorVar = null;
                    let pinned = false;

                    if (fm) {
                        const parsedTags = this.parseTagsFromFrontmatter(fm);
                        parsedTags.forEach(t => { if (t) tags.push(t); });
                        const recMatch = fm.match(/^\s*Recurrence:\s*(.*)$/mi);
                        if (recMatch) recurrence = recMatch[1].trim();
                        const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                        if (createdMatch) created = createdMatch[1].trim();
                        if (/^\s*archived:\s*true$/mi.test(fm)) archived = true;
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

                    if (recurrenceFilter && recurrenceFilter !== 'all' && String(recurrence || 'none').toLowerCase() !== String(recurrenceFilter).toLowerCase()) continue;

                    const cardData = this.createCard(content, {
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
                        color: parsedColorVar || `var(--card-color-1)`,
                        tags,
                        recurrence,
                        created,
                        archived,
                        notePath: path,
                        pinned: pinned || false
                    });

                    createdSerial.push({
                        id: cardData.id,
                        content: cardData.content,
                        color: cardData.color,
                        tags: cardData.tags || [],
                        recurrence: cardData.recurrence || 'none',
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
                recurrence: c.recurrence || 'none',
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
                    await this.plugin.saveSettings();

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
                            new Notice('Storage folder set — open the Card Sidebar to import notes');
                        }
                    }
                });

            const folders = new Set(['/']);
            this.app.vault.getAllLoadedFiles().forEach(file => {
                if (file.parent) {
                    folders.add(file.parent.path);
                }
            });

            const folderSuggest = new FolderSuggest(this.app, cb.inputEl, folders);

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

            // Animated cards toggle
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
                                // trigger a small entrance animation when enabling
                                try { view.animateCardsEntrance(); } catch (e) {}
                            }
                        } catch (e) { }
                    }));

                // Disable card fade-in toggle
                new Setting(containerEl)
                    .setName('Disable card fade in')
                    .setDesc('When enabled, cards will not perform an opacity fade on load or category switch. Slide animations are unaffected.')
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
        .setName('Disable filter buttons')
        .setDesc('When enabled, the recurrence filter buttons (All, Daily, Weekly, Monthly, Archived) are hidden.')
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

    this.updateCSSVariables();
    updateCardRadius(this.plugin.settings.borderRadius || 6);
    updateButtonPadding(this.plugin.settings.buttonPaddingBottom || 26);

    // below card-sidebar-button-container padding
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
        .setName('Date & Time format')
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

    const previewSpan = timeSetting.descEl.querySelector('.card-ts-preview');
    if (previewSpan) {
        previewSpan.appendChild(previewEl);
    } else {
        timeSetting.descEl.appendChild(previewEl);
    }

    updatePreview(this.plugin.settings.datetimeFormat);

    new Setting(containerEl)
        .setName('Bring timestamp below tags')
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
        
    // Only open suggestions when the input is explicitly clicked
    // This prevents the dropdown from auto-opening on programmatic focus.
    this.inputEl.addEventListener('click', this.onFocus.bind(this));
    this.inputEl.addEventListener('input', this.onInput.bind(this));
        document.addEventListener('click', this.onClick.bind(this));
    }
    
    onFocus() {
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
        
        const matchingFolders = this.folders.filter(folder => 
            folder.toLowerCase().includes(inputValue));
        
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

class CardSidebarPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // apply global styles immediately
        try {
            if (typeof this.applyGlobalStyles === 'function') this.applyGlobalStyles();
        } catch (e) { console.error('Error applying global styles on load:', e); }

    // load moment.js for date formatting
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

    // fetch moment.js
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js');
    // ensure moment is available on window
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

    // register the view
        this.registerView(
            'card-sidebar',
            (leaf) => new CardSidebarView(leaf, this)
        );

    // defer importing from storage folder until workspace ready
        if (this.settings.storageFolder && this.settings.storageFolder !== '/') {
            this.app.workspace.onLayoutReady(async () => {
                try {
                    await this.importNotesFromFolderToSettings(this.settings.storageFolder, true);
                    this._importedFromFolderOnLoad = true;
                } catch (e) {
                    console.error('Error importing notes from storage folder on layout ready:', e);
                }
            });
        }

    // ribbon icon
        this.addRibbonIcon('cards', 'Card Sidebar', () => {
            this.activateView();
        });

    // register command
        this.addCommand({
            id: 'open-card-sidebar',
            name: 'Open Card Sidebar',
            callback: () => {
                this.activateView();
            }
        });

    // add settings tab
    this.addSettingTab(new CardSidebarSettingTab(this.app, this));

    // auto-open on layout ready if enabled
        if (this.settings.autoOpen) {
            this.app.workspace.onLayoutReady(() => {
                this.activateView();
            });
        }

        console.log('Card Sidebar plugin loaded successfully');
        try {
            if (!this.settings || !this.settings.tutorialShown) {
                // show tutorial on first load
                try { this.showFirstRunTutorial(); } catch (e) { console.error('Error showing first-run tutorial:', e); }
            }
        } catch (e) { }
    }

    async loadSettings() {
        this.settings = Object.assign({
            storageFolder: 'Cards',
            autoOpen: true,
            tutorialShown: false,
            showTimestamps: true,
            datetimeFormat: 'YYYY-MM-DD HH:mm',
            // whether to animate cards on load/category change
            animatedCards: true,
            // when true, card opacity fade-in is disabled (slide animations unaffected)
            disableCardFadeIn: true,
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
            // colorNames
            colorNames: ['Gray','Red','Orange','Yellow','Green','Blue','Purple','Magenta','Pink','Brown'],
            twoRowSwatches: false,
            cardStyle: 1, // (1/2/3)
            cardBgOpacity: 0.45, // px
            borderThickness: 2,
            buttonPaddingBottom: 26,
            groupTags: true,
            disableFilterButtons: false, // not disabled
            hideArchivedFilterButton: false,
            sortMode: 'manual', // sort mode: 'manual'|'created'|'modified'|'alpha'
            sortAscending: true, // sort direction: true=asc, false=desc
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


    // inject global CSS variables and style tweaks
    applyGlobalStyles() {
        try {
            // colors
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
            // replace/append style element
            const existing = document.getElementById(styleId);
            if (existing) existing.remove();
            document.head.appendChild(styleEl);

            // border radius
            const radiusId = 'card-border-radius';
            const radius = Number(this.settings.borderRadius != null ? this.settings.borderRadius : 6);
            let radiusEl = document.getElementById(radiusId);
            if (radiusEl) radiusEl.remove();
            radiusEl = document.createElement('style');
            radiusEl.id = radiusId;
            radiusEl.textContent = ` .card-sidebar-card { border-radius: ${radius}px !important; } `;
            document.head.appendChild(radiusEl);

            // button/input bottom padding
            const padId = 'card-button-padding';
            const pad = Number(this.settings.buttonPaddingBottom != null ? this.settings.buttonPaddingBottom : 26);
            let padEl = document.getElementById(padId);
            if (padEl) padEl.remove();
            padEl = document.createElement('style');
            padEl.id = padId;
            padEl.textContent = ` .card-sidebar-button-container { padding-bottom: ${pad}px !important; } `;
            document.head.appendChild(padEl);

            // hide scrollbar if requested
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
        } catch (e) {
            console.error('Error in applyGlobalStyles:', e);
        }
    }

    // import markdown files into plugin settings (populate settings.cards). Used at plugin load.
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
                    let recurrence = 'none';
                    let created = new Date().toISOString();
                    let archived = false;
                    let parsedColorVar = null;

                    if (fm) {
                        // parse tags using the view helper if available via prototype, otherwise simple parse
                        try {
                            const viewProto = CardSidebarView.prototype;
                            if (viewProto && typeof viewProto.parseTagsFromFrontmatter === 'function') {
                                const pts = viewProto.parseTagsFromFrontmatter.call({ plugin: this }, fm);
                                pts.forEach(t => { if (t) tags.push(t); });
                            } else {
                                // fallback simple bracket/tag parsing
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
                        } catch (e) { /* ign */ }

                        const recMatch = fm.match(/^\s*Recurrence:\s*(.*)$/mi);
                        if (recMatch) recurrence = recMatch[1].trim();
                        const createdMatch = fm.match(/^\s*Created-Date:\s*(.*)$/mi);
                        if (createdMatch) created = createdMatch[1].trim();
                        if (/^\s*archived:\s*true$/mi.test(fm)) archived = true;

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
                        } catch (e) { /* ign */ }
                    }

                    const content = body.trim() || '(empty)';

                    createdSerial.push({
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
                        content,
                        color: parsedColorVar || `var(--card-color-1)`,
                        tags,
                        recurrence,
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
    }
}

module.exports = CardSidebarPlugin;
