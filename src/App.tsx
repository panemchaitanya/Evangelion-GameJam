import { STORY, activeEnding } from './story';
import { useState, useCallback, useEffect } from 'react';
import GameScreen from './components/GameScreen';
import { audio } from './game/audio';
import { music } from './game/music';
import { LEVELS, TOTAL_SHARDS, loadSave, storeSave } from './game/levels';
import { loadSettings, storeSettings } from './game/types';
import type { GameSettings } from './game/types';

type Screen = 'title' | 'intro' | 'game' | 'endcards' | 'ward' | 'outro' | 'ending' | 'intropanels' | 'teaser' | 'vigilcover';
const INTRO = STORY.intro;
export type GameLanguage = 'ar' | 'en';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COPY = {
  ar: {
    subtitle: 'نحو الضوء', begin: 'ابدأ الرحلة', continue: 'متابعة', soundOn: 'الصوت: يعمل',
    soundOff: 'الصوت: متوقف', install: 'تثبيت على الهاتف', chapter: 'الفصل', chapters: 'خمسة فصول',
    controls: ['حرّك العصا للمشي', 'اقفز', 'تفاعل', 'أوقف اللعبة'], note: 'استخدم سماعات الرأس · يُفضّل الوضع الأفقي · تدعم يد التحكم',
    endingTitle: 'فتحت عينيك', endingSub: 'تركك الظلام ترحل — هذه المرة', time: 'الوقت', deaths: 'السقوطات',
    best: 'الأفضل', memories: 'الذكريات', again: 'انزل مرة أخرى', rest: 'العودة', language: 'EN',
    chapterNames: ['الغابة', 'الآلة', 'الأعماق الغارقة', 'الأطلال الصادية', 'الصعود الشاحب'],
  },
  en: {
    subtitle: 'a lullaby for the ones who stayed awake', begin: 'wake up', continue: 'continue', soundOn: 'sound: on',
    soundOff: 'sound: off', install: 'install on phone', chapter: 'chapter', chapters: 'five chapters',
    controls: ['← → move', '↑ / space jump', 'E interact', 'Q / 1 2 3 change kid', 'P pause'], note: 'headphones recommended · landscape mode · Team Evangelion · Infinium 26 GameJam',
    endingTitle: 'they never left', endingSub: 'every escape is another dream.', time: 'time', deaths: 'deaths',
    best: 'best', memories: 'lullabies', again: 'dream again', rest: 'rest', language: 'ع',
    chapterNames: ['the dormitory garden', 'the boiler house', 'the flooded cellar', 'the old wing', 'the star gate'],
  },
} as const;

const KEYS_EN = (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) ? ['← → move', '↑ / space jump', 'E interact', 'Q / 1 2 3 change kid', 'P pause'] : null;
function preloadPanel(src?: string) { if (src) { const i = new Image(); i.src = src; } }

