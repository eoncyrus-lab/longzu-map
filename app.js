(function(){
const {STATUS,AREAS,E,POSTCARDS,DAYS,KZ,ROUTES,LABELS,GEO,IMG}=window;
const byId=Object.fromEntries(E.map(e=>[e.id,e]));
const dayOf={}; DAYS.forEach((d,i)=>d.s.forEach((id,j)=>dayOf[id]={n:i+1,j:j+1}));
/* fictional places only carry mood-reference photos, so they stay plain dots on the map */
const hasPh=e=>IMG[e.id]&&e.status!=='fiction';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dot=s=>`<span class="dot s-${s}"></span>`;

let st={area:'tokyo',sel:'skytree',on:{real:1,proto:1,fiction:1,gone:1,extra:1},who:'',day:0};
try{const s=JSON.parse(localStorage.getItem('lz-jp2')||'null'); if(s&&AREAS[s.area]){st.area=s.area; if(byId[s.sel]) st.sel=s.sel;}}catch(e){}
const h=(location.hash||'').slice(1);
if(AREAS[h]) st.area=h; else if(byId[h]){st.sel=h; st.area=byId[h].area;}
function save(){try{localStorage.setItem('lz-jp2',JSON.stringify({area:st.area,sel:st.sel}));}catch(e){}}
const visible=e=>st.on[e.status]&&(!st.who||e.who.includes(st.who));

/* ---------------- map ---------------- */
const map=L.map('map',{zoomSnap:.5,zoomDelta:.5,minZoom:4.5,maxZoom:16,worldCopyJump:false,attributionControl:true,preferCanvas:false});
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Natural Earth · OSRM');
map.setMaxBounds([[24,120],[50,155]]);
/* fixed panes keep land < details < routes regardless of when each layer gets added */
const pane=(n,z)=>{map.createPane(n).style.zIndex=z; return L.svg({padding:.6,pane:n});};
const RL=pane('land',250), RD=pane('detail',300), RR=pane('routes',380), RI=pane('itin',390);
const gj=(fc,R)=>L.geoJSON(fc,{renderer:R,interactive:false,style:f=>({className:'g-'+f.properties.k})});
/* base land is always shown; details are zoom-gated */
gj(GEO.base,RL).addTo(map);
const tiers=[
  {layer:gj(GEO.region,RD),min:8},
  {layer:gj(GEO.central,RD),min:11},
  {layer:gj(GEO.matsuyama,RD),min:10.5}
];
const routeLayers={};
/* routes drawn from waypoints in data.js rather than OSM geometry */
ROUTES.forEach(r=>{ if(!r.via||GEO.routes[r.id]) return;
  const pts=r.arc?r.via.slice(1).flatMap((p,i)=>arc(r.via[i],p,.12)):r.via;
  GEO.routes[r.id]={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts.map(([la,lo])=>[lo,la])}}]};
});
ROUTES.forEach(r=>{
  const fc=GEO.routes[r.id]; if(!fc) return;
  routeLayers[r.id]=L.geoJSON(fc,{renderer:RR,interactive:false,style:()=>({className:r.cls})});
  if(r.on) routeLayers[r.id].addTo(map);
});
/* 七日行程：每天按顺序连线；第 5 天是三选一，画成从东京站出发的放射线；第 6 天先是羽田→松山的航线 */
const itin=L.layerGroup(), dayLayers={};
function arc(a,b,bend){
  const k=Math.cos((a[0]+b[0])/2*Math.PI/180), ax=a[1]*k, ay=a[0], bx=b[1]*k, by=b[0];
  const mx=(ax+bx)/2-(by-ay)*bend, my=(ay+by)/2+(bx-ax)*bend, pts=[];
  for(let i=0;i<=24;i++){const t=i/24,u=1-t; pts.push([u*u*ay+2*u*t*my+t*t*by,(u*u*ax+2*u*t*mx+t*t*bx)/k]);}
  return pts;
}
DAYS.forEach((d,i)=>{
  const n=i+1, P=d.s.map(id=>[byId[id].lat,byId[id].lon]), ls=dayLayers[n]=[], pts=[...P];
  const hb=d.hub?' hubline':'';
  const line=(a,b,dash)=>{const q=arc(a,b,.15);
    ls.push(L.polyline(q,{renderer:RI,interactive:false,className:'it-case'+hb}).addTo(itin), L.polyline(q,{renderer:RI,interactive:false,className:`it d${n}${dash?' it-dash':''}${hb}`}).addTo(itin));};
  const aux=([la,lo,t],cls)=>{pts.push([la,lo]); ls.push(L.marker([la,lo],{interactive:false,keyboard:false,icon:L.divIcon({className:'pwrap',iconSize:[0,0],html:`<span class="aux ${cls} d${n}"><i></i>${esc(t)}</span>`})}).addTo(itin));};
  if(d.hub){ pts.push(d.hub.slice(0,2)); P.forEach(p=>line(d.hub,p,true)); }
  else{
    const seq=[...(d.from||[]),...P];
    (d.from||[]).forEach(f=>aux(f,'air'));
    const gr=d.ground&&GEO.routes[d.ground], gk=(d.from||[]).length-1;
    for(let k=0;k<seq.length-1;k++){
      if(gr&&k===gk){
        const g=gr.features[0].geometry.coordinates.map(([lo,la])=>[la,lo]);
        ls.push(L.polyline(g,{renderer:RI,interactive:false,className:'it-case'}).addTo(itin),L.polyline(g,{renderer:RI,interactive:false,className:`it d${n}`}).addTo(itin));
        line(g[g.length-1],seq[k+1],false);
      } else line(seq[k],seq[k+1],d.from&&k<gk);
    }
  }
  d.bounds=L.latLngBounds(pts);
});
itin.addTo(map);
function showDay(n){
  st.day=n;
  Object.entries(dayLayers).forEach(([k,ls])=>{const o=!n||+k===n?1:.12; ls.forEach(l=>l.setStyle?l.setStyle({opacity:o}):l.setOpacity(o));});
  const c=$('#dayclear'); c.hidden=!n; if(n) c.querySelector('b').textContent=`第 ${n} 天`;
  refresh();
}

