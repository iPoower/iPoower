// Assemblage de Race Control : src/ -> dist/ (une page HTML autonome + fichiers du relais).
// Avec les fichiers privés (private/ : préréglage, configuration du relais, deux clés), les réglages sont (re)chiffrés dans encrypted/.
// Sans eux (GitHub Actions, clone public), les versions déjà chiffrées d'encrypted/ sont utilisées telles quelles : rien de personnel n'est nécessaire.
// Deux clés indépendantes, sans aucun repli de l'une sur l'autre :
//  - APP_KEY = private/.passphrase (code de déverrouillage) : préréglage de l'app (et agenda, chiffré par le relais) ;
//  - RC_KEY  = private/.rc_key : configuration du relais uniquement. Sans ce fichier, la config chiffrée d'encrypted/ est gardée telle quelle
//    (elle est alors rechiffrée uniquement dans GitHub Actions, par le workflow de rotation : la clé du relais ne quitte jamais GitHub).
const fs=require('fs'),crypto=require('crypto'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const {norm,tryUnseal,seal:sealWith}=require('./keys');
const r=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),has=f=>fs.existsSync(path.join(ROOT,f)),w=(f,d)=>{fs.mkdirSync(path.dirname(path.join(ROOT,f)),{recursive:true});fs.writeFileSync(path.join(ROOT,f),d);};
// dossiers (modifiables pour la CI : RC_PRIVATE=réglages fictifs, RC_OUT=sortie, RC_ENCRYPTED=chiffrés de test)
const PD=process.env.RC_PRIVATE||'private',OUT=process.env.RC_OUT||'dist',ENC=process.env.RC_ENCRYPTED||'encrypted';
const PRIV=has(PD+'/preset.json')&&has(PD+'/relay-config.json')&&has(PD+'/.passphrase');
const LIVE='https://ipoower.github.io/iPoower/race-control/';
const PASS=PRIV?r(PD+'/.passphrase').trim():null;
const RCK=PRIV&&has(PD+'/.rc_key')?norm(r(PD+'/.rc_key')):null;   // facultative : jamais de repli sur le code de l'app
if(RCK&&RCK.length<16)throw new Error(PD+'/.rc_key trop courte (16 caractères minimum)');
if(RCK&&RCK===norm(PASS))throw new Error('APP_KEY et RC_KEY identiques : les deux clés doivent être différentes');
const fonts='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" media="print" data-font href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">';
const js=[r('src/reliability.js'),r('src/decision.js'),r('src/profile-check.js'),r('src/geosearch.js'),r('src/engine.js'),r('src/demo.js'),r('src/wardrobe.js'),r('src/dayplan.js'),r('src/wxdesk.js'),r('src/tirespecs.js'),r('src/tyrestate.js'),r('src/tyrelab.js'),r('src/placectx.js'),r('src/evidence.js'),r('src/calendar-origin.js'),r('src/trip-cancel.js'),r('src/weather-requests.js'),r('src/road-intelligence.js'),r('src/road-providers.js'),r('src/debrief.js'),r('src/userctx.js'),r('src/backup.js'),require('./app-source').appSource(ROOT)].join('\n');
const title='<title>TYRE WEATHER RACE CONTROL</title>';
const style=`<style>\n${r('src/style.css')}\n</style>`;
const device=r('src/device-storage.js')+'\n'+r('src/session-vault.js');
if(/<\/script/i.test(js))throw new Error('Le code applicatif ne doit pas contenir « </script> » (bloc différé).');
// Sécurité V1 : le code applicatif est différé (bloc text/plain) et démarré seulement après l'ouverture du coffre de session :
// les réglages et le préréglage déchiffrés n'existent qu'en mémoire, jamais en clair dans localStorage.
const start=`<script>\n(function(){var f=document.querySelector('link[data-font]');if(f){var on=function(){f.media='all';};if(f.sheet)on();else f.addEventListener('load',on);}})();
(function(){var RAW;try{RAW=window.localStorage;}catch(e){RAW=null;}var done=false;
function run(){if(done)return;done=true;var c=document.getElementById('twrc-app');if(!c)return;var s=document.createElement('script');s.textContent=c.textContent;c.parentNode.removeChild(c);document.body.appendChild(s);}
function preset(st){try{var v=st.getItem('twrc.plain.v'),p=st.getItem('twrc.plain');if(p&&v===window.TWRC_SEALED_V){var o=JSON.parse(p);window.TWRC_PRESET=o;window.TWRC_PRESET_V=v;window.TWRC_NTFY=o.ntfy||'';}}catch(e){}}
var ses=null;try{ses=window.sessionStorage;ses.getItem('twrc.session.v2');}catch(e){ses={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};}
if(!RAW||window.TWRC_STORAGE_ERROR||!window.crypto||!crypto.subtle){if(RAW)preset(RAW);run();return;}
var VS=window.TWRC_VAULT=SessionVault.create({raw:RAW,session:ses,crypto:crypto,target:window});window.TWRC_RAW_STORAGE=RAW;
window.addEventListener('storage',function(e){if(e.storageArea&&e.storageArea!==RAW)return;VS.onStorage(e,function(k,o,n){try{window.dispatchEvent(new StorageEvent('storage',{key:k,oldValue:o,newValue:n,url:location.href}));}catch(x){}}).then(function(r){if(r==='locked')location.reload();});});
VS.boot().then(function(){if(VS.store){try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return VS.store;}});}catch(e){window.TWRC_STORAGE_ERROR=true;}}preset(VS.store||RAW);},function(){}).then(run,run);
})();\n</script>\n`;
const body=pre=>`${r('src/shell.html')}\n<script>\n${device}\ntry{DeviceStorage.bootstrap(window,localStorage);}catch(e){window.TWRC_STORAGE_ERROR=true;}\n</script>\n${pre||''}<script type="text/plain" id="twrc-app">\n${js}\n</script>\n${start}`;
const rcfg=PRIV?JSON.parse(r(PD+'/relay-config.json')):null;
const presetObj=PRIV?{...JSON.parse(r(PD+'/preset.json')),configured:1,ntfy:rcfg.ntfy}:null;
const preset=PRIV?JSON.stringify(presetObj):null;
const tdb=r('src/tiredb.json').trim();
// chiffrement : PBKDF2-SHA256 (600 000 itérations) + AES-256-GCM, compatible WebCrypto (étiquette en fin de texte chiffré)
const seal=sealWith;
const hash=s=>crypto.createHash('sha1').update(s).digest('hex').slice(0,10);
// artifact privé (claude.ai) : réglages en clair, uniquement dans private/ (ignoré par Git)
if(PRIV)w(PD+'/artifact.html',`${title}\n${fonts}\n${style}\n${body(`<script>window.TWRC_TIREDB=${tdb};window.TWRC_NTFY=${JSON.stringify(rcfg.ntfy)};window.TWRC_PRESET=${preset};window.TWRC_LIVE_URL=${JSON.stringify(LIVE)};</script>\n`)}`);
// site public : réglages chiffrés, déchiffrés une fois sur le téléphone
let prevSealed=null;try{prevSealed=JSON.parse(r(ENC+'/preset.sealed.json'));}catch(e){}
if(!PRIV&&!prevSealed)throw new Error('encrypted/preset.sealed.json manquant');
const sealedV=PRIV?hash(preset):prevSealed.v;
// même contenu ET même clé : même chiffré (pas de faux changement de version) ; sinon rechiffré avec APP_KEY
const sealed=(prevSealed&&prevSealed.v===sealedV&&(!PRIV||tryUnseal(prevSealed.sealed,PASS)))?prevSealed.sealed:seal(presetObj,PASS);
w(ENC+'/preset.sealed.json',JSON.stringify({v:sealedV,sealed}));
// Identité de l'application effectivement chargée : version.json peut être plus récent que le shell offline.
const buildId=crypto.createHash('sha256').update(js).update(device).update(style).update(r('src/shell.html')).digest('hex').slice(0,12);
const DATA_BASE=process.env.RC_DATA_BASE||'';
if(DATA_BASE&&!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._\/-]*\/$/.test(DATA_BASE))throw new Error('RC_DATA_BASE doit être une URL https terminée par « / »');
const boot=`<script>window.TWRC_BUILD=${JSON.stringify(buildId)};window.TWRC_DATA_BASE=${JSON.stringify(DATA_BASE)};window.TWRC_TIREDB=${tdb};window.TWRC_SEALED=${JSON.stringify(sealed)};window.TWRC_SEALED_V=${JSON.stringify(sealedV)};
</script>\n`;
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Race Control"><meta name="theme-color" content="#080c11"><meta name="robots" content="noindex,nofollow"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" type="image/png" href="icon-192.png">';
const reset='<style>html{color-scheme:dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}[hidden]{display:none!important}</style>';
w(OUT+'/manifest.webmanifest',JSON.stringify({name:'Tyre Weather Race Control',short_name:'Race Control',description:'Météo en temps réel et verdict pneus du trajet',lang:'fr',start_url:'./',scope:'./',display:'standalone',orientation:'portrait',background_color:'#080c11',theme_color:'#080c11',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},null,1));
const page=`<!doctype html>\n<html lang="fr" data-theme="dark"><head>${head}<link rel="manifest" href="manifest.webmanifest">\n${title}\n${fonts}\n${reset}\n${style}\n</head><body>\n${body(boot)}</body></html>\n`;
// Politique de sécurité du contenu (sécurité V1) : scripts inline autorisés uniquement par empreinte SHA-256 (y compris le code
// applicatif démarré après le coffre), aucun eval, aucune origine de script hors Leaflet (SRI). GitHub Pages ne permet pas
// d'en-têtes HTTP : la politique est en <meta> ; frame-ancestors et les en-têtes sont prêts pour Cloudflare (_headers).
const sha=t=>"'sha256-"+crypto.createHash('sha256').update(t,'utf8').digest('base64')+"'";
const inline=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const deferred=(page.match(/<script type="text\/plain" id="twrc-app">([\s\S]*?)<\/script>/)||[])[1];
if(deferred==null)throw new Error('Bloc applicatif différé introuvable');
const CONNECT=["'self'",'https://api.open-meteo.com','https://ensemble-api.open-meteo.com','https://air-quality-api.open-meteo.com','https://geocoding-api.open-meteo.com',
  'https://public.opendatasoft.com','https://api.bigdatacloud.net','https://router.project-osrm.org','https://nominatim.openstreetmap.org','https://data.geopf.fr',
  'https://api.rainviewer.com','https://ntfy.sh',...(DATA_BASE?[new URL(DATA_BASE).origin]:[])];
