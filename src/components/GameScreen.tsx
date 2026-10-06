import { STORY, KID_NAMES } from '../story';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Game } from '../game/engine';
import { music } from '../game/music';
import { audio } from '../game/audio';
import { VIEW_W, VIEW_H, clamp } from '../game/types';
import type { GameSettings } from '../game/types';
import type { GameLanguage } from '../App';

interface Props {
  startLevel: number;
  onFinish: (deaths: number, time: number) => void;
  onQuit: () => void;
  onProgress: (levelIndex: number) => void;
  onCollectShard: (id: string) => void;
  muted: boolean;
  onToggleMute: () => void;
  collectedShards: string[];
  totalShards: number;
  lang: GameLanguage;
  settings: GameSettings;
  onSettings: (s: GameSettings) => void;
}

interface Intro { chapter: string; name: string; key: number; index: number }

const UI = {
  ar: {
    paused: 'متوقف مؤقتًا', resume: 'متابعة', restart: 'إعادة الفصل', quit: 'مغادرة الرحلة',
    rotate: 'أدر هاتفك', rotateSub: 'صُممت الرحلة للوضع الأفقي', jump: 'قفز', interact: 'تفاعل',
    move: 'حرّك', soundOn: 'تشغيل الصوت', soundOff: 'كتم الصوت', fullscreen: 'ملء الشاشة',
    controls: ['العصا للحركة', 'القفز', 'التفاعل', 'R لإعادة الفصل'],
    chapters: ['الفصل الأول · الغابة', 'الفصل الثاني · الآلة', 'الفصل الثالث · الأعماق', 'الفصل الرابع · الأطلال', 'الفصل الخامس · الصعود'],
    settings: 'الإعدادات', quality: 'الجودة', qAuto: 'تلقائي', qHigh: 'مرتفعة', qLow: 'اقتصادية',
    shake: 'اهتزاز الكاميرا', grain: 'حبيبات الفيلم', contrast: 'تباين أعلى', ghost: 'صدى أفضل جولة',
    touchSize: 'حجم الأزرار', touchOpacity: 'شفافية الأزرار', back: 'رجوع', debug: 'وضع التصحيح',
  },
  en: {
    paused: 'paused', resume: 'continue', restart: 'restart chapter', quit: 'abandon',
    rotate: 'rotate your phone', rotateSub: 'this journey is made for landscape', jump: 'jump', interact: 'interact',
    move: 'move', soundOn: 'sound on', soundOff: 'sound off', fullscreen: 'fullscreen',
    controls: ['stick to move', 'jump', 'interact', 'R to restart'],
    chapters: ['chapter i · the dormitory garden', 'chapter ii · the boiler house', 'chapter iii · the flooded cellar', 'chapter iv · the old wing', 'chapter v · the star gate'],
    settings: 'settings', quality: 'quality', qAuto: 'auto', qHigh: 'high', qLow: 'saver',
    shake: 'camera shake', grain: 'film grain', contrast: 'high contrast', ghost: 'best-run echo',
    touchSize: 'button size', touchOpacity: 'button opacity', back: 'back', debug: 'debug mode',
  },
} as const;

