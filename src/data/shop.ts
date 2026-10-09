import type { Reward } from './types';

export type ShopSection = 'featured' | 'daily' | 'characters' | 'skins' | 'chests' | 'crystals' | 'event';
export const SHOP_SECTIONS: { id: ShopSection; label: string; emoji: string }[] = [
  { id: 'featured', label: 'À LA UNE', emoji: '⭐' },
  { id: 'daily', label: 'DU JOUR', emoji: '📅' },
  { id: 'characters', label: 'HÉROS', emoji: '🧑‍🚀' },
  { id: 'skins', label: 'SKINS', emoji: '🎨' },
  { id: 'chests', label: 'COFFRES', emoji: '📦' },
  { id: 'crystals', label: 'CRISTAUX', emoji: '💎' },
  { id: 'event', label: 'ÉVÉNEMENT', emoji: '🎉' },
];

export interface ShopOffer {
  id: string;
  section: ShopSection;
  title: string;
  subtitle?: string;
  icon: string;
  price: { coins?: number; crystals?: number; real?: string; free?: boolean };
  reward: Reward;
  /** max purchases per reset window (daily offers) or lifetime (featured packs) */
  limit?: number;
  badge?: string;
  tint?: string;
  value?: string;
}

/** Crystal packs — sold through the platform PaymentProvider. */
export const CRYSTAL_PACKS: ShopOffer[] = [
  { id: 'cr_small', section: 'crystals', title: 'Poignée', icon: '💎', price: { real: '0,99 €' }, reward: { crystals: 80 } },
  { id: 'cr_bag', section: 'crystals', title: 'Sac', icon: '💎', price: { real: '4,99 €' }, reward: { crystals: 450 }, value: '+12%' },
  { id: 'cr_box', section: 'crystals', title: 'Caisse', icon: '💎', price: { real: '9,99 €' }, reward: { crystals: 1000 }, value: '+25%', badge: 'POPULAIRE' },
  { id: 'cr_vault', section: 'crystals', title: 'Coffre-fort', icon: '💎', price: { real: '19,99 €' }, reward: { crystals: 2200 }, value: '+37%' },
  { id: 'cr_core', section: 'crystals', title: 'Noyau', icon: '💎', price: { real: '49,99 €' }, reward: { crystals: 6000 }, value: '+50%', badge: 'MEILLEURE OFFRE' },
];

export const STATIC_OFFERS: ShopOffer[] = [
  { id: 'starter', section: 'featured', title: 'PACK DÉMARRAGE', subtitle: 'Une seule fois !', icon: '🚀', price: { crystals: 99 },
    reward: { coins: 3000, chest: 'epic', fragments: [{ hero: 'volt', amount: 20 }] }, limit: 1, badge: '×5 VALEUR', tint: '#ff4d4d' },
  { id: 'coins_s', section: 'featured', title: 'Pile de pièces', icon: '🪙', price: { crystals: 40 }, reward: { coins: 1200 } },
  { id: 'coins_m', section: 'featured', title: 'Sac de pièces', icon: '💰', price: { crystals: 180 }, reward: { coins: 6000 }, value: '+12%' },
  { id: 'coins_l', section: 'featured', title: 'Wagon de pièces', icon: '🏦', price: { crystals: 450 }, reward: { coins: 17000 }, value: '+25%' },
];
