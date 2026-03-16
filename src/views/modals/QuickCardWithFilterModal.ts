
import { Modal, App, Plugin, Notice, Setting } from "obsidian";
import { CardStore } from "../../services/CardStore";
import { Card } from "../../models/Card";

export class QuickCardWithFilterModal extends Modal {
  constructor(
    app: App,
    private plugin: Plugin,
    private store: CardStore
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Quick Card Add' });

    const textarea = contentEl.createEl('textarea', {
      placeholder: 'Card content...',
      cls: 'quick-card-textarea'
    });
    textarea.focus();

    // Color swatches
    const colorContainer = contentEl.createDiv('color-container');
    let selectedColor = 'var(--card-color-1)';
    const colors = [
      'var(--card-color-1)', 'var(--card-color-2)', 'var(--card-color-3)',
      'var(--card-color-4)', 'var(--card-color-5)', 'var(--card-color-6)',
      'var(--card-color-7)', 'var(--card-color-8)', 'var(--card-color-9)',
      'var(--card-color-10)'
    ];

    colors.forEach(color => {
      const swatch = colorContainer.createDiv('color-swatch');
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', () => {
        colorContainer.querySelectorAll('.color-swatch').forEach(s => s.removeClass('selected'));
        swatch.addClass('selected');
        selectedColor = color;
      });
    });

    // Category select
    const select = contentEl.createEl('select', { cls: 'filter-select' });
    const categories = this.store.settings.customCategories || [];
    [ { id: 'all', label: 'All' }, ...categories ].forEach(cat => {
      const opt = select.createEl('option', { value: cat.id, text: cat.label });
    });

    // Create button
    const btnContainer = contentEl.createDiv('modal-button-container');
    const createBtn = btnContainer.createEl('button', { text: 'Create Card', cls: 'mod-cta' });
    createBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (content) {
        const category = select.value === 'all' ? null : select.value;
        const card = new Card({ content, color: selectedColor, category });
        await this.store.add(card);
        this.close();
      } else {
        new Notice('Content cannot be empty');
      }
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        createBtn.click();
      }
    });
  }
}
