import './ui/ui.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { App } from './App';
import { runIntro } from './ui/screens/intro';
import { HomeScreen, TitleScreen } from './ui/screens/home';
import { CampaignScreen } from './ui/screens/campaign';
import { HeroesScreen } from './ui/screens/heroes';
import { ShopScreen } from './ui/screens/shop';
import { PassScreen } from './ui/screens/pass';
import { ProfileScreen } from './ui/screens/profile';
import { ChestScreen } from './ui/screens/chest';
import { BattleScreen } from './ui/screens/battle';
import { audio } from './audio/Audio';

async function boot() {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui')!;
  const floatLayer = document.getElementById('float')!;
  if (Capacitor.isNativePlatform()) StatusBar.hide().catch(() => {});

  let progress: (p: number) => void = () => {};
  let resolveLoaded!: () => void;
  const loaded = new Promise<void>((r) => (resolveLoaded = r));
  const intro = runIntro(uiRoot, loaded, (cb) => (progress = cb));

  // heavy init happens while the studio card is on screen
  await new Promise((r) => setTimeout(r, 50));
  const app = new App(root, canvas, uiRoot, floatLayer);
  (window as any).__MW = app; // debug / QA handle
  progress(0.4);
  const ui = app.ui;
  ui.register('title', new TitleScreen(app));
  ui.register('home', new HomeScreen(app));
  ui.register('campaign', new CampaignScreen(app));
  ui.register('heroes', new HeroesScreen(app));
  ui.register('shop', new ShopScreen(app));
  ui.register('pass', new PassScreen(app));
  ui.register('profile', new ProfileScreen(app));
  ui.register('chest', new ChestScreen(app));
  ui.register('battle', new BattleScreen(app));
  progress(0.7);
  // warm up shaders by rendering the menu once
  app.showMenu('title');
  app.game.renderer.compile(app.menu.scene, app.menu.camera);
  progress(1);
  resolveLoaded();
  await intro;
  ui.go('title', undefined, { push: false });

  // platform integration
  const pauseAll = () => { audio.suspend(); const b = ui.screens.get('battle') as BattleScreen; if (ui.current === 'battle') b.pause(); app.profile.flush(); };
  const resumeAll = () => { const b = ui.screens.get('battle') as BattleScreen; if (!(ui.current === 'battle' && b.paused)) audio.resume(); };
  document.addEventListener('visibilitychange', () => (document.hidden ? pauseAll() : resumeAll()));
  window.addEventListener('pagehide', () => app.profile.flush());
  if (Capacitor.isNativePlatform()) {
    CapApp.addListener('pause', pauseAll);
    CapApp.addListener('resume', resumeAll);
    CapApp.addListener('backButton', () => {
      if (ui.current === 'home' && !ui.modalOpen) ui.confirm('QUITTER ?', 'Quitter MAGNET WAR ?', 'QUITTER', () => { app.profile.flush(); CapApp.exitApp(); }, 'red');
      else ui.back();
    });
  } else {
    window.addEventListener('keydown', (e) => { if (e.key === 'Backspace') ui.back(); });
  }
}
boot();
