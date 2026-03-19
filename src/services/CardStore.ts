
import { Card } from "../models/Card";
import { SideCardsSettings } from "../core/Settings";
import { EventBus } from "../core/EventBus";
import { App, Plugin, TFile, TFolder, Notice } from "obsidian";

import { parseTagsFromFrontmatter, updateFrontmatter } from "../utils/frontmatter";

export class CardStore {
  private cards: Map<string, Card> = new Map();
  private pendingWrites: Map<string, Promise<void>> = new Map();
  private _pendingTagWrites: Map<string, { tags: string[], expiresAt: number }> = new Map();
  private _reapplyingTags: Set<string> = new Set();
  // Paths currently being written by syncCardToFrontmatter — skip vault modify re-reads for these
  public _syncingPaths: Set<string> = new Set();
  private expiryInterval: number | null = null;
  private dateRolloverTimeout: number | null = null;

  constructor(
    private app: App,
    private plugin: Plugin,
    public eventBus: EventBus,
    public settings: SideCardsSettings
  ) {
    this.loadFromSettings();
    this.setupExpiryTimer();
    this.handleDateRollover();
  }

  private loadFromSettings() {
    this.cards.clear();
    const rawCards = this.settings.cards || [];
    rawCards.forEach((data: any) => {
      const card = new Card(data);
      this.cards.set(card.id, card);
    });
  }

