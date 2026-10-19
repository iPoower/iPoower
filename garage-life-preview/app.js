/* Garage Life — démonstrateur uniquement. Aucun import, export, réseau ou stockage. */
'use strict';
(() => {
  const M=window.GarageLifeModel;
  const $=s=>document.querySelector(s);
  const labels={vidange:'Vidange',filtres:'Filtres',freinage:'Freinage',distribution:'Distribution',
    pneus:'Pneus et montages',batterie:'Batterie','controle-technique':'Contrôle technique',
    reparation:'Réparation',controle:'Contrôle',autre:'Autre'};
  const demo=(id,vehicleId,date,odometerKm,category,description,amountCents,provenance)=>
    ({id,vehicleId,date,odometerKm,category,description,amountCents,provider:null,provenance,evidence:null});
  // Les deux fiches sont entièrement fictives, sans identifiants personnels.
  let state=M.empty([{id:'a',name:'Véhicule A · sportive fictive',goalKm:null},
                     {id:'b',name:'Véhicule B · diesel fictif',goalKm:null}]);
  state=M.add(state,demo('sample1','a','2026-08-02',12450,'vidange','Vidange fictive déclarée',9750,M.SOURCE.DONE));
  state=M.add(state,demo('sample2','b','2026-07-12',108500,'freinage','Contrôle de freinage fictif',null,M.SOURCE.DONE));
  state=M.add(state,demo('sample3','b','2027-05-02',null,'controle-technique','Échéance saisie pour démonstration',null,M.SOURCE.DEADLINE));
  let selected='a',counter=0;
  const euro=c=>c===null?'Montant inconnu':(c/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const date=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  function text(node,value){node.textContent=String(value);return node;}
  function el(tag,cls,value){const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)text(x,value);return x;}
  function line(root,label,detail){
    const li=el('li','',label);
    if(detail!==undefined)li.append(el('small','',detail));
    root.append(li);
  }
  function cell(root,label,value,note){
    const col=el('div');col.append(el('span','',label),el('b','',value),el('small','',note));
    root.append(col);
  }
  function render(){
    $('#choose-a').setAttribute('aria-pressed',String(selected==='a'));
    $('#choose-b').setAttribute('aria-pressed',String(selected==='b'));
    $('#choose-a').classList.toggle('pri',selected==='a');
    $('#choose-b').classList.toggle('pri',selected==='b');
    const info=M.summary(state,selected),car=info.vehicle;
    const card=$('#car-info');
    card.replaceChildren(el('div','garage-index','VÉHICULE · '+car.id.toUpperCase()),el('h2','',car.name));
    const cells=el('div','garage-data');
    cell(cells,'DERNIER KILOMÉTRAGE DÉCLARÉ',info.latest?info.latest.km.toLocaleString('fr-FR')+' km':'Non renseigné',
      info.latest?'Opération du '+date(info.latest.date):'Aucun relevé');
    cell(cells,'DÉPENSES SAISIES',euro(info.spentCents),
      info.knownCosts+' montant(s) connu(s) · '+info.missingCosts+' inconnu(s)');
    cell(cells,'OBJECTIF PERSONNEL',car.goalKm===null?'Non défini':car.goalKm.toLocaleString('fr-FR')+' km',
      'Facultatif · jamais une estimation de durée de vie');
    card.append(cells);
    const goal=el('div','garage-row'),label=el('label','');
    label.setAttribute('for','goal');
    label.append(document.createTextNode('Objectif kilométrique facultatif'));
    const input=el('input');input.id='goal';input.type='number';input.min='0';input.max='50000000';input.step='1';
    input.placeholder='Ex. : 500000';input.value=car.goalKm===null?'':String(car.goalKm);label.append(input);
    const button=el('button','btn sm','Définir l’objectif');button.type='button';
    button.addEventListener('click',()=>{
      const raw=input.value.trim();
      const n=raw===''?null:/^\d+$/.test(raw)?Number(raw):NaN;
      try{state=M.setGoal(state,selected,n);show('Objectif fictif mis à jour pour cette session.');render();}
      catch(e){show(e.message);}
    });
    goal.append(label,button);card.append(goal);
    const h=$('#history'),d=$('#deadlines'),missing=$('#missing');
    h.replaceChildren();d.replaceChildren();missing.replaceChildren();
    const done=info.history.filter(o=>o.provenance===M.SOURCE.DONE);
    if(!done.length)line(h,'Aucune intervention déclarée','Ne prouve pas l’absence d’entretien.');
    for(const o of done)line(h,date(o.date)+' · '+labels[o.category]+' · '+o.description,
      (o.odometerKm===null?'Km inconnus':o.odometerKm.toLocaleString('fr-FR')+' km')+' · '+euro(o.amountCents)+' · Réalisée et déclarée');
    if(!info.deadlines.length)line(d,'Aucune échéance renseignée','Aucune périodicité constructeur déduite.');
    for(const o of info.deadlines)line(d,date(o.date)+' · '+labels[o.category]+' · '+o.description,
      'Échéance saisie manuellement'+(o.odometerKm===null?'':' · '+o.odometerKm.toLocaleString('fr-FR')+' km saisis'));
    if(info.missing.odometer)line(missing,'Dernier kilométrage inconnu');
    if(info.missing.records)line(missing,'Historique réalisé incomplet ou vide');
    if(info.missing.costs)line(missing,'Coûts non renseignés pour certaines opérations');
    if(info.missing.deadlines)line(missing,'Échéances non renseignées');
    line(missing,'Préconisations constructeur : non intégrées','Elles nécessitent une source officielle datée et liée au véhicule.');
    line(missing,'État mécanique : non diagnostiqué','Un carnet même complet ne prouve pas le bon état.');
  }
  const show=msg=>{text($('#result'),msg);};
  for(const cat of M.CATEGORIES){
    const option=el('option','',labels[cat]);option.value=cat;$('#category').append(option);
  }
  $('#choose-a').addEventListener('click',()=>{selected='a';render();});
  $('#choose-b').addEventListener('click',()=>{selected='b';render();});
  $('#theme').addEventListener('click',()=>{
    document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  });
  $('#operation-form').addEventListener('submit',event=>{
    event.preventDefault();
    const v=new FormData(event.currentTarget);
    const km=String(v.get('km')||'').trim();
    try {
      if(km!==''&&!/^\d+$/.test(km))throw new Error('Kilométrage invalide : entier positif attendu.');
      const amount=M.parseEuros(v.get('amount'));
      const op={id:'demo'+(++counter),vehicleId:selected,date:String(v.get('date')||''),
        odometerKm:km===''?null:Number(km),category:String(v.get('category')||''),
        description:String(v.get('description')||''),amountCents:amount,
        provider:String(v.get('provider')||'').trim()||null,
        provenance:String(v.get('kind')||''),evidence:null};
      state=M.add(state,op);
      event.currentTarget.reset();
      show('Opération fictive ajoutée en mémoire. Aucun enregistrement sur l’appareil.');
      render();
    }catch(e){show(e.message);}
  });
  render();
})();
