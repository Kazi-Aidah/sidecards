
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";
import { applyCardColorToElement } from "../../utils/dom";
import { App, MarkdownRenderer, Plugin, Menu, Notice, TFile, setIcon } from "obsidian";
import { DateTimeModal } from "../modals/DateTimeModal";

export class CardComponent {
  public el: HTMLElement;
  private card: Card;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private container: HTMLElement,
    card: Card,
    private store: CardStore,
    private app: App,
    private plugin: Plugin
  ) {
    this.card = card;
    this.el = container.createDiv('card-sidebar-card');
    this.render();
    this.setupListeners();
  }

  private async render(): Promise<void> {
    this.el.empty();
    this.el.dataset.id = this.card.id;
    
    // Apply styling
    applyCardColorToElement(this.el, this.card.color, this.store.settings);

    // Apply max card height
    const maxH = this.store.settings.maxCardHeight;
    if (maxH && maxH > 0) {
      this.el.style.maxHeight = `${maxH}px`;
      this.el.style.overflow = 'hidden';
    } else {
      this.el.style.maxHeight = '';
      this.el.style.overflow = '';
    }
    
    const fragment = document.createDocumentFragment();
    
    // Copy button (if enabled)
    if (this.store.settings.enableCopyCardContent) {
      const copyBtn = fragment.createDiv('card-copy-btn');
      try {
        setIcon(copyBtn, 'copy');
      } catch {
        copyBtn.textContent = '📋';
      }
      copyBtn.title = 'Copy card content';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyCardContent();
      });
    }
    
    // Pill bar
    const pillBar = fragment.createDiv('card-pill-bar');
    this.renderPills(pillBar);
    
    // Content
    const content = fragment.createDiv('card-content');
    await this.renderContent(content);

    // Tags inline (when groupTags is off, show tags right after content)
    if (!this.store.settings.groupTags && this.card.tags && this.card.tags.length > 0) {
      const tagsEl = fragment.createDiv('card-tags');
      this.card.tags.forEach(tag => {
        const tagEl = tagsEl.createSpan('card-tag');
        tagEl.textContent = this.store.settings.omitTagHash ? tag : `#${tag}`;
        tagEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // @ts-ignore
          this.store.eventBus.emit('filter:tag', tag);
        });
      });
    }
    
    // Footer (grouped tags + timestamp)
    const footer = fragment.createDiv('card-footer');
    this.renderFooter(footer);
    
    this.el.appendChild(fragment);

    // detect layout mode and apply masonry if needed
    if (this.store.settings.cardStyle === 2) {
      this.el.style.breakInside = 'avoid';
      this.el.style.marginBottom = '12px';
    }
  }

  private copyCardContent(): void {
    // Get the raw content or rendered text
    let contentToCopy = this.card.content;
    
    // Try to get text from card content element
    const contentEl = this.el.querySelector('.card-content');
    if (contentEl && !this.store.settings.disableCardRendering) {
      contentToCopy = contentEl.textContent || this.card.content;
    }
    
    // Copy to clipboard
    navigator.clipboard.writeText(contentToCopy).then(() => {
      new Notice('Card content copied!');
    }).catch(() => {
      new Notice('Failed to copy card content');
    });
  }

  private renderPills(container: HTMLElement): void {
    if (this.card.expiresAt) {
      const pill = container.createDiv('card-expiry-pill');
      pill.textContent = this.formatExpiry(this.card.expiresAt);
    }
    if (this.card.status) {
      const pill = container.createDiv('card-status-pill');
      pill.textContent = this.card.status.name;
      pill.style.backgroundColor = this.card.status.color;
      pill.style.color = this.card.status.textColor || '#000';
    }
  }

  private async renderContent(container: HTMLElement): Promise<void> {
    if (this.store.settings.disableCardRendering) {
      container.setAttribute('contenteditable', 'true');
      container.textContent = this.card.content;
      container.addEventListener('blur', async () => {
        if (container.textContent !== this.card.content) {
          await this.store.update(this.card.id, { content: container.textContent || '' });
        }
      });
    } else {
      container.setAttribute('contenteditable', 'false');
      const temp = document.createElement('div');
      await MarkdownRenderer.render(
        this.app,
        this.card.content,
        temp,
        this.card.notePath || '',
        this.plugin
      );
      while (temp.firstChild) container.appendChild(temp.firstChild);
    }
  }

  private renderFooter(container: HTMLElement): void {
    const settings = this.store.settings;
    const hasTags = this.card.tags && this.card.tags.length > 0;

    if (settings.groupTags && !settings.timestampBelowTags) {
      // Tags then timestamp
      if (hasTags) {
        const tagsEl = container.createDiv('card-tags');
        this.card.tags.forEach(tag => {
          const tagEl = tagsEl.createSpan('card-tag');
          tagEl.textContent = settings.omitTagHash ? tag : `#${tag}`;
          tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // @ts-ignore
            this.store.eventBus.emit('filter:tag', tag);
          });
        });
      }
      if (settings.showTimestamps) {
        container.createDiv('card-timestamp').textContent = this.formatTimestamp(this.card.created);
      }
    } else if (settings.groupTags && settings.timestampBelowTags) {
      // Tags then timestamp below
      if (hasTags) {
        const tagsEl = container.createDiv('card-tags');
        this.card.tags.forEach(tag => {
          const tagEl = tagsEl.createSpan('card-tag');
          tagEl.textContent = settings.omitTagHash ? tag : `#${tag}`;
          tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // @ts-ignore
            this.store.eventBus.emit('filter:tag', tag);
          });
        });
      }
      if (settings.showTimestamps) {
        container.createDiv('card-timestamp').textContent = this.formatTimestamp(this.card.created);
      }
    } else {
      // Inline tags (rendered above footer in render()), just show timestamp here
      if (settings.showTimestamps) {
        container.createDiv('card-timestamp').textContent = this.formatTimestamp(this.card.created);
      }
    }
  }

  private setupListeners(): void {
    // Context menu
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      const colors = [
        'var(--card-color-1)', 'var(--card-color-2)', 'var(--card-color-3)',
        'var(--card-color-4)', 'var(--card-color-5)', 'var(--card-color-6)',
        'var(--card-color-7)', 'var(--card-color-8)', 'var(--card-color-9)',
        'var(--card-color-10)'
      ];
      menu.addItem(item => {
        item.setTitle('Colors');
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '6px';
        container.style.flexWrap = this.store.settings.twoRowSwatches ? 'wrap' : 'nowrap';
        if (this.store.settings.twoRowSwatches) container.style.maxWidth = '180px';
        colors.forEach((color, idx) => {
          const swatch = document.createElement('div');
          swatch.style.width = '18px';
          swatch.style.height = '18px';
          swatch.style.borderRadius = '4px';
          swatch.style.cursor = 'pointer';
          swatch.style.border = this.card.color === color ? '2px solid var(--text-accent)' : '1px solid var(--background-modifier-border)';
          swatch.title = this.store.settings.colorNames[idx] || `Color ${idx + 1}`;
          const root = document.documentElement;
          const computed = getComputedStyle(root).getPropertyValue(color.replace('var(', '').replace(')', ''));
          swatch.style.backgroundColor = computed.trim() || color;
          swatch.addEventListener('click', async () => {
            await this.store.setColor(this.card.id, color);
          });
          container.appendChild(swatch);
        });
        ((item as any).titleEl as HTMLElement)?.appendChild(container);
      });

      const categories = this.store.settings.enableCustomCategories ? (this.store.settings.customCategories || []) : [];
      if (categories.length > 0) {
        menu.addSeparator();
        categories.forEach(cat => {
          menu.addItem(item => {
            item.setTitle(`Add to ${cat.label}`)
              .setIcon('plus-square')
              .onClick(async () => {
                await this.store.setCategory(this.card.id, cat.label || cat.id);
              });
          });
        });
        if (this.card.category) {
          menu.addItem(item => {
            item.setTitle(`Remove from ${this.card.category}`)
              .setIcon('trash')
              .onClick(async () => {
                await this.store.setCategory(this.card.id, null);
              });
          });
        }
      }

      if (this.store.settings.enableCardStatus && Array.isArray(this.store.settings.cardStatuses) && this.store.settings.cardStatuses.length > 0) {
        menu.addSeparator();
        menu.addItem(item => {
          item.setTitle('Set Status')
            .setIcon('flag')
            .onClick(() => {
              const menu2 = new Menu();
              this.store.settings.cardStatuses?.forEach(st => {
                menu2.addItem(i => {
                  i.setTitle(st.name || '')
                    .onClick(async () => {
                      await this.store.setStatus(this.card.id, { name: st.name || '', color: st.color || '', textColor: st.textColor || '#000' });
                    });
                });
              });
              menu2.addItem(i => {
                i.setTitle('Clear Status')
                  .onClick(async () => {
                    await this.store.setStatus(this.card.id, null);
                  });
              });
              menu2.showAtMouseEvent(e);
            });
        });
      }

      menu.addSeparator();
      menu.addItem(item => {
        item.setTitle(this.card.pinned ? 'Unpin' : 'Pin')
          .setIcon('pin')
          .onClick(async () => {
            await this.store.togglePin(this.card.id, !this.card.pinned);
          });
      });
      menu.addItem(item => {
        item.setTitle('Set Expiry')
          .setIcon('alarm-clock')
          .onClick(() => {
            new DateTimeModal(this.app, this.card, this.store).open();
          });
      });
      menu.addItem(item => {
        item.setTitle('Duplicate')
          .setIcon('copy')
          .onClick(async () => {
            await this.store.duplicateCard(this.card.id);
          });
      });
      menu.addItem(item => {
        item.setTitle(this.card.notePath ? 'View Note' : 'Create Note')
          .setIcon(this.card.notePath ? 'link' : 'document')
          .onClick(async () => {
            if (this.card.notePath) {
              const file = this.app.vault.getAbstractFileByPath(this.card.notePath);
              if (file instanceof TFile) {
                await this.app.workspace.getLeaf(true).openFile(file);
              } else {
                new Notice('Note not found');
              }
            } else {
              const path = await this.store.createNoteFromCard(this.card.id);
              if (!path) return;
              const file = this.app.vault.getAbstractFileByPath(path);
              if (file instanceof TFile) {
                await this