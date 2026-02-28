# errors.inc
#
# Pure-Caddy inline error responder (single-include).
#
# Usage:
#   import errors.inc
#
# Behaviour:
#   - Matches any 4xx/5xx error and responds with an inline HTML page.
#   - Attempts to preserve the original HTTP status by using the placeholder
#     {http.error.status_code} as the status argument to `respond`.
#   - IMPORTANT: Some Caddy builds may not accept placeholders in the numeric
#     status position during validation. If your `caddy validate` fails,
#     fallback to the commented section below (class-based statuses) or upgrade
#     Caddy to a build that supports placeholder expansion in respond status.
#
# Notes:
#   - This include is self-contained (CSS + JS inline) and therefore portable.
#   - The page reads the status code from the placeholder and picks an
#     appropriate message (4xx vs 5xx). It presents a tiled "Error!!" background
#     and a centered bracketed message with subtle jitter / flicker.
#
# Example:
#   site.example.com {
#     import errors.inc
#     reverse_proxy 127.0.0.1:4000
#   }
#

handle_errors {
    # Force HTML content type for the error page
    header Content-Type text/html

    # Respond inline with the original status code.
    # The body is a raw string literal (backticks) so newlines are preserved.
    # We use placeholder {http.error.status_code} both in the HTML (for JS)
    # and as the respond status argument to preserve the status code.
    respond `
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Erreur — {http.error.status_code}</title>
<meta name="robots" content="noindex,nofollow" />
<style>
  :root{
    --bg-dark:#120000;
    --tile:#d22b2b;
    --flash-bg:rgba(0,0,0,0.85);
    --flash-color:#fff;
    --tile-w:120px;
    --tile-h:40px;
    --tile-font:20px monospace;
  }
  html,body{height:100%;margin:0;background:var(--bg-dark);font-family:ui-monospace,monospace;color:var(--tile)}
  .page{position:relative;height:100vh;overflow:hidden;background:linear-gradient(180deg,#0b0000 0%, #170000 100%)}
  #tile{position:absolute;inset:0;display:grid;grid-template-columns:repeat(auto-fill,var(--tile-w));grid-auto-rows:var(--tile-h);place-items:center;gap:12px;pointer-events:none}
  #tile span{color:var(--tile);font:var(--tile-font);opacity:.95;transform-origin:center;transition:transform .6s,opacity .4s;text-shadow:0 1px 0 rgba(0,0,0,.25)}
  .flash{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--flash-bg);color:var(--flash-color);padding:12px 20px;border-radius:6px;border:3px solid rgba(255,255,255,0.06);font-weight:800;letter-spacing:.8px;z-index:10;box-shadow:0 8px 36px rgba(0,0,0,.6)}
  .fatal .flash{padding:14px 24px;font-size:20px}
  .page::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.01) 0.5px, transparent 0.5px);background-size:100% 4px;opacity:.28;pointer-events:none;mix-blend-mode:overlay}
  @media (max-width:700px){:root{--tile-w:80px;--tile-h:28px;--tile-font:14px monospace}.flash{font-size:14px;padding:8px 12px}}
  @media (prefers-reduced-motion: reduce){.flash,#tile span,.page::before{animation:none!important;transition:none!important}}
</style>
</head>
<body class="page" data-status="{http.error.status_code}">
  <div id="tile" aria-hidden="true"></div>
  <div id="flash" class="flash">[ ERROR ]</div>

  <script>
  (function(){
    'use strict';
    // Read status from the data attribute inserted by Caddy placeholder
    var raw = document.documentElement.dataset.status || '{http.error.status_code}';
    var status = parseInt(raw,10);
    if (!isFinite(status)) status = null;
    var severity = (status && status >= 500) ? '5xx' : '4xx';

    // Messages grouped by severity (customize here)
    var M = {
      '4xx': ['[ NOT FOUND ]','[ BAD REQUEST ]','[ UNAUTHORIZED ]','[ FORBIDDEN ]','[ GONE ]'],
      '5xx': ['[ FATAL ]','[ CRITICAL ]','[ SERVER ERROR ]','[ PANIC ]','[ OUT OF MEMORY ]'],
      'default': ['[ ERROR ]']
    };

    var pool = ['Error!!','Error!!','Error!!','Error!','!!Error!!','ERR!','!!!ERR!!!','E R R O R'];

    function buildGrid(){
      var tile = document.getElementById('tile');
      if(!tile) return;
      while(tile.firstChild) tile.removeChild(tile.firstChild);
      var w = 120, h = 40;
      try{
        var s = getComputedStyle(document.documentElement);
        w = parseInt(s.getPropertyValue('--tile-w')) || w;
        h = parseInt(s.getPropertyValue('--tile-h')) || h;
      }catch(e){}
      var cols = Math.ceil(window.innerWidth / w)+2;
      var rows = Math.ceil(window.innerHeight / h)+2;
      var total = Math.max(24, cols*rows);
      var frag = document.createDocumentFragment();
      for(var i=0;i<total;i++){
        var sp = document.createElement('span');
        sp.textContent = pool[Math.floor(Math.random()*pool.length)];
        var r = (Math.random()*8-4).toFixed(2);
        var sc = (0.9 + Math.random()*0.35).toFixed(2);
        sp.style.transform = 'skew(-5deg) rotate('+r+'deg) scale('+sc+')';
        sp.style.opacity = (0.6 + Math.random()*0.4).toFixed(2);
        frag.appendChild(sp);
      }
      tile.appendChild(frag);
    }

    function randomizeFlash(){
      var flash = document.getElementById('flash');
      if(!flash) return;
      var messages = M[severity] || M['default'];
      if(Math.random() < 0.35){
        flash.textContent = messages[Math.floor(Math.random()*messages.length)];
      } else if(status && Math.random() < 0.25){
        flash.textContent = '[ '+status+' ]';
      } else {
        flash.textContent = messages[Math.floor(Math.random()*messages.length)];
      }
      var maxX = Math.min(window.innerWidth*0.22,260);
      var maxY = Math.min(window.innerHeight*0.22,180);
      var ox = Math.round((Math.random()*2-1)*maxX);
      var oy = Math.round((Math.random()*2-1)*maxY);
      flash.style.transform = 'translate(calc(-50% + '+ox+'px), calc(-50% + '+oy+'px))';
    }

    buildGrid();
    randomizeFlash();
    var jitter = setInterval(randomizeFlash, 2200 + Math.random()*1600);
    var flick = setInterval(function(){
      var tile = document.getElementById('tile');
      if(!tile) return;
      var spans = tile.children;
      if(!spans || spans.length===0) return;
      for(var i=0;i<6;i++){
        var idx = Math.floor(Math.random()*spans.length);
        var s = spans[idx];
        if(s){
          s.textContent = pool[Math.floor(Math.random()*5)];
          s.style.opacity = (0.6 + Math.random()*0.4).toFixed(2);
          s.style.transform = 'skew(-5deg) rotate('+((Math.random()*8-4).toFixed(2))+'deg) scale('+(0.9 + Math.random()*0.35).toFixed(2)+')';
        }
      }
    }, 1200 + Math.random()*1600);

    var rt=null;
    window.addEventListener('resize', function(){
      clearTimeout(rt);
      rt = setTimeout(buildGrid, 200);
    });

    document.addEventListener('visibilitychange', function(){
      if(document.hidden){ clearInterval(jitter); clearInterval(flick); }
      else { buildGrid(); randomizeFlash(); }
    });

    // Add severity class for styling tweaks
    if(severity === '5xx') document.body.classList.add('fatal');

  })();
  </script>
</body>
</html>
` {http.error.status_code}

    # If your Caddy build does NOT accept placeholders as the numeric status
    # in the `respond` directive (validation error), uncomment the fallback
    # blocks below to use class-preserving statuses (400 for 4xx, 500 for 5xx).
    #
    # The fallback returns a visually identical page but uses the class code
    # instead of the exact original code.
    #
    # @client status 400..499
    # respond `<!doctype html>...` 400
    #
    # @server status 500..599
    # respond `<!doctype html>...` 500
}
