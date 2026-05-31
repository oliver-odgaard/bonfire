'use client';

import { useState } from 'react';
import { authClient } from '../../lib/auth-client';

const BRAND = '#441306';
const CREAM = '#FFF7ED';

function ProviderButton({ provider, label, icon, pending, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-3 rounded-full px-5 py-3 transition-colors disabled:opacity-60"
      style={{
        border: `1.5px solid ${BRAND}`,
        backgroundColor: 'transparent',
        color: BRAND,
        fontFamily:
          "'National Park', ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {icon}
      </span>
      <span className="text-base font-medium leading-none">
        {pending ? 'Redirecting…' : `Continue with ${label}`}
      </span>
    </button>
  );
}

export default function SignInPage() {
  const [pending, setPending] = useState(null);

  const onClick = (provider) => async () => {
    setPending(provider);
    await authClient.signIn.social({ provider, callbackURL: '/' });
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ backgroundColor: CREAM, color: BRAND }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <span
            className="leading-none"
            style={{
              fontFamily:
                "'GT Maru Mega Trial Mini', 'GT Maru Mega Trial', 'Times New Roman', ui-serif, serif",
              fontSize: 56,
            }}
          >
            bonfire
          </span>
          <span
            className="text-sm"
            style={{
              fontFamily:
                "'National Park', ui-sans-serif, system-ui, -apple-system, sans-serif",
              opacity: 0.7,
            }}
          >
            Sign in to your company
          </span>
        </div>

        <div className="w-full flex flex-col gap-3">
          <ProviderButton
            provider="slack"
            label="Slack"
            icon="#"
            pending={pending === 'slack'}
            onClick={onClick('slack')}
          />
          <ProviderButton
            provider="google"
            label="Google"
            icon="G"
            pending={pending === 'google'}
            onClick={onClick('google')}
          />
        </div>
      </div>
    </div>
  );
}
