import type { EnemyKind } from './enemies';
import { WORLDS, type Mechanic } from './worlds';

export type ObjectiveType = 'eliminate' | 'survive' | 'combo' | 'destroy' | 'collect' | 'ringout' | 'protect' | 'boss';
export type PropKind = 'crate' | 'barrel' | 'heavy' | 'car' | 'cell' | 'debris' | 'iceBlock' | 'magmaRock' | 'asteroid' | 'core';
export type SpecialType = 'combo' | 'nohit' | 'explosions' | 'ringouts' | 'noAbility' | 'objectKills' | 'chain' | 'flips';

export interface WaveDef { enemies: { kind: EnemyKind; count: number }[] }
export interface LevelDef {
  id: number;
  world: number;
  index: number; // 1..15
  name: string;
  objective: { type: ObjectiveType; target: number };
  waves: WaveDef[];
  props: { kind: PropKind; count: number }[];
  mechanics: Mechanic[];
  special: { type: SpecialType; value: number; label: string };
  parTime: number;
  scoreTarget: number;
  tip?: string;
  boss?: string;
  difficulty: number;
  seed: number;
}

/* ---------- compact authoring helpers ---------- */
const W = (s: string): WaveDef[] =>
  s.split('|').map((w) => ({
    enemies: w.split(',').filter(Boolean).map((e) => {
      const [k, c] = e.trim().split('*');
      return { kind: k as EnemyKind, count: Number(c ?? 1) };
    }),
  }));
const P = (s: string) =>
  s.split(',').filter(Boolean).map((e) => {
    const [k, c] = e.trim().split('*');
    return { kind: k as PropKind, count: Number(c ?? 1) };
  });
const SPECIAL_LABEL: Record<SpecialType, (v: number) => string> = {
  combo: (v) => `Atteindre un combo ×${v}`,
  nohit: (v) => (v === 0 ? 'Ne subir aucun dégât' : `Subir moins de ${v} dégâts`),
  explosions: (v) => `${v} éliminations par explosion`,
  ringouts: (v) => `Éjecter ${v} ennemis dans les pièges`,
  noAbility: () => 'Gagner sans compétence',
  objectKills: (v) => `${v} éliminations avec des objets`,
  chain: (v) => `Réaction en chaîne de ${v} impacts`,
  flips: (v) => `Gagner avec ${v} inversions max`,
};
type Raw = [name: string, obj: string, waves: string, props: string, mech: string, special: string, tip?: string];
const OBJ = (s: string) => {
  const [t, n] = s.split(':');
  return { type: t as ObjectiveType, target: Number(n ?? 0) };
};
const SP = (s: string) => {
  const [t, n] = s.split(':');
  const v = Number(n ?? 0);
  return { type: t as SpecialType, value: v, label: SPECIAL_LABEL[t as SpecialType](v) };
};