/* text labels */
const lblMarkers=LABELS.map(([t,la,lo,zmin,zmax,k])=>({zmin,zmax,m:L.marker([la,lo],{interactive:false,keyboard:false,icon:L.divIcon({className:'lwrap',html:`<span class="lbl ${k}">${t}</span>`,iconSize:[0,0]})})}));

/* pins */
const LZ={japan:4.5,region:9,tokyo:12,matsuyama:12,umi:14};   // label shows from this zoom
const SHOW={japan:4.5,region:7,tokyo:10.5,matsuyama:10,umi:14};// pin shows from this zoom
/* a pin can ask to stay folded into its cluster until a closer zoom (Kansai, 梅津寺町) */
const showZ=e=>e.zmin||SHOW[e.area], lblZ=e=>e.zmin||LZ[e.area];
const pins={};
E.forEach(e=>{
  const m=L.marker([e.lat,e.lon],{keyboard:false,riseOnHover:true,icon:L.divIcon({className:'pwrap',iconSize:[0,0],
    html:`${e.co?`<i class="ld" style="width:${Math.hypot(...e.co).toFixed(1)}px;transform:rotate(${Math.atan2(e.co[1],e.co[0]).toFixed(3)}rad)"></i><i class="anc s-${e.status}"></i>`:''}<button class="pin${hasPh(e)?' has-ph':''}" data-id="${e.id}" aria-label="${esc(e.name)}"${e.co?` style="--dx:${e.co[0]}px;--dy:${e.co[1]}px"`:''}><span class="dot s-${e.status}"></span>${hasPh(e)?`<img class="ph s-${e.status}" src="${IMG[e.id].f}" alt="" loading="lazy">`:''}${dayOf[e.id]?`<span class="dn d${dayOf[e.id].n}">D${dayOf[e.id].n}·${dayOf[e.id].j}</span>`:''}<span class="lb ${e.lb||'r'}">${esc(e.label)}</span></button>`})});
  m.on('click',()=>select(e.id,false));
  pins[e.id]=m;
});
const clusters=[
  {lat:35.68,lon:139.76,img:'skytree',label:'东京市区',n:E.filter(e=>e.area==='tokyo').length,go:'tokyo',zmin:7,zmax:10.5,lb:'r'},
  {lat:35.55,lon:139.5,img:'skytree',label:'东京及近郊',n:E.filter(e=>e.area==='tokyo'||e.area==='region').length,go:'region',zmin:0,zmax:7,lb:'r'},
  {lat:33.86,lon:132.75,img:'baishinji',label:'松山',n:E.filter(e=>e.area==='matsuyama'||e.area==='umi').length,go:'matsuyama',zmin:0,zmax:10,lb:'r'},
  {lat:33.8818,lon:132.6968,img:'umitown',label:'梅津寺町',n:E.filter(e=>e.area==='umi').length,go:'umi',zmin:10,zmax:14,lb:'l'}
].map(c=>{
  const m=L.marker([c.lat,c.lon],{keyboard:false,icon:L.divIcon({className:'pwrap',iconSize:[0,0],html:`<button class="pin cluster${c.img&&IMG[c.img]?' has-ph':''}" aria-label="放大到${c.label}">${c.img&&IMG[c.img]?`<img class="ph cl" src="${IMG[c.img].f}" alt="" loading="lazy">`:''}<span class="dot"></span><span class="lb ${c.lb}">${c.label} · ${c.n} 处 →</span></button>`})});
  m.on('click',()=>c.go?goArea(c.go):map.flyToBounds(c.b,{duration:.8}));
  return {...c,m};
});

