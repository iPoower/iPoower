// Même palette et mêmes boutons que Twin Garage ; styles confinés au cockpit.
const LIVE_ROUTE_STYLE = `<style>
#garageLiveRoute{display:grid;gap:10px;min-width:0;padding:12px;border:1px solid var(--line2);border-radius:6px;background:var(--panel);--lr-color:var(--accent)}
#garageLiveRoute .lr-top,#garageLiveRoute .lr-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px}
#garageLiveRoute .lr-title{font:700 18px var(--f-disp);letter-spacing:.1em;color:var(--accent)}
#garageLiveRoute .lr-mode{font:11px var(--f-mono);color:var(--fg2);padding:5px 8px;border:1px solid var(--line2);border-radius:3px;overflow-wrap:anywhere;max-width:100%}
#garageLiveRoute[data-live=true] .lr-mode{color:var(--go-t);border-color:var(--go-t)}
#garageLiveRoute .lr-signal{margin:0;padding:8px 10px;border-left:3px solid var(--line2);background:var(--panel2);font:11px/1.6 var(--f-mono);color:var(--fg2);overflow-wrap:anywhere}
#garageLiveRoute[data-signal=active] .lr-signal{border-left-color:var(--go-t);color:var(--go-t)}
#garageLiveRoute[data-signal=stale] .lr-signal{border-left-color:var(--cau-t)}
#garageLiveRoute[data-signal=stale] .lr-mode{border-color:var(--cau-t);color:var(--cau-t)}
#garageLiveRoute[data-signal=unavailable] .lr-signal{border-left-color:var(--risk)}

#garageLiveRoute .lr-map-shell{position:relative;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:4px;isolation:isolate}
#garageLiveRoute .lr-map{height:310px;width:100%;background:var(--bg);z-index:0}
#garageLiveRoute[data-compact=true] .lr-map{height:180px}
#garageLiveRoute .lr-map-note{position:absolute;left:10px;right:10px;top:10px;z-index:450;pointer-events:none;font:11px/1.6 var(--f-mono);color:var(--fg2);padding:7px 9px;background:var(--panel);border:1px solid var(--line);border-radius:3px;overflow-wrap:anywhere}
#garageLiveRoute .lr-hud{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
#garageLiveRoute .lr-hud>div{display:grid;gap:4px;min-width:0;border-left:2px solid var(--accent);background:var(--panel2);padding:9px}
#garageLiveRoute .lr-hud small{color:var(--fg2);font:11px/1.4 var(--f-mono);letter-spacing:.04em;overflow-wrap:anywhere}
#garageLiveRoute .lr-hud b{font:600 clamp(24px,6vw,35px) var(--f-disp);font-variant-numeric:tabular-nums;color:var(--fg)}
#garageLiveRoute .lr-sectors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;font:11px var(--f-mono);color:var(--fg3)}
#garageLiveRoute .lr-sectors span{padding-top:6px;border-top:3px solid var(--line2)}
#garageLiveRoute .lr-sectors span[data-passed=true]{border-color:var(--accent);color:var(--accent)}
#garageLiveRoute .lr-sectors span[data-current=true]{border-color:var(--cau);color:var(--fg)}
#garageLiveRoute .lr-scrub{display:grid;gap:6px;font:11px var(--f-mono);color:var(--fg2)}
#garageLiveRoute input[type=range]{width:100%;height:44px;margin:0;accent-color:var(--accent);cursor:pointer;box-sizing:border-box}
#garageLiveRoute .btn{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
#garageLiveRoute .btn[aria-pressed=true]{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
#garageLiveRoute .lr-clock,#garageLiveRoute .lr-trust{font:11px/1.6 var(--f-mono);color:var(--fg2);margin:0;overflow-wrap:anywhere}
#garageLiveRoute .lr-weather{border:1px solid var(--line);border-left:3px solid var(--c-rain);border-radius:4px;padding:9px;display:grid;gap:4px;background:var(--panel2);font-size:11px;line-height:1.5;overflow-wrap:anywhere}
#garageLiveRoute .lr-weather b{font:600 14px var(--f-disp)}
#garageLiveRoute .lr-vehicle-icon{background:none;border:0;filter:drop-shadow(0 1px 4px var(--bg))}
#garageLiveRoute[data-mode=gps][data-live=true] .lr-vehicle-icon{transition:transform .35s linear}
#garageLiveRoute .lr-bearing{width:58px;height:28px;transform-origin:50% 50%;color:var(--accent)}
#garageLiveRoute .lr-bearing .twin-car-svg{width:58px;height:28px;display:block}
#garageLiveRoute[data-live=false][data-mode=gps] .lr-vehicle-icon{opacity:.45}
#garageLiveRoute .lr-waypoint{width:24px;height:24px;display:grid;place-items:center;border:1px solid var(--line2);border-radius:50%;background:var(--panel);color:var(--fg);font:11px var(--f-mono)}
#garageLiveRoute .leaflet-control-attribution{font:11px/1.4 var(--f-mono);max-width:100%;white-space:normal;background:var(--panel);color:var(--fg2)}
#garageLiveRoute .leaflet-control-attribution a{color:var(--accent)}
#garageLiveRoute .leaflet-tooltip{background:var(--panel);color:var(--fg);border-color:var(--line2);white-space:normal;max-width:210px;font:11px/1.5 var(--f-mono)}
@media(max-width:374px){#garageLiveRoute{padding:9px}#garageLiveRoute .lr-map{height:260px}#garageLiveRoute .lr-hud>div{padding:6px}#garageLiveRoute .lr-actions{justify-content:flex-start}}
@media(prefers-reduced-motion:reduce){#garageLiveRoute *{animation:none!important;transition:none!important}}
</style>`;