/* ---------- authored campaign: 7 worlds x 15 levels ---------- */
const RAW: Raw[][] = [
  // WORLD 1 — IRON FACTORY
  [
    ['Premier Contact', 'eliminate', 'drone*2|drone*3', 'crate*7', '', 'combo:3', 'Glisse pour bouger. 🔴 ATTIRE les objets. TAPE pour passer en 🔵 et les PROJETER !'],
    ["Retour à l'Envoyeur", 'eliminate', 'drone*3|drone*4', 'crate*8', '', 'objectKills:5', 'Garde des objets en 🔴 puis tape : ils partent comme des boulets !'],
    ['Baril Boum', 'eliminate', 'drone*4|drone*5', 'crate*4,barrel*5', 'barrels', 'explosions:3', 'Les barils 🛢️ explosent à l’impact. Réactions en chaîne garanties.'],
    ['Tapis Roulant', 'eliminate', 'drone*4|swarm*6,drone*2', 'crate*6,barrel*3', 'conveyor', 'combo:5', 'Les convoyeurs déplacent tout. Utilise-les !'],
    ['Petits mais Nombreux', 'survive:40', 'swarm*8|swarm*10|swarm*12', 'crate*8,barrel*2', 'conveyor', 'nohit:30', 'Les SWARM attaquent en groupe. Une caisse en balaye plusieurs !'],
    ["Collecte d'Énergie", 'collect:5', 'drone*3|drone*3', 'crate*5,cell*7', '', 'combo:4', 'Attire les cellules ⚡ et dépose-les dans le collecteur.'],
    ['La Presse', 'ringout:5', 'drone*4|drone*4|swarm*6', 'crate*6', 'press', 'ringouts:5', 'Repousse les ennemis sous les PRESSES hydrauliques !'],
    ['Blindé', 'eliminate', 'drone*4|tank*1,drone*3', 'crate*4,heavy*3,barrel*2', '', 'objectKills:6', 'Les TANKS résistent. Lance-leur des objets LOURDS.'],
    ['Générateurs', 'destroy:3', 'drone*4|drone*4,swarm*6', 'crate*8,barrel*3', 'conveyor', 'noAbility', 'Seuls les objets projetés endommagent les générateurs.'],
    ['La Grue', 'eliminate', 'drone*5|tank*1,swarm*6|drone*5', 'crate*6,barrel*3', 'crane', 'explosions:4', 'La boule de démolition balaye tout. Même toi.'],
    ['Défense du Cœur', 'protect:45', 'drone*4|swarm*8|drone*5,tank*1', 'crate*8,barrel*3', '', 'nohit:40', 'Protège le cœur énergétique !'],
    ['Chaîne de Montage', 'combo:15', 'swarm*10|drone*6|swarm*10', 'crate*8,barrel*6', 'conveyor,press', 'chain:6', 'Vise les groupes : un combo ×15 termine le niveau.'],
    ['Assaut Total', 'eliminate', 'drone*6|tank*1,swarm*8|drone*5,tank*1', 'crate*8,barrel*4,heavy*2', 'crane', 'combo:10'],
    ['Survie Industrielle', 'survive:60', 'drone*5|swarm*10|tank*2|drone*6', 'crate*8,barrel*4,heavy*2', 'press,conveyor', 'ringouts:4'],
    ['MAGNETRON', 'boss', 'drone*3', 'crate*8,barrel*4,heavy*2', 'conveyor', 'nohit:60', 'Le colosse se réveille…'],
  ],
  // WORLD 2 — NEON CITY
  [
    ['Lumières de la Ville', 'eliminate', 'drone*5|swarm*8', 'crate*6,barrel*3', 'bounce', 'combo:6', 'Les pads de rebond renvoient les objets à toute vitesse !'],
    ['Haute Tension', 'ringout:6', 'drone*5|swarm*8|drone*4', 'crate*6', 'fence', 'ringouts:6', 'Les clôtures électriques ⚡ grillent les ennemis projetés dedans.'],
    ['Le Puller', 'eliminate', 'puller*2,drone*3|puller*2,swarm*6', 'crate*7,barrel*3', 'bounce', 'nohit:40', 'Les PULLERS t’attirent. Passe en 🔵 pour leur résister !'],
    ['Le Pusher', 'eliminate', 'pusher*2,drone*3|pusher*3,swarm*6', 'crate*7,barrel*3', 'fence', 'nohit:40', 'Les PUSHERS te repoussent vers les clôtures. Attention !'],
    ['Heure de Pointe', 'eliminate', 'drone*6|tank*2,drone*3', 'car*3,crate*4', 'cars', 'objectKills:6', 'Les VOITURES sont lourdes… et dévastatrices.'],
    ['Bombers', 'eliminate', 'bomber*4,drone*2|bomber*6', 'crate*6,barrel*2', 'bounce', 'explosions:5', 'Repousse les BOMBERS vers leurs alliés !'],
    ['Attraction Fatale', 'collect:6', 'puller*2,drone*3|bomber*4', 'crate*5,cell*8', 'fence', 'combo:6'],
    ['Combo Néon', 'combo:20', 'swarm*12|swarm*12,bomber*3|swarm*14', 'crate*8,barrel*6', 'bounce,fence', 'chain:8'],
    ['Générateurs Néon', 'destroy:4', 'drone*5,pusher*1|bomber*4,puller*1', 'car*2,crate*6,barrel*3', 'fence', 'noAbility'],
    ['Pull & Push', 'eliminate', 'puller*2,pusher*2|puller*3,pusher*3', 'crate*8,barrel*4', 'fence,bounce', 'flips:25'],
    ['Protection Rapprochée', 'protect:50', 'bomber*4|drone*6|bomber*6,tank*1', 'crate*8,barrel*3', 'bounce', 'nohit:50'],
    ['Embouteillage', 'eliminate', 'tank*2,drone*4|tank*2,bomber*4', 'car*5,crate*4', 'cars,fence', 'objectKills:8'],
    ['Toits de la Ville', 'survive:60', 'drone*6|bomber*6|puller*2,pusher*2|swarm*16', 'crate*8,barrel*4,car*2', 'bounce,fence', 'ringouts:6'],
    ['Panne Générale', 'eliminate', 'drone*6,bomber*3|puller*2,pusher*2,tank*1|swarm*14,bomber*4', 'crate*8,barrel*5,car*2', 'fence,cars', 'combo:15'],
    ['NEON HYDRA', 'boss', 'bomber*3', 'crate*8,barrel*4,car*2', 'bounce', 'nohit:70'],
  ],
  // WORLD 3 — ORBITAL STATION
  [
    ['Apesanteur', 'eliminate', 'drone*6|swarm*10', 'debris*10', 'lowgrav', 'combo:8', 'Gravité faible : tout glisse beaucoup plus loin.'],
    ['Sas Ouvert', 'ringout:6', 'drone*5|swarm*10|drone*4', 'debris*8', 'pit,lowgrav', 'ringouts:6', 'Éjecte les ennemis dans les SAS ouverts vers l’espace !'],
    ['Courant d’Air', 'eliminate', 'drone*6|bomber*4,swarm*6', 'debris*8,barrel*3', 'vent', 'objectKills:8', 'Les ventilations soufflent tout ce qui passe.'],
    ['Bouclier', 'eliminate', 'shield*2,drone*3|shield*2,swarm*8', 'debris*8,heavy*2', 'lowgrav', 'objectKills:6', 'Les SHIELDS bloquent l’avant. Frappe-les de côté !'],
    ['Débris Orbitaux', 'combo:20', 'swarm*12|drone*6|swarm*14', 'debris*14,barrel*4', 'debris,lowgrav', 'chain:8'],
    ['Collecteur Solaire', 'collect:7', 'shield*2,drone*3|bomber*4', 'debris*6,cell*9', 'vent', 'combo:8'],
    ['Station Assiégée', 'protect:50', 'drone*6|shield*2,bomber*4|swarm*14', 'debris*8,barrel*4', 'lowgrav', 'nohit:50'],
    ['Antennes', 'destroy:4', 'shield*2,drone*4|puller*2,pusher*2', 'debris*8,heavy*3', 'pit', 'noAbility'],
    ['Vide Spatial', 'ringout:10', 'swarm*12|drone*6,pusher*2|tank*2', 'debris*10', 'pit,vent', 'ringouts:10'],
    ['Pression', 'eliminate', 'tank*2,shield*2|bomber*6,puller*2', 'debris*10,barrel*4,heavy*2', 'vent,lowgrav', 'explosions:5'],
    ['Orbite Basse', 'survive:60', 'drone*6|shield*2|swarm*16|bomber*6', 'debris*12', 'debris,pit', 'combo:12'],
    ['Boucliers Multiples', 'eliminate', 'shield*4|shield*3,drone*4', 'debris*10,heavy*3', 'lowgrav', 'flips:30'],
    ['Panique en Orbite', 'combo:30', 'swarm*16|swarm*14,bomber*4|swarm*18', 'debris*12,barrel*6', 'vent,lowgrav', 'chain:10'],
    ['Alerte Rouge', 'eliminate', 'drone*6,shield*2|tank*2,bomber*4|puller*2,pusher*2,swarm*10', 'debris*12,barrel*4,heavy*2', 'pit,vent', 'nohit:60'],
    ['SATELLIZER', 'boss', 'shield*2', 'debris*12,barrel*4,heavy*2', 'lowgrav', 'nohit:80'],
  ],
  // WORLD 4 — MAGMA CORE
  [
    ['Sol Brûlant', 'ringout:6', 'drone*6|swarm*10', 'crate*6,magmaRock*3', 'lava', 'ringouts:6', 'La LAVE fait fondre ennemis et objets. N’y tombe pas !'],
    ['Roches de Magma', 'eliminate', 'drone*6|tank*2', 'magmaRock*6,crate*4', 'magmaRock', 'objectKills:8', 'Les roches de magma brûlent tout ce qu’elles touchent.'],
    ['Éruption', 'survive:45', 'drone*6|swarm*12|bomber*4', 'crate*6,barrel*4', 'eruption,lava', 'nohit:50', 'Les ÉRUPTIONS projettent des rochers : surveille les ombres !'],
    ['Le Phaser', 'eliminate', 'phaser*3,drone*3|phaser*4,swarm*8', 'crate*6,magmaRock*3', 'lava', 'objectKills:6', 'Les PHASERS deviennent intangibles. Frappe quand ils sont solides !'],
    ['Fonderie', 'combo:25', 'swarm*14|drone*6,bomber*4|swarm*16', 'crate*8,barrel*6,magmaRock*3', 'lava,eruption', 'chain:10'],
    ['Cœur Fondu', 'protect:55', 'phaser*4|bomber*6|drone*6,tank*2', 'crate*8,barrel*4,magmaRock*2', 'lava', 'nohit:60'],
    ['Cendres', 'collect:8', 'phaser*3,drone*3|bomber*6', 'crate*5,cell*10,magmaRock*2', 'eruption', 'combo:10'],
    ['Bassins', 'ringout:12', 'swarm*14|drone*6,pusher*2|tank*2,swarm*8', 'crate*8', 'lava', 'ringouts:12'],
    ['Foreuses', 'destroy:5', 'phaser*3,shield*2|bomber*6,puller*2', 'crate*6,heavy*3,magmaRock*3', 'lava,magmaRock', 'noAbility'],
    ['Rivière de Feu', 'eliminate', 'tank*2,phaser*3|bomber*6,shield*2', 'magmaRock*6,barrel*4', 'lava,eruption', 'explosions:6'],
    ['Pluie de Météores', 'survive:60', 'drone*6|phaser*4|swarm*16|bomber*6', 'crate*8,barrel*4', 'eruption', 'combo:14'],
    ['Haut-Fourneau', 'eliminate', 'shield*3,phaser*3|tank*3', 'heavy*3,magmaRock*5,barrel*4', 'lava,magmaRock', 'flips:30'],
    ['Combo Volcanique', 'combo:35', 'swarm*16|swarm*16,bomber*4|swarm*18', 'crate*8,barrel*8', 'lava,eruption', 'chain:12'],
    ['Le Cratère', 'eliminate', 'phaser*4,drone*4|tank*2,bomber*6|puller*2,pusher*2,shield*2', 'magmaRock*5,barrel*5,heavy*2', 'lava,eruption,magmaRock', 'nohit:70'],
    ['MOLTEN GOLEM', 'boss', 'phaser*2', 'magmaRock*4,barrel*4,heavy*2', 'lava', 'nohit:90'],
  ],
  // WORLD 5 — FROZEN FORGE
  [
    ['Glissade', 'eliminate', 'drone*6|swarm*12', 'crate*6,iceBlock*4', 'ice', 'combo:8', 'Sol GELÉ : tu glisses, les objets aussi. Anticipe !'],
    ['Blocs de Glace', 'eliminate', 'drone*6|tank*2', 'iceBlock*7,crate*3', 'ice,iceBlock', 'objectKills:8', 'Les blocs de glace GÈLENT les ennemis qu’ils touchent.'],
    ['Souffle Polaire', 'ringout:8', 'drone*6|swarm*12', 'crate*6,iceBlock*3', 'freezeVent,ice', 'ringouts:8', 'Les bouches de gel figent tout ce qui passe.'],
    ['Le Chaos', 'eliminate', 'chaos*2,drone*3|chaos*3,swarm*8', 'crate*6,iceBlock*3', 'ice', 'flips:30', 'Les CHAOS changent de polarité. Même couleur = répulsion !'],
    ['Chaîne Gelée', 'combo:30', 'swarm*16|drone*6,bomber*4|swarm*16', 'crate*6,iceBlock*6,barrel*4', 'ice,conveyor', 'chain:10'],
    ['Forge Assiégée', 'protect:55', 'chaos*3|bomber*6|drone*6,tank*2', 'crate*6,iceBlock*4,barrel*3', 'ice', 'nohit:60'],
    ['Cristaux', 'collect:9', 'chaos*2,drone*4|phaser*4', 'iceBlock*4,cell*11', 'freezeVent', 'combo:10'],
    ['Patinoire', 'ringout:12', 'swarm*16|pusher*3,drone*4|tank*2', 'iceBlock*6', 'ice,freezeVent', 'ringouts:12'],
    ['Enclumes', 'destroy:5', 'chaos*3,shield*2|tank*2,phaser*3', 'heavy*4,iceBlock*4', 'ice,conveyor', 'noAbility'],
    ['Givre Total', 'eliminate', 'chaos*3,phaser*3|shield*3,bomber*4', 'iceBlock*8,barrel*4', 'ice,iceBlock', 'explosions:6'],
    ['Tempête de Neige', 'survive:65', 'drone*8|chaos*4|swarm*18|bomber*6', 'crate*6,iceBlock*6', 'freezeVent,ice', 'combo:15'],
    ['Lingots', 'eliminate', 'tank*3,chaos*2|shield*3,puller*2', 'heavy*4,iceBlock*4', 'ice,conveyor', 'flips:35'],
    ['Avalanche', 'combo:40', 'swarm*18|swarm*16,bomber*6|swarm*20', 'iceBlock*8,barrel*6', 'ice,freezeVent', 'chain:12'],
    ['Zéro Absolu', 'eliminate', 'chaos*4,drone*4|tank*2,phaser*4|puller*2,pusher*2,shield*2', 'iceBlock*8,barrel*4,heavy*2', 'ice,iceBlock,freezeVent', 'nohit:80'],
    ['CRYOFORGE', 'boss', 'chaos*2', 'iceBlock*6,barrel*4,heavy*2', 'ice', 'nohit:100'],
  ],
  // WORLD 6 — COSMIC FIELD
  [
    ['Champ d’Étoiles', 'eliminate', 'drone*8|swarm*14', 'asteroid*5,debris*6', 'lowgrav', 'combo:10', 'Bienvenue dans le champ cosmique. Tout flotte.'],
    ['Puits Gravitationnel', 'ringout:8', 'drone*6|swarm*14', 'asteroid*4,debris*6', 'gravityWell', 'ringouts:8', 'Les PUITS aspirent tout. Pousse les ennemis au centre !'],
    ['Astéroïdes', 'eliminate', 'tank*3,drone*4|shield*3', 'asteroid*8', 'asteroid', 'objectKills:10', 'Les astéroïdes sont énormes. Projette-les !'],
    ['Trous Noirs', 'ringout:12', 'swarm*16|drone*6,pusher*2|chaos*3', 'asteroid*4,debris*8', 'pit,gravityWell', 'ringouts:12'],
    ['Constellation', 'combo:40', 'swarm*18|bomber*6,swarm*10|swarm*20', 'asteroid*4,debris*10,barrel*6', 'lowgrav', 'chain:12'],
    ['Station Lointaine', 'protect:60', 'phaser*4|chaos*4|bomber*6,tank*2', 'asteroid*4,debris*8', 'gravityWell', 'nohit:70'],
    ['Poussière d’Étoiles', 'collect:10', 'chaos*3,drone*4|phaser*4,puller*2', 'debris*6,cell*12', 'gravityWell,lowgrav', 'combo:12'],
    ['Pulsars', 'destroy:5', 'shield*3,chaos*3|tank*3,bomber*4', 'asteroid*6,debris*6', 'asteroid', 'noAbility'],
    ['Comètes', 'eliminate', 'drone*8,bomber*4|phaser*4,chaos*3', 'asteroid*6,barrel*4', 'asteroid,lowgrav', 'explosions:7'],
    ['Nébuleuse', 'survive:70', 'drone*8|chaos*4|swarm*20|tank*3', 'asteroid*5,debris*10', 'gravityWell,pit', 'combo:16'],
    ['Big Bang', 'combo:50', 'swarm*20|swarm*18,bomber*6|swarm*22', 'asteroid*4,debris*10,barrel*8', 'gravityWell', 'chain:15'],
    ['Éclipse', 'eliminate', 'shield*4,phaser*3|puller*3,pusher*3', 'asteroid*6,heavy*3', 'pit,lowgrav', 'flips:35'],
    ['Supernova', 'eliminate', 'tank*3,chaos*3|bomber*8|swarm*20', 'asteroid*6,barrel*6', 'gravityWell,asteroid', 'explosions:8'],
    ['Horizon', 'eliminate', 'chaos*4,phaser*4|shield*3,tank*2|puller*2,pusher*2,bomber*6', 'asteroid*6,barrel*4,debris*6', 'gravityWell,pit,asteroid', 'nohit:90'],
    ['STARMAW', 'boss', 'puller*2', 'asteroid*6,barrel*4,debris*6', 'gravityWell', 'nohit:110'],
  ],
  // WORLD 7 — THE VOID
  [
    ['Anomalie', 'eliminate', 'drone*8|chaos*4', 'crate*6,debris*6,barrel*3', 'portal', 'combo:12', 'Les PORTAILS téléportent les objets… et les ennemis.'],
    ['Zones Inversées', 'eliminate', 'drone*6,chaos*2|swarm*16', 'crate*8,barrel*4', 'polarityZone', 'flips:30', 'Dans les zones violettes, ta polarité s’INVERSE.'],
    ['Gravité Folle', 'ringout:12', 'swarm*16|drone*6,pusher*2|tank*2', 'crate*8,debris*6', 'flipGravity,pit', 'ringouts:12', 'La gravité change de direction. Profite du chaos !'],
    ['Distorsion', 'combo:45', 'swarm*18|bomber*6,swarm*12|swarm*20', 'crate*8,barrel*8', 'portal,polarityZone', 'chain:14'],
    ['Silence', 'protect:60', 'phaser*5|chaos*5|bomber*6,tank*2', 'crate*8,barrel*4,heavy*2', 'portal', 'nohit:80'],
    ['Fragments du Néant', 'collect:12', 'chaos*4,phaser*3|puller*3,pusher*3', 'debris*8,cell*14', 'flipGravity', 'combo:14'],
    ['Piliers du Vide', 'destroy:6', 'shield*4,chaos*3|tank*3,bomber*6', 'heavy*4,barrel*4,crate*4', 'polarityZone,pit', 'noAbility'],
    ['Écho', 'eliminate', 'drone*10,phaser*4|chaos*5,bomber*4', 'crate*8,barrel*6', 'portal,flipGravity', 'explosions:8'],
    ['Effondrement', 'survive:75', 'drone*8|chaos*5|swarm*22|tank*3|bomber*8', 'crate*8,barrel*6,debris*6', 'pit,flipGravity', 'combo:18'],
    ['Paradoxe', 'eliminate', 'chaos*6|shield*4,puller*3', 'crate*8,heavy*3', 'polarityZone,portal', 'flips:40'],
    ['Singularité', 'combo:60', 'swarm*22|swarm*20,bomber*6|swarm*24', 'crate*8,barrel*8,debris*6', 'portal,polarityZone,pit', 'chain:16'],
    ['Abîme', 'ringout:16', 'swarm*20|tank*3,pusher*3|chaos*5', 'crate*8,debris*8', 'pit,flipGravity,portal', 'ringouts:16'],
    ['Le Seuil', 'eliminate', 'tank*4,chaos*4|phaser*5,bomber*6|shield*4,puller*3', 'heavy*4,barrel*6', 'polarityZone,flipGravity', 'explosions:10'],
    ['Dernier Rempart', 'eliminate', 'chaos*6,phaser*4|tank*3,shield*3,bomber*4|puller*3,pusher*3,swarm*20', 'crate*8,barrel*6,heavy*3', 'portal,polarityZone,pit', 'nohit:100'],
    ['NULL KING', 'boss', 'chaos*3', 'crate*8,barrel*6,heavy*3,debris*6', 'polarityZone', 'nohit:130'],
  ],
];

