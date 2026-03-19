/* eslint-disable obsidianmd/no-static-styles-assignment */
import { App, Modal } from "obsidian";
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";

interface DurationSlot {
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
  el: HTMLElement;
}

export class DateTimeModal extends Modal {
  private mode: 'relative' | 'exact' = 'relative';
  private slots: DurationSlot[] = [];
  private slotsContainer!: HTMLElement;

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
    contentEl.addClass('sc-datetime-modal');
    this.titleEl.setText('Set expiry');

    // --- Mode radio buttons ---
    const modeRow = contentEl.createDiv('sc-dt-mode-row');

    const relLabel = modeRow.createEl('label', { cls: 'sc-dt-radio-label' });
    const relRadio = relLabel.createEl('input', { type: 'radio' });
    relRadio.name = 'sc-dt-mode';
    relRadio.value = 'relative';
    relRadio.checked = true;
    relLabel.createSpan({ text: 'Relative duration' });

    const exactLabel = modeRow.createEl('label', { cls: 'sc-dt-radio-label' });
    const exactRadio = exactLabel.createEl('input', { type: 'radio' });
    exactRadio.name = 'sc-dt-mode';
    exactRadio.value = 'exact';
    exactLabel.createSpan({ text: 'Exact date & time' });

    // --- Relative panel ---
    const relPanel = contentEl.createDiv('sc-dt-panel sc-dt-panel-relative');
    this.slotsContainer = relPanel.createDiv('sc-dt-slots');
    this.addSlot(); // start with one slot

    const addSlotBtn = relPanel.createEl('button', { text: '+ Add time unit', cls: 'sc-dt-add-slot-btn' }); // eslint-disable-line obsidianmd/ui/sentence-case
    addSlotBtn.addEventListener('click', () => this.addSlot());

    // Quick presets
    const presetsRow = relPanel.createDiv('sc-dt-presets');
    const presets: Array<{ label: string; minutes: number }> = [
      { label: '30 min', minutes: 30 },
      { label: '1 hour', minutes: 60 },
      { label: '3 hours', minutes: 180 },
      { label: 'Tomorrow 18:00', minutes: -1 },
    ];
    presets.forEach(p => {
      const btn = presetsRow.createEl('button', { text: p.label, cls: 'sc-dt-preset-btn' });
      btn.addEventListener('click', () => {
        if (p.minutes === -1) {
          // Switch to exact mode and set tomorrow 18:00
          exactRadio.checked = true;
          this.mode = 'exact';
          relPanel.style.display = 'none';
          exactPanel.style.display = '';
          const d = new Date(Date.now() + 24 * 3600 * 1000);
          d.setHours(18, 0, 0, 0);
          exactInput.value = this.toInputValue(d);
        } else {
          // Fill slots with the preset
          this.slots = [];
          this.slotsContainer.empty();
          if (p.minutes < 60) {
            this.addSlot(p.minutes, 'minutes');
          } else {
            this.addSlot(p.minutes / 60, 'hours');
          }
        }
      });
    });

    // --- Exact panel ---
    const exactPanel = contentEl.createDiv('sc-dt-panel sc-dt-panel-exact');
    exactPanel.style.display = 'none';

    const exactInput = exactPanel.createEl('input', { type: 'datetime-local', cls: 'sc-dt-exact-input' });
    if (this.card.expiresAt) {
      const d = new Date(this.card.expiresAt);
      exactInput.value = this.toInputValue(d);
    }

    const quickRow = exactPanel.createDiv('sc-dt-quick-row');
    const todayBtn = quickRow.createEl('button', { text: 'Today 23:59', cls: 'sc-dt-quick-btn' });
    const tomorrowBtn = quickRow.createEl('button', { text: 'Tomorrow 18:00', cls: 'sc-dt-quick-btn' });
    todayBtn.addEventListener('click', () => {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      exactInput.value = this.toInputValue(d);
    });
    tomorrowBtn.addEventListener('click', () => {
      const d = new Date(Date.now() + 24 * 3600 * 1000);
      d.setHours(18, 0, 0, 0);
      exactInput.value = this.toInputValue(d);
    });

    // --- Radio toggle ---
    relRadio.addEventListener('change', () => {
      if (relRadio.checked) {
        this.mode = 'relative';
        relPanel.style.display = '';
        exactPanel.style.display = 'none';
      }
    });
    exactRadio.addEventListener('change', () => {
      if (exactRadio.checked) {
        this.mode = 'exact';
        relPanel.style.display = 'none';
        exactPanel.style.display = '';
      }
    });

    // If card already has an expiry, default to exact mode
    if (this.card.expiresAt) {
      exactRadio.checked = true;
      this.mode = 'exact';
      relPanel.style.display = 'none';
      exactPanel.style.display = '';
    }

    // --- Action buttons ---
    const actions = contentEl.createDiv('sc-dt-actions');
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
        let ms: number | null = null;

        if (this.mode === 'exact') {
          const raw = exactInput.value.trim();
          if (raw) {
            const parsed = new Date(raw).getTime();
            if (!Number.isNaN(parsed)) ms = parsed;
          }
        } else {
          // Sum all slots into total milliseconds from now
          let totalMs = 0;
          for (const slot of this.slots) {
            const v = slot.value;
            if (!v || v <= 0) continue;
            if (slot.unit === 'seconds') totalMs += v * 1000;
            else if (slot.unit === 'minutes') totalMs += v * 60 * 1000;
            else if (slot.unit === 'hours') totalMs += v * 3600 * 1000;
            else if (slot.unit === 'days') totalMs += v * 86400 * 1000;
            else if (slot.unit === 'weeks') totalMs += v * 7 * 86400 * 1000;
          }
          if (totalMs > 0) ms = Date.now() + totalMs;
        }

        await this.store.setExpiry(this.card.id, ms);
        this.close();
      })();
    });
  }

  private addSlot(defaultValue = 1, defaultUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' = 'hours'): void {
    const row = this.slotsContainer.createDiv('sc-dt-slot-row');

    const numInput = row.createEl('input', { type: 'number', cls: 'sc-dt-slot-num' });
    numInput.min = '1';
    numInput.value = String(defaultValue);

    const unitSelect = row.createEl('select', { cls: 'sc-dt-slot-unit' });
    (['seconds', 'minutes', 'hours', 'days', 'weeks'] as const).forEach(u => {
      const opt = unitSelect.createEl('option', { value: u, text: u });
      if (u === defaultUnit) opt.selected = true;
    });

    const removeBtn = row.createEl('button', { text: '✕', cls: 'sc-dt-slot-remove' });

    const slot: DurationSlot = {
      value: defaultValue,
      unit: defaultUnit,
      el: row,
    };
    this.slots.push(slot);

    numInput.addEventListener('input', () => {
      slot.value = parseFloat(numInput.value) || 0;
    });
    unitSelect.addEventListener('change', () => {
      slot.unit = unitSelect.value as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
    });
    removeBtn.addEventListener('click', () => {
      if (this.slots.length <= 1) return; // keep at least one
      this.slots = this.slots.filter(s => s !== slot);
      row.remove();
    });
  }

  private toInputValue(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
