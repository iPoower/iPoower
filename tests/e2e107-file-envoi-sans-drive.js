// Lot S · complément : file d'envoi qui survit au rechargement, données visibles sans Drive, badge lisible à toutes les
// largeurs. Vraie app, Drive simulé partagé entre deux appareils (aucun appel Google), données fictives.
//  1b. Drive coupé : une modification, puis un rechargement, puis une reconnexion simulée ⇒ exactement UN envoi, qui contient
//      la modification (relue par l'autre appareil), pas de doublon, pas de perte ; compteur et liste conservés sur
//      l'appareil (jamais sur Drive, aucun jeton stocké) ; le badge revient à 0.
//  1c. Drive coupé (jeton expiré) : Garage, trajets et alertes affichés, aucun écran bloquant, badge « Reconnexion requise ».
//  1e. Heure entière de la dernière copie visible dans le badge à 375, 414 et 1280 px, sans agrandir le bandeau (captures).
'use strict';
const fs = require('fs'), path = require('path');
const { session, BR, errors } = require('./lib/context-session');
const activateJournal = require('./lib/journal-activation');
const AT = '2026-11-16T07:00:00+01:00', SP = process.env.SP || '.';
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 500)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 500)); } };
// Drive simulé partagé (côté Node) : chaque révision envoyée est comptée, par appareil.
const DRIVE = { files: {}, profiles: {}, n: 0, revisions: [] };
const exposeDrive = async p => { await p.exposeFunction('fxDriveGet', () => JSON.stringify(DRIVE)); await p.exposeFunction('fxDrivePut', t => { Object.assign(DRIVE, JSON.parse(t)); }); };
const installDrive = (p, device) => p.evaluate(async device => {
  const st = async () => JSON.parse(await window.fxDriveGet()), put = s => window.fxDrivePut(JSON.stringify(s));
  const b64 = u => { let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const unb = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const download = async ref => { const f = (await st()).files[ref.fileId], bytes = unb(f.bytes); return { packet: { copyBytes: () => bytes.slice() }, proof: { ...ref, state: 'verified-bytes', verifiedAt: Date.now() } }; };
  const provider = { disconnect() {},
    async reserveId() { const s = await st(); s.n++; await put(s); return 'file_' + s.n; },
    async profiles() { return Object.values((await st()).profiles).map(x => ({ fileId: x.fileId, bytes: unb(x.bytes), sha256: x.sha256 })); },
    async uploadProfile(fileId, folder, bytes) { const s = await st(); const sha256 = await hex(bytes); s.profiles[fileId] = { fileId, bytes: b64(bytes), sha256 }; await put(s); return { fileId, bytes: bytes.slice(), sha256 }; },
    async list() { return Object.values((await st()).files).map(f => f.ref); },
    async download(ref) { return download(ref); },
    async uploadRevision(fileId, folder, packet, rev) {
      const s = await st(); const bytes = packet.copyBytes();
      if (!s.files[fileId]) { s.files[fileId] = { bytes: b64(bytes), by: device, ref: { fileId, fileSha256: await hex(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: JSON.parse(JSON.stringify(rev)), state: 'unverified' } }; s.revisions.push({ id: rev.id, device }); }
      await put(s); return download(s.files[fileId].ref);
    } };
  window.TWRC_DRIVE_CONFIGURED = true; DRIVE_UI.config = DRIVE_UI.config || { raceOrigin: location.origin };
  DRIVE_UI.session = { connected: true, disconnect() {}, prepare: async () => {} }; DRIVE_UI.prepared = true; DRIVE_UI.prep = 'ready';
  DRIVE_UI.sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999', onChange: driveOnChange, onApplied: () => { S = loadSettings(); rebuild(); renderAll(); } });
  DRIVE_UI.sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); DRIVE_UI.selected = true;
  // Sans drive-config.json servi, initDriveSync ne câble pas l'écouteur : le banc branche le MÊME gestionnaire que l'app.
  if (!window.__wired) { window.__wired = true; for (const key of Object.keys(DRIVE_USER_PART)) DRIVE_BADGE.sig[key] = driveUserPart(key); window.addEventListener('twrc-vault-change', driveVaultChange); }
  renderDriveSync();
}, device);
// Session Google expirée (même effet que le minuteur de l'app) : liaison confirmée connue, Google déjà préparé.
const cut = p => p.evaluate(() => {
  DRIVE_UI.config = DRIVE_UI.config || { raceOrigin: location.origin };
  if (DRIVE_UI.sync) DRIVE_UI.sync.stop(); DRIVE_UI.selected = false;
  DRIVE_UI.session = { connected: false, disconnect() {}, prepare: async () => {} }; DRIVE_UI.prepared = true; DRIVE_UI.prep = 'ready';
  DRIVE_UI.hint = { folder: 'dossier-fictif', binding: 'a'.repeat(64) };
  if (!window.__wired) { window.__wired = true; for (const key of Object.keys(DRIVE_USER_PART)) DRIVE_BADGE.sig[key] = driveUserPart(key); window.addEventListener('twrc-vault-change', driveVaultChange); }
  driveSessionLost(); renderDriveSync();
});
const stabilize = async (p, s) => { for (let i = 0; i < 3; i++) { await p.evaluate(async () => { await TWRC_VAULT.flush(); await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); }); await s.settle(2); } };
const badge = p => p.evaluate(() => { const b = document.getElementById('driveBadge'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), aria: b.getAttribute('aria-label'), key: b.dataset.key, n: DRIVE_BADGE.pending, list: DRIVE_BADGE.list.map(x => x.part) } : null; });
(async () => {
  const b = await BR.launch();
  try {
    // ---------- A (PC) et B (iPhone) partagent le même Drive simulé ----------
    const sa = await session(b, { at: AT, dev: 'pc' }), pa = sa.p; await sa.settle(6);
    await exposeDrive(pa); await activateJournal(pa); await installDrive(pa, 'A'); await stabilize(pa, sa);
    const sb = await session(b, { at: AT, dev: 'iphone' }), pb = sb.p; await sb.settle(6);
    await exposeDrive(pb); await activateJournal(pb); await installDrive(pb, 'B'); await stabilize(pb, sb); await stabilize(pa, sa); await stabilize(pb, sb);
    const nameB0 = await pb.evaluate(() => S.cars[0].name);
    expect('contexte : A et B synchronisés sur le Drive simulé, sans conflit', (await pa.evaluate(() => DRIVE_UI.sync.status.conflicts.length)) === 0 && (await pb.evaluate(() => DRIVE_UI.sync.status.conflicts.length)) === 0, JSON.stringify(DRIVE.revisions));
    // ---------- 1b. Drive coupé, une modification, rechargement ----------
    await cut(pa); await sa.settle(1);
    const rev0 = DRIVE.revisions.length;
    await pa.evaluate(async () => { S.cars[0].name = 'Voiture fictive modifiée'; saveSettings(); await TWRC_VAULT.flush(); }); await sa.settle(2);
    const b1 = await badge(pa);
    expect('Drive coupé : modification comptée (1) et listée (heure et nature seulement), aucun envoi', b1 && b1.n === 1 && b1.list.join() === 'réglages' && DRIVE.revisions.length === rev0, JSON.stringify(b1));
    const raw = await pa.evaluate(() => { const R = window.TWRC_RAW_STORAGE; let all = ''; for (let i = 0; R && i < R.length; i++) all += R.key(i) + '=' + R.getItem(R.key(i)) + '\n';
      return { mem: lsGet(DRIVE_BADGE_KEY), device: SyncMerge.device(DRIVE_BADGE_KEY), plain: R ? R.getItem(DRIVE_BADGE_KEY) : 'stockage brut absent', clear: /réglages|pendingSince/.test(all) }; });
    expect('file d’attente : sur l’appareil (clé propre à l’appareil, chiffrée dans le coffre), sans jeton ni valeur saisie', raw.device === true && raw.plain === null && raw.clear === false && !/Voiture fictive|token|jeton|access/i.test(raw.mem || ''), JSON.stringify(raw).slice(0, 300));
    await pa.reload(); await sa.settle(12); await exposeDrive(pa).catch(() => {}); await cut(pa); await sa.settle(2);
    const b2 = await badge(pa);
    expect('après rechargement : compteur et liste conservés, badge « Reconnexion requise »', b2 && b2.n === 1 && b2.list.join() === 'réglages' && b2.key === 'reconnect' && /Reconnexion requise|Reconnecter/.test(b2.text), JSON.stringify(b2));
    // ---------- 1c. Données visibles sans Drive ----------
    const vis = {};
    for (const v of ['garage', 'trajet', 'pneus']) { await pa.evaluate(v => { UI.view = v; renderAll(); scrollTo(0, 0); }, v); await sa.settle(4);
      vis[v] = await pa.evaluate(() => ({ text: document.body.innerText.slice(0, 40000), blocking: [...document.querySelectorAll('dialog[open], .modal, .overlay, [aria-modal="true"]')].filter(e => e.offsetParent !== null).length })); }
    expect('sans Drive : Garage affiche les voitures (dont la modification locale)', /Voiture fictive modifiée/.test(vis.garage.text), vis.garage.text.slice(0, 200));
    expect('sans Drive : trajets affichés', /domicile|Trajet|trajet/.test(vis.trajet.text) && /\d\d:\d\d/.test(vis.trajet.text), vis.trajet.text.slice(0, 200));
    expect('sans Drive : alertes et verdict affichés', /ICI, MAINTENANT|ALERTES|Alertes|VIGILANCE|PRUDENCE|RAS|BON/.test(vis.pneus.text), vis.pneus.text.slice(0, 200));
    expect('sans Drive : aucun écran bloquant', Object.values(vis).every(x => x.blocking === 0), JSON.stringify(Object.fromEntries(Object.entries(vis).map(([k, x]) => [k, x.blocking]))));
    // ---------- 1b. Reconnexion simulée : exactement un envoi, contenant la modification ----------
    await installDrive(pa, 'A'); await stabilize(pa, sa); await stabilize(pa, sa);
    const sent = DRIVE.revisions.slice(rev0);
    expect('reconnexion : exactement un envoi (aucun doublon)', sent.length === 1 && sent[0].device === 'A', JSON.stringify(sent));
    const b3 = await badge(pa);
    expect('reconnexion : badge revenu à 0, liste vidée, « À jour »', b3 && b3.n === 0 && b3.list.length === 0 && b3.key === 'synced', JSON.stringify(b3));
    await stabilize(pb, sb);
    const nameB = await pb.evaluate(() => ({ name: S.cars[0].name, conflicts: DRIVE_UI.sync.status.conflicts.length }));
    expect('l’envoi contient la modification : relue par B, aucun conflit, aucune perte', nameB.name === 'Voiture fictive modifiée' && nameB.conflicts === 0 && nameB0 !== nameB.name, JSON.stringify(nameB));
    expect('aucun envoi supplémentaire après stabilisation', DRIVE.revisions.slice(rev0).filter(r => r.device === 'A').length === 1, JSON.stringify(DRIVE.revisions.slice(rev0)));
    await sb.c.close(); await sa.c.close();
    // ---------- 1e. Badge à 375, 414 et 1280 px : heure entière, bandeau non agrandi ----------
    for (const [dev, width] of [['iphone', 375], ['iphone', 414], ['pc', 1280]]) {
      const s = await session(b, { at: AT, dev }), p = s.p; if (width !== 414 && dev === 'iphone') await p.setViewportSize({ width, height: 812 }); await s.settle(6);
      const h0 = await p.evaluate(() => { scrollTo(0, 0); return document.querySelector('.statusbar').getBoundingClientRect().height; });
      for (const state of ['reconnect', 'preparing', 'synced']) {
        const m = await p.evaluate(({ state }) => {
          DRIVE_UI.config = { raceOrigin: location.origin }; DRIVE_UI.hint = { folder: 'dossier-fictif', binding: 'a'.repeat(64) };
          DRIVE_BADGE.syncedAt = new Date('2026-11-16T06:42:00+01:00').getTime(); DRIVE_BADGE.pending = state === 'synced' ? 0 : 2; DRIVE_BADGE.pendingSince = DRIVE_BADGE.pending ? Date.now() - 14 * 60e3 : 0; DRIVE_BADGE.loaded = true;
          DRIVE_UI.prepared = state !== 'preparing'; DRIVE_UI.prep = state === 'preparing' ? 'preparing' : 'ready';
          DRIVE_UI.session = { connected: state === 'synced', disconnect() {}, prepare: async () => {} }; DRIVE_UI.selected = state === 'synced';
          DRIVE_UI.status = state === 'synced' ? { state: 'SYNCED', message: 'synchronisé', conflicts: [] } : null; renderDriveBadge();
          const bar = document.querySelector('.statusbar').getBoundingClientRect(), b = document.getElementById('driveBadge'), at = b && b.querySelector('.db-at'), r = at && at.getBoundingClientRect(), br = b && b.getBoundingClientRect();
          // Éléments de la première ligne du bandeau : aucun chevauchement (LIVE, horloge, badge Drive, ⟳).
          const boxes = ['#weatherBadge', '.live-clock-wrap', '#driveBadge', '.status-refresh'].map(q => { const e = document.querySelector(q), x = e && e.getBoundingClientRect(); return x && x.width ? { q, l: x.left, r: x.right, t: x.top } : null; }).filter(Boolean);
          const overlap = boxes.flatMap((x, i) => boxes.slice(i + 1).filter(y => Math.abs(x.t - y.t) < 20 && x.l < y.r - 0.5 && y.l < x.r - 0.5).map(y => x.q + '/' + y.q));
          const inner = document.querySelector('.statusbar .in'); window.__geo = { cols: inner && getComputedStyle(inner).gridTemplateColumns, w: inner && inner.clientWidth, boxes, kids: inner ? [...inner.children].map(e => (e.id || e.className) + ':' + Math.round(e.getBoundingClientRect().width) + '@' + getComputedStyle(e).gridColumnStart + '/' + getComputedStyle(e).gridRowStart + (getComputedStyle(e).display === 'contents' ? '(contents)' : '')) : [] };
          const ic = b && b.querySelector('.db-ic'), ir = ic && ic.getBoundingClientRect(), tl = b && b.querySelector('.db-tail'), tr = tl && tl.getBoundingClientRect();
          const inside = x => !x || (x.left >= br.left - 0.5 && x.right <= br.right + 0.5);
          return { icon: !!ir && ir.width > 0 && inside(ir), tail: inside(tr) && (!tl || tl.scrollWidth <= tl.clientWidth + 1), geo: window.__geo, overlap, key: b && b.dataset.key, text: b && b.textContent, at: at && at.textContent, atW: at && at.scrollWidth, atC: at && at.clientWidth, inBadge: !!(r && br && r.left >= br.left - 0.5 && r.right <= br.right + 0.5), inView: !!(r && r.left >= 0 && r.right <= innerWidth), bar: bar.height, visible: !!(r && r.width > 0) };
        }, { state });
        expect(`${width} px · ${state} : heure entière de la dernière copie visible (06:42), sans points de suspension, bandeau non agrandi`,
          m.visible && /06:42$/.test((m.at || '').trim()) && m.atW <= m.atC + 1 && m.inBadge && m.inView && m.bar - h0 <= (width < 1000 ? 10 : 1), JSON.stringify(m));
        expect(`${width} px · ${state} : icône d’état et nombre de modifications visibles en entier (seul le libellé se raccourcit)`, m.icon && m.tail, JSON.stringify({ icon: m.icon, tail: m.tail, text: m.text }));
        expect(`${width} px · ${state} : aucun chevauchement dans le bandeau (LIVE, horloge, badge, ⟳)`, m.overlap.length === 0, JSON.stringify(m.overlap));
        await p.screenshot({ path: path.join(SP, `badge-${width}px-${state}.png`), clip: { x: 0, y: 0, width, height: 120 } });
      }
      await s.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
