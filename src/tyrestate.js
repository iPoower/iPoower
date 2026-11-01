/* État pneumatique (domaine) : UNE seule source de vérité, lue dans l'onglet Pneus (S.cars[i].tire = monte active,
   S.cars[i].sets = jeux stockés, S.cars[i].odo = relevés compteur). Pur : aucune saisie, aucun stockage, aucune horloge.
   Analyse, diagnostic, maintenance et mémoire thermique lisent cet état ; rien n'est ressaisi ni copié ailleurs.
   Provenance de chaque donnée : USER_ENTERED (saisi dans Pneus), USER_MEASURED (mesure faite par l'utilisateur),
   VEHICLE_MANUFACTURER (pression de la plaque constructeur, saisie par l'utilisateur), MANUFACTURER (fiche du pneu),
   RACE_CONTROL_ESTIMATE, DEFAULT_ASSUMPTION. Fraîcheur propre à chaque type : DOT et modèle permanents (tant que la monte
   ne change pas) ; profondeur vieillissante (fraîche ≤ 60 j, ancienne > 180 j) ; contrôle de pression vieillissant vite
   (frais ≤ 14 j, ancien > 30 j). Âge : depuis la fabrication (DOT) ≠ depuis le montage (date de montage) ; repère Michelin :
   contrôle professionnel annuel après 5 ans d'usage, remplacement au-delà de 10 ans depuis la fabrication. L'âge n'est
   jamais converti en perte d'adhérence : il nourrit la surveillance, l'incertitude et l'entretien. */
const TS_TREAD = [60, 180], TS_PRESS = [14, 30];
const TS_TYPES = { summer: 'été', winter: 'hiver', allseason: '4 saisons' };
/* Profondeur par essieu : tire.treadAv / tire.treadAr (mm), tire.treadEst = 1 quand la valeur est une estimation de
   l'utilisateur (pas une mesure à la jauge). tire.tread reste la valeur effective lue par le moteur et l'Analyse :
   l'essieu le PLUS USÉ (jamais une moyenne). Ancien format (tread seul) : même profondeur aux deux essieux.
   Un essieu jamais saisi reste inconnu (null) : aucune valeur inventée. */
