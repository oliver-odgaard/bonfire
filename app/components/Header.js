'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { CURRENT_COMPANY } from '../../lib/company';

const BRAND = '#441306';
const CREAM = '#FFF7ED';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const VIEWS = [
  { id: 'interests', label: 'Interests', icon: '/header/cat.svg' },
  { id: 'colleagues', label: 'Colleagues', icon: '/header/people.svg' },
];

function Pill({ active, icon, label, count, onClick }) {
  const fg = active ? CREAM : BRAND;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-3 rounded-full px-4 py-3 transition-colors"
      style={{
        backgroundColor: active ? BRAND : 'transparent',
        border: active ? '1.5px solid transparent' : `1.5px solid ${BRAND}`,
        color: fg,
      }}
    >
      <span
        aria-hidden="true"
        className="block size-6"
        style={{
          backgroundColor: fg,
          WebkitMaskImage: `url(${icon})`,
          maskImage: `url(${icon})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
      <span className="text-base font-medium leading-none whitespace-nowrap">
        {label}
      </span>
      {typeof count === 'number' && (
        <span className="text-xs font-semibold uppercase leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

function enter(mounted, { delay = 0, axis = 'y', distance = 8 } = {}) {
  const off =
    axis === 'x'
      ? `translateX(${-distance}px)`
      : axis === 'x-right'
      ? `translateX(${distance}px)`
      : `translateY(${-distance}px)`;
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translate(0, 0)' : off,
    transition: `opacity 560ms ${EASE} ${delay}ms, transform 600ms ${EASE} ${delay}ms`,
    willChange: 'opacity, transform',
  };
}

function useClickOutside(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);
  return ref;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function OrgSwitcher({ activeOrg }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const { data: orgs } = authClient.useListOrganizations();

  const onSelect = async (orgId) => {
    await authClient.organization.setActive({ organizationId: orgId });
    setOpen(false);
  };

  const onCreate = async () => {
    const name = window.prompt('Organization name');
    if (!name) return;
    const slug = window.prompt('Organization slug (used as tenant key)', slugify(name));
    if (!slug) return;
    await authClient.organization.create({ name, slug });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
        style={{
          border: `1.5px solid ${BRAND}`,
          color: BRAND,
          backgroundColor: 'transparent',
        }}
      >
        <span className="text-sm font-medium whitespace-nowrap max-w-[160px] truncate">
          {activeOrg?.name || 'No organization'}
        </span>
        <span aria-hidden="true" className="text-xs">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 min-w-[220px] rounded-2xl bg-white shadow-lg overflow-hidden"
          style={{ border: `1px solid ${BRAND}22` }}
        >
          <ul className="py-1">
            {(orgs || []).map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onSelect(o.id)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-black/5"
                  style={{ color: BRAND }}
                >
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs opacity-60">{o.slug}</div>
                </button>
              </li>
            ))}
            <li className="border-t" style={{ borderColor: `${BRAND}1A` }}>
              <button
                type="button"
                onClick={onCreate}
                className="w-full text-left px-4 py-2 text-sm hover:bg-black/5"
                style={{ color: BRAND }}
              >
                + Create organization
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function UserPopover({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const router = useRouter();
  const initials = (user.name || user.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const onSignOut = async () => {
    await authClient.signOut();
    setOpen(false);
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="size-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold"
        style={{
          border: `1.5px solid ${BRAND}`,
          color: BRAND,
          backgroundColor: 'transparent',
        }}
        aria-label="Account menu"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || ''}
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 min-w-[220px] rounded-2xl bg-white shadow-lg overflow-hidden"
          style={{ border: `1px solid ${BRAND}22` }}
        >
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BRAND}1A` }}>
            <div className="text-sm font-medium truncate" style={{ color: BRAND }}>
              {user.name || 'Signed in'}
            </div>
            <div className="text-xs opacity-60 truncate" style={{ color: BRAND }}>
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full text-left px-4 py-2 text-sm hover:bg-black/5"
            style={{ color: BRAND }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SignInPill() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/sign-in')}
      className="inline-flex items-center gap-3 rounded-full px-4 py-3 transition-colors"
      style={{
        border: `1.5px solid ${BRAND}`,
        color: BRAND,
        backgroundColor: 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        className="block size-6"
        style={{
          backgroundColor: BRAND,
          WebkitMaskImage: `url(/header/smiley-happy.svg)`,
          maskImage: `url(/header/smiley-happy.svg)`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
      <span className="text-base font-medium leading-none whitespace-nowrap">
        Sign in
      </span>
    </button>
  );
}

export default function Header({ active, onActiveChange, colleaguesCount }) {
  const [mounted, setMounted] = useState(false);
  const { data: session } = authClient.useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const companyLabel = activeOrg?.name || CURRENT_COMPANY;

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isSignedIn = !!session?.user;

  return (
    <header
      className="header-enter absolute inset-x-0 top-0 z-40 flex items-center p-8 pointer-events-none"
      style={{ color: BRAND }}
    >
      <div className="relative flex w-full items-center justify-between pointer-events-none">
        <div
          className="flex items-center gap-6 pointer-events-auto"
          style={enter(mounted, { delay: 80, axis: 'x', distance: 12 })}
        >
          <span
            className="leading-none whitespace-nowrap"
            style={{
              fontFamily:
                "'GT Maru Mega Trial Mini', 'GT Maru Mega Trial', 'Times New Roman', ui-serif, serif",
              fontSize: 48,
              color: BRAND,
            }}
          >
            bonfire
          </span>
          <span
            aria-hidden="true"
            className="block h-5 w-px"
            style={{ backgroundColor: BRAND }}
          />
          <span
            className="text-base font-medium whitespace-nowrap"
            style={{
              fontFamily:
                "'National Park', ui-sans-serif, system-ui, -apple-system, sans-serif",
              color: BRAND,
            }}
          >
            {companyLabel}
          </span>
        </div>

        <nav
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto"
          style={{
            fontFamily:
              "'National Park', ui-sans-serif, system-ui, -apple-system, sans-serif",
          }}
          aria-label="Primary"
        >
          {VIEWS.map((v, i) => (
            <span
              key={v.id}
              className="inline-block"
              style={enter(mounted, { delay: 220 + i * 90, distance: 10 })}
            >
              <Pill
                active={active === v.id}
                icon={v.icon}
                label={v.label}
                count={v.id === 'colleagues' ? colleaguesCount : v.count}
                onClick={() => onActiveChange?.(v.id)}
              />
            </span>
          ))}
        </nav>

        <div
          className="pointer-events-auto flex items-center gap-3"
          style={{
            ...enter(mounted, { delay: 80, axis: 'x-right', distance: 12 }),
            fontFamily:
              "'National Park', ui-sans-serif, system-ui, -apple-system, sans-serif",
          }}
        >
          {isSignedIn ? (
            <>
              <OrgSwitcher activeOrg={activeOrg} />
              <UserPopover user={session.user} />
            </>
          ) : (
            <SignInPill />
          )}
        </div>
      </div>
    </header>
  );
}
