// Styles strictement limités au Garage, assemblés avec sa vue. Palette et
// composants existants ; aucun changement concurrent du style.css global.
const GARAGE_STYLE = `<style>
#secGarage .twin-intro{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
#secGarage .twin-intro p{margin:0;color:var(--fg2);font-size:12px}
#secGarage .twin-jump{min-height:44px;display:inline-flex;align-items:center;color:var(--accent);text-decoration:none}
#secGarage .twin-body{display:flex;flex-direction:column;gap:12px;min-width:0}
#secGarage .twin-vehicle-art{--ink:#0a0d12;--paint:var(--accent);--glass:#111a27;--hl:#fff;--red:#e5243b;position:relative;overflow:hidden;contain:paint;isolation:isolate;margin:2px 0;border:2px solid var(--fg);border-radius:3px;background:var(--bg);padding:14px 4px 0;min-width:0;box-shadow:4px 4px 0 var(--line2)}
#secGarage .twin-vehicle-art::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:repeating-linear-gradient(180deg,transparent 0 6px,var(--fg) 6px 7px,transparent 7px 11px,var(--fg) 11px 11.6px,transparent 11.6px 19px);-webkit-mask:linear-gradient(90deg,#000,transparent 72%);mask:linear-gradient(90deg,#000,transparent 72%);opacity:.13}
#secGarage .twin-vehicle-art::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle,var(--fg) .9px,transparent 1.35px) 0 0/6px 6px;-webkit-mask:radial-gradient(ellipse at 88% 18%,#000,transparent 62%);mask:radial-gradient(ellipse at 88% 18%,#000,transparent 62%);opacity:.22}
#secGarage .twin-plate{position:absolute;left:10px;top:2px;z-index:-1;font:900 clamp(46px,17vw,104px)/1 var(--f-disp);letter-spacing:-.02em;text-transform:uppercase;font-style:italic;white-space:nowrap;color:transparent;-webkit-text-stroke:1.4px var(--line2);opacity:.9;pointer-events:none;user-select:none}
#secGarage .twin-vehicle-art .twin-car-svg{display:block;position:relative;width:100%;height:clamp(108px,26vw,170px)}
#secGarage .twin-vehicle-art small{display:table;margin:2px 6px 8px auto;padding:2px 6px;font:8px var(--f-mono);letter-spacing:.06em;color:var(--fg2);background:var(--panel);border:1px solid var(--fg2)}
#secGarage .garage-car:not(:has(.garage-active)) .twin-vehicle-art{--paint:color-mix(in srgb,var(--fg2) 72%,var(--panel));box-shadow:4px 4px 0 var(--line)}
#secGarage .garage-car:not(:has(.garage-active)) .twin-vehicle-art::before{opacity:0}
#secGarage .twin-car-svg{overflow:visible;--ink:#0a0d12;--glass:#111a27;--hl:#fff;--red:#e5243b}
#secGarage .twin-halo{fill:var(--halo,#eef3f8);stroke:var(--halo,#eef3f8);stroke-width:5.5;stroke-linejoin:round}
#secGarage .twin-shadow{fill:var(--floor,var(--accent));opacity:.3}
#secGarage .garage-car:not(:has(.garage-active)) .twin-shadow{fill:var(--fg3)}
html[data-theme=light] #secGarage{--halo:#fff;--floor:#0a0d12}
@media(prefers-color-scheme:light){:root:not([data-theme=dark]) #secGarage{--halo:#fff;--floor:#0a0d12}}
#secGarage .twin-well{fill:#06080c}
#secGarage svg .twin-paint,#secGarage .twin-drive .twin-paint{fill:var(--paint,var(--accent))}
#secGarage .twin-body-shade{fill:#05070b;opacity:.34}
#secGarage .twin-reflection{fill:var(--hl);opacity:.82}
#secGarage .twin-glass{fill:var(--glass);stroke:var(--ink);stroke-width:1.6;stroke-linejoin:round}
#secGarage .twin-glare{fill:var(--hl);opacity:.8}
#secGarage .twin-pillar{fill:none;stroke:var(--ink);stroke-width:5;stroke-linecap:butt}
#secGarage .twin-character{fill:none;stroke:var(--ink);stroke-width:1.15;stroke-linecap:round;stroke-linejoin:round;opacity:.78}
#secGarage .twin-ink{fill:none;stroke:var(--ink);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
#secGarage .twin-mirror{fill:var(--paint,var(--accent));stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
#secGarage .twin-grille{fill:#07090d;stroke:var(--ink);stroke-width:1}
#secGarage .twin-lamp{fill:#eef9ff;stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
#secGarage .twin-rear-lamp{fill:var(--red);stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
#secGarage .twin-chrome{fill:none;stroke:#dfe6ee;stroke-width:1.3;stroke-linecap:round;opacity:.95}
#secGarage .twin-spoiler{fill:#151a22;stroke:var(--ink);stroke-width:1.4;stroke-linejoin:round}
#secGarage .twin-sport-accent{fill:none;stroke:var(--red);stroke-width:2.4;stroke-linecap:round}
#secGarage .twin-rubber{fill:#0d1016;stroke:var(--ink);stroke-width:1.6}
#secGarage .twin-sidewall{fill:none;stroke:#2b323d;stroke-width:1.2}
#secGarage .twin-rim{fill:#c9d2dc;stroke:var(--ink);stroke-width:1.3}
#secGarage .twin-caliper{fill:none;stroke:var(--red);stroke-width:3.4;stroke-linecap:round}
#secGarage .twin-spokes{fill:none;stroke:#2c3440;stroke-width:2.3;stroke-linecap:round}
#secGarage .twin-car-touring .twin-spokes{stroke-width:3.2}
#secGarage .twin-hub{fill:#2c3440;stroke:#c9d2dc;stroke-width:.8}
#secGarage .twin-rim-shine{fill:none;stroke:var(--hl);stroke-width:1.4;stroke-linecap:round;opacity:.9}
#secGarage .twin-spin{transform-box:fill-box;transform-origin:center}
#secGarage .twin-speed{fill:none;stroke:var(--fg2);stroke-width:2;stroke-linecap:round;opacity:.55}
#secGarage .twin-drive .twin-car-svg{--paint:var(--accent)}
#secGarage .twin-quality{display:flex;gap:5px;flex-wrap:wrap}
#secGarage .twin-quality .src{white-space:normal;overflow-wrap:anywhere}
#secGarage .twin-trip{padding:13px;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);display:grid;gap:12px;min-width:0;scroll-margin-top:70px}
#secGarage .twin-trip h3{font:700 19px var(--f-disp);letter-spacing:.06em;margin:0}
#secGarage .twin-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px}
#secGarage .twin-route>div{display:grid;gap:4px;min-width:0}
#secGarage .twin-route>div:last-child{text-align:right}
#secGarage .twin-route small{font:10px var(--f-mono);letter-spacing:.08em;color:var(--fg2)}
#secGarage .twin-route b{font:600 clamp(16px,4.5vw,21px) var(--f-disp);overflow-wrap:anywhere}
#secGarage .twin-route>span{color:var(--accent);font-size:20px}
#secGarage .twin-caption,#secGarage .twin-tools{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;color:var(--fg2);font-size:11px}
#secGarage .twin-caption>span{overflow-wrap:anywhere;min-width:0}
#secGarage .twin-scene{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:4px;background:var(--panel);isolation:isolate;contain:paint}
#secGarage .twin-scene-svg{display:block;width:100%;height:auto;min-height:110px}
#secGarage .twin-scene figcaption{position:relative;padding:8px 10px;font:9px/1.6 var(--f-mono);letter-spacing:.035em;color:var(--fg2);background:var(--panel);border-top:1px solid var(--line)}
#secGarage .twin-sky{fill:var(--panel)}
#secGarage .twin-night{fill:var(--bg)}
html[data-theme=light] #secGarage .twin-night{fill:var(--fg)}
@media(prefers-color-scheme:light){:root:not([data-theme=dark]) #secGarage .twin-night{fill:var(--fg)}}
#secGarage .twin-horizon{fill:var(--line);opacity:.6}
#secGarage .twin-land{fill:var(--panel2)}
#secGarage .twin-road{fill:var(--bg)}
#secGarage .twin-edge{fill:none;stroke:var(--line2);stroke-width:2}
#secGarage .twin-lanes{fill:none;stroke:var(--fg3);stroke-width:2;stroke-dasharray:26 24;opacity:.6}
#secGarage .twin-moon,#secGarage .twin-star{fill:var(--c-ice)}
#secGarage .twin-sun{fill:var(--cau)}
#secGarage .twin-sun-soft{fill:var(--cau);opacity:.12}
#secGarage .twin-cloud{fill:var(--fg3);opacity:.4}
#secGarage .twin-rain{stroke:var(--c-rain);stroke-width:2;animation:twin-rain 1.8s linear infinite}
#secGarage .twin-snow{fill:var(--c-ice);animation:twin-snow 4s linear infinite}
#secGarage .twin-fog{fill:none;stroke:var(--fg2);stroke-width:19;opacity:.2;animation:twin-fog 9s ease-in-out infinite alternate}
#secGarage .twin-wind{fill:none;stroke:var(--fg3);stroke-width:2;animation:twin-wind 3s ease-in-out infinite alternate}
#secGarage .twin-headlights{fill:var(--c-ice);opacity:.13}
#secGarage .twin-drive{animation:twin-drive 14s linear infinite}
#secGarage .twin-drive .twin-spin{animation-name:twin-spin;animation-duration:.45s;animation-timing-function:linear;animation-iteration-count:infinite}
#secGarage .twin-animated{animation-play-state:paused}
#secGarage .twin-scene[data-running=true] .twin-animated{animation-play-state:running}
#secGarage .twin-motion{min-height:44px;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
#secGarage .twin-motion input{width:18px;height:18px;accent-color:var(--accent);margin:0}
#secGarage .twin-motion:focus-within{outline:2px solid var(--accent);outline-offset:3px}
#secGarage .twin-samples{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
#secGarage .twin-samples li{min-width:0;display:flex;flex-direction:column;gap:4px;padding:9px;border:1px solid var(--line);border-radius:4px;background:var(--panel)}
#secGarage .twin-samples small{font:9px var(--f-mono);color:var(--accent);line-height:1.5}
#secGarage .twin-samples b{font:600 22px var(--f-disp)}
#secGarage .twin-samples span{font-size:11px;line-height:1.5;color:var(--fg2);overflow-wrap:anywhere}
#secGarage .twin-compare{min-width:0;padding:11px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--line);border-radius:4px;background:var(--panel)}
#secGarage .twin-compare h4{font:600 20px var(--f-disp);margin:0;overflow-wrap:anywhere}
#secGarage .twin-compare dl{display:grid;gap:4px;margin:0;font-size:12px;line-height:1.5}
#secGarage .twin-compare dt{color:var(--fg2);font-size:10px;text-transform:uppercase;margin-top:4px}
#secGarage .twin-compare dd{margin:0;overflow-wrap:anywhere}
@keyframes twin-drive{0%{transform:translateX(35px)}95%,100%{transform:translateX(590px)}}
@keyframes twin-rain{to{transform:translate(-7px,24px)}}
@keyframes twin-snow{to{transform:translate(8px,24px)}}
@keyframes twin-fog{to{transform:translateX(25px)}}
@keyframes twin-wind{to{transform:translateX(12px)}}
@keyframes twin-spin{to{transform:rotate(360deg)}}
@media(max-width:374px){#secGarage .twin-samples{grid-template-columns:minmax(0,1fr)}#secGarage .twin-samples li{display:grid;grid-template-columns:1fr 1fr}#secGarage .twin-samples span{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){#secGarage .twin-animated{animation:none!important}#secGarage .twin-motion{display:none}}
</style>`;