const CSP=[`default-src 'self'`,`script-src ${[...inline,deferred].map(sha).join(' ')} https://unpkg.com`,`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`,
  `font-src https://fonts.gstatic.com`,`img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://tilecache.rainviewer.com https://unpkg.com`,
  `connect-src ${CONNECT.join(' ')}`,`worker-src 'self'`,`manifest-src 'self'`,`object-src 'none'`,`base-uri 'none'`,`form-action 'self'`,`frame-src 'none'`].join('; ');
w(OUT+'/index.html',page.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+CSP+'">'));
// en-têtes prêts pour une origine dédiée (Cloudflare Pages) : la même politique, plus frame-ancestors et les en-têtes impossibles en <meta>
w(OUT+'/_headers',`/*\n  Content-Security-Policy: ${CSP}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Cross-Origin-Opener-Policy: same-origin\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n`);
['sw.js','engine.js','tiredb.json','relay.js','evidence.js'].forEach(f=>w(OUT+'/'+f,r('src/'+f)));
['apple-touch-icon.png','icon-192.png','icon-512.png'].forEach(f=>fs.copyFileSync(path.join(ROOT,'src/static',f),path.join(ROOT,OUT,f)));
// widget public sans configuration (le bouton « Copier » de l'app l'ajoute)
w(OUT+'/widget.js',r('src/widget.js').replace(/const CFG = [\s\S]*?;\n\nconst Q_CUR/,'const CFG = null; // configuration ajoutée par l’app au moment de la copie\n\nconst Q_CUR'));
// relais : configuration chiffrée avec RC_KEY uniquement (secret GitHub RC_KEY), jamais avec le code de l'app
const relayPriv=PRIV?{site:rcfg.site,ntfy:rcfg.ntfy,home:rcfg.home,work:rcfg.work,origins:rcfg.origins,dep:rcfg.dep,durMin:rcfg.durMin,days:rcfg.days,cars:rcfg.cars}:null;
let prevR=null;try{prevR=JSON.parse(r(ENC+'/relay-config.sealed.json'));}catch(e){}
if(!PRIV&&!prevR)throw new Error('encrypted/relay-config.sealed.json manquant');
const rv=PRIV?hash(JSON.stringify(relayPriv)):prevR.v;
if(PRIV&&!RCK&&(!prevR||prevR.v!==rv))throw new Error('Configuration du relais modifiée : elle doit être rechiffrée avec RC_KEY dans GitHub Actions (workflow de rotation), jamais avec le code de l’app');
const rs=(prevR&&prevR.v===rv&&(!RCK||tryUnseal(prevR.sealed,RCK)))?prevR.sealed:seal(relayPriv,RCK);w(ENC+'/relay-config.sealed.json',JSON.stringify({v:rv,sealed:rs}));
w(OUT+'/relay-config.sealed.json',JSON.stringify(rs));
// garde-fou : la sortie publique ne doit contenir aucune donnée personnelle
require('child_process').execFileSync(process.execPath,[path.join(ROOT,'tools/check-secrets.js'),...fs.readdirSync(path.join(ROOT,OUT)).filter(f=>!/\.png$/.test(f)).map(f=>OUT+'/'+f)],{cwd:ROOT,stdio:'inherit'});
console.log('ok',fs.statSync(path.join(ROOT,OUT,'index.html')).size,'sealedV',sealedV,PRIV?'(réglages privés présents)':'(fichiers chiffrés seuls)');
