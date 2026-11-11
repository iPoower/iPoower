// Alerte de secours (module pur, testé par tests/test_relay_clock.js). Appelée par worker.mjs à chaque minute.
// Incident du 11 novembre 2026 : panne GitHub Actions (démarrage des runs refusé) de 21:10 à 22:04, heure de Paris. L'horloge
// relançait le relais dans le vide ; personne n'était prévenu que les alertes verglas et brouillard ne partaient plus, car c'est
// le relais lui-même (GitHub Actions) qui les envoie. Ce module ne dépend PAS de GitHub Actions : quand obs.json reste périmé,
// le Worker prévient lui-même par ntfy que les données sont figées et qu'il faut vérifier la météo avant de partir.
//
// Sans stockage, comme le reste de l'horloge : la décision ne dépend que de l'âge d'obs.json et de l'heure planifiée du tick
// (event.scheduledTime, alignée sur la minute). Le cron tourne chaque minute, donc :
//   · « panne » : un seul message quand l'âge franchit ALERT_AFTER_MIN (fenêtre d'une minute [30, 31[ min) ;
//   · « rappel » : dans la fenêtre du matin (par défaut semaine 05:00–09:30, heure de Paris, même fenêtre que l'objectif de
//     tools/relay-freshness.js), au début de la fenêtre puis toutes les ALERT_REPEAT_MIN, si la panne dure encore :
//     au plus 3 rappels par matin. Une panne commencée la nuit est donc signalée avant le départ.
//   · obs.json illisible ou inaccessible (GitHub Pages en panne) : l'âge est inconnu, seulement aux minutes de rappel,
//     après une seconde lecture pour écarter un incident passager.
// Hors fenêtre, priorité ntfy basse (2) : pas de réveil en pleine nuit ; dans la fenêtre, priorité haute (4).
// Aucun message de retour à la normale : sans stockage, l'horloge ne peut pas savoir qu'une panne a eu lieu ; l'application
// affiche l'âge réel des données.
//
// Confidentialité : ntfy.sh est un serveur public. Le message ne contient ni lieu, ni trajet, ni rendez-vous : seulement
// l'heure de la dernière publication et la durée de la panne. Le sujet ntfy (NTFY_TOPIC) est un secret du Worker, jamais
// écrit dans ce dépôt ni dans les journaux. Sans NTFY_TOPIC, le module ne fait rien (alerte désactivée).
//
// Réglages facultatifs du Worker (variables, pas des secrets) :
//   ALERT_WINDOW   « HH:MM-HH:MM », heure de Paris (défaut 05:00-09:30)
//   ALERT_DAYS     « semaine » (défaut, lundi–vendredi) ou « tous »
//   ALERT_CLICK    adresse https ouverte en touchant la notification (défaut : aucune)
import { decide } from './clock.mjs';
export const NTFY_URL = 'https://ntfy.sh/';
export const ALERT_AFTER_MIN = 30;     // panne signalée après 30 min sans publication (le relais publie normalement toutes les ~10 min)
export const ALERT_REPEAT_MIN = 90;    // rappels dans la fenêtre : 05:00, 06:30, 08:00 avec la fenêtre par défaut
export const DEFAULT_WINDOW = '05:00-09:30';
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// Heure de Paris d'un instant : { weekday (lundi–vendredi), min (minute du jour), hhmm }. Pur.
export function parisClock(ms) {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const h = +p.hour % 24, m = +p.minute;
  return { weekday: !['Sat', 'Sun'].includes(p.weekday), min: h * 60 + m, hhmm: String(h).padStart(2, '0') + 'h' + String(m).padStart(2, '0') };
}

// Réglages lus dans env ; une valeur invalide retombe sur le défaut (jamais d'alerte désactivée par une faute de frappe). Pur.
export function alertConfig(env = {}) {
  const parse = s => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s || ''));
    if (!m) return null;
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    return +m[1] < 24 && +m[2] < 60 && +m[3] < 24 && +m[4] < 60 && a < b ? { start: a, end: b } : null;
  };
  const win = parse(env.ALERT_WINDOW) || parse(DEFAULT_WINDOW);
  const click = /^https:\/\/[^\s]+$/.test(String(env.ALERT_CLICK || '')) ? String(env.ALERT_CLICK) : null;
  return { ...win, everyDay: String(env.ALERT_DAYS || '').trim().toLowerCase() === 'tous', click };
}

