
import { Card } from "../models/Card";

export interface FilterOptions {
  query: string;
  tags: string[];
  archivedOnly?: boolean;
  pinnedOnly?: boolean;
  untaggedOnly?: boolean;
  category?: string;
}

export class FilterService {
  filter(cards: Card[], filters: FilterOptions): Card[] {
    return cards.filter(card => {
      // Archived filter
      if (filters.archivedOnly && !card.archived) return false;
      if (!filters.archivedOnly && card.archived) return false;

      // Pinned filter
      if (filters.pinnedOnly && !card.pinned) return false;

      // Untagged filter
      if (filters.untaggedOnly && (card.tags.length || card.category)) return false;

      // Tag filter
      if (filters.tags && filters.tags.length > 0) {
        const cardTags = new Set(card.tags.map(t => t.toLowerCase()));
        if (!filters.tags.every(t => cardTags.has(t.toLowerCase()))) return false;
      }

      // Category filter
      if (filters.category) {
        const cat = filters.category.toLowerCase();
        const cardCat = (card.category || '').toLowerCase();
        if (cat !== cardCat) return false;
      }

      // Search query
      if (filters.query) {
        const q = filters.query.toLowerCase();
        const content = card.content.toLowerCase();
        const tags = card.tags.join(' ').toLowerCase();
        if (!content.includes(q) && !tags.includes(q)) return false;
      }

      return true;
    });
  }

  matches(card: Card, filters: FilterOptions): boolean {
    return this.filter([card], filters).length > 0;
  }
}
