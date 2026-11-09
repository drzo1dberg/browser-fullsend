// browser-fullsend: intercept the Fullscreen API before the browser sees it.
// Runs in the page's MAIN world at document_start, in every frame.
// The element gets a CSS class (see style.css) and the page is told it is
// fullscreen via the same properties and events the real API would use.
(() => {
  if (window.__fullsendInstalled) return;
  window.__fullsendInstalled = true;

  const CLASS = '__fullsend';
  const ROOT = '__fullsend-root';
  let fakeEl = null;

  function define(obj, key, get) {
    Object.defineProperty(obj, key, { get, configurable: true });
  }

  function fire() {
    const target = fakeEl || document;
    target.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
    target.dispatchEvent(new Event('webkitfullscreenchange', { bubbles: true }));
  }

  function tellParent(action) {
    if (window !== window.parent) window.parent.postMessage({ __fullsend: action }, '*');
  }

  function enter(el) {
    if (fakeEl === el) return Promise.resolve();
    if (fakeEl) fakeEl.classList.remove(CLASS);
    fakeEl = el;
    el.classList.add(CLASS);
    document.documentElement.classList.add(ROOT);
    fire();
    tellParent('enter');
    return Promise.resolve();
  }

  function exit() {
    if (!fakeEl) return Promise.resolve();
    fakeEl.classList.remove(CLASS);
    document.documentElement.classList.remove(ROOT);
    fakeEl = null;
    fire();
    tellParent('exit');
    return Promise.resolve();
  }

  // 1. Replace the API entry points.
  Element.prototype.requestFullscreen = function () { return enter(this); };
  Element.prototype.webkitRequestFullscreen = Element.prototype.requestFullscreen;
  Element.prototype.webkitRequestFullScreen = Element.prototype.requestFullscreen;
  document.exitFullscreen = exit;
  document.webkitExitFullscreen = exit;
  document.webkitCancelFullScreen = exit;

  // 2. Report fullscreen state the way the real API does.
  define(document, 'fullscreenElement', () => fakeEl);
  define(document, 'webkitFullscreenElement', () => fakeEl);
  define(document, 'webkitCurrentFullScreenElement', () => fakeEl);
  define(document, 'fullscreenEnabled', () => true);
  define(document, 'webkitFullscreenEnabled', () => true);
  define(document, 'webkitIsFullScreen', () => fakeEl !== null);

  // 3. Make the window look like the whole screen.
  define(screen, 'width', () => window.innerWidth);
  define(screen, 'height', () => window.innerHeight);
  define(screen, 'availWidth', () => window.innerWidth);
  define(screen, 'availHeight', () => window.innerHeight);

  // 4. Escape leaves fake fullscreen, like the real one.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fakeEl) exit();
  }, true);

  // 5. Child frame went fullscreen: lift the iframe element in this frame too.
  window.addEventListener('message', (e) => {
    const action = e.data && e.data.__fullsend;
    if (!action) return;
    const frame = Array.from(document.querySelectorAll('iframe'))
      .find((f) => f.contentWindow === e.source);
    if (!frame) return;
    if (action === 'enter') enter(frame); else exit();
  });
})();
