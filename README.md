# browser-fullsend

Chromium extension that keeps video fullscreen inside the browser window.
Click the fullscreen button on any player and the video fills the window,
the OS window itself stays where it is and keeps its size.

Status: proof of concept. Browser behaviour is unverified so far, only the
syntax checks below and a Node stub test of the hook logic have run.

## How it works

Pages enter fullscreen through the Fullscreen API. The browser then both
lays the element over the viewport and switches the OS window to fullscreen.
The extension replaces the API entry points in the page before the page can
call them:

- `Element.prototype.requestFullscreen` and the `webkit` aliases add a CSS
  class to the element. `style.css` pins that element to the viewport.
- `document.fullscreenElement`, `fullscreenEnabled` and the `webkit` variants
  report the faked state, and `fullscreenchange` fires, so players update
  their own UI as if fullscreen were real.
- `screen.width` and `screen.height` return the window size.
- Escape leaves the faked fullscreen, as it does for the real one.
- Inside an iframe the script asks its parent frame to do the same with the
  iframe element, so embedded players work too.

Everything is one content script in the page's main world, no build step,
no background worker, no permissions beyond the content script itself.

## Install in Helium or any Chromium

1. Open `chrome://extensions`.
2. Enable Developer mode, top right.
3. Load unpacked, pick this directory. From Windows with the repo in WSL
   the path looks like `\\wsl$\Ubuntu\home\<user>\github-repos\drzo1dberg\browser-fullsend`.

## Verify

1. Open `test/index.html` in the browser with the extension loaded.
2. Click `requestFullscreen()`.
3. Expected: the video fills the browser window, the OS window does not
   change, the status line reads `fullscreenElement=VIDEO` and `screen`
   equals `inner`.
4. Press Escape. Expected: the page is back to normal and the status line
   reads `fullscreenElement=null`.

Then try a real player such as a YouTube watch page and its fullscreen button.

Syntax checks without a browser:

```
node --check inject.js
node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))'
```

## Known gaps

- Sites that style their player with the `:fullscreen` pseudo class only get
  the generic pin-to-viewport styling, not their own fullscreen layout.
- Sites that compare `window.outerHeight` with `screen.height` still see a
  mismatch.
- Firefox is not covered. The pref `full-screen-api.ignore-widgets` is
  reported to give the same behaviour there and is untested here.

## License

MIT, see `LICENSE`.
