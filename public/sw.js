/* AMINNOVA privacy-safe PWA service worker */
'use strict';
var CACHE = 'aminnova-shell-v9-arena-ai';
var SHELL = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
var PRIVATE_PREFIXES = ['/api/', '/sub/', '/ws', '/healthz', '/connect', '/e'];
function isPrivatePath(path) { return PRIVATE_PREFIXES.some(function (prefix) { return path.indexOf(prefix) === 0; }); }
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;
  if (req.mode === 'navigate') {
    if (url.pathname !== '/') return;
    event.respondWith(fetch(req).then(function (res) {
      if (!res.ok) return res;
      var copy = res.clone();
      return caches.open(CACHE).then(function (cache) { return cache.put('/', copy); }).then(function () { return res; });
    }).catch(function () { return caches.match('/'); }));
    return;
  }
  if (url.search || SHELL.indexOf(url.pathname) < 0) return;
  event.respondWith(caches.match(req).then(function (cached) {
    var network = fetch(req).then(function (res) {
      if (!res.ok) return res;
      return caches.open(CACHE).then(function (cache) { return cache.put(req, res.clone()); }).then(function () { return res; });
    });
    if (cached) { event.waitUntil(network.catch(function () {})); return cached; }
    return network;
  }));
});
