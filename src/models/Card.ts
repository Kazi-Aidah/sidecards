
export enum Status {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done'
}

export interface CardStatus {
  name: string;
  color: string;
  textColor?: string;
  colorIndex?: number; // 1-10 = preset card color, absent = custom hex
}

export class Card {
  id: string;
  content: string;
  color: string;
  tags: string[];
  category: string | null;
  created: number; // Using timestamp for better serialization
  modified?: number;
  archived: boolean;
  pinned: boolean;
  notePath: string | null;
  expiresAt: number | null;
  status: CardStatus | null;

  constructor(data: Partial<Card>) {
    this.id = data.id || Math.random().toString(36).substr(2, 9);
    this.content = data.content || '';
    this.color = data.color || 'var(--card-color-1)';
    this.tags = data.tags || [];
    this.category = data.category || null;
    this.created = data.created || Date.now();
    this.modified = data.modified || this.created;
    this.archived = data.archived || false;
    this.pinned = data.pinned || false;
    this.notePath = data.notePath || null;
    this.expiresAt = data.expiresAt || null;
    this.status = data.status || null;
  }

  clone(): Card {
    return new Card({ 
      ...this, 
      id: Math.random().toString(36).substr(2, 9),
      created: Date.now() 
    });
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      color: this.color,
      tags: this.tags,
      category: this.category,
      created: this.created,
      modified: this.modified,
      archived: this.archived,
      pinned: this.pinned,
      notePath: this.notePath,
      expiresAt: this.expiresAt,
      status: this.status
    };
  }
}