function vibrate(ms = 8) {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

const SHOWN_PAGES = new Set<number>();

export default function GameScreen({
  startLevel, onFinish, onQuit, onProgress, onCollectShard, muted, onToggleMute,
  collectedShards, totalShards, lang, settings, onSettings,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const [stickX, setStickX] = useState(0);
  const [intro, setIntro] = useState<Intro | null>(null);
  const [paused, setPaused] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [pageStep, setPageStep] = useState(0);
  const page = pages[pageStep] ? `panels/${pages[pageStep]}.jpg` : null;
  const pageIdx = useRef(0);
  const [showSettings, setShowSettings] = useState(false);
  const [deaths, setDeaths] = useState(0);
  const [chapterIndex, setChapterIndex] = useState(startLevel);
  const [kid, setKid] = useState(0);
  const [kidNote, setKidNote] = useState('');
  const [shardCount, setShardCount] = useState(collectedShards.length);
  const [portrait, setPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const copy = UI[lang];
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // adaptive resolution: start LOW and earn higher DPR with sustained fps.
  // (v1.1 started at 2x, which drowned weak phones in fill-rate work.)
  const adaptiveDpr = useRef(1);
  const dprLocked = useRef(false); // after stepping down, never step back up (no oscillation)
  const goodStreak = useRef(0);
  const lastFitKey = useRef('');
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('moth-dpr-cap'));
      if (saved >= 1 && saved <= 2) adaptiveDpr.current = Math.min(saved, 1.25); // resume cautiously
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (new URLSearchParams(window.location.search).has('debug'))
      onSettings({ ...settingsRef.current, debug: true });
    const fit = () => {
      const q = settingsRef.current.quality;
      const baseDpr = window.devicePixelRatio || 1;
      const dpr = q === 'low' ? 1 : q === 'high' ? Math.min(baseDpr, 2) : Math.min(baseDpr, adaptiveDpr.current);
      const viewport = window.visualViewport;
      const aw = viewport?.width ?? window.innerWidth;
      const ah = viewport?.height ?? window.innerHeight;
      const scale = Math.min(aw / VIEW_W, ah / VIEW_H);
      canvas.style.width = `${VIEW_W * scale}px`;
      canvas.style.height = `${VIEW_H * scale}px`;
      const bw = Math.round(VIEW_W * dpr), bh = Math.round(VIEW_H * dpr);
      const key = `${bw}x${bh}`;
      if (key !== lastFitKey.current) { // resizing the backing store clears it — skip no-ops
        lastFitKey.current = key;
        canvas.width = bw;
        canvas.height = bh;
      }
      setPortrait(matchMedia('(pointer: coarse)').matches && ah > aw);
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);

    const game = new Game(canvas, {
      onIntro: (chapter, name, index) => {
        setIntro({ chapter, name, key: index + Date.now(), index });
        setChapterIndex(index);
        onProgress(index);
        // wordless comic page before each chapter, once per page load; skipped for QA/debug URLs
        const src = STORY.panels.chapter[index];
        if (src && src.length && !SHOWN_PAGES.has(index) && !/[?&](debug|qa)=/.test(location.search)) {
          SHOWN_PAGES.add(index);
          pageIdx.current = index;
          setTimeout(() => { gameRef.current?.setPaused(true); setPages(src); setPageStep(0); music.play('page' + 'ABCD'[index - 1]); }, 0);
        }
      },
      onFinish,
      onDeaths: setDeaths,
      onPause: setPaused,
      onMute: onToggleMute,
      onShard: (id, count) => {
        setShardCount(count);
        onCollectShard(id);
        vibrate(22);
      },
      onChar: (i, denied) => {
        if (denied) {
          setKidNote(i === 1 ? `too heavy for the small ones. ${STORY.kids.bram} could.` : 'no room to change here.');
          window.setTimeout(() => setKidNote(''), 2600);
          return;
        }
        setKid(i); setKidNote('');
      },
      onFps: (avg) => {
        // adaptive quality inside auto mode: step down instantly when slow,
        // step up only after 3 consecutive fast seconds, and never re-raise
        // after a drop (stops the resize<->fps oscillation loop)
        if (settingsRef.current.quality !== 'auto') return;
        if (avg < 47 && adaptiveDpr.current > 1) {
          adaptiveDpr.current = adaptiveDpr.current > 1.4 ? 1.25 : 1;
          dprLocked.current = true;
          goodStreak.current = 0;
          try { localStorage.setItem('moth-dpr-cap', String(adaptiveDpr.current)); } catch { /* ignore */ }
          fit();
        } else if (avg > 57 && !dprLocked.current && adaptiveDpr.current < 2) {
          goodStreak.current++;
          if (goodStreak.current >= 3) {
            adaptiveDpr.current = adaptiveDpr.current < 1.4 ? 1.5 : 2;
            goodStreak.current = 0;
            try { localStorage.setItem('moth-dpr-cap', String(adaptiveDpr.current)); } catch { /* ignore */ }
            fit();
          }
        } else goodStreak.current = 0;
      },
    }, collectedShards, settingsRef.current);
    gameRef.current = game;
    if ((new URLSearchParams(window.location.search).has('debug') || new URLSearchParams(window.location.search).has('qa')))
      (window as unknown as { __moth: Game }).__moth = game; // QA hook
    game.startGame(startLevel);

    const visibility = () => {
      if (document.hidden) {
        audio.suspend();
        if (!game.paused) {
          game.setPaused(true);
          setPaused(true);
        }
      } else if (!muted) audio.resume();
    };
    document.addEventListener('visibilitychange', visibility);
    const fullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fullscreenChange);

    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreenChange);
      game.destroy();
      gameRef.current = null;
    };
  }, []); // the game owns its lifecycle for this screen

  // live-push settings & language into the engine
  useEffect(() => {
    gameRef.current?.setSettings(settings);
    window.dispatchEvent(new Event('resize'));
  }, [settings]);
  useEffect(() => {
    gameRef.current?.setLanguage(lang);
  }, [lang]);

  // keep the screen awake while playing (mobile)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const wl = (navigator as unknown as {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        lock = (await wl?.request('screen')) ?? null;
      } catch { lock = null; }
    };
    void request();
    const onVis = () => { if (!document.hidden) void request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { void lock?.release(); } catch { /* */ }
    };
  }, []);

  const resume = useCallback(() => {
    gameRef.current?.setPaused(false);
    setPaused(false);
    setShowSettings(false);
    audio.ui();
  }, []);

  const restart = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    audio.ui();
    game.setPaused(false);
    setPaused(false);
    setShowSettings(false);
    setDeaths(0);
    game.startGame(chapterIndex);
  }, [chapterIndex]);

  const quit = useCallback(() => {
    audio.ui();
    onQuit();
  }, [onQuit]);

  const updateStick = (clientX: number) => {
    const rect = stickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const axis = clamp((clientX - (rect.left + rect.width / 2)) / (rect.width * 0.34), -1, 1);
    setStickX(axis);
    gameRef.current?.setMoveAxis(axis);
  };

  const stickDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    stickPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateStick(event.clientX);
    vibrate();
  };
  const stickMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointer.current === event.pointerId) updateStick(event.clientX);
  };
  const stickUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== event.pointerId) return;
    stickPointer.current = null;
    setStickX(0);
    gameRef.current?.setMoveAxis(0);
  };

  const bindAction = (action: 'jump' | 'interact') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gameRef.current?.setTouchAction(action, true);
      vibrate(action === 'jump' ? 10 : 16);
    },
    onPointerUp: () => gameRef.current?.setTouchAction(action, false),
    onPointerCancel: () => gameRef.current?.setTouchAction(action, false),
    onLostPointerCapture: () => gameRef.current?.setTouchAction(action, false),
  });

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // landscape lock where supported (Android fullscreen)
        try {
          await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        } catch { /* iOS & some browsers refuse — fine */ }
      }
    } catch { /* unsupported on some iOS versions */ }
  };

  const touchVars = {
    '--touch-scale': settings.touchSize,
    '--touch-opacity': settings.touchOpacity,
  } as React.CSSProperties;

  const nextPage = () => { if (pageStep + 1 < pages.length) setPageStep(pageStep + 1); else closePage(); };
  const closePage = () => { setPages([]); setPageStep(0); music.play('ch' + (pageIdx.current + 1)); gameRef.current?.setPaused(false); setPaused(false); };

  return (
    <div className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="game world" />

      {page && (
        <div className="panel-screen chapter-page" style={{ position: 'absolute', inset: 0, zIndex: 60 }} role="button" tabIndex={0}
          onClick={nextPage} onKeyDown={e => { if (e.code === 'Escape') closePage(); else if (e.code === 'Enter' || e.code === 'Space') nextPage(); }}>
          <img key={page} className="panel-img panel-page" src={page} alt="" onError={nextPage} />
          <button className="panel-skip" onClick={e => { e.stopPropagation(); closePage(); }}>skip</button>
          <small className="intro-tap" style={{ zIndex: 4 }}>tap to continue</small>
        </div>
      )}

      {intro && (
        <div key={intro.key} className="intro-card" onAnimationEnd={() => setIntro(null)}>
          <div className="intro-chapter">{copy.chapters[intro.index] ?? intro.chapter}</div>
          <div className="intro-name">{intro.name}</div>
        </div>
      )}

      <div className="game-topbar">
        <div className="topbar-group">
          <button className="ghost-btn icon-btn" onClick={() => { gameRef.current?.setPaused(true); setPaused(true); }} aria-label={copy.paused}>
            <span className="pause-icon" />
          </button>
          <button className="ghost-btn icon-btn fullscreen-btn" onClick={toggleFullscreen} aria-label={copy.fullscreen}>
            {isFullscreen ? '⌟⌜' : '⌜⌟'}
          </button>
        </div>
        <div className="run-status"><span>✦ {shardCount}/{totalShards}</span><span>† {deaths}</span><span>{chapterIndex + 1}/5</span></div>
        <button className="ghost-btn sound-btn" onClick={onToggleMute} aria-label={muted ? copy.soundOn : copy.soundOff}>
          {muted ? '○' : '●'} <span>{muted ? copy.soundOff : copy.soundOn}</span>
        </button>
      </div>

      {paused && (
        <div className="overlay">
          <div className="overlay-inner">
            <div className="overlay-eyes"><i /><i /></div>
            <h2 className="overlay-title">{showSettings ? copy.settings : copy.paused}</h2>
            {showSettings ? (
              <div className="settings-panel">
                <div className="setting-row">
                  <span>{copy.quality}</span>
                  <div className="seg">
                    {(['auto', 'high', 'low'] as const).map(q => (
                      <button key={q} className={settings.quality === q ? 'seg-btn on' : 'seg-btn'}
                        onClick={() => { audio.ui(); onSettings({ ...settings, quality: q }); }}>
                        {q === 'auto' ? copy.qAuto : q === 'high' ? copy.qHigh : copy.qLow}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span>{copy.shake}</span>
                  <button className={settings.shake ? 'toggle on' : 'toggle'}
                    onClick={() => { audio.ui(); onSettings({ ...settings, shake: !settings.shake }); }}><i /></button>
                </div>
                <div className="setting-row">
                  <span>{copy.grain}</span>
                  <button className={settings.grain ? 'toggle on' : 'toggle'}
                    onClick={() => { audio.ui(); onSettings({ ...settings, grain: !settings.grain }); }}><i /></button>
                </div>
                <div className="setting-row">
                  <span>{copy.contrast}</span>
                  <button className={settings.contrast ? 'toggle on' : 'toggle'}
                    onClick={() => { audio.ui(); onSettings({ ...settings, contrast: !settings.contrast }); }}><i /></button>
                </div>
                <div className="setting-row">
                  <span>{copy.touchSize}</span>
                  <input type="range" min="0.8" max="1.35" step="0.05" value={settings.touchSize}
                    onChange={e => onSettings({ ...settings, touchSize: Number(e.target.value) })} />
                </div>
                <div className="setting-row">
                  <span>{copy.touchOpacity}</span>
                  <input type="range" min="0.45" max="1" step="0.05" value={settings.touchOpacity}
                    onChange={e => onSettings({ ...settings, touchOpacity: Number(e.target.value) })} />
                </div>
                <div className="setting-row">
                  <span>{copy.ghost}</span>
                  <button className={settings.ghost ? 'toggle on' : 'toggle'}
                    onClick={() => { audio.ui(); onSettings({ ...settings, ghost: !settings.ghost }); }}><i /></button>
                </div>
                <div className="setting-row">
                  <span>{copy.debug}</span>
                  <button className={settings.debug ? 'toggle on' : 'toggle'}
                    onClick={() => { audio.ui(); onSettings({ ...settings, debug: !settings.debug }); }}><i /></button>
                </div>
                <button className="menu-btn menu-primary" onClick={() => { audio.ui(); setShowSettings(false); }}>{copy.back}</button>
              </div>
            ) : (
              <>
                <button className="menu-btn menu-primary" onClick={resume}>{copy.resume}</button>
                <button className="menu-btn" onClick={restart}>{copy.restart}</button>
                <button className="menu-btn" onClick={() => { audio.ui(); setShowSettings(true); }}>{copy.settings}</button>
                <button className="menu-btn" onClick={quit}>{copy.quit}</button>
                <div className="controls-hint">{copy.controls.map(item => <span key={item}>{item}</span>)}</div>
              </>
            )}
          </div>
        </div>
      )}

      {portrait && (
        <div className="rotate-overlay">
          <div className="phone-rotate" />
          <strong>{copy.rotate}</strong>
          <span>{copy.rotateSub}</span>
          <button className="ghost-btn" onClick={toggleFullscreen}>{copy.fullscreen}</button>
        </div>
      )}

      <div className="kid-bar" aria-label="who leads">
        {KID_NAMES.map((n, i) => (
          <button key={n} className={'kid-btn' + (kid === i ? ' on' : '')} onPointerDown={(e) => { e.preventDefault(); gameRef.current?.switchKid(i); }}>
            <b>{i + 1}</b> {n}
          </button>
        ))}
      </div>
      {kidNote && <div className="kid-note">{kidNote}</div>}
      <div className="touch-ui" aria-label="touch controls" style={touchVars}>
        <div
          ref={stickRef}
          className="move-stick"
          onPointerDown={stickDown}
          onPointerMove={stickMove}
          onPointerUp={stickUp}
          onPointerCancel={stickUp}
          aria-label={copy.move}
        >
          <span className="stick-track" />
          <span className="stick-knob" style={{ transform: `translate3d(${stickX * 34}px, 0, 0)` }} />
          <small>{copy.move}</small>
        </div>
        <div className="touch-actions">
          <button className="touch-btn touch-e" {...bindAction('interact')} aria-label={copy.interact}><b>◇</b><small>{copy.interact}</small></button>
          <button className="touch-btn touch-jump" {...bindAction('jump')} aria-label={copy.jump}><b>↑</b><small>{copy.jump}</small></button>
        </div>
      </div>
    </div>
  );
}