  private parseColorIndex(value: string | number | null | undefined): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10) {
      return value;
    }
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (parsed >= 1 && parsed <= 10) return parsed;
    }
    const varMatch = raw.match(/var\(\s*--card-color-?(\d+)\s*\)/i);
    if (varMatch) {
      const parsed = Number(varMatch[1]);
      if (parsed >= 1 && parsed <= 10) return parsed;
    }
    return null;
  }

  private normalizeCardColorValue(value: string | number | null | undefined, fallback: string): { color: string; frontmatterColor: number | null } {
    const idx = this.parseColorIndex(value);
    if (idx !== null) {
      return { color: `var(--card-color-${idx})`, frontmatterColor: idx };
    }
    const raw = String(value ?? '').trim();
    if (raw) {
      return { color: raw, frontmatterColor: null };
    }
    return { color: fallback, frontmatterColor: this.parseColorIndex(fallback) };
  }

  private getFrontmatterColorValueForCard(color: string): string | number {
    const idx = this.parseColorIndex(color);
    if (idx !== null) return idx;
    return color;
  }

  getAll(): Card[] {
    return Array.from(this.cards.values());
  }

  get(id: string): Card | undefined {
    return this.cards.get(id);
  }

  async add(card: Card): Promise<void> {
    this.cards.set(card.id, card);
    await this.persist();
    // Always create a backing note immediately before notifying views
    await this.createNoteFromCard(card.id);
    this.eventBus.emit('card:added', card);
  }

  async update(id: string, updates: Partial<Card>): Promise<Card> {
    const card = this.cards.get(id);
    if (!card) throw new Error('Card not found');
    Object.assign(card, updates);
    (card as any).modified = Date.now();
    this.eventBus.emit('card:updated', card);
    await this.persist();
    return card;
  }

  async delete(id: string): Promise<void> {
    this.cards.delete(id);
    this.eventBus.emit('card:deleted', id);
    await this.persist();
  }

  async toggleArchive(id: string, archived: boolean): Promise<void> {
    const card = await this.update(id, { archived });
    await this.syncCardToFrontmatter(card, { archived });
  }

  async togglePin(id: string, pinned: boolean): Promise<void> {
    const card = await this.update(id, { pinned });
    await this.syncCardToFrontmatter(card, { pinned });
  }

  async duplicateCard(id: string): Promise<Card> {
    const src = this.get(id);
    if (!src) throw new Error('Card not found');
    const duplicated = new Card({
      ...src.toJSON(),
      id: Math.random().toString(36).slice(2, 10),
      created: Date.now(),
      notePath: null
    });
    await this.add(duplicated);
    return duplicated;
  }

  async createNoteFromCard(id: string): Promise<string | null> {
    const card = this.get(id);
    if (!card) return null;
    if (card.notePath) return card.notePath;
    const folder = (this.settings.storageFolder || '').trim();
    if (folder && folder !== '/' && !(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }
    const fmt = this.settings.noteTitleFormat || 'words3_hhmm';
    const d = new Date(card.created);
    const hhmm = `${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
    let title: string;
    if (fmt === 'datetime') {
      const yyyy = d.getFullYear();
      const mo = (d.getMonth() + 1).toString().padStart(2, '0');
      const dy = d.getDate().toString().padStart(2, '0');
      title = `${yyyy}${mo}${dy} ${hhmm}`;
    } else {
      const wordCount = fmt === 'words5_hhmm' ? 5 : 3;
      const words = (card.content || 'card').split(/\s+/).slice(0, wordCount).join(' ').replace(/[^a-zA-Z0-9\s-]/g, '').trim() || `card-${Date.now()}`;
      title = `${words} ${hhmm}`;
    }
    let fileName = `${title}.md`;
    let filePath = folder && folder !== '/' ? `${folder}/${fileName}` : fileName;
    if (await this.app.vault.adapter.exists(filePath)) {
      fileName = `${title}-${Date.now()}.md`;
      filePath = folder && folder !== '/' ? `${folder}/${fileName}` : fileName;
    }
    const tagsYaml = (card.tags || []).length ? `Tags: [${card.tags.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ')}]` : 'Tags: []';
    const frontmatter = [
      '---',
      tagsYaml,
      `card-color: ${this.getFrontmatterColorValueForCard(card.color)}`,
      card.archived ? 'Archived: true' : '',
      card.pinned ? 'Pinned: true' : '',
      card.category ? `Category: ${String(card.category).replace(/\n/g, ' ')}` : '',
      card.expiresAt ? `Expires-At: ${new Date(card.expiresAt).toISOString()}` : '',
      card.status ? `Status: ${card.status.name}` : '',
      '---',
      '',
      card.content
    ].filter(Boolean).join('\n');
    await this.app.vault.create(filePath, frontmatter);
    await this.update(id, { notePath: filePath });
    return filePath;
  }

  async setCategory(id: string, category: string | null): Promise<void> {
    const card = await this.update(id, { category });
    await this.syncCardToFrontmatter(card, { category });
  }

  async setStatus(id: string, status: Card['status']): Promise<void> {
    const card = await this.update(id, { status });
    // If status uses a preset card color, update card color too
    if (status && status.colorIndex) {
      const colorVar = `var(--card-color-${status.colorIndex})`;
      await this.update(id, { color: colorVar });
      await this.syncCardToFrontmatter(card, { status, color: colorVar });
    } else {
      await this.syncCardToFrontmatter(card, { status });
    }
  }

  async setExpiry(id: string, expiresAt: number | null): Promise<void> {
    const card = await this.update(id, { expiresAt });
    await this.syncCardToFrontmatter(card, { expiresAt });
  }

  async setColor(id: string, color: string): Promise<void> {
    const card = await this.update(id, { color });
    await this.syncCardToFrontmatter(card, { color });
  }

  private async persist(): Promise<void> {
    const key = 'cards';
    if (this.pendingWrites.has(key)) {
      await this.pendingWrites.get(key);
    }
    const promise = this.saveToStorage();
    this.pendingWrites.set(key, promise);
    await promise;
    this.pendingWrites.delete(key);
  }

  private async saveToStorage(): Promise<void> {
    // Convert Map back to array for settings
    this.settings.cards = this.getAll().map(c => c.toJSON());
    // @ts-ignore
    await this.plugin.saveSettings();
  }

  async importNotesFromFolderToSettings(folder: string, silent = false): Promise<void> {
    const abstractFolder = this.app.vault.getAbstractFileByPath(folder);
    if (!abstractFolder || !(abstractFolder instanceof TFolder)) {
      if (!silent) new Notice(`Folder "${folder}" not found`);
      return;
    }

    const files: TFile[] = [];
    const stack: TFolder[] = [abstractFolder];
    while (stack.length) {
      const current = stack.pop();
      if (!current) break;
      for (const child of current.children) {
        if (child instanceof TFile) {
          if (child.extension === 'md') files.push(child);
        } else if (child instanceof TFolder) {
          stack.push(child);
        }
      }
    }

    for (const file of files) {
      const exists = this.getAll().some(c => c.notePath === file.path);
      if (!exists) {
        const raw = await this.app.vault.read(file);
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        let cardContent = raw.trim();
        let tags: string[] = [];
        let category: string | null = null;
        let expiresAt: number | null = null;
        let color = 'var(--card-color-1)';
        let archived = false;
        let pinned = false;

        if (fmMatch) {
          const fm = fmMatch[1];
          tags = parseTagsFromFrontmatter(fm);
          archived = /archived:\s*true/i.test(fm);
          pinned = /pinned:\s*true/i.test(fm);
          const categoryMatch = fm.match(/^\s*category\s*:\s*(.+)$/im);
          const expiresMatch = fm.match(/^\s*expires-at\s*:\s*(.+)$/im);
          const colorMatch = fm.match(/^\s*card-color\s*:\s*(.+)$/im);
          if (categoryMatch) category = categoryMatch[1].trim();
          if (expiresMatch) {
            const parsed = new Date(expiresMatch[1].trim()).getTime();
            if (!Number.isNaN(parsed)) expiresAt = parsed;
          }
          if (colorMatch) {
            const normalized = this.normalizeCardColorValue(colorMatch[1].trim(), color);
            color = normalized.color;
          }
          cardContent = raw.replace(fmMatch[0], '').trim();
        }

        const card = new Card({
          content: cardContent,
          notePath: file.path,
          created: file.stat.ctime,
          tags,
          category,
          expiresAt,
          color,
          archived,
          pinned,
        });
        this.cards.set(card.id, card);
      }
    }
    await this.persist();
    if (!silent) new Notice(`Imported ${files.length} notes from ${folder}`);
  }

  async saveCards(): Promise<void> {
    await this.saveToStorage();
  }

  async updateCardFromNotePath(path: string): Promise<void> {
    const card = this.getAll().find(c => c.notePath === path);
    if (!card) return;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const tags = parseTagsFromFrontmatter(fm);
      const archived = /archived:\s*true/i.test(fm);
      const pinned = /pinned:\s*true/i.test(fm);
      const categoryMatch = fm.match(/^\s*category\s*:\s*(.+)$/im);
      const expiresMatch = fm.match(/^\s*expires-at\s*:\s*(.+)$/im);
      const statusMatch = fm.match(/^\s*status\s*:\s*(.+)$/im);
      const colorMatch = fm.match(/^\s*card-color\s*:\s*(.+)$/im);
      const colorRaw = colorMatch ? colorMatch[1].trim() : null;
      const normalizedColor = this.normalizeCardColorValue(colorRaw, card.color);
      
      await this.update(card.id, { 
        tags, 
        archived,
        pinned,
        category: categoryMatch ? categoryMatch[1].trim() : null,
        expiresAt: expiresMatch ? new Date(expiresMatch[1].trim()).getTime() : null,
        status: statusMatch ? { name: statusMatch[1].trim(), color: card.status?.color || '', textColor: card.status?.textColor || '#000' } : null,
        color: normalizedColor.color,
        created: file.stat.ctime,
        content: content.replace(fmMatch[0], '').trim() 
      });
      if (colorRaw && normalizedColor.frontmatterColor !== null && colorRaw !== String(normalizedColor.frontmatterColor)) {
        const normalizedText = updateFrontmatter(content, 'card-color', normalizedColor.frontmatterColor);
        if (normalizedText !== content) {
          await this.app.vault.modify(file, normalizedText);
        }
      }
    } else {
      await this.update(card.id, { content: content.trim() });
    }
  }

  async handlePendingTagReapply(file: TFile, pending: { tags: string[], expiresAt: number }): Promise<void> {
    try {
      const text = await this.app.vault.read(file);
      const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      const existing = parseTagsFromFrontmatter(fmMatch?.[1] || '');
      const desired = Array.isArray(pending.tags) ? pending.tags.map(t => String(t).trim()).filter(Boolean) : [];
      
      if (existing.length === desired.length && desired.every(t => existing.includes(t))) {
        this._pendingTagWrites.delete(file.path);
        return;
      }

      this._reapplyingTags.add(file.path);
      
      let content = text;
      const tagsBlock = desired.length > 0
        ? 'Tags: [' + desired.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(', ') + ']'
        : 'Tags: []';

      if (fmMatch) {
        let fm = fmMatch[1];
        let fmLines = fm.split(/\r?\n/);
        const newLines = [];
        for (let i = 0; i < fmLines.length; i++) {
          const line = fmLines[i];
          if (/^\s*(Tags|tags)\s*:/i.test(line)) {
            const rest = line.replace(/^\s*(Tags|tags)\s*:\s*/i, '').trim();
            if (rest.startsWith('[')) continue;
            i++;
            while (i < fmLines.length && /^\s*-\s+/.test(fmLines[i])) i++;
            i--; continue;
          }
          newLines.push(line);
        }
        const rebuiltFm = tagsBlock + '\n' + (newLines.length ? newLines.join('\n') + '\n' : '');
        content = content.replace(fmMatch[0], '---\n' + rebuiltFm + '---\n');
      } else {
        content = '---\n' + tagsBlock + '\n---\n\n' + content;
      }

      await this.app.vault.modify(file, content);
    } catch (e) {
      // eslint-disable-next-line no-undef
      console.error('Error reapplying tags:', e);
    } finally {
      this._reapplyingTags.delete(file.path);
      this._pendingTagWrites.delete(file.path);
    }
  }

  setupExpiryTimer(): void {
    if (this.expiryInterval) {
      window.clearInterval(this.expiryInterval);
    }
    // Check every second so expiry fires promptly
    this.expiryInterval = window.setInterval(() => {
      void (async () => {
        const now = Date.now();
        for (const card of this.getAll()) {
          if (!card.expiresAt || card.archived) continue;
          if (card.expiresAt <= now) {
            if (this.settings.autoArchiveOnExpiry) {
              await this.toggleArchive(card.id, true);
            } else {
              await this.delete(card.id);
            }
          }
        }
      })();
    }, 1000);
  }

  handleDateRollover(): void {
    if (this.dateRolloverTimeout) {
      window.clearTimeout(this.dateRolloverTimeout);
    }
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 1, 0);
    const delay = Math.max(1000, next.getTime() - now.getTime());
    this.dateRolloverTimeout = window.setTimeout(() => {
      void (async () => {
        const cards = this.getAll().filter(c => String(c.category || '').toLowerCase() === 'tomorrow');
        for (const card of cards) {
          await this.setCategory(card.id, 'today');
        }
        this.handleDateRollover();
      })();
    }, delay);
  }

  private async syncCardToFrontmatter(card: Card, updates: Partial<Card>): Promise<void> {
    if (!card.notePath) return;
    const file = this.app.vault.getAbstractFileByPath(card.notePath);
    if (!(file instanceof TFile)) return;
    this._syncingPaths.add(card.notePath);
    try {
      let text = await this.app.vault.read(file);
      if (typeof updates.archived !== 'undefined') {
        text = updateFrontmatter(text, 'Archived', !!updates.archived);
      }
      if (typeof updates.pinned !== 'undefined') {
        text = updateFrontmatter(text, 'Pinned', !!updates.pinned);
      }
      if (typeof updates.category !== 'undefined') {
        text = updateFrontmatter(text, 'Category', updates.category || null);
      }
      if (typeof updates.expiresAt !== 'undefined') {
        text = updateFrontmatter(text, 'Expires-At', updates.expiresAt ? new Date(updates.expiresAt).toISOString() : null);
      }
      if (typeof updates.color !== 'undefined') {
        const normalizedColor = this.normalizeCardColorValue(updates.color as any, card.color);
        text = updateFrontmatter(text, 'card-color', normalizedColor.frontmatterColor ?? normalizedColor.color);
      }
      if (typeof updates.status !== 'undefined') {
        text = updateFrontmatter(text, 'Status', updates.status?.name || null);
      }
      await this.app.vault.modify(file, text);
    } finally {
      // Small delay so the vault modify event fires before we clear the guard
      setTimeout(() => this._syncingPaths.delete(card.notePath!), 500);
    }
  }

  async migrateCardColorFrontmatterFormat(): Promise<void> {
    const seen = new Set<string>();
    for (const card of this.getAll()) {
      if (!card.notePath || seen.has(card.notePath)) continue;
      seen.add(card.notePath);
      const file = this.app.vault.getAbstractFileByPath(card.notePath);
      if (!(file instanceof TFile)) continue;
      let text = '';
      try {
        text = await this.app.vault.read(file);
      } catch {
        continue;
      }
      const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!fmMatch) continue;
      const colorMatch = fmMatch[1].match(/^\s*card-color\s*:\s*(.+)$/im);
      if (!colorMatch) continue;
      const raw = colorMatch[1].trim();
      const idx = this.parseColorIndex(raw);
      if (idx === null) continue;
      if (raw === String(idx)) continue;
      const updated = updateFrontmatter(text, 'card-color', idx);
      if (updated !== text) {
        await this.app.vault.modify(file, updated);
      }
    }
  }
}
