import { App, Editor, MarkdownFileInfo, Modal, Notice, Platform, Plugin, Scope } from "obsidian";
import { handleKeyWrap } from "../../utils/editor-utils";
import { resolveAutoColor } from "../../utils/dom";
import { CardStore } from "../../services/CardStore";
import { Card } from "../../models/Card";
import { InlineAutocomplete } from "../components/InlineAutocomplete";

interface AppWithInternals extends App {
  keymap: { pushScope: (scope: Scope) => void; popScope: (scope: Scope) => void };
  workspace: App['workspace'] & { activeEditor: (MarkdownFileInfo & { editor: Editor; editMode: boolean }) | null };
}

export class QuickCardWithFilterModal extends Modal {
  private editorScope: Scope;
  private editor!: Editor;
  private owner!: { editor: Editor; editMode: boolean };

  constructor(
    app: App,
    private plugin: Plugin,
    private store: CardStore
  ) {
    super(app);
    this.editorScope = new Scope(this.app.scope);
    this.setupMockEditor();
  }

  private setupMockEditor() {
    this.editor = {
      getSelection: () => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return "";
        const selectedText = sel.toString();
        if (selectedText.length > 0) return selectedText;
        const wordRange = this.getWordRangeAtCaret(sel);
        return wordRange ? wordRange.toString() : "";
      },
      replaceSelection: (text: string) => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const currentRange = sel.getRangeAt(0);
        const range = currentRange.collapsed
          ? (this.getWordRangeAtCaret(sel) || currentRange)
          : currentRange;
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
      toggleHighlight: () => this.toggleMarkdownWrapper("=="),
      toggleComment: () => this.toggleMarkdownWrapper("%%", "%%", true),
    } as unknown as Editor;

    this.owner = {
      editor: this.editor,
      editMode: true,
    };
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

  private toggleMarkdownWrapper(wrapper: "**" | "*" | "~~" | "==" | "%%", closeWrapper?: string, includeInnerPadding = false) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const currentRange = sel.getRangeAt(0);
    const range = currentRange.collapsed
      ? (this.getWordRangeAtCaret(sel) || currentRange)
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

