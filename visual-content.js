(() => {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.pillnav__toggle');
  const menu = document.getElementById('key-projects');

  if (header && toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.pillnav__group')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
    const mark = () => header.classList.toggle('is-scrolled', window.scrollY > 120);
    addEventListener('scroll', mark, { passive: true });
    mark();
  }

  const hero = document.querySelector('.visual-hero');
  const cards = hero ? [...hero.querySelectorAll('.collage-card')] : [];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const interpolate = (a, b, amount) => a + (b - a) * amount;

  let frame = 0;
  const paintHero = () => {
    frame = 0;
    if (!hero || !cards.length) return;
    const rect = hero.getBoundingClientRect();
    const range = Math.max(hero.offsetHeight - innerHeight, 1);
    const raw = clamp(-rect.top / range, 0, 1);
    const progress = reduceMotion.matches ? 1 : smoothstep(clamp(raw / .6, 0, 1));
    hero.style.setProperty('--visual-copy-opacity', String(1 - progress));

    cards.forEach((card) => {
      const startX = Number(card.dataset.startX);
      const startY = Number(card.dataset.startY);
      const endX = Number(card.dataset.endX);
      const endY = Number(card.dataset.endY);
      const startR = Number(card.dataset.startR);
      const endR = Number(card.dataset.endR);
      const x = interpolate(startX, endX, progress);
      const y = interpolate(startY, endY, progress);
      const rotate = interpolate(startR, endR, progress);
      card.style.transform = `translate3d(calc(-50% + ${x}vw), calc(-50% + ${y}vh), 0) rotate(${rotate}deg)`;
    });
  };
  const queueHero = () => { if (!frame) frame = requestAnimationFrame(paintHero); };
  addEventListener('scroll', queueHero, { passive: true });
  addEventListener('resize', queueHero, { passive: true });
  reduceMotion.addEventListener?.('change', queueHero);
  paintHero();

  const topButton = document.querySelector('.back-to-top');
  if (topButton) {
    const toggleTopButton = () => topButton.classList.toggle('is-visible', window.scrollY > innerHeight * .5);
    addEventListener('scroll', toggleTopButton, { passive: true });
    toggleTopButton();
  }
})();
