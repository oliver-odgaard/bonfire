'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const CEO_AVATAR = 140;
const MGR_AVATAR = 96;
const MEM_AVATAR = 64;

const MGR_RADIUS = 420;
const CLUSTER_OFFSET = 180;
const COL_SPACING = 96;
const ROW_SPACING = 110;
const CLUSTER_COLS = 6;

const MIN_SCALE = 0.32;
const MAX_SCALE = 1.8;
const VIEW_PADDING = 100;
const FOCUS_PADDING = 80;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const BRAND = '#441306';

const TEAMS = [
  { id: 0, color: '#EF4444', name: 'Engineering', outward: { x: 0, y: -1 }, perp: { x: 1, y: 0 } },
  { id: 1, color: '#22C55E', name: 'Design', outward: { x: 1, y: 0 }, perp: { x: 0, y: 1 } },
  { id: 2, color: '#3B82F6', name: 'Sales', outward: { x: 0, y: 1 }, perp: { x: -1, y: 0 } },
  { id: 3, color: '#F59E0B', name: 'Operations', outward: { x: -1, y: 0 }, perp: { x: 0, y: -1 } },
];

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function hashId(id) {
  let h = 2166136261;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildOrg(users) {
  if (!users || users.length === 0) return null;
  const sorted = [...users].sort((a, b) => {
    if (a.id === b.id) return 0;
    return a.id > b.id ? 1 : -1;
  });
  const ceo = sorted[0];
  const managers = sorted.slice(1, 5);
  const rest = sorted.slice(5);

  const teams = TEAMS.map((t, i) => ({
    ...t,
    manager: managers[i] || null,
    members: [],
    managerPos: { x: t.outward.x * MGR_RADIUS, y: t.outward.y * MGR_RADIUS },
    memberPositions: [],
  }));

  rest.forEach((u, i) => {
    teams[i % 4].members.push(u);
  });

  teams.forEach((team) => {
    team.memberPositions = team.members.map((_, i) => {
      const col = i % CLUSTER_COLS;
      const row = Math.floor(i / CLUSTER_COLS);
      const along = CLUSTER_OFFSET + row * ROW_SPACING;
      const across = (col - (CLUSTER_COLS - 1) / 2) * COL_SPACING;
      return {
        x: team.managerPos.x + team.outward.x * along + team.perp.x * across,
        y: team.managerPos.y + team.outward.y * along + team.perp.y * across,
      };
    });
  });

  return { ceo, teams };
}

function bounds(org) {
  let minX = -CEO_AVATAR / 2;
  let maxX = CEO_AVATAR / 2;
  let minY = -CEO_AVATAR / 2;
  let maxY = CEO_AVATAR / 2;
  for (const team of org.teams) {
    const positions = [team.managerPos, ...team.memberPositions];
    for (const p of positions) {
      if (p.x - MEM_AVATAR < minX) minX = p.x - MEM_AVATAR;
      if (p.x + MEM_AVATAR > maxX) maxX = p.x + MEM_AVATAR;
      if (p.y - MEM_AVATAR < minY) minY = p.y - MEM_AVATAR;
      if (p.y + MEM_AVATAR > maxY) maxY = p.y + MEM_AVATAR;
    }
  }
  return { minX, maxX, minY, maxY };
}

function fit(b, viewW, viewH, padding) {
  const chartW = b.maxX - b.minX + padding * 2;
  const chartH = b.maxY - b.minY + padding * 2;
  const scale = Math.max(MIN_SCALE, Math.min(viewW / chartW, viewH / chartH, MAX_SCALE));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    x: viewW / 2 - cx * scale,
    y: viewH / 2 - cy * scale,
    scale,
  };
}

function Avatar({ user, size, ringColor }) {
  return user?.avatar_url ? (
    <img
      src={user.avatar_url}
      alt={user.name || ''}
      draggable={false}
      style={{ width: size, height: size, boxShadow: `0 0 0 4px ${ringColor}, 0 8px 16px rgba(0,0,0,0.08)` }}
      className="rounded-full object-cover bg-white pointer-events-none select-none"
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: ringColor,
        boxShadow: `0 0 0 4px ${ringColor}, 0 8px 16px rgba(0,0,0,0.08)`,
        fontSize: size * 0.32,
      }}
      className="rounded-full flex items-center justify-center text-white font-semibold select-none pointer-events-none"
    >
      {initials(user?.name)}
    </div>
  );
}

