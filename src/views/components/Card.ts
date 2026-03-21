
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";
import { applyCardColorToElement } from "../../utils/dom";
import { App, MarkdownRenderer, Plugin, Menu, Notice, TFile, TFolder, setIcon, Scope, Editor, Platform } from "obsidian";
import { DateTimeModal } from "../modals/DateTimeModal";
import { getWordRangeAtCaret, handleKeyWrap } from "../../utils/editor-utils";
import { InlineAutocomplete } from "./InlineAutocomplete";

export class CardComponent {
  public el: HTMLElement;
  static activeEditor: CardComponent | null = null;
  private static instanceCount = 0;
  private static globalMouseDownBound = false;
  private static readonly handleGlobalMouseDown = (event: MouseEvent) => {
    const active = CardComponent.activeEditor;
    if (!active || !active.isEditing) return;
    const target = event.target as Node | null;
    const editableEl = active.el.querySelector('.sc-content[contenteditable="true"]');
    if (target && editableEl && editableEl.contains(target)) return;
    active.ignoreNextClick = true;
    active.blurAndSave();
  };
  private card: Card;
  private unsubscribe: (() => void)[] = [];
  private isEditing: boolean = false;
  private ignoreNextClick: boolean = false;
  private renderCount: number = 0;
  private expiryTickInterval: number | null = null;
  private scope: Scope;
  private editor!: Editor;
  private owner!: any;

  constructor(
    private container: HTMLElement,
    card: Card,
    private store: CardStore,
    private app: App,
    private plugin: Plugin,
    private settingsOverride?: { groupTags?: boolean; showTimestamps?: boolean; showTags?: boolean }
  ) {
    CardComponent.instanceCount += 1;
    this.card = card;
    this.el = container.createDiv('sc-card');
    this.scope = new Scope(this.app.scope);
    this.setupMockEditor();
    this.ensureGlobalMouseDownHandler();
    void this.render();
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
        if (!sel || !sel.rangeCount) return "";
        const selectedText = sel.toString();
        if (selectedText.length > 0) return selectedText;
        const wordRange = getWordRangeAtCaret(sel);
        return wordRange ? wordRange.toString() : "";
      },
      replaceSelection: (text: string, keepSelection: boolean = false) => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const currentRange = sel.getRangeAt(0);
        const isCollapsed = currentRange.collapsed;
        const range = isCollapsed
          ? (getWordRangeAtCaret(sel) || currentRange)
          : currentRange;
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        
        if (keepSelection || !isCollapsed) {
          const newRange = document.createRange();
          newRange.selectNode(node);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } else {
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      toggleBold: () => this.toggleMarkdownWrapper("**"),
      toggleItalic: () => this.toggleMarkdownWrapper("*"),
      toggleHighlight: () => this.toggleMarkdownWrapper("=="),
      toggleComment: () => this.toggleMarkdownWrapper("%%", "%%", true),
    } as any;

