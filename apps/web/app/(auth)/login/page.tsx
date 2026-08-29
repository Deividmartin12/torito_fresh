'use client';

import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api, saveSession } from '../../../lib/api';
import { ThemeToggle } from '../../../components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('torito');
  const [password, setPassword] = useState('torito');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await api<{ accessToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(result.accessToken, result.user);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
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
          <img className="login-logo" src="/torito-logo.jpg" alt="Torito Fresh" />
          <div>
            <h1 className="text-xl font-black text-ink">Torito Fresh</h1>
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
          <button className="btn-primary w-full" disabled={loading}>
            <LogIn size={17} />
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </div>
      </form>
    </main>
  );
}