function Node({
  x,
  y,
  size,
  user,
  ringColor,
  label,
  sublabel,
  delay,
  dimmed,
  onClick,
}) {
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 0,
        height: 0,
        transform: shown ? 'scale(1)' : 'scale(0)',
        opacity: shown ? (dimmed ? 0.22 : 1) : 0,
        transformOrigin: 'center center',
        transition: `transform 520ms ${BOUNCE} ${delay}ms, opacity 360ms ${EASE} ${delay}ms`,
        willChange: 'transform, opacity',
        cursor: onClick ? 'pointer' : 'default',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -size / 2,
          top: -size / 2,
        }}
        className="flex flex-col items-center"
      >
        <div
          className="transition-transform duration-300 ease-out hover:scale-110"
          style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <Avatar user={user} size={size} ringColor={ringColor} />
        </div>
        <div
          style={{
            width: Math.max(size * 1.8, 110),
            marginTop: 8,
            color: BRAND,
          }}
          className="text-center pointer-events-none"
        >
          <div
            className="font-semibold leading-tight"
            style={{ fontSize: size >= 120 ? 16 : size >= 80 ? 13 : 11 }}
          >
            {label}
          </div>
          {sublabel && (
            <div
              style={{
                fontSize: size >= 120 ? 12 : 10,
                opacity: 0.65,
                marginTop: 2,
              }}
            >
              {sublabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrganizationChart({ users = [] }) {
  const viewportRef = useRef(null);
  const panRef = useRef(null);
  const draggedRef = useRef(false);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1, anim: false });
  const [focusedTeam, setFocusedTeam] = useState(null);

  const org = useMemo(() => buildOrg(users), [users]);
  const chartBounds = useMemo(() => (org ? bounds(org) : null), [org]);

  const fitAll = useCallback(() => {
    if (!org || !viewportRef.current || !chartBounds) return;
    const w = viewportRef.current.clientWidth;
    const h = viewportRef.current.clientHeight;
    const v = fit(chartBounds, w, h, VIEW_PADDING);
    setView({ ...v, anim: true });
    setFocusedTeam(null);
  }, [org, chartBounds]);

  // Initial fit, and refit on resize.
  useEffect(() => {
    if (!org || !viewportRef.current || !chartBounds) return;
    const w = viewportRef.current.clientWidth;
    const h = viewportRef.current.clientHeight;
    const v = fit(chartBounds, w, h, VIEW_PADDING);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ ...v, anim: false });
  }, [org, chartBounds]);

  useEffect(() => {
    const onResize = () => fitAll();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitAll]);

  // Wheel zoom anchored on cursor.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        if (newScale === v.scale) return v;
        const chartX = (cx - v.x) / v.scale;
        const chartY = (cy - v.y) / v.scale;
        return {
          x: cx - chartX * newScale,
          y: cy - chartY * newScale,
          scale: newScale,
          anim: false,
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: view.x,
      origY: view.y,
      moved: false,
      pointerId: e.pointerId,
    };
    draggedRef.current = false;
    viewportRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved && dx * dx + dy * dy > 25) p.moved = true;
    if (p.moved) {
      draggedRef.current = true;
      setView((v) => ({ ...v, x: p.origX + dx, y: p.origY + dy, anim: false }));
    }
  };

  const onPointerUp = (e) => {
    const p = panRef.current;
    panRef.current = null;
    try {
      viewportRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {}
    // If this was a click on the empty canvas (not on a node), reset focus.
    if (p && !p.moved && focusedTeam !== null && e.target === viewportRef.current) {
      fitAll();
    }
    // Clear drag flag after the click event has a chance to fire.
    queueMicrotask(() => {
      draggedRef.current = false;
    });
  };

  const focusTeam = (team) => {
    if (!viewportRef.current) return;
    const positions = [team.managerPos, ...team.memberPositions];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of positions) {
      if (p.x - MEM_AVATAR < minX) minX = p.x - MEM_AVATAR;
      if (p.x + MEM_AVATAR > maxX) maxX = p.x + MEM_AVATAR;
      if (p.y - MEM_AVATAR < minY) minY = p.y - MEM_AVATAR;
      if (p.y + MEM_AVATAR > maxY) maxY = p.y + MEM_AVATAR;
    }
    const w = viewportRef.current.clientWidth;
    const h = viewportRef.current.clientHeight;
    const v = fit({ minX, maxX, minY, maxY }, w, h, FOCUS_PADDING);
    setView({ ...v, anim: true });
    setFocusedTeam(team.id);
  };

  if (!org) {
    return <div className="absolute inset-0" />;
  }

  const teams = org.teams;

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-0 overflow-hidden"
      style={{
        cursor: panRef.current?.moved ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          transition: view.anim ? `transform 620ms ${EASE}` : 'none',
          willChange: 'transform',
        }}
      >
        <svg
          width="0"
          height="0"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {teams.map((team) => {
            const dim = focusedTeam !== null && focusedTeam !== team.id;
            const opacity = dim ? 0.12 : 0.85;
            return (
              <g key={team.id} style={{ transition: `opacity 480ms ${EASE}` }} opacity={opacity}>
                <line
                  x1={0}
                  y1={0}
                  x2={team.managerPos.x}
                  y2={team.managerPos.y}
                  stroke={team.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                {team.memberPositions.map((p, i) => (
                  <line
                    key={i}
                    x1={team.managerPos.x}
                    y1={team.managerPos.y}
                    x2={p.x}
                    y2={p.y}
                    stroke={team.color}
                    strokeWidth={1.5}
                    strokeDasharray="6 6"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
        </svg>

        <Node
          x={0}
          y={0}
          size={CEO_AVATAR}
          user={org.ceo}
          ringColor={BRAND}
          label={org.ceo?.name || 'Unknown'}
          sublabel="CEO"
          delay={0}
          dimmed={false}
          onClick={(e) => {
            if (draggedRef.current) return;
            e.stopPropagation();
            fitAll();
          }}
        />

        {teams.map((team) => {
          const isDim = focusedTeam !== null && focusedTeam !== team.id;
          const mgrJitter = (hashId(team.manager?.id) % 80);
          return (
            <div key={team.id}>
              <Node
                x={team.managerPos.x}
                y={team.managerPos.y}
                size={MGR_AVATAR}
                user={team.manager}
                ringColor={team.color}
                label={team.manager?.name || `Manager ${team.id + 1}`}
                sublabel={`Head of ${team.name}`}
                delay={140 + mgrJitter}
                dimmed={isDim}
                onClick={(e) => {
                  if (draggedRef.current) return;
                  e.stopPropagation();
                  focusTeam(team);
                }}
              />
              {team.members.map((m, i) => {
                const pos = team.memberPositions[i];
                const jitter = (hashId(m.id) % 200);
                return (
                  <Node
                    key={m.id}
                    x={pos.x}
                    y={pos.y}
                    size={MEM_AVATAR}
                    user={m}
                    ringColor={team.color}
                    label={m.name || 'Unknown'}
                    delay={260 + i * 12 + jitter}
                    dimmed={isDim}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
