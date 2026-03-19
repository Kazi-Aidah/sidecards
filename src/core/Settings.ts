
import { CardStatus } from "../models/Card";

export interface CustomCategory {
  id: string;
  label: string;
  showInMenu?: boolean;
  textColor?: string;
  bgColor?: string;
}

export interface SideCardsSettings {
  storageFolder: string;
  cards: any[]; // Raw card data
  cardStyle: number;
  cardBgOpacity: number;
  borderThickness: number;
  disableFilterButtons: boolean;
  disableTimeBasedFiltering: boolean;
  enableCustomCategories: boolean;
  customCategories: CustomCategory[];
  hideArchivedFilterButton: boolean;
  animatedCards: boolean;
  disableCardFadeIn: boolean;
  openCategoryOnLoad: string | null;
  manualOrder: string[]; // Paths or IDs
  showTimestamps: boolean;
  omitTagHash: boolean;
  groupTags: boolean;
  disableCardRendering: boolean;
  minCardWidth: number;
  colorNames: string[];
  color1?: string;
  color2?: string;
  color3?: string;
  color4?: string;
  color5?: string;
  color6?: string;
  color7?: string;
  color8?: string;
  color9?: string;
  color10?: string;
  twoRowSwatches?: boolean;
  verticalCardMode?: boolean;
  filterColors?: Record<string, { bgColor?: string; textColor?: string }>;
  saveKey?: string;
  nextLineKey?: string;
  sortMode?: 'manual' | 'created' | 'modified' | 'alpha' | 'status';
  sortAscending?: boolean;
  showPinnedOnly?: boolean;
  enableCardStatus?: boolean;
  cardStatuses?: CardStatus[];
  autoArchiveOnExpiry?: boolean;
  borderRadius?: number;
  buttonPadding?: number;
  buttonPaddingBottom?: number;
  maxCardHeight?: number;
  datetimeFormat?: string;
  timestampBelowTags?: boolean;
  tutorialShown?: boolean;
  enableCopyCardContent?: boolean;
  hideScrollbar?: boolean;
  autoOpen?: boolean;
  allItemsOrder?: string[];
  autoColorRules?: Array<{ type: 'text' | 'tag'; match: string; colorIndex: number }>;
  inheritStatusColor?: boolean;
  statusPillOpacity?: number;
  replaceHomepageWithSidecards?: boolean;
  searchBarVisible?: boolean;
  pinnedNotes?: string[];
  homepageName?: string;
  hideCategoryDropdown?: boolean;
  hideColorSwatches?: boolean;
  showPinnedNotes?: boolean;
  showRecentNotes?: boolean;
  notesPlacement?: 'left' | 'right';
}

export const DEFAULT_SETTINGS: SideCardsSettings = {
  storageFolder: '/',
  cards: [],
  cardStyle: 2,
  cardBgOpacity: 0.08,
  borderThickness: 2,
  disableFilterButtons: false,
  disableTimeBasedFiltering: false,
  enableCustomCategories: false,
  customCategories: [],
  hideArchivedFilterButton: false,
  animatedCards: true,
  disableCardFadeIn: false,
  openCategoryOnLoad: 'all',
  manualOrder: [],
  showTimestamps: true,
  omitTagHash: false,
  groupTags: false,
  disableCardRendering: false,
  minCardWidth: 250,
  colorNames: ['Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Magenta', 'Pink', 'Brown'],
  color1: '#8392a4',
  color2: '#eb3b5a',
  color3: '#fa8231',
  color4: '#e5a216',
  color5: '#20bf6b',
  color6: '#2d98da',
  color7: '#8854d0',
  color8: '#e832c1',
  color9: '#e83289',
  color10: '#965b3b',
  twoRowSwatches: false,
  verticalCardMode: false,
  filterColors: {},
  saveKey: 'enter',
  nextLineKey: 'shift-enter',
  sortMode: 'manual',
  sortAscending: true,
  showPinnedOnly: false,
  enableCardStatus: false,
  cardStatuses: [],
  autoArchiveOnExpiry: false,
  borderRadius: 6,
  buttonPadding: 26,
  buttonPaddingBottom: 26,
  maxCardHeight: 0,
  datetimeFormat: 'YYYY-MM-DD HH:mm',
  timestampBelowTags: false,
  tutorialShown: false,
  enableCopyCardContent: false,
  hideScrollbar: false,
  autoOpen: false,
  allItemsOrder: [],
  autoColorRules: [],
  inheritStatusColor: false,
  statusPillOpacity: 1,
  replaceHomepageWithSidecards: false,
  searchBarVisible: false,
  pinnedNotes: [],
  homepageName: 'SideCards',
  hideCategoryDropdown: false,
  hideColorSwatches: false,
  showPinnedNotes: true,
  showRecentNotes: true,
  notesPlacement: 'left',
};
