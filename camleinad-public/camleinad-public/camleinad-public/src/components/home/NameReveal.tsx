import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

const ORIGINAL_NAME = 'DANIEL MAC';
const ARTIST_NAME = 'CAM LEINAD';
const LETTERS = Math.max(ORIGINAL_NAME.length, ARTIST_NAME.length);

function NameLetters({ text, visible, outline, reduceMotion }: { text: string; visible: boolean; outline: boolean; reduceMotion: boolean }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center whitespace-pre" aria-hidden="true">
      {Array.from(text).map((letter, index) => (
        <motion.span
          key={`${text}-${index}`}
          initial={false}
          animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: outline ? -24 : 24 }}
          transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index * 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
          style={{
            color: outline ? 'transparent' : 'var(--ink)',
            WebkitTextStroke: outline ? '1px var(--ink)' : '0px transparent',
          }}
        >
          {letter === ' ' ? '\u00a0' : letter}
        </motion.span>
      ))}
    </span>
  );
}

export default function NameReveal() {
  const reduceMotion = useReducedMotion();
  const [transformed, setTransformed] = useState(Boolean(reduceMotion));
  const [captionVisible, setCaptionVisible] = useState(Boolean(reduceMotion));
  const completedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const captionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      setTransformed(true);
      setCaptionVisible(true);
      return;
    }
    timerRef.current = window.setTimeout(beginTransformation, 2000);
    window.addEventListener('scroll', handleFirstScroll, { passive: true, once: true });
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (captionTimerRef.current !== null) window.clearTimeout(captionTimerRef.current);
      window.removeEventListener('scroll', handleFirstScroll);
    };
  }, [reduceMotion]);

  function beginTransformation() {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setTransformed(true);
    captionTimerRef.current = window.setTimeout(() => setCaptionVisible(true), (LETTERS - 1) * 200 + 450);
  }

  function handleFirstScroll() {
    beginTransformation();
  }

  return (
    <section aria-label="Daniel Mac becomes Cam Leinad" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[var(--base)] px-3 text-center">
      <div className="relative h-[1.25em] w-full max-w-full scale-x-[0.82] font-display text-[clamp(48px,12vw,160px)] leading-none" style={{ letterSpacing: '0.2em' }} aria-label={transformed || reduceMotion ? ARTIST_NAME : ORIGINAL_NAME}>
        <NameLetters text={ORIGINAL_NAME} visible={!transformed && !reduceMotion} outline reduceMotion={Boolean(reduceMotion)} />
        <NameLetters text={ARTIST_NAME} visible={transformed || Boolean(reduceMotion)} outline={false} reduceMotion={Boolean(reduceMotion)} />
      </div>
      <p className="absolute bottom-[18%] min-h-6 px-4 text-xs tracking-[0.08em] text-[var(--ink-muted)] sm:text-sm" aria-live="polite" style={{ opacity: captionVisible || reduceMotion ? 1 : 0, transition: reduceMotion ? 'none' : 'opacity 400ms ease' }}>
        The name backwards. The artist forwards.
      </p>
      <motion.div
        aria-hidden="true"
        className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[var(--ink-muted)]"
        animate={reduceMotion ? undefined : { y: [0, 6, 0], opacity: [0.45, 0.85, 0.45] }}
        transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ArrowDown className="h-5 w-5" />
      </motion.div>
    </section>
  );
}
