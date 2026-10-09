# MAGNET WAR — by SUPERESSENCE

**ATTIRE. REPOUSSE. DÉTRUIS.** A portrait-native (9:16), one-thumb, cartoon-3D magnetic action game for Android.

Toggle your polarity between 🔴 **+ (attract)** and 🔵 **− (repel)**. Everything metallic in the arena (crates, barrels, cars, ice blocks, asteroids… and enemies) becomes a weapon. Pull, then flip and fire, and chain reactions build huge combos.

## Controls (one thumb)
| Gesture | Action |
|---|---|
| Touch & drag anywhere | Floating joystick: move and aim |
| Quick tap (or the big 🔴/🔵 button) | Flip polarity. Flipping to 🔵 **fires** every held object (with aim assist) |
| Quick flick | Dash (brief invulnerability) |
| ✨ button | Hero ability |

Desktop: WASD/arrows to move, Space to flip, Shift to dash, E for the ability, Esc to pause.

## Content
- **7 heroes** (MAG, VOLT, PULSE, ORBIT, CRASH, PHASE, ZERO). Each has a distinct silhouette, stats, an ability, a full facial rig and procedural animations (idle, run, attack, victory, defeat, spawn, select). Heroes are data-driven (`src/data/heroes.ts`): adding one is a table entry. The model builder combines body/head/gloves/eyes/accessories to make 30+ distinct characters.
- **49 skins**: 7 themes per hero (Classic, Inferno, Frost, Cosmic, Mecha, Phantom, Overcharge). Each has a palette, extra model parts, an aura and particles.
- **9 enemies**: Drone, Tank, Puller, Pusher, Bomber, Shield, Swarm, Phaser, Chaos. Each has its own model and AI. Elite mini-bosses appear during the "Boss Invasion" event.
- **7 bosses** (MAGNETRON, NEON HYDRA, SATELLIZER, MOLTEN GOLEM, CRYOFORGE, STARMAW, NULL KING), each in 5 phases:
  1. Attacks
  2. Polarity shifts (red = vulnerable, blue = deflects)
  3. Arena vacuum and spit-back
  4. Decor destruction with debris rain
  5. **FINAL**: invulnerable. You must throw the arena's heavy magnetic cores back at it.
- **7 worlds** (Iron Factory, Neon City, Orbital Station, Magma Core, Frozen Forge, Cosmic Field, The Void) with **105 hand-authored levels**. Each world has its own hazards: conveyors, presses, wrecking ball, bounce pads, electric fences, vents, lava, eruptions, ice, freeze vents, gravity wells, pits, portals, polarity-inversion zones and flipping gravity.
- **Level objectives**: eliminate, survive, protect the core, combo target, destroy generators, deliver energy cells, ring-outs, boss.
- **3 stars per level**: time, score, and a level-specific challenge.
- **Modes**: Campaign, Magnet Rush (60 s), Survival (infinite waves), Boss Rush (7 bosses back to back), Chaos (physics rules change every 15 s).
- **Combo system**: ×2 · ×3 · ×5 · ×10 · ×20 · ×50 · ×100, with chain-reaction tracking. Each tier has its own feedback (text, colour, shake, slow-mo, flash, vignette, sound).
- **Meta progression**:
  - Coins, Crystals and Fragments
  - 6 chest types (Wood → Cosmic) with a staged opening (anticipation taps → burst → reveal)
  - Shop with Featured, Daily, Heroes, Skins, Chests, Crystals and Event sections
  - SUPERESSENCE Pass: 40 tiers, free and premium tracks
  - Daily missions
  - 4 rotating weekly events (Magnet Storm, Zero Gravity, Chaos Week, Boss Invasion)
  - Trophy road (Bronze → Grand Master) with unlocks
  - Profile and statistics

## Tech
- TypeScript + **Three.js** (toon shading, inverted-hull outlines, everything modelled procedurally: no third-party assets).
- Custom arcade **2D physics** on the ground plane (mass, polarity, magnetic susceptibility, resistance, friction, restitution, destructibility) with a spatial hash. Measured at 0.1–0.25 ms per frame of simulation.
- Pooled GPU particles, instanced debris, pooled shock rings, flashes and lightning; DOM floating text; trauma-based camera shake, hit-stop and slow-mo.
- **Procedural audio** (WebAudio): every sound effect is synthesized with random variations; a procedural music sequencer per world, intensifying with the combo.
- **Haptics**: light (interaction), medium (impact), heavy (explosion/boss); can be disabled in settings.
- **Save**: versioned schema + migrations, checksum, rolling backup, and a `CloudSaveProvider` interface ready for a cloud backend.
- **Payments**: `PaymentProvider` interface. The shipped provider is a clearly-labelled **sandbox** (no real charge) until Google Play Billing is connected.
- **Android** via Capacitor 8:
  - Package `com.superessence.magnetwar`, name *MAGNET WAR*, locked portrait, fullscreen immersive
  - Original adaptive icon
  - SUPERESSENCE studio card as the splash, then the in-game particle intro
  - Versioning from `package.json`

## Develop
```bash
npm install
npm run dev          # http://localhost:5173 (use a portrait viewport)
npm test             # unit tests (physics, combo, level data, save/migration, economy, chests, pass, shop)
npm run qa           # bot plays all 105 levels in fast simulation (god mode): completion/softlock check
npm run qa:real      # same bot without god mode: difficulty curve
npm run qa:modes     # Rush / Survival / Boss Rush / Chaos
npm run qa:perf      # draw calls, triangles, simulation cost
npm run assets       # regenerate icon + splash PNGs (web + Android)
```

## Build Android
CI (`.github/workflows/android.yml`) builds on every push and uploads the artifact **magnet-war-android**, which contains:
- `MagnetWar-debug.apk`
- `MagnetWar-release.apk`
- `MagnetWar-release.aab`

For Play Store releases, add these repository secrets so builds are signed with your permanent key:
- `MW_KEYSTORE_BASE64` (base64 of the .jks)
- `MW_KEYSTORE_PASSWORD`
- `MW_KEY_ALIAS`
- `MW_KEY_PASSWORD`

Without them, CI signs with a throw-away key (fine for testing).

Local build (requires the Android SDK, JDK 21):
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug assembleRelease bundleRelease
```
Local release signing reads `android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) or the same `MW_*` environment variables.
