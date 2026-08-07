'use client';

import { useEffect, useState, useRef } from 'react';

const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes
const COUNTDOWN_SECONDS = 30; // 30 seconds timer

export default function SessionTimeoutModal() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  function startInactivityTimer() {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setShowPrompt(false);
    setTimeLeft(COUNTDOWN_SECONDS);

    inactivityTimerRef.current = setTimeout(() => {
      setShowPrompt(true);
    }, THIRTY_MINUTES_MS);
  }

  async function handleLogout() {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors
    } finally {
      window.location.href = '/login';
    }
  }

  function handleKeepAlive() {
    startInactivityTimer();
  }

  useEffect(() => {
    startInactivityTimer();

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Countdown interval when prompt is open
  useEffect(() => {
    if (showPrompt) {
      setTimeLeft(COUNTDOWN_SECONDS);
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showPrompt]);

  if (!showPrompt) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>⏰</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8, color: 'var(--color-ink)' }}>
          Are you still online?
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--color-ink-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You have been logged in for 30 minutes. To maintain optimal server speed and response times for all active admins, your session will automatically log out in:
        </p>

        <div style={{
          fontSize: 36,
          fontWeight: 800,
          color: 'var(--color-error)',
          fontFamily: 'monospace',
          marginBottom: 24,
          background: 'rgba(176,64,58,0.06)',
          padding: '10px 20px',
          borderRadius: 8,
          display: 'inline-block',
        }} className="tabular-nums">
          00:{String(timeLeft).padStart(2, '0')}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log Out Now
          </button>
          <button className="btn btn-primary" onClick={handleKeepAlive} style={{ paddingLeft: 24, paddingRight: 24 }}>
            Yes, Keep Me Logged In →
          </button>
        </div>
      </div>
    </div>
  );
}
