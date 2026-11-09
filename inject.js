// browser-fullsend: intercept the Fullscreen API before the browser sees it.
// Runs in the page's MAIN world at document_start, in every frame.
// The element gets a CSS class (see style.css) and the page is told it is
// fullscreen via the same properties and events the real API would use.
(() => {
  if (window.__fullsendInstalled) return;
  window.__fullsendInstalled = true;

  const CLASS = '__fullsend';
  const ROOT = '__fullsend-root';
  let fakeEl = null;   // what the page asked for, reported back as fullscreenElement
  let liftedEl = null; // what is visually filling the window, usually the same

  // Real API, saved before the overrides below. Needed for the safety net.
  const DocProto = typeof Document !== 'undefined' ? Document.prototype : null;
  const realDesc = DocProto && Object.getOwnPropertyDescriptor(DocProto, 'fullscreenElement');
  const realGet = realDesc ? realDesc.get : () => null;
  const realExit = DocProto && DocProto.exitFullscreen;

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

  // Top layer via the Popover API: escapes every stacking context and every
  // transformed ancestor, the same layer real fullscreen uses. Falls back to
  // the z-index styling in style.css when the API is missing or throws.
  function lift(el) {
    if (typeof el.showPopover !== 'function') return;
    try {
      el.setAttribute('popover', 'manual');
      el.showPopover();
    } catch (err) {
      el.removeAttribute('popover');
    }
  }

  function drop(el) {
    try {
      if (el.matches(':popover-open')) el.hidePopover();
    } catch (err) { /* not open or unsupported */ }
    el.removeAttribute('popover');
  }

  function nudge() {
    window.dispatchEvent(new Event('resize'));
  }

  function describe(el) {
    if (!el) return 'none';
    const cls = el.classList && el.classList.length ? '.' + el.classList[0] : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  }

  function isPage(el) {
    return el === document.documentElement || el === document.body;
  }

  // Pages like YouTube request fullscreen for <html> and rely on the browser
  // to fill the screen with it. Lifting <html> would blank the page, so find
  // the box around the largest video instead: the outermost ancestor whose
  // rect still matches the video's rect.
  function pickPlayer() {
    if (!document.querySelectorAll) return null;
    let video = null;
    let area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; video = v; }
    }
    if (!video) return null;
    const vr = video.getBoundingClientRect();
    const same = (r) => Math.abs(r.width - vr.width) <= 2 && Math.abs(r.height - vr.height) <= 2
      && Math.abs(r.left - vr.left) <= 2 && Math.abs(r.top - vr.top) <= 2;
    let pick = video;
    for (let a = video.parentElement; a && !isPage(a); a = a.parentElement) {
      if (same(a.getBoundingClientRect())) pick = a;
    }
    return pick;
  }

  function enter(el) {
    if (fakeEl === el) return Promise.resolve();
    if (liftedEl) { drop(liftedEl); liftedEl.classList.remove(CLASS); }
    fakeEl = el;
    liftedEl = isPage(el) ? pickPlayer() : el;
    if (liftedEl) {
      liftedEl.classList.add(CLASS);
      lift(liftedEl);
    }
    document.documentElement.classList.add(ROOT);
    console.info('[fullsend] enter', describe(el), 'lift', describe(liftedEl));
    fire();
    nudge();
    tellParent('enter');
    return Promise.resolve();
  }

  function exit() {
    if (!fakeEl) return Promise.resolve();
    if (liftedEl) { drop(liftedEl); liftedEl.classList.remove(CLASS); }
    document.documentElement.classList.remove(ROOT);
    console.info('[fullsend] exit', describe(fakeEl), 'drop', describe(liftedEl));
    fakeEl = null;
    liftedEl = null;
    fire();
    nudge();
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
  define(document, 'fullscreen', () => fakeEl !== null);
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

  // 6. Safety net: something bypassed the JS API (native media controls call
  //    Blink directly). The OS window is already fullscreen when this fires,
  //    so leave real fullscreen at once and fake it instead. One visible flash.
  document.addEventListener('fullscreenchange', () => {
    const real = realGet.call(document);
    if (!real || real === fakeEl) return;
    console.info('[fullsend] real fullscreen caught on', describe(real));
    if (realExit) realExit.call(document);
    enter(real);
  }, true);

  // 7. Native controls: hide their fullscreen button so the C++ path is never
  //    clicked, and offer double click as the replacement entry point.
  function tame(el) {
    if (!el.controlsList || el.controlsList.contains('nofullscreen')) return;
    el.controlsList.add('nofullscreen');
  }
  function tameAll(root) {
    if (root.querySelectorAll) root.querySelectorAll('video, audio').forEach(tame);
  }
  //    The page's own double click handler runs first. Only when it changed
  //    nothing through the hooked API does the video itself get toggled.
  document.addEventListener('dblclick', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLMediaElement) || el.tagName !== 'VIDEO') return;
    e.preventDefault();
    const before = fakeEl;
    setTimeout(() => {
      if (fakeEl !== before) return;
      fakeEl === el ? exit() : enter(el);
    }, 0);
  }, true);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') tame(n);
          tameAll(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => tameAll(document));
  }
})();
