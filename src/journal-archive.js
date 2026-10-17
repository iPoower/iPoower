/* Archive cumulative du journal. Aucune limite d'affichage ni horloge ne
 * participe à sa conservation. Les instantanés sources, même non affichables,
 * restent intacts. Identité = JSON canonique complet, sans hash abrégé. */
const JournalArchive = (() => {
  const KEY = 'twrc.debrief.archive.v1', CONTEXT = 'twrc.context.v1', MIRROR = 'twrc.debrief.v1';
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);
    if (object(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    return v;
  }
  const encode = v => JSON.stringify(canonical(v));
  function read(v) {
    if (v == null) return { v: 1, records: [] };
    if (typeof v === 'string') v = JSON.parse(v);
    if (!object(v) || v.v !== 1 || !Array.isArray(v.records) || !v.records.every(r => typeof r === 'string'))
      throw new Error('Archive du journal inconnue ou incomplète : opération refusée.');
    // Le contenu n'est jamais nettoyé pour le rendre acceptable : un fichier
    // malformé échoue ; un ancien enregistrement non affichable est conservé.
    return { v: 1, records: v.records.map(r => encode(JSON.parse(r))) };
  }
  function union(...archives) {
    return { v: 1, records: [...new Set(archives.flatMap(a => read(a).records))].sort() };
  }
  function collect(debrief) {
    if (debrief == null) return read(null);
    if (!object(debrief) || debrief.entries != null && !Array.isArray(debrief.entries))
      throw new Error('Journal incomplet : opération refusée sans nettoyage.');
    return union(debrief.archive, { v: 1, records: (debrief.entries || []).map(encode) });
  }
  function capture(values) {
    let archive = read(values[KEY]);
    if (values[CONTEXT] != null) archive = union(archive, collect(JSON.parse(values[CONTEXT]).debrief));
    if (values[MIRROR] != null) archive = union(archive, collect(JSON.parse(values[MIRROR])));
    return archive;
  }
  function protect(base, next, activate = false) {
    const context = next[CONTEXT] == null ? null : JSON.parse(next[CONTEXT]);
    // Une projection peut avoir debrief.archive dès l'initialisation : elle ne
    // constitue PAS une autorisation de convertir un coffre v2 en v3.
    // Seule activateJournal (activate=true), après relecture de la copie externe,
    // peut créer la clé. Un coffre déjà v3 conserve son archive aux écritures.
    if (!activate && base[KEY] == null) {
      if (next[KEY] != null || capture(base).records.length || capture(next).records.length) {
        throw Object.assign(new Error('Copie de récupération à exporter puis à rouvrir avant l’activation du journal.'), { recoveryRequired: true });
      }
      return next;
    }
    const archive = union(capture(base), capture(next)), out = { ...next, [KEY]: JSON.stringify(archive) };
    if (context) {
      context.debrief = { ...(context.debrief || {}), archive };
      out[CONTEXT] = JSON.stringify(context);
    }
    if (out[MIRROR] != null) out[MIRROR] = JSON.stringify({ ...JSON.parse(out[MIRROR]), archive });
    return out;
  }
  return { KEY, CONTEXT, MIRROR, encode, read, union, collect, capture, protect };
})();
