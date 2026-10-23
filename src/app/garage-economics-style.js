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
</style>`;
