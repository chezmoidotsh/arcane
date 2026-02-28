(function () {
  'use strict';

  // Script shared by custom error pages (4xx / 5xx).
  // - Renders a tiled repeating "Error!!" background with small random variations
  // - Chooses a random centered bracketed message from `messages` (page can set it)
  // - Randomly jitters the center flash to give a dynamic, "glitchy" vibe
  //
  // Expected DOM elements in the HTML:
  //   <div id="tile"></div>
  //   <div id="flash" class="flash">[ ERROR ]</div>
  //
  // Optional: the page can define `messages` array before loading this script
  // to provide severity-specific messages (see 4xx.html / 5xx.html).
  //
  // The script is defensive: if elements are missing it silently no-ops.

  function $(sel) { return document.querySelector(sel); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function buildTilePool() {
    // Pool of short variations used in the tile grid. Keep them short so tiling reads well.
    return [
      'Error!!', 'Error!!', 'Error!!', 'Error!', '!!Error!!',
      'ERR!', '!!!ERR!!!', 'Error', 'E R R O R'
    ];
  }

  function createTileSpan(text, poolIndexSeed) {
    const s = document.createElement('span');
    s.textContent = text;
    // Slight random transform; we apply a base skew from CSS and then add rotation+scale
    const r = (Math.random() * 8 - 4); // -4..+4 deg
    const scale = 0.9 + Math.random() * 0.35;
    s.style.transform = `skew(-5deg) rotate(${r}deg) scale(${scale})`;
    s.style.opacity = (0.6 + Math.random() * 0.4).toFixed(2);
    // Small horizontal nudge for visual variety
    s.style.display = 'inline-block';
    return s;
  }

  function buildGrid(tileEl) {
    if (!tileEl) return;
    // Clear previous tiles
    while (tileEl.firstChild) tileEl.removeChild(tileEl.firstChild);

    const pool = buildTilePool();

    // Cell size chosen to match CSS grid sizing in common.css
    const cellW = 120;
    const cellH = 40;
    const cols = Math.ceil(window.innerWidth / cellW) + 2;
    const rows = Math.ceil(window.innerHeight / cellH) + 2;
    const total = Math.max(24, cols * rows);

    // Create document fragment for performance
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const text = pool[Math.floor(Math.random() * pool.length)];
      const span = createTileSpan(text, i);
      frag.appendChild(span);
    }
    tileEl.appendChild(frag);
  }

  function randomizeFlashPos(flashEl, messagesList) {
    if (!flashEl) return;

    // Choose new text sometimes
    if (messagesList && messagesList.length) {
      if (Math.random() < 0.33) {
        flashEl.textContent = messagesList[Math.floor(Math.random() * messagesList.length)];
      }
    }

    // Random offset within a percentage of viewport to create "wandering" effect
    const maxOffsetX = Math.min(window.innerWidth * 0.22, 260);
    const maxOffsetY = Math.min(window.innerHeight * 0.22, 180);
    const offsetX = (Math.random() * 2 - 1) * maxOffsetX;
    const offsetY = (Math.random() * 2 - 1) * maxOffsetY;

    // Use translate to keep the element centered but offset a bit
    flashEl.style.transform = `translate(calc(-50% + ${Math.round(offsetX)}px), calc(-50% + ${Math.round(offsetY)}px))`;
  }

  function safeRun() {
    const tile = $('#tile');
    const flash = $('#flash');

    // If no tile container, nothing to render
    if (!tile && !flash) return;

    // The page can provide `messages` global, otherwise fall back to a safe default
    const messagesList = (typeof messages !== 'undefined' && Array.isArray(messages) && messages.length)
      ? messages
      : ['[ ERROR ]'];

    // Build initial grid and flash
    if (tile) buildGrid(tile);
    if (flash) {
      // Ensure initial content
      flash.textContent = messagesList[Math.floor(Math.random() * messagesList.length)];
      randomizeFlashPos(flash, messagesList);
    }

    // Periodically jitter the flash position and occasionally change the message
    const jitterInterval = 2200 + Math.random() * 1600;
    const jitterHandle = setInterval(function () {
      try {
        if (flash) randomizeFlashPos(flash, messagesList);
      } catch (e) {
        // swallow errors to avoid breaking hosting pages
      }
    }, jitterInterval);

    // Rebuild grid on resize (debounced)
    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        try {
          if (tile) buildGrid(tile);
        } catch (e) { /* ignore */ }
      }, 180);
    });

    // Try to progressively change some tiles' text occasionally to increase dynamism
    const flickerInterval = 1200 + Math.random() * 1800;
    const flicker = setInterval(function () {
      try {
        if (!tile) return;
        const spans = tile.children;
        if (!spans || spans.length === 0) return;
        // Change a few random spans
        for (let i = 0; i < 8; i++) {
          const idx = Math.floor(Math.random() * spans.length);
          const span = spans[idx];
          if (span) {
            span.textContent = buildTilePool()[Math.floor(Math.random() * 5)];
            span.style.opacity = (0.6 + Math.random() * 0.4).toFixed(2);
          }
        }
      } catch (e) { /* ignore */ }
    }, flickerInterval);

    // If the document becomes hidden we can pause heavy updates
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(jitterHandle);
        clearInterval(flicker);
      } else {
        // restart intervals
        // (simple approach: reload the page to reset animation timings if needed)
        try {
          // rebuild and restart by reloading the script logic
          if (tile) buildGrid(tile);
          if (flash) randomizeFlashPos(flash, messagesList);
        } catch (e) { /* ignore */ }
      }
    }, false);
  }

  // Run after DOM ready; if already loaded, run immediately
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(safeRun, 10);
  } else {
    document.addEventListener('DOMContentLoaded', safeRun);
  }
})();
