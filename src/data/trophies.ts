import type { Reward } from './types';
export interface League { id: string; name: string; min: number; color: string; icon: string; reward: Reward; unlock?: string }
export const LEAGUES: League[] = [
  { id: 'bronze', name: 'BRONZE', min: 0, color: '#c98a4b', icon: '🥉', reward: {} },
  { id: 'silver', name: 'SILVER', min: 200, color: '#c6d2dc', icon: '🥈', reward: { chest: 'steel', coins: 500 }, unlock: 'Mode MAGNET RUSH' },
  { id: 'gold', name: 'GOLD', min: 600, color: '#ffc83d', icon: '🥇', reward: { chest: 'energy', crystals: 50 }, unlock: 'Héros CRASH + mode SURVIVAL' },
  { id: 'platinum', name: 'PLATINUM', min: 1200, color: '#7ff0e6', icon: '💠', reward: { chest: 'epic', crystals: 100 }, unlock: 'Mode BOSS RUSH' },
  { id: 'diamond', name: 'DIAMOND', min: 2000, color: '#7fb8ff', icon: '💎', reward: { chest: 'mythic', crystals: 150 }, unlock: 'Mode CHAOS' },
  { id: 'master', name: 'MASTER', min: 3200, color: '#c77dff', icon: '👑', reward: { chest: 'mythic', crystals: 250 }, unlock: 'Badge MASTER' },
  { id: 'grandmaster', name: 'GRAND MASTER', min: 5000, color: '#ff4f9a', icon: '🏆', reward: { chest: 'cosmic', crystals: 500 }, unlock: 'Skin ZERO COSMIC' },
];
export function leagueFor(trophies: number): League {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if (trophies >= x.min) l = x;
  return l;
}
export function nextLeague(trophies: number): League | undefined { return LEAGUES.find((l) => l.min > trophies); }
