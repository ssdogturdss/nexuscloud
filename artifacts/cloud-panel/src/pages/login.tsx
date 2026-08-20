import React, { useState } from 'react';
import { TerminalSquare, Lock } from 'lucide-react';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Invalid password');
      }
    } catch {
      setError('Could not reach the API server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sidebar mb-4">
            <TerminalSquare className="w-7 h-7 text-sidebar-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Nexus<span className="text-primary">Cloud</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to access the control panel</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-lg p-6 space-y-4 shadow-sm"
        >
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Panel Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter PANEL_PASSWORD"
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
          </div>

          {error && (
            <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-9 px-4 py-2 w-full disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Set <code className="font-mono bg-muted px-1 py-0.5 rounded">PANEL_PASSWORD</code> in Replit Secrets to configure access.
        </p>
      </div>
    </div>
  );
}
