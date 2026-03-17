
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";
import { applyCardColorToElement } from "../../utils/dom";
import { App, MarkdownRenderer, Plugin, Menu, Notice, TFile, setIcon, Scope, Editor } from "obsidian";
import { DateTimeModal } from "../modals/DateTimeModal";

export class CardComponent {
  public el: HTMLElement;
  static activeEditor: CardComponent | null = null;
  private static instanceCount = 0;
  private static globalMouseDownBound = false;
  private static readonly handleGlobalMouseDown = (event: MouseEvent) => {
    const active = CardComponent.activeEditor;
    if (!active || !active.isEditing) return;
    const target = event.target as Node | null;
    if (target && active.el.contains(target)) return;
    active.blurAndSave();
  };
  private card: Card;
  private unsubscribe: (() => void)[] = [];
  private isEditing: boolean = false;
  private renderCount: number = 0;
  private scope: Scope;
  private editor!: Editor;
  private owner!: any;

  constructor(
    private container: HTMLElement,
    card: Card,
    private store: CardStore,
    private app: App,
    private plugin: Plugin
  ) {
    CardComponent.instanceCount += 1;
    this.card = card;
    this.el = container.createDiv('sc-card');
    this.scope = new Scope(this.app.scope);
    // Block native formatting keys so Obsidian's global commands take over
    this.scope.register(["Mod"], "b", () => true);
    this.scope.register(["Mod"], "i", () => true);
    this.scope.register(["Mod"], "u", () => true);
    this.setupMockEditor();
    this.ensureGlobalMouseDownHandler();
    this.render();
    this.setupListeners();
  }

  private ensureGlobalMouseDownHandler() {
    if (CardComponent.globalMouseDownBound) return;
    document.addEventListener('mousedown', CardComponent.handleGlobalMouseDown, true);
    CardComponent.globalMouseDownBound = true;
  }

  private setupMockEditor() {
    this.editor = {
      getSelection: () => {
        const sel = window.getSelection();
        return sel ? sel.toString() : "";
      },
      replaceSelection: (text: string) => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
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
    } as any;

    this.owner = {
      editor: this.editor,
      editMode: true,
    };
  }

