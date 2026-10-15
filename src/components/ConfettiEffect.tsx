import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  scale: number;
  symbol: string;
  color: string;
}

const SYMBOLS = ['🪙', '✨', '⭐', '🎉', '💸', '💎'];
const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A8E6CF', '#FF8B94', '#6C5CE7', '#FFA502'];

interface ConfettiEffectProps {
  active: boolean;
  onDone?: () => void;
}

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ active, onDone }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    // Spawn 28 playful celebration particles from center-top
    const newParticles: Particle[] = Array.from({ length: 28 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.5;
      const speed = 120 + Math.random() * 260;
      return {
        id: i,
        x: (Math.random() - 0.5) * 160,
        y: (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150, // Initial upward pop
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 720,
        scale: 0.8 + Math.random() * 0.8,
        symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      if (onDone) onDone();
    }, 2200);

    return () => clearTimeout(timer);
  }, [active, onDone]);

  if (!active || particles.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '40%',
        left: '50%',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              x: 0,
              y: 0,
              scale: 0,
              opacity: 1,
              rotate: 0,
            }}
            animate={{
              x: p.vx * 1.4,
              y: p.vy * 1.5 + 400, // Gravity pull downward
              scale: [0, p.scale * 1.4, p.scale, 0],
              opacity: [1, 1, 0.9, 0],
              rotate: p.vRot,
            }}
            transition={{
              duration: 2,
              ease: [0.25, 1, 0.5, 1],
            }}
            style={{
              position: 'absolute',
              fontSize: '26px',
              userSelect: 'none',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
            }}
          >
            {p.symbol}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
