'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '').replace(/\/api$/, '');

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(data.message ?? 'Request failed');
      }

      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-2xl font-bold text-primary">Reset your password</h1>
            <p className="text-secondary mt-1">
              {sent ? 'Check your email for a reset link' : 'Enter your email and we\'ll send you a reset link'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/25 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {sent ? (
            <div className="text-center">
              <p className="text-sm text-secondary mb-4">
                If an account exists for <strong>{email}</strong>, you will receive a password reset email shortly.
              </p>
              <Link href="/login" className="text-accent hover:text-accent-hover text-sm font-medium">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-primary mb-1">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>

              <p className="text-center text-sm text-secondary">
                <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
