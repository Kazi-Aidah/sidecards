
import { Card } from "../models/Card";
import { SideCardsSettings } from "../core/Settings";

export type SortMode = 'manual' | 'created' | 'modified' | 'alpha' | 'status';

export class SortService {
  constructor(private settings: SideCardsSettings) {}

  sort(cards: Card[], mode: SortMode, ascending: boolean): Card[] {
    const sorted = [...cards];
    
    switch (mode) {
      case 'manual':
        return this.sortManual(sorted, ascending);
      case 'created':
        return sorted.sort((a, b) => 
          ascending 
            ? a.created - b.created
            : b.created - a.created
        );
      case 'modified':
        return sorted.sort((a, b) =>
          ascending
            ? (a as any).modified - (b as any).modified
            : (b as any).modified - (a as any).modified
        );
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
