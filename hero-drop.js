/* hero-drop.js — 히어로의 도구 알약이 떨어져 쌓인다.

   형태·크기는 김유경 포트폴리오, 운동은 jeton.com에서 왔다.
   Jeton은 국기 더미를 1265x970 캔버스에 물리로 돌린다(2026-07-28 실측).
   여기서는 Verlet 적분으로 직접 구현했다 — 외부 라이브러리를 받지 않는다.

   알약 하나 = 점 두 개 + 거리 구속. 그래서 부딪히면 기울고 회전이 저절로 나온다.
   다 가라앉으면 루프를 멈춘다. SPEC §7-c의 "상시 애니메이션 0"을 지킨다.
   prefers-reduced-motion이면 계산만 미리 돌려 쌓인 상태로 바로 보여준다. */

(() => {
  const field = document.getElementById('field');
  if (!field) return;

  // 색은 각 도구 로고에서 뽑았다. 임의 배색이 아니다.
  const TOOLS = [
    ['perplexity', 'Perplexity', '#20808D'], ['gemini', 'Gemini', '#4285F4'],
    ['notebooklm', 'NotebookLM', '#4B6FED'], ['claude-code', 'Claude Code', '#D97757'],
    ['codex', 'Codex', '#6E56CF'], ['gpt', 'GPT', '#10A37F'],
    ['photoshop', 'Photoshop', '#31A8FF'], ['illustrator', 'Illustrator', '#FF9A00'],
    ['premiere-pro', 'Premiere Pro', '#9999FF'], ['figma', 'Figma', '#A259FF']
  ];

  /* ─ 알약 색 계산 ─
     배경·테두리·글자를 전부 도구 색으로 쓰면 밝은 색(Premiere #9999FF 등)은
     글자 대비가 무너진다. 그래서 배경은 12% 틴트로 깔고, 글자는 그 틴트 위에서
     4.5를 넘을 때까지 검정을 섞어 어둡게 만든다. 테두리는 UI라 3.0이면 된다. */
  const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (c, t, r) => c.map((v, i) => Math.round(v * (1 - r) + t[i] * r));
  const lum = (c) => {
    const v = c.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const css = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

  const palette = (hex) => {
    const base = hex2rgb(hex);
    const white = [255, 255, 255], black = [0, 0, 0];
    const face = mix(base, white, 0.88);          // 12% 틴트
    let ink = base;
    for (let k = 0; k <= 20 && ratio(ink, face) < 4.5; k++) ink = mix(base, black, k * 0.05);
    let line = base;
    for (let k = 0; k <= 20 && ratio(line, face) < 3.0; k++) line = mix(base, black, k * 0.05);
    return { face: css(face), ink: css(ink), line: css(line) };
  };

  const GRAV = 0.55, DAMP = 0.988, ITER = 8, REST_FRAMES = 30;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let bodies = [], raf = 0, rest = 0;
  let hasBuilt = false, layoutWidth = 0;

  const integrate = (p, o) => {
    const vx = (p.x - o.x) * DAMP, vy = (p.y - o.y) * DAMP;
    o.x = p.x; o.y = p.y;
    p.x += vx; p.y += vy + GRAV;
  };

  const constrain = (b) => {
    const dx = b.p2.x - b.p1.x, dy = b.p2.y - b.p1.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const k = (d - b.L) / d * 0.5;
    b.p1.x += dx * k; b.p1.y += dy * k;
    b.p2.x -= dx * k; b.p2.y -= dy * k;
  };

  /* 세로형 Figma 심볼은 알약이 뒤집힐 때 로고와 글자가 서로 자리를 바꾸는 듯
     보인다. 물리 이동은 유지하되 이 알약의 중심선만 수평으로 고정한다. */
  const keepUpright = (b, W, H) => {
    if (!b.keepUpright) return;
    const half = b.L / 2;
    const minX = b.r + half;
    const maxX = W - b.r - half;
    const cx = Math.min(Math.max((b.p1.x + b.p2.x) / 2, minX), maxX);
    const cy = Math.min(Math.max((b.p1.y + b.p2.y) / 2, b.r), H - b.r);
    b.p1.x = cx - half; b.p1.y = cy;
    b.p2.x = cx + half; b.p2.y = cy;
  };

  // 알약이 회전하면 캡 중심만으로는 모서리가 벽을 넘는다. 반지름만큼 더 물린다.
  const bound = (p, r, W, H) => {
    if (p.y > H - r) p.y = H - r;
    if (p.x < r) p.x = r;
    if (p.x > W - r) p.x = W - r;
  };

  const push = (b, t, dx, dy) => {
    b.p1.x += dx * (1 - t); b.p1.y += dy * (1 - t);
    b.p2.x += dx * t;       b.p2.y += dy * t;
  };

  /* 두 알약의 중심선을 선분으로 보고 가장 가까운 두 점을 찾는다.
     이전의 원 샘플 방식은 화면이 좁아 알약이 작아질수록 샘플 사이로 다른 알약이
     파고들 수 있었다. 선분 전체를 기준으로 하면 크기와 회전에 관계없이 몸통이
     서로 통과하지 않는다. 반환값 s·t는 각 선분의 0~1 위치다. */
  const closestPoints = (A, B) => {
    const ux = A.p2.x - A.p1.x, uy = A.p2.y - A.p1.y;
    const vx = B.p2.x - B.p1.x, vy = B.p2.y - B.p1.y;
    const wx = A.p1.x - B.p1.x, wy = A.p1.y - B.p1.y;
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const eps = 1e-6;
    let sN = b * e - c * d;
    let tN = a * e - b * d;
    let sD = a * c - b * b;
    let tD = sD;

    if (sD < eps) {
      sN = 0;
      sD = 1;
      tN = e;
      tD = c;
    } else {
      if (sN < 0) {
        sN = 0;
        tN = e;
        tD = c;
      } else if (sN > sD) {
        sN = sD;
        tN = e + b;
        tD = c;
      }
    }

    if (tN < 0) {
      tN = 0;
      if (-d < 0) sN = 0;
      else if (-d > a) sN = sD;
      else {
        sN = -d;
        sD = a;
      }
    } else if (tN > tD) {
      tN = tD;
      if (-d + b < 0) sN = 0;
      else if (-d + b > a) sN = sD;
      else {
        sN = -d + b;
        sD = a;
      }
    }

    const s = Math.abs(sN) < eps ? 0 : sN / sD;
    const t = Math.abs(tN) < eps ? 0 : tN / tD;
    return {
      s,
      t,
      ax: A.p1.x + s * ux,
      ay: A.p1.y + s * uy,
      bx: B.p1.x + t * vx,
      by: B.p1.y + t * vy
    };
  };

  const collide = () => {
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        const q = closestPoints(A, B);
        let dx = q.bx - q.ax, dy = q.by - q.ay;
        const min = A.r + B.r;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;

        if (d < 0.001) {
          const acx = (A.p1.x + A.p2.x) / 2;
          const acy = (A.p1.y + A.p2.y) / 2;
          const bcx = (B.p1.x + B.p2.x) / 2;
          const bcy = (B.p1.y + B.p2.y) / 2;
          dx = bcx - acx;
          dy = bcy - acy;
          d = Math.hypot(dx, dy) || 1;
        }

        const k = (min - d) / d * 0.52;
        push(A, q.s, -dx * k, -dy * k);
        push(B, q.t, dx * k, dy * k);
      }
    }
  };

  const solve = (W, H) => {
    for (let k = 0; k < ITER; k++) {
      for (const b of bodies) { constrain(b); keepUpright(b, W, H); }
      collide();
      for (const b of bodies) { bound(b.p1, b.r, W, H); bound(b.p2, b.r, W, H); }
      for (const b of bodies) keepUpright(b, W, H);
    }
  };

  const render = () => {
    for (const b of bodies) {
      const cx = (b.p1.x + b.p2.x) / 2, cy = (b.p1.y + b.p2.y) / 2;
      let a = Math.atan2(b.p2.y - b.p1.y, b.p2.x - b.p1.x) * 180 / Math.PI;
      /* 알약은 좌우 대칭이라 180도 돌아도 같은 모양이다. 하지만 안의 글자는
         거꾸로 선다 — 실측에서 한 개가 180도로 뒤집혀 이름이 뒤집혀 보였다.
         -90~90으로 접어 글자가 항상 바로 서게 한다. */
      if (a > 90) a -= 180;
      else if (a < -90) a += 180;
      b.el.style.transform =
        `translate(${cx - b.w / 2}px, ${cy - b.h / 2}px) rotate(${a}deg)`;
      /* 더 아래에 놓인 알약이 앞에 온다. 위에서 떨어진 알약이 아래 더미의
         테두리와 글자를 덮는 대신, 실제로 층층이 쌓인 순서로 읽힌다. */
      b.el.style.zIndex = String(Math.max(1, Math.round(cy)));
    }
  };

  const step = () => {
    const W = field.clientWidth, H = field.clientHeight;
    for (const b of bodies) { integrate(b.p1, b.o1); integrate(b.p2, b.o2); }
    solve(W, H);
    let energy = 0;
    for (const b of bodies) {
      energy += Math.abs(b.p1.x - b.o1.x) + Math.abs(b.p1.y - b.o1.y)
              + Math.abs(b.p2.x - b.o2.x) + Math.abs(b.p2.y - b.o2.y);
    }
    render();
    rest = energy < 0.6 ? rest + 1 : 0;
    if (rest < REST_FRAMES) raf = requestAnimationFrame(step);
  };

  const build = ({ animate = !hasBuilt } = {}) => {
    cancelAnimationFrame(raf);
    field.innerHTML = '';
    bodies = [];
    rest = 0;

    const W = field.clientWidth, H = field.clientHeight;
    // 레이아웃이 아직 안 잡혔으면(스타일 늦게 도착, 폰트 대기) 잡힐 때까지 기다린다.
    // 여기서 그냥 return하면 알약이 영영 안 생긴다.
    if (!W || !H) {
      if (!build.watching) {
        build.watching = true;
        const ro = new ResizeObserver(() => {
          if (field.clientHeight > 0) { ro.disconnect(); build.watching = false; build(); }
        });
        ro.observe(field);
      }
      return;
    }
    layoutWidth = W;

    TOOLS.forEach(([file, label, hex], i) => {
      const el = document.createElement('div');
      el.className = 'chip';
      const p = palette(hex);
      el.style.setProperty('--chip-face', p.face);
      el.style.setProperty('--chip-line', p.line);
      el.style.setProperty('--chip-ink', p.ink);
      el.innerHTML =
        `<img src="assets/tools/${file}.svg" alt="" width="34" height="34"><span>${label}</span>`;
      field.appendChild(el);

      const w = el.offsetWidth, h = el.offsetHeight;
      const r = h / 2;
      const L = Math.max(w - h, 8);
      /* 폭 전체(10~90%)에 고루 뿌린다. 좁히면 가운데로 몰려 양옆이 빈다.
         초기 회전 속도는 주지 않는다 — 줬더니 알약이 세로로 서서 제목을 덮었다. */
      const cx = W * (0.10 + 0.80 * ((i * 0.37) % 1));
      const cy = -160 - i * 165;
      const a = (i % 2 ? 1 : -1) * (0.25 + (i % 5) * 0.12);
      const p1 = { x: cx - Math.cos(a) * L / 2, y: cy - Math.sin(a) * L / 2 };
      const p2 = { x: cx + Math.cos(a) * L / 2, y: cy + Math.sin(a) * L / 2 };
      const vx = (i % 3 - 1) * 1.1;
      bodies.push({ el, r, L, w, h, p1, p2, keepUpright: file === 'figma',
        o1: { x: p1.x - vx, y: p1.y }, o2: { x: p2.x - vx, y: p2.y } });
    });

    // 첫 등장에만 낙하 장면을 재생한다. 이후 화면 회전이나 실제 너비 변경으로
    // 다시 배치할 때는 완성된 더미를 바로 보여 스크롤 중 재낙하하지 않는다.
    const shouldAnimate = animate && !reduce.matches && !document.hidden;
    hasBuilt = true;
    if (!shouldAnimate) { settle(W, H); return; }
    raf = requestAnimationFrame(step);
  };

  const settle = (W, H) => {
    for (let n = 0; n < 900; n++) {
      for (const b of bodies) { integrate(b.p1, b.o1); integrate(b.p2, b.o2); }
      solve(W, H);
    }
    render();
  };

  /* 3섹션이 화면에 들어올 때 떨어뜨린다.
     처음부터 돌리면 사용자가 스크롤해 내려왔을 땐 이미 다 쌓여 있어서
     떨어지는 장면을 못 본다. 한 번 떨어지고 나면 다시 걸지 않는다. */
  const start = () => {
    const stage = field.closest('section') || field.parentElement;
    if (!('IntersectionObserver' in window) || reduce.matches) { build(); return; }

    // 이미 화면에 있으면 관찰자를 기다리지 않고 바로 떨어뜨린다.
    // 히어로처럼 처음부터 보이는 자리에서는 관찰자가 발동하지 않아 알약이 영영 안 생겼다.
    const r = stage.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) { build(); return; }

    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        build();
      }
    }, { rootMargin: '0px 0px -25% 0px' });
    io.observe(stage);
  };

  // 폰트가 늦게 오면 알약 폭이 바뀐다. 로드 후에 다시 잡는다.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();

  let t = 0;
  addEventListener('resize', () => {
    if (!hasBuilt) return;
    const nextWidth = field.clientWidth;
    // 모바일 주소창이 접히고 펼쳐질 때는 높이만 달라져도 resize가 발생한다.
    // 너비가 그대로면 현재 더미를 유지해 스크롤마다 다시 떨어지는 일을 막는다.
    if (!nextWidth || Math.abs(nextWidth - layoutWidth) < 2) return;
    clearTimeout(t);
    t = setTimeout(() => build({ animate: false }), 200);
  });
  reduce.addEventListener('change', () => build({ animate: false }));
})();
