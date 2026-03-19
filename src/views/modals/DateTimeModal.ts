/* eslint-disable obsidianmd/no-static-styles-assignment */
import { App, Modal } from "obsidian";
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";

export class DateTimeModal extends Modal {
  constructor(
    app: App,
    private card: Card,
    private store: CardStore
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText('Set expiry');

    const inputEl = contentEl.createEl('input', { type: 'datetime-local' });
    inputEl.style.width = '100%';
    inputEl.style.marginBottom = '10px';
    if (this.card.expiresAt) {
      const d = new Date(this.card.expiresAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      inputEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const quickRow = contentEl.createDiv();
    quickRow.style.display = 'flex';
    quickRow.style.gap = '8px';
    const todayBtn = quickRow.createEl('button', { text: 'Today 23:59' });
    const tomorrowBtn = quickRow.createEl('button', { text: 'Tomorrow 18:00' });
    todayBtn.addEventListener('click', () => {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      inputEl.value = this.toInputValue(d);
    });
    tomorrowBtn.addEventListener('click', () => {
      const d = new Date(Date.now() + 24 * 3600 * 1000);
      d.setHours(18, 0, 0, 0);
      inputEl.value = this.toInputValue(d);
    });

    const actions = contentEl.createDiv();
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '10px';
    const clearBtn = actions.createEl('button', { text: 'Clear' });
    const saveBtn = actions.createEl('button', { text: 'Save', cls: 'mod-cta' });

    clearBtn.addEventListener('click', () => {
      void (async () => {
        await this.store.setExpiry(this.card.id, null);
        this.close();
      })();
    });
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const raw = inputEl.value.trim();
        if (!raw) {
          await this.store.setExpiry(this.card.id, null);
        } else {
          const ms = new Date(raw).getTime();
          if (!Number.isNaN(ms)) {
            await this.store.setExpiry(this.card.id, ms);
          }
        }
        this.close();
      })();
    });
  }

  private toInputValue(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
