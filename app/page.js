'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { supabase } from '../lib/supabase';
import { authClient } from '../lib/auth-client';
import { CURRENT_COMPANY } from '../lib/company';
import ThiingsGrid from '../lib/ThiingsGrid';
import Header from './components/Header';
import ColleaguesGrid from './components/ColleaguesGrid';
import OrganizationChart from './components/OrganizationChart';

const GRID_SIZE = 208;
const IMAGE_SIZE = 160;

const EDGE_ZONE = 500; // px from edge that triggers auto-pan
const EDGE_MAX_SPEED = 5; // px/frame at the very edge

function Cell({ interest, color, icon, onClick }) {
  const [shown, setShown] = useState(false);
  const [delay, setDelay] = useState(0); // per-cell stagger, set on mount

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDelay(Math.random() * 1000);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const owner = interest.owner;

  return (
    <div
      style={{
        width: IMAGE_SIZE,
        height: IMAGE_SIZE,
        transform: shown ? 'scale(1)' : 'scale(0)',
        opacity: shown ? 1 : 0,
        transition: `transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms, opacity 260ms ease-out ${delay}ms`,
        willChange: 'transform, opacity',
      }}
    >
      <div
        onClick={onClick}
        className="relative w-full h-full rounded-lg overflow-hidden hover:scale-110 transition-transform duration-300 ease-out cursor-pointer"
      >
        <div
          className={`w-full h-full ${interest.image_url ? '' : color} flex items-center justify-center`}
        >
          {interest.image_url ? (
            <img
              src={interest.image_url}
              alt={interest.name || interest.title || ''}
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <span className="text-4xl text-white/90 select-none">{icon}</span>
          )}
        </div>

        {owner?.avatar_url && (
          <img
            src={owner.avatar_url}
            alt={owner.name || ''}
            title={owner.name || ''}
            draggable={false}
            className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full object-cover bg-white ring-2 ring-white pointer-events-none"
          />
        )}
      </div>
    </div>
  );
}

const colorPalette = [
  'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-yellow-400', 'bg-orange-500',
  'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-cyan-500',
  'bg-lime-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500',
  'bg-slate-500', 'bg-gray-500', 'bg-blue-400', 'bg-green-400', 'bg-purple-400'
];

const iconOptions = [
  '🎨', '⚡', '🎭', '⚪', '💼', '✨', '💬', '◉', '▣', '▥',
  '▦', '☰', '◈', '🎯', '⌨', '⬢', '📖', '🔄', '🛟', '💡',
  '🚀', '🌟', '🎪', '🎸', '📱', '💻', '🎮', '📸', '🏆', '🎲'
];

