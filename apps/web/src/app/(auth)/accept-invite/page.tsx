'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase';
import { teamService } from '@/services/team.service';

type LinkStatus = 'verifying' | 'ready' | 'invalid';

async function establishSessionFromLink(): Promise<{ ok: boolean; message?: string }> {
  const supabase = createClient();
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);

  const linkError = hash.get('error_description') ?? query.get('error_description');
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  const tokenHash = query.get('token_hash');

  if (linkError || accessToken || tokenHash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  if (linkError) return { ok: false, message: linkError };

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { ok: false, message: error.message };
  } else if (tokenHash && query.get('type') === 'invite') {
    const { error } = await supabase.auth.verifyOtp({ type: 'invite', token_hash: tokenHash });
    if (error) return { ok: false, message: error.message };
  }

  const { data: { session } } = await supabase.auth.getSession();
  return session ? { ok: true } : { ok: false };
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<LinkStatus>('verifying');
  const [linkMessage, setLinkMessage] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    establishSessionFromLink().then(async ({ ok, message }) => {
      if (cancelled) return;
      if (!ok) {
        setLinkMessage(message);
        setStatus('invalid');
        return;
      }
      const { data: { user } } = await createClient().auth.getUser();
      if (cancelled) return;
      setEmail(user?.email ?? '');
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { error: passwordError } = await createClient().auth.updateUser({ password });
      if (passwordError) throw passwordError;
      await teamService.acceptInvite(fullName.trim() ? { full_name: fullName.trim() } : {});
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted">Verifying invitation…</div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-surface rounded-2xl shadow-xs border border-subtle p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-primary mb-2">Invalid invitation</h1>
          <p className="text-secondary text-sm mb-1">
            This invitation link is invalid or has expired. Ask your admin to send you a new one.
          </p>
          {linkMessage && <p className="text-muted text-xs mb-4">{linkMessage}</p>}
          <Link href="/login" className="text-accent hover:text-accent-hover text-sm font-medium">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-surface rounded-2xl shadow-xs border border-subtle p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4">
              <MessageSquare className="w-6 h-6 text-on-accent" />
            </div>
            <h1 className="text-2xl font-bold text-primary">Join your team</h1>
            <p className="text-secondary mt-1">
              {email ? <>Set a password for <span className="text-primary">{email}</span></> : 'Set a password to finish'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/25 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="full-name" className="block text-sm font-medium text-primary mb-1">
                Full name
              </label>
              <Input
                id="full-name"
                autoComplete="name"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-primary mb-1">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-primary mb-1">
                Confirm password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Joining…' : 'Set password and join'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
