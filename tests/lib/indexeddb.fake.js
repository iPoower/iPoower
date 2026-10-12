'use strict';
// Transactions et structured clone de CryptoKey pour les tests unitaires.
// La persistance IndexedDB réelle reste obligatoire dans Chromium et WebKit.
module.exports = function fakeIndexedDB() {
  const records = new Map(); let created = false;
  const db = {
    objectStoreNames: { contains: () => created }, createObjectStore() { created = true; }, close() {},
    transaction() {
      const tx = {}; let pending = 0, finished = false;
      const settle = () => setTimeout(() => { if (!pending && !finished) { finished = true; if (tx.oncomplete) tx.oncomplete(); } }, 0);
      const request = action => {
        const req = {}; pending++;
        setTimeout(() => {
          try { req.result = action(); if (req.onsuccess) req.onsuccess(); }
          catch (e) { tx.error = e; finished = true; if (req.onerror) req.onerror(); if (tx.onabort) tx.onabort(); }
          pending--; settle();
        }, 0);
        return req;
      };
      tx.objectStore = () => ({
        get: key => request(() => records.has(key) ? structuredClone(records.get(key)) : undefined),
        put: (value, key) => request(() => { records.set(key, structuredClone(value)); return key; }),
        delete: key => request(() => { records.delete(key); }),
        openCursor() {
          const req = {}, entries = [...records.entries()]; let index = 0; pending++;
          const step = () => setTimeout(() => {
            const entry = entries[index++];
            req.result = entry ? { key: entry[0], value: structuredClone(entry[1]), delete: () => request(() => records.delete(entry[0])), continue: step } : null;
            if (req.onsuccess) req.onsuccess();
            if (!entry) { pending--; settle(); }
          }, 0);
          step(); return req;
        }
      });
      settle(); return tx;
    }
  };
  return { records, open() { const req = {}; setTimeout(() => {
    req.result = db; if (!created && req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess();
  }, 0); return req; } };
};
