
/* eslint-disable obsidianmd/no-static-styles-assignment */
import { Modal, App, Plugin } from "obsidian";
import { CardStore } from "../../services/CardStore";
import { Card } from "../../models/Card";

export class SearchModal extends Modal {
  private searchInput!: HTMLInputElement;
  private resultsContainer!: HTMLElement;
  private searchResults: Card[] = [];
  private selectedIndex = -1;

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
    this.titleEl.setText('Search cards');

    const searchWrapper = contentEl.createDiv('sc-search-wrapper');
    this.searchInput = searchWrapper.createEl('input', {
      type: 'text',
      placeholder: 'Search cards...',
      cls: 'sc-search-input'
    });

    this.resultsContainer = contentEl.createDiv('sc-search-results');
    this.resultsContainer.style.maxHeight = '400px';
    this.resultsContainer.style.overflow = 'auto';

    this.searchInput.focus();
    this.searchInput.addEventListener('input', () => this.renderResults());
    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  private renderResults() {
    const query = this.searchInput.value.toLowerCase();
    this.resultsContainer.empty();
    this.searchResults = this.store.getAll().filter(card => 
      card.content.toLowerCase().includes(query)
    );
    this.selectedIndex = -1;

    this.searchResults.forEach((card, idx) => {
      const result = this.resultsContainer.createDiv('sc-search-result');
      result.textContent = card.content.substring(0, 100) + (card.content.length > 100 ? '...' : '');
      result.style.padding = '8px';
      result.style.cursor = 'pointer';
      result.style.borderLeft = `4px solid ${card.color}`;
      result.dataset.index = String(idx);

      result.addEventListener('click', () => this.selectResult(card));
      result.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateSelection();
      });
    });
  }

  private updateSelection() {
    const els = Array.from(this.resultsContainer.querySelectorAll<HTMLElement>('.sc-search-result'));
    els.forEach((el, idx) => {
      if (idx === this.selectedIndex) {
        el.addClass('selected');
        el.style.backgroundColor = 'var(--background-modifier-hover)';
      } else {
        el.removeClass('selected');
        el.style.backgroundColor = '';
      }
    });
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.searchResults.length;
      this.updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.searchResults.length) % this.searchResults.length;
      this.updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selectedIndex >= 0) {
        this.selectResult(this.searchResults[this.selectedIndex]);
      }
    }
  }

  private selectResult(card: Card) {
    // Focus the card in the sidebar or do something else
    // For now, just close the modal
    this.close();
    // @ts-ignore
    this.store.eventBus.emit('card:focus', card.id);
  }
}
