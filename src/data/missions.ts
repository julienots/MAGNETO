export type MissionStat = 'kills' | 'objectKills' | 'explosions' | 'maxCombo' | 'wins' | 'flips' | 'abilities' | 'ringouts' | 'stars' | 'chests' | 'bossKills';
export interface MissionDef { id: string; stat: MissionStat; target: number; label: string; coins: number; passXp: number; mode: 'sum' | 'max' }
export const MISSION_POOL: MissionDef[] = [
  { id: 'k50', stat: 'kills', target: 50, label: 'Élimine 50 ennemis', coins: 150, passXp: 120, mode: 'sum' },
  { id: 'k120', stat: 'kills', target: 120, label: 'Élimine 120 ennemis', coins: 300, passXp: 200, mode: 'sum' },
  { id: 'o25', stat: 'objectKills', target: 25, label: '25 éliminations avec des objets', coins: 200, passXp: 150, mode: 'sum' },
  { id: 'e10', stat: 'explosions', target: 10, label: '10 éliminations par explosion', coins: 200, passXp: 150, mode: 'sum' },
  { id: 'c10', stat: 'maxCombo', target: 10, label: 'Atteins un combo ×10', coins: 200, passXp: 150, mode: 'max' },
  { id: 'c20', stat: 'maxCombo', target: 20, label: 'Atteins un combo ×20', coins: 350, passXp: 220, mode: 'max' },
  { id: 'w3', stat: 'wins', target: 3, label: 'Gagne 3 parties', coins: 200, passXp: 150, mode: 'sum' },
  { id: 'f60', stat: 'flips', target: 60, label: 'Inverse ta polarité 60 fois', coins: 120, passXp: 100, mode: 'sum' },
  { id: 'a8', stat: 'abilities', target: 8, label: 'Utilise ta compétence 8 fois', coins: 150, passXp: 120, mode: 'sum' },
  { id: 'r10', stat: 'ringouts', target: 10, label: 'Éjecte 10 ennemis dans les pièges', coins: 200, passXp: 150, mode: 'sum' },
  { id: 's6', stat: 'stars', target: 6, label: 'Gagne 6 étoiles', coins: 250, passXp: 180, mode: 'sum' },
  { id: 'ch2', stat: 'chests', target: 2, label: 'Ouvre 2 coffres', coins: 150, passXp: 120, mode: 'sum' },
  { id: 'b1', stat: 'bossKills', target: 1, label: 'Vaincs un boss', coins: 400, passXp: 250, mode: 'sum' },
];
