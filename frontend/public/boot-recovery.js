// Boot recovery: gets the app out of the boot screen when its entry module cannot load.
//
// The usual cause is version skew: an index.html from one deployment pointing at hashed
// files the server has since replaced. A module graph that fails to load never runs a
// line of the app, so nothing in the bundle can recover — this has to live outside it.
// A failed graph fires `error` on its <script type="module">; errors do not bubble, so
// the listener captures them on window.
//
// First failure: a plain reload, which fetches a fresh shell. Second one within the
// window: the cached shell itself is broken, so the service workers and their caches
// go before reloading — the next load comes straight from the network. Past that,
// stop: a reload loop is worse than the boot screen. Offline, nothing is attempted.
//
// Classic script, outside the bundle and loaded before it: the CSP forbids inline
// scripts, and an ES module would fail along with the graph it is meant to rescue.
;(function () {
  var KEY = 'skol.bootRecovery'
  var WINDOW_MS = 60 * 1000

  function readAttempts() {
    try {
      var last = JSON.parse(sessionStorage.getItem(KEY) || 'null')
      return last && Date.now() - last.at < WINDOW_MS ? last.attempts : 0
    } catch (e) {
      return 0
    }
  }

  function writeAttempts(attempts) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ attempts: attempts, at: Date.now() }))
    } catch (e) {
      // Private mode: without the guard, one reload is all we allow ourselves.
    }
  }

  function resetServiceWorker() {
    var jobs = []
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (reg) { return reg.unregister() }))
        }),
      )
    }
    if (window.caches) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key) }))
        }),
      )
    }
    return Promise.all(jobs).catch(function () {})
  }

  function recover() {
    if (!navigator.onLine) return
    var attempts = readAttempts()
    if (attempts >= 2) return
    writeAttempts(attempts + 1)
    if (attempts === 0) return window.location.reload()
    resetServiceWorker().then(function () { window.location.reload() })
  }

  function onError(event) {
    var target = event.target
    if (!target || target.tagName !== 'SCRIPT' || target.type !== 'module') return
    window.removeEventListener('error', onError, true)
    recover()
  }

  window.addEventListener('error', onError, true)
})()