function refresh(){
  const z=map.getZoom();
  const mc=map.getContainer(); mc.classList.toggle('it-on',map.hasLayer(itin)); mc.classList.toggle('z-hi',z>=11); mc.classList.toggle('z-lo',z<8); mc.classList.toggle('show-hub',!!st.day&&!!DAYS[st.day-1].hub);
  tiers.forEach(t=>{const on=z>=t.min; if(on&&!map.hasLayer(t.layer)) t.layer.addTo(map); if(!on&&map.hasLayer(t.layer)) map.removeLayer(t.layer);});
  lblMarkers.forEach(l=>{const on=z>=l.zmin&&z<l.zmax; if(on&&!map.hasLayer(l.m)) l.m.addTo(map); if(!on&&map.hasLayer(l.m)) map.removeLayer(l.m);});
  clusters.forEach(c=>{const on=z>=c.zmin&&z<c.zmax; if(on&&!map.hasLayer(c.m)) c.m.addTo(map); if(!on&&map.hasLayer(c.m)) map.removeLayer(c.m);});
  E.forEach(e=>{
    const m=pins[e.id]; const on=z>=showZ(e)||(e.id===st.sel&&z>=showZ(e)-2);
    if(on&&!map.hasLayer(m)) m.addTo(map); if(!on&&map.hasLayer(m)) map.removeLayer(m);
    const el=m.getElement&&m.getElement(); if(!el) return;
    const b=el.querySelector('.pin');
    b.classList.toggle('sel',e.id===st.sel);
    b.classList.toggle('dim',!visible(e));
    b.classList.toggle('showlb',z>=lblZ(e));
    b.classList.toggle('showph',z>=lblZ(e)&&hasPh(e));
    b.classList.toggle('showdn',!!dayOf[e.id]&&(st.day===dayOf[e.id].n||z>=lblZ(e)+1));
    b.classList.toggle('offday',!!st.day&&dayOf[e.id]?.n!==st.day);
    el.classList.toggle('sel-z',e.id===st.sel);
    /* at nationwide zoom, crowded pins move their photo onto open sea and keep a leader line to the true spot */
    el.classList.toggle('co',!!e.co&&z<7);
    el.classList.toggle('dimw',!visible(e)||(!!st.day&&dayOf[e.id]?.n!==st.day));
  });
}
map.on('zoomend',refresh);

