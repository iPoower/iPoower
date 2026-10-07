/* ---------- onglet Analyse : pneus réellement montés, état thermique estimé, adhérence, freinage, trajet ---------- */
// Toute la physique vit dans tyreLab (src/tyrelab.js, pur et testé) ; ici, seulement les données d'entrée, la mémoire thermique et le rendu.
// Mémoire thermique : twrc.tyretherm.v1 = { [id voiture]: { at: heure locale, T: gomme estimée } } — ni position, ni trajet, ni lieu.
const TT_KEY = 'twrc.tyretherm.v1';
let TT = null;
function ttLoad() { if (!TT) { try { TT = JSON.parse(lsGet(TT_KEY) || '{}') || {}; } catch (e) { TT = {}; } } return TT; }
function ttSave(carId, at, T, sig) {
  if (!carId || !at || !Number.isFinite(T)) return;
  const o = ttLoad(); o[carId] = { at, T: Math.round(T * 10) / 10, sig: sig || null };   // sig : identité de la monte (invalidation au changement de jeu)
  Object.keys(o).forEach(k => { if (!S.cars.some(c => c.id === k)) delete o[k]; });
  lsSet(TT_KEY, JSON.stringify(o));
}
const labCar = () => appActiveCar() || S.cars.find(c => c.id === UI.labCar) || S.cars.find(hasTires) || S.cars[0];
// Les calculs gardent leurs seuils ; l'interface nomme un potentiel relatif estimé, jamais une garantie.
const labBrakeText = word => word === 'Optimal' ? 'Favorable estimé' : word + ' estimé';
// état pneumatique unique (onglet Pneus = source de vérité) : recalculé à chaque rendu, donc jamais périmé après une saisie
const tyreStateOf = car => tyreState(car, { today: nowIn('Europe/Paris').slice(0, 10) });
const localTs = (ms, tz) => new Date(ms).toLocaleString('sv-SE', { timeZone: tz || 'Europe/Paris', hour12: false }).replace(' ', 'T').slice(0, 16);
function labInput(car) {
  const m = CX && CX.m, tz = (m && m.tz) || 'Europe/Paris';
  if (!m) return { now: nowIn(tz), car, hours: [], state: tyreStateOf(car) };
  const now = DEMO.on ? m.nowStr.slice(0, 16) : nowIn(tz);
  const raw = RAW[UI.loc], ageMin = DEMO.on || !raw || !raw.t ? null : Math.max(0, (Date.now() - raw.t) / 60e3);
  let drive = null;
  if (!DEMO.on && LIVE.phase === 'active' && LIVE.startFix) {
    const sf = LIVE.startFix, geo = Number.isFinite(sf.lat), cand = [FIX, LIVE.lastFix].find(f => f && f.ts > sf.ts), lf = geo && cand ? cand : null;
    const startTs = TRIPSTART && TRIPSTART.key === LIVE.key ? TRIPSTART.at : sf.ts;
    const dmin = Math.max(0, (Date.now() - startTs) / 60e3), b = LIVE.base || {}, planMin = b.l && b.l.min ? b.l.min : b.dep && b.arr ? Math.max(1, liveMin(b.dep, b.arr)) : null;
    // progression le long de l'itinéraire OSRM (km du premier itinéraire − km restants) ; sinon vol d'oiseau ×1,2 ; sans GPS (hors ligne,
    // GPS coupé) : temps écoulé / durée prévue × distance prévue. La source est toujours affichée.
    const R0 = LIVE.route0, R = LIVE.route, onRoute = !!lf && R0 && R && R0.key === LIVE.key && R.key === LIVE.key && R0.km >= R.km;
    const total = R0 && R0.key === LIVE.key ? R0.km : b.l && b.l.km != null ? b.l.km : null;
    const km = onRoute ? (R0.km - R.km) + (distKm(sf, R0.o) + distKm(R.o, lf)) * 1.2 : lf ? distKm(sf, lf) * 1.2 : total != null && planMin ? total * Math.min(1, dmin / planMin) : null;
    drive = { active: true, since: localTs(startTs, tz), startTs, km, total, kmSrc: onRoute ? 'route' : lf ? 'estimate' : km != null ? 'time' : null, speedKmh: dmin >= 2 && km != null ? km / dmin * 60 : null };
  }
  // prochain trajet réellement prévu (briefing) : points datés, kilomètres de l'agenda ou distance domicile-travail ×1,3
  const trips = wxTrips(m).filter(t => t.arr > now && t.points.length), t0 = trips[0] || null;
  let trip = null;
  if (t0) {
    const b = BRF_SHOWN.find(x => x.key === t0.id), km = t0.km != null ? t0.km : b && b.td && b.td.dist ? b.td.dist * 1.3 : null;
    const dur = (tsToDate(t0.arr) - tsToDate(t0.dep)) / 60e3, v = km && dur > 0 ? km / dur * 60 : null;
    trip = { label: t0.label, km, kind: v == null ? null : v < 45 ? 'ville' : v < 80 ? 'route' : 'autoroute', points: t0.points.map(p => ({ t: p.t, f: p.f, km: p.km, name: p.name, x: p.x })) };
  }
  const h = ttLoad()[car.id], state = tyreStateOf(car);
  const reports = reportsLive().map(r => ({ kind: r.kind, at: localTs(r.at, tz) }));
  return { now, car, hours: m.hs.slice(Math.max(0, m.nowI - 36), m.nowI + 40), history: h && h.at <= now && tyreMemoryValid(h, state) ? h : null, state, drive, trip, ageMin, reports,
    db: car.tire && (car.tire.brand || car.tire.model) ? findTire(car.tire.brand, car.tire.model) : null };
}
// suivi de la mémoire thermique : pendant un trajet vivant (toutes les 2 min au plus) et à l'arrivée
// état du trajet vu par Analyse (même état LIVE que le briefing) : simulation avant départ, suivi en cours, bilan à l'arrivée
function labTripState(r, li) {
  const d = li && li.drive, hm = ms => localTs(ms).slice(11, 16), rg = x => `${String(x[0]).replace('-', '−')}–${String(x[1]).replace('-', '−')} °C`, km = x => f1(x).replace(/,0$/, '');
  if (d) {
    const src = d.kmSrc === 'route' ? 'le long de l’itinéraire' : d.kmSrc === 'estimate' ? 'estimée : GPS, vol d’oiseau ×1,2' : d.kmSrc === 'time' ? 'estimée au temps écoulé, sans GPS' : null;
    return `<div class="wx-blk lab-live" data-k="live"><h3>🚗 Trajet en cours</h3><ul class="lab-why"><li>Départ réel : <b>${hm(d.startTs)}</b></li>
      ${d.km != null ? `<li>Progression : <b>${km(d.km)}${d.total != null ? ' / ' + km(d.total) : ''} km</b>${src ? ` <span class="sub">(${src})</span>` : ''}</li>` : ''}
      <li>Pneu : <b>${esc(r.thermal.state.toLowerCase())}</b> · gomme ≈ ${rg(r.thermal.range)}${r.hero.warm && !r.warm.reached ? ' · ' + esc(r.hero.warm) + ' restantes' : ''}</li></ul></div>`;
  }
  if (TRIPEND && (!TRIPEND.carId || li && li.car && li.car.id === TRIPEND.carId) && Date.now() - TRIPEND.at < 3 * 3600e3) {
    const e = TRIPEND;
    return `<div class="wx-blk lab-live" data-k="end"><h3>🏁 Trajet terminé${e.name ? ' · ' + esc(e.name) : ''} · ${hm(e.at)}</h3><ul class="lab-why">${e.km != null ? `<li><b>${km(e.km)} km</b>${e.kmSrc === 'route' ? '' : ' <span class="sub">(estimé)</span>'}</li>` : ''}<li><b>${e.min} min</b></li>
      <li>État thermique final estimé : <b>${rg(e.range)}</b> (${esc(String(e.state).toLowerCase())})</li><li>Confiance : ${esc(e.conf)} · sert de point de départ au prochain trajet</li></ul></div>`;
  }
  if (r.trip && r.trip.rows.length) {
    const rain = r.trip.rows.find(x => x.events.some(ev => ev.ic === '🌧')), last = r.trip.rows[r.trip.rows.length - 1];
    return `<div class="wx-blk lab-live" data-k="pre"><h3>⏳ Avant départ · ${esc(r.trip.label)} ${esc(r.trip.dep)}</h3><ul class="lab-why"><li><b>${esc(TL_STATES[r.trip.startS])}</b> probable au départ${r.hero.warm && !r.warm.reached ? ' · ' + esc(r.hero.warm) + ' avant plage favorable' : ''}</li>
      ${rain ? `<li>Pluie prévue ${rain.km != null ? 'après ≈ ' + rain.km + ' km' : 'vers ' + esc(rain.t)}</li>` : ''}<li>État thermique estimé à l’arrivée : <b>${esc(last.state.toLowerCase())}</b> · ≈ ${rg(last.range)}</li></ul></div>`;
  }
  return '';
}
function labThermTick(arrived, vehicle = null) {
  if (DEMO.on || !CX) return;
  const car = vehicle || labCar(); if (!car || !hasTires(car)) return;
  if (!arrived && !(LIVE.phase === 'active' && Date.now() - (labThermTick.at || 0) > 120e3)) return;
  const inp = labInput(car), r = tyreLab(inp); if (!r || !r.thermal) return;
  labThermTick.at = Date.now(); ttSave(car.id, r.now, r.thermal.T, r.state && r.state.sig);
  return { r, inp };
}
function renderLab() {
  const el = $('#secLab'); if (!el) return;
  if (UI.view !== 'analyse') { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; renderLab.last = ''; } return; }
  el.hidden = false;
  const car = labCar(), E = WXD_EMO, lvc = l => 'lv' + (l == null ? 'x' : l), sg = v => String(v).replace('-', '−'), rg = r => `${sg(r[0])} à ${sg(r[1])} °C`;
  const cars = S.cars.length > 1 ? `<div class="chips lab-cars" role="group" aria-label="Véhicule analysé">${S.cars.map(c => `<button class="chip" data-act="labcar" data-car="${esc(c.id)}" aria-pressed="${c === car}">${esc(c.short || c.name)}</button>`).join('')}</div>` : '';
  const li = car ? labInput(car) : null, r = car ? tyreLab(li) : { known: false, reason: 'Monte active inconnue — sélectionner les pneus montés.' };
  let html;
  if (!r.known) html = `${cars}<div class="lab-hero lvx"><div class="wx-hk"><span>🔬 Analyse pneus · ${esc(car ? car.short || car.name : '')}</span></div>
      <h2 class="wx-ht">${esc(r.reason)}</h2><p class="wx-hl">Race Control n’analyse jamais un autre pneu que celui réellement monté.</p>
      <div class="cal-v"><button class="btn" data-act="goset-cfg">Renseigner les pneus montés</button><button class="btn" data-act="view" data-v="pneus">Onglet Pneus</button></div></div>`;
  else {
    const t = r.tyre, idx = [t.li != null ? `charge ${t.li}${t.kg ? ' (' + t.kg + ' kg)' : ''}` : null, t.si ? `vitesse ${t.si}${t.kmh ? ' (' + t.kmh + ' km/h)' : ''}` : null, t.xl ? 'XL renforcé' : null, t.fp ? 'protège-jante' : null, t.rf ? 'roulage à plat' : null, t.pmsf === true ? '3PMSF' : null].filter(Boolean);
    const fiche = `<details class="wx-pc lab-d" data-k="spec"><summary><span class="ic" aria-hidden="true">📋</span><span class="tt">Fiche du pneu monté</span><span class="ln">${esc(t.title)}${t.size ? ' · ' + esc(t.size) : ''}</span></summary>
      <div class="lab-sp"><p class="lab-tag est">DÉCODAGE DE LA MONTE SAISIE</p><ul><li>Saison : ${esc(t.season)}${t.uhp ? ' · haute performance (fenêtre décalée de +5 °C, hypothèse Race Control)' : ''}</li>${idx.length ? `<li>${esc(idx.join(' · '))}</li>` : ''}<li>${esc(t.axles)}</li>${r.spec.db && r.spec.db.cat ? `<li>Base Race Control : ${esc(r.spec.db.cat)}${r.spec.db.tier ? ' · gamme ' + esc(r.spec.db.tier) : ''}</li>` : ''}</ul>
      <p class="lab-tag fab">DONNÉE CONSTRUCTEUR</p><ul>${r.spec.known.map(f => f.v ? `<li><b>${esc(f.k)}</b> : ${esc(f.v)} · <a href="${esc(f.src)}" target="_blank" rel="noopener">source ↗</a>${f.check ? ' <span class="sub">(relevé via recherche le 05/10/2026, à confirmer)</span>' : ''}</li>` : `<li class="muted"><b>${esc(f.k)}</b> : non disponible</li>`).join('')}</ul>
      <p class="sub">Étiquette européenne : elle dépend de la dimension exacte (registre EPREL) et n’est jamais déduite du modèle seul.</p></div></details>`;
    // état du pneu monté, lu dans l'onglet Pneus (aucune saisie ici) : provenance, fraîcheur, essieux, jeux stockés, entretien
    const st = r.state, stHtml = st ? `<details class="wx-pc lab-d" data-k="state"><summary><span class="ic" aria-hidden="true">🛞</span><span class="tt">État du pneu monté · onglet Pneus</span><span class="ln">${esc(st.active ? 'Monte active : ' + st.active.label : 'Monte inconnue')}${st.dot ? ' · ' + esc(st.dot.raw) : ''}${st.tread.mm != null ? ' · ' + esc(treadTxt(st.tread, st.tread.mm)) + (st.tread.est ? ' (estimée)' : '') : ''}</span></summary>
      <div class="lab-sp"><p class="lab-tag est">QUALITÉ DES DONNÉES</p><ul>${st.quality.map(q => `<li>${q.st} <b>${esc(q.k)}</b> : ${esc(q.txt)}</li>`).join('')}</ul>
      <p class="lab-tag est">DONNÉES SAISIES DANS PNEUS</p><ul>${st.dot ? `<li>${esc(st.dot.txt)}</li>` : '<li class="muted">DOT non renseigné</li>'}
        <li>${st.mount.date ? `Monté le ${esc(fmtDay(st.mount.date))}${st.mount.serviceY != null ? ' · usage ≈ ' + f1(st.mount.serviceY) + ' an' : ''}` : 'Date de montage non renseignée'}${st.mount.kmSince != null ? ` · ≈ ${st.mount.kmSince.toLocaleString('fr-FR')} km depuis le montage` : st.mount.km != null ? ' · compteur actuel inconnu' : ''}</li>
        <li>Profondeur : ${st.tread.mm != null ? `${esc(treadTxt(st.tread, st.tread.mm))}, ${st.tread.est ? 'estimée par vous (pas mesurée à la jauge)' : 'mesurée par vous'}${st.tread.date ? ' le ' + esc(fmtDay(st.tread.date)) : ''}${st.tread.split && st.tread.av !== st.tread.ar ? ' · calculs sur l’essieu le plus usé (' + (st.tread.worstAxle === 'ar' ? 'arrière' : 'avant') + ')' : ''}` : 'non renseignée (Race Control ne l’estime jamais à ta place)'}${st.tread.rate ? ` · usure ≈ ${st.tread.rate.toFixed(2).replace('.', ',')} mm / 1 000 km` : st.tread.n === 1 ? ' · tendance après une 2e mesure' : ''}</li>
        <li>Pression : ${st.pressure.target != null ? `cible ${f1(st.pressure.target)} bar (plaque du véhicule)` : 'cible non renseignée'}${st.pressure.check ? ` · contrôlée le ${esc(fmtDay(st.pressure.check.date))}${st.pressure.check.T != null ? ' à ' + f1(st.pressure.check.T) + ' °C' : ''}` : ''}</li>
        <li>Essieux : AV ${st.axles.front.press != null ? f1(st.axles.front.press) + ' bar' : '—'} · AR ${st.axles.rear.press != null ? f1(st.axles.rear.press) + ' bar' : '—'} · ${esc(st.axles.note)}</li>
        <li>Profil technique : ${esc(st.profile.label)}</li>
        ${st.stored.length ? `<li>Jeux stockés (jamais analysés) : ${st.stored.map(x => esc(x.label + ' · ' + x.title)).join(' ; ')}</li>` : ''}</ul>
      ${st.maint.length ? `<p class="lab-tag est">ENTRETIEN (hors verdict de conduite)</p><ul>${st.maint.map(x => `<li>${WXD_EMO[Math.min(3, x.lv)]} ${esc(x.text)}</li>`).join('')}</ul>` : ''}</div></details>` : '';
    if (r.noWeather) html = `${cars}<div class="lab-hero lvx"><div class="wx-hk"><span>🔬 Analyse pneus · ${esc(car.short || car.name)}</span></div><h2 class="wx-ht">${esc(t.title)}</h2><p class="wx-hl">${esc(t.size || 'dimension non renseignée')}</p>
      <p class="wx-hl">Météo indisponible : aucune estimation thermique ni d’adhérence (rien n’est inventé).</p></div>${stHtml}${fiche}`;
    else {
      const h = r.hero, th = r.thermal, g = r.grip, cf = r.confidence;
      const hero = `<div class="lab-hero ${lvc(h.lvl)}" role="status"><div class="wx-hk"><span>🔬 Analyse pneus · ${esc(car.short || car.name)}</span><span class="wx-age">${r.phase === 'driving' ? 'EN ROULAGE' : r.phase === 'parked' ? 'À L’ARRÊT' : 'HISTORIQUE INCONNU'}</span></div>
        <p class="lab-tyre"><b>${esc(t.title)}</b>${t.size ? ' · ' + esc(t.size) : ''}</p>
        <h2 class="wx-ht"><span aria-hidden="true">${h.emoji}</span> ${esc(h.state.toUpperCase())}</h2>
        <p class="wx-hl wx-h1">Gomme estimée ≈ ${rg(th.range)}${h.warm ? ' · ' + esc(h.warm) : ''}</p>
        <p class="wx-hl">Freinage : <b>${esc(labBrakeText(h.brake))}</b> · Virage : <b>${esc(h.corner === 'Excellente' ? 'Favorable' : h.corner)}</b> · ${['rain', 'heavy', 'pool'].includes(r.env.surf) ? 'Pluie' : 'Si pluie'} : <b>${esc(h.rain)}</b></p>
        <p class="wx-hl">Facteur limitant : <b>${esc(h.limiting)}</b> · Confiance : <b>${esc(cf.level)}</b></p></div>`;
      const pct = x => Math.round(x * 1000) / 10;
      const warmTxt = r.warm.reached ? (r.warm.sinceMin != null ? `Zone favorable atteinte depuis ~${r.warm.sinceMin} min` : 'Zone favorable : gomme estimée dans la plage') : r.warm.never ? 'Zone favorable non atteinte dans ces conditions' : `Avant la zone favorable : ${esc(h.warm)}`;
      const win = `<div class="wx-blk lab-win"><h3>Fenêtre de fonctionnement</h3>
        <div class="lab-scale" role="img" aria-label="État estimé : ${esc(th.state)}"><i class="z0" style="width:${pct(th.marks[0])}%"></i><i class="z1" style="width:${pct(th.marks[1] - th.marks[0])}%"></i><i class="z2" style="width:${pct(th.marks[2] - th.marks[1])}%"></i><i class="z3" style="width:${pct(th.marks[3] - th.marks[2])}%"></i><i class="z4" style="width:${pct(1 - th.marks[3])}%"></i><b class="lab-mk" style="left:${pct(th.pos)}%"></b></div>
        <div class="lab-sl"><span>FROID</span><span>EN CHAUFFE</span><span>FAVORABLE</span><span>CHAUD</span></div>
        <p class="wx-hl">${warmTxt}${r.warm.hyp ? ` <span class="sub">(${esc(r.warm.hyp)})</span>` : ''}</p>
        ${r.cool ? `<p class="sub">${esc(r.cool.label)} · ≈ ${r.cool.kept} % de l’échauffement conservé</p>` : ''}
        <details class="wx-how" data-k="why"><summary>Pourquoi « ${esc(th.state)} » ?</summary><ul class="lab-why">${th.why.map(x => `<li>+ ${esc(x)}</li>`).join('')}<li>→ gomme estimée ≈ ${rg(th.range)} ; seuils ${esc(t.season)} : froid sous ${sg(th.win[0])} °C, favorable de ${sg(th.win[1])} à ${sg(th.win[2])} °C, chaud au-delà de ${sg(th.win[2])} °C (hypothèses Race Control)</li></ul></details></div>`;
      const d = g.dist;
      const brake = `<div class="wx-blk lab-brk ${lvc(g.lv)}"><h3>🛑 Freinage</h3><p class="lab-big">${E[g.lv]} ${esc(labBrakeText(g.word).toUpperCase())}</p><p class="sub">Potentiel relatif · confiance ${esc(cf.level)}</p>
        <p class="wx-hl">${g.dom ? 'Facteur dominant : <b>' + esc(g.dom.k) + '</b>' : 'Aucun facteur limitant notable'}</p>
        <details class="wx-how" data-k="brk"><summary>Pourquoi ? Potentiel relatif ${Math.round(g.mu * 100)} %</summary><ul class="lab-why">${g.f.map(x => `<li>${esc(x.k)} : ×${Math.round(x.v * 100)} %</li>`).join('')}</ul></details>
        ${d ? `<details class="wx-how" data-k="dist"><summary>Ordre de grandeur à ${d.v} km/h (modèle, pas une mesure)</summary><ul class="lab-why"><li>Maintenant : ≈ ${d.now[0]}–${d.now[1]} m de freinage</li><li>Référence sec, pneu en température : ≈ ${d.dry[0]}–${d.dry[1]} m</li><li>Référence mouillé : ≈ ${d.wet[0]}–${d.wet[1]} m</li><li>+ temps de réaction (1 s) : ≈ ${d.react} m parcourus avant de freiner</li></ul>
          <p class="sub">Modèle Race Control : d = v² / (2 µ g), µ sec 0,7–0,9 et mouillé 0,4–0,55 (ordre de grandeur), multiplié par les facteurs ci-dessus. Pas un test indépendant de ce pneu, pas une mesure de ce véhicule, aucune garantie.</p></details>` : '<p class="sub">Neige ou verglas : aucune distance affichée, l’incertitude est trop grande. Indice relatif seulement.</p>'}</div>`;
      const grip = `<div class="wx-blk lab-grip"><h3>🧲 Adhérence estimée</h3>${g.bars.map(b => `<details class="lab-bar ${lvc(b.lv)}" data-k="b-${b.id}"><summary><span class="k">${esc(b.label)}</span><span class="bars" aria-hidden="true">${'<i class="on"></i>'.repeat(b.b)}${'<i></i>'.repeat(10 - b.b)}</span><b>${esc(b.word === 'Excellente' ? 'Favorable' : b.word)}</b></summary><ul class="lab-why">${b.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div>`;
      const aqua = `<div class="wx-blk lab-aq ${lvc(g.aqua.lv)}"><h3>🌊 Aquaplaning</h3><p class="lab-big">${E[g.aqua.lv]} ${esc(g.aqua.word.toUpperCase())}</p><ul class="lab-why">${g.aqua.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
      const c = r.compare, cmp = `<div class="wx-blk lab-cmp"><h3>Comparaison</h3><table class="lab-t"><thead><tr><th></th><th>${esc(c.a)}</th><th>${esc(c.b)}</th></tr></thead><tbody>${c.rows.map(x => `<tr><th>${esc(x.label)}</th><td>${E[x.a.lv]} ${esc(x.label.startsWith('Freinage') ? labBrakeText(x.a.word) : x.a.word)}</td><td>${E[x.b.lv]} ${esc(x.label.startsWith('Freinage') ? labBrakeText(x.b.word) : x.b.word)}</td></tr>`).join('')}</tbody></table></div>`;
      const tr = r.trip ? `<div class="wx-blk lab-trip"><h3>Analyse du trajet · ${esc(r.trip.label)} ${esc(r.trip.dep)} → ${esc(r.trip.arr)}</h3><ol class="lab-tl">${r.trip.rows.map(x => `${x.events.map(ev => `<li class="ev lv2"><time class="num">${esc(x.t)}</time><span>${ev.ic} ${esc(ev.text)}<br><span class="sub">Impact : ${esc(ev.impact.join(' · '))}</span></span></li>`).join('')}<li class="${lvc(x.lv)}"><time class="num">${esc(x.t)}</time><span><b>${esc(x.name || (x.km != null ? 'km ' + x.km : 'point de passage'))}</b>${x.km != null && x.name ? ` <span class="sub">km ${x.km}</span>` : ''}<br>${E[x.lv]} ${esc(x.state)} · ≈ ${rg(x.range)} · freinage ${esc(labBrakeText(x.brake).toLowerCase())}</span></li>`).join('')}</ol></div>`
        : `<div class="wx-blk lab-trip"><h3>Analyse du trajet</h3><p class="sub">Aucun trajet prévu : l’analyse suppose un départ sur route (≈ 70 km/h).</p></div>`;
      const p = r.press, press = `<div class="wx-blk lab-pr ${p.known && p.low ? 'lv2' : ''}"><h3>Pression</h3>${p.known ? `<ul class="lab-why">${p.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub">Source : ${esc(p.src)}.</p>` : `<p class="sub">${esc(p.text)}</p>`}</div>`;
      const conf = `<details class="wx-pc lab-d" data-k="conf"><summary><span class="ic" aria-hidden="true">🎯</span><span class="tt">Niveau de confiance</span><span class="ln">${esc(cf.level[0].toUpperCase() + cf.level.slice(1))}</span></summary><ul>${(cf.axes || []).map(([k, v]) => `<li><b>${esc(k)}</b> : ${esc(v)}</li>`).join('')}${cf.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
      html = cars + hero + labTripState(r, li) + win + brake + grip + aqua + cmp + tr + press + stHtml + fiche + conf;
    }
  }
  html += `<p class="sub lab-foot">Estimations Race Control (plages, tendances, indicateurs) : aucune mesure de capteur, aucune distance de freinage garantie. État, références et montage : <button class="btn sm" data-act="view" data-v="pneus">onglet Pneus</button></p>`;
  if (html === renderLab.last) return;
  const open = new Set([...el.querySelectorAll('details[open][data-k]')].map(x => x.dataset.k));
  el.innerHTML = html; renderLab.last = html;
  el.querySelectorAll('details[data-k]').forEach(x => { if (open.has(x.dataset.k)) x.open = true; });
}
