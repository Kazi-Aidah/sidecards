import { App, Modal } from "obsidian";
import { Card } from "../../models/Card";
import { CardStore } from "../../services/CardStore";

interface DurationSlot {
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
  el: HTMLElement;
  numInput: HTMLInputElement;
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

    const addSlotBtn = relPanel.createEl('button', { text: 'Add time unit', cls: 'sc-dt-add-slot-btn' });
    addSlotBtn.addEventListener('click', () => this.addSlot());

    // Quick presets
    const presetsRow = relPanel.createDiv('sc-dt-presets');
    const presets: Array<{ label: string; minutes: number }> = [
      { label: '5 min', minutes: 5 },
      { label: '30 min', minutes: 30 },
      { label: '1 hour', minutes: 60 },
    ];
    presets.forEach(p => {
      const btn = presetsRow.createEl('button', { text: p.label, cls: 'sc-dt-preset-btn' });
      btn.addEventListener('click', () => {
        this.slots = [];
        this.slotsContainer.empty();
        if (p.minutes < 60) {
          this.addSlot(p.minutes, 'minutes');
        } else {
          this.addSlot(p.minutes / 60, 'hours');
        }
      });
    });

    // --- Exact panel ---
    const exactPanel = contentEl.createDiv('sc-dt-panel sc-dt-panel-exact');
    exactPanel.addClass('sc-hidden');

    const exactInput = exactPanel.createEl('input', { type: 'datetime-local', cls: 'sc-dt-exact-input' });
    if (this.card.expiresAt) {
      const d = new Date(this.card.expiresAt);
      exactInput.value = this.toInputValue(d);
    }

    const quickRow = exactPanel.createDiv('sc-dt-quick-row');
    const todayMidnightBtn = quickRow.createEl('button', { text: 'Today midnight', cls: 'sc-dt-quick-btn' });
    todayMidnightBtn.addEventListener('click', () => {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      exactInput.value = this.toInputValue(d);
    });

    // --- Radio toggle ---
    relRadio.addEventListener('change', () => {
      if (relRadio.checked) {
        this.mode = 'relative';
        relPanel.removeClass('sc-hidden');
        exactPanel.addClass('sc-hidden');
      }
    });
    exactRadio.addEventListener('change', () => {
      if (exactRadio.checked) {
        this.mode = 'exact';
        relPanel.addClass('sc-hidden');
        exactPanel.removeClass('sc-hidden');
      }
    });

    // --- Actions ---
    const actionsRow = contentEl.createDiv('sc-dt-actions-row');
    const cancelBtn = actionsRow.createEl('button', { text: 'Cancel', cls: 'sc-dt-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = actionsRow.createEl('button', { text: 'Save', cls: 'sc-dt-save-btn mod-cta' });
    saveBtn.addEventListener('click', () => {
      void (async () => {
        let expiresAt: number | null = null;
        if (this.mode === 'relative') {
          let totalMs = 0;
          this.slots.forEach(s => {
            const val = Number(s.numInput.value) || 0;
            const unit = (s.el.querySelector('select') as HTMLSelectElement).value;
            if (unit === 'seconds') totalMs += val * 1000;
            else if (unit === 'minutes') totalMs += val * 60 * 1000;
            else if (unit === 'hours') totalMs += val * 60 * 60 * 1000;
            else if (unit === 'days') totalMs += val * 24 * 60 * 60 * 1000;
            else if (unit === 'weeks') totalMs += val * 7 * 24 * 60 * 60 * 1000;
          });
          if (totalMs > 0) expiresAt = Date.now() + totalMs;
        } else {
          const val = exactInput.value;
          if (val) expiresAt = new Date(val).getTime();
        }
        await this.store.update(this.card.id, { expiresAt });
        this.close();
      })();
    });
  }

  private addSlot(val: number = 1, unit: DurationSlot['unit'] = 'minutes'): void {
    const slotEl = this.slotsContainer.createDiv('sc-dt-slot');
    const numInput = slotEl.createEl('input', { type: 'number', cls: 'sc-dt-slot-num' });
    numInput.value = String(val);

    const unitSelect = slotEl.createEl('select', { cls: 'sc-dt-slot-unit' });
    ['seconds', 'minutes', 'hours', 'days', 'weeks'].forEach(u => {
      const opt = unitSelect.createEl('option', { text: u, value: u });
      if (u === unit) opt.selected = true;
    });

    const removeBtn = slotEl.createEl('button', { text: '×', cls: 'sc-dt-slot-remove' });
    const slotObj: DurationSlot = { value: val, unit: unit, el: slotEl, numInput };
    this.slots.push(slotObj);

    removeBtn.addEventListener('click', () => {
      this.slots = this.slots.filter(s => s !== slotObj);
      slotEl.remove();
    });
  }

  private toInputValue(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
