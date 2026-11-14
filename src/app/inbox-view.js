// Boîte de dépôt · Garage : Bryan colle un bloc rc-depot-v1 préparé par Claude, relit chaque saisie (avant → après),
// puis valide ou rejette une par une. La liste vit en mémoire seulement : rien n'est stocké tant qu'aucune saisie n'est validée.
// Tout texte du bloc est affiché par esc() (jamais interprété comme du HTML). Aucun accès au journal des trajets.
const INBOX = { items: [], choice: {}, status: '', done: { accepted: 0, rejected: 0 } };
function inboxDeps() { return { switchTire, setTreadAxle, treadAxles, maxTreads: TREAD_HISTORY_MAX, addEntry: GarageEconomics.addEntry }; }
function inboxCar(item) {
  const chosen = INBOX.choice[item.key];
  return chosen ? (S.cars || []).find(c => c && c.id === chosen) || null : RcInbox.matchCar(item.entry, S.cars);
}
function inboxItemHtml(item) {
  const key = esc(item.key);
  if (!item.entry) return '<li class="inbox-item inbox-bad"><p><b>Saisie n° ' + (item.index + 1) + ' refusée</b> · ' + esc(item.error) + '</p>' +
    '<p class="inbox-actions"><button type="button" class="btn sm" data-act="inbox-reject" data-entry="' + key + '">Retirer de la liste</button></p></li>';
  const e = item.entry, car = inboxCar(item), cars = (S.cars || []).filter(c => c && c.id);
  let preview = '', blocked = '';
  if (car) { try { preview = RcInbox.apply(car, e, inboxDeps()).lines.map(l => '<li>' + esc(l) + '</li>').join(''); } catch (err) { blocked = err.message; } }
  const pick = car && !INBOX.choice[item.key] ? '' : '<label class="econ-field">Voiture concernée<select data-inbox-car="' + key + '"><option value="">— choisir —</option>' +
    cars.map(c => '<option value="' + esc(c.id) + '"' + (car && car.id === c.id ? ' selected' : '') + '>' + esc(c.short || c.name || c.id) + '</option>').join('') + '</select></label>';
  return '<li class="inbox-item"><p><b>' + esc(RcInbox.LABEL[e.type]) + '</b> · ' + esc(garageDate(e.date)) + ' · ' + esc(car ? (car.short || car.name) : '« ' + e.car + ' » introuvable') +
    ' · <span class="inbox-tag">' + (e.status === 'estimated' ? 'estimé' : 'mesuré') + '</span> · <small>lu par Claude</small></p>' +
    (e.note ? '<p class="sub">' + esc(e.note) + '</p>' : '') + pick +
    (preview ? '<ul class="inbox-diff">' + preview + '</ul>' : '') + (blocked ? '<p class="inbox-block" role="status">' + esc(blocked) + '</p>' : '') +
    '<p class="inbox-actions"><button type="button" class="btn sm" data-act="inbox-accept" data-entry="' + key + '"' + (car && !blocked ? '' : ' disabled') + '>Valider</button>' +
    '<button type="button" class="btn sm" data-act="inbox-reject" data-entry="' + key + '">Rejeter</button></p></li>';
}
function inboxHtml() {
  const n = INBOX.items.length;
  return '<details class="rc-inbox" id="rcInbox"' + (n ? ' open' : '') + '><summary>📥 Saisies préparées par Claude' + (n ? ' · ' + n + ' en attente' : '') +
    '<small>Pleins, compteur, pressions, profondeurs, montage, entretien · rien n’est enregistré sans ton clic</small></summary><div class="inbox-content">' +
    (n ? '<ol class="inbox-list">' + INBOX.items.map(inboxItemHtml).join('') + '</ol>'
      : '<label class="econ-field">Bloc « rc-depot-v1 » copié depuis Claude<textarea id="rcInboxText" rows="5" maxlength="' + RcInbox.MAX_TEXT + '" autocomplete="off" spellcheck="false"></textarea></label>' +
        '<p class="inbox-actions"><button type="button" class="btn sm" data-act="inbox-read">Lire les saisies</button></p>') +
    '<p class="econ-status inbox-status" role="status" aria-live="polite">' + esc(INBOX.status) + '</p></div></details>';
}
function inboxRefresh(status) {
  if (status != null) INBOX.status = status;
  if (!INBOX.items.length && (INBOX.done.accepted || INBOX.done.rejected) && status == null) INBOX.status = 'Boîte vidée · ' + INBOX.done.accepted + ' validée(s), ' + INBOX.done.rejected + ' rejetée(s).';
  renderGarage.last = null; renderGarage();
  const box = document.getElementById('rcInbox'); if (box) box.open = true;
}
function inboxRemove(key, accepted) {
  INBOX.items = INBOX.items.filter(x => x.key !== key); delete INBOX.choice[key];
  INBOX.done[accepted ? 'accepted' : 'rejected']++;
}
async function inboxAccept(item) {
  const car = inboxCar(item), ix = car ? S.cars.indexOf(car) : -1;
  if (ix < 0) throw new Error('Choisis la voiture concernée.');
  if (LOCKED() || DEMO.on || DeviceStorage.isFrozen()) throw new Error('Garage indisponible : déverrouille Race Control.');
  const result = RcInbox.apply(car, item.entry, inboxDeps()), snapshot = JSON.parse(JSON.stringify(car));
  // Seuls les champs de la voiture désignés par la saisie changent ; marques d'édition pour la synchronisation PC ↔ iPhone.
  for (const k of new Set(result.paths.map(p => p.split('.')[0]))) car[k] = result.car[k];
  result.paths.forEach(p => markEdit('cars.' + ix + '.' + p));
  try {
    saveSettings();
    const saved = JSON.parse(lsGet('twrc.settings.v1') || 'null');
    if (!saved || !saved.cars || !saved.cars[ix] || saved.cars[ix].id !== car.id) throw new Error('relecture');
    const vs = window.TWRC_VAULT;
    if (vs && vs.mode === 'vault') { await vs.flush(); if (vs.error || vs.pendingRecovery) throw new Error('coffre'); }
  } catch (e) {
    for (const k of Object.keys(car)) if (!(k in snapshot)) delete car[k];
    Object.assign(car, snapshot); try { saveSettings(); } catch (x) { /* l'ancienne fiche reste en mémoire */ }
    throw new Error('Enregistrement non confirmé : rien n’a été modifié. Réessaie.');
  }
  return car;
}
document.addEventListener('change', event => {
  const sel = event.target.closest && event.target.closest('select[data-inbox-car]');
  if (!sel) return;
  if (sel.value) INBOX.choice[sel.dataset.inboxCar] = sel.value; else delete INBOX.choice[sel.dataset.inboxCar];
  inboxRefresh('');
});
document.addEventListener('click', async event => {
  const btn = event.target.closest && event.target.closest('[data-act]'), a = btn && btn.dataset.act;
  if (a === 'inbox-read') {
    if (LOCKED() || DEMO.on) { inboxRefresh('Déverrouille Race Control pour lire des saisies.'); return; }
    const area = document.getElementById('rcInboxText'), raw = area ? area.value : '';
    let list;
    try { list = RcInbox.parse(raw, treadToday()); } catch (e) { inboxRefresh(e.message + ' · rien n’a été lu.'); return; }
    // Saisies déjà présentes dans la fiche (même identifiant ou même valeur) : signalées, jamais réappliquées.
    let known = 0;
    INBOX.items = list.map((x, i) => ({ ...x, key: (x.entry ? x.entry.id : x.id || 'ligne') + '#' + i })).filter(x => {
      const car = x.entry && RcInbox.matchCar(x.entry, S.cars);
      if (car && RcInbox.duplicate(x.entry, car)) { known++; return false; }
      return true;
    });
    INBOX.choice = {}; INBOX.done = { accepted: 0, rejected: 0 };
    inboxRefresh(INBOX.items.length ? INBOX.items.length + ' saisie(s) à relire' + (known ? ' · ' + known + ' déjà enregistrée(s), ignorée(s)' : '') + '.'
      : 'Toutes ces saisies sont déjà enregistrées : rien à faire.');
    return;
  }
  if (a === 'inbox-reject') { inboxRemove(btn.dataset.entry, false); inboxRefresh(INBOX.items.length ? 'Saisie rejetée : rien n’a été modifié.' : null); return; }
  if (!(a === 'inbox-accept')) return;
  const item = INBOX.items.find(x => x.key === btn.dataset.entry); if (!item || !item.entry) return;
  btn.disabled = true;
  try { const car = await inboxAccept(item); inboxRemove(item.key, true); inboxRefresh(INBOX.items.length ? RcInbox.LABEL[item.entry.type] + ' enregistré pour ' + (car.short || car.name) + ' · coffre à jour.' : null); softRender(); }
  catch (e) { btn.disabled = false; inboxRefresh(e.message || 'Saisie non enregistrée.'); }
});
const INBOX_STYLE = `<style>
#secGarage .rc-inbox{margin-top:10px;border:1px solid var(--line2);border-radius:6px;background:var(--panel);min-width:0}
#secGarage .rc-inbox>summary{cursor:pointer;min-height:44px;padding:12px;font:700 17px var(--f-disp);letter-spacing:.02em}
#secGarage .rc-inbox>summary small{display:block;margin-top:3px;color:var(--fg2);font:11px var(--f-mono)}
#secGarage .rc-inbox>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#secGarage .inbox-content{display:flex;flex-direction:column;gap:10px;padding:0 11px 13px;min-width:0}
#secGarage .inbox-content textarea{width:100%;max-width:100%;box-sizing:border-box;font:16px var(--f-mono);color:var(--fg);background:var(--panel2);border:1px solid var(--line2);border-radius:4px;padding:8px}
#secGarage .inbox-list{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none}
#secGarage .inbox-item{border:1px solid var(--line);border-radius:4px;background:var(--panel2);padding:10px;min-width:0;overflow-wrap:anywhere}
#secGarage .inbox-item p{margin:0 0 6px}
#secGarage .inbox-bad{border-color:var(--warn,#c90)}
#secGarage .inbox-diff{margin:6px 0;padding-left:18px;font-size:14px}
#secGarage .inbox-tag{font:11px var(--f-mono);text-transform:uppercase}
#secGarage .inbox-block{color:var(--warn,#c90);font-size:14px}
#secGarage .inbox-actions{display:flex;flex-wrap:wrap;gap:8px}
#secGarage .inbox-actions .btn{min-height:44px;min-width:44px}
</style>`;
