
import { SideCardsSettings } from "../core/Settings";
import { Card } from "../models/Card";
import { App, TFile } from "obsidian";

export type SortMode = 'manual' | 'created' | 'modified' | 'alpha' | 'status';

export class SortService {
  constructor(private settings: SideCardsSettings) {}

  sort(cards: Card[], mode: SortMode, ascending: boolean, app?: App): Card[] {
    const sorted = [...cards];

    // Helper: get effective created/modified timestamps, preferring vault file stats
    const getCreated = (c: Card): number => {
      if (app && c.notePath) {
        const file = app.vault.getAbstractFileByPath(c.notePath);
        if (file instanceof TFile) return file.stat.ctime;
      }
      return c.created;
    };
    const getModified = (c: Card): number => {
      if (app && c.notePath) {
        const file = app.vault.getAbstractFileByPath(c.notePath);
        if (file instanceof TFile) return file.stat.mtime;
      }
      return typeof c.modified === 'number' ? c.modified : c.created;
    };
    
    switch (mode) {
      case 'manual':
        return this.sortManual(sorted, ascending);
      case 'created':
        return sorted.sort((a, b) => {
          const ac = getCreated(a), bc = getCreated(b);
          const primary = ascending ? ac - bc : bc - ac;
          if (primary !== 0) return primary;
          const am = getModified(a), bm = getModified(b);
          const secondary = ascending ? am - bm : bm - am;
          if (secondary !== 0) return secondary;
          return ascending ? a.content.localeCompare(b.content) : b.content.localeCompare(a.content);
        });
      case 'modified':
        return sorted.sort((a, b) => {
          const am = getModified(a), bm = getModified(b);
          const primary = ascending ? am - bm : bm - am;
          if (primary !== 0) return primary;
          const ac = getCreated(a), bc = getCreated(b);
          const secondary = ascending ? ac - bc : bc - ac;
          if (secondary !== 0) return secondary;
          return ascending ? a.content.localeCompare(b.content) : b.content.localeCompare(a.content);
        });
      case 'alpha':
        return sorted.sort((a, b) => 
          ascending 
            ? a.content.localeCompare(b.content) 
            : b.content.localeCompare(a.content)
        );
      case 'status':
        return sorted.sort((a, b) => {
          const list = this.settings.cardStatuses || [];
          const indexFor = (c: Card) => {
            if (!c.status) return Infinity;
            const idx = list.findIndex(s => (s.name || '').toLowerCase() === (c.status!.name || '').toLowerCase());
            return idx >= 0 ? idx : Infinity;
          };
          const ai = indexFor(a);
          const bi = indexFor(b);
          if (ai !== bi) return ascending ? ai - bi : bi - ai;
          return ascending ? a.content.localeCompare(b.content) : b.content.localeCompare(a.content);
        });
      default:
        return sorted;
    }
  }

  private sortManual(cards: Card[], ascending: boolean): Card[] {
    const order = this.settings.manualOrder || [];
    const orderMap = new Map(order.map((id, i) => [id, i]));
    
    return cards.sort((a, b) => {
      // Pinned cards first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      
      const aIdx = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
      const bIdx = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
      
      if (aIdx !== bIdx) return aIdx - bIdx;
      
      // Fallback to created time
      return ascending ? a.created - b.created : b.created - a.created;
    });
  }
}
