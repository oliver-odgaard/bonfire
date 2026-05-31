'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ThiingsGrid from '../../lib/ThiingsGrid';

const GRID_SIZE = 240;
const CARD_SIZE = 200;
const EDGE_ZONE = 500;
const EDGE_MAX_SPEED = 5;

const COLORS = [
  '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#34D399',
  '#22D3EE', '#60A5FA', '#A78BFA', '#F472B6', '#FB7185',
  '#FACC15', '#4ADE80', '#2DD4BF', '#818CF8', '#C084FC',
];

// Deterministic-ish "started X ago" string per user id, so each colleague
// has a stable made-up start date that varies across the team.
const TENURE_BUCKETS = [
  '2 weeks ago', '1 month ago', '2 months ago', '3 months ago',
  '5 months ago', '6 months ago', '8 months ago', '10 months ago',
  '1 year ago', '1.5 years ago', '2 years ago', '3 years ago',
  '4 years ago', '6 years ago', '8 years ago',
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tenureFor(id) {
  const h = hashString(String(id ?? ''));
  return TENURE_BUCKETS[h % TENURE_BUCKETS.length];
}

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Card({ colleague, color }) {
  const [shown, setShown] = useState(false);
  const [delay, setDelay] = useState(0);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDelay(Math.random() * 1000);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        transform: shown ? 'scale(1)' : 'scale(0)',
        opacity: shown ? 1 : 0,
        transition: `transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms, opacity 260ms ease-out ${delay}ms`,
        willChange: 'transform, opacity',
      }}
    >
      <div className="relative w-full h-full rounded-2xl bg-white shadow-md hover:scale-105 transition-transform duration-300 ease-out cursor-pointer flex flex-col items-center justify-center p-5 gap-3">
        {colleague.avatar_url ? (
          <img
            src={colleague.avatar_url}
            alt={colleague.name || ''}
            draggable={false}
            className="w-20 h-20 rounded-full object-cover bg-gray-100 shadow-sm select-none pointer-events-none"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-semibold text-2xl shadow-sm select-none"
            style={{ backgroundColor: color }}
          >
            {initials(colleague.name)}
          </div>
        )}
        <div className="text-center">
          <div className="text-base font-semibold text-gray-900 leading-tight">
            {colleague.name || 'Unknown'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Joined {colleague.started}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ColleaguesGrid({ users = [] }) {
  const gridRef = useRef(null);

  const colleagues = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: u.name,
        avatar_url: u.avatar_url,
        started: tenureFor(u.id),
      })),
    [users]
  );

  useEffect(() => {
    let mouseX = -1;
    let mouseY = -1;
    let inWindow = false;
    let raf = 0;

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      inWindow = true;
    };
    const onLeave = () => {
      inWindow = false;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!inWindow || !gridRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      let dx = 0;
      let dy = 0;
      if (mouseX < EDGE_ZONE) {
        dx = ((EDGE_ZONE - mouseX) / EDGE_ZONE) * EDGE_MAX_SPEED;
      } else if (mouseX > w - EDGE_ZONE) {
        dx = -((mouseX - (w - EDGE_ZONE)) / EDGE_ZONE) * EDGE_MAX_SPEED;
      }
      if (mouseY < EDGE_ZONE) {
        dy = ((EDGE_ZONE - mouseY) / EDGE_ZONE) * EDGE_MAX_SPEED;
      } else if (mouseY > h - EDGE_ZONE) {
        dy = -((mouseY - (h - EDGE_ZONE)) / EDGE_ZONE) * EDGE_MAX_SPEED;
      }
      if (dx !== 0 || dy !== 0) {
        gridRef.current.publicPanBy({ x: dx, y: dy });
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const renderItem = ({ position }) => {
    if (colleagues.length === 0) return null;
    const len = colleagues.length;
    const raw = position.x * 7 + position.y * 13;
    const idx = ((raw % len) + len) % len;
    const colleague = colleagues[idx];
    const color = COLORS[idx % COLORS.length];
    return <Card colleague={colleague} color={color} />;
  };

  return <ThiingsGrid ref={gridRef} gridSize={GRID_SIZE} renderItem={renderItem} />;
}
