// Styles du budget automobile strictement limites a l'onglet Garage.
const ECONOMICS_STYLE = `<style>
#secGarage .garage-economics{margin-top:10px;border:1px solid var(--line2);border-radius:6px;background:var(--panel);min-width:0}
#secGarage .garage-economics>summary{cursor:pointer;min-height:44px;padding:12px;font:700 17px var(--f-disp);letter-spacing:.02em;list-style-position:inside}
#secGarage .garage-economics>summary small{display:block;margin-top:3px;color:var(--fg2);font:11px var(--f-mono)}
#secGarage .garage-economics>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#secGarage .econ-content{display:flex;flex-direction:column;gap:12px;padding:0 11px 13px;min-width:0}
#secGarage .econ-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
#secGarage .econ-stats>div{display:flex;flex-direction:column;min-width:0;gap:5px;padding:10px;border:1px solid var(--line);border-radius:4px;background:var(--panel2)}
#secGarage .econ-stats span{font:11px var(--f-mono);color:var(--fg2);overflow-wrap:anywhere}
#secGarage .econ-stats strong{font:700 clamp(16px,4vw,22px) var(--f-disp);overflow-wrap:anywhere}
#secGarage .econ-form{padding:11px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
#secGarage .econ-form h4,#secGarage .econ-months h5,#secGarage .econ-history h5{font:650 16px var(--f-disp);margin:0}
#secGarage .econ-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:9px}
#secGarage .econ-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--fg2);min-width:0}
#secGarage .econ-field input,#secGarage .econ-field select{width:100%;max-width:100%;height:44px;box-sizing:border-box;font-size:16px;color:var(--fg);background:var(--panel2);border:1px solid var(--line2);border-radius:4px;padding:8px}
#secGarage .econ-form button[type=submit]{min-height:44px;align-self:flex-start}
#secGarage .econ-history ul,#secGarage .econ-months ul{list-style:none;margin:7px 0 0;padding:0}
#secGarage .econ-history li,#secGarage .econ-months li{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:9px 0;font-size:12px}
#secGarage .econ-history li>span{min-width:110px;flex:1;overflow-wrap:anywhere}
#secGarage .econ-history li strong,#secGarage .econ-months li b{font:600 12px var(--f-mono)}
#secGarage .econ-history li button{min-height:44px}
#secGarage .econ-warning{padding:8px;border:1px solid var(--warn);color:var(--fg);border-radius:4px;font-size:12px}
#secGarage .econ-status{font-size:12px;font-weight:600;color:var(--accent);min-height:14px}
@media(max-width:359px){#secGarage .econ-stats{grid-template-columns:minmax(0,1fr)}}
#secGarage .econ-comparison{padding:12px;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);margin-top:12px}
#secGarage .econ-comparison h3{font:700 20px var(--f-disp);margin:0 0 8px}
#secGarage .econ-compare-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}
#secGarage .econ-compare-car{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center;padding:10px;border:1px solid var(--line2);border-radius:4px;background:var(--panel)}
#secGarage .econ-compare-car>b{grid-column:1/-1;font:700 17px var(--f-disp)}
#secGarage .econ-compare-car span{color:var(--fg2);font-size:12px}
#secGarage .econ-compare-car strong{font:600 12px var(--f-mono)}
#secGarage .econ-compare-car button{grid-column:1/-1;min-height:44px}

#secGarage .econ-fuel-fields{display:flex;flex-direction:column;gap:9px;padding:12px;border:1px dashed var(--line2);background:var(--panel2);border-radius:5px}
#secGarage .econ-fuel-fields[hidden]{display:none!important}
#secGarage .econ-tank-full{display:flex;flex-direction:row;align-items:center;gap:10px;grid-column:1/-1;line-height:1.4}
#secGarage .econ-tank-full input[type=checkbox]{width:22px;height:22px;min-width:22px;padding:0;accent-color:var(--accent);flex:none}
#secGarage .econ-fuel-summary{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line2);padding:10px;border-radius:5px}
#secGarage .econ-fuel-summary h4{font:650 16px var(--f-disp);margin:0}
</style>`;
