import { useEffect, useRef, useState } from 'react';

/** Crossfades panels: the previous one stays mounted and opaque until the next is decoded, then the new one fades in over it. */
export function PanelImg({ src, className, onError }: { src: string; className?: string; onError?: () => void }) {
  const [cur, setCur] = useState<string | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const curRef = useRef<string | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    let live = true;
    const im = new Image();
    im.src = src;
    const ok = () => {
      if (!live) return;
      setPrev(curRef.current); curRef.current = src; setCur(src);
      window.setTimeout(() => { if (live || curRef.current === src) setPrev(p => (p === curRef.current ? p : null)); }, 1300);
    };
    const bad = () => { if (live) errRef.current?.(); };
    if (typeof im.decode === 'function') im.decode().then(ok, () => (im.complete && im.naturalWidth > 0 ? ok() : bad()));
    else { im.onload = ok; im.onerror = bad; }
    return () => { live = false; };
  }, [src]);
  return (
    <>
      {prev && prev !== cur ? <img key={'p' + prev} className={className} src={prev} alt="" style={{ animation: 'none', opacity: 1 }} /> : null}
      {cur ? <img key={cur} className={className} src={cur} alt="" style={prev ? undefined : { animationDuration: '0.4s, 9s' }} /> : null}
    </>
  );
}