  private applySelectionWrapShortcut(event: KeyboardEvent, root: HTMLElement): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const wrapMap: Record<string, [string, string]> = {
      "[": ["[", "]"],
      "(": ["(", ")"],
      "{": ["{", "}"],
      "`": ["`", "`"],
    };
    const pair = wrapMap[event.key];
    if (!pair) return false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    if (!selectedText || !root.contains(range.commonAncestorContainer)) return false;
    event.preventDefault();
    const [open, close] = pair;
    const newText = `${open}${selectedText}${close}`;
    this.editor.replaceSelection(newText);
    return true;
  }

  private getEffectiveHotkeys(commandId: string): Array<{ modifiers?: string[]; key?: string }> {
    const appAny = this.app as unknown as { hotkeyManager?: { getHotkeys?: (id: string) => Array<{ modifiers?: string[]; key?: string }>; customKeys?: Record<string, Array<{ modifiers?: string[]; key?: string }>> }; commands?: { commands?: Record<string, { hotkeys?: Array<{ modifiers?: string[]; key?: string }> }> } };
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
    const appAny = this.app as unknown as { commands?: { commands?: Record<string, { id?: string; name?: string }> } };
    const commands = appAny.commands?.commands || {};
    const matcher: Record<"bold" | "italic" | "highlight" | "comment", RegExp> = {
      bold: /bold/i,
      italic: /italic|emphasis/i,
      highlight: /highlight/i,
      comment: /comment/i,
    };
    const discovered = Object.values(commands)
      .filter((cmd) => typeof cmd?.id === "string" && cmd.id.startsWith("editor:"))
      .filter((cmd) => matcher[kind].test(String(cmd?.name || "")))
      .map((cmd) => String(cmd.id));
    return Array.from(new Set([...defaults[kind], ...discovered]));
  }

  private eventMatchesHotkey(event: KeyboardEvent, hotkey: { modifiers?: string[]; key?: string }): boolean {
    const key = String(hotkey?.key || "").toLowerCase();
    if (!key) return false;
    const eventKey = String(event.key || "").toLowerCase();
    if (eventKey !== key) return false;
    const modifierSet = new Set((hotkey.modifiers || []).map(m => String(m).toLowerCase()));

    const hasMod = modifierSet.has("mod");
    const isMac = Platform.isMacOS;

    const expectsCtrl = modifierSet.has("ctrl") || (hasMod && !isMac);
    const expectsMeta = modifierSet.has("meta") || (hasMod && isMac);
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
      root.dispatchEvent(new Event('input'));
      return true;
    }
    return false;
  }

  getAvailableFilters() {
    const filters = [
      { type: 'all', label: 'All', value: 'all' }
    ];

    if (!this.store.settings.hideTodayFilter) {
      filters.push({ type: 'category', label: 'Today', value: 'today' });
    }
    if (!this.store.settings.hideTomorrowFilter) {
      filters.push({ type: 'category', label: 'Tomorrow', value: 'tomorrow' });
    }

    if (this.store.settings.enableCustomCategories) {
      const cats = this.store.settings.customCategories || [];
      cats.forEach(cat => {
        filters.push({
          type: 'category',
          label: cat.label,
          value: cat.id || cat.label
        });
      });
    }

    if (!this.store.settings.hideArchivedFilterButton) {
      filters.push({ type: 'archived', label: 'Archived', value: 'archived' });
    }

    return filters;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('sc-quick-card-modal');

    contentEl.createDiv({ text: 'Quick card add', cls: 'sc-modal-title' });

    // Content Section
    contentEl.createDiv({ text: 'Card content', cls: 'sc-modal-section-title' });
    const editorEl = contentEl.createDiv({
      cls: 'sc-modal-textarea',
    });
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';
    
    // @category / #tag / [[file]] inline autocomplete
    new InlineAutocomplete(editorEl, this.store, this.app);

    // Simple placeholder logic for contenteditable
    editorEl.addEventListener('input', () => {
      editorEl.toggleClass('is-empty', !editorEl.textContent);
    });
    if (!editorEl.textContent) {
      editorEl.addClass('is-empty');
    }

    editorEl.focus();

    editorEl.addEventListener('focusin', () => {
      (this.app as unknown as AppWithInternals).keymap.pushScope(this.editorScope);
      (this.app as unknown as AppWithInternals).workspace.activeEditor = this.owner as unknown as MarkdownFileInfo & { editor: Editor; editMode: boolean };
    });

    editorEl.addEventListener('blur', () => {
      (this.app as unknown as AppWithInternals).keymap.popScope(this.editorScope);
      if ((this.app as unknown as AppWithInternals).workspace.activeEditor === this.owner) {
        (this.app as unknown as AppWithInternals).workspace.activeEditor = null;
      }
    });

    // Color Section
    contentEl.createDiv({ text: 'Color', cls: 'sc-modal-section-title' });
    const colorContainer = contentEl.createDiv('sc-modal-color-container');
    let selectedColor = 'var(--card-color-1)';
    const colors = [
      { name: 'Gray', var: 'var(--card-color-1)' },
      { name: 'Red', var: 'var(--card-color-2)' },
      { name: 'Orange', var: 'var(--card-color-3)' },
      { name: 'Yellow', var: 'var(--card-color-4)' },
      { name: 'Green', var: 'var(--card-color-5)' },
      { name: 'Blue', var: 'var(--card-color-6)' },
      { name: 'Purple', var: 'var(--card-color-7)' },
      { name: 'Magenta', var: 'var(--card-color-8)' },
      { name: 'Pink', var: 'var(--card-color-9)' },
      { name: 'Brown', var: 'var(--card-color-10)' }
    ];

    colors.forEach((color, idx) => {
      const swatch = colorContainer.createDiv('sc-modal-color-swatch');
      swatch.style.backgroundColor = this.resolveColor(color.var);
      swatch.title = this.store.settings.colorNames[idx] || color.name;
      
      if (selectedColor === color.var) swatch.addClass('is-selected');

      swatch.addEventListener('click', () => {
        colorContainer.querySelectorAll('.sc-modal-color-swatch').forEach(s => s.removeClass('is-selected'));
        swatch.addClass('is-selected');
        selectedColor = color.var;
      });
    });

    // Tags Section
    contentEl.createDiv({ text: 'Tags', cls: 'sc-modal-section-title' });
    const tagsWrapper = contentEl.createDiv('sc-modal-tags-wrapper');
    const tagsInput = tagsWrapper.createEl('input', {
      placeholder: 'Tags (comma separated)...',
      cls: 'sc-modal-tags-input'
    });
    const tagsAutocomplete = tagsWrapper.createDiv('sc-modal-tags-autocomplete');
    tagsAutocomplete.addClass('sc-hidden');

    // Tag Autocomplete Logic
    let selectedTagIdx = -1;
    const updateAutocomplete = () => {
      const val = tagsInput.value;
      const lastComma = val.lastIndexOf(',');
      const currentTag = val.substring(lastComma + 1).trim().toLowerCase();

      if (!currentTag) {
        tagsAutocomplete.addClass('sc-hidden');
        return;
      }

      const allTags = this.getAllTags();
      const suggestions = allTags.filter(t => t.startsWith(currentTag)).slice(0, 8);

      if (suggestions.length === 0) {
        tagsAutocomplete.addClass('sc-hidden');
        return;
      }

      tagsAutocomplete.empty();
      selectedTagIdx = -1;
      suggestions.forEach((tag) => {
        const item = tagsAutocomplete.createDiv('sc-modal-autocomplete-item');
        item.textContent = tag;
        item.addEventListener('click', () => {
          const before = val.substring(0, lastComma + 1);
          tagsInput.value = (before ? before + ' ' : '') + tag + ', ';
          tagsAutocomplete.addClass('sc-hidden');
          tagsInput.focus();
        });
      });
      tagsAutocomplete.removeClass('sc-hidden');
    };

    tagsInput.addEventListener('input', updateAutocomplete);
    tagsInput.addEventListener('keydown', (e) => {
      if (tagsAutocomplete.hasClass('sc-hidden')) return;
      const items = tagsAutocomplete.querySelectorAll('.sc-modal-autocomplete-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedTagIdx = (selectedTagIdx + 1) % items.length;
        items.forEach((it, i) => it.toggleClass('is-selected', i === selectedTagIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedTagIdx = (selectedTagIdx - 1 + items.length) % items.length;
        items.forEach((it, i) => it.toggleClass('is-selected', i === selectedTagIdx));
      } else if (e.key === 'Enter' && selectedTagIdx >= 0) {
        e.preventDefault();
        (items[selectedTagIdx] as HTMLElement).click();
      }
    });

    // Category Section
    contentEl.createDiv({ text: 'Apply category', cls: 'sc-modal-section-title' });
    const select = contentEl.createEl('select', { cls: 'sc-modal-select' });
    this.getAvailableFilters().forEach(f => {
      const opt = select.createEl('option', { value: f.value, text: f.label });
      opt.dataset.type = f.type;
    });

    // Action Buttons
    const btnContainer = contentEl.createDiv('sc-modal-buttons');
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const createBtn = btnContainer.createEl('button', { text: 'Create card', cls: 'mod-cta' });
    const handleCreate = async () => {
      const content = editorEl.textContent?.trim();
      if (!content) {
        new Notice('Content cannot be empty');
        return;
      }

      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => !!t);
      const category = select.value === 'all' ? null : select.value;

      // Also extract inline @category from content and strip @/# tokens
      const inlineCatMatch = /@([^\s#@,.]+)/.exec(content);
      const effectiveCategory = inlineCatMatch ? inlineCatMatch[1] : category;
      const cleanContent = content.replace(/@[^\s#@,.]+/g, '').replace(/\s{2,}/g, ' ').trim();
      
      const autoColor = resolveAutoColor(content, tags, this.store.settings);
      const effectiveColor = autoColor || selectedColor;
      const card = new Card({ content: cleanContent, color: effectiveColor, tags, category: effectiveCategory === 'all' ? null : effectiveCategory });
      await this.store.add(card);
      
      // If we chose a specific category, try to filter the sidebar to it
      if (category) {
        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view as unknown as { activeFilters: { category: string }; renderCards: () => void } | undefined;
        if (view) {
          view.activeFilters.category = category;
          view.renderCards();
        }
      }

      this.close();
    };

    createBtn.addEventListener('click', () => { void handleCreate(); });

    // Keyboard Shortcuts
    editorEl.addEventListener('keydown', (e) => {
      if (this.applyFormattingHotkey(e, editorEl)) return;
      if (handleKeyWrap(e, editorEl, this.editor, (this.plugin as Plugin & { settings?: { autoPairBrackets?: boolean } }).settings?.autoPairBrackets !== false)) {
        editorEl.dispatchEvent(new Event('input'));
        return;
      }
      const settings = this.store.settings;
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s+_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(settings.saveKey || 'enter');

      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';

      if (pressed === saveKey) {
        e.preventDefault();
        void handleCreate();
      }
    });
  }

  private resolveColor(colorVar: string): string {
    const root = document.documentElement;
    const clean = colorVar.replace('var(', '').replace(')', '');
    return getComputedStyle(root).getPropertyValue(clean).trim() || colorVar;
  }

  private getAllTags(): string[] {
    const tags = new Set<string>();
    this.store.getAll().forEach(c => {
      if (c.tags) c.tags.forEach(t => tags.add(t.toLowerCase()));
    });
    return Array.from(tags).sort();
  }
}
