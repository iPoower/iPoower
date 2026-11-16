/* Boîte de dépôt · saisies préparées par Claude (format rc-depot-v1), collées par Bryan puis validées une par une.
 * Module PUR : aucune lecture ni écriture de stockage, aucun réseau, aucune horloge (« today » est fourni).
 * Le texte collé est une donnée NON FIABLE : format strict, champs inconnus refusés, tailles bornées,
 * rien n'est appliqué ici : apply() rend une COPIE de la voiture et la liste des chemins à marquer. */
const RcInbox = (() => {
  const FORMAT = 'rc-depot-v1', MAX_TEXT = 32768, MAX_ENTRIES = 50;
  const TYPES = ['fuel', 'odometer', 'pressure', 'tread', 'tireMount', 'maintenance'];
  const LABEL = { fuel: 'Plein', odometer: 'Compteur', pressure: 'Pressions', tread: 'Profondeur des pneus', tireMount: 'Montage de pneus', maintenance: 'Entretien' };
  const TIRE_TYPES = { summer: 'été', winter: 'hiver', allseason: '4 saisons' };
  const FUELS = ['unknown', 'diesel', 'diesel-premium', 'sp98', 'sp95-e5', 'sp95-e10', 'e85', 'other'];   // mêmes clés que le budget (garage-economics-core.js)
  const AXLE = { av: 'avant', ar: 'arrière', both: 'les deux essieux' };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  const fail = m => { throw new Error(m); };
  const keysOnly = (o, allowed, what) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(what + ' : champ inconnu « ' + String(k).slice(0, 24) + ' »'); };
  const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
  // Texte court lisible : pas de caractère de contrôle ni de chevron ; affiché ensuite en texte, jamais en HTML.
  const text = (v, max, what) => { if (typeof v !== 'string') fail(what + ' : texte attendu'); const t = v.trim();
    if (!t || t.length > max || /[\u0000-\u001f\u007f<>]/.test(t)) fail(what + ' : texte invalide (1 à ' + max + ' caractères, sans balise)'); return t; };
  const int = (v, lo, hi, what) => { if (!Number.isSafeInteger(v) || v < lo || v > hi) fail(what + ' : entier de ' + lo + ' à ' + hi + ' attendu'); return v; };
  const dec = (v, lo, hi, places, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || Math.abs(Math.round(v * 10 ** places) - v * 10 ** places) > 1e-9)
    fail(what + ' : nombre de ' + lo + ' à ' + hi + ' (' + places + ' décimale(s) au plus) attendu'); return Math.round(v * 10 ** places) / 10 ** places; };
  const opt = (o, k, f) => own(o, k) && o[k] !== null ? f(o[k]) : null;

  // Valeurs attendues par type : liste FERMÉE de champs (un champ inconnu = saisie refusée).
  const VALUES = {
    fuel: v => { keysOnly(v, ['amountCents', 'litres', 'km', 'fullTank', 'fuelType'], 'Plein');
      const out = { amountCents: int(v.amountCents, 1, 100000, 'Montant (centimes)'), volumeMl: opt(v, 'litres', x => Math.round(dec(x, 0.01, 200, 3, 'Litres') * 1000)),
        km: opt(v, 'km', x => int(x, 0, 2000000, 'Compteur')), fullTank: own(v, 'fullTank') ? v.fullTank : false, fuelType: opt(v, 'fuelType', x => FUELS.includes(x) ? x : fail('Carburant inconnu')) };
      if (typeof out.fullTank !== 'boolean') fail('Plein complet : vrai ou faux attendu');
      if (out.fullTank && (out.volumeMl == null || out.km == null)) fail('Plein complet : litres et compteur requis');
      return out; },
    odometer: v => { keysOnly(v, ['km'], 'Compteur'); return { km: int(v.km, 0, 2000000, 'Compteur') }; },
    pressure: v => { keysOnly(v, ['av', 'ar', 'T'], 'Pressions');
      const out = { av: opt(v, 'av', x => dec(x, 0.8, 5, 2, 'Pression avant (bar)')), ar: opt(v, 'ar', x => dec(x, 0.8, 5, 2, 'Pression arrière (bar)')), T: opt(v, 'T', x => dec(x, -30, 60, 1, 'Température (°C)')) };
      if (out.av == null && out.ar == null) fail('Pressions : avant ou arrière requise'); return out; },
    tread: v => { keysOnly(v, ['mm', 'ax'], 'Profondeur'); if (!own(AXLE, v.ax)) fail('Profondeur : essieu av, ar ou both attendu');
      return { mm: dec(v.mm, 0, 12, 1, 'Profondeur (mm)'), ax: v.ax }; },
    tireMount: v => { keysOnly(v, ['type', 'brand', 'model', 'size', 'dot', 'km'], 'Montage'); if (!own(TIRE_TYPES, v.type)) fail('Montage : type summer, winter ou allseason attendu');
      return { type: v.type, brand: opt(v, 'brand', x => text(x, 40, 'Marque')), model: opt(v, 'model', x => text(x, 40, 'Modèle')), size: opt(v, 'size', x => text(x, 40, 'Dimension')),
        dot: opt(v, 'dot', x => typeof x === 'string' && /^\d{4}$/.test(x) ? x : fail('DOT : 4 chiffres (semaine et année) attendus')), km: opt(v, 'km', x => int(x, 0, 2000000, 'Compteur')) }; },
    maintenance: v => { keysOnly(v, ['kind', 'km', 'amountCents'], 'Entretien'); if (!['revision', 'ct'].includes(v.kind)) fail('Entretien : revision ou ct attendu');
      return { kind: v.kind, km: opt(v, 'km', x => int(x, 0, 2000000, 'Compteur')), amountCents: opt(v, 'amountCents', x => int(x, 1, 1000000, 'Montant (centimes)')) }; }
  };
  function entry(raw, today) {
    if (!obj(raw)) fail('Saisie illisible');
    keysOnly(raw, ['id', 'date', 'car', 'type', 'status', 'values', 'note'], 'Saisie');
    if (typeof raw.id !== 'string' || !/^dep-[a-z0-9-]{4,36}$/.test(raw.id)) fail('Identifiant invalide (dep-… attendu)');
    if (!validDay(raw.date)) fail('Date invalide (AAAA-MM-JJ attendue)');
    if (validDay(today) && raw.date > today) fail('Date dans le futur');
    if (!TYPES.includes(raw.type)) fail('Type de saisie inconnu');
    if (!['measured', 'estimated'].includes(raw.status)) fail('Statut measured ou estimated attendu');
    if (raw.status === 'estimated' && raw.type !== 'tread') fail('Une estimation n’est acceptée que pour la profondeur des pneus');
    if (!obj(raw.values)) fail('Valeurs absentes');
    return Object.freeze({ id: raw.id, date: raw.date, car: text(raw.car, 40, 'Voiture'), type: raw.type, status: raw.status,
      values: Object.freeze(VALUES[raw.type](raw.values)), note: own(raw, 'note') && raw.note !== null ? text(raw.note, 80, 'Note') : null });
  }
  // Lecture du bloc collé : enveloppe stricte, puis chaque saisie validée séparément (une saisie fausse n'empêche pas les autres).
  function parse(input, today) {
    if (typeof input !== 'string') fail('Rien à lire');
    if (input.length > MAX_TEXT) fail('Bloc trop long (32 Ko au plus)');
    // Message de Claude copié en entier : seul le bloc est lu (entre ``` s'il y en a, sinon de la première « { » à la dernière « } »).
    // Un seul bloc par collage ; la lecture du bloc reste stricte.
    const trimmed = input.trim(), fences = trimmed.match(/```(?:json)?\s*[\s\S]*?```/gi) || [];
    if (fences.length > 1) fail('Plusieurs blocs dans le texte collé : colle un seul bloc rc-depot-v1 à la fois');
    const fenced = fences.length ? fences[0].replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : trimmed;
    const first = fenced.indexOf('{'), last = fenced.lastIndexOf('}');
    const body = first >= 0 && last > first ? fenced.slice(first, last + 1) : fenced;
    let data;
    try { data = JSON.parse(body, (k, v) => { if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('clé interdite'); return v; }); }
    catch (e) { fail('Bloc illisible : JSON strict attendu'); }
    if (!obj(data)) fail('Bloc illisible : objet attendu');
    keysOnly(data, ['format', 'source', 'createdAt', 'entries'], 'Bloc');
    if (data.format !== FORMAT) fail('Format inconnu (rc-depot-v1 attendu)');
    if (data.source !== 'claude') fail('Source inconnue (claude attendu)');
    if (own(data, 'createdAt') && (typeof data.createdAt !== 'string' || data.createdAt.length > 40 || !Number.isFinite(Date.parse(data.createdAt)))) fail('Date de création invalide');
    if (!Array.isArray(data.entries) || !data.entries.length || data.entries.length > MAX_ENTRIES) fail('Liste de saisies vide ou trop longue (50 au plus)');
    const seen = new Set();
    return data.entries.map((raw, index) => {
      try { const e = entry(raw, today); if (seen.has(e.id)) fail('Identifiant en double dans le bloc'); seen.add(e.id); return { index, entry: e, error: null }; }
      catch (err) { return { index, entry: null, error: err.message, id: obj(raw) && typeof raw.id === 'string' && /^dep-[a-z0-9-]{4,36}$/.test(raw.id) ? raw.id : null }; }
    });
  }
  // Voiture désignée par son nom court ou son nom (sans tenir compte de la casse) : jamais deviné en cas d'ambiguïté.
  function matchCar(e, cars) {
    const key = String(e.car).trim().toLowerCase(), list = (Array.isArray(cars) ? cars : []).filter(c => c && c.id);
    const hits = list.filter(c => c.id === e.car || [c.short, c.name].some(n => typeof n === 'string' && n.trim().toLowerCase() === key));
    return hits.length === 1 ? hits[0] : null;
  }
  // Relevés en vigueur : un relevé annulé par un marqueur { d, km, void: 1 } ne compte plus (même règle que Garage.odoLive).
  const odoLive = (l => { const a = Array.isArray(l) ? l : [], v = new Set(a.filter(o => o && o.void).map(o => o.d + '|' + o.km)); return a.filter(o => o && !o.void && !v.has(o.d + '|' + o.km)); });
  const lastOdoBefore = (car, day) => odoLive(car.odo).filter(o => o && Number.isFinite(o.km) && validDay(o.d) && o.d <= day).sort((a, b) => a.d.localeCompare(b.d)).pop() || null;
  // Tous les kilométrages datés de la fiche : relevés du compteur, tickets du budget, révision, montage des pneus.
  // Une seule chronologie pour toutes les saisies (boîte de dépôt, Paramètres, budget) : un compteur ne recule jamais.
  function kmPoints(car) {
    const out = [], add = (d, km, label) => { if (validDay(d) && Number.isFinite(km) && km >= 0) out.push({ d, km, label }); };
    for (const o of odoLive(car && car.odo)) add(o.d, o.km, 'le relevé du compteur');
    const eco = car && car.economics;
    for (const x of eco && Array.isArray(eco.entries) ? eco.entries : []) if (x) add(x.date, x.km, x.category === 'fuel' ? 'le plein' : 'la dépense du budget');
    const m = car && car.maint; if (m && m.rev) add(m.rev.d, m.rev.km, 'la révision');
    const t = car && car.tire; if (t) add(t.mounted, t.mountKm, 'le montage des pneus');
    return out;
  }
  // Premier kilométrage enregistré que (day, km) contredirait, ou null. Le même jour, deux valeurs différentes restent possibles (trajet dans la journée).
  function kmConflict(car, day, km) {
    if (!validDay(day) || !Number.isFinite(km)) return null;
    return kmPoints(car).filter(p => p.d < day && p.km > km || p.d > day && p.km < km).sort((a, b) => Math.abs(a.km - km) < Math.abs(b.km - km) ? 1 : -1)[0] || null;
  }
  const conflictText = c => 'il contredit ' + c.label + ' du ' + fd(c.d) + ' (' + fr(c.km) + ' km)';
  const fr = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const euros = c => fr(c / 100, 2) + ' €';
  const fd = d => validDay(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : String(d);
  // Déjà présent dans la fiche (même saisie appliquée sur cet appareil ou reçue par la synchronisation).
  function duplicate(e, car) {
    const v = e.values, t = car.tire || {}, m = car.maint || {};
    // Une mesure déjà rangée avec un jeu démonté (été / hiver) reste une mesure connue : jamais reproposée.
    const sets = [t, ...Object.values(car.sets && typeof car.sets === 'object' && !Array.isArray(car.sets) ? car.sets : {}).filter(x => x && typeof x === 'object')];
    const inBudget = !!(car.economics && Array.isArray(car.economics.entries) && car.economics.entries.some(x => x && x.id === e.id)) || !!(car.economics && Array.isArray(car.economics.removed) && car.economics.removed.includes(e.id));
    switch (e.type) {
      case 'fuel': return inBudget;
      case 'odometer': return odoLive(car.odo).some(o => o.d === e.date && o.km === v.km);
      case 'tread': return sets.some(x => Array.isArray(x.treads) && x.treads.some(r => r && r.d === e.date && Number(r.mm) === v.mm && r.ax === v.ax));
      case 'pressure': return sets.some(x => !!x.pchk && x.pchk.date === e.date && (x.pchk.av ?? null) === v.av && (x.pchk.ar ?? null) === v.ar);
      case 'tireMount': return t.type === v.type && t.mounted === e.date;
      case 'maintenance': return v.kind === 'revision' ? !!m.rev && m.rev.d === e.date : !!m.ct && m.ct.d === e.date;
    }
    return false;
  }
  // Application sur une COPIE. Retourne { car, paths, lines } ou lève une erreur lisible ; la voiture reçue n'est jamais modifiée.
  // deps : switchTire, setTreadAxle, treadAxles (tyrestate.js), addEntry (garage-economics-core.js), maxTreads.
  function apply(car, e, deps) {
    if (!car || !car.id) fail('Voiture introuvable');
    if (duplicate(e, car)) fail('Déjà enregistrée dans la fiche');
    const next = JSON.parse(JSON.stringify(car)), v = e.values, paths = [], lines = [];
    next.tire = next.tire || {}; const t = next.tire;
    // Une pression ou une profondeur mesurée AVANT le montage actuel concerne l'ancien jeu : jamais attribuée aux pneus montés.
    if ((e.type === 'pressure' || e.type === 'tread') && t.type === 'none') fail('Aucun pneu monté sur cette voiture : enregistre d’abord le montage des pneus');
    if ((e.type === 'pressure' || e.type === 'tread') && validDay(t.mounted) && e.date < t.mounted) fail('Mesure antérieure au montage des pneus actuels (' + fd(t.mounted) + ') : saisis-la dans Paramètres pour l’ancien jeu');
    const odoAdd = km => {
      const same = odoLive(next.odo).find(o => o.d === e.date);
      if (same && same.km !== km) fail('Un autre relevé du compteur existe déjà ce jour-là (' + fr(same.km) + ' km) : corrige-le dans Paramètres');
      const clash = kmConflict(next, e.date, km);
      if (clash) fail('Ce compteur ne suit pas la chronologie : ' + conflictText(clash) + '. Corrige la valeur fausse avant de valider');
      // Saut invraisemblable (> 1 500 km/j) par rapport aux relevés fiables : refusé, le chiffre est à vérifier.
      const jump = deps && typeof deps.kmJump === 'function' ? deps.kmJump(next, e.date, km) : null;
      if (jump) fail('Ce compteur implique ≈ ' + fr(jump.kmPerDay) + ' km par jour par rapport au relevé du ' + fd(jump.d) + ' (' + fr(jump.km) + ' km) : un chiffre manque ou est en trop. Vérifie la valeur avant de valider');
      if (!same) { next.odo = [...(next.odo || []), { d: e.date, km }].sort((a, b) => String(a.d).localeCompare(String(b.d))); paths.push('odo'); }
      const last = lastOdoBefore(car, '9999-12-31');
      // Un relevé plus ancien que le dernier connu complète l'historique : le compteur affiché ne recule pas.
      lines.push(last && last.d > e.date ? 'Compteur au ' + fd(e.date) + ' : ' + fr(km) + ' km · relevé ancien ajouté à l’historique, dernier relevé inchangé (' + fr(last.km) + ' km le ' + fd(last.d) + ')'
        : 'Compteur : ' + (last ? fr(last.km) + ' km' : 'aucun relevé') + ' → ' + fr(km) + ' km');
    };
    const budget = (category, amountCents, extra) => {
      next.economics = deps.addEntry(next.economics || {}, { date: e.date, category, amountCents, ...extra, note: e.note || undefined }, e.id); paths.push('economics.entries');
      lines.push('Budget : + ' + euros(amountCents) + ' (' + (category === 'fuel' ? 'carburant' : 'entretien') + ')');
    };
    switch (e.type) {
      case 'fuel':
        budget('fuel', v.amountCents, { volumeMl: v.volumeMl ?? undefined, km: v.km ?? undefined, fullTank: v.fullTank, fuelType: v.fuelType ?? undefined });
        if (v.volumeMl != null) lines.push('Volume : ' + fr(v.volumeMl / 1000, 2) + ' L' + (v.fullTank ? ' · plein complet' : ''));
        if (v.km != null) {
          const clash = kmConflict(car, e.date, v.km);
          if (clash) fail('Le compteur du ticket ne suit pas la chronologie : ' + conflictText(clash));
          // Le compteur lu sur le ticket est un relevé réel : il rejoint les relevés de la voiture, sauf si un relevé existe déjà ce jour-là.
          if (!odoLive(next.odo).some(o => o.d === e.date)) odoAdd(v.km); else lines.push('Compteur du ticket : ' + fr(v.km) + ' km · relevé du jour déjà enregistré, conservé');
        }
        break;
      case 'odometer': odoAdd(v.km); break;
      case 'pressure': {
        const pc = t.pchk || {};
        if (validDay(pc.date) && pc.date > e.date) fail('Un contrôle des pressions plus récent est déjà enregistré (' + fd(pc.date) + ')');
        const was = [pc.av, pc.ar].some(Number.isFinite) ? 'AV ' + (Number.isFinite(pc.av) ? fr(pc.av, 2) : '?') + ' / AR ' + (Number.isFinite(pc.ar) ? fr(pc.ar, 2) : '?') + ' bar' : 'aucune valeur';
        // Une pression appartient au jour où elle a été mesurée : la valeur d'un autre jour n'est jamais reconduite sous la nouvelle date.
        const sameDay = pc.date === e.date, keep = k => sameDay && Number.isFinite(pc[k]) ? pc[k] : null;
        t.pchk = { ...pc, date: e.date, T: v.T ?? (sameDay && Number.isFinite(pc.T) ? pc.T : null), av: v.av ?? keep('av'), ar: v.ar ?? keep('ar') };
        paths.push('tire.pchk.date', 'tire.pchk.T', 'tire.pchk.av', 'tire.pchk.ar');
        lines.push('Pressions mesurées : ' + was + ' → AV ' + (t.pchk.av != null ? fr(t.pchk.av, 2) : 'non mesurée') + ' / AR ' + (t.pchk.ar != null ? fr(t.pchk.ar, 2) : 'non mesurée') + (t.pchk.av != null || t.pchk.ar != null ? ' bar' : ''));
        for (const [k, name] of [['av', 'avant'], ['ar', 'arrière']]) if (t.pchk[k] == null && Number.isFinite(pc[k]))
          lines.push('Pression ' + name + ' non mesurée ce jour-là : l’ancienne valeur (' + fr(pc[k], 2) + ' bar' + (validDay(pc.date) ? ' du ' + fd(pc.date) : '') + ') n’est pas reconduite');
        break; }
      case 'tread': {
        const rows = Array.isArray(t.treads) ? t.treads : [];
        if (rows.length >= deps.maxTreads) fail('Historique des profondeurs plein : aucun ancien relevé effacé');
        const before = deps.treadAxles(t), est = e.status === 'estimated', lo = lastOdoBefore(car, e.date);
        t.treads = [...rows, { d: e.date, mm: v.mm, km: lo ? lo.km : null, ax: v.ax, ...(est ? { est: 1 } : {}) }]; paths.push('tire.treads');
        // Un relevé plus ancien que le dernier connu entre dans l'historique sans remplacer la valeur actuelle.
        const newest = rows.every(r => !r || !validDay(r.d) || r.d <= e.date);
        if (newest) { deps.setTreadAxle(t, v.ax, v.mm, est); paths.push('tire.tread', 'tire.treadAv', 'tire.treadAr', 'tire.treadEst'); }
        const show = x => x == null ? '?' : fr(x, 1);
        lines.push('Profondeur ' + AXLE[v.ax] + (est ? ' (estimation)' : '') + ' : ' + (v.ax === 'ar' ? show(before.ar) : show(before.av)) + ' → ' + fr(v.mm, 1) + ' mm' + (newest ? '' : ' · relevé ancien, ajouté à l’historique seulement'));
        break; }
      case 'tireMount': {
        // Un montage plus ancien ne remplace jamais le montage enregistré.
        if (validDay(t.mounted) && e.date < t.mounted) fail('Un montage plus récent est déjà enregistré (' + fd(t.mounted) + ') : ce montage plus ancien ne le remplace pas');
        const was = (TIRE_TYPES[t.type] || (t.type === 'none' ? 'aucun pneu' : 'type inconnu')) + (t.brand ? ' · ' + t.brand : '');
        const switched = t.type !== v.type;
        if (switched) { deps.switchTire(next, v.type); paths.push('tire', 'sets'); }
        const nt = next.tire, same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        // Autre marque, autre modèle ou autre DOT que la fiche : ce sont d'autres pneus, l'identité non fournie n'est pas héritée.
        const otherTyres = ['brand', 'model', 'dot'].some(k => v[k] != null && nt[k] && !same(nt[k], v[k]));
        if (otherTyres) for (const k of ['brand', 'model', 'dot', 'variant', 'homologation', 'info']) if (nt[k]) { nt[k] = ''; paths.push('tire.' + k); }
        for (const k of ['brand', 'model', 'size', 'dot']) if (v[k] != null) { nt[k] = v[k]; paths.push('tire.' + k); }
        // Mesures antérieures au montage : elles concernaient les pneus précédents. Les relevés restent dans l'historique
        // (rattachés à la lecture d'après la date de montage) ; seules les valeurs « actuelles » ne sont plus attribuées aux pneus montés.
        // Un jeu saisonnier remonté tel quel (même identité) garde ses dernières mesures : ce sont les mêmes pneus.
        if (!switched || otherTyres) {
          const rows = (Array.isArray(nt.treads) ? nt.treads : []).filter(r => r && validDay(r.d));
          const current = deps.treadAxles(nt), attached = rows.some(r => r.d >= e.date);
          if (current.worst != null && !attached && (rows.length || otherTyres)) {
            lines.push('Profondeur ' + fr(current.worst, 1) + ' mm : mesurée avant ce montage, détachée des pneus montés (relevés conservés dans l’historique) · à mesurer');
            nt.tread = null; nt.treadAv = null; nt.treadAr = null; nt.treadEst = 0; paths.push('tire.tread', 'tire.treadAv', 'tire.treadAr', 'tire.treadEst');
          }
          const pc = nt.pchk || {}, measured = [pc.av, pc.ar].some(Number.isFinite);
          if (measured && (validDay(pc.date) ? pc.date < e.date : otherTyres)) {
            lines.push('Pressions mesurées' + (validDay(pc.date) ? ' le ' + fd(pc.date) : '') + ' : antérieures à ce montage, détachées · à contrôler');
            nt.pchk = { date: '', T: null }; paths.push('tire.pchk.date', 'tire.pchk.T', 'tire.pchk.av', 'tire.pchk.ar');
          }
          if (nt.lastRot != null) { nt.lastRot = null; paths.push('tire.lastRot'); }
        }
        nt.mounted = e.date; nt.mountKm = v.km; paths.push('tire.mounted', 'tire.mountKm');
        lines.unshift('Pneus montés : ' + was + ' → ' + TIRE_TYPES[v.type] + (nt.brand ? ' · ' + nt.brand : '') + (nt.model ? ' ' + nt.model : '') + ' · le ' + fd(e.date));
        if (v.km != null) odoAdd(v.km);
        break; }
      case 'maintenance': {
        next.maint = next.maint || {};
        if (v.kind === 'revision') {
          const r = next.maint.rev = { d: '', km: null, ...(next.maint.rev || {}) };
          if (validDay(r.d) && r.d > e.date) fail('Une révision plus récente est déjà enregistrée (' + fd(r.d) + ')');
          lines.push('Dernière révision : ' + (validDay(r.d) ? fd(r.d) : 'non renseignée') + ' → ' + fd(e.date) + (v.km != null ? ' à ' + fr(v.km) + ' km' : ''));
          r.d = e.date; r.km = v.km; paths.push('maint.rev.d', 'maint.rev.km');
        } else {
          const c = next.maint.ct = { d: '', next: '', ...(next.maint.ct || {}) };
          if (validDay(c.d) && c.d > e.date) fail('Un contrôle technique plus récent est déjà enregistré (' + fd(c.d) + ')');
          lines.push('Dernier contrôle technique : ' + (validDay(c.d) ? fd(c.d) : 'non renseigné') + ' → ' + fd(e.date) + (c.next ? ' · ancienne date limite effacée (prochain calculé à 2 ans)' : ''));
          c.d = e.date; c.next = ''; paths.push('maint.ct.d', 'maint.ct.next');
        }
        if (v.km != null) odoAdd(v.km);
        if (v.amountCents != null) budget('maintenance', v.amountCents, { km: v.km ?? undefined });
        break; }
    }
    return { car: next, paths: [...new Set(paths)], lines };
  }
  return Object.freeze({ FORMAT, MAX_TEXT, MAX_ENTRIES, TYPES, LABEL, parse, matchCar, duplicate, apply, kmPoints, kmConflict });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RcInbox;