// Décision pure. d = résultat de decide() (clock.mjs) ; now = heure planifiée du tick (début de minute).
// Retourne null (rien à envoyer) ou { kind: 'panne' | 'rappel' | 'illisible', priority, inWindow }.
export function alertDecision(d, now, cfg) {
  const c = parisClock(now);
  const inWindow = (cfg.everyDay || c.weekday) && c.min >= cfg.start && c.min < cfg.end;
  const reminderMinute = inWindow && (c.min - cfg.start) % ALERT_REPEAT_MIN === 0;
  if (d.decision === 'stale' && d.age >= ALERT_AFTER_MIN) {
    if (d.age < ALERT_AFTER_MIN + 1) return { kind: 'panne', priority: inWindow ? 4 : 2, inWindow };
    if (reminderMinute) return { kind: 'rappel', priority: 4, inWindow };
    return null;
  }
  if ((d.decision === 'unreachable' || d.decision === 'invalid') && reminderMinute) return { kind: 'illisible', priority: 4, inWindow };
  return null;
}

// Message ntfy, sans aucune donnée personnelle. updatedMs : heure de la dernière publication (null si inconnue). Pur.
export function alertMessage(a, d, updatedMs, cfg) {
  const dur = m => m >= 120 ? Math.floor(m / 60) + ' h ' + String(Math.floor(m % 60)).padStart(2, '0') : Math.floor(m) + ' min';
  const since = updatedMs == null ? null : parisClock(updatedMs).hhmm;
  const title = a.kind === 'illisible' ? '⚠️ Race Control : données météo inaccessibles'
    : `⚠️ Race Control : relais en panne depuis ${since}`;
  const lines = a.kind === 'illisible'
    ? ['Les données du relais sont illisibles ou inaccessibles (GitHub Pages en panne ?).']
    : [`Aucune donnée météo publiée depuis ${dur(d.age)}.`];
  lines.push('Les alertes verglas et brouillard ne partent plus. Vérifie la météo toi-même avant de partir.');
  const body = { topic: null, title, message: lines.join('\n'), priority: a.priority, tags: ['warning'] };
  if (cfg.click) body.click = cfg.click;
  return body;
}

// Une exécution. obs : contenu d'obs.json déjà lu par le Worker (undefined = inaccessible, null = illisible).
// reread : seconde lecture d'obs.json, utilisée seulement avant une alerte « illisible ». Journalise une ligne JSON, sans le sujet.
export async function outageAlert(env, { obs, now, reread, fetchImpl = fetch, log = console.log } = {}) {
  const out = { t: new Date(now).toISOString(), alert: null, priority: null, status: null, reason: null };
  const emit = () => log(JSON.stringify(out));
  try {
    if (!env || !env.NTFY_TOPIC) { out.reason = 'alerte désactivée (NTFY_TOPIC absent)'; return out; }
    const cfg = alertConfig(env);
    let d = decide(obs, now), a = alertDecision(d, now, cfg);
    if (a && a.kind === 'illisible' && reread) {   // incident passager de Pages : seconde lecture avant d'alerter
      obs = await reread(); d = decide(obs, now); a = alertDecision(d, now, cfg);
    }
    if (!a) return out;
    const updatedMs = obs && Number.isFinite(Date.parse(obs.updated)) ? Date.parse(obs.updated) : null;
    const body = { ...alertMessage(a, d, updatedMs, cfg), topic: String(env.NTFY_TOPIC).trim() };
    out.alert = a.kind; out.priority = a.priority;
    const r = await fetchImpl(NTFY_URL, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    out.status = r.status;
    if (r.status < 200 || r.status >= 300) { out.reason = 'envoi ntfy refusé'; throw new Error(`Alerte de secours refusée par ntfy : HTTP ${r.status}`); }
    out.reason = 'alerte envoyée';
    return out;
  } catch (e) {
    if (!out.reason || out.reason === 'alerte envoyée') {   // sujet masqué AVANT la coupe à 80 caractères (jamais un sujet partiel)
      let msg = String(e.message || e);
      if (env && env.NTFY_TOPIC) msg = msg.split(String(env.NTFY_TOPIC).trim()).join('***');
      out.reason = msg.replace(/https?:\S+/g, 'url').slice(0, 80);
    }
    throw e;
  } finally { emit(); }
}
