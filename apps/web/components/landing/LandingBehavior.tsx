'use client';

import { useEffect } from 'react';

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '51999999999';

const messages = {
  general: 'Hola, Agua Torito Fresh. Quiero hacer un pedido de agua.',
  hogar: 'Hola, Agua Torito Fresh. Quiero pedir agua para mi hogar.',
  negocio: 'Hola, Agua Torito Fresh. Quiero pedir agua para mi negocio.',
};

function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function LandingBehavior() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    const applyTheme = (theme: 'light' | 'dark') => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      window.localStorage.setItem('torito-theme', theme);
      document
        .getElementById('themeBtn')
        ?.setAttribute(
          'aria-label',
          theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
        );
    };

    const themeButton = document.getElementById('themeBtn');
    const toggleTheme = () =>
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    themeButton?.addEventListener('click', toggleTheme);
    if (themeButton) cleanups.push(() => themeButton.removeEventListener('click', toggleTheme));
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

    document.querySelectorAll<HTMLAnchorElement>('[data-wa]').forEach((link) => {
      const type = link.dataset.wa as keyof typeof messages | undefined;
      link.href = whatsappLink((type && messages[type]) || messages.general);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });

    document.querySelectorAll<HTMLAnchorElement>('[data-wa-product]').forEach((link) => {
      const product = link.dataset.waProduct ?? 'Bidón Torito Fresh con caño';
      const capacity = link.dataset.waCap ?? '20 L';
      link.href = whatsappLink(
        `Hola, Agua Torito Fresh. Quiero pedir un ${product} de ${capacity}.`,
      );
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });

    const menuButton = document.getElementById('menuBtn');
    const mobileNav = document.getElementById('mobileNav');
    if (menuButton && mobileNav) {
      const toggleMenu = () => {
        const open = mobileNav.classList.toggle('open');
        menuButton.setAttribute('aria-expanded', String(open));
      };
      const closeMenu = () => {
        mobileNav.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
      };
      const links = Array.from(mobileNav.querySelectorAll('a'));
      menuButton.addEventListener('click', toggleMenu);
      links.forEach((link) => link.addEventListener('click', closeMenu));
      cleanups.push(() => {
        menuButton.removeEventListener('click', toggleMenu);
        links.forEach((link) => link.removeEventListener('click', closeMenu));
      });
    }

    const revealElements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
          });
        },
        { threshold: 0.15 },
      );
      revealElements.forEach((element) => revealObserver.observe(element));
      cleanups.push(() => revealObserver.disconnect());
    } else {
      revealElements.forEach((element) => element.classList.add('visible'));
    }

    const year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