function goArea(a,keepSel){
  st.area=a;
  if(!keepSel&&(!byId[st.sel]||byId[st.sel].area!==a)){const f=E.find(e=>e.area===a); st.sel=f?f.id:null;}
  map.flyToBounds(AREAS[a].b,{duration:.8});
  save(); renderSide();
}
function select(id,fly){
  const e=byId[id]; if(!e) return;
  st.sel=id; st.area=e.area; save();
  if(fly){ const z={japan:7,region:11,tokyo:14,matsuyama:14,umi:16}[e.area]; map.flyTo([e.lat,e.lon],Math.max(map.getZoom(),z,e.zmin||0),{duration:.8}); }
  renderSide(); refresh();
  if(!fly&&window.matchMedia('(max-width:900px)').matches) $('#detail').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ---------------- side ---------------- */
function figure(id){
  const im=IMG[id]; if(!im) return '';
  return `<figure><img src="${im.f}" alt="${esc(byId[id].name)}" loading="lazy"></figure><figcaption>照片：${esc(im.by)} · ${esc(im.lic)} · <a href="${im.url}" target="_blank" rel="noopener">Wikimedia Commons</a>${im.note?' · '+esc(im.note):''}</figcaption>`;
}
const gmap=e=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(e.q);
function renderDetail(){
  const e=byId[st.sel]; const d=$('#detail');
  if(!e){d.innerHTML='<div class="dbody"><p class="sub">点地图上的地点查看详情。</p></div>';return;}
  d.innerHTML=`${figure(e.id)}<div class="dbody">
    <div class="st">${dot(e.status)}${STATUS[e.status].name}</div>
    <h2>${esc(e.name)}</h2>
    ${e.sub?`<div class="sub">${esc(e.sub)}</div>`:''}
    ${e.jp?`<div class="jp"><span>日文：${esc(e.jp)}</span><button class="copy" data-copy="${esc(e.jp)}">复制</button></div>`:''}
    ${e.ch.length?`<div class="chs">${e.ch.map(c=>`<span class="ch">${esc(c)}</span>`).join('')}</div>`:''}
    ${e.who.length?`<div class="who-row">出场：${e.who.map(esc).join('、')}</div>`:''}
    ${e.qt?`<blockquote class="qt"><p>「${esc(e.qt[0])}」</p><cite>原文 · ${esc(e.qt[1])}</cite></blockquote>`:''}
    <div class="jn"><small>仿江南笔调 · 原创文案，非原文</small>${esc(e.jn)}</div>
    <div class="blk"><h3>书里发生了什么</h3><p>${esc(e.story)}</p></div>
    <div class="blk"><h3>现实</h3><p>${esc(e.real)}</p></div>
    ${e.tips&&e.tips.length?`<div class="blk"><h3>怎么去 · 小贴士</h3><ul>${e.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
    ${e.kz?`<div class="kz"><b>考据</b>${esc(e.kz)}</div>`:''}
    <div class="acts">
      <button class="btn" data-fly="${e.id}">在地图上定位</button>
      ${e.q?`<a class="btn solid" href="${gmap(e)}" target="_blank" rel="noopener">在 Google 地图打开</a>`:''}
    </div></div>`;
  d.scrollTop=0;
}
$('#detail').addEventListener('click',ev=>{
  const f=ev.target.closest('[data-fly]'); if(f){select(f.dataset.fly,true); $('#map').scrollIntoView({behavior:'smooth',block:'nearest'}); return;}
  const b=ev.target.closest('[data-copy]'); if(!b) return;
  const t=b.dataset.copy;
  const fallback=()=>{const r=document.createRange(); r.selectNodeContents(b.previousElementSibling); const s=getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent='已选中，请手动复制';};
  try{navigator.clipboard.writeText(t).then(()=>{b.textContent='已复制'; setTimeout(()=>b.textContent='复制',1500);},fallback);}catch(err){fallback();}
});
function renderTabs(){
  $('#tabs').innerHTML=Object.entries(AREAS).map(([k,v])=>`<button class="tab" role="tab" data-area="${k}" aria-selected="${k===st.area}">${v.name}<span class="n">${E.filter(e=>e.area===k).length}</span></button>`).join('');
}
$('#tabs').addEventListener('click',ev=>{const b=ev.target.closest('[data-area]'); if(b) goArea(b.dataset.area);});
function renderList(){
  $('#list').innerHTML=E.filter(e=>e.area===st.area).map(e=>{
    const im=IMG[e.id];
    return `<button class="card${e.id===st.sel?' sel':''}${visible(e)?'':' dim'}" data-id="${e.id}">${im?`<img class="th" src="${im.f}" alt="" loading="lazy">`:`<span class="th none">${dot(e.status)}</span>`}<span style="min-width:0"><b>${dot(e.status)}${esc(e.name)}</b><small>${esc(e.sub||STATUS[e.status].name)}</small></span></button>`;
  }).join('');
}
$('#list').addEventListener('click',ev=>{const b=ev.target.closest('[data-id]'); if(!b) return; select(b.dataset.id,true); $('#map').scrollIntoView({behavior:'smooth',block:'nearest'});});
function renderSide(){renderTabs(); renderDetail(); renderList();}

/* filters */
$('#stchips').innerHTML=Object.entries(STATUS).map(([k,v])=>`<button class="chip" data-st="${k}" aria-pressed="true">${dot(k)}${v.name}</button>`).join('');
$('#stchips').addEventListener('click',ev=>{const b=ev.target.closest('[data-st]'); if(!b) return; st.on[b.dataset.st]=st.on[b.dataset.st]?0:1; b.setAttribute('aria-pressed',st.on[b.dataset.st]?'true':'false'); renderList(); refresh();});
const whos=[...new Set(E.flatMap(e=>e.who))];
$('#who').innerHTML='<option value="">全部人物</option>'+whos.map(w=>`<option>${esc(w)}</option>`).join('');
$('#who').addEventListener('change',ev=>{st.who=ev.target.value; renderList(); refresh();});
$('#routes').insertAdjacentHTML('beforeend',ROUTES.filter(r=>GEO.routes[r.id]).map(r=>`<button class="chip" data-route="${r.id}" aria-pressed="${r.on}"><span class="sw ${r.cls}"></span>${r.name}</button>`).join(''));
$('#routes').insertAdjacentHTML('afterbegin','<button class="chip" data-itin aria-pressed="true"><span class="sw it-sw"></span>七日行程</button><button class="chip" id="dayclear" hidden>只看<b></b> · 显示全部 ×</button>');
$('#routes').querySelector('.flabel').after($('#routes [data-itin]'),$('#dayclear'));
$('#routes').addEventListener('click',ev=>{
  if(ev.target.closest('#dayclear')){showDay(0); return;}
  const t=ev.target.closest('[data-itin]'); if(t){const on=!map.hasLayer(itin); if(on) itin.addTo(map); else {map.removeLayer(itin); showDay(0);} t.setAttribute('aria-pressed',on?'true':'false'); refresh(); return;}
});
$('#routes').addEventListener('click',ev=>{const b=ev.target.closest('[data-route]'); if(!b) return; const L_=routeLayers[b.dataset.route]; const on=!map.hasLayer(L_); if(on) L_.addTo(map); else map.removeLayer(L_); b.setAttribute('aria-pressed',on?'true':'false');});

/* facts */
(function(){
  const n=E.length, real=E.filter(e=>e.status==='real').length, chs=new Set(E.flatMap(e=>e.ch)).size, ph=Object.keys(IMG).length;
  $('#facts').innerHTML=`<span><b>${n}</b> 个地点</span><span><b>${real}</b> 处现在就能去</span><span>涉及原著 <b>${chs}</b> 个章节</span><span><b>${ph}</b> 张实景照片</span>`;
})();

/* sections */
$('#pcs').innerHTML=POSTCARDS.map(p=>{const im=IMG[p.img||p.id]; return `
  <article class="pc">${im?`<img src="${im.f}" alt="" loading="lazy">`:''}
    <span class="stamp${p.red?' red':''}">${p.date}</span>
    <div class="pb"><h3>${p.title}</h3><div class="back">${p.back}</div>
    <small>${p.red?'下·二十二 樱怒之日':'下·二十二 樱怒之日 · 明信片背面'}</small>
    <button class="go" data-open="${p.id}">在地图上看 →</button></div>
  </article>`;}).join('');
$('#days').innerHTML=DAYS.map(d=>`
  <div class="day"><div class="d"><span class="dk d${d.d}"></span>DAY<b>${d.d}</b></div><div style="min-width:0">
    <h3>${d.t}</h3><p>${d.p}</p>
    <div class="stops">${d.s.map(id=>`<button class="stop" data-open="${id}">${dot(byId[id].status)}${esc(byId[id].label.replace('（示意）',''))}</button>`).join('')}<button class="stop seeday" data-day="${d.d}">在地图上看这一天的路线 →</button></div>
  </div></div>`).join('');
$('#kzrows').innerHTML=KZ.map(([a,b,c,v,w])=>`<tr><td>${a}</td><td>${b}</td><td>${c}</td><td class="verdict v-${v}">${w}</td></tr>`).join('');
$('#credits').innerHTML=Object.entries(IMG).map(([id,im])=>`<li>${esc(byId[id].name)}：${esc(im.by)}，${esc(im.lic)}，<a href="${im.url}" target="_blank" rel="noopener">来源</a></li>`).join('');
document.addEventListener('click',ev=>{
  const dd=ev.target.closest('[data-day]'); if(!dd) return;
  const n=+dd.dataset.day, d=DAYS[n-1];
  if(!map.hasLayer(itin)){itin.addTo(map); $('#routes [data-itin]').setAttribute('aria-pressed','true');}
  st.sel=d.s[0]; st.area=byId[d.s[0]].area; save(); renderSide();
  showDay(n);
  map.flyToBounds(d.bounds.pad(.25),{duration:.8,maxZoom:14});
  document.querySelector('.explorer').scrollIntoView({behavior:'smooth',block:'start'});
});
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-open]'); if(!b) return;
  select(b.dataset.open,true);
  document.querySelector('.explorer').scrollIntoView({behavior:'smooth',block:'start'});
});

/* theme: follow system, or pin light / dark (remembered per viewer) */
(function(){
  const modes=['auto','light','dark'], names={auto:'◐ 跟随系统',light:'☀ 浅色',dark:'☾ 深色'}, b=$('#themebtn');
  let m='auto'; try{m=localStorage.getItem('lz-theme')||'auto';}catch(e){}
  const apply=()=>{ if(m==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=m; b.textContent=names[m]; };
  b.addEventListener('click',()=>{ m=modes[(modes.indexOf(m)+1)%3]; try{localStorage.setItem('lz-theme',m);}catch(e){} apply(); });
  apply();
})();

/* boot */
map.fitBounds(byId[st.sel]&&h===st.sel?[[byId[st.sel].lat-.01,byId[st.sel].lon-.01],[byId[st.sel].lat+.01,byId[st.sel].lon+.01]]:AREAS[st.area].b);
renderSide(); refresh();
})();
