# browser-fullsend

<img src="icons/icon128.png" width="64" align="right" alt="">

Video fullscreen that stays inside the browser window.

Click the fullscreen button on any web player and the video fills the browser
window. The operating system window keeps its size and position, so the video
sits where you put it: half a monitor, a corner, a second screen next to your
work. Escape or the same button brings the page back.

No build step, no background process, no network access, no data collection.
One content script and one stylesheet.

Status: proof of concept, version 0.2.0. The bundled test page was checked
by hand in Helium on 2026-11-09. The YouTube handling of this version is
awaiting the same check, see [Known gaps](#known-gaps). See
[Browser support](#browser-support) for what the code relies on.

## Install

### From source, any Chromium browser

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on Developer mode, top right.
4. Click Load unpacked and pick the repository folder. From Windows with the
   repository in WSL the path looks like
   `\\wsl$\<distro>\home\<user>\github-repos\drzo1dberg\browser-fullsend`,
   where `<distro>` is the output of `echo $WSL_DISTRO_NAME` inside WSL.

After pulling a new version, press the reload icon on the extension card and
reload the tabs you want it in.

### From a store

Not published yet. The manifest, icons and description are store ready, the
listing is the next step.

## Browser support

Version numbers are the minimum versions in MDN's browser compat data for the
four features the extension relies on. Tested means a person loaded the
extension and ran the checks under [Verify](#verify).

| Browser | Minimum version | Status | Notes |
|---|---|---|---|
| Helium | current | tested | Chromium based, everything below applies |
| Chrome | 114 | untested | expected to work, same engine as Helium |
| Edge | 114 | untested | expected to work, same engine |
| Brave, Vivaldi, Opera, ungoogled-chromium | Chromium 114 | untested | expected to work, same engine |
| Firefox | 128 | untested | temporary loading via `about:debugging` works without changes, signing for addons.mozilla.org needs an ID in `browser_specific_settings.gecko.id`. `controlsList` is not implemented, so the fullscreen button of the browser's own video controls is caught by the safety net and shows one flash. Firefox also ships the pref `full-screen-api.ignore-widgets`, described in its source as "whether to prevent the top level widget from going fullscreen", which may give the same effect without an extension, untested here |
| Safari | 18 | untested | needs packaging through Xcode, `controlsList` not implemented, same safety net behaviour as Firefox |

What the numbers come from, per feature, as Chrome / Edge / Firefox / Safari:

| Feature | Used for | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|---|
| Manifest V3 | the manifest | 88 | 88 | 109 | 15.4 |
| `content_scripts.world: "MAIN"` | running in the page's own JavaScript realm | 111 | 111 | 128 | 18 |
| Popover API | lifting the player into the top layer | 114 | 114 | 125 | 17 |
| `HTMLMediaElement.controlsList` | hiding the native fullscreen button | 58 | 58 | not implemented | not implemented |

Source: [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data),
files `api/HTMLElement.json`, `api/HTMLMediaElement.json`,
`webextensions/manifest/content_scripts.json`,
`webextensions/manifest/manifest_version.json`, read on 2026-11-09.

## How it works

Pages enter fullscreen through the Fullscreen API. The browser then does two
things at once: it lays the element over the viewport and it switches the
operating system window to fullscreen. There is no switch between the two, so
the extension steps in before the page reaches the API.

- `Element.prototype.requestFullscreen` and the `webkit` aliases are replaced.
  The element gets a CSS class, `style.css` pins it to the viewport.
- The element is lifted into the browser's top layer with the Popover API,
  `popover="manual"` plus `showPopover()`. That is the same layer real
  fullscreen uses, so it escapes every stacking context and every transformed
  ancestor on the page. Without the API the z-index styling is the fallback.
- `document.fullscreenElement`, `fullscreenEnabled` and the `webkit` variants
  report the faked state, and `fullscreenchange` fires, so players switch to
  their own fullscreen layout as if it were real.
- Some pages request fullscreen for `<html>` itself and expect the browser to
  fill the screen with the page. YouTube's watch page does this. Lifting
  `<html>` would blank the page, so the extension reports `<html>` as the
  fullscreen element but visually lifts the box around the largest video, the
  outermost ancestor whose rectangle still matches the video's.
- `screen.width` and `screen.height` return the window size.
- Escape leaves the faked fullscreen, as it does for the real one.
- Inside an iframe the script asks its parent frame to do the same with the
  iframe element, so embedded players work too.
- The browser's own media controls do not go through the JavaScript API, their
  fullscreen button calls the engine directly. Two layers handle that. The
  button is hidden via `controlsList="nofullscreen"` and double click on a
  video becomes the entry point instead. If something still reaches real
  fullscreen, a `fullscreenchange` listener leaves it immediately and fakes
  it. That path shows one visible flash, the operating system window is
  already fullscreen when the event fires.
- Every enter and exit logs one `[fullsend]` line to the console with the
  requested element and the lifted one.

## Verify

1. Open `test/index.html` in the browser with the extension loaded.
2. Click `requestFullscreen()`. Expected: the video fills the browser window,
   the operating system window does not change, the status line reads
   `fullscreenElement=VIDEO` and `screen` equals `inner`.
3. Press Escape. Expected: the page is back to normal and the status line
   reads `fullscreenElement=null`.
4. Native controls: the fullscreen icon in the video's control bar is gone.
   Double click the video. Expected: same as step 2, no flash. A flash means
   the engine still toggled real fullscreen and the safety net took over.
5. YouTube watch page: double click, the player's fullscreen button and the
   `f` key, then Escape. All go through the JavaScript API, no flash
   expected. With F12 open, the Console tab shows one `[fullsend]` line per
   enter and exit, for example
   `enter html lift div#movie_player.html5-video-player`.

Checks that run without a browser:

```
node --check inject.js
node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))'
python3 -I icons/make-icons.py
```

## Known gaps

- YouTube: the previous version blanked the page because the watch page
  requests fullscreen for `<html>`. The fix in this version, lifting the
  player box instead, is not yet confirmed in a browser, and neither is the
  player's own fullscreen button.
- Anything that enters real fullscreen outside the JavaScript API is caught
  only after the operating system window changed, which shows as a short
  flash.
- When a page requests fullscreen for `<html>` and no video box can be
  matched, for example a letterboxed player, only the state is faked and the
  layout is left to the page.
- Sites that style their player with the `:fullscreen` pseudo class only get
  the generic pin-to-viewport styling, not their own fullscreen layout.
- Sites that compare `window.outerHeight` with `screen.height` still see a
  mismatch.

## Privacy

The extension runs on every page because video can be anywhere. It reads
nothing from the page except the element that asked for fullscreen and the
video elements on it. It stores nothing, sends nothing, and has no
permissions beyond the content script itself.

## Project layout

| Path | Purpose |
|---|---|
| `manifest.json` | Manifest V3, one content script, icons |
| `inject.js` | the hooks, runs in the page's main world |
| `style.css` | pins the lifted element to the viewport |
| `icons/` | PNG icons and the script that renders them |
| `test/index.html` | manual check with a native video player |

## License

MIT, see `LICENSE`.
