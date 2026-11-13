/* Light / dark mode. Loaded first in <head> of the shell, the sign-in pages and (injected by the server) every widget,
   so the right theme is on <html data-theme> before anything paints. The choice lives in localStorage; the widgets
   run in iframes on the same origin, so they hear about a change through the "storage" event, and the shell also
   posts it to them in case storage is blocked. Dark is the default. */
(function () {
  // Skin: the liquid glass look by default; localStorage 'hc-skin' = 'classic' brings back ember and signal (see theme/liquid.css).
  var skin = 'liquid'; try { if (localStorage.getItem('hc-skin') === 'classic') skin = 'classic'; } catch (e) { /* default */ }
  document.documentElement.setAttribute('data-hc-skin', skin);
  var KEY = 'hc-theme', root = document.documentElement, memory = null;
  function read() {
    try { var v = localStorage.getItem(KEY); if (v) return v === 'light' ? 'light' : 'dark'; } catch (e) { /* blocked storage: use memory */ }
    return memory || 'dark';
  }
  function paint(theme) {
    root.setAttribute('data-theme', theme);
    var label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) { buttons[i].setAttribute('aria-label', label); buttons[i].title = label; }
  }
  function set(theme) {
    memory = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
    paint(theme);
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) { try { frames[i].contentWindow.postMessage({ type: 'hc-theme', theme: theme }, location.origin); } catch (e) { /* not ready */ } }
  }
  var SUN = '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
  var MOON = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>';
  function mount() {
    var slots = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < slots.length; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'theme-toggle'; b.innerHTML = SUN + MOON;
      b.addEventListener('click', function () { set(read() === 'light' ? 'dark' : 'light'); });
      slots[i].replaceWith(b);
    }
    paint(read());
  }
  window.hcTheme = { get: read, set: set };
  paint(read());
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(read()); });
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'hc-theme') { memory = e.data.theme; paint(e.data.theme === 'light' ? 'light' : 'dark'); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
