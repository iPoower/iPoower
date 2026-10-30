// Phase T — Google Identity Services et Google Drive simulés en mémoire (aucun appel réel).
// Repris du harnais NOESIS 13.6 (dossiers dédiés, profil de clé, révisions, envois reprenables).
'use strict';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ACCOUNT = { permissionId: 'perm-recette-1', emailAddress: 'testeur@example.invalid', displayName: 'Testeur fictif' };
// GIS : la fenêtre Google est remplacée par une réponse immédiate (jeton fictif, portée unique).
// window.__recetteExpires (secondes) simule une session Google courte pour tester l'expiration.
const GIS = `window.google={accounts:{oauth2:{initTokenClient(c){return{requestAccessToken(){setTimeout(()=>c.callback({access_token:'jeton-fictif-recette-'+Date.now(),expires_in:window.__recetteExpires||3600,scope:'${SCOPE}'}),50);}};},hasGrantedAllScopes(){return true;}}}};`;
// Picker réel non simulé : le chargement échoue proprement (voie « dossiers dédiés » utilisée).
const GAPI = 'window.gapi={load(n,o){setTimeout(()=>o.onerror&&o.onerror(),10);}};';
function pick(obj, spec) {   // filtre façon Google : seuls les champs demandés (fields=a,b,c(d))
  if (!spec) return obj; const out = {}; let depth = 0, cur = ''; const parts = [];
  for (const ch of spec) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; } if (cur) parts.push(cur);
  for (const part of parts) {
    const m = part.trim().match(/^([A-Za-z]+)(?:\((.*)\))?$/); if (!m || !(m[1] in obj)) continue; const v = obj[m[1]];
    out[m[1]] = m[2] ? (Array.isArray(v) ? v.map(x => pick(x, m[2])) : v && typeof v === 'object' ? pick(v, m[2]) : v) : v;
  }
  return out;
}
function fakeDrive(origins) {
  const files = new Map(), pending = new Map(), log = []; let seq = 0;
  const cors = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,content-range,x-upload-content-type,x-upload-content-length', 'Access-Control-Expose-Headers': 'Location,Range,Content-Length' });
  async function handle(r) {
    const req = r.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    const origin = origins.find(o => o === req.headers().origin) || origins[0], headers = cors(origin);
    const json = (v, status = 200) => r.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(v) });
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers });
    log.push(m + ' ' + p);
    if (p === '/drive/v3/about') return json(pick({ user: ACCOUNT }, u.searchParams.get('fields')));
    if (p === '/drive/v3/files/generateIds') return json({ ids: ['f' + String(++seq).padStart(30, '0')] });
    if (p === '/drive/v3/files' && m === 'POST') {
      const meta = req.postDataJSON(); if (files.has(meta.id)) return json({}, 409);
      files.set(meta.id, { meta: { ...meta, trashed: false, ownedByMe: true, capabilities: { canAddChildren: true }, createdTime: new Date().toISOString() }, bytes: null });
      return json({ id: meta.id });
    }
    if (p === '/drive/v3/files' && m === 'GET') {
      const q = u.searchParams.get('q') || '', contract = (q.match(/value='([^']+)'/) || [])[1], parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const list = [...files.values()].map(f => f.meta).filter(x => (!contract || (x.appProperties || {}).cv_contract === contract) &&
        (!parent || (x.parents || []).includes(parent)) && (!q.includes('folder') || x.mimeType === 'application/vnd.google-apps.folder'));
      return json(pick({ incompleteSearch: false, files: list }, u.searchParams.get('fields') || 'kind,incompleteSearch,files(kind,id,name,mimeType)'));
    }
    if (p === '/upload/drive/v3/files' && m === 'POST') {
      if (u.searchParams.get('uploadType') === 'multipart') {
        const raw = req.postDataBuffer().toString('latin1'), parts = raw.split('\r\n\r\n'), meta = JSON.parse(parts[1].split('\r\n--')[0]), bytes = Buffer.from(parts[2].split('\r\n--')[0], 'latin1');
        if (files.has(meta.id)) return json({}, 409);
        files.set(meta.id, { meta: { ...meta, size: String(bytes.length), trashed: false, createdTime: new Date().toISOString() }, bytes }); return json({ id: meta.id });
      }
      const meta = req.postDataJSON(); pending.set(meta.id, meta);
      return r.fulfill({ status: 200, headers: { ...headers, Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=' + meta.id } });
    }
    if (p === '/upload/drive/v3/files' && m === 'PUT') {
      const id = u.searchParams.get('upload_id'), meta = pending.get(id), bytes = req.postDataBuffer();
      files.set(id, { meta: { ...meta, size: String(bytes.length), trashed: false, createdTime: new Date().toISOString() }, bytes }); pending.delete(id); return json({ id });
    }
    const f = files.get(p.split('/').pop());
    if (p.startsWith('/drive/v3/files/') && f) return u.searchParams.get('alt') === 'media'
      ? r.fulfill({ headers, contentType: 'application/octet-stream', body: f.bytes }) : json(pick(f.meta, u.searchParams.get('fields') || 'kind,id,name,mimeType'));
    log.push('NON SIMULÉ ' + m + ' ' + p); return json({ error: { code: 404 } }, 404);
  }
  const revisions = () => [...files.values()].filter(f => (f.meta.appProperties || {}).cv_contract === 'rc-v1');
  const folders = () => [...files.values()].filter(f => f.meta.mimeType === 'application/vnd.google-apps.folder');
  return { handle, files, log, revisions, folders };
}
module.exports = { SCOPE, ACCOUNT, GIS, GAPI, fakeDrive };
