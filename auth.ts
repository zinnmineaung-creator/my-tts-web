import { useState, useEffect } from 'react';

const TOKEN_KEY = 'tts_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function useAuthToken() {
  const [token, setTokenState] = useState<string | null>(getToken());

  useEffect(() => {
    const handleStorageChange = () => {
      setTokenState(getToken());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const saveToken = (newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
    // trigger storage event for other components if needed
    window.dispatchEvent(new Event('storage'));
  };

  const removeToken = () => {
    clearToken();
    setTokenState(null);
    window.dispatchEvent(new Event('storage'));
  };

  return { token, saveToken, removeToken };
}