  private toggleMarkdownWrapper(wrapper: "**" | "*" | "~~" | "==") {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    
    if (selectedText.length === 0) {
      // Empty selection: insert **** and place cursor in middle
      const text = wrapper + wrapper;
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStart(node, wrapper.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const alreadyWrapped = selectedText.startsWith(wrapper) && selectedText.endsWith(wrapper);
      const newText = alreadyWrapped
        ? selectedText.slice(wrapper.length, -wrapper.length)
        : wrapper + selectedText + wrapper;
      
      this.editor.replaceSelection(newText);
    }
  }

  private async render(): Promise<void> {
    const currentRender = ++this.renderCount;
    this.el.empty();
    this.el.dataset.id = this.card.id;
    this.el.draggable = !this.isEditing; // Disable dragging while editing
    
    // Apply styling
    applyCardColorToElement(this.el, this.card.color, this.store.settings);

    // Apply max card height
    const maxH = this.store.settings.maxCardHeight;
    if (maxH && maxH > 0) {
      this.el.style.setProperty('max-height', `${maxH}px`, 'important');
      this.el.style.setProperty('overflow', 'hidden', 'important');
    } else {
      this.el.style.removeProperty('max-height');
      this.el.style.removeProperty('overflow');
    }
    
    // detect layout mode and apply masonry if needed
    if (this.store.settings.cardStyle === 2) {
      this.el.style.breakInside = 'avoid';
    }

    const fragment = document.createDocumentFragment();
    
    // Copy button (if enabled)
    if (this.store.settings.enableCopyCardContent) {
      const copyBtn = fragment.createDiv('sc-copy-btn');
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
    const pillBar = fragment.createDiv('sc-pill-bar');
    this.renderPills(pillBar);
    
    // Content
    const content = fragment.createDiv('sc-content');
    await this.renderContent(content);

    // If a new render has started, discard this one
    if (currentRender !== this.renderCount) return;

    // Tags inline (when groupTags is off, show tags right after content)
    if (!this.store.settings.groupTags && this.card.tags && this.card.tags.length > 0) {
      const tagsEl = fragment.createDiv('sc-tags');
      this.card.tags.forEach(tag => {
        const tagEl = tagsEl.createSpan('sc-tag');
        const cleanTag = tag.trim().replace(/^[-#\s]+/, '').trim();
        tagEl.textContent = this.store.settings.omitTagHash ? cleanTag : `#${cleanTag}`;
        tagEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // @ts-ignore
          this.store.eventBus.emit('filter:tag', cleanTag);
        });
      });
    }
    
    // Footer (grouped tags + timestamp)
    const footer = fragment.createDiv('sc-footer');
    this.renderFooter(footer);
    
    this.el.appendChild(fragment);
  }

  private copyCardContent(): void {
    // Get the raw content or rendered text
    let contentToCopy = this.card.content;
    
    // Try to get text from card content element
    const contentEl = this.el.querySelector('.sc-content');
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
      const pill = container.createDiv('sc-expiry-pill');
      pill.textContent = this.formatExpiry(this.card.expiresAt);
    }
    if (this.card.status) {
      const pill = container.createDiv('sc-status-pill');
      pill.textContent = this.card.status.name;
      pill.style.backgroundColor = this.card.status.color;
      pill.style.color = this.card.status.textColor || '#000';
    }
  }

  private async renderContent(container: HTMLElement): Promise<void> {
    if (this.isEditing || this.store.settings.disableCardRendering) {
      container.setAttribute('contenteditable', 'true');
      container.textContent = this.card.content;
      container.addClass('is-editing');
      
      // Auto-focus and place cursor at the end
      setTimeout(() => {
        container.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(container);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }, 0);

      container.addEventListener('focusin', () => {
        // @ts-ignore
        this.app.keymap.pushScope(this.scope);
        // @ts-ignore
        this.app.workspace.activeEditor = this.owner;
      });

      container.addEventListener('blur', async () => {
        // @ts-ignore
        this.app.keymap.popScope(this.scope);
        // @ts-ignore
        if (this.app.workspace.activeEditor === this.owner) {
          // @ts-ignore
          this.app.workspace.activeEditor = null;
        }

        if (this.isEditing) {
          const newContent = container.textContent || '';
          if (newContent !== this.card.content) {
            await this.store.update(this.card.id, { content: newContent });
          }
          this.isEditing = false;
          if (CardComponent.activeEditor === this) {
            CardComponent.activeEditor = null;
          }
          // Removed redundant this.render() - CardSidebarView will re-render everything on card:updated
        }
      });

      // Handle Enter and Shift+Enter according to settings
      container.addEventListener('keydown', async (e) => {
        const settings = this.store.settings;
        const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const saveKey = normalizeKey(settings.saveKey || 'enter');
        const nextLineKey = normalizeKey(settings.nextLineKey || 'shift-enter');

        let pressed = '';
        if (e.ctrlKey) pressed += 'ctrl-';
        if (e.shiftKey) pressed += 'shift-';
        if (e.altKey) pressed += 'alt-';
        if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';

        if (pressed === saveKey) {
          e.preventDefault();
          container.blur();
        } else if (pressed === nextLineKey) {
          // Default behavior for contenteditable usually handles Enter/Shift+Enter
          // but if we need manual control, we can insert a newline here.
        }
      });
    } else {
      container.setAttribute('contenteditable', 'false');
      container.removeClass('is-editing');
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

    if (settings.groupTags) {
      if (hasTags) {
        const tagsEl = container.createDiv('sc-tags');
        this.card.tags.forEach(tag => {
          const tagEl = tagsEl.createSpan('sc-tag');
          const cleanTag = tag.trim().replace(/^[-#\s]+/, '').trim();
          tagEl.textContent = settings.omitTagHash ? cleanTag : `#${cleanTag}`;
          tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // @ts-ignore
            this.store.eventBus.emit('filter:tag', cleanTag);
          });
        });
      }
      
      if (settings.showTimestamps) {
        const ts = container.createDiv('sc-timestamp');
        if (settings.timestampBelowTags) {
          ts.style.display = 'block';
          ts.style.marginTop = '4px';
        } else {
          ts.style.display = 'inline-block';
          ts.style.marginLeft = hasTags ? '8px' : '0';
        }
        ts.textContent = this.formatTimestamp(this.card.created);
      }
    } else {
      // Tags already rendered above footer in render()
      if (settings.showTimestamps) {
        container.createDiv('sc-timestamp').textContent = this.formatTimestamp(this.card.created);
      }
    }
  }

  private setupListeners(): void {
    // Enter edit mode on click
    this.el.addEventListener('click', (e) => {
      // If another card is already being edited, blur it first.
      if (CardComponent.activeEditor && CardComponent.activeEditor !== this) {
        CardComponent.activeEditor.blurAndSave();
      }

      // Don't trigger if already editing or clicking a button/pill/tag
      if (this.isEditing) return;
      
      const target = e.target as HTMLElement;
      if (
        target.closest('.sc-copy-btn') || 
        target.closest('.sc-expiry-pill') || 
        target.closest('.sc-status-pill') || 
        target.closest('.sc-tag') ||
        target.tagName === 'A' || // Don't trigger if clicking a link
        target.closest('button')
      ) {
        return;
      }

      this.isEditing = true;
      CardComponent.activeEditor = this;
      this.render();
    });

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
        container.className = 'sc-color-dots';
        if (this.store.settings.twoRowSwatches) {
          container.classList.add('two-row');
          container.style.display = 'grid';
          container.style.gridTemplateColumns = 'repeat(5, 18px)';
          container.style.gridAutoRows = '18px';
          container.style.columnGap = '8px';
          container.style.rowGap = '8px';
          container.style.width = 'fit-content';
        }

        colors.forEach((color, idx) => {
          const swatch = document.createElement('div');
          swatch.className = 'sc-color-dot';
          swatch.style.width = '18px';
          swatch.style.height = '18px';
          swatch.style.borderRadius = '4px';
          swatch.style.cursor = 'pointer';
          swatch.style.flexShrink = '0';
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
                await this.app.workspace.getLeaf(true).openFile(file);
              }
            }
          });
      });
      menu.addItem(item => {
        item.setTitle(this.card.archived ? 'Unarchive' : 'Archive')
          .setIcon('archive')
          .onClick(async () => {
            await this.store.toggleArchive(this.card.id, !this.card.archived);
          });
      });
      menu.addItem(item => {
        item.setTitle('Delete')
          .setIcon('trash')
          .onClick(async () => {
            await this.store.delete(this.card.id);
          });
      });
      menu.showAtMouseEvent(e);
    });

    // Drag start
    this.el.addEventListener('dragstart', (e) => {
      if (this.isEditing) {
        e.preventDefault();
        return;
      }
      // @ts-ignore
      this.store.eventBus.emit('card:dragstart', { card: this.card, event: e });
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', this.card.content);
        e.dataTransfer.setData('application/json', JSON.stringify(this.card));
      }
    });

    // Store updates
    // @ts-ignore
    const unbind = this.store.eventBus.on('card:updated', (updated: Card) => {
      if (updated.id === this.card.id) {
        this.card = updated;
        this.render();
      }
    });
    this.unsubscribe.push(unbind);
  }

  blurAndSave() {
    const contentEl = this.el.querySelector('.sc-content') as HTMLElement;
    if (contentEl) {
      contentEl.blur();
    }
  }

  private formatTimestamp(ts: number): string {
    const fmt = this.store.settings.datetimeFormat;
    if (fmt && (window as any).moment) {
      return (window as any).moment(ts).format(fmt);
    }
    return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private formatExpiry(ts: number): string {
    const diff = ts - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  }

  destroy(): void {
    if (CardComponent.activeEditor === this) {
      CardComponent.activeEditor = null;
    }
    CardComponent.instanceCount = Math.max(0, CardComponent.instanceCount - 1);
    if (CardComponent.instanceCount === 0 && CardComponent.globalMouseDownBound) {
      document.removeEventListener('mousedown', CardComponent.handleGlobalMouseDown, true);
      CardComponent.globalMouseDownBound = false;
    }
    this.unsubscribe.forEach(fn => fn());
    this.el.remove();
  }
}