export default function Home() {
  const [interests, setInterests] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('interests');
  const { data: activeOrg } = authClient.useActiveOrganization();
  const activeCompany = activeOrg?.slug || CURRENT_COMPANY;
  const gridRef = useRef(null);
  const isModalOpenRef = useRef(false);
  const pointerDownRef = useRef(null);

  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
  }, [isModalOpen]);

  const fetchInterests = useCallback(async () => {
    const { data, error } = await supabase
      .from('interests')
      .select('*, owner:users!inner(id, name, avatar_url, company)')
      .eq('owner.company', activeCompany)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching interests:', error);
      return;
    }

    const withImages = await Promise.all((data || []).map(async (interest) => {
      if (interest.image_path) {
        const { data: urlData } = supabase.storage
          .from('Bonfire images')
          .getPublicUrl(interest.image_path);
        return { ...interest, image_url: urlData.publicUrl };
      }
      return interest;
    }));

    // Round-robin interleave by owner so a single user's interests
    // never sit next to each other on the grid.
    const groups = new Map();
    for (const it of withImages) {
      const uid = it.owner?.id ?? 0;
      if (!groups.has(uid)) groups.set(uid, []);
      groups.get(uid).push(it);
    }
    const queues = [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, list]) => list);
    const interleaved = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const q of queues) {
        if (q.length > 0) {
          interleaved.push(q.shift());
          progress = true;
        }
      }
    }

    setInterests(interleaved);
  }, [activeCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInterests();

    const channel = supabase
      .channel('interests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interests' },
        () => fetchInterests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInterests]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar_url, company')
        .eq('company', activeCompany)
        .order('id', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Error fetching users:', error);
        return;
      }
      setUsers(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompany]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedItem(null), 400);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isModalOpen, closeModal]);

  // Track pointer-down position so we can tell a click from a drag.
  // Auto-pan moves the grid even when the user is stationary, so we
  // can't rely on the grid's own isMoving flag to suppress clicks.
  useEffect(() => {
    const onDown = (e) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      // Cleared in a microtask so onClick fires first.
      queueMicrotask(() => {
        pointerDownRef.current = null;
      });
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Cursor-edge auto-pan: when the mouse approaches a viewport edge,
  // the grid pans toward whatever's off-screen on that side.
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
      if (!inWindow || isModalOpenRef.current || !gridRef.current) return;

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

  const handleItemClick = (item) => {
    // Mount in closed state first; the effect below flips to open on
    // the next frame so the CSS transition has a "from" to animate.
    setSelectedItem(item);
  };

  // Flip to open after the closed state has painted, so transitions fire.
  useEffect(() => {
    if (!selectedItem) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsModalOpen(true));
    });
    return () => cancelAnimationFrame(id);
  }, [selectedItem]);

  const renderItem = ({ gridIndex, position }) => {
    if (interests.length === 0) return null;
    // Use 2D coords with primes coprime to interests.length so no
    // 8-directional neighbor ever lands on the same interest.
    const len = interests.length;
    const raw = position.x * 7 + position.y * 13;
    const idx = ((raw % len) + len) % len;
    const interest = interests[idx];
    const colorIndex = (interest.id ?? gridIndex) % colorPalette.length;
    const iconIndex = (interest.id ?? gridIndex) % iconOptions.length;
    const color = colorPalette[colorIndex];
    const icon = iconOptions[iconIndex];

    const item = {
      id: interest.id,
      title: interest.name || interest.title || `Interest ${gridIndex + 1}`,
      type: interest.type || 'interest',
      color,
      icon,
      originalData: interest,
    };

    return (
      <Cell
        interest={interest}
        color={color}
        icon={icon}
        onClick={(e) => {
          const start = pointerDownRef.current;
          if (start) {
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (dx * dx + dy * dy > 25) return; // user dragged, not clicked
          }
          e.stopPropagation();
          handleItemClick(item);
        }}
      />
    );
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden relative"
      style={{ backgroundColor: '#FFF7ED' }}
    >
      {activeView === 'colleagues' ? (
        <ColleaguesGrid users={users} />
      ) : activeView === 'organization' ? (
        <OrganizationChart users={users} />
      ) : (
        <ThiingsGrid ref={gridRef} gridSize={GRID_SIZE} renderItem={renderItem} />
      )}

      <Header
        active={activeView}
        onActiveChange={setActiveView}
        colleaguesCount={users.length}
      />

      {selectedItem && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${
            isModalOpen ? 'visible' : 'invisible'
          }`}
          style={{
            transition: isModalOpen ? 'none' : 'visibility 0s linear 320ms',
          }}
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
            style={{
              opacity: isModalOpen ? 1 : 0,
              backdropFilter: isModalOpen ? 'blur(8px)' : 'blur(0px)',
              WebkitBackdropFilter: isModalOpen ? 'blur(8px)' : 'blur(0px)',
              transition:
                'opacity 280ms cubic-bezier(0.22, 1, 0.36, 1), backdrop-filter 280ms cubic-bezier(0.22, 1, 0.36, 1), -webkit-backdrop-filter 280ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />

          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4"
            style={{
              opacity: isModalOpen ? 1 : 0,
              transform: isModalOpen ? 'scale(1)' : 'scale(0.88)',
              transition:
                'opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'transform, opacity',
            }}
          >
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
              aria-label="Close"
            >
              ✕
            </button>

            <div
              className={`modal-stagger modal-stagger-1 ${
                isModalOpen ? 'modal-stagger-open' : ''
              } p-6 pb-4`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedItem.color} text-white font-semibold shadow-lg`}
                >
                  {selectedItem.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedItem.title}
                  </h2>
                  <p className="text-sm text-gray-500 capitalize">
                    {selectedItem.type}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <div
                className={`modal-stagger modal-stagger-2 ${
                  isModalOpen ? 'modal-stagger-open' : ''
                } mb-6`}
              >
                <div
                  className={`w-full h-48 rounded-lg shadow-sm ${
                    selectedItem.originalData?.image_url ? 'bg-gray-100' : selectedItem.color
                  } flex items-center justify-center overflow-hidden`}
                >
                  {selectedItem.originalData?.image_url ? (
                    <img
                      src={selectedItem.originalData.image_url}
                      alt={selectedItem.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-6xl text-white/80">{selectedItem.icon}</span>
                  )}
                </div>
              </div>

              <div
                className={`modal-stagger modal-stagger-3 ${
                  isModalOpen ? 'modal-stagger-open' : ''
                } space-y-4`}
              >
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {selectedItem.originalData?.description ||
                      selectedItem.originalData?.details ||
                      `Learn more about ${selectedItem.title} and explore related topics.`}
                  </p>

                  {selectedItem.originalData && (
                    <div className="mt-4 space-y-2">
                      {selectedItem.originalData.category && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Category: </span>
                          <span className="text-gray-600">
                            {selectedItem.originalData.category}
                          </span>
                        </div>
                      )}
                      {selectedItem.originalData.created_at && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Added: </span>
                          <span className="text-gray-600">
                            {new Date(
                              selectedItem.originalData.created_at
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
                    View Details
                  </button>
                  <button className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors">
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
