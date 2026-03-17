
import { Modal, App, Plugin, Notice, setIcon, Menu, Scope, Editor } from "obsidian";
import { CardStore } from "../../services/CardStore";
import { Card } from "../../models/Card";

export class QuickCardWithFilterModal extends Modal {
  private editorScope: Scope;
  private editor!: Editor;
  private owner!: any;

  constructor(
    app: App,
    private plugin: Plugin,
    private store: CardStore
  ) {
    super(app);
    this.editorScope = new Scope(this.app.scope);
    // Block native formatting keys so Obsidian's global commands take over
    this.editorScope.register(["Mod"], "b", () => true);
    this.editorScope.register(["Mod"], "i", () => true);
    this.editorScope.register(["Mod"], "u", () => true);
    this.setupMockEditor();
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

  getAvailableFilters() {
    const filters = [
      { type: 'all', label: 'All', value: 'all' }
    ];

    const showTimeBasedChips = !this.store.settings.disableTimeBasedFiltering;
    if (showTimeBasedChips) {
      filters.push(
        { type: 'category', label: 'Today', value: 'today' },
        { type: 'category', label: 'Tomorrow', value: 'tomorrow' }
      );
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

    contentEl.createEl('h2', { text: 'Quick Card Add', cls: 'sc-modal-title' });

    // Content Section
    contentEl.createEl('h3', { text: 'Card Content', cls: 'sc-modal-section-title' });
    const editorEl = contentEl.createDiv({
      cls: 'sc-modal-textarea',
    });
    editorEl.setAttribute('contenteditable', 'true');
    editorEl.dataset.placeholder = 'Type here... (@category, #tag)';
    
    // Simple placeholder logic for contenteditable
    if (!editorEl.textContent) {
      editorEl.addClass('is-empty');
    }
    editorEl.addEventListener('input', () => {
      editorEl.toggleClass('is-empty', !editorEl.textContent);
    });

    editorEl.focus();

    editorEl.addEventListener('focusin', () => {
      // @ts-ignore
      this.app.keymap.pushScope(this.editorScope);
      // @ts-ignore
      this.app.workspace.activeEditor = this.owner;
    });

    editorEl.addEventListener('blur', () => {
      // @ts-ignore
      this.app.keymap.popScope(this.editorScope);
      // @ts-ignore
      if (this.app.workspace.activeEditor === this.owner) {
        // @ts-ignore
        this.app.workspace.activeEditor = null;
      }
    });

    // Color Section
    contentEl.createEl('h3', { text: 'Color', cls: 'sc-modal-section-title' });
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
      const hex = this.resolveColor(color.var);
      swatch.style.backgroundColor = hex;
      swatch.title = this.store.settings.colorNames[idx] || color.name;
      
      if (selectedColor === color.var) swatch.addClass('is-selected');

      swatch.addEventListener('click', () => {
        colorContainer.querySelectorAll('.sc-modal-color-swatch').forEach(s => s.removeClass('is-selected'));
        swatch.addClass('is-selected');
        selectedColor = color.var;
      });
    });

    // Tags Section
    contentEl.createEl('h3', { text: 'Tags', cls: 'sc-modal-section-title' });
    const tagsWrapper = contentEl.createDiv('sc-modal-tags-wrapper');
    const tagsInput = tagsWrapper.createEl('input', {
      placeholder: 'Tags (comma separated)...',
      cls: 'sc-modal-tags-input'
    });
    const tagsAutocomplete = tagsWrapper.createDiv('sc-modal-tags-autocomplete');
    tagsAutocomplete.style.display = 'none';

    // Tag Autocomplete Logic
    let selectedTagIdx = -1;
    const updateAutocomplete = () => {
      const val = tagsInput.value;
      const lastComma = val.lastIndexOf(',');
      const currentTag = val.substring(lastComma + 1).trim().toLowerCase();

      if (!currentTag) {
        tagsAutocomplete.style.display = 'none';
        return;
      }

      const allTags = this.getAllTags();
      const suggestions = allTags.filter(t => t.startsWith(currentTag)).slice(0, 8);

      if (suggestions.length === 0) {
        tagsAutocomplete.style.display = 'none';
        return;
      }

      tagsAutocomplete.empty();
      selectedTagIdx = -1;
      suggestions.forEach((tag, idx) => {
        const item = tagsAutocomplete.createDiv('sc-modal-autocomplete-item');
        item.textContent = tag;
        item.addEventListener('click', () => {
          const before = val.substring(0, lastComma + 1);
          tagsInput.value = (before ? before + ' ' : '') + tag + ', ';
          tagsAutocomplete.style.display = 'none';
          tagsInput.focus();
        });
      });
      tagsAutocomplete.style.display = 'block';
    };

    tagsInput.addEventListener('input', updateAutocomplete);
    tagsInput.addEventListener('keydown', (e) => {
      if (tagsAutocomplete.style.display === 'none') return;
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
    contentEl.createEl('h3', { text: 'Apply Category', cls: 'sc-modal-section-title' });
    const select = contentEl.createEl('select', { cls: 'sc-modal-select' });
    this.getAvailableFilters().forEach(f => {
      const opt = select.createEl('option', { value: f.value, text: f.label });
      // @ts-ignore
      opt.dataset.type = f.type;
    });

    // Action Buttons
    const btnContainer = contentEl.createDiv('sc-modal-buttons');
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const createBtn = btnContainer.createEl('button', { text: 'Create Card', cls: 'mod-cta' });
    const handleCreate = async () => {
      const content = editorEl.textContent?.trim();
      if (!content) {
        new Notice('Content cannot be empty');
        return;
      }

      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => !!t);
      const category = select.value === 'all' ? null : select.value;
      
      const card = new Card({ content, color: selectedColor, tags, category });
      await this.store.add(card);
      
      // If we chose a specific category, try to filter the sidebar to it
      if (category) {
        const view = this.app.workspace.getLeavesOfType('card-sidebar')[0]?.view as any;
        if (view) {
          view.activeFilters.category = category;
          await view.renderCards();
        }
      }

      this.close();
    };

    createBtn.addEventListener('click', handleCreate);

    // Keyboard Shortcuts
    editorEl.addEventListener('keydown', (e) => {
      const settings = this.store.settings;
      const normalizeKey = (v: string) => String(v || '').toLowerCase().replace(/[\s\+_]+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const saveKey = normalizeKey(settings.saveKey || 'enter');

      let pressed = '';
      if (e.ctrlKey) pressed += 'ctrl-';
      if (e.shiftKey) pressed += 'shift-';
      if (e.altKey) pressed += 'alt-';
      if (e.key && e.key.toLowerCase() === 'enter') pressed += 'enter';

      if (pressed === saveKey) {
        e.preventDefault();
        handleCreate();
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