    this.owner = {
      editor: this.editor,
      editMode: true,
    };
  }



  private toggleMarkdownWrapper(wrapper: "**" | "*" | "~~" | "==" | "%%", closeWrapper?: string, includeInnerPadding = false) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const currentRange = sel.getRangeAt(0);
    const range = currentRange.collapsed
      ? (getWordRangeAtCaret(sel) || currentRange)
      : currentRange;
    const selectedText = range.toString();
    const endWrapper = closeWrapper ?? wrapper;
    if (selectedText.length === 0) {
      const text = wrapper + endWrapper;
      const node = document.createTextNode(text);
      range.insertNode(node);
      const cursorOffset = wrapper.length;
      range.setStart(node, cursorOffset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    const alreadyWrapped = selectedText.startsWith(wrapper) && selectedText.endsWith(endWrapper);
    const newText = alreadyWrapped
      ? selectedText.slice(wrapper.length, selectedText.length - endWrapper.length)
      : includeInnerPadding
        ? `${wrapper} ${selectedText} ${endWrapper}`
        : `${wrapper}${selectedText}${endWrapper}`;
    sel.removeAllRanges();
    sel.addRange(range);
    this.editor.replaceSelection(newText);
  }



  private getEffectiveHotkeys(commandId: string): Array<{ modifiers?: string[]; key?: string }> {
    const appAny = this.app as any;
    const fromManager = appAny.hotkeyManager?.getHotkeys?.(commandId);
    if (Array.isArray(fromManager) && fromManager.length > 0) return fromManager;
    const custom = appAny.hotkeyManager?.customKeys?.[commandId];
    if (Array.isArray(custom) && custom.length > 0) return custom;
    const defaults = appAny.commands?.commands?.[commandId]?.hotkeys;
    if (Array.isArray(defaults) && defaults.length > 0) return defaults;
    return [];
  }

  private getFormattingCommandIds(kind: "bold" | "italic" | "highlight" | "comment"): string[] {
    const defaults: Record<"bold" | "italic" | "highlight" | "comment", string[]> = {
      bold: ["editor:toggle-bold", "custom-wrap-bold"],
      italic: ["editor:toggle-italic", "editor:toggle-emphasis", "custom-wrap-italic"],
      highlight: ["editor:toggle-highlight", "custom-wrap-highlight"],
      comment: ["editor:toggle-comment", "custom-wrap-comment"],
    };
    const appAny = this.app as any;
    const commands = appAny.commands?.commands || {};
    const matcher: Record<"bold" | "italic" | "highlight" | "comment", RegExp> = {
      bold: /bold/i,
      italic: /italic|emphasis/i,
      highlight: /highlight/i,
      comment: /comment/i,
    };
    const discovered = Object.values(commands)
      .filter((cmd: any) => typeof cmd?.id === "string" && cmd.id.startsWith("editor:"))
      .filter((cmd: any) => matcher[kind].test(String(cmd?.name || "")))
      .map((cmd: any) => String(cmd.id));
    return Array.from(new Set([...defaults[kind], ...discovered]));
  }

  private eventMatchesHotkey(event: KeyboardEvent, hotkey: { modifiers?: string[]; key?: string }): boolean {
    const key = String(hotkey?.key || "").toLowerCase();
    if (!key) return false;
    const eventKey = String(event.key || "").toLowerCase();
    if (eventKey !== key) return false;
    const modifierSet = new Set((hotkey.modifiers || []).map(m => String(m).toLowerCase()));
    
    // In Obsidian, 'Mod' is Ctrl on Windows/Linux and Cmd on Mac
    const hasMod = modifierSet.has("mod");
    const expectsCtrl = modifierSet.has("ctrl") || (hasMod && !Platform.isMacOS);
    const expectsMeta = modifierSet.has("meta") || (hasMod && Platform.isMacOS);
    const expectsAlt = modifierSet.has("alt");
    const expectsShift = modifierSet.has("shift");
    
    if (expectsCtrl !== event.ctrlKey) return false;
    if (expectsMeta !== event.metaKey) return false;
    if (expectsAlt !== event.altKey) return false;
    if (expectsShift !== event.shiftKey) return false;
    return true;
  }

  private applyFormattingHotkey(event: KeyboardEvent, root: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return false;
    const targets: Array<{ kind: "bold" | "italic" | "highlight" | "comment"; run: () => void }> = [
      { kind: "bold", run: () => this.toggleMarkdownWrapper("**") },
      { kind: "italic", run: () => this.toggleMarkdownWrapper("*") },
      { kind: "highlight", run: () => this.toggleMarkdownWrapper("==") },
      { kind: "comment", run: () => this.toggleMarkdownWrapper("%%", "%%", true) },
    ];
    for (const target of targets) {
      const commandIds = this.getFormattingCommandIds(target.kind);
      const hotkeys = commandIds.flatMap(id => this.getEffectiveHotkeys(id));
      if (!hotkeys.length) continue;
      if (!hotkeys.some(h => this.eventMatchesHotkey(event, h))) continue;
      event.preventDefault();
      event.stopPropagation();
      target.run();
      return true;
    }
    return false;
  }

  private async render(): Promise<void> {
    const currentRender = ++this.renderCount;
    this.stopExpiryTick();

    // When entering edit mode, swap only the content div in-place
    // to avoid a full re-render race that removes the contenteditable element
    if (this.isEditing) {
      const existingContent = this.el.querySelector('.sc-content');
      if (existingContent) {
        existingContent.setAttribute('contenteditable', 'true');
        existingContent.textContent = this.card.content;
        existingContent.addClass('is-editing');
        setTimeout(() => {
          existingContent.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(existingContent);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }, 0);
        existingContent.addEventListener('focusin', () => {
          // @ts-ignore
          this.app.keymap.pushScope(this.scope);
          // @ts-ignore
          this.app.workspace.activeEditor = this.owner;
        });
        existingContent.addEventListener('blur', () => {
          // @ts-ignore
          this.app.keymap.popScope(this.scope);
          // @ts-ignore
          if (this.app.workspace.activeEditor === this.owner) {
            // @ts-ignore
            this.app.workspace.activeEditor = null;
          }
          if (this.isEditing) {
            void (async () => {
              const newContent = existingContent.textContent || '';
              if (newContent !== this.card.content) {
                await this.store.update(this.card.id, { content: newContent });
              }
              this.isEditing = false;
              if (CardComponent.activeEditor === this) {
                CardComponent.activeEditor = null;
              }
              void this.render();
            })();
          }
        });
        existingContent.addEventListener('keydown', (e) => {
          if (handleKeyWrap(e, existingContent, this.editor, (this.plugin as any).settings?.autoPairBrackets !== false)) {
            e.preventDefault(); e.stopPropagation(); return;
          }
          if (this.applyFormattingHotkey(e, existingContent)) return;
          const settings = this.store.settings;
          const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s+_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const saveKey = normalizeKey(settings.saveKey || 'enter');
          let pressed = '';
          if (e.ctrlKey) pressed += 'ctrl-';
          if (e.shiftKey) pressed += 'shift-';
          if (e.altKey) pressed += 'alt-';
          if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';
          if (pressed === saveKey) { e.preventDefault(); existingContent.blur(); }
        });
        return;
      }
      // No existing content div — fall through to full render
    }

    this.el.empty();
    this.el.dataset.id = this.card.id;
    this.el.draggable = true;
    
    // Apply styling
    const statusDef = this.card.status
      ? (this.store.settings.cardStatuses || []).find(s => s.name === this.card.status!.name)
      : null;
    const useStatusColor = this.store.settings.inheritStatusColor && statusDef;
    const effectiveColor = useStatusColor && statusDef
      ? (statusDef.colorIndex ? `var(--card-color-${statusDef.colorIndex})` : statusDef.color)
      : this.card.color;
    applyCardColorToElement(this.el, effectiveColor, this.store.settings);

    if (this.card.status?.name) {
      this.el.dataset.status = this.card.status.name;
    } else {
      delete this.el.dataset.status;
    }

    const maxH = this.store.settings.maxCardHeight;
    if (maxH && maxH > 0) {
      /* eslint-disable obsidianmd/no-static-styles-assignment */
      this.el.style.setProperty('max-height', `${maxH}px`, 'important');
      this.el.style.setProperty('overflow', 'hidden', 'important');
      /* eslint-enable obsidianmd/no-static-styles-assignment */
    } else {
      this.el.style.removeProperty('max-height');
      this.el.style.removeProperty('overflow');
    }
    
    if (this.store.settings.cardStyle === 2) {
      this.el.addClass('sc-style-2-masonry');
    } else {
      this.el.removeClass('sc-style-2-masonry');
    }

    // --- Synchronous parts: render directly into this.el before any await ---

    if (this.store.settings.enableCopyCardContent) {
      const copyBtn = this.el.createDiv('sc-copy-btn');
      try { setIcon(copyBtn, 'copy'); } catch { copyBtn.textContent = '📋'; }
      copyBtn.title = 'Copy card content';
      copyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.copyCardContent(); });
    }

    const pillBar = this.el.createDiv('sc-pill-bar');
    this.renderPills(pillBar);

    // --- Async part: content rendering ---
    const content = this.el.createDiv('sc-content');
    await this.renderContent(content);

    // If a newer render started while we were awaiting, remove the stale content
    // but keep the pills already in the DOM — the newer render will replace everything
    if (currentRender !== this.renderCount) {
      content.remove();
      return;
    }

    const footer = this.el.createDiv('sc-footer');
    this.renderFooter(footer);

    // Start live countdown tick if this card has an expiry
    this.startExpiryTick();
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
    }, () => {
      new Notice('Failed to copy card content');
    });
  }

  private renderPills(container: HTMLElement): void {
    if (this.card.expiresAt && this.store.settings.showExpiryTimeLeft) {
      const pill = container.createDiv('sc-expiry-pill');
      pill.textContent = this.formatExpiryTimeLeft(this.card.expiresAt);
      if (this.card.status) pill.setCssProps({ 'margin-bottom': '4px' });
    }
    if (this.card.status) {
      const pill = container.createDiv('sc-status-pill');
      pill.textContent = this.card.status.name;
      const statusDef = (this.store.settings.cardStatuses || []).find(s => s.name === this.card.status!.name);
      if (statusDef?.colorIndex) {
        pill.style.backgroundColor = `var(--card-color-${statusDef.colorIndex})`;
        pill.style.color = statusDef.textColor || '#000';
      } else {
        pill.style.backgroundColor = this.card.status.color || 'transparent';
        pill.style.color = this.card.status.textColor || '#000';
      }
    }
  }

  private async renderContent(container: HTMLElement): Promise<void> {
    if (this.isEditing || this.store.settings.disableCardRendering) {
      container.setAttribute('contenteditable', 'true');
      container.textContent = this.card.content;
      container.addClass('is-editing');

      // [[file]] / @category / #tag inline autocomplete
      const ac = new InlineAutocomplete(container, this.store, this.app);
      
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

      container.addEventListener('blur', () => {
        // @ts-ignore
        this.app.keymap.popScope(this.scope);
        // @ts-ignore
        if (this.app.workspace.activeEditor === this.owner) {
          // @ts-ignore
          this.app.workspace.activeEditor = null;
        }

        if (this.isEditing) {
          void (async () => {
            ac.destroy();
            const newContent = container.textContent || '';
            if (newContent !== this.card.content) {
              await this.store.update(this.card.id, { content: newContent });
            }
            this.isEditing = false;
            if (CardComponent.activeEditor === this) {
              CardComponent.activeEditor = null;
            }
            void this.render();
          })();
        }
      });

      // Handle Enter and Shift+Enter according to settings
      container.addEventListener('keydown', (e) => {
        if (handleKeyWrap(e, container, this.editor, (this.plugin as any).settings?.autoPairBrackets !== false)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.applyFormattingHotkey(e, container)) return;
        const settings = this.store.settings;
        const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s+_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
      // eslint-disable-next-line obsidianmd/no-plugin-as-component
      await MarkdownRenderer.render(this.app, this.card.content, temp, this.card.notePath || '', this.plugin);
      temp.querySelectorAll('mark').forEach(el => el.addClass('cm-highlight'));
      while (temp.firstChild) container.appendChild(temp.firstChild);
      this.attachInternalLinkHandlers(container);
    }
  }

  private attachInternalLinkHandlers(container: HTMLElement): void {
    const links = container.querySelectorAll('a.internal-link, a[data-href]');
    links.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.dataset?.href || '';
      if (!href) return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const openInNewLeaf = e.metaKey || e.ctrlKey;
        void this.openOrCreateLink(href, openInNewLeaf);
      });
    });
  }

  private async openOrCreateLink(rawLinkText: string, openInNewLeaf: boolean): Promise<void> {
    const sourcePath = this.card.notePath || this.app.workspace.getActiveFile()?.path || '';
    const linkText = String(rawLinkText || '').trim();
    if (!linkText) return;

    const { filePart, fullLinkText } = this.parseLinkText(linkText);
    const dest =
      this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath) ||
      (filePart.endsWith('.md')
        ? this.app.metadataCache.getFirstLinkpathDest(filePart.slice(0, -3), sourcePath)
        : null);

    if (dest) {
      await (this.app.workspace as any).openLinkText(fullLinkText, sourcePath, openInNewLeaf);
      return;
    }

    const created = await this.createFileForLinkTarget(filePart, sourcePath);
    if (!created) return;

    await (this.app.workspace as any).openLinkText(fullLinkText, sourcePath, openInNewLeaf);
  }

  private parseLinkText(linkText: string): { filePart: string; fullLinkText: string } {
    const fullLinkText = String(linkText || '').trim();
    const noAlias = fullLinkText.split('|')[0]?.trim() || '';
    const withoutBang = noAlias.startsWith('!') ? noAlias.slice(1).trim() : noAlias;
    const fileOnly = withoutBang.split('#')[0]?.split('^')[0]?.trim() || '';
    return { filePart: fileOnly, fullLinkText };
  }

  private async createFileForLinkTarget(filePartRaw: string, sourcePath: string): Promise<TFile | null> {
    const filePart = this.sanitizePath(String(filePartRaw || '').trim());
    if (!filePart) return null;

    const pluginFolderRaw = String((this.plugin as any)?.settings?.storageFolder || '').trim();
    const pluginFolder = pluginFolderRaw && pluginFolderRaw !== '/' ? pluginFolderRaw : '';

    const sourceFolder = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    const defaultFolder = sourceFolder || this.app.workspace.getActiveFile()?.parent?.path || pluginFolder;

    const hasFolder = filePart.includes('/');
    const basePath = (hasFolder ? filePart.replace(/^\/+/, '') : [defaultFolder, filePart].filter(Boolean).join('/')).replace(/^\/+/, '');
    const normalizedBase = basePath.replace(/\/+/g, '/');

    const { targetPath } = this.ensureExtension(normalizedBase);
    const folderPath = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';

    if (folderPath) {
      await this.ensureFolderExists(folderPath);
    }

    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) return existing;

    try {
      return await this.app.vault.create(targetPath, '');
    } catch {
      new Notice(`Failed to create file: ${targetPath}`);
      return null;
    }
  }

  private ensureExtension(path: string): { targetPath: string } {
    const lastSegment = path.split('/').pop() || '';
    const hasExtension = /\.[A-Za-z0-9]+$/.test(lastSegment);
    if (hasExtension) return { targetPath: path };
    return { targetPath: `${path}.md` };
  }

  private sanitizePath(path: string): string {
    return path
      .replace(/[\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const normalized = this.sanitizePath(folderPath);
    if (!normalized) return;

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing instanceof TFile) return;
      try {
        await this.app.vault.createFolder(current);
      } catch {
        // folder may already exist, ignore
      }
    }
  }

  private renderFooter(container: HTMLElement): void {
    const settings = this.store.settings;
    const groupTags = this.settingsOverride?.groupTags ?? settings.groupTags;
    const showTimestamps = this.settingsOverride?.showTimestamps ?? settings.showTimestamps;
    // showTags override: if explicitly set use it, otherwise tags are always shown
    const showTags = this.settingsOverride?.showTags ?? true;
    const hasTags = showTags && this.card.tags && this.card.tags.length > 0;

    if (groupTags) {
      if (showTimestamps && settings.timestampBelowTags) {
        // "above tags" mode — render timestamp first
        const ts = container.createDiv('sc-timestamp sc-timestamp--block');
        ts.textContent = this.formatTimestamp(this.card.created);
      }

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

      if (showTimestamps && !settings.timestampBelowTags) {
        // default: inline after tags
        const ts = container.createDiv(`sc-timestamp ${hasTags ? 'sc-timestamp--inline-spaced' : 'sc-timestamp--inline'}`);
        ts.textContent = this.formatTimestamp(this.card.created);
      }
    } else {
      // Tags already rendered above footer in render()
      if (showTimestamps) {
        container.createDiv('sc-timestamp').textContent = this.formatTimestamp(this.card.created);
      }
    }
  }

  private setupListeners(): void {
    // Drag card content into an editor
    this.el.addEventListener('dragstart', (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'copyMove';
      const payload = JSON.stringify({ id: this.card.id, content: this.card.content });
      e.dataTransfer.setData('text/x-card-sidebar', payload);
      try { e.dataTransfer.setData('text/plain', this.card.content); } catch { /* some browsers restrict */ }
    });

    // Enter edit mode on click
    this.el.addEventListener('click', (e) => {
      if (this.ignoreNextClick) {
        this.ignoreNextClick = false;
        return;
      }

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
      void this.render();
    });

    // Context menu
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      const s = this.store.settings;

      // Colors
      menu.addItem(item => {
        item.setTitle('Colors');
        const container = document.createElement('div');
        container.className = 'sc-color-dots';
        if (s.twoRowSwatches) container.classList.add('two-row');
        const colors = [
          'var(--card-color-1)', 'var(--card-color-2)', 'var(--card-color-3)',
          'var(--card-color-4)', 'var(--card-color-5)', 'var(--card-color-6)',
          'var(--card-color-7)', 'var(--card-color-8)', 'var(--card-color-9)',
          'var(--card-color-10)'
        ];
        colors.forEach((color, idx) => {
          const swatch = document.createElement('div');
          swatch.className = 'sc-color-dot sc-color-dot-swatch';
          swatch.style.border = this.card.color === color ? '2px solid var(--text-accent)' : '1px solid var(--background-modifier-border)';
          swatch.title = s.colorNames[idx] || `Color ${idx + 1}`;
          const computed = getComputedStyle(document.documentElement).getPropertyValue(color.replace('var(', '').replace(')', ''));
          swatch.style.backgroundColor = computed.trim() || color;
          swatch.addEventListener('click', () => { void this.store.setColor(this.card.id, color); });
          container.appendChild(swatch);
        });
        (item as any).titleEl?.appendChild(container);
      });

      // Categories
      const todayVisible = !s.hideTodayFilter;
      const tomorrowVisible = !s.hideTomorrowFilter;
      const customCategories = s.enableCustomCategories ? (s.customCategories || []).filter(c => c.showInMenu !== false) : [];
      if (todayVisible || tomorrowVisible || customCategories.length > 0) {
        if (todayVisible) {
          menu.addItem(item => {
            item.setTitle('Add to today')
              .setIcon(s.builtinCategoryIcons?.['today'] ?? 'calendar-check')
              .onClick(async () => { await this.store.setCategory(this.card.id, 'today'); });
          });
        }
        if (tomorrowVisible) {
          menu.addItem(item => {
            item.setTitle('Add to tomorrow')
              .setIcon(s.builtinCategoryIcons?.['tomorrow'] ?? 'calendar-plus')
              .onClick(async () => { await this.store.setCategory(this.card.id, 'tomorrow'); });
          });
        }
        customCategories.forEach(cat => {
          menu.addItem(item => {
            item.setTitle(`Add to ${cat.label}`)
              .setIcon(cat.icon || 'plus-square')
              .onClick(async () => { await this.store.setCategory(this.card.id, cat.label || cat.id); });
          });
        });
        if (this.card.category) {
          menu.addItem(item => {
            item.setTitle(`Remove from ${this.card.category}`)
              .setIcon('x')
              .onClick(async () => { await this.store.setCategory(this.card.id, null); });
          });
        }
      }

      menu.addSeparator();

      // Pin
      menu.addItem(item => {
        item.setTitle(this.card.pinned ? 'Unpin' : 'Pin card')
          .setIcon('pin')
          .onClick(async () => { await this.store.togglePin(this.card.id, !this.card.pinned); });
      });

      // Set status
      if (s.enableCardStatus && Array.isArray(s.cardStatuses) && s.cardStatuses.length > 0) {
        menu.addItem(item => {
          item.setTitle('Set status')
            .setIcon('flag')
            .onClick(() => {
              const menu2 = new Menu();
              s.cardStatuses?.forEach(st => {
                menu2.addItem(i => {
                  i.setTitle(st.name || '')
                    .onClick(async () => {
                      await this.store.setStatus(this.card.id, {
                        name: st.name || '',
                        color: st.color || '',
                        textColor: st.textColor || '#000',
                        colorIndex: st.colorIndex
                      });
                    });
                });
              });
              menu2.addItem(i => {
                i.setTitle('Clear status').onClick(async () => { await this.store.setStatus(this.card.id, null); });
              });
              menu2.showAtMouseEvent(e);
            });
        });
      }

      // Set expiry
      menu.addItem(item => {
        item.setTitle('Set expiry')
          .setIcon('alarm-clock')
          .onClick(() => { new DateTimeModal(this.app, this.card, this.store).open(); });
      });

      menu.addSeparator();

      // Duplicate
      menu.addItem(item => {
        item.setTitle('Duplicate')
          .setIcon('copy')
          .onClick(async () => { await this.store.duplicateCard(this.card.id); });
      });

      // View / Create note
      menu.addItem(item => {
        item.setTitle(this.card.notePath ? 'View note' : 'Create note')
          .setIcon(this.card.notePath ? 'link' : 'file-plus')
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

      // Archive
      if (!s.hideArchivedFilterButton || this.card.archived) {
        menu.addItem(item => {
          item.setTitle(this.card.archived ? 'Unarchive' : 'Archive')
            .setIcon(s.builtinCategoryIcons?.['archived'] ?? 'archive')
            .onClick(async () => { await this.store.toggleArchive(this.card.id, !this.card.archived); });
        });
      }

      // Delete
      menu.addItem(item => {
        item.setTitle('Delete')
          .setIcon('trash')
          .onClick(async () => { await this.store.delete(this.card.id); });
      });

      menu.showAtMouseEvent(e);
    });

    // Store updates
    // @ts-ignore
    const unbind = this.store.eventBus.on('card:updated', (updated: Card) => {
      if (updated.id === this.card.id) {
        this.card = updated;
        // Don't re-render while the user is actively editing — it would
        // race with the in-flight render and remove the contenteditable div
        if (!this.isEditing) {
          void this.render();
        }
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
    // Prefer the file's actual creation time from Obsidian's metadata
    const created = this.getCreatedTime();
    const fmt = this.store.settings.datetimeFormat;
    if (fmt && (window as any).moment) {
      return (window as any).moment(created).format(fmt);
    }
    return new Date(created).toLocaleDateString() + ' ' + new Date(created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private getCreatedTime(): number {
    if (this.card.notePath) {
      const file = this.app.vault.getAbstractFileByPath(this.card.notePath);
      if (file instanceof TFile) return file.stat.ctime;
    }
    return this.card.created;
  }

  private formatExpiry(ts: number): string {
    const diff = ts - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  }

  private formatExpiryTimeLeft(ts: number): string {
    const diff = ts - Date.now();
    if (diff <= 0) return 'Expired';
    const fmt = this.store.settings.expiryTimeFormat || 'human';
    const totalSecs = Math.floor(diff / 1000);
    const years   = Math.floor(totalSecs / (365 * 24 * 3600));
    const months  = Math.floor((totalSecs % (365 * 24 * 3600)) / (30 * 24 * 3600));
    const weeks   = Math.floor((totalSecs % (30 * 24 * 3600)) / (7 * 24 * 3600));
    const days    = Math.floor((totalSecs % (7 * 24 * 3600)) / (24 * 3600));
    const hours   = Math.floor((totalSecs % (24 * 3600)) / 3600);
    const mins    = Math.floor((totalSecs % 3600) / 60);
    const secs    = totalSecs % 60;
    if (fmt === 'short') {
      const parts: string[] = [];
      if (years)  parts.push(`${years}y`);
      if (months) parts.push(`${months}mo`);
      if (weeks)  parts.push(`${weeks}w`);
      if (days)   parts.push(`${days}d`);
      if (hours)  parts.push(`${hours}h`);
      if (mins)   parts.push(`${mins}m`);
      if (secs && parts.length < 2) parts.push(`${secs}s`);
      return 'Expires in ' + (parts.slice(0, 3).join(' ') || '< 1s');
    }
    // human format
    const parts: string[] = [];
    if (years)  parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    if (months) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    if (weeks)  parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
    if (days)   parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours)  parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (mins)   parts.push(`${mins} min${mins !== 1 ? 's' : ''}`);
    if (secs && parts.length < 2) parts.push(`${secs} sec${secs !== 1 ? 's' : ''}`);
    return 'Expires in ' + (parts.slice(0, 3).join(' ') || '< 1 sec');
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
    this.stopExpiryTick();
    this.unsubscribe.forEach(fn => fn());
    this.el.remove();
  }

  private startExpiryTick(): void {
    this.stopExpiryTick();
    if (!this.card.expiresAt || !this.store.settings.showExpiryTimeLeft) return;
    // Tick every second so the countdown stays live
    this.expiryTickInterval = window.setInterval(() => {
      const pill = this.el.querySelector('.sc-expiry-pill');
      if (!(pill instanceof HTMLElement) || !this.card.expiresAt) return;
      pill.textContent = this.formatExpiryTimeLeft(this.card.expiresAt);
    }, 1000);
  }

  private stopExpiryTick(): void {
    if (this.expiryTickInterval !== null) {
      window.clearInterval(this.expiryTickInterval);
      this.expiryTickInterval = null;
    }
  }
}
