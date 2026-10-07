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
  const hist = (t.treads || []).filter(x => x && num(x.mm) != null);
  const last = hist[hist.length - 1] || null, mm = num(t.tread) ?? (last ? num(last.mm) : null);
  const withKm = hist.filter(x => num(x.km) != null).sort((a, b) => a.km - b.km);
  let rate = null; if (withKm.length >= 2) { const a = withKm[0], b = withKm[withKm.length - 1]; if (b.km - a.km >= 1000 && a.mm > b.mm) rate = (a.mm - b.mm) / (b.km - a.km) * 1000; }
  const treadAge = last ? days(last.d) : null;
  const tread = { mm, src: mm != null ? 'USER_MEASURED' : null, date: last ? last.d : null, ageD: treadAge, fresh: mm == null ? 'unknown' : fresh(treadAge, TS_TREAD), n: hist.length, rate };
  // pression : cible saisie (plaque constructeur du véhicule), éventuellement par essieu ; dernier contrôle daté
  const pz = String(t.press || ''), N = '(\\d+(?:[.,]\\d+)?)';
  const ax = new RegExp(N + '\\s*(?:bar\\s*)?AV\\b[^]*?' + N + '\\s*(?:bar\\s*)?AR\\b', 'i').exec(pz) || new RegExp('AV\\D{0,3}' + N + '[^]*?AR\\D{0,3}' + N, 'i').exec(pz);
  const target = typeof pressTarget === 'function' ? pressTarget(t.press) : num(pz);
  const pc = t.pchk || {}, pcAge = days(pc.date);
  const pressure = { target, src: target != null ? 'VEHICLE_MANUFACTURER' : null, axles: ax ? { av: num(ax[1]), ar: num(ax[2]) } : null,
    check: pc.date ? { date: pc.date, T: num(pc.T), ageD: pcAge, fresh: fresh(pcAge, TS_PRESS), src: 'USER_MEASURED' } : null, sensor: null };
  // essieux : même modèle avant/arrière (Race Control ne stocke qu'un jeu) ; pressions distinctes si saisies ; rien d'inventé
  const axle = p => ({ model: t.brand && t.model ? `${t.brand} ${t.model}` : null, size: t.size || null, dot: dot ? dot.raw : null, tread: mm, press: p });
  const axles = { front: axle(ax ? num(ax[1]) : target), rear: axle(ax ? num(ax[2]) : target), differ: !!ax && Math.abs(num(ax[1]) - num(ax[2])) >= 0.05,
    note: 'Même pneu, même profondeur saisie à l’avant et à l’arrière : pas de différence inventée entre essieux' };
  // profil technique : fiche constructeur sourcée si elle existe, sinon profil générique de la saison
  const spec = typeof tireSpecFor === 'function' ? tireSpecFor(t.brand, t.model) : null, uhp = type === 'summer' && d && (d.zr || d.si === 'W' || d.si === 'Y');
  const profile = spec ? { kind: 'manufacturer-specific', label: `${spec.b} ${spec.m} (fiche constructeur)`, conf: 'élevée' }
    : { kind: 'generic', label: `profil générique ${TS_TYPES[type] || 'inconnu'}${uhp ? ' haute performance' : ''}`, conf: t.brand && t.model ? 'moyenne' : 'faible' };
  // jeux stockés : connus, jamais analysés
  const stored = Object.entries(car.sets || {}).filter(([k, v]) => k !== type && v && (v.brand || v.model || v.size)).map(([k, v]) => ({ type: k, label: TS_TYPES[k] || k, title: [v.brand, v.model].filter(Boolean).join(' ') || 'modèle non renseigné' }));
  // qualité des données (qualité et fraîcheur, pas le nombre de champs remplis)
  const Q = (k, st, txt) => ({ k, st, txt });
  const quality = [
    Q('Modèle exact', t.brand && t.model ? '🟢' : '🟠', t.brand && t.model ? 'connu' : 'non renseigné : profil générique'),
    Q('DOT', dot ? '🟢' : '⚪', dot ? `renseigné (${dot.raw})` : 'non renseigné'),
    Q('Profondeur', tread.fresh === 'fresh' ? '🟢' : tread.fresh === 'aging' ? '🟡' : tread.fresh === 'stale' ? '🟠' : '⚪', mm == null ? 'non mesurée' : `${String(mm).replace('.', ',')} mm mesurée${treadAge != null ? ' il y a ' + treadAge + ' j' : ''}`),
    Q('Pression', !pressure.check ? (target != null ? '🟠' : '⚪') : pressure.check.fresh === 'fresh' ? '🟢' : pressure.check.fresh === 'aging' ? '🟡' : '🟠',
      target == null ? 'cible non renseignée' : pressure.check ? `contrôlée il y a ${pcAge} j` : 'cible connue, contrôle non daté'),
    Q('Température gomme', '⚪', 'aucun capteur : estimation'),
    Q('Spécification constructeur', spec ? '🟢' : '🟠', spec ? 'disponible (sources reliées)' : 'non disponible'),
    Q('Modèle thermique', '🟡', 'estimation Race Control')
  ];
  // entretien : séparé du verdict de conduite
  const maint = [];
  if (dot && dot.ageY >= 10) maint.push({ lv: 2, text: `Pneu fabriqué il y a plus de 10 ans (${dot.raw}) : remplacement recommandé (repère Michelin)` });
  if (mount.serviceY != null && mount.serviceY >= 5) maint.push({ lv: 1, text: 'Plus de 5 ans d’usage : contrôle professionnel annuel recommandé (repère Michelin)' });
  if (mm != null && mm < (type === 'winter' ? 4 : 3)) maint.push({ lv: mm < 1.6 ? 3 : 1, text: mm < 1.6 ? 'Profondeur sous le minimum légal (1,6 mm)' : `Profondeur ${String(mm).replace('.', ',')} mm : performances sur mouillé réduites, remplacement à prévoir` });
  if (target != null && (!pressure.check || pressure.check.fresh === 'stale')) maint.push({ lv: 1, text: 'Pression à contrôler à froid (dernier contrôle ancien ou non daté)' });
  if (tread.fresh === 'stale') maint.push({ lv: 1, text: 'Profondeur à remesurer (mesure de plus de 6 mois)' });
  const sig = [type, t.brand || '', t.model || '', t.size || ''].join('|');   // identité de la monte : change seulement avec un autre jeu
  return { vehicle: { id: car.id, name: car.name || car.short || car.id }, known, active: known ? { type, label: TS_TYPES[type] } : null, stored,
    model: { brand: t.brand || null, model: t.model || null, src: t.brand && t.model ? 'USER_ENTERED' : null }, size: d, dot, mount, tread, pressure, axles, profile, quality, maint, sig };
}
// mémoire thermique : valable seulement pour la même monte (un changement de jeu invalide l'ancienne estimation)
function tyreMemoryValid(rec, state) { return !!rec && !!state && (rec.sig == null ? false : rec.sig === state.sig); }

// chaque type (été / hiver / 4 saisons / inconnu) garde son propre jeu de pneus
const SET_KEYS = ['brand', 'model', 'size', 'tread', 'press', 'mounted', 'dot', 'pchk', 'info', 'treads', 'mountKm', 'lastRot'];
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
