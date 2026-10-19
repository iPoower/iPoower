// Styles strictement limités au Garage, assemblés avec sa vue. Palette et
// composants existants ; aucun changement concurrent du style.css global.
const GARAGE_STYLE = `<style>
#secGarage .twin-intro{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
#secGarage .twin-intro p{margin:0;color:var(--fg2);font-size:12px}
#secGarage .twin-jump{min-height:44px;display:inline-flex;align-items:center;color:var(--accent);text-decoration:none}
#secGarage .twin-body{display:flex;flex-direction:column;gap:12px;min-width:0}
#secGarage .twin-vehicle-art{position:relative;border-bottom:1px solid var(--line);background:radial-gradient(ellipse at 50% 80%,var(--accent-soft),transparent 70%);padding:10px 5px 0;min-width:0}
#secGarage .twin-vehicle-art .twin-car-svg{display:block;width:100%;height:clamp(100px,22vw,155px)}
#secGarage .twin-vehicle-art small{display:block;text-align:right;font:9px var(--f-mono);color:var(--fg3);padding-bottom:8px}
#secGarage .twin-car-svg{color:var(--accent);overflow:visible}
#secGarage .twin-shadow{fill:var(--bg);opacity:.6}
#secGarage svg .twin-paint{fill:color-mix(in srgb,var(--accent) 62%,var(--panel));stroke:var(--accent);stroke-width:1.5}
#secGarage .garage-car:not(:has(.garage-active)) .twin-car-svg{color:var(--fg2)}
#secGarage .garage-car:not(:has(.garage-active)) svg .twin-paint{fill:color-mix(in srgb,var(--fg2) 50%,var(--panel));stroke:var(--fg2)}
#secGarage .twin-glass{fill:var(--panel);stroke:var(--line2);stroke-width:1.5}
#secGarage .twin-trim{fill:none;stroke:var(--panel);stroke-width:1.5;opacity:.65}
#secGarage .twin-lamp{fill:var(--c-ice)}
#secGarage .twin-rear{fill:none;stroke:var(--risk);stroke-width:3}
#secGarage .twin-rubber{fill:var(--bg);stroke:var(--line2);stroke-width:2}
#secGarage .twin-rim{fill:var(--panel2);stroke:var(--fg2);stroke-width:2}
#secGarage .twin-spokes{stroke:var(--fg2);stroke-width:1.5}
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
@keyframes twin-wind{to{transform:translateY(10px)}}
@media(max-width:374px){#secGarage .twin-samples{grid-template-columns:minmax(0,1fr)}#secGarage .twin-samples li{display:grid;grid-template-columns:1fr 1fr}#secGarage .twin-samples span{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){#secGarage .twin-animated{animation:none!important}#secGarage .twin-motion{display:none}}
</style>`;
