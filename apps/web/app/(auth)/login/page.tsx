'use client';

import { Droplets, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, saveSession } from '../../../lib/api';
import { ThemeToggle } from '../../../components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('torito');
  const [password, setPassword] = useState('torito');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api<{ accessToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(result.accessToken, result.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page grid min-h-screen place-items-center px-4">
      <ThemeToggle className="login-theme-toggle" />
      <form
        onSubmit={submit}
        className="login-card w-full max-w-sm rounded-md border p-6 shadow-soft"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-brand-600 text-white">
            <Droplets />
          </div>
          <div>
            <h1 className="text-xl font-black text-ink">tORITO FRESH</h1>
            <p className="text-sm text-slate-500">Sistema administrativo</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="label">Usuario</span>
            <input
              className="control mt-1"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="label">Contrasena</span>
            <input
              className="control mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
          <button className="btn-primary w-full" disabled={loading}>
            <LogIn size={17} />
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </div>
      </form>
    </main>
  );
}
