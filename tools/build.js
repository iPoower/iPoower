// Assemblage de Race Control : src/ -> dist/ (une page HTML autonome + fichiers du relais).
// Avec les fichiers privés (private/ : préréglage, configuration du relais, code), les réglages sont (re)chiffrés dans encrypted/.
// Sans eux (GitHub Actions, clone public), les versions déjà chiffrées d'encrypted/ sont utilisées telles quelles : rien de personnel n'est nécessaire.
const fs=require('fs'),crypto=require('crypto'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const r=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),has=f=>fs.existsSync(path.join(ROOT,f)),w=(f,d)=>{fs.mkdirSync(path.dirname(path.join(ROOT,f)),{recursive:true});fs.writeFileSync(path.join(ROOT,f),d);};
const PRIV=has('private/preset.json')&&has('private/relay-config.json')&&has('private/.passphrase');
const LIVE='https://ipoower.github.io/iPoower/race-control/';
const PASS=PRIV?r('private/.passphrase').trim():null;
const fonts='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" media="print" onload="this.media=\'all\'" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">';
const js=[r('src/engine.js'),r('src/demo.js'),r('src/app.js')].join('\n');
const title='<title>TYRE WEATHER RACE CONTROL</title>';
const style=`<style>\n${r('src/style.css')}\n</style>`;
const body=pre=>`${r('src/shell.html')}\n${pre||''}<script>\n${js}\n</script>\n`;
const rcfg=PRIV?JSON.parse(r('private/relay-config.json')):null;
const presetObj=PRIV?{...JSON.parse(r('private/preset.json')),configured:1,ntfy:rcfg.ntfy}:null;
const preset=PRIV?JSON.stringify(presetObj):null;
const tdb=r('src/tiredb.json').trim();
// chiffrement : PBKDF2-SHA256 (600 000 itérations) + AES-256-GCM, compatible WebCrypto (étiquette en fin de texte chiffré)
function seal(obj){const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(PASS,salt,600000,32,'sha256');
  const c=crypto.createCipheriv('aes-256-gcm',key,iv);const ct=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final(),c.getAuthTag()]);
  return {v:1,kdf:'PBKDF2-SHA256',it:600000,s:salt.toString('base64'),i:iv.toString('base64'),c:ct.toString('base64')};}
const hash=s=>crypto.createHash('sha1').update(s).digest('hex').slice(0,10);
// artifact privé (claude.ai) : réglages en clair, uniquement dans private/ (ignoré par Git)
if(PRIV)w('private/artifact.html',`${title}\n${fonts}\n${style}\n${body(`<script>window.TWRC_TIREDB=${tdb};window.TWRC_NTFY=${JSON.stringify(rcfg.ntfy)};window.TWRC_PRESET=${preset};window.TWRC_LIVE_URL=${JSON.stringify(LIVE)};</script>\n`)}`);
// site public : réglages chiffrés, déchiffrés une fois sur le téléphone
let prevSealed=null;try{prevSealed=JSON.parse(r('encrypted/preset.sealed.json'));}catch(e){}
if(!PRIV&&!prevSealed)throw new Error('encrypted/preset.sealed.json manquant');
const sealedV=PRIV?hash(preset):prevSealed.v;
const sealed=(prevSealed&&prevSealed.v===sealedV)?prevSealed.sealed:seal(presetObj);   // même contenu : même chiffré (pas de faux changement de version)
w('encrypted/preset.sealed.json',JSON.stringify({v:sealedV,sealed}));
const boot=`<script>window.TWRC_TIREDB=${tdb};window.TWRC_SEALED=${JSON.stringify(sealed)};window.TWRC_SEALED_V=${JSON.stringify(sealedV)};
(function(){try{var v=localStorage.getItem('twrc.plain.v'),p=localStorage.getItem('twrc.plain');if(p&&v===window.TWRC_SEALED_V){var o=JSON.parse(p);window.TWRC_PRESET=o;window.TWRC_PRESET_V=v;window.TWRC_NTFY=o.ntfy||'';}}catch(e){}})();</script>\n`;
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Race Control"><meta name="theme-color" content="#080c11"><meta name="robots" content="noindex,nofollow"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" type="image/png" href="icon-192.png">';
const reset='<style>html{color-scheme:dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}[hidden]{display:none!important}</style>';
w('dist/manifest.webmanifest',JSON.stringify({name:'Tyre Weather Race Control',short_name:'Race Control',description:'Météo en temps réel et verdict pneus du trajet',lang:'fr',start_url:'./',scope:'./',display:'standalone',orientation:'portrait',background_color:'#080c11',theme_color:'#080c11',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},null,1));
w('dist/index.html',`<!doctype html>\n<html lang="fr" data-theme="dark"><head>${head}<link rel="manifest" href="manifest.webmanifest">\n${title}\n${fonts}\n${reset}\n${style}\n</head><body>\n${body(boot)}</body></html>\n`);
['sw.js','engine.js','tiredb.json','relay.js'].forEach(f=>w('dist/'+f,r('src/'+f)));
['apple-touch-icon.png','icon-192.png','icon-512.png'].forEach(f=>fs.copyFileSync(path.join(ROOT,'src/static',f),path.join(ROOT,'dist',f)));
// widget public sans configuration (le bouton « Copier » de l'app l'ajoute)
w('dist/widget.js',r('src/widget.js').replace(/const CFG = [\s\S]*?;\n\nconst Q_CUR/,'const CFG = null; // configuration ajoutée par l’app au moment de la copie\n\nconst Q_CUR'));
// relais : configuration chiffrée (la clé est le secret GitHub RC_KEY)
const relayPriv=PRIV?{site:rcfg.site,ntfy:rcfg.ntfy,home:rcfg.home,work:rcfg.work,origins:rcfg.origins,dep:rcfg.dep,durMin:rcfg.durMin,days:rcfg.days,cars:rcfg.cars}:null;
let prevR=null;try{prevR=JSON.parse(r('encrypted/relay-config.sealed.json'));}catch(e){}
if(!PRIV&&!prevR)throw new Error('encrypted/relay-config.sealed.json manquant');
const rv=PRIV?hash(JSON.stringify(relayPriv)):prevR.v;
const rs=(prevR&&prevR.v===rv)?prevR.sealed:seal(relayPriv);w('encrypted/relay-config.sealed.json',JSON.stringify({v:rv,sealed:rs}));
w('dist/relay-config.sealed.json',JSON.stringify(rs));
// garde-fou : la sortie publique ne doit contenir aucune donnée personnelle
require('child_process').execFileSync(process.execPath,[path.join(ROOT,'tools/check-secrets.js'),...fs.readdirSync(path.join(ROOT,'dist')).filter(f=>!/\.png$/.test(f)).map(f=>'dist/'+f)],{cwd:ROOT,stdio:'inherit'});
console.log('ok',fs.statSync(path.join(ROOT,'dist/index.html')).size,'sealedV',sealedV,PRIV?'(réglages privés présents)':'(fichiers chiffrés seuls)');
