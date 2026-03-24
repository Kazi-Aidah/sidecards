
import { Card } from "../models/Card";
import { SideCardsSettings } from "../core/Settings";
import { EventBus } from "../core/EventBus";
import { App, Plugin, TFile, TFolder, Notice, stringifyYaml } from "obsidian";
import type SideCardsPlugin from "../core/Plugin";

import { parseTagsFromFrontmatter } from "../utils/frontmatter";

export class CardStore {
  private cards: Map<string, Card> = new Map();
  private pendingWrites: Map<string, Promise<void>> = new Map();
  public _pendingTagWrites: Map<string, { tags: string[], expiresAt: number }> = new Map();
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
    void this.runStartupDateCleanup();
  }

  private loadFromSettings() {
    this.cards.clear();
    const rawCards = this.settings.cards || [];
    rawCards.forEach((data: Record<string, unknown>) => {
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
    card.modified = Date.now();
    this.eventBus.emit('card:updated', card);
    await this.persist();
    return card;
  }

  async delete(id: string): Promise<void> {
    const card = this.cards.get(id);
    this.cards.delete(id);
    this.eventBus.emit('card:deleted', id);
    await this.persist();
    // Also delete the associated note file so it doesn't get re-imported
    if (card?.notePath) {
      const file = this.app.vault.getAbstractFileByPath(card.notePath);
      if (file instanceof TFile) {
        this._syncingPaths.add(card.notePath);
        try {
          await this.app.fileManager.trashFile(file);
        } catch { /* file may already be gone */ } finally {
          window.setTimeout(() => this._syncingPaths.delete(card.notePath!), 500);
        }
      }
    }
  }

  async toggleArchive(id: string, archived: boolean): Promise<void> {
    // When unarchiving, also clear expiresAt so an expired card can stay unarchived
    const updates: Partial<Card> = { archived };
    if (!archived) updates.expiresAt = null;
    const card = await this.update(id, updates);
    await this.syncCardToFrontmatter(card, updates);
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
    const fmData: Record<string, unknown> = {
      Tags: card.tags || [],
      'card-color': this.getFrontmatterColorValueForCard(card.color),
    };
    if (card.archived) fmData['Archived'] = true;
    if (card.pinned) fmData['Pinned'] = true;
    if (card.category) fmData['Category'] = card.category;
    if (card.expiresAt) fmData['Expires-At'] = new Date(card.expiresAt).toISOString();
    if (card.status) fmData['Status'] = card.status.name;
    const frontmatter = '---\n' + stringifyYaml(fmData) + '---\n\n' + card.content;
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
    await (this.plugin as SideCardsPlugin).saveSettings();
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
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter ?? {};
        const raw = await this.app.vault.cachedRead(file);
        const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
        const cardContent = fmMatch ? raw.slice(fmMatch[0].length).trim() : raw.trim();

        const tags: string[] = Array.isArray(fm['Tags'] ?? fm['tags'])
          ? (fm['Tags'] ?? fm['tags']).map((t: unknown) => String(t).trim()).filter(Boolean)
          : parseTagsFromFrontmatter(Object.keys(fm).length ? '' : (fmMatch?.[0] ?? ''));
        const archived = !!(fm['Archived'] ?? fm['archived']);
        const pinned = !!(fm['Pinned'] ?? fm['pinned']);
        const category = fm['Category'] ?? fm['category'] ?? null;
        const expiresRaw = fm['Expires-At'] ?? fm['expires-at'];
        const expiresAt = expiresRaw ? new Date(String(expiresRaw)).getTime() || null : null;
        let color = 'var(--card-color-1)';
        const colorRaw = fm['card-color'];
        if (colorRaw !== undefined) {
          color = this.normalizeCardColorValue(colorRaw, color).color;
        }

        const card = new Card({
          content: cardContent,
          notePath: file.path,
          created: file.stat.ctime,
          tags,
          category: category ? String(category) : null,
          expiresAt: expiresAt && !Number.isNaN(expiresAt) ? expiresAt : null,
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

  async switchStorageFolder(newFolder: string): Promise<void> {
    // Collect IDs before clearing so we can notify views
    const oldIds = Array.from(this.cards.keys());

    // Clear all cards from the store without touching any files on disk
    this.cards.clear();
    this.settings.cards = [];
    await (this.plugin as SideCardsPlugin).saveSettings();

    // Notify views to remove all old cards
    for (const id of oldIds) {
      this.eventBus.emit('card:deleted', id);
    }

    if (!newFolder || newFolder === '/') return;

    // Create the folder if it doesn't exist yet
    if (!(await this.app.vault.adapter.exists(newFolder))) {
      await this.app.vault.createFolder(newFolder);
    }

    await this.importNotesFromFolderToSettings(newFolder, true);

    // Trigger a single re-render for all newly imported cards
    const allCards = this.getAll();
    if (allCards.length > 0) {
      this.eventBus.emit('card:added', allCards[0]);
    }
  }

  async saveCards(): Promise<void> {
    await this.saveToStorage();
  }

  async updateCardFromNotePath(path: string): Promise<void> {
    const card = this.getAll().find(c => c.notePath === path);
    if (!card) return;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ?? {};
    const content = await this.app.vault.cachedRead(file);
    const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    const cardContent = fmMatch ? content.slice(fmMatch[0].length).trim() : content.trim();

    const tags: string[] = Array.isArray(fm['Tags'] ?? fm['tags'])
      ? (fm['Tags'] ?? fm['tags']).map((t: unknown) => String(t).trim()).filter(Boolean)
      : parseTagsFromFrontmatter(fmMatch?.[0] ?? '');
    const archived = !!(fm['Archived'] ?? fm['archived']);
    const pinned = !!(fm['Pinned'] ?? fm['pinned']);
    const category = fm['Category'] ?? fm['category'] ?? null;
    const expiresRaw = fm['Expires-At'] ?? fm['expires-at'];
    const expiresAt = expiresRaw ? new Date(String(expiresRaw)).getTime() || null : null;
    const colorRaw = fm['card-color'];
    const normalizedColor = this.normalizeCardColorValue(colorRaw, card.color);
    const statusRaw = fm['Status'] ?? fm['status'];

    await this.update(card.id, {
      tags,
      archived,
      pinned,
      category: category ? String(category) : null,
      expiresAt: expiresAt && !Number.isNaN(expiresAt) ? expiresAt : null,
      status: statusRaw ? { name: String(statusRaw), color: card.status?.color || '', textColor: card.status?.textColor || '#000' } : null,
      color: normalizedColor.color,
      created: file.stat.ctime,
      content: cardContent,
    });

    // Normalise stored color index format if needed
    if (colorRaw !== undefined && normalizedColor.frontmatterColor !== null && String(colorRaw) !== String(normalizedColor.frontmatterColor)) {
      await this.app.fileManager.processFrontMatter(file, (fmObj) => {
        fmObj['card-color'] = normalizedColor.frontmatterColor;
      });
    }
  }

  async handlePendingTagReapply(file: TFile, pending: { tags: string[], expiresAt: number }): Promise<void> {
    try {
      const desired = Array.isArray(pending.tags) ? pending.tags.map(t => String(t).trim()).filter(Boolean) : [];
      const cache = this.app.metadataCache.getFileCache(file);
      const existing: string[] = Array.isArray(cache?.frontmatter?.['Tags'] ?? cache?.frontmatter?.['tags'])
        ? (cache?.frontmatter?.['Tags'] ?? cache?.frontmatter?.['tags']).map((t: unknown) => String(t).trim())
        : [];

      if (existing.length === desired.length && desired.every(t => existing.includes(t))) {
        this._pendingTagWrites.delete(file.path);
        return;
      }

      this._reapplyingTags.add(file.path);
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm['Tags'] = desired;
      });
    } catch (e) {
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
              // Archive and clear expiresAt so it doesn't re-trigger
              const updated = await this.update(card.id, { archived: true, expiresAt: null });
              await this.syncCardToFrontmatter(updated, { archived: true, expiresAt: null });
            } else {
              await this.delete(card.id);
            }
          }
        }
      })();
    }, 1000);
  }

  private async runStartupDateCleanup(): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    // Promote tomorrow → today only for cards assigned on a previous day
    // (i.e. the day has rolled over since they were put in "tomorrow")
    const tomorrowCards = this.getAll().filter(c => {
      if (String(c.category || '').toLowerCase() !== 'tomorrow') return false;
      const lastActivity = Math.max(c.modified ?? 0, c.created ?? 0);
      return lastActivity < todayStartMs;
    });
    for (const card of tomorrowCards) {
      await this.setCategory(card.id, 'today');
    }

    // Clear stale today cards (assigned on a previous day, never modified since)
    await this.cleanupStaleTodayCards(todayStartMs);
  }

  private async cleanupStaleTodayCards(todayStartMs: number): Promise<void> {
    const stale = this.getAll().filter(c => {
      if (String(c.category || '').toLowerCase() !== 'today') return false;
      const lastActivity = Math.max(c.modified ?? 0, c.created ?? 0);
      return lastActivity < todayStartMs;
    });

    for (const card of stale) {
      await this.setCategory(card.id, null);
    }
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
        await this.runStartupDateCleanup();
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
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (typeof updates.archived !== 'undefined') {
          if (updates.archived) fm['Archived'] = true; else delete fm['Archived'];
        }
        if (typeof updates.pinned !== 'undefined') {
          if (updates.pinned) fm['Pinned'] = true; else delete fm['Pinned'];
        }
        if (typeof updates.category !== 'undefined') {
          if (updates.category) fm['Category'] = updates.category; else delete fm['Category'];
        }
        if (typeof updates.expiresAt !== 'undefined') {
          if (updates.expiresAt) fm['Expires-At'] = new Date(updates.expiresAt).toISOString(); else delete fm['Expires-At'];
        }
        if (typeof updates.color !== 'undefined') {
          const normalizedColor = this.normalizeCardColorValue(updates.color, card.color);
          fm['card-color'] = normalizedColor.frontmatterColor ?? normalizedColor.color;
        }
        if (typeof updates.status !== 'undefined') {
          if (updates.status?.name) fm['Status'] = updates.status.name; else delete fm['Status'];
        }
      });
    } finally {
      window.setTimeout(() => this._syncingPaths.delete(card.notePath!), 500);
    }
  }

  async migrateCardColorFrontmatterFormat(): Promise<void> {
    const seen = new Set<string>();
    for (const card of this.getAll()) {
      if (!card.notePath || seen.has(card.notePath)) continue;
      seen.add(card.notePath);
      const file = this.app.vault.getAbstractFileByPath(card.notePath);
      if (!(file instanceof TFile)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const colorRaw = cache?.frontmatter?.['card-color'];
      if (colorRaw === undefined) continue;
      const idx = this.parseColorIndex(colorRaw);
      if (idx === null) continue;
      if (String(colorRaw) === String(idx)) continue;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm['card-color'] = idx;
      });
    }
  }
}
