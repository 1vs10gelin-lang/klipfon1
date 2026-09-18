'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Headphones, MessageCircle, X } from 'lucide-react';
import './live-support.css';

type TawkApi = {
  onLoad?: () => void;
  onBeforeLoad?: () => void;
  onChatMinimized?: () => void;
  onChatMaximized?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
  maximize?: () => void;
  customStyle?: { zIndex: number };
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

export function LiveSupport() {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const panel = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const ready = useRef(false);
  const requested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/support-config', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(config => {
        if (typeof config?.src === 'string' && /^https:\/\/embed\.tawk\.to\/[a-f0-9]{24}\/[a-z0-9]{1,64}$/i.test(config.src)) {
          setSrc(config.src);
        }
      })
      .catch(() => {});
    function close(event: KeyboardEvent) {
      if (event.key === 'Escape' && panel.current?.open) {
        panel.current.open = false;
        trigger.current?.focus();
      }
    }
    document.addEventListener('keydown', close);
    return () => {
      controller.abort();
      clearTimeout(timer.current);
      document.removeEventListener('keydown', close);
    };
  }, []);

  function openChat() {
    if (!src || loading) return;
    setError(false);
    const api = window.Tawk_API = window.Tawk_API || {};
    function show() {
      api.showWidget?.();
      api.maximize?.();
      if (panel.current) panel.current.open = false;
    }
    if (ready.current) {
      show();
      return;
    }
    requested.current = true;
    setLoading(true);
    function fail() {
      clearTimeout(timer.current);
      requested.current = false;
      setLoading(false);
      setError(true);
    }
    api.customStyle = { zIndex: 60 };
    api.onBeforeLoad = () => api.hideWidget?.();
    api.onLoad = () => {
      ready.current = true;
      clearTimeout(timer.current);
      setLoading(false);
      if (requested.current) {
        requested.current = false;
        show();
      } else {
        api.hideWidget?.();
      }
    };
    api.onChatMinimized = () => {
      api.hideWidget?.();
      trigger.current?.focus();
    };
    api.onChatMaximized = () => {
      if (panel.current) panel.current.open = false;
    };
    timer.current = setTimeout(fail, 15000);
    if (!document.getElementById('klipfon-tawk')) {
      window.Tawk_LoadStart = new Date();
      const script = document.createElement('script');
      script.id = 'klipfon-tawk';
      script.async = true;
      script.src = src;
      script.charset = 'UTF-8';
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        script.remove();
        fail();
      };
      document.head.appendChild(script);
    }
  }

  return (
    <details className="klipfon-support" ref={panel} onToggle={() => {
      if (!panel.current?.open) requested.current = false;
    }}>
      <summary className="klipfon-support-trigger" ref={trigger} aria-label="Klipfon destek seçeneklerini aç">
        <Headphones size={23} aria-hidden="true" />
        <span>Destek</span>
      </summary>
      <section className="klipfon-support-panel" aria-label="Klipfon destek">
        <header className="klipfon-support-header">
          <div><span className="klipfon-support-eyebrow">BİRLİKTE ÜRETİYORUZ</span><h2>Klipfon Destek</h2></div>
          <button type="button" aria-label="Destek seçeneklerini kapat" onClick={() => {
            if (panel.current) panel.current.open = false;
            trigger.current?.focus();
          }}><X size={19} /></button>
        </header>
        <div className="klipfon-support-body">
          <p>Merhaba! Sana nasıl yardımcı olabiliriz?</p>
          {src && <button className="klipfon-support-chat" type="button" onClick={openChat} disabled={loading}>
            <MessageCircle size={19} aria-hidden="true" />{loading ? 'Sohbet açılıyor…' : 'Canlı desteğe bağlan'}
          </button>}
          {error && <p className="klipfon-support-error" role="alert">Sohbet yüklenemedi. Tekrar deneyebilir veya aşağıdan destek talebi açabilirsin.</p>}
          <a href="/panel?bolum=support"><span>Destek ve ödeme talepleri<small>Sorunu veya itirazını bize ilet.</small></span><ArrowUpRight size={18} aria-hidden="true" /></a>
          <a href="/yardim"><span>Sıkça sorulan sorular<small>Kampanyalar, klipler ve ödemeler.</small></span><ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </section>
    </details>
  );
}
