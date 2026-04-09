/**
 * Smooth Scroll — easing fluido con requestAnimationFrame
 * Curva: easeInOutQuart para sensación premium
 */
(function () {
  // No aplicar en móvil táctil (ya tiene inercia nativa)
  if ('ontouchstart' in window) return;

  var target   = 0;   // posición destino
  var current  = 0;   // posición actual animada
  var ease     = 0.18; // cerca de 1 = casi nativo, 0.05 = muy suave
  var raf      = null;
  var scrolling = false;
  var STEP     = 1; // multiplicador sobre deltaY nativo (1 = velocidad normal)

  // Captura el scroll nativo del wheel
  window.addEventListener('wheel', function (e) {
    e.preventDefault();

    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    target += e.deltaY * (e.deltaMode === 1 ? STEP : 1);
    target  = Math.max(0, Math.min(target, maxScroll));

    if (!scrolling) {
      current   = window.scrollY;
      scrolling = true;
      raf = requestAnimationFrame(loop);
    }
  }, { passive: false });

  function loop() {
    var dist = target - current;

    if (Math.abs(dist) < 0.5) {
      // Llegamos
      current   = target;
      scrolling = false;
      window.scrollTo(0, current);
      return;
    }

    current += dist * ease;
    window.scrollTo(0, current);
    raf = requestAnimationFrame(loop);
  }
})();
