import { useEffect, useSyncExternalStore } from 'react';
import { getSnapshot, register, restoreSession, signIn, signOut, startSession, subscribe } from './session';

export function useSession() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(startSession, []);
  return { ...state, user: state.user, login: signIn, register, logout: signOut, retry: restoreSession };
}
