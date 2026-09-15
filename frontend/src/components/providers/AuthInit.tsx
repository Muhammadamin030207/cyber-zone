'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export default function AuthInit() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    fetchMe();
    const onUnauthorized = () => logout();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [fetchMe, logout]);

  return null;
}