if (typeof window !== 'undefined') STORY.panels.intro.slice(0, 2).forEach(p => preloadPanel(p.src));
preloadPanel('panels/vigilcover.jpg');
function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function loadLang(): GameLanguage {
  try {
        return 'en';
  } catch { return 'en'; }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    // intro panels play once per page load; QA/debug URLs skip straight to the title
    const q = typeof location !== 'undefined' ? location.search : '';
    void q; return 'title';
  });
  const [panelStep, setPanelStep] = useState(0);
  const [showCredits, setShowCredits] = useState(false);
  const [startLevel, setStartLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [save, setSave] = useState(loadSave);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [lang] = useState<GameLanguage>(loadLang);
  const [endStats, setEndStats] = useState<{ deaths: number; time: number } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const t = COPY[lang];

  useEffect(() => { audio.setMuted(muted); music.setMuted(muted); }, [muted]);
  // scene music: intro theme on the comic/title, finale theme from the end cards through the ending. (Chapters: engine.)
  useEffect(() => {
    if (screen === 'title' || screen === 'intropanels') music.play('intro');
    else if (screen === 'outro' && (STORY.panels.outro[panelStep] as { page?: boolean } | undefined)?.page) music.play('finale');
    else if (screen === 'ward') music.play('ward');
    else if (screen === 'endcards' || screen === 'outro') music.play('outro');
    else if (screen === 'ending' || screen === 'teaser') music.play('lullaby');
    else if (screen === 'intro') music.stop();
  }, [screen, panelStep]);
  // browsers block audio until the first tap: retry the current scene's track on the first pointer/key
  useEffect(() => {
    const kick = () => { audio.ensure(); if (screen === 'title' || screen === 'intropanels') music.play('intro'); };
    window.addEventListener('pointerdown', kick, { once: true });
    return () => window.removeEventListener('pointerdown', kick);
  }, [screen]);
  useEffect(() => { storeSettings(settings); }, [settings]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('moth-lang', lang); } catch { /* ignore */ }
  }, [lang]);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const [introStep, setIntroStep] = useState(0);
  const [endStep, setEndStep] = useState(0);
  const begin = useCallback((level: number) => {
    audio.ensure();
    audio.ui();
    setStartLevel(level);
    let seen = true;
    try { seen = localStorage.getItem('lull-intro-seen') === '1'; } catch { /* */ }
    // the comic intro pages replace the old gold story-text cards (owner: no text captions); `seen` kept for compatibility
    void seen;
    setScreen(level === 0 && STORY.panels.intro.length > 0 && !/[?&](debug|qa)=/.test(location.search) ? 'intropanels' : 'game');
  }, []);
  const nextIntro = useCallback(() => {
    audio.chime(introStep % 3);
    if (introStep + 1 >= INTRO.length) {
      try { localStorage.setItem('lull-intro-seen', '1'); } catch { /* */ }
      setScreen('game');
    } else setIntroStep(introStep + 1);
  }, [introStep]);

  // the moth motif: first touch of the title screen wakes the music
  useEffect(() => {
    if (screen !== 'title') return;
    const play = () => {
      audio.ensure();
      audio.titleMotif();
      window.removeEventListener('pointerdown', play);
    };
    window.addEventListener('pointerdown', play);
    return () => window.removeEventListener('pointerdown', play);
  }, [screen]);

  // ending resolves the motif upward into the light
  useEffect(() => {
    if (screen === 'ending') {
      audio.ensure();
      audio.endingMotif();
    }
  }, [screen]);

  const handleFinish = useCallback((deaths: number, time: number) => {
    setSave(prev => {
      const next = {
        ...prev,
        unlocked: Math.max(prev.unlocked, LEVELS.length - 1),
        bestDeaths: prev.bestDeaths === null ? deaths : Math.min(prev.bestDeaths, deaths),
        bestTime: prev.bestTime === null ? time : Math.min(prev.bestTime, time),
      };
      storeSave(next);
      return next;
    });
    setEndStats({ deaths, time });
    setEndStep(0);
    setScreen('endcards');
  }, []);

  const toggleMute = useCallback(() => setMuted(m => !m), []);

  const handleProgress = useCallback((levelIndex: number) => {
    setSave(prev => {
      if (levelIndex <= prev.unlocked) return prev;
      const next = { ...prev, unlocked: levelIndex };
      storeSave(next);
      return next;
    });
  }, []);

  const handleCollectShard = useCallback((id: string) => {
    setSave(prev => {
      if (prev.shards.includes(id)) return prev;
      const next = { ...prev, shards: [...prev.shards, id] };
      storeSave(next);
      return next;
    });
  }, []);


  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (screen === 'intro') {
    return (
      <div className="title-screen intro-screen" onClick={nextIntro} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') nextIntro(); }}>
        <p key={introStep} className="intro-line">{INTRO[introStep]}</p>
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <GameScreen
        startLevel={startLevel}
        muted={muted}
        lang={lang}
        collectedShards={save.shards}
        totalShards={TOTAL_SHARDS}
        onCollectShard={handleCollectShard}
        onToggleMute={toggleMute}
        onFinish={handleFinish}
        onProgress={handleProgress}
        onQuit={() => setScreen('title')}
        settings={settings}
        onSettings={setSettings}
      />
    );
  }

  if (screen === 'endcards') {
    const cards = activeEnding().cards;
    const next = () => {
      audio.chime(endStep % 3);
      if (endStep + 1 >= cards.length) setScreen('ward'); else setEndStep(endStep + 1);
    };
    return (
      <div className="title-screen intro-screen" onClick={next} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') next(); }}>
        <p key={endStep} className="intro-line">{cards[endStep]}</p>
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'intropanels' || screen === 'outro') {
    const intro = screen === 'intropanels';
    const list = intro ? STORY.panels.intro : STORY.panels.outro;
    const done = () => { setPanelStep(0); setScreen(intro ? 'game' : 'teaser'); };
    const adv = () => { audio.chime(panelStep % 3); if (panelStep + 1 >= list.length) done(); else setPanelStep(panelStep + 1); };
    const p = list[panelStep] as { src: string; cap: string; page?: boolean } | undefined;
    if (!p) { queueMicrotask(done); return null; }
    preloadPanel(list[panelStep + 1]?.src); preloadPanel(list[panelStep + 2]?.src);
    return (
      <div className="title-screen panel-screen" onClick={adv} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') adv(); if (e.code === 'Escape') done(); }}>
        <img key={p.src} className={p.page ? "panel-img panel-page" : "panel-img"} src={p.src} alt="" onError={adv} />
                {p.cap ? <p key={p.src + 'c'} className="panel-cap">{p.cap}</p> : null}
                <button className="panel-skip" onClick={e => { e.stopPropagation(); done(); }}>skip</button>
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'vigilcover') {
    const go = () => setScreen('ending');
    return (
      <div className="title-screen panel-screen vigilcover" onClick={() => { audio.chime(1); go(); }} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') go(); }}>
        <img className="panel-img panel-page" src="panels/vigilcover.jpg" alt="" onError={go} />
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'teaser') {
    return (
      <div className="title-screen intro-screen teaser-screen" onClick={() => { audio.chime(1); setScreen('vigilcover'); }} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') setScreen('vigilcover'); }}>
        <p className="teaser-l1">End of Part One: Lullaby</p>
        <p className="teaser-l2">Part Two: Vigil</p>
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'ward') {
    const W = STORY.ward;
    const kidName = (k: string) => (STORY.kids as Record<string, string>)[k];
    return (
      <div className="title-screen ward-screen" onClick={() => { audio.chime(1); setPanelStep(0); setScreen('outro'); }} role="button" tabIndex={0}
        onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') { setPanelStep(0); setScreen('outro'); } }}>
        <div className="ward-row">
          {W.beds.map((b, i) => {
            const counted = b.kid === STORY.counted.kid;
            return (
              <div key={b.kid} className="ward-bed" style={{ animationDelay: `${0.8 + i * 0.9}s` }}>
                <div className={counted ? 'ward-star counted' : 'ward-star'} aria-hidden="true">✦</div>
                <div className="ward-glass"><div className="ward-kid"><i /><b>z</b></div></div>
                <small>{b.bed} · {kidName(b.kid)}</small>
              </div>
            );
          })}
        </div>
        <p className="ward-line l1">{W.lines[0]}</p>
        <p className="ward-line l4">{W.lines[3]}</p>
        <small className="intro-tap">tap to continue</small>
      </div>
    );
  }

  if (screen === 'ending') {
    return (
      <div className="title-screen ending-screen">
        <div className="fog fog-1" /><div className="fog fog-2" />
        <div className="ending-inner">
          <div className="ending-glow" />
          <h1 className="ending-title">{activeEnding().title}</h1>
          <p className="ending-sub">{activeEnding().sub}</p>
          {endStats && (
            <div className="stats">
              <div className="stat"><span className="stat-label">{t.time}</span><span className="stat-val">{fmtTime(endStats.time)}</span></div>
              <div className="stat"><span className="stat-label">{t.deaths}</span><span className="stat-val">{endStats.deaths}</span></div>
              <div className="stat"><span className="stat-label">{t.memories}</span><span className="stat-val">{save.shards.length}/{TOTAL_SHARDS}</span></div>
              {save.bestTime !== null && (
                <div className="stat"><span className="stat-label">{t.best}</span><span className="stat-val">{fmtTime(save.bestTime)} · {save.bestDeaths} ✦</span></div>
              )}
            </div>
          )}
          <div className="menu">
            <button className="menu-btn" onClick={() => begin(0)}>{t.again}</button>
            <button className="menu-btn" onClick={() => { audio.ui(); setScreen('title'); }}>{t.rest}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="title-screen">
      <div className="fog fog-1" /><div className="fog fog-2" /><div className="fog fog-3" />
      <div className="title-grain" />
      <div className="title-actions">
        
        <button className="ghost-btn title-action" onClick={toggleMute} aria-label={muted ? t.soundOff : t.soundOn}>
          {muted ? '○' : '●'}
        </button>
      </div>
      {showCredits && (
        <div className="credits-overlay" onClick={() => setShowCredits(false)} role="button" tabIndex={0}>
          <div className="credits-body">
            <h2>THE STARS THAT SANK US TO SLEEP · Team Evangelion</h2>
            <p>Engine: MOTH by ahmedallam222 (MIT, github.com/ahmedallam222/moth-game)</p>
            <p>Comic pages and art: made for this jam by Team Evangelion</p>
            <h3>Music (CC0, OpenGameArt)</h3>
            <p>Tozan - Strings and Piano RPG · yd - 4 Music Box Tracks, Factory Ambiance · TinyWorlds - Narrow Corridors · NekroRave - Suspense · Rogudex - I Want to go Home · Spring Spring - Urgent! · Emma_MA - Chasing despair · Zane Little Music - Goodbye Lullaby, Day 4 · congusbongus - Abandoned Passages, Lost in a Bad Place · epb9000 - Creepy Ambient Loop · gmason - Tense Future Loop</p>
            <h3>Sound effects (CC0)</h3>
            <p>rubberduck - 100 CC0 SFX, SFX #2, Metal and Wood SFX · Spring Spring - Jay The Doggo Sound Effects · Bobjt - Gem collect SFX · artisticdude - Swishes Sound Pack · Pennywind - woman humming distant echo (Freesound)</p>
            <p className="credits-tap">tap to close</p>
          </div>
        </div>
      )}
      <main className="title-inner">
        <div className="title-eyes"><span /><span /></div>
        <div className="title-moth" aria-hidden="true"><i className="tm-wing tm-l" /><i className="tm-wing tm-r" /><i className="tm-body" /></div>
        <h1 className="game-title game-title-long">THE STARS THAT<br />SANK US TO SLEEP</h1>
        <p className="game-sub">{t.subtitle}</p>
        <div className="menu">
          <button className="menu-btn menu-primary" onClick={() => begin(0)}>{t.begin}</button>
          {save.unlocked > 0 && (
            <button className="menu-btn" onClick={() => begin(save.unlocked)}>
              {t.continue} — {t.chapter} {save.unlocked + 1}
            </button>
          )}
          <button className="menu-btn" onClick={() => { audio.ui(); setShowCredits(true); }}>credits</button>
          {installPrompt && <button className="menu-btn install-btn" onClick={install}>{t.install}</button>}
        </div>
        <div className="chapter-select" aria-label={t.chapters}>
          {LEVELS.map((level, index) => {
            const total = level.shards?.length ?? 0;
            const got = (level.shards ?? []).filter(sh => save.shards.includes(sh.id)).length;
            return (
              <button key={level.name} disabled={index > save.unlocked} onClick={() => begin(index)} className="chapter-chip">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <b>{t.chapterNames[index]}</b>
                {index <= save.unlocked && total > 0 && <i className={got === total ? 'chip-shards full' : 'chip-shards'}>✦ {got}/{total}</i>}
              </button>
            );
          })}
        </div>
        <div className="memory-progress"><i style={{ width: `${(save.shards.length / TOTAL_SHARDS) * 100}%` }} /><span>✦ {save.shards.length}/{TOTAL_SHARDS}</span></div>
        <div className="controls-hint title-controls">{(KEYS_EN && lang === 'en' ? KEYS_EN : t.controls).map(item => <span key={item}>{item}</span>)}</div>
        <p className="title-note">{t.note} · {t.chapters}</p>
      </main>
    </div>
  );
}
