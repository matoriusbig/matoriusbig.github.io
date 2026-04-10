/* =============================================
   CUSTOM CROSSHAIR CURSOR
   ============================================= */

(function () {
  // Skip on touch devices
  if (window.matchMedia('(hover: none)').matches) return;

  // --- Build DOM ---
  const crosshair = document.createElement('div');
  crosshair.id = 'cursor-crosshair';
  crosshair.innerHTML =
    '<div class="c-dot"></div>' +
    '<div class="c-line c-top"></div>' +
    '<div class="c-line c-bottom"></div>' +
    '<div class="c-line c-left"></div>' +
    '<div class="c-line c-right"></div>';

  const ring = document.createElement('div');
  ring.id = 'cursor-ring';

  document.body.appendChild(ring);
  document.body.appendChild(crosshair);

  // --- State ---
  let mx = -200, my = -200;
  let rx = -200, ry = -200;
  let raf;

  // --- Track mouse ---
  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
    crosshair.style.transform = 'translate(' + (mx - 10) + 'px,' + (my - 10) + 'px)';
  });

  // --- Animate ring (lerp follow) ---
  function tick() {
    rx += (mx - rx) * 0.1;
    ry += (my - ry) * 0.1;
    ring.style.transform = 'translate(' + (rx - 16) + 'px,' + (ry - 16) + 'px)';
    raf = requestAnimationFrame(tick);
  }
  tick();

  // --- Hover on interactive elements ---
  function bindHover() {
    document.querySelectorAll('a, button, [onclick], label, input, select, textarea').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        crosshair.classList.add('c-hover');
        ring.classList.add('c-hover');
      });
      el.addEventListener('mouseleave', function () {
        crosshair.classList.remove('c-hover');
        ring.classList.remove('c-hover');
      });
    });
  }
  bindHover();

  // --- Click animation ---
  document.addEventListener('mousedown', function () {
    crosshair.classList.add('c-click');
    ring.classList.add('c-click');
  });
  document.addEventListener('mouseup', function () {
    crosshair.classList.remove('c-click');
    ring.classList.remove('c-click');
  });

  // --- Hide when leaving window ---
  document.addEventListener('mouseleave', function () {
    crosshair.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', function () {
    crosshair.style.opacity = '1';
    ring.style.opacity = '1';
  });
})();
