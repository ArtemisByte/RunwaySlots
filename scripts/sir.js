 const $$ = s => document.querySelector(s);
    const monAbbr=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const pad2 = n => String(n).padStart(2,'0');
    const ddMMM = iso => { const d=new Date(iso+'T00:00:00Z'); return pad2(d.getUTCDate())+monAbbr[d.getUTCMonth()]; };

    function seasonCode(date=new Date()){
      const y=date.getUTCFullYear();
      const lastSunday=(year,m)=>{ const d=new Date(Date.UTC(year,m+1,0,12)); d.setUTCDate(d.getUTCDate()-d.getUTCDay()); d.setUTCHours(0,0,0,0); return d; };
      const S=lastSunday(y,2), W=lastSunday(y,9);
      return (date>=W)?("W"+String(y).slice(-2)) : (date>=S)?("S"+String(y).slice(-2)) : ("W"+String(y-1).slice(-2));
    }

    function showError(m){ const e=$$('#errorMessage'); e.textContent=m; e.style.display='block'; setTimeout(()=>e.style.display='none',4000); }
    function showSuccess(m){ const s=$$('#successMessage'); s.textContent=m; s.style.display='block'; setTimeout(()=>s.style.display='none',4000); }

    const airportEl=$$('#sirAirport');
    const headDateEl=$$('#sirDate');
    const carrierEl=$$('#carrier');
    const typeEl=$$('#sirType');
    const rangeFields=$$('#rangeFields');
    const singleFields=$$('#singleFields');
    const out=$$('#output');

    airportEl.addEventListener('input', e=> e.target.value=e.target.value.toUpperCase());
    carrierEl.addEventListener('input', e=> e.target.value=e.target.value.toUpperCase());
    headDateEl.value = new Date().toISOString().slice(0,10);

    function setVis(){
      const t=typeEl.value;
      rangeFields.style.display = (t==='turnaround'||t==='unlinked'||t==='arrivals_only'||t==='departures_only') ? 'flex' : 'none';
      singleFields.style.display = (t==='specific_arrival'||t==='specific_departure') ? 'flex' : 'none';
    }
    typeEl.addEventListener('change', setVis); setVis();

    function header(apt, isoHeader){
      const d=new Date(isoHeader+'T00:00:00Z');
      return ['SIR', seasonCode(d), ddMMM(isoHeader), apt.toUpperCase()+' ']; 
    }
    function normalizeFlight(carrier, raw){
      const c=(carrier||'FR').toUpperCase();
      const f=(raw||'').toUpperCase().replace(/\s+/g,'');
      return f.startsWith(c) ? f.slice(c.length) : f;
    }
    function body(type, carrier, opt){
      const C=(carrier||'FR').toUpperCase().replace(/\s+/g,'');
      const range = opt.range ? ddMMM(opt.range.start)+ddMMM(opt.range.end) : '';
      const single = opt.singleDate ? ddMMM(opt.singleDate) : '';
      const num = (opt.flightNo||'').replace(/\s+/g,'');
      switch(type){
        case 'whole_season':        return ['Q'+C];
        case 'turnaround':          if(!opt.range) throw new Error('Start/End required.'); return ['Q'+C+' FR '+range];
        case 'unlinked':            if(!opt.range) throw new Error('Start/End required.'); return ['Q'+C+' '+range, 'Q '+C+' '+range];
        case 'arrivals_only':       if(!opt.range) throw new Error('Start/End required.'); return ['Q'+C+' '+range];
        case 'departures_only':     if(!opt.range) throw new Error('Start/End required.'); return ['Q '+C+' '+range];
        case 'specific_arrival':    if(!opt.flightNo || !opt.singleDate) throw new Error('Flight + date required.'); return ['Q'+C+num+' '+single];
        case 'specific_departure':  if(!opt.flightNo || !opt.singleDate) throw new Error('Flight + date required.'); return ['Q '+C+num+' '+single];
        default: return [];
      }
    }

    $$('#generateBtn').addEventListener('click', ()=>{
      try{
        const apt = (airportEl.value||'').trim().toUpperCase();
        const hdr = headDateEl.value;
        const t   = typeEl.value;
        const c   = (carrierEl.value||'FR').trim().toUpperCase();
        if(!apt) return showError('Airport is required.');
        if(!hdr) return showError('Header date is required.');

        const opt={};
        if (rangeFields.style.display!=='none'){
          opt.range = { start: $$('#startDate').value, end: $$('#endDate').value };
          if(!opt.range.start || !opt.range.end) return showError('Start and End dates are required.');
        }
        if (singleFields.style.display!=='none'){
          opt.flightNo = normalizeFlight(c, $$('#flightNo').value);
          opt.singleDate = $$('#singleDate').value;
          if(!opt.flightNo || !opt.singleDate) return showError('Flight number and single date are required.');
        }

        const lines = [...header(apt, hdr), ...body(t, c, opt)];
        out.textContent = lines.join('\n');
        showSuccess('SIR generated.');
      }catch(err){ showError(err.message||String(err)); }
    });

    $$('#copyBtn').addEventListener('click', async ()=>{
      const txt=out.textContent.trim(); if(!txt) return showError('Generate first.');
      try{ await navigator.clipboard.writeText(txt); showSuccess('Copied!'); }
      catch{
        const ta=document.createElement('textarea');
        ta.value=txt; ta.style.position='fixed'; ta.style.opacity=0; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        showSuccess('Copied!');
      }
    });

    async function getAirportEmail(apt){
      const fallback='slotdesk@ryanair.com';
      try{
        if(!window.firebase || !firebase.database) return fallback;
        const db=firebase.database();
        const code=apt.toUpperCase().trim();
        const dir=await db.ref('airports/'+code).once('value');
        if(dir.exists()){ const v=dir.val()||{}; return v.email||v.emailGeneral||fallback; }
        const q=await db.ref('airports').orderByChild('airportIcao').equalTo(code).once('value');
        if(q.exists()){ let e=fallback; q.forEach(ch=>{ const v=ch.val()||{}; e=v.email||v.emailGeneral||e; }); return e; }
        return fallback;
      }catch{return fallback;}
    }

    $$('#emailBtn').addEventListener('click', async ()=>{
      const txt=out.textContent.trim(); if(!txt) return showError('Generate first.');
      const apt=airportEl.value.trim().toUpperCase();
      const hdr=headDateEl.value;
      const subject=`SIR '${apt}' ${ddMMM(hdr)}`;
      const to = await getAirportEmail(apt);
      const href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt)}`;
      window.location.href=href;
    });
