import { CRYSTAL_PACKS, STATIC_OFFERS, type ShopOffer } from '../data/shop';
import { HEROES, heroById } from '../data/heroes';
import { SKINS } from '../data/skins';
import { CHESTS } from '../data/chests';
import { currentEvent } from '../data/events';
import { Rng, hashStr } from '../core/Random';
import type { Profile, GrantResult } from './Profile';
import { payments } from './Payments';

export function dailyOffers(day: string, p: Profile): ShopOffer[] {
  const r = new Rng(hashStr('daily' + day));
  const out: ShopOffer[] = [{ id: 'daily_free', section: 'daily', title: 'CADEAU GRATUIT', icon: '🎁', price: { free: true }, reward: { coins: 150, passXp: 60 }, limit: 1, badge: 'GRATUIT', tint: '#2ee6a6' }];
  const heroes = HEROES.filter((h) => h.unlock.type !== 'pass');
  for (let i = 0; i < 3; i++) {
    const h = r.pick(heroes);
    const amt = r.pick([10, 20, 40]);
    out.push({ id: `daily_frag_${i}`, section: 'daily', title: `${amt} fragments`, subtitle: h.name, icon: '🧩', price: { coins: amt * 25 }, reward: { fragments: [{ hero: h.id, amount: amt }] }, limit: 1, tint: '#' + h.color.toString(16).padStart(6, '0') });
  }
  out.push({ id: 'daily_chest', section: 'daily', title: 'Coffre Acier', icon: '📦', price: { coins: 600 }, reward: { chest: 'steel' }, limit: 2 });
  out.push({ id: 'daily_cry', section: 'daily', title: '15 cristaux', icon: '💎', price: { coins: 1500 }, reward: { crystals: 15 }, limit: 1 });
  void p;
  return out;
}

export function heroOffers(p: Profile): ShopOffer[] {
  return HEROES.filter((h) => !p.hero(h.id).owned && h.unlock.type === 'fragments').map((h) => ({
    id: `hero_${h.id}`, section: 'characters' as const, title: h.name, subtitle: h.title, icon: '🧑‍🚀',
    price: { crystals: h.rarity === 'legendary' ? 900 : h.rarity === 'epic' ? 550 : 300 }, reward: { hero: h.id }, limit: 1,
    tint: '#' + h.color.toString(16).padStart(6, '0'),
  }));
}
export function skinOffers(p: Profile, day: string): ShopOffer[] {
  const r = new Rng(hashStr('skins' + day));
  const avail = SKINS.filter((s) => s.theme !== 'default' && !p.data.ownedSkins.includes(s.id));
  const picks: typeof avail = [];
  const owned = avail.filter((s) => p.hero(s.hero).owned);
  const src = owned.length >= 4 ? owned : avail;
  while (picks.length < 6 && src.length) picks.push(src.splice(r.int(0, src.length - 1), 1)[0]);
  return picks.map((s) => ({ id: `skin_${s.id}`, section: 'skins' as const, title: s.name, subtitle: heroById(s.hero).name, icon: '🎨', price: { crystals: s.price }, reward: { skin: s.id }, limit: 1 }));
}
export function chestOffers(): ShopOffer[] {
  return CHESTS.map((c) => ({ id: `chest_${c.id}`, section: 'chests' as const, title: c.name, icon: '📦', price: { crystals: c.priceCrystals }, reward: { chest: c.id }, tint: '#' + c.color.toString(16).padStart(6, '0') }));
}
export function eventOffers(): ShopOffer[] {
  const ev = currentEvent().def;
  return [
    { id: `ev_${ev.id}_pack`, section: 'event', title: `PACK ${ev.name}`, subtitle: ev.desc, icon: ev.emoji, price: { crystals: 160 }, reward: { chest: 'epic', coins: 2000 }, limit: 1, badge: 'ÉVÉNEMENT', tint: ev.color },
    { id: `ev_${ev.id}_chest`, section: 'event', title: 'Coffre Énergie', subtitle: 'Prix événement -30%', icon: '📦', price: { crystals: 98 }, reward: { chest: 'energy' }, limit: 3, tint: ev.color },
  ];
}

export function allOffers(p: Profile): ShopOffer[] {
  const day = p.data.shop.day;
  const featured = STATIC_OFFERS.filter((o) => !(o.limit && p.purchases(o.id, true) >= o.limit));
  return [...featured, ...dailyOffers(day, p), ...heroOffers(p), ...skinOffers(p, day), ...chestOffers(), ...CRYSTAL_PACKS, ...eventOffers()];
}

export function remaining(p: Profile, o: ShopOffer) {
  if (!o.limit) return Infinity;
  const lifetime = o.section === 'featured' || o.section === 'characters' || o.section === 'skins';
  return Math.max(0, o.limit - p.purchases(o.id, lifetime));
}

export async function buyOffer(p: Profile, o: ShopOffer): Promise<{ ok: boolean; reason?: string; results?: GrantResult[] }> {
  if (remaining(p, o) <= 0) return { ok: false, reason: 'Déjà acheté' };
  if (o.price.real) {
    const res = await payments.purchase(o.id);
    if (!res.ok) return { ok: false, reason: res.error ?? 'Achat annulé' };
  } else if (!o.price.free) {
    if (!p.spend({ coins: o.price.coins, crystals: o.price.crystals })) return { ok: false, reason: o.price.crystals ? 'Pas assez de cristaux' : 'Pas assez de pièces' };
  }
  p.recordPurchase(o.id);
  return { ok: true, results: p.grant(o.reward) };
}