function treadAxles(t) {
  const num = v => { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
  if (!t) return { av: null, ar: null, worst: null, ax: null, split: false };
  const av = num(t.treadAv), ar = num(t.treadAr), base = num(t.tread);
  if (av == null && ar == null) return { av: base, ar: base, worst: base, ax: null, split: false };
  const worst = av == null ? ar : ar == null ? av : Math.min(av, ar);
  return { av, ar, worst, ax: av != null && ar != null && av !== ar ? (av < ar ? 'av' : 'ar') : av != null && ar == null ? 'av' : av == null ? 'ar' : null, split: true };
}
// saisie d'un essieu : l'autre garde l'ancienne profondeur commune s'il n'a jamais été saisi ; tread = essieu le plus usé
function setTreadAxle(t, ax, mm, est) {
  const before = treadAxles(t), legacy = before.split ? null : t.tread, priorEst = !!t.treadEst;
  if (ax === 'both') { t.treadAv = mm; t.treadAr = mm; }
  else { const k = ax === 'av' ? 'treadAv' : 'treadAr', o = ax === 'av' ? 'treadAr' : 'treadAv'; t[k] = mm; if (t[o] == null && legacy != null) t[o] = legacy; }
  const x = treadAxles(t); t.tread = x.split ? x.worst : (t.treadAv == null && t.treadAr == null ? null : t.tread);
  if (typeof est === 'boolean') {
    let keptEst = priorEst;
    // L'autre essieu peut devenir le plus usé : reprendre sa provenance connue, sans changer ses relevés.
    if (x.ax && x.ax !== ax && before.ax && before.ax !== x.ax) {
      const last = treadHistory(t).last; if (last && last.mm === x.worst) keptEst = !!last.est;
    }
    t.treadEst = (ax === 'both' || x.ax === ax ? est : x.ax ? keptEst : est || keptEst) ? 1 : 0;
  }
  return t;
}
// « AV 2,3 / AR 5,0 mm » quand les essieux diffèrent, sinon « 2,3 mm »
function treadTxt(x, mm) {
  const f = v => v == null ? '?' : String(Math.round(v * 10) / 10).replace('.', ',');
  return x && x.split && x.av !== x.ar ? `AV ${f(x.av)} / AR ${f(x.ar)} mm` : `${f(mm)} mm`;
}
// Historique et tendance communs au domaine et aux cartes. Aucune mutation ni donnée persistée.
function treadHistory(t) {
  const tx = treadAxles(t);
  const num = v => { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
  const hist = ((t && t.treads) || []).filter(x => x && num(x.mm) != null && (!x.ax || x.ax === 'both' || !tx.ax || x.ax === tx.ax))
    .map(x => ({ ...x, mm: num(x.mm), km: num(x.km) }));
  const positioned = hist.some(x => x.pos && x.pos !== 'unknown' || x.wheel);
  const last = positioned ? hist.filter(x => x.mm === tx.worst).slice(-1)[0] || null : hist[hist.length - 1] || null;
  const withKm = hist.filter(x => x.km != null && !x.est && (!positioned || last && (x.pos || 'unknown') === (last.pos || 'unknown') && (x.wheel || null) === (last.wheel || null))).sort((a, b) => a.km - b.km);
  // Quand aucun essieu n'est le plus usé, deux essieux distincts ne prouvent pas une pente.
  const mixedAxles = !tx.ax && new Set(withKm.map(x => x.ax).filter(Boolean)).size > 1;
  let rate = null; if (withKm.length >= 2) { const a = withKm[0], b = withKm[withKm.length - 1]; if (!mixedAxles && b.km - a.km >= 1000 && a.mm > b.mm) rate = (a.mm - b.mm) / (b.km - a.km) * 1000; }
  return { last, rate, measuredLast: withKm[withKm.length - 1] || null };
}
/* Profondeur PAR PNEU : enregistrement SÉPARÉ des réglages, settings.treadWheels['car-<id>'][<type de monte>] = { d, fl, fr, rl, rr, av, ar }.
   fl / fr / rl / rr = AV gauche, AV droit, AR gauche, AR droit ; chaque pneu porte deux points : { side (côté), mid (milieu) } en mm.
   Pourquoi hors de car.tire : la version précédente (build 502852864dbd) reconstruit car.tire avec une liste fermée de champs
   au changement de monte (switchTire, confirmation du montage hiver) et effacerait un champ inconnu. Elle conserve en revanche
   une clé de premier niveau inconnue des réglages (normalize, sauvegarde, fusion PC ↔ iPhone chemin par chemin).
   Compatibilité : tire.treadAv / tire.treadAr restent écrits avec le MINIMUM de chaque essieu (tread = essieu le plus usé) :
   ce sont les seules valeurs lues par le verdict, l'alerte de profondeur et les appareils encore sur l'ancienne version.
   av / ar gardent les minima écrits avec ce relevé : si treadAv / treadAr changent ensuite (saisie par essieu plus récente,
   par exemple sur un appareil pas encore à jour), la valeur par essieu fait foi et le détail par pneu de cet essieu est
   signalé comme dépassé, jamais réappliqué. Un essieu sans aucun point saisi garde sa valeur : rien d'inventé ni d'effacé.
   Clé 'car-' + id : jamais un segment purement numérique (la fusion créerait une liste au lieu d'un objet). */
const TREAD_WHEELS = { fl: 'av', fr: 'av', rl: 'ar', rr: 'ar' };
const TREAD_WHEEL_LABEL = { fl: 'AV gauche', fr: 'AV droit', rl: 'AR gauche', rr: 'AR droit' };
// Écart côté / milieu au-delà duquel l'usure est jugée irrégulière : REPÈRE INDICATIF de l'app, non réglementaire.
const TREAD_GAP_MM = 1;
const treadMm = v => { const x = typeof v === 'string' ? (v.trim() === '' ? NaN : parseFloat(v.replace(',', '.'))) : v; return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : null; };
const treadDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
const treadObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const treadWheelsKey = car => car && typeof car.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(car.id) ? 'car-' + car.id : null;
// Relevé par pneu de la monte ACTIVE de cette voiture (null s'il n'existe pas).
function treadWheelsRecord(settings, car) {
  const k = treadWheelsKey(car), type = car && car.tire && car.tire.type, box = settings && settings.treadWheels;
  const r = k && typeof type === 'string' && treadObj(box) && treadObj(box[k]) ? box[k][type] : null;
  return treadObj(r) ? r : null;
}
// Range le relevé ; renvoie le chemin modifié (pour l'horodatage de synchronisation) ou null si la voiture n'est pas adressable.
function putTreadWheelsRecord(settings, car, rec) {
  const k = treadWheelsKey(car), type = car && car.tire && car.tire.type;
  if (!settings || !k || typeof type !== 'string' || !/^[a-z]{1,20}$/.test(type) || !treadObj(rec)) return null;
  if (!treadObj(settings.treadWheels)) settings.treadWheels = {};
  if (!treadObj(settings.treadWheels[k])) settings.treadWheels[k] = {};
  settings.treadWheels[k][type] = rec;
  return `treadWheels.${k}.${type}`;
}
function treadWheels(t, rec) {
  if (!t || !treadObj(rec)) return null;
  const tx = treadAxles(t), wheels = {}, axles = {};
  for (const k of Object.keys(TREAD_WHEELS)) {
    const p = treadObj(rec[k]) ? rec[k] : {}, side = treadMm(p.side), mid = treadMm(p.mid), pts = [side, mid].filter(v => v != null);
    wheels[k] = { k, label: TREAD_WHEEL_LABEL[k], ax: TREAD_WHEELS[k], side, mid, min: pts.length ? Math.min(...pts) : null,
      gap: side != null && mid != null ? Math.round(Math.abs(side - mid) * 10) / 10 : null };
  }
  for (const ax of ['av', 'ar']) {
    const ks = Object.keys(TREAD_WHEELS).filter(k => TREAD_WHEELS[k] === ax), mins = ks.map(k => wheels[k].min).filter(v => v != null);
    const min = mins.length ? Math.min(...mins) : null, written = treadMm(rec[ax]), current = tx[ax];
    // Dépassé : la valeur par essieu ne correspond plus au minimum écrit avec ce relevé.
    const stale = min != null && (written == null || current == null || Math.abs(current - written) > 0.05 || Math.abs(min - written) > 0.05);
    axles[ax] = { min, written, current, stale };
    ks.forEach(k => { wheels[k].stale = stale; wheels[k].irregular = !stale && wheels[k].gap != null && wheels[k].gap > TREAD_GAP_MM; });
  }
  const list = Object.values(wheels);
  return { d: treadDay(rec.d) ? rec.d : null, wheels, axles, any: list.some(x => x.min != null), irregular: list.filter(x => x.irregular),
    stale: ['av', 'ar'].filter(ax => axles[ax].stale) };
}
// Saisie d'un relevé par pneu. Entrée : { fl: { side, mid }, ... } (nombres ou textes « 6,4 »).
// Écrit seulement les valeurs par essieu de la monte (t) ; renvoie le relevé à ranger avec putTreadWheelsRecord.
// En cas d'erreur, rien n'est écrit.
function setTreadWheels(t, input, { date, est } = {}) {
  if (!treadObj(t)) return { error: 'Monte indisponible.' };
  if (!treadDay(date)) return { error: 'Choisis la date du relevé.' };
  const rec = { d: date }, axes = [];
  for (const k of Object.keys(TREAD_WHEELS)) {
    const p = treadObj(input && input[k]) ? input[k] : {}, pt = {};
    for (const f of ['side', 'mid']) {
      const raw = p[f], empty = raw == null || String(raw).trim() === '', v = empty ? null : treadMm(raw);
      if (!empty && (v == null || v < 0 || v > 12)) return { error: `${TREAD_WHEEL_LABEL[k]} · ${f === 'side' ? 'côté' : 'milieu'} : saisis une profondeur de 0 à 12 mm.` };
      pt[f] = v;
    }
    rec[k] = pt;
  }
  for (const ax of ['av', 'ar']) {
    const mins = Object.keys(TREAD_WHEELS).filter(k => TREAD_WHEELS[k] === ax).flatMap(k => [rec[k].side, rec[k].mid]).filter(v => v != null);
    rec[ax] = mins.length ? Math.min(...mins) : null;
    if (mins.length) axes.push(ax);
  }
  if (!axes.length) return { error: 'Saisis au moins une profondeur.' };
  if (typeof est === 'boolean') rec.est = est ? 1 : 0;   // origine du relevé : mesure à la jauge (0) ou estimation (1)
  // Essieu par essieu, par la règle existante : l'autre essieu garde l'ancienne profondeur commune s'il n'a jamais été saisi.
  if (axes.length === 2) { setTreadAxle(t, 'av', rec.av); setTreadAxle(t, 'ar', rec.ar); if (typeof est === 'boolean') t.treadEst = est ? 1 : 0; }
  else setTreadAxle(t, axes[0], rec[axes[0]], typeof est === 'boolean' ? est : undefined);
  return { record: rec, axes, av: rec.av, ar: rec.ar };
}
// Usure irrégulière (écart côté / milieu > 1 mm) : lignes prêtes pour l'alerte et l'entretien. Seuil indicatif, non réglementaire.
function treadGapRows(t, rec) {
  const v = treadWheels(t, rec); if (!v) return [];
  const f = x => String(x).replace('.', ',');
  return v.irregular.map(w => ({ k: w.k, label: w.label, gap: w.gap, side: w.side, mid: w.mid, d: v.d,
    text: `${w.label} : écart côté / milieu de ${f(w.gap)} mm (côté ${f(w.side)}, milieu ${f(w.mid)} mm)` }));
}
function tyreState(car, opt = {}) {
  if (!car || !car.tire) return null;
  const t = car.tire, type = t.type, today = opt.today || null;
  const days = d => today && d && /^\d{4}-\d{2}-\d{2}/.test(d) ? Math.round((Date.parse(today) - Date.parse(String(d).slice(0, 10))) / 864e5) : null;
  const fresh = (age, lim) => age == null ? 'unknown' : age <= lim[0] ? 'fresh' : age <= lim[1] ? 'aging' : 'stale';
  const num = v => { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
  const yrs = y => { const a = Math.floor(y), m = Math.round((y - a) * 12); return a ? `${a} an${a > 1 ? 's' : ''}${m ? ' ' + m + ' mois' : ''}` : `${m} mois`; };
  const known = !!TS_TYPES[type];
  const d = typeof decodeSize === 'function' ? decodeSize(t.size) : null;
  // DOT : semaine + année de fabrication, âge depuis la fabrication
  let dot = null;
  const dm = /^(\d{2})(\d{2})$/.exec(String(t.dot || '').trim());
  if (dm && +dm[1] >= 1 && +dm[1] <= 53 && today) {
    const year = 2000 + +dm[2], made = Date.UTC(year, 0, 1) + (+dm[1] - 1) * 7 * 864e5, ageY = (Date.parse(today) - made) / (365.25 * 864e5);
    if (ageY > -0.1) dot = { raw: dm[0], week: +dm[1], year, ageY: Math.max(0, ageY), txt: `DOT ${dm[0]} · fabrication semaine ${+dm[1]} / ${year} · ≈ ${yrs(Math.max(0, ageY))}`, src: 'USER_ENTERED' };
  }
  // montage : âge d'usage et kilométrage depuis le montage (seulement si le compteur est connu)
  const odo = (car.odo || []).filter(o => o && num(o.km) != null).sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const lastOdo = odo[odo.length - 1] || null, mountKm = num(t.mountKm);
  const serviceD = days(t.mounted);
  const mount = { date: t.mounted || null, serviceY: serviceD != null && serviceD >= 0 ? serviceD / 365.25 : null, km: mountKm,
    kmSince: lastOdo && mountKm != null && lastOdo.km >= mountKm ? Math.round(lastOdo.km - mountKm) : null, odoDate: lastOdo ? lastOdo.d : null };
  // profondeur : dernière mesure de l'utilisateur, date, tendance seulement avec au moins deux mesures et du kilométrage
  // par essieu (treadAv / treadAr) : la valeur effective est l'essieu le plus usé ; estimation ≠ mesure (treadEst)
  const tx = treadAxles(t), est = !!t.treadEst;
  const hist = (t.treads || []).filter(x => x && num(x.mm) != null);
  const history = treadHistory(t), last = history.last, mm = tx.split ? tx.worst : num(t.tread) ?? (last ? num(last.mm) : null);
  const rate = history.rate;
  const treadAge = last ? days(last.d) : null;
  const wheels = treadWheels(t, opt.wheels), gaps = treadGapRows(t, opt.wheels);
  const tread = { mm, av: tx.av, ar: tx.ar, worstAxle: tx.ax, split: tx.split, est: mm != null && est,
    src: mm != null ? (est ? 'USER_ESTIMATED' : 'USER_MEASURED') : null, date: last ? last.d : null, ageD: treadAge, fresh: mm == null ? 'unknown' : fresh(treadAge, TS_TREAD), n: hist.length, rate,
    wheels, irregular: gaps };
  // pression : cible saisie (plaque constructeur du véhicule), éventuellement par essieu ; dernier contrôle daté
  const pz = String(t.press || ''), N = '(\\d+(?:[.,]\\d+)?)';
  const ax = new RegExp(N + '\\s*(?:bar\\s*)?AV\\b[^]*?' + N + '\\s*(?:bar\\s*)?AR\\b', 'i').exec(pz) || new RegExp('AV\\D{0,3}' + N + '[^]*?AR\\D{0,3}' + N, 'i').exec(pz);
  const target = typeof pressTarget === 'function' ? pressTarget(t.press) : num(pz);
  const pc = t.pchk || {}, pcAge = days(pc.date);
  const pressure = { target, src: target != null ? 'VEHICLE_MANUFACTURER' : null, axles: ax ? { av: num(ax[1]), ar: num(ax[2]) } : null,
    check: pc.date ? { date: pc.date, T: num(pc.T), ageD: pcAge, fresh: fresh(pcAge, TS_PRESS), src: 'USER_MEASURED' } : null, sensor: null };
  // essieux : même modèle avant/arrière (Race Control ne stocke qu'un jeu) ; pressions distinctes si saisies ; rien d'inventé
  const axle = (p, d) => ({ model: t.brand && t.model ? `${t.brand} ${t.model}` : null, size: t.size || null, dot: dot ? dot.raw : null, tread: d, press: p });
  const trDiff = tx.av != null && tx.ar != null && Math.abs(tx.av - tx.ar) >= 0.5;
  const axles = { front: axle(ax ? num(ax[1]) : target, tx.av), rear: axle(ax ? num(ax[2]) : target, tx.ar),
    differ: (!!ax && Math.abs(num(ax[1]) - num(ax[2])) >= 0.05) || trDiff, treadDiffer: trDiff,
    note: tx.split ? 'Profondeur saisie par essieu : les calculs utilisent l’essieu le plus usé'
      : 'Même pneu, même profondeur saisie à l’avant et à l’arrière : pas de différence inventée entre essieux' };
  // profil technique : fiche constructeur sourcée si elle existe, sinon profil générique de la saison
  const spec = typeof tireSpecFor === 'function' ? tireSpecFor(t.brand, t.model) : null, uhp = type === 'summer' && d && (d.zr || d.si === 'W' || d.si === 'Y');
  const profile = spec ? { kind: 'manufacturer-specific', label: `${spec.b} ${spec.m} (fiche constructeur)`, conf: 'élevée' }
    : { kind: 'generic', label: `profil générique ${TS_TYPES[type] || 'inconnu'}${uhp ? ' haute performance' : ''}`, conf: t.brand && t.model ? 'moyenne' : 'faible' };
  // jeux stockés : connus, jamais analysés
  const stored = Object.entries(car.sets || {}).filter(([k, v]) => k !== type && v && (v.brand || v.model || v.size)).map(([k, v]) => ({ type: k, label: TS_TYPES[k] || 'saison non renseignée', title: [v.brand, v.model].filter(Boolean).join(' ') || 'modèle non renseigné' }));
  // qualité des données (qualité et fraîcheur, pas le nombre de champs remplis)
  const Q = (k, st, txt) => ({ k, st, txt });
  const quality = [
    Q('Modèle exact', t.brand && t.model ? '🟢' : '🟠', t.brand && t.model ? 'connu' : 'non renseigné : profil générique'),
    Q('DOT', dot ? '🟢' : '⚪', dot ? `renseigné (${dot.raw})` : 'non renseigné'),
    Q('Profondeur', mm == null ? '⚪' : tread.fresh === 'stale' ? '🟠' : est ? '🟡' : tread.fresh === 'fresh' ? '🟢' : tread.fresh === 'aging' ? '🟡' : '⚪',
      mm == null ? 'non mesurée' : `${treadTxt(tx, mm)} ${est ? 'estimée (pas mesurée à la jauge)' : 'mesurée'}${treadAge != null ? ' il y a ' + treadAge + ' j' : ''}`),
    Q('Pression', !pressure.check ? (target != null ? '🟠' : '⚪') : pressure.check.fresh === 'fresh' ? '🟢' : pressure.check.fresh === 'aging' ? '🟡' : '🟠',
      target == null ? 'cible non renseignée' : pressure.check ? `contrôlée il y a ${pcAge} j` : 'cible connue, contrôle non daté'),
    Q('Température gomme', '⚪', 'aucun capteur : estimation'),
    Q('Spécification constructeur', spec ? '🟢' : '🟠', spec ? 'disponible (sources reliées)' : 'non disponible'),
    Q('Modèle thermique', '🟡', 'estimation Race Control')
  ];
  // entretien : séparé du verdict de conduite
  const maint = [];
  if (dot && dot.ageY >= 10) maint.push({ k: 'dot', lv: 2, text: `Pneu fabriqué il y a plus de 10 ans (${dot.raw}) : remplacement recommandé (repère Michelin)` });
  if (mount.serviceY != null && mount.serviceY >= 5) maint.push({ k: 'service', lv: 1, text: 'Plus de 5 ans d’usage : contrôle professionnel annuel recommandé (repère Michelin)' });
  if (mm != null && mm < (type === 'winter' ? 4 : 3)) maint.push({ k: 'tread', lv: mm < 1.6 ? 3 : 1, text: mm < 1.6 ? 'Profondeur sous le minimum légal (1,6 mm)' : `Profondeur ${String(mm).replace('.', ',')} mm : performances sur mouillé réduites, remplacement à prévoir` });
  if (target != null && (!pressure.check || pressure.check.fresh === 'stale')) maint.push({ k: 'pressure', lv: 1, text: 'Pression à contrôler à froid (dernier contrôle ancien ou non daté)' });
  if (tread.fresh === 'stale') maint.push({ k: 'tread-stale', lv: 1, text: 'Profondeur à remesurer (mesure de plus de 6 mois)' });
  if (gaps.length) maint.push({ k: 'tread-gap', lv: 1, text: `Usure irrégulière (${gaps.map(g => g.text).join(' ; ')}) : contrôle de géométrie conseillé. Seuil indicatif de 1 mm, non réglementaire.` });
  if (tread.est && tread.fresh !== 'stale') maint.push({ k: 'tread-est', lv: 1, text: 'Profondeur estimée : à confirmer avec une jauge (témoins d’usure à 1,6 mm)' });
  const sig = [type, t.brand || '', t.model || '', t.size || ''].join('|');   // identité de la monte : change seulement avec un autre jeu
  return { vehicle: { id: car.id, name: car.name || car.short || car.id }, known, active: known ? { type, label: TS_TYPES[type] } : null, stored,
    model: { brand: t.brand || null, model: t.model || null, src: t.brand && t.model ? 'USER_ENTERED' : null }, size: d, dot, mount, tread, pressure, axles, profile, quality, maint, sig };
}
// mémoire thermique : valable seulement pour la même monte (un changement de jeu invalide l'ancienne estimation)
function tyreMemoryValid(rec, state) { return !!rec && !!state && (rec.sig == null ? false : rec.sig === state.sig); }

// chaque type (été / hiver / 4 saisons / inconnu) garde son propre jeu de pneus
const SET_KEYS = ['brand', 'model', 'size', 'tread', 'treadAv', 'treadAr', 'treadEst', 'press', 'mounted', 'dot', 'pchk', 'info', 'treads', 'mountKm', 'lastRot'];
function switchTire(car, type) {
  if (car.tire.type === type) return;
  car.sets = car.sets || {};
  car.sets[car.tire.type] = Object.fromEntries(SET_KEYS.map(k => [k, car.tire[k] ?? null]));
  let next = car.sets[type];
  if (!next && type === 'winter' && car.plan && car.plan.on && (car.plan.brand || car.plan.model))
    next = { brand: car.plan.brand, model: car.plan.model, size: car.plan.size || car.tire.size, tread: null, press: car.tire.press, mounted: '' };
  if (!next) next = { brand: '', model: '', size: (car.sets.summer && car.sets.summer.size) || car.tire.size, tread: null, press: car.tire.press, mounted: '' };
  car.tire = { type, dot: '', info: '', pchk: { date: '', T: null }, ...JSON.parse(JSON.stringify(next)) };
  if (!car.tire.pchk) car.tire.pchk = { date: '', T: null };
}
// Un montage est un fait confirmé, distinct de la date prévisionnelle. Aucun effet sur l'entrée en cas d'erreur.
function confirmWinterMount(car, { date, km, today } = {}) {
  if (!car || !car.tire || !car.plan || !car.plan.on || car.tire.type === 'winter') return { error: 'Le montage hiver n’est plus en attente.' };
  const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
  if (!validDate(date) || !validDate(today) || date > today) return { error: 'Choisis la date réelle du montage, aujourd’hui ou avant.' };
  const value = km == null || String(km).trim() === '' ? null : Number(km);
  if (value != null && (!Number.isSafeInteger(value) || value < 0)) return { error: 'Le compteur doit être un nombre entier positif ou nul.' };
  const readings = (car.odo || []).filter(o => o && Number.isFinite(o.km));
  if (value != null && readings.some(o => o.d <= date && o.km > value || o.d > date && o.km < value)) return { error: 'Ce compteur ne correspond pas à la chronologie des relevés enregistrés.' };
  const next = JSON.parse(JSON.stringify(car));
  switchTire(next, 'winter');
  Object.assign(next.tire, { mounted: date, mountKm: value, lastRot: null, pchk: { date: '', T: null } });
  if (value != null) next.odo = [...(next.odo || []).filter(o => o.d !== date), { d: date, km: value }].sort((a, b) => String(a.d).localeCompare(String(b.d)));
  next.plan.on = 0;
  return { car: next };
}
