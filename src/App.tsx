import { useEffect, useState, useCallback } from 'react';
import { auth } from '@/api/data';
import Login from '@/screens/Login';

type User = { email: string; full_name?: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await auth.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div
        dir="rtl"
        lang="he"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-warm)',
        }}
      >
        <dror-orb size="80" state="thinking" />
      </div>
    );
  }

  if (!user) {
    return <Login onAuthed={refresh} />;
  }

  return (
    <div
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink)',
      }}
    >
      <div>שלום, {user.email}</div>
    </div>
  );
}
