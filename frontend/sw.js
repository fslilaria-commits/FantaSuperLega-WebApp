// Service worker minimo per rendere l'app installabile sul telefono.
// Sempre prima la rete (così dopo ogni aggiornamento si vede subito la versione nuova); la copia salvata
// serve solo se manca la connessione. I dati di Firebase e degli altri siti non passano mai di qui,
// e nemmeno le proposte del bot (../data) o le richieste con parametri: vanno sempre in rete e non si salvano.
const CACHE = 'fantasuperlega-v2';
const APP = new URL('./', self.location).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(nomi => Promise.all(nomi.filter(n => n !== CACHE).map(n => caches.delete(n))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.search || !url.pathname.startsWith(APP)) return;
    event.respondWith(
        fetch(event.request)
            .then(risposta => {
                if (risposta.ok) {
                    const copia = risposta.clone();
                    caches.open(CACHE).then(cache => cache.put(event.request, copia));
                }
                return risposta;
            })
            .catch(() => caches.match(event.request)),
    );
});
