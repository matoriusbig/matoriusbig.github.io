// === 1. Hide navbar on scroll down, show on scroll up ===
(function () {
  var lastScroll = 0;
  var nav = document.getElementById('topnav');
  var threshold = 60;

  window.addEventListener('scroll', function () {
    var current = window.scrollY;
    if (current <= threshold) {
      nav.classList.remove('nav-hidden');
    } else if (current > lastScroll) {
      nav.classList.add('nav-hidden');
    } else {
      nav.classList.remove('nav-hidden');
    }
    lastScroll = current;
  }, { passive: true });
})();

// === 2. Dark / Light mode toggle ===
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('mode-toggle');
  if (btn && typeof Theme !== 'undefined') {
    btn.addEventListener('click', function () { Theme.flip(); });
  }
});

// === 3. Hero Featured Carousel ===
document.addEventListener('DOMContentLoaded', function () {
  var slides = document.querySelectorAll('.hero-slide');
  var dots   = document.querySelectorAll('.hero-dot');
  if (!slides.length) return;

  var current = 0;
  var timer;

  function goTo(index) {
    // Exit current
    slides[current].classList.remove('active');
    slides[current].classList.add('exit');
    dots[current].classList.remove('active');

    // Small delay to allow exit animation
    var prev = current;
    setTimeout(function () {
      slides[prev].classList.remove('exit');
    }, 560);

    current = (index + slides.length) % slides.length;

    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }

  function next() { goTo(current + 1); }

  function startTimer() { timer = setInterval(next, 5000); }
  function resetTimer()  { clearInterval(timer); startTimer(); }

  // Dot clicks
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goTo(i); resetTimer(); });
  });

  // Pause on hover
  var carousel = document.getElementById('hero-carousel');
  if (carousel) {
    carousel.addEventListener('mouseenter', function () { clearInterval(timer); });
    carousel.addEventListener('mouseleave', startTimer);
  }

  startTimer();
});

// === 4. Category filter from nav dropdown ===
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.nav-cat-item').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var cat = btn.getAttribute('data-cat');
      // Only filter if on home page
      var cols = document.querySelectorAll('.post-card-col');
      if (!cols.length) return;
      cols.forEach(function (col) {
        var cats = col.getAttribute('data-categories').split(',');
        col.style.display = cats.includes(cat) ? '' : 'none';
      });
      var bar = document.getElementById('category-filter-bar');
      if (bar) {
        bar.classList.remove('d-none');
        bar.classList.add('d-flex');
        document.getElementById('active-filter-name').textContent = cat;
      }
    });
  });

  var clearBtn = document.getElementById('clear-filter');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      document.querySelectorAll('.post-card-col').forEach(function (col) {
        col.style.display = '';
      });
      var bar = document.getElementById('category-filter-bar');
      if (bar) { bar.classList.add('d-none'); bar.classList.remove('d-flex'); }
    });
  }
});

// === 5. Search results toggle ===
document.addEventListener('DOMContentLoaded', function () {
  var input   = document.getElementById('search-input');
  var wrapper = document.getElementById('search-result-wrapper');
  var cancel  = document.getElementById('search-cancel');
  var rows    = document.querySelectorAll('#main-wrapper > .container > .row');

  if (!input || !wrapper) return;

  function showResults() {
    wrapper.classList.remove('d-none');
    rows.forEach(function(r) { r.classList.add('d-none'); });
    if (cancel) cancel.classList.remove('d-none');
  }

  function hideResults() {
    wrapper.classList.add('d-none');
    rows.forEach(function(r) { r.classList.remove('d-none'); });
    if (cancel) cancel.classList.add('d-none');
    input.value = '';
  }

  input.addEventListener('input', function () {
    if (input.value.trim() !== '') {
      showResults();
    } else {
      hideResults();
    }
  });

  if (cancel) {
    cancel.addEventListener('click', hideResults);
  }

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideResults();
  });
})();