export const LEVELS: LevelDef[] = RAW.flatMap((world, wi) =>
  world.map((r, li) => {
    const [name, obj, waves, props, mech, special, tip] = r;
    const id = wi * 15 + li + 1;
    const o = OBJ(obj);
    const wv = W(waves);
    const enemyCount = wv.reduce((s, w) => s + w.enemies.reduce((a, e) => a + e.count, 0), 0);
    const difficulty = 1 + wi * 0.28 + li * 0.025;
    const parTime =
      o.type === 'survive' || o.type === 'protect' ? o.target + 1 :
      o.type === 'boss' ? 150 + wi * 15 :
      Math.round(20 + enemyCount * 3.2 + (o.type === 'collect' ? o.target * 5 : 0) + (o.type === 'destroy' ? o.target * 6 : 0));
    return {
      id,
      world: wi + 1,
      index: li + 1,
      name,
      objective: o,
      waves: wv,
      props: P(props),
      mechanics: mech.split(',').filter(Boolean) as Mechanic[],
      special: SP(special),
      parTime,
      scoreTarget: Math.round((enemyCount * 260 + 2000) * (1 + wi * 0.35) / 100) * 100 * (o.type === 'boss' ? 3 : 1),
      tip,
      boss: o.type === 'boss' ? WORLDS[wi].boss : undefined,
      difficulty,
      seed: id * 7919,
    } satisfies LevelDef;
  }),
);
export const levelById = (id: number) => LEVELS[id - 1];
export const LEVELS_PER_WORLD = 15;
