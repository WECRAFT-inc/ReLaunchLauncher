/* Copié du prototype « Prototype ReLaunch × WeCraft » (scripts/import-prototype.py).
   Modifications : voir les commentaires [WeCraft]. Données d'exemple fictives. */
(function(){
  "use strict";
  var LOGO="data:image/webp;base64,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";
  var root=document.documentElement, appRoot=document.getElementById('appRoot');
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function slug(s){return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function clone(o){return JSON.parse(JSON.stringify(o))}

  /* ---------- Icônes ---------- */
  function svg(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'}
  var IC={
    wecraft:svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    relaunch:svg('<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9-.8-.8-2.1-.8-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 012-3.9A12.9 12.9 0 0122 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 01-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
    welive:svg('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>'),
    relink:svg('<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>'),
    settings:svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    favorites:svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    screenshots:svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
    discover:svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    create:svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>'),
    staff:svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    tune:svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    spark:svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
    bell:svg('<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>'),
    news:svg('<path d="M4 5h13v14H6a2 2 0 01-2-2z"/><path d="M17 9h3v8a2 2 0 01-2 2"/><path d="M8 9h5M8 13h5M8 16h3"/>'),
    live:svg('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 010 8.4M7.8 16.2a6 6 0 010-8.4M19.1 4.9a10 10 0 010 14.2M4.9 19.1a10 10 0 010-14.2"/>'),
    downloads:svg('<path d="M12 3v11M7.5 9.5L12 14l4.5-4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
    friends:svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6"/>'),
    pins:svg('<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>'),
    spacer:svg('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),
    shop:svg('<path d="M5 7h14l-1.2 12.2a2 2 0 01-2 1.8H8.2a2 2 0 01-2-1.8z"/><path d="M9 10V6a3 3 0 016 0v4"/>'),
    sep:svg('<path d="M5 12h14"/>'),
    play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    upload:svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
    import:svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    cubes:svg('<path d="M7.5 4.3l4.5-2.3 4.5 2.3v4.6L12 11.2 7.5 8.9z"/><path d="M3 12.6l4.5-2.3 4.5 2.3v4.6L7.5 19.5 3 17.2zM12 12.6l4.5-2.3 4.5 2.3v4.6l-4.5 2.3-4.5-2.3z"/>'),
    folder:svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    ext:svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
    search:svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    paint:svg('<path d="M19 3l2 2-9 9-3 1 1-3z"/><path d="M5 21c2 0 4-1 4-4"/>'),
    nav:svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>'),
    home:svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    game:svg('<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"/>'),
    behave:svg('<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>'),
    user:svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    ms:'<svg viewBox="0 0 24 24"><path fill="#f25022" d="M3 3h8.5v8.5H3z"/><path fill="#7fba00" d="M12.5 3H21v8.5h-8.5z"/><path fill="#00a4ef" d="M3 12.5h8.5V21H3z"/><path fill="#ffb900" d="M12.5 12.5H21V21h-8.5z"/></svg>',
    dl:svg('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
    heart:svg('<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/>')
  };

  /* ---------- Données d'exemple ---------- */
  var DAY=864e5, NOW=Date.now();
  /* [ReLaunch] Données d'exemple du prototype retirées (20/10/2026) : listes vides jusqu'à ce que les
     vraies données soient branchées (instances : lot E2). */
  var INST=[];
  var SRV=[];
  function all(){return INST.concat(SRV)}
  var DL=[];
  var FRIENDS=[];
  var REQS=[];
  var LIVES=[];
  function byId(id){return all().find(function(x){return x.id===id})}
  var SC={WeCraft:"var(--acc)",CurseForge:"#f16436",Prism:"#5eead4",Modrinth:"#1bd96a"};
  function ago(t){if(!t)return 'jamais';var d=NOW-t;if(d<36e5)return 'il y a quelques minutes';if(d<DAY)return 'il y a '+Math.round(d/36e5)+' h';var j=Math.round(d/DAY);return j===1?'hier':'il y a '+j+' jours'}
  function initials(n){return n.split(/\s+/).filter(function(w){return /^[A-Za-zÀ-ÿ0-9]/.test(w)}).slice(0,2).map(function(w){return w[0]}).join('').toUpperCase()}
  function detail(x){return x.k==='wc'?(x.l+' '+x.lv+' · '+x.v+' · '+x.r+' Go'):(x.d+' · '+(x.p?x.p+' joueurs':x.status))}

  /* ---------- État ---------- */
  var S={fold:{orga:true,pins:true},newsSel:'n1',newsF:'Tout',drawer:null,liveF:'Tous',liveSel:'l1',view:'home',sel:'i1',wcSrc:'all',wcQ:'',delId:null,rlTab:'profil',skin:0,setTab:'nav',dTab:'modpacks',dQ:'',dSort:'pertinence',dPage:1,installed:{},shotF:'all',welTab:'Tout'};
  var NAVDEF={mode:'single',single:'left',h:'top',v:'left',junction:'logo',pinMode:'inline',dock:{side:'bottom',align:'center'},
    pins:[],items:[
    {id:'wecraft',on:true,bar:'h'},{id:'relaunch',on:true,bar:'h'},{id:'welive',on:true,bar:'h'},{id:'sep1',on:true,bar:'v'},
    {id:'discover',on:true,bar:'v'},{id:'create',on:true,bar:'v'},{id:'favorites',on:true,bar:'v'},{id:'shop',on:true,bar:'v'},{id:'sep2',on:true,bar:'v'},
    {id:'pins',on:true,bar:'v'},{id:'spacer',on:true,bar:'v'},
    {id:'settings',on:true,bar:'v'}]};
  var NAVINFO={
    wecraft:{l:'WeCraft',d:'Launcher et instances',view:'wecraft'},
    relaunch:{l:'ReLaunch',d:'Events et serveurs',view:'relaunch'},
    welive:{l:'WeLive',d:'Contenus MC francophones',view:'welive'},
    discover:{l:'Découvrir du contenu MC',d:'Modpacks, mods, shaders…',view:'discover'},
    create:{l:'Créer un WePack',d:'Nouvelle instance',act:'create'},
    favorites:{l:'Favoris',d:'Instances favorites',view:'favorites'},
    shop:{l:'Shop',d:'Capes, cosmétiques, grades',view:'relink',rl:'shop'},
    pins:{l:'Instances épinglées',d:'Affichage choisi plus bas'},
    spacer:{l:'Espace flexible',d:'Ce qui suit va au bout de la barre'},
    settings:{l:'Réglages',d:'Toujours en bas de sa barre',view:'settings',pin:true},
    sep1:{l:'Séparateur',sep:true},sep2:{l:'Séparateur',sep:true}
  };
  var NAV=load('proto-nav5',null)||clone(NAVDEF);
  var CARDTYPES={event:{l:'Event',c:'#fb923c'},content:{l:'Contenu',c:'#a78bfa'},maj:{l:'MAJ',c:'#4ade80'},decouvrir:{l:'À découvrir',c:'#38bdf8'},reseaux:{l:'Réseaux',c:'#f472b6'},shop:{l:'Shop',c:'#facc15'}};
  /* Les trois encarts de l'accueil sont choisis par l'équipe, pas par le joueur */
  var HOME_CARDS=['event','maj','decouvrir'];
  var HOME=load('proto-home3',null)||{resume:true};
  /* Encarts d'actualité : contenu choisi par l'équipe, affichage réglé par le joueur */
  var CAR=load('proto-car',null)||{on:true,n:3,auto:true,speed:6}; CAR.on=true;
  var NEWS=[];
  var REPORTS=[];
  var NOTIFS=[];
  S.car=0;
  var PREF=load('proto-pref2',null)||{skin:'phenix',ram:6,discord:false,reopen:true,start:'home',java:true};
  if(!PREF.custom) PREF.custom={h:330,s:80,l:60}; if(!PREF.bg) PREF.bg='pattern';
  var PREM=false; /* [ReLaunch] pas d'offre Premium : couleur personnalisée masquée */
  var APPVER='';
  document.addEventListener('relaunch:info',function(e){APPVER=String((e.detail&&e.detail.version)||'');if(S.view==='settings')RENDER.settings()});

  /* ---------- Navigation ---------- */
  var VIEWS=['news','home','wecraft','relaunch','welive','live','relink','settings','favorites','discover'];
  var RENDER={};
  var HIST=[];
  /* Recliquer sur la section ouverte : rien, page précédente ou accueil (réglage) */
  function reclick(){
    var m=PREF.reclick||'back';
    if(m==='none') return;
    var cur=S.view+'|'+(S.view==='relink'?S.rlTab:'');
    if(m==='home'){ if(S.view!=='home') show('home'); return; }
    while(HIST.length&&HIST[HIST.length-1]===cur) HIST.pop();
    var k=HIST.pop()||'home|', p=k.split('|'); S._back=true;
    show(p[0],p[0]==='relink'?{rlTab:p[1]||'profil'}:null);
  }
  function show(v,opts){
    if(VIEWS.indexOf(v)<0) v='home';
    var prevKey=S.view+'|'+(S.view==='relink'?S.rlTab:'');
    S.view=v; if(opts) Object.keys(opts).forEach(function(k){S[k]=opts[k]});
    var newKey=v+'|'+(v==='relink'?S.rlTab:'');
    if(!S._back&&prevKey!==newKey){ HIST.push(prevKey); if(HIST.length>30) HIST.shift(); }
    S._back=false;
    VIEWS.forEach(function(x){$('v-'+x).hidden=(x!==v)});
    appRoot.classList.toggle('on-home',v==='home');
    RENDER[v](); markNav(); $('main').scrollTop=0;
    try{localStorage.setItem('proto-view2',v)}catch(e){}
    refresh();
  }
  function markNav(){
    document.querySelectorAll('#bars [data-go]').forEach(function(b){
      var on;
      if(b.dataset.rl) on=(S.view==='relink'&&S.rlTab===b.dataset.rl);
      else if(b.dataset.go==='relink') on=(S.view==='relink'&&S.rlTab!=='shop');
      else on=(b.dataset.go===S.view);
      if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('#bars [data-drawer]').forEach(function(b){b.setAttribute('aria-pressed',String(S.drawer===b.dataset.drawer))});
  }

  /* ---------- Barres de navigation ---------- */
  function navBtn(id,orient){
    var it=NAVINFO[id];
    if(it.sep) return '<span class="'+(orient==='v'?'sepv':'seph')+'" data-sep="1"></span>';
    if(id==='spacer') return '<span class="grow" data-spacer="1"></span>';
    if(id==='pins'){
      if(NAV.pinMode==='inline') return pinsHTML();
      if(NAV.pinMode==='section'){ var n=pinCount(); return '<button class="nb" data-act="openSection" data-popbtn="1" data-a="nav-pins" data-tip="Instances épinglées" aria-label="Instances épinglées">'+IC.pins+(n?'<span class="cnt">'+n+'</span>':'')+'</button>'; }
      return '';
    }
    var attr=it.view?'data-go="'+it.view+'"'+(it.rl?' data-rl="'+it.rl+'"':''):'data-act="'+it.act+'"';
    return '<button class="nb" '+attr+' data-a="nav-'+id+'" data-tip="'+esc(it.l)+'" aria-label="'+esc(it.l)+'">'+IC[id]+'</button>';
  }
  /* Boutons d'usage regroupés avec le profil, en haut à droite */
  function utilBtn(id){
    if(id==='news'){ var nu=NEWS.filter(function(n){return n.unread}).length+NOTIFS.length; return '<button class="nb" data-act="drawer" data-drawer="news" data-a="nav-news" data-tip="Nouveautés et notifications" aria-label="Nouveautés et notifications" aria-pressed="false">'+IC.bell+(nu?'<span class="cnt">'+nu+'</span>':'')+'</button>'; }
    if(id==='live') return '<button class="nb" data-go="live" data-a="nav-live" data-tip="Diffusion Partenaires · '+LIVES.length+' lives" aria-label="Diffusion Partenaires">'+IC.live+(LIVES.length?'<span class="livedot"></span>':'')+'</button>';
    var cnt=id==='downloads'?DL.filter(function(d){return d.st==='active'||d.st==='queued'}).length:FRIENDS.filter(function(f){return f.on!=='off'}).length;
    var l=id==='downloads'?'Download Manager':'Amis';
    return '<button class="nb" data-act="drawer" data-drawer="'+id+'" data-a="nav-'+id+'" data-tip="'+l+'" aria-label="'+l+'" aria-pressed="false">'+IC[id]+(cnt?'<span class="cnt">'+cnt+'</span>':'')+'</button>';
  }
  var STAFF=false;
  function utilsHTML(){return (STAFF?'<button class="nb staffb" data-act="drawer" data-drawer="staff" data-a="nav-staff" data-tip="Menu staff" aria-label="Menu staff" aria-pressed="false">'+IC.staff+(REPORTS.length?'<span class="cnt">'+REPORTS.length+'</span>':'')+'</button>':'')+utilBtn('news')+utilBtn('live')+utilBtn('downloads')+utilBtn('friends')}
  function headHTML(s,size){
    s=s||SKINS[S.skin];
    return '<span class="head3d" style="--s:'+size+'px;--sk:'+s.sk+';--hair:'+s.hair+';--eye:'+s.eye+'"><i class="b"></i><i class="u"></i><i class="l"></i><i class="t"></i><i class="r"></i><i class="f"></i></span>';
  }
  var LOGOBTN='<button class="nb logo" data-go="home" data-a="nav-logo" data-tip="Accueil" aria-label="Accueil"><img src="'+LOGO+'" alt=""></button>';
  function profBtn(){return '<button class="nb prof" data-go="relink" data-a="nav-profile" data-tip="Compte ReLink" aria-label="Compte ReLink">'+headHTML(null,Math.round(barSize().b*.48))+'</button>'}
  function sepEl(o){return '<span class="'+(o==='v'?'sepv':'seph')+'"></span>'}
  function cleanSeps(html){
    var d=document.createElement('div'); d.innerHTML=html; var kids=[].slice.call(d.children), prevSep=true;
    var lastKept=null;
    kids.forEach(function(k){
      if(k.dataset.sep){ if(prevSep) k.remove(); else lastKept=k; prevSep=true; return; }
      if(k.dataset.spacer){ if(lastKept&&lastKept.dataset.sep) lastKept.remove(); lastKept=k; prevSep=true; return; }
      lastKept=k; prevSep=false; });
    var last=d.lastElementChild; while(last&&last.dataset.sep){last.remove();last=d.lastElementChild}
    return d.innerHTML;
  }
  /* Le profil reste en haut à droite : dans une barre si elle passe par là, sinon posé sur la fenêtre */
  function profPlace(c){
    c=c||NAV;
    if(c.mode==='single') return c.single==='top'?'end':c.single==='right'?'start':'float';
    if(c.joined===false) return (c.h==='top'||c.v==='top')?'dtop':((c.h==='right'||c.v==='right')?'dright':'float');
    if(c.junction==='profil') return 'corner';
    if(c.h==='top') return 'hend';
    if(c.v==='right') return 'vstart';
    return 'float';
  }
  function occupied(c){c=c||NAV;return c.mode==='single'?[c.single]:[c.h,c.v]}
  function dockSide(){var occ=occupied(),all4=['bottom','right','top','left'];if(occ.indexOf(NAV.dock.side)>-1) NAV.dock.side=all4.filter(function(s){return occ.indexOf(s)<0})[0];return NAV.dock.side}
  /* [ReLaunch] Taille des barres (Réglages > Navigation) : épaisseur des barres et taille des boutons. */
  var BARSIZES={xs:{v:60,h:54,b:30,l:'Très fine'},s:{v:72,h:64,b:35,l:'Fine'},m:{v:84,h:74,b:40,l:'Normale'},l:{v:100,h:88,b:48,l:'Grande'},xl:{v:116,h:102,b:56,l:'Très grande'}};
  function barSize(){return BARSIZES[NAV.size]||BARSIZES.m}
  function renderBars(){
    var BS=barSize(), BV=BS.v+'px', BH=BS.h+'px';
    appRoot.style.setProperty('--nb',BS.b+'px');
    var lgOn=PREF.style==='lg', bars=$('bars'), html='', g, R=lgOn?24:16, m=lgOn?12:10, pp=profPlace();
    var zone=NAV.pinMode==='inline'?' data-pin-zone="1"':'';
    function piece(cls,area,inner,touch,key){
      var mg=[touch.t?0:m,touch.r?0:m,touch.b?0:m,touch.l?0:m];
      var bw=[touch.t?0:1,touch.r?0:1,touch.b?0:1,touch.l?0:1];
      var rad=[(!touch.t&&!touch.l)?R:0,(!touch.t&&!touch.r)?R:0,(!touch.b&&!touch.r)?R:0,(!touch.b&&!touch.l)?R:0];
      return '<nav class="bar '+cls+'" data-a="'+key+'" data-name="Navigation"'+(key==='bar-corner'?'':zone)+' style="grid-area:'+area+';margin:'+mg.join('px ')+'px;border-width:'+bw.join('px ')+'px;border-radius:'+rad.join('px ')+'px" aria-label="Navigation">'+inner+'</nav>';
    }
    var setIt=NAV.items.find(function(x){return x.id==='settings'});
    function list(bar,o){return cleanSeps(NAV.items.filter(function(x){return x.on&&!NAVINFO[x.id].pin&&(bar==null||x.bar===bar)}).map(function(x){return navBtn(x.id,o)}).join(''))}
    function setB(bar,o){return (setIt&&setIt.on&&(bar==null||setIt.bar===bar))?navBtn('settings',o):''}
    function GR(bar){return NAV.items.some(function(x){return x.id==='spacer'&&x.on&&(bar==null||x.bar===bar)})?'':'<span class="grow"></span>'}
    if(NAV.mode==='single'){
      var o=(NAV.single==='left'||NAV.single==='right')?'v':'h';
      var inner=(pp==='start'?profBtn()+utilsHTML()+sepEl(o):'')+LOGOBTN+sepEl(o)+list(null,o)+GR(null)+setB(null,o)+(pp==='end'?sepEl(o)+utilsHTML()+profBtn():'');
      html=piece(o,'bar',inner,{},'bar-main');
      g={left:[BV+' minmax(0,1fr)','minmax(0,1fr)','"bar main"'],right:['minmax(0,1fr) '+BV,'minmax(0,1fr)','"main bar"'],top:['minmax(0,1fr)',BH+' minmax(0,1fr)','"bar" "main"'],bottom:['minmax(0,1fr)','minmax(0,1fr) '+BH,'"main" "bar"']}[NAV.single];
    } else if(NAV.joined===false){
      /* Deux barres indépendantes : chacune sur son bord, sans se toucher dans les angles */
      var sides=[NAV.h,NAV.v], has=function(x){return sides.indexOf(x)>-1}, ori=function(x){return (x==='top'||x==='bottom')?'h':'v'};
      var cols=(has('left')?BV+' ':'')+'minmax(0,1fr)'+(has('right')?' '+BV:''), rws=(has('top')?BH+' ':'')+'minmax(0,1fr)'+(has('bottom')?' '+BH:'');
      var rr=(has('top')?['top']:[]).concat(['mid']).concat(has('bottom')?['bottom']:[]), cc=(has('left')?['left']:[]).concat(['mid']).concat(has('right')?['right']:[]);
      var ar=rr.map(function(r){return '"'+cc.map(function(c){if(r==='mid'&&c==='mid')return 'main';if(r!=='mid'&&c==='mid')return 'b'+r;if(r==='mid'&&c!=='mid')return 'b'+c;return '.'}).join(' ')+'"'}).join(' ');
      [['h',NAV.h],['v',NAV.v]].forEach(function(p){
        var bar=p[0], sd=p[1], o=ori(sd), A=bar==='h';
        var inner=(pp==='dright'&&sd==='right'?profBtn()+utilsHTML()+sepEl(o):'')+(A?LOGOBTN+sepEl(o):'')+list(bar,o)+GR(bar)+setB(bar,o)+(pp==='dtop'&&sd==='top'?sepEl(o)+utilsHTML()+profBtn():'');
        html+=piece(o,'b'+sd,inner,{},'bar-'+bar);
      });
      g=[cols,rws,ar];
    } else {
      var top=NAV.h==='top', left=NAV.v==='left';
      var cols=left?BV+' minmax(0,1fr)':'minmax(0,1fr) '+BV, rows=top?BH+' minmax(0,1fr)':'minmax(0,1fr) '+BH;
      var rowH=left?'"corner hbar"':'"hbar corner"', rowV=left?'"vbar main"':'"main vbar"';
      var areas=top?rowH+' '+rowV:rowV+' '+rowH;
      var corner=pp==='corner'?profBtn():LOGOBTN;
      var hInner=(pp==='corner'?LOGOBTN+sepEl('h'):'')+list('h','h')+GR('h')+setB('h','h')+(pp==='hend'||pp==='corner'?sepEl('h')+utilsHTML()+(pp==='hend'?profBtn():''):'');
      var vInner=(pp==='vstart'?profBtn()+utilsHTML()+sepEl('v'):'')+list('v','v')+GR('v')+setB('v','v');
      /* La pièce d'angle touche la barre horizontale sur le côté et la verticale au-dessus ou en dessous */
      html=piece('corner v','corner',corner,{t:!top,b:top,l:!left,r:left},'bar-corner')
        +piece('h','hbar',hInner,{l:left,r:!left},'bar-h')
        +piece('v','vbar',vInner,{t:top,b:!top},'bar-v');
      g=[cols,rows,areas];
    }
    if(pp==='float') html+='<div class="pfloat" data-a="profile-float" data-name="Navigation">'+utilsHTML()+profBtn()+'</div>';
    /* Barre séparée pour les épingles, jamais sur un bord déjà pris par la barre d'action */
    var ds='';
    if(NAV.pinMode==='dock'){
      ds=dockSide();
      var dh=(ds==='top'||ds==='bottom')?'h':'v';
      html+='<div class="dock '+dh+' s-'+ds+' a-'+NAV.dock.align+'" data-a="pin-dock" data-name="Épingles" data-pin-zone="1">'+(pinCount()?pinsHTML():'<span class="dockhint">Épingle une instance pour la voir ici</span>')+'</div>';
    }
    appRoot.classList.toggle('pf',pp==='float');
    ['top','right','bottom','left'].forEach(function(s){appRoot.classList.toggle('dk-'+s,ds===s)});
    appRoot.style.gridTemplateColumns=g[0]; appRoot.style.gridTemplateRows=g[1]; appRoot.style.gridTemplateAreas=g[2];
    bars.style.display='contents';
    bars.innerHTML=html;
    markNav(); refresh();
  }

  /* ---------- Épingles : éléments seuls ou groupes nommés ---------- */
  function normPins(){NAV.pins=(NAV.pins||[]).map(function(p){return typeof p==='string'?{t:'i',id:p}:p}).map(function(p){if(p.t==='g')p.items=(p.items||[]).filter(byId);return p}).filter(function(p){return p.t==='g'?p.items.length>0:byId(p.id)});NAV.pinMode=NAV.pinMode||'inline';NAV.dock=NAV.dock||{side:'bottom',align:'center'}}
  function pinCount(){return NAV.pins.reduce(function(a,p){return a+(p.t==='i'?1:p.items.length)},0)}
  function gById(id){return NAV.pins.find(function(p){return p.t==='g'&&p.id===id})}
  function groupOf(id){return NAV.pins.find(function(p){return p.t==='g'&&p.items.indexOf(id)>-1})}
  function topIndexOf(id){return NAV.pins.findIndex(function(p){return p.t==='i'&&p.id===id})}
  function isPinned(id){return topIndexOf(id)>-1||!!groupOf(id)}
  function pullRaw(id){NAV.pins.forEach(function(p){if(p.t==='g'){var k=p.items.indexOf(id);if(k>-1)p.items.splice(k,1)}});var i=topIndexOf(id);if(i>-1)NAV.pins.splice(i,1)}
  function tidy(){NAV.pins=NAV.pins.reduce(function(acc,p){if(p.t==='g'){if(!p.items.length)return acc;if(p.items.length===1){acc.push({t:'i',id:p.items[0]});return acc}}acc.push(p);return acc},[])}
  function savePins(){tidy();store('proto-nav5',NAV);renderBars();renderPop();if(S.view==='settings')RENDER.settings();else if(S.view==='wecraft'||S.view==='favorites'||S.view==='relaunch')RENDER[S.view]();refresh()}
  function togglePin(id){var was=isPinned(id);if(was)pullRaw(id);else NAV.pins.push({t:'i',id:id});savePins();toast(was?'Retiré des épingles':'Épinglé')}
  function pinDrop(drag,target){
    if(drag===target) return;
    var d=drag.split(':'), t=target.split(':');
    if(target==='zone'){
      if(d[0]==='i'){ pullRaw(d[1]); NAV.pins.push({t:'i',id:d[1]}); }
      else { var gi=NAV.pins.findIndex(function(p){return p.t==='g'&&p.id===d[1]}); NAV.pins.push(NAV.pins.splice(gi,1)[0]); }
    } else if(t[0]==='g'){
      var G=gById(t[1]); if(!G) return;
      if(d[0]==='i'){ if(G.items.indexOf(d[1])>-1) return; pullRaw(d[1]); G.items.push(d[1]); }
      else { var H=gById(d[1]); G.items=G.items.concat(H.items); NAV.pins=NAV.pins.filter(function(p){return p!==H}); }
      toast('Ajouté au groupe « '+G.name+' »');
    } else {
      var X=t[1];
      if(d[0]==='g'){ var H2=gById(d[1]); if(H2.items.indexOf(X)>-1) return; pullRaw(X); H2.items.push(X); toast('Ajouté au groupe « '+H2.name+' »'); }
      else {
        var Y=d[1], Gx=groupOf(X);
        if(Gx){ if(Gx.items.indexOf(Y)<0){ pullRaw(Y); Gx.items.push(Y); } }
        else {
          pullRaw(Y); var idx=topIndexOf(X);
          var ng={t:'g',id:'g'+Date.now().toString(36),name:'Nouveau groupe',items:[X,Y]};
          NAV.pins.splice(idx,1,ng);
          S.pop={kind:'group',gid:ng.id,rename:true}; S.popAnchor='pgrp-'+ng.id;
          toast('Groupe créé : donne-lui un nom');
        }
      }
    }
    savePins();
  }
  function pinItemBtn(id){var x=byId(id);if(!x)return '';return '<button class="nb rec" draggable="true" data-pin-drag="i:'+id+'" data-pin-drop="i:'+id+'" data-play="'+id+'" data-a="pin-'+id+'" data-tip="'+(x.k==='rl'?'Rejoindre ':'Lancer ')+esc(x.n)+'" aria-label="Lancer '+esc(x.n)+'" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'">'+esc(initials(x.n))+'</button>'}
  /* Icône de groupe : une pile de cartes aux couleurs des instances, le nom en initiales et le nombre */
  function minis(g){var xs=g.items.map(byId).filter(Boolean).slice(0,3);var lay=xs.slice().reverse().map(function(x,k){var pos=xs.length-1-k;return '<i class="l'+pos+'" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'">'+(pos===0?'<span>'+esc(initials(g.name)||'G')+'</span>':'')+'</i>'}).join('');return '<span class="gstack">'+lay+'<em>'+g.items.length+'</em></span>'}
  function grpBtn(g){return '<button class="nb grp" draggable="true" data-pin-drag="g:'+g.id+'" data-pin-drop="g:'+g.id+'" data-act="openGroup" data-gid="'+g.id+'" data-popbtn="1" data-a="pgrp-'+g.id+'" data-tip="'+esc(g.name)+' · '+g.items.length+'" aria-label="Groupe '+esc(g.name)+'">'+minis(g)+'</button>'}
  function pinsHTML(){return NAV.pins.map(function(p){return p.t==='i'?pinItemBtn(p.id):grpBtn(p)}).join('')}

  /* Fenêtre surgissante : contenu d'un groupe ou section des épingles */
  function renderPop(){
    var el=$('pop');
    if(!S.pop){el.hidden=true;return}
    var html='';
    if(S.pop.kind==='group'){
      var g=gById(S.pop.gid); if(!g){S.pop=null;el.hidden=true;return}
      html='<div class="phead">'+(S.pop.back?'<button class="ib" data-act="popBack" aria-label="Retour">←</button>':'')+'<input type="text" id="popName" value="'+esc(g.name)+'" aria-label="Nom du groupe"><button class="ib" data-act="closePop" aria-label="Fermer">✕</button></div>'+
        '<div class="plist" data-pin-drop="g:'+g.id+'">'+g.items.map(byId).filter(Boolean).map(function(x){return '<div class="pitem" draggable="true" data-pin-drag="i:'+x.id+'" data-pin-drop="i:'+x.id+'" data-a="pgi-'+x.id+'"><span class="cover" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'"></span><span style="min-width:0"><b>'+esc(x.n)+'</b><small>'+esc(detail(x))+'</small></span><span class="acts"><button class="btn sm pri" data-play="'+x.id+'">'+(x.k==='rl'?'Rejoindre':'Jouer')+'</button><button class="ib" data-act="ungroup" data-id="'+x.id+'" aria-label="Sortir du groupe" title="Sortir du groupe">↗</button></span></div>'}).join('')+'</div>'+
        '<div class="pfoot"><small>Glisse une instance hors du groupe pour l\'en sortir.</small><button class="btn sm" data-act="dissolve" data-gid="'+g.id+'">Dissoudre</button></div>';
    } else {
      html='<div class="phead"><b>Instances épinglées</b><button class="ib" data-act="closePop" aria-label="Fermer">✕</button></div>'+
        '<div class="pgrid" data-pin-zone="1">'+(NAV.pins.length?NAV.pins.map(function(p){
          if(p.t==='i'){var x=byId(p.id);if(!x)return '';return '<button class="ptile" draggable="true" data-pin-drag="i:'+x.id+'" data-pin-drop="i:'+x.id+'" data-play="'+x.id+'" data-a="pt-'+x.id+'"><span class="cover" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'"><span>'+esc(initials(x.n))+'</span></span><small>'+esc(x.n)+'</small></button>'}
          return '<button class="ptile" draggable="true" data-pin-drag="g:'+p.id+'" data-pin-drop="g:'+p.id+'" data-act="openGroupIn" data-gid="'+p.id+'" data-a="ptg-'+p.id+'"><span class="gmini">'+minis(p)+'</span><small>'+esc(p.name)+' · '+p.items.length+'</small></button>'}).join(''):'<span class="faint" style="font-size:12.5px;grid-column:1/-1">Aucune épingle pour l\'instant.</span>')+'</div>'+
        '<small class="faint">Glisse une instance sur une autre pour créer un groupe.</small>';
    }
    el.innerHTML=html; el.hidden=false; positionPop();
    var pn=$('popName');
    if(pn){
      pn.addEventListener('input',function(){var g=gById(S.pop.gid);if(!g)return;g.name=this.value.trim()||'Groupe';store('proto-nav5',NAV);var b=document.querySelector('[data-a="pgrp-'+g.id+'"]');if(b)b.dataset.tip=g.name+' · '+g.items.length});
      pn.addEventListener('keydown',function(e){if(e.key==='Enter')this.blur()});
      if(S.pop.rename&&!dev){pn.focus();pn.select();S.pop.rename=false}
    }
    refresh();
  }
  function positionPop(){
    var el=$('pop'), ar=appRoot.getBoundingClientRect(), pr=el.getBoundingClientRect();
    var an=S.popAnchor&&document.querySelector('[data-a="'+S.popAnchor+'"]'), x, y;
    if(!an||!an.getClientRects().length){x=(ar.width-pr.width)/2;y=80}
    else{
      var r=an.getBoundingClientRect(), box=an.closest('.bar,.dock'), vert=box&&box.classList.contains('v');
      if(vert){var right=(r.left-ar.left)>ar.width/2;x=right?(r.left-ar.left-pr.width-10):(r.right-ar.left+10);y=r.top-ar.top-10}
      else{var bottom=(r.top-ar.top)>ar.height/2;x=r.left-ar.left+r.width/2-pr.width/2;y=bottom?(r.top-ar.top-pr.height-10):(r.bottom-ar.top+10)}
    }
    x=Math.max(8,Math.min(x,ar.width-pr.width-8));y=Math.max(8,Math.min(y,ar.height-pr.height-8));
    el.style.left=x+'px';el.style.top=y+'px';
  }

  /* Glisser-déposer des épingles (barre, barre séparée, section, réglages) */
  var pinDrag=null;
  function clearDrop(){document.querySelectorAll('.dropon,.dragging').forEach(function(x){x.classList.remove('dropon','dragging')})}
  appRoot.addEventListener('dragstart',function(e){
    if(dev) return;
    var d=e.target.closest&&e.target.closest('[data-pin-drag]'); if(!d) return;
    pinDrag=d.dataset.pinDrag; tip.hidden=true; d.classList.add('dragging');
    try{e.dataTransfer.setData('text/plain',pinDrag);e.dataTransfer.effectAllowed='move'}catch(_){}
    e.stopPropagation();
  });
  appRoot.addEventListener('dragover',function(e){
    if(!pinDrag) return;
    var t=e.target.closest('[data-pin-drop],[data-pin-zone]'); if(!t) return;
    e.preventDefault();
    if(!t.classList.contains('dropon')){clearDropTargets();t.classList.add('dropon')}
  });
  function clearDropTargets(){document.querySelectorAll('.dropon').forEach(function(x){x.classList.remove('dropon')})}
  appRoot.addEventListener('drop',function(e){
    if(!pinDrag) return;
    var t=e.target.closest('[data-pin-drop]')||e.target.closest('[data-pin-zone]'); if(!t) return;
    e.preventDefault(); e.stopPropagation();
    var d=pinDrag; pinDrag=null; clearDrop();
    pinDrop(d,t.dataset.pinDrop||'zone');
  });
  appRoot.addEventListener('dragend',function(){pinDrag=null;clearDrop()});

  /* Info-bulle des barres */
  var tip=$('tip');
  function showTip(b){
    var t=b.dataset.tip; if(!t||dev) return;
    tip.textContent=t; tip.hidden=false;
    var bar=b.closest('.bar,.dock'), ar=appRoot.getBoundingClientRect(), r=b.getBoundingClientRect(), tr=tip.getBoundingClientRect(), x, y;
    if(!bar){ x=r.right-ar.left-tr.width; y=r.bottom-ar.top+8; }
    else {
      var vert=bar.classList.contains('v'), right=vert&&(r.left-ar.left)>ar.width/2, bottom=!vert&&(r.top-ar.top)>ar.height/2;
      if(vert){ y=r.top-ar.top+r.height/2-tr.height/2; x=right?(r.left-ar.left-tr.width-10):(r.right-ar.left+10); }
      else { x=r.left-ar.left+r.width/2-tr.width/2; y=bottom?(r.top-ar.top-tr.height-10):(r.bottom-ar.top+10); }
    }
    x=Math.max(6,Math.min(x,ar.width-tr.width-6)); y=Math.max(6,Math.min(y,ar.height-tr.height-6));
    tip.style.left=x+'px'; tip.style.top=y+'px';
  }
  $('bars').addEventListener('mouseover',function(e){var b=e.target.closest('[data-tip]');if(b)showTip(b)});
  $('bars').addEventListener('mouseout',function(e){var b=e.target.closest('[data-tip]');if(b)tip.hidden=true});
  $('bars').addEventListener('focusin',function(e){var b=e.target.closest('[data-tip]');if(b)showTip(b)});
  $('bars').addEventListener('focusout',function(){tip.hidden=true});

  /* ---------- Style (standard ou Liquid Glass) ---------- */
  function applyStyle(quiet){ appRoot.classList.toggle('lg',PREF.style==='lg'); if(!quiet){ renderBars(); renderPop(); } }
  /* ---------- Thème ---------- */
  function hsl(c,dl,dh){return 'hsl('+(((c.h+(dh||0))%360+360)%360)+' '+c.s+'% '+Math.max(10,Math.min(92,c.l+(dl||0)))+'%)'}
  var CUSTVARS=['--acc','--acc-2','--acc-deep','--spark'];
  function setSkin(s){
    if(s==='custom'&&!PREM) s='phenix';
    PREF.skin=s;
    CUSTVARS.forEach(function(v){root.style.removeProperty(v)});
    if(s==='phenix'||s==='custom') root.removeAttribute('data-skin'); else root.setAttribute('data-skin',s);
    if(s==='custom'){ var c=PREF.custom; root.style.setProperty('--acc',hsl(c)); root.style.setProperty('--acc-2',hsl(c,14)); root.style.setProperty('--acc-deep',hsl(c,-24)); root.style.setProperty('--spark',hsl(c,6,48)); }
    store('proto-pref2',PREF);
    try{document.dispatchEvent(new CustomEvent('wecraft:skin-changed',{detail:s}))}catch(_){}
  }
  document.addEventListener('wecraft:apply-skin',function(e){var k=e.detail;if(['phenix','relink','aurore','glace'].indexOf(k)<0)return;setSkin(k);if(S.view==='settings')RENDER.settings()});
  function applyBg(){ appRoot.classList.toggle('bg-plain',PREF.bg==='plain'); appRoot.classList.toggle('bg-flat',PREF.bg==='flat'); }
  function hexOf(c){var h=c.h,s=c.s/100,l=c.l/100,a=s*Math.min(l,1-l);function f(n){var k=(n+h/30)%12,v=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(v*255).toString(16).padStart(2,'0')}return '#'+f(0)+f(8)+f(4)}
  function wheelUI(){
    var w=$('wheel'); if(!w) return; var c=PREF.custom, r=90, ang=c.h*Math.PI/180, dist=(c.s/100)*r*0.86;
    var k=$('wknob'); k.style.left=(r+Math.cos(ang)*dist)+'px'; k.style.top=(r+Math.sin(ang)*dist)+'px'; k.style.background=hsl(c);
    w.style.setProperty('--wl',c.l+'%'); w.setAttribute('aria-valuenow',c.h);
    $('wsw1').style.background=hsl(c); $('wsw2').style.background=hsl(c,14); $('wsw3').style.background=hsl(c,-24); $('whex').textContent=hexOf(c).toUpperCase();
  }
  function wheelPick(e){
    var w=$('wheel'), rc=w.getBoundingClientRect(), x=e.clientX-rc.left-rc.width/2, y=e.clientY-rc.top-rc.height/2;
    var h=Math.round((Math.atan2(y,x)*180/Math.PI+360)%360), s=Math.round(Math.min(1,Math.sqrt(x*x+y*y)/(rc.width/2*0.86))*100);
    PREF.custom.h=h; PREF.custom.s=Math.max(25,s); setSkin('custom'); wheelUI();
    document.querySelectorAll('.theme').forEach(function(t){t.setAttribute('aria-pressed',String(t.dataset.theme==='custom'))});
  }
  function wireWheel(){
    var w=$('wheel'); if(!w||!PREM) { wheelUI(); return; }
    var drag=false;
    w.addEventListener('pointerdown',function(e){if(dev)return;drag=true;try{w.setPointerCapture(e.pointerId)}catch(_){}wheelPick(e)});
    w.addEventListener('pointermove',function(e){if(drag)wheelPick(e)});
    w.addEventListener('pointerup',function(){if(drag){drag=false;if(S.setTab==='apparence')RENDER.settings()}});
    w.addEventListener('keydown',function(e){var d={ArrowRight:5,ArrowUp:5,ArrowLeft:-5,ArrowDown:-5}[e.key];if(!d)return;e.preventDefault();PREF.custom.h=(PREF.custom.h+d+360)%360;setSkin('custom');wheelUI()});
    $('wl').addEventListener('input',function(){PREF.custom.l=+this.value;setSkin('custom');wheelUI()});
    wheelUI();
  }

  /* ---------- Notifications et lancement ---------- */
  var toastT;
  function toast(m){var t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},2400)}
  var LSTEPS=["Vérification des fichiers","Installation de la version et du loader","Préparation du profil","Ouverture du jeu"];
  var lt=null;
  /* [WeCraft] Pas de progression simulée (prompt maître §10.4) : le lancement réel arrive au lot E4. */
  function launch(id){
    var x=byId(id); if(!x) return;
    toast('Lancement pas encore disponible dans cette version. Pour jouer, utilise WeCraft habituel.');
  }
  $('lClose').addEventListener('click',function(){clearTimeout(lt);$('launchBox').hidden=true;refresh()});

  /* [ReLaunch] Pages dont le contenu n'existe pas encore : un état vide honnête. */
  function soon(view,title,sub,text){
    $(view).innerHTML='<div class="vhead"><div><h2>'+title+'</h2><div class="sub">'+sub+'</div></div></div>'+
      '<div class="card rl-empty"><b>Pas encore disponible</b><p class="muted">'+text+'</p></div>';
  }
  /* ================= ACCUEIL ================= */
  function lastPlayed(){return all().filter(function(x){return x.last}).sort(function(a,b){return b.last-a.last})[0]}
  function sc2(c){return '<span class="sc" style="'+scStyle(c)+'"></span>'}
  function newsCard(n){return '<button class="ncard" data-news="'+n.id+'" data-a="news-'+n.id+'">'+sc2(n.sc)+(n.video?'<span class="vplay">'+IC.play+'</span>':'')+(n.unread?'<span class="unread" aria-label="Non lu"></span>':'')+'<span class="ntags">'+n.tags.map(function(t){return '<span class="ntag" style="--tc:'+t[1]+'">'+esc(t[0])+'</span>'}).join('')+'</span><b>'+esc(n.t)+'</b><small>'+esc(n.d)+'</small></button>'}
  function carMax(){return Math.max(0,NEWS.length-CAR.n)}
  function carouselHTML(){
    S.car=Math.min(S.car,carMax());
    var pos=carMax()+1;
    return '<div class="carousel" data-a="carousel" style="--n:'+CAR.n+'" aria-roledescription="carrousel" aria-label="Actualités">'+
      '<div class="ctrack" id="ctrack"><div class="cinner" id="cinner" style="transform:translateX(calc(-'+S.car+' * (100% + 12px) / '+CAR.n+'))">'+NEWS.map(newsCard).join('')+'</div>'+
      (pos>1?'<button class="carr prev" data-act="carPrev" aria-label="Actualité précédente">‹</button><button class="carr next" data-act="carNext" aria-label="Actualité suivante">›</button>':'')+'</div>'+
      '<div class="cfoot"><div class="cdots" id="cdots">'+(pos>1?Array.apply(null,Array(pos)).map(function(_,i){return '<button data-act="carGo" data-i="'+i+'" aria-label="Aller à la position '+(i+1)+'" aria-current="'+(i===S.car)+'"></button>'}).join(''):'')+'</div>'+
      (CAR.auto&&pos>1?'<span class="cprog" id="cprog" style="--spd:'+CAR.speed+'s"><i></i></span>':'')+
      '<span class="ccount" id="ccount">'+(S.car+1)+(CAR.n>1?'–'+Math.min(NEWS.length,S.car+CAR.n):'')+' sur '+NEWS.length+'</span></div></div>';
  }
  var carT=null;
  function carSet(i){
    var mx=carMax(); S.car=i>mx?0:(i<0?mx:i);
    var inn=$('cinner'); if(!inn) return;
    inn.style.transform='translateX(calc(-'+S.car+' * (100% + 12px) / '+CAR.n+'))';
    document.querySelectorAll('#cdots button').forEach(function(b,k){b.setAttribute('aria-current',String(k===S.car))});
    var c=$('ccount'); if(c) c.textContent=(S.car+1)+(CAR.n>1?'–'+Math.min(NEWS.length,S.car+CAR.n):'')+' sur '+NEWS.length;
    startCar(); refresh();
  }
  function startCar(){
    clearTimeout(carT);
    var p=$('cprog'); if(p){p.classList.remove('run');void p.offsetWidth;}
    if(!CAR.on||!CAR.auto||carMax()<1||S.view!=='home'||carPaused) return;
    if(p) p.classList.add('run');
    carT=setTimeout(function(){carSet(S.car+1)},CAR.speed*1000);
  }
  var carPaused=false;
  $('v-home').addEventListener('mouseover',function(e){ if(e.target.closest('.carousel')&&!carPaused){carPaused=true;clearTimeout(carT);var p=$('cprog');if(p)p.classList.remove('run')} });
  $('v-home').addEventListener('mouseout',function(e){ var c=e.target.closest('.carousel'); if(c&&!c.contains(e.relatedTarget)){carPaused=false;startCar()} });
  function openNews(id){var n=NEWS.find(function(x){return x.id===id});if(!n)return;n.unread=false;renderBars();if(lstOf().indexOf(n)<0)S.newsF='Tout';show('news',{newsSel:id})}
  function goNews(id){var n=NEWS.find(function(x){return x.id===id});var o={};if(n.rl)o.rlTab=n.rl;show(n.go,o)}
  RENDER.home=function(){
    var sel=byId(S.sel)||INST[0]||SRV[0], lp=lastPlayed();
    if(!sel){
      $('v-home').innerHTML='<div class="home nocar"><div class="hmain">'+
        '<h2 class="huge" aria-label="ReLaunch">RELAUNCH</h2>'+
        '<div class="playrow"><select id="homeSel" aria-label="Instance ou serveur" disabled><option>Aucune instance pour l\'instant</option></select><button class="btn play" id="homePlay" data-act="noInst">Jouer</button></div>'+
        '<span class="seldet" id="homeDet">La détection de tes instances (WeCraft, CurseForge, Modrinth, Prism) arrive dans une prochaine version.</span>'+
      '</div></div>';
      return;
    }
    var opts='<optgroup label="ReLaunch · serveurs">'+SRV.map(function(x){return '<option value="'+x.id+'"'+(x.id===sel.id?' selected':'')+'>'+esc(x.n)+'</option>'}).join('')+'</optgroup>'+
      '<optgroup label="WeCraft · instances">'+INST.map(function(x){return '<option value="'+x.id+'"'+(x.id===sel.id?' selected':'')+'>'+esc(x.n)+'</option>'}).join('')+'</optgroup>';
    $('v-home').innerHTML='<div class="home">'+
      '<div class="hmain">'+
        '<span class="hmeta"><button class="newsbtn" data-go="news" data-a="home-news">'+IC.news+'Info &amp; News'+(NEWS.some(function(n){return n.unread})?'<span class="ndot"></span>':'')+'</button></span>'+
        '<h2 class="huge" aria-label="ReLaunch">RELAUNCH</h2>'+
        '<div class="playrow"><select id="homeSel" aria-label="Instance ou serveur">'+opts+'</select><button class="btn play" data-play="'+sel.id+'" id="homePlay">Jouer</button></div>'+
        '<span class="seldet" id="homeDet">'+esc(detail(sel))+'</span>'+
        (HOME.resume&&lp?'<button class="resume" data-play="'+lp.id+'" data-a="resume"><span class="cover" style="--c1:'+lp.c[0]+';--c2:'+lp.c[1]+'"></span><span><small>Reprendre · '+ago(lp.last)+'</small><b>'+esc(lp.n)+'</b><small>'+(lp.k==='wc'?'Modpack WeCraft':'Serveur ReLaunch')+'</small></span><span class="go">'+IC.play+'</span></button>':'')+
      '</div>'+
      (CAR.on&&NEWS.length?carouselHTML():'')+
    '</div>';
    if(!CAR.on||!NEWS.length) $('v-home').firstChild.classList.add('nocar');
    startCar();
    $('homeSel').addEventListener('change',function(){S.sel=this.value;var x=byId(S.sel);$('homeDet').textContent=detail(x);$('homePlay').dataset.play=x.id;});
  };

  /* ================= WECRAFT ================= */
  RENDER.wecraft=function(){
    var recent=INST.filter(function(x){return x.last}).sort(function(a,b){return b.last-a.last}).slice(0,5);
    $('v-wecraft').innerHTML=
      '<div class="vhead"><div><h2>WeCraft</h2><div class="sub">Ton launcher Minecraft : instances, modpacks et outils</div></div></div>'+
      '<div class="qa">'+
        '<button class="btn" data-act="create">'+IC.create+'Créer un WePack<small>Nouvelle instance personnalisée</small></button>'+
        '<button class="btn" data-act="import">'+IC.import+'Importer une instance<small>Prism, CurseForge, Modrinth</small></button>'+
        '<button class="btn" data-go="discover">'+IC.discover+'Parcourir les modpacks<small>Catalogue de contenus</small></button>'+
      '</div>'+
      '<div class="sect"><h3>Dernières instances lancées</h3><div class="hscroll">'+(recent.length?'':'<span class="faint" style="font-size:13px">Aucune instance lancée pour l\'instant.</span>')+recent.map(function(x){
        return '<div class="wcard" data-a="wrec-'+x.id+'"><div class="cover" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'"></div><b>'+esc(x.n)+'</b><small>'+x.l+' · '+x.v+' · '+ago(x.last)+'</small><span class="row"><button class="btn sm pri" data-play="'+x.id+'">'+IC.play+'Jouer</button>'+pinBtn(x.id)+'</span></div>'}).join('')+'</div></div>'+
      '<div class="sect"><h3>Toutes les instances</h3>'+
        '<div class="toolbar"><div class="chips" id="wcSrc">'+['all','WeCraft','CurseForge','Prism','Modrinth'].map(function(s){return '<button class="chip" data-src="'+s+'" aria-pressed="'+(S.wcSrc===s)+'">'+(s==='all'?'Toutes':s)+'</button>'}).join('')+'</div>'+
        '<input type="search" id="wcQ" placeholder="Rechercher une instance" aria-label="Rechercher une instance" value="'+esc(S.wcQ)+'"></div>'+
        '<div class="tablewrap"><table><thead><tr><th></th><th>Instance</th><th>Version</th><th>Loader</th><th>Mods</th><th>Mémoire</th><th>Source</th><th></th></tr></thead><tbody id="wcRows"></tbody></table></div>'+
        '<div class="confirm gl" id="delBox" hidden><span style="font-size:13.5px">Supprimer <b id="delName"></b> ? Le dossier part à la corbeille.</span><span class="row"><button class="btn sm" data-act="delNo">Annuler</button><button class="btn sm danger" data-act="delYes">Supprimer</button></span></div>'+
      '</div>';
    rowsWc();
    $('wcSrc').addEventListener('click',function(e){var b=e.target.closest('[data-src]');if(!b)return;S.wcSrc=b.dataset.src;this.querySelectorAll('.chip').forEach(function(c){c.setAttribute('aria-pressed',String(c===b))});rowsWc();refresh()});
    $('wcQ').addEventListener('input',function(){S.wcQ=this.value;rowsWc();refresh()});
  };
  function pinBtn(id){var on=isPinned(id);return '<button class="pinbtn" data-act="pin" data-id="'+id+'" aria-pressed="'+on+'" aria-label="'+(on?'Retirer de la barre':'Épingler dans la barre')+'" title="'+(on?'Retirer de la barre':'Épingler dans la barre')+'">'+IC.pins+'</button>'}
  function rowsWc(){
    var q=S.wcQ.trim().toLowerCase();
    var rows=INST.filter(function(i){return (S.wcSrc==='all'||i.s===S.wcSrc)&&i.n.toLowerCase().indexOf(q)>-1});
    $('wcRows').innerHTML=rows.map(function(i){
      return '<tr data-a="inst-'+i.id+'"><td><button class="star" data-act="fav" data-id="'+i.id+'" aria-pressed="'+i.fav+'" aria-label="Favori">★</button></td><td><b>'+esc(i.n)+'</b></td><td class="num">'+i.v+'</td><td>'+i.l+' '+i.lv+'</td><td class="num">'+i.m+'</td><td class="num">'+i.r+' Go</td><td><span class="src" style="--sc:'+SC[i.s]+'">'+i.s+'</span></td><td><span class="row" style="justify-content:flex-end">'+pinBtn(i.id)+'<button class="btn sm pri" data-play="'+i.id+'">Jouer</button><button class="btn sm danger" data-act="del" data-id="'+i.id+'">Supprimer</button></span></td></tr>';
    }).join('')||'<tr><td colspan="8" class="faint">'+(INST.length?'Aucune instance ne correspond.':'Aucune instance pour l\'instant : la détection arrive dans une prochaine version.')+'</td></tr>';
  }

  /* ================= RELAUNCH ================= */

  /* ================= WELIVE ================= */
  RENDER.relaunch=function(){ soon('v-relaunch','ReLaunch','Events et serveurs','Les events et serveurs ReLaunch arriveront avec les comptes ReLink.'); };
  RENDER.welive=function(){ soon('v-welive','WeLive','Contenus Minecraft francophones','Les séries, lives, serveurs et créateurs recommandés arriveront dans une prochaine version.'); };

  /* ================= RELINK ================= */
  var SKINS=[
    {n:'Steve',sk:'#b58a6b',hair:'#3b2416',eye:'#4c3a9c',shirt:'#14a3a3',pants:'#3b3299',shoe:'#4a4a4a'},
    {n:'Alex',sk:'#f2c9a0',hair:'#e0782a',eye:'#2f7a3a',shirt:'#6fb36a',pants:'#6b4a2b',shoe:'#3a2a1a'},
    {n:'Zuri',sk:'#e8a67a',hair:'#a3401f',eye:'#3a2a1a',shirt:'#f0a24a',pants:'#1e5f6b',shoe:'#3a2a1a'},
    {n:'Sunny',sk:'#8d5a3b',hair:'#8b5fbf',eye:'#1a1a1a',shirt:'#b8dce0',pants:'#2a1a2a',shoe:'#1a1a1a'},
    {n:'Noor',sk:'#f0c08a',hair:'#f2e08a',eye:'#3a7ac0',shirt:'#5a2a4a',pants:'#2a2030',shoe:'#1a1a1a'},
    {n:'Makena',sk:'#5a3a22',hair:'#2a1a10',eye:'#1a1a1a',shirt:'#d0a020',pants:'#7a3a20',shoe:'#2a1a10'},
    {n:'Kai',sk:'#c88a64',hair:'#6a2a10',eye:'#2a2a2a',shirt:'#c02a2a',pants:'#202020',shoe:'#3a3a3a'},
    {n:'Efe',sk:'#a8704a',hair:'#202020',eye:'#1a1a1a',shirt:'#5aa83a',pants:'#3a6ac0',shoe:'#5a5a5a'},
    {n:'Phénix',sk:'#e8b48a',hair:'#c2410c',eye:'#ff8a3d',shirt:'#ff8a3d',pants:'#2a1a12',shoe:'#c2410c',saved:true},
    {n:'Event S3',sk:'#d49a72',hair:'#1a1a1a',eye:'#fbbf24',shirt:'#7c2d12',pants:'#3a3a3a',shoe:'#fb923c',saved:true}
  ];
  function mc(s,u){return '<span class="mc" style="--u:'+u+'px;--sk:'+s.sk+';--hair:'+s.hair+';--eye:'+s.eye+';--shirt:'+s.shirt+';--pants:'+s.pants+';--shoe:'+s.shoe+'"><i class="al"></i><i class="ar"></i><i class="ll"></i><i class="lr"></i><i class="bd"></i><i class="hd"></i></span>'}
  /* Captures d'écran (affichées dans l'espace compte) */
  function scStyle(c){return '--sky1:'+c[0]+';--sky2:'+c[1]+';--sun:'+c[2]+';--g1:'+c[3]+';--g2:'+c[4]+';--sx:'+c[5]}
  function shotTiles(list){return list.map(function(x){var s=x[0],o=byId(s[0]);return '<button class="shot" data-shot="'+x[1]+'" data-a="shot-'+x[1]+'"><span class="sc" style="'+scStyle(s[2])+'"></span><small>'+esc(s[1])+' · '+esc(o?o.n:'')+'</small></button>'}).join('')}

  RENDER.relink=function(){ soon('v-relink','Compte ReLink','Profil, captures d\'écran, skins et shop','Les comptes ReLink ne sont pas encore disponibles.'); markNav(); };

  /* ================= RÉGLAGES ================= */
  function mini(c){
    var bars='', L='', P='', pp=profPlace(c);
    if(c.mode==='single'){
      var p=c.single, o=(p==='left'||p==='right');
      bars='<i style="'+(o?'top:0;bottom:0;width:12px;'+p+':0':'left:0;right:0;height:11px;'+p+':0')+'"></i>';
      L={left:'top:3px;left:1.5px',right:'top:15px;right:1.5px',top:'top:1px;left:3px',bottom:'bottom:1px;left:3px'}[p];
    } else if(c.joined===false){
      var bs=function(x){return (x==='top'||x==='bottom')?'left:16px;right:16px;height:9px;'+x+':0':'top:14px;bottom:14px;width:10px;'+x+':0'};
      bars='<i style="'+bs(c.h)+';border-radius:3px"></i><i style="'+bs(c.v)+';border-radius:3px"></i>';
      L=(c.h==='top'||c.h==='bottom')?c.h+':0;left:18px':'top:16px;'+c.h+':0.5px';
    } else {
      bars='<i style="left:0;right:0;height:11px;'+c.h+':0"></i><i style="top:0;bottom:0;width:12px;'+c.v+':0"></i>';
      L=pp==='corner'?'top:1px;left:3px':c.h+':1px;'+c.v+':1.5px';
    }
    P={dtop:'top:0;right:18px',dright:'top:16px;right:0.5px',float:'top:5px;right:5px',end:'top:1px;right:3px',start:'top:3px;right:1.5px',corner:'top:1px;right:1.5px',hend:'top:1px;right:'+(c.v==='right'?'15px':'3px'),vstart:'top:3px;right:1.5px'}[pp];
    return '<span class="mini">'+bars+'<b style="'+L+'"></b><b class="p" style="'+P+'"></b></span>';
  }
  function pinMini(m){
    var h='<i style="top:0;bottom:0;width:12px;left:0"></i>';
    if(m==='inline') h+='<b class="q" style="left:2px;top:22px"></b><b class="q" style="left:2px;top:33px"></b>';
    else if(m==='section') h+='<b class="q" style="left:2px;top:27px;outline:1.5px solid #fff"></b>';
    else h+='<span style="position:absolute;left:50%;bottom:4px;transform:translateX(-50%);width:34px;height:10px;border-radius:4px;background:color-mix(in srgb,var(--acc) 55%,transparent);display:block"></span>';
    return '<span class="mini">'+h+'</span>';
  }
  function pinChip(id){var x=byId(id);if(!x)return '';return '<span class="pinchip" draggable="true" data-pin-drag="i:'+id+'" data-pin-drop="i:'+id+'" data-a="pc-'+id+'"><i style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'"></i>'+esc(x.n)+'<button data-act="pin" data-id="'+id+'" aria-label="Retirer '+esc(x.n)+'">✕</button></span>'}
  function foldHead(k,t,sub){return '<button class="fold" data-act="fold" data-k="'+k+'" aria-expanded="'+!S.fold[k]+'" data-a="fold-'+k+'"><span><b>'+t+'</b><small>'+sub+'</small></span><span class="chev" aria-hidden="true">▾</span></button>'}
  function pinMgr(){
    var occ=occupied(), sides=[['top','Haut'],['right','Droite'],['bottom','Bas'],['left','Gauche']];
    if(NAV.pinMode==='dock') dockSide();
    var modes=[['inline','Dans la barre','Parmi les boutons'],['section','Dans une section','Un bouton qui les regroupe'],['dock','Barre séparée','Sur un autre bord']];
    var h=foldHead('pins','Instances épinglées',pinCount()+' épinglée'+(pinCount()>1?'s':'')+' · '+{inline:'dans la barre',section:'dans une section',dock:'barre séparée'}[NAV.pinMode]);
    if(S.fold.pins) return h;
    h+='<div class="grp fbody" data-a="pin-settings"><p>Choisis où elles s\'affichent. Glisse une instance sur une autre pour créer un groupe, puis donne-lui un nom.</p>'+
      '<div class="layouts" style="grid-template-columns:repeat(3,minmax(0,1fr))">'+modes.map(function(m){return '<button class="lay" data-act="pinMode" data-m="'+m[0]+'" aria-pressed="'+(NAV.pinMode===m[0])+'">'+pinMini(m[0])+m[1]+'<span class="faint" style="font-weight:500;font-size:11px">'+m[2]+'</span></button>'}).join('')+'</div>';
    if(NAV.pinMode==='dock'){
      var horiz=NAV.dock.side==='top'||NAV.dock.side==='bottom';
      h+='<div class="setrow"><span><b>Bord</b><small>Les bords occupés par la barre d\'action sont bloqués</small></span><span class="chips">'+sides.map(function(sd){var dis=occ.indexOf(sd[0])>-1;return '<button class="chip" data-act="dockSide" data-s="'+sd[0]+'" aria-pressed="'+(NAV.dock.side===sd[0])+'"'+(dis?' disabled aria-disabled="true" title="Occupé par la barre d\'action" style="opacity:.35;cursor:not-allowed;text-decoration:line-through"':'')+'>'+sd[1]+'</button>'}).join('')+'</span></div>'+
        '<div class="setrow"><span><b>Position sur le bord</b><small>La barre ne prend pas tout le côté</small></span><span class="chips">'+[['start',horiz?'Gauche':'Haut'],['center','Centre'],['end',horiz?'Droite':'Bas']].map(function(a){return '<button class="chip" data-act="dockAlign" data-al="'+a[0]+'" aria-pressed="'+(NAV.dock.align===a[0])+'">'+a[1]+'</button>'}).join('')+'</span></div>';
    }
    h+='<div class="pinmgr" data-pin-zone="1">'+NAV.pins.map(function(p){
        if(p.t==='i') return pinChip(p.id);
        return '<div class="pgroup" draggable="true" data-pin-drag="g:'+p.id+'" data-pin-drop="g:'+p.id+'" data-a="pmg-'+p.id+'"><span class="gmini">'+minis(p)+'</span><input type="text" data-gname="'+p.id+'" value="'+esc(p.name)+'" aria-label="Nom du groupe" draggable="false"><span class="chips">'+p.items.map(pinChip).join('')+'</span><button class="btn sm" data-act="dissolve" data-gid="'+p.id+'">Dissoudre</button></div>';
      }).join('')+
      '<select id="pinAdd" aria-label="Épingler une instance"><option value="">+ Épingler…</option><optgroup label="WeCraft">'+INST.filter(function(p){return !isPinned(p.id)}).map(function(p){return '<option value="'+p.id+'">'+esc(p.n)+'</option>'}).join('')+'</optgroup><optgroup label="ReLaunch">'+SRV.filter(function(p){return !isPinned(p.id)}).map(function(p){return '<option value="'+p.id+'">'+esc(p.n)+'</option>'}).join('')+'</optgroup></select></div></div>';
    return h;
  }
  /* Configurations prêtes : ne touchent pas aux instances épinglées */
  var PRESETS={
    minimal:function(){var on={wecraft:1,relaunch:1,welive:1,sep1:1,create:1,shop:1,sep2:1,spacer:1,settings:1};return {cfg:{mode:'single',single:'left'},pinMode:'section',items:NAVDEF.items.map(function(x){return {id:x.id,on:!!on[x.id],bar:x.bar}})}},
    condensed:function(){var on={wecraft:1,relaunch:1,welive:1,create:1,shop:1,spacer:1,settings:1};return {cfg:{mode:'single',single:'left'},pinMode:'section',items:NAVDEF.items.map(function(x){return {id:x.id,on:!!on[x.id],bar:x.bar}})}},
    all:function(){return {cfg:{mode:'single',single:'left'},pinMode:'dock',dock:{side:'right',align:'end'},items:NAVDEF.items.map(function(x){return {id:x.id,on:true,bar:x.bar}})}},
    split:function(){var h={wecraft:1,relaunch:1,welive:1};return {cfg:{mode:'double',joined:false,h:'top',v:'left',junction:'logo'},pinMode:'dock',dock:{side:'right',align:'end'},items:NAVDEF.items.map(function(x){return {id:x.id,on:true,bar:h[x.id]?'h':'v'}})}}
  };
  var PRESET_NAMES={minimal:'Minimaliste',condensed:'Condensé',all:'Toutes les features',split:'Réparti'};
  function applyPreset(k){
    var p=PRESETS[k]();
    NAV.joined=p.cfg.joined!==false;
    ['mode','single','h','v','junction'].forEach(function(f){if(p.cfg[f]!==undefined)NAV[f]=p.cfg[f]});
    NAV.items=p.items; NAV.pinMode=p.pinMode; if(p.dock) NAV.dock=p.dock;
    S.pop=null; saveNav(); renderPop();
    toast('Configuration « '+PRESET_NAMES[k]+' » appliquée');
  }
  /* Animation : les lignes et les boutons glissent de leur ancienne place à la nouvelle */
  function snapPos(){var m={};document.querySelectorAll('.navrow[data-a],#bars .nb[data-a]').forEach(function(el){var r=el.getBoundingClientRect();if(r.width)m[el.dataset.a]=r});return m}
  function playFlip(before,movedKey){
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.navrow[data-a],#bars .nb[data-a]').forEach(function(el){
      var a=before[el.dataset.a]; if(!a) return; var b=el.getBoundingClientRect(), dx=a.left-b.left, dy=a.top-b.top;
      if(!dx&&!dy) return;
      el.style.transition='none'; el.style.transform='translate('+dx+'px,'+dy+'px)';
      requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.transition='transform .32s cubic-bezier(.3,.7,.2,1)';el.style.transform='';setTimeout(function(){el.style.transition='';},360)})});
    });
    if(movedKey) document.querySelectorAll('[data-a="navrow-'+movedKey+'"],#bars [data-a="nav-'+movedKey+'"]').forEach(function(el){el.classList.add('moved');setTimeout(function(){el.classList.remove('moved')},700)});
  }
  function moveNav(from,to){
    if(to<0||to>NAV.items.length-2||from===to) return;
    var before=snapPos(), it=NAV.items.splice(from,1)[0]; NAV.items.splice(to,0,it);
    saveNav(); playFlip(before,it.id);
  }
  function saveNav(){store('proto-nav5',NAV);renderBars();RENDER.settings();refresh()}
  RENDER.settings=function(){
    var menu=[['apparence','Apparence',IC.paint],['nav','Navigation',IC.nav],['accueil','Accueil',IC.home],['jeu','Jeu',IC.game],['comportement','Comportement',IC.behave],['compte','Compte ReLink',IC.relink]];
    var body='';
    var FR={top:'Haut',bottom:'Bas',left:'Gauche',right:'Droite'};
    if(S.setTab==='apparence'){
      body='<div class="grp"><h3>Style de l\'interface</h3><p>Les quatre thèmes de couleur existent dans les deux styles.</p><div class="styles">'+
        [['standard','std','Standard','Surfaces sombres et nettes'],['lg','lgv','Liquid Glass','Verre translucide, reflets, fond coloré']].map(function(x){return '<button class="stylec" data-act="style" data-v="'+x[0]+'" aria-pressed="'+((PREF.style||'standard')===x[0])+'"><span class="spv '+x[1]+'"><span class="sb"></span><span class="sp"><i></i></span></span><span class="snm"><b>'+x[2]+'</b><small>'+x[3]+'</small></span></button>'}).join('')+'</div></div>'+
        '<div class="grp"><h3>Thème de couleurs</h3><p>La couleur d\'accent de toute l\'appli.</p><div class="themes">'+[['phenix','Phénix','#ff8a3d'],['relink','ReLink','#3fd08a'],['aurore','Aurore','#8b7bff'],['glace','Glace','#5cc8ff']].concat(PREM?[['custom','Personnalisé',hsl(PREF.custom)]]:[]).map(function(t){return '<button class="theme" data-theme="'+t[0]+'" aria-pressed="'+(PREF.skin===t[0])+'" style="--tc:'+t[2]+'"><span class="pv" style="display:flex"><i></i><span></span></span><span class="nm">'+t[1]+'</span></button>'}).join('')+'</div></div>'+
        (PREM?'<div class="grp"><h3>Couleur personnalisée <span class="prembadge">Premium</span></h3><p>Choisis n\'importe quelle teinte pour tout le launcher, dans les deux styles.</p>'+
        '<div class="wheelbox'+(PREM?'':' locked')+'" data-a="color-wheel"><div class="wheel" id="wheel" tabindex="0" role="slider" aria-label="Roue des couleurs" aria-valuemin="0" aria-valuemax="360" aria-valuenow="'+PREF.custom.h+'" style="--wl:'+PREF.custom.l+'%"><span class="knobw" id="wknob"></span></div>'+
        '<div class="wctl"><div class="sw"><i id="wsw1"></i><i id="wsw2"></i><i id="wsw3"></i><span class="faint" style="font-size:12.5px">Accent, clair, foncé</span></div>'+
        '<label class="field">Luminosité<input type="range" id="wl" min="40" max="72" value="'+PREF.custom.l+'"></label>'+
        '<span class="row" style="justify-content:flex-start"><span class="tag" id="whex"></span><button class="btn sm" data-act="wheelReset">Réinitialiser</button></span></div>'+
        '</div></div>':'')+
        '<div class="grp"><h3>Fond</h3><p>Le fond derrière les pages du launcher.</p><div class="bgopts">'+[['pattern','pat','Avec motifs'],['plain','grad','Sans motifs'],['flat','flat','Uni']].map(function(x){return '<button class="bgopt" data-act="bgMode" data-v="'+x[0]+'" aria-pressed="'+((PREF.bg||'pattern')===x[0])+'"><span class="bpv '+x[1]+'"></span><span class="n">'+x[2]+'</span></button>'}).join('')+'</div></div>';
    } else if(S.setTab==='nav'){
      var singles=[['left','Gauche'],['top','Haut'],['right','Droite'],['bottom','Bas']];
      var joinedL=[{h:'top',v:'left',junction:'logo'},{h:'top',v:'right',junction:'logo'},{h:'top',v:'right',junction:'profil'},{h:'bottom',v:'left',junction:'logo'},{h:'bottom',v:'right',junction:'logo'}].map(function(d){d.mode='double';d.joined=true;return d});
      var freeL=[['top','bottom'],['left','right'],['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(function(p){return {mode:'double',joined:false,h:p[0],v:p[1],junction:'logo'}});
      var J=NAV.joined!==false;
      function isCur(c){if(c.mode==='single')return NAV.mode==='single'&&NAV.single===c.single;if(NAV.mode!=='double'||J!==c.joined)return false;return NAV.h===c.h&&NAV.v===c.v&&(!c.joined||NAV.junction===c.junction)}
      function layBtn(c,label,sub){return '<button class="lay" data-lay=\''+JSON.stringify(c)+'\' aria-pressed="'+isCur(c)+'">'+mini(c)+label+(sub?'<span class="faint" style="font-weight:500;font-size:11px">'+sub+'</span>':'')+'</button>'}
      var rows=NAV.items.map(function(x,i){
        var it=NAVINFO[x.id], pin=!!it.pin;
        return '<div class="navrow'+(x.on?'':' off')+(it.sep?' sep':'')+'"'+(pin?'':' draggable="true"')+' data-i="'+i+'" data-a="navrow-'+x.id+'"><span class="grip" aria-hidden="true">'+(pin?'':'⋮⋮')+'</span><span class="ic">'+IC[it.sep?'sep':x.id]+'</span><span class="lb">'+esc(it.l)+(it.d?'<small>'+esc(it.d)+'</small>':'')+'</span>'+
          (NAV.mode==='double'?'<span class="hv" role="group" aria-label="Barre"><button data-act="navBar" data-i="'+i+'" data-b="h" aria-pressed="'+(x.bar==='h')+'">'+FR[NAV.h]+'</button><button data-act="navBar" data-i="'+i+'" data-b="v" aria-pressed="'+(x.bar==='v')+'">'+FR[NAV.v]+'</button></span>':'<span></span>')+
          '<button class="toggle" role="switch" aria-checked="'+x.on+'" data-act="navOn" data-i="'+i+'" aria-label="Afficher '+esc(it.l)+'"></button>'+
          (pin?'<span class="mv"></span>':'<span class="mv"><button data-act="navUp" data-i="'+i+'" aria-label="Monter"'+(i===0?' disabled':'')+'>↑</button><button data-act="navDown" data-i="'+i+'" aria-label="Descendre"'+(i>=NAV.items.length-2?' disabled':'')+'>↓</button></span>')+'</div>';
      }).join('');
      var orgSum=NAV.mode==='single'?'1 barre · '+FR[NAV.single].toLowerCase():('2 barres '+(J?'reliées':'séparées')+' · '+FR[NAV.h].toLowerCase()+' + '+FR[NAV.v].toLowerCase());
      var orgBody='<div class="grp fbody" data-a="orga-body">'+
        '<div class="setrow"><span><b>Nombre de barres</b><small>Une seule barre, ou deux barres pour répartir les boutons</small></span><span class="chips"><button class="chip" data-act="navCount" data-n="1" aria-pressed="'+(NAV.mode==='single')+'">1 barre</button><button class="chip" data-act="navCount" data-n="2" aria-pressed="'+(NAV.mode==='double')+'">2 barres</button></span></div>'+
        (NAV.mode==='single'
          ?'<p>Le logo (blanc) ouvre l\'accueil. Ton profil (orange) reste en haut à droite.</p><div class="layouts">'+singles.map(function(x){return layBtn({mode:'single',single:x[0]},x[1])}).join('')+'</div>'
          :'<div class="setrow"><span><b>Barres reliées en angle</b><small>'+(J?'Les deux barres se rejoignent dans un coin, par le logo ou ton profil':'Chaque barre reste sur son bord, sans toucher l\'autre')+'</small></span><button class="toggle" role="switch" aria-checked="'+J+'" data-act="navJoin" aria-label="Barres reliées en angle"></button></div>'+
           (J?'<div class="layouts">'+joinedL.map(function(c){return layBtn(c,FR[c.h]+' + '+FR[c.v].toLowerCase(),'jonction : '+(c.junction==='logo'?'logo':'profil'))}).join('')+'</div>'
             :'<p>En haut et en bas, à gauche et à droite, ou sur deux bords voisins sans se toucher. Le logo est sur la première barre.</p><div class="layouts">'+freeL.map(function(c){return layBtn(c,FR[c.h]+' + '+FR[c.v].toLowerCase())}).join('')+'</div>'))+
        '<h3 style="margin-top:8px">Sections</h3><p>Choisis ce qui s\'affiche et dans quel ordre. Glisse une ligne ou utilise les flèches. Tout ce qui suit « Espace flexible » va au bout de la barre ; Réglages reste toujours en dernier.'+(NAV.mode==='double'?' Indique sur quelle barre placer chaque section.':'')+'</p><div class="navlist" id="navlist">'+rows+'</div>'+
        '<div class="row" style="justify-content:flex-start"><button class="btn sm" data-act="navReset">Réinitialiser</button></div></div>';
      body='<div class="grp"><h3>Configurations prêtes</h3><p>Un point de départ en un clic. Tu peux tout modifier ensuite.</p><div class="presets">'+[
          ['minimal','Minimaliste','WeCraft, ReLaunch, WeLive, Créer un WePack, Shop et Réglages.'],
          ['condensed','Condensé','Les mêmes boutons, serrés, sans séparateurs.'],
          ['all','Toutes les features','Toutes les sections à gauche, épingles dans une barre à droite.'],
          ['split','Réparti','Espaces en haut, outils à gauche, barres séparées, épingles à droite.']
        ].map(function(p){var P=PRESETS[p[0]]();return '<button class="preset" data-act="preset" data-p="'+p[0]+'" data-a="preset-'+p[0]+'">'+mini(P.cfg)+'<b>'+p[1]+'</b><small>'+p[2]+'</small></button>'}).join('')+'</div></div>'+
        '<div class="grp" data-a="bar-size"><h3>Taille des barres</h3><p>Épaisseur des barres de navigation et taille de leurs boutons.</p><div class="chips" role="radiogroup" aria-label="Taille des barres">'+Object.keys(BARSIZES).map(function(k){return '<button class="chip" role="radio" data-act="barSize" data-v="'+k+'" aria-checked="'+((NAV.size||'m')===k)+'" aria-pressed="'+((NAV.size||'m')===k)+'">'+BARSIZES[k].l+'</button>'}).join('')+'</div></div>'+
        foldHead('orga','Organisation des barres',orgSum+' · '+NAV.items.filter(function(x){return x.on&&!NAVINFO[x.id].sep&&x.id!=='spacer'}).length+' sections')+(S.fold.orga?'':orgBody)+
        pinMgr();
    } else if(S.setTab==='accueil'){
      body='<div class="grp"><h3>Encarts d\'actualité</h3><p>Les encarts s\'affichent en bas à droite de l\'accueil. Toutes les actualités restent aussi dans Info &amp; News et le menu cloche.</p></div>'+
        '<div class="setrow"><span><b>Encarts affichés en même temps</b><small>1 grand ou jusqu\'à 5 plus petits</small></span><span class="chips">'+[1,2,3,4,5].map(function(k){return '<button class="chip" data-act="carN" data-n="'+k+'" aria-pressed="'+(CAR.n===k)+'">'+k+'</button>'}).join('')+'</span></div>'+
        '<div class="setrow"><span><b>Défilement automatique</b><small>Encarts de l\'accueil et actualité à la une d\'Info &amp; News · pause au survol</small></span><button class="toggle" role="switch" aria-checked="'+CAR.auto+'" data-act="carAuto" aria-label="Défilement automatique"></button></div>'+
        (CAR.auto?'<div class="setrow"><span><b>Vitesse</b><small>Temps passé sur chaque position</small></span><span style="display:flex;align-items:center;gap:10px;min-width:220px"><input type="range" min="3" max="15" step="1" value="'+CAR.speed+'" id="carSpd" aria-label="Vitesse du défilement"><b id="carSpdV" style="font-family:var(--f-mono);min-width:44px;text-align:right">'+CAR.speed+' s</b></span></div>':'')+
        '<div class="grp" style="margin-top:6px"><h3>Démarrage</h3></div>'+'<div class="setrow"><span><b>Bouton « Reprendre »</b><small>Relance la dernière instance ou le dernier serveur</small></span><button class="toggle" role="switch" aria-checked="'+HOME.resume+'" data-act="resumeTgl" aria-label="Bouton Reprendre"></button></div>'+
        '<label class="setrow"><span><b>Ouvrir l\'appli sur</b><small>Page affichée au démarrage</small></span><select id="startSel" aria-label="Page de démarrage">'+[['home','Accueil'],['wecraft','WeCraft'],['relaunch','ReLaunch'],['welive','WeLive']].map(function(x){return '<option value="'+x[0]+'"'+(PREF.start===x[0]?' selected':'')+'>'+x[1]+'</option>'}).join('')+'</select></label>';
    } else if(S.setTab==='jeu'){
      body='<div class="grp"><h3>Mémoire par défaut</h3><div class="setrow"><input type="range" min="2" max="16" step="1" value="'+PREF.ram+'" id="ramR" aria-label="Mémoire allouée"><b id="ramV" style="min-width:52px;text-align:right;font-family:var(--f-mono)">'+PREF.ram+' Go</b></div></div>'+
        '<div class="setrow"><span><b>Java géré automatiquement</b><small>Télécharge la bonne version pour chaque instance</small></span><button class="toggle" role="switch" aria-checked="'+PREF.java+'" data-act="pref" data-k="java" aria-label="Java automatique"></button></div>'+
        '<div class="setrow"><span><b>Dossier de données</b><small>%APPDATA%\\.wecraft</small></span><button class="btn sm" data-act="folder">Ouvrir</button></div>';
    } else if(S.setTab==='comportement'){
      body='<div class="setrow"><span><b>Recliquer sur la section ouverte</b><small>Par exemple, recliquer sur Favoris quand Favoris est déjà affiché</small></span><span class="chips">'+[['back','Page précédente'],['home','Accueil'],['none','Ne rien faire']].map(function(x){return '<button class="chip" data-act="reclickPref" data-v="'+x[0]+'" aria-pressed="'+((PREF.reclick||'back')===x[0])+'">'+x[1]+'</button>'}).join('')+'</span></div>'+
        '<div class="setrow"><span><b>Statut Discord</b><small>Affiche le jeu en cours sur ton profil Discord</small></span><button class="toggle" role="switch" aria-checked="'+PREF.discord+'" data-act="pref" data-k="discord" aria-label="Statut Discord"></button></div>'+
        '<div class="setrow"><span><b>Rouvrir ReLaunch à la fermeture du jeu</b><small>Sinon l\'appli reste réduite</small></span><button class="toggle" role="switch" aria-checked="'+PREF.reopen+'" data-act="pref" data-k="reopen" aria-label="Rouvrir à la fermeture"></button></div>'+
        '<div class="setrow"><span><b>Mises à jour</b><small>Pas encore gérées par cette version</small></span><span></span></div>';
    } else {
      body='<div class="grp"><h3>Compte ReLink</h3><p>Les comptes ReLink ne sont pas encore disponibles.</p></div>';
    }
    function mb(m){return '<button data-settab="'+m[0]+'" aria-current="'+(S.setTab===m[0])+'">'+m[2]+m[1]+'</button>'}
    $('v-settings').innerHTML='<div class="setwin"><div class="setnav"><h4>Affichage</h4>'+menu.slice(0,3).map(mb).join('')+'<h4>Jeu</h4>'+menu.slice(3,5).map(mb).join('')+
      '<h4>Compte</h4>'+mb(menu[5])+'<span class="ver">ReLaunch '+esc(APPVER)+'</span></div><div class="setbody">'+body+'</div></div>';
    if($('pinAdd')) $('pinAdd').addEventListener('change',function(){if(!this.value)return;NAV.pins.push({t:'i',id:this.value});savePins()});
    $('v-settings').querySelectorAll('[data-gname]').forEach(function(inp){inp.addEventListener('input',function(){var g=gById(inp.dataset.gname);if(!g)return;g.name=inp.value.trim()||'Groupe';store('proto-nav5',NAV);renderBars()})});
    if(S.setTab==='apparence') wireWheel();
    if($('carSpd')) $('carSpd').addEventListener('input',function(){CAR.speed=+this.value;$('carSpdV').textContent=this.value+' s';store('proto-car',CAR)});
    if($('startSel')) $('startSel').addEventListener('change',function(){PREF.start=this.value;store('proto-pref2',PREF)});
    if($('ramR')) $('ramR').addEventListener('input',function(){PREF.ram=+this.value;$('ramV').textContent=this.value+' Go';store('proto-pref2',PREF)});
    var nl=$('navlist');
    if(nl){
      var from=null;
      nl.addEventListener('dragstart',function(e){var r=e.target.closest('.navrow');if(!r||!r.draggable)return;from=+r.dataset.i;r.classList.add('drag');try{e.dataTransfer.setData('text/plain',String(from));e.dataTransfer.effectAllowed='move'}catch(_){}});
      nl.addEventListener('dragover',function(e){if(from===null)return;e.preventDefault()});
      nl.addEventListener('drop',function(e){var r=e.target.closest('.navrow');if(from===null||!r)return;e.preventDefault();var to=Math.min(+r.dataset.i,NAV.items.length-2);var f0=from;from=null;moveNav(f0,to)});
      nl.addEventListener('dragend',function(){from=null;nl.querySelectorAll('.drag').forEach(function(x){x.classList.remove('drag')})});
    }
  };

  /* ================= PANNEAU LATÉRAL ================= */
  function mb2(n){return n<10?n.toFixed(1).replace('.',','):Math.round(n)}
  function dlItem(d){
    var pct=Math.round(d.done*100), left=d.st==='active'&&d.speed?Math.max(1,Math.round(d.size*(1-d.done)/d.speed)):0;
    var info=d.st==='done'?'Terminé · '+mb2(d.size)+' Mo':d.st==='queued'?'En attente · '+mb2(d.size)+' Mo':d.st==='paused'?'En pause · '+pct+' %':(pct+' % · '+mb2(d.size*d.done)+' / '+mb2(d.size)+' Mo · '+d.speed.toFixed(1).replace('.',',')+' Mo/s · '+left+' s');
    return '<div class="dl'+(d.st==='paused'?' paused':'')+'" data-dl="'+d.id+'" data-a="dl-'+d.id+'"><div class="row"><span style="display:flex;gap:10px;align-items:center;min-width:0"><span class="cover" style="width:34px;height:34px;flex:none;--c1:'+d.c[0]+';--c2:'+d.c[1]+'"></span><span style="min-width:0"><b>'+esc(d.n)+'</b><small style="display:block">'+esc(d.sub)+'</small></span></span>'+
      '<span class="acts">'+(d.st==='done'?'<button class="ib" data-act="folder" aria-label="Ouvrir le dossier">'+IC.folder.replace('<svg','<svg width="14" height="14"')+'</button>':'<button class="ib" data-act="dlPause" data-id="'+d.id+'" aria-label="'+(d.st==='paused'?'Reprendre':'Mettre en pause')+'">'+(d.st==='paused'?'▶':'❚❚')+'</button><button class="ib" data-act="dlCancel" data-id="'+d.id+'" aria-label="Annuler">✕</button>')+'</span></div>'+
      (d.st==='done'?'':'<div class="pbar"><i style="width:'+pct+'%"></i></div>')+'<small class="dlinfo">'+info+'</small></div>';
  }
  function friendRow(f,req){
    var dc={game:'var(--ok)',live:'#ef4444',online:'var(--ok)',away:'var(--warn)',off:'var(--ink-faint)'}[f.on];
    var acts=req?'<button class="btn sm pri" data-act="frAccept" data-n="'+esc(f.n)+'">Accepter</button><button class="ib" data-act="frDecline" data-n="'+esc(f.n)+'" aria-label="Refuser">✕</button>'
      :(f.join?'<button class="btn sm pri" data-play="'+f.join+'">Rejoindre</button>':'')+(f.on==='live'?'<button class="btn sm" data-go="live">Regarder</button>':'')+
       '<button class="ib" data-act="frMsg" data-n="'+esc(f.n)+'" aria-label="Message à '+esc(f.n)+'">✉</button>'+(f.on!=='off'?'<button class="ib" data-act="frInvite" data-n="'+esc(f.n)+'" aria-label="Inviter '+esc(f.n)+'">+</button>':'');
    return '<div class="fr'+(f.on==='off'?' off':'')+'" data-a="fr-'+slug(f.n)+'"><span class="fa" style="--dc:'+dc+'">'+headHTML(SKINS[f.sk],18)+'</span><span style="min-width:0"><b>'+esc(f.n)+'</b><small>'+esc(f.st)+'</small></span><span class="acts">'+acts+'</span></div>';
  }
  function renderDrawer(){
    var d=$('drawer');
    if(!S.drawer){ d.hidden=true; markNav(); refresh(); return; }
    var T={downloads:['downloads','Téléchargements','Aucun téléchargement en cours.'],friends:['friends','Amis','Les amis arriveront avec les comptes ReLink.'],news:['bell','Nouveautés','Aucune notification pour l\'instant.'],staff:['staff','Menu staff','Pas encore disponible.']}[S.drawer];
    d.hidden=false; d.dataset.a='drawer-'+S.drawer; d.dataset.name=T[1]; d.classList.toggle('staff',S.drawer==='staff');
    d.innerHTML='<header><h3>'+IC[T[0]]+T[1]+'</h3><button class="xbtn" data-act="closeDrawer" aria-label="Fermer">✕</button></header><div class="dbody"><div class="empty">'+T[2]+'</div></div>';
    markNav(); refresh();
  }
  function toggleDrawer(k){ S.drawer=(S.drawer===k)?null:k; renderDrawer(); }
  function updateCounts(){
    var n=DL.filter(function(d){return d.st==='active'||d.st==='queued'}).length;
    document.querySelectorAll('[data-drawer="downloads"]').forEach(function(b){var c=b.querySelector('.cnt'); if(n){ if(!c){c=document.createElement('span');c.className='cnt';b.appendChild(c)} c.textContent=n; } else if(c) c.remove();});
  }

  /* ================= DIFFUSION ================= */
  RENDER.live=function(){ soon('v-live','Diffusion Partenaires','Lives des partenaires','Aucun live pour l\'instant.'); };

  /* ================= INFO & NEWS ================= */
  function lstOf(){return NEWS.filter(function(n){return S.newsF==='Tout'||n.tags.some(function(t){return t[0]===S.newsF})})}
  var newsT=null, newsPaused=false;
  function startNews(){
    clearTimeout(newsT);
    var p=$('nprog'); if(p){p.classList.remove('run');void p.offsetWidth;}
    var L2=lstOf();
    if(!CAR.auto||S.view!=='news'||newsPaused||L2.length<2) return;
    if(p) p.classList.add('run');
    newsT=setTimeout(function(){var i=L2.findIndex(function(n){return n.id===S.newsSel});S.newsSel=L2[(i+1)%L2.length].id;var y=$('main').scrollTop;RENDER.news();$('main').scrollTop=y;refresh()},CAR.speed*1000);
  }
  $('v-news').addEventListener('mouseover',function(e){if(e.target.closest('.nhero')&&!newsPaused){newsPaused=true;clearTimeout(newsT);var p=$('nprog');if(p)p.classList.remove('run')}});
  $('v-news').addEventListener('mouseout',function(e){var h=e.target.closest('.nhero');if(h&&!h.contains(e.relatedTarget)){newsPaused=false;startNews()}});
  RENDER.news=function(){ soon('v-news','Info &amp; News','Actualités et annonces','Aucune actualité pour l\'instant.'); };

  /* ================= FAVORIS ================= */
  RENDER.favorites=function(){
    var f=all().filter(function(x){return x.fav});
    $('v-favorites').innerHTML='<div class="vhead"><div><h2>Favoris</h2><div class="sub">'+f.length+' instances et serveurs épinglés</div></div></div>'+
      (f.length?'<div class="favgrid">'+f.map(function(x){return '<div class="favc" data-a="favc-'+x.id+'"><div class="cover" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'"></div><span class="row"><b>'+esc(x.n)+'</b><button class="star" data-act="fav" data-id="'+x.id+'" aria-pressed="true" aria-label="Retirer des favoris">★</button></span><small>'+esc(detail(x))+'</small><span class="row"><button class="btn sm pri" data-play="'+x.id+'">'+IC.play+(x.k==='rl'?'Rejoindre':'Jouer')+'</button>'+pinBtn(x.id)+'</span></div>'}).join('')+'</div>':'<div class="empty">Aucun favori. Clique sur l\'étoile d\'une instance dans WeCraft pour l\'épingler.</div>');
  };

  /* ================= DÉCOUVRIR ================= */
  RENDER.discover=function(){ soon('v-discover','Découvrir','Modpacks, mods, shaders et serveurs','Le catalogue (Modrinth) arrivera dans une prochaine version.'); };

  /* ================= CRÉER UN WEPACK ================= */
  var CR={step:'choose',name:'',loader:'Fabric',ver:'1.21.4',lv:'Stable',c:['#be185d','#fb7185']};
  var PALS=[['#be185d','#fb7185'],['#1d4ed8','#60a5fa'],['#15803d','#4ade80'],['#7c2d12','#fb923c'],['#6d28d9','#c4b5fd'],['#0f766e','#5eead4']];
  function renderCreate(){
    var m=$('createModal');
    if(CR.step==='choose'){
      m.innerHTML='<header><h3 id="cTitle">Créer un WePack</h3><button class="xbtn" data-act="closeCreate" aria-label="Fermer">✕</button></header><div class="mbody">'+
        '<label class="lbl" for="cSearch">Tu sais déjà à quoi tu veux jouer ?</label><input type="search" id="cSearch" placeholder="Rechercher des mods, modpacks…">'+
        '<span class="or">ou</span><label class="lbl">Choisis le type d\'instance</label>'+
        '<div class="opts3">'+
        '<button class="opt3" data-act="crCustom" data-a="cr-custom"><span class="oi">'+IC.tune+'</span><b>Sur mesure</b><small>Choisis le loader et la version du jeu</small></button>'+
        '<button class="opt3" data-act="crFrom" data-a="cr-from"><span class="oi">'+IC.spark+'</span><b>Depuis un modpack</b><small>Pars d\'un mod ou d\'un modpack existant</small></button>'+
        '<button class="opt3" data-act="crImport" data-a="cr-import"><span class="oi">'+IC.upload+'</span><b>Importer</b><small>Depuis Prism, CurseForge ou un autre launcher</small></button>'+
        '</div></div>';
      $('cSearch').addEventListener('keydown',function(e){if(e.key==='Enter'&&this.value.trim()){S.dQ=this.value.trim();S.dTab='modpacks';closeCreate();show('discover')}});
    } else {
      var name=CR.name||(CR.loader+' '+CR.ver);
      m.innerHTML='<header><h3 id="cTitle">Créer un WePack</h3><button class="xbtn" data-act="closeCreate" aria-label="Fermer">✕</button></header><div class="mbody">'+
        '<div class="iconpick"><span class="cover" style="--c1:'+CR.c[0]+';--c2:'+CR.c[1]+'"><span>'+esc(initials(name)||'W')+'</span></span><span class="col"><button class="btn sm" data-act="crUploadIcon">'+IC.upload+'Téléverser</button><button class="btn sm" data-act="crRand">↻ Aléatoire</button><button class="btn sm" data-act="crRand">'+IC.paint+'Personnaliser</button></span></div>'+
        '<label class="field"><span class="lbl" style="color:var(--ink);font-weight:700;font-size:14px">Nom</span><input type="text" id="crName" placeholder="'+esc(CR.loader+' '+CR.ver)+'" value="'+esc(CR.name)+'"></label>'+
        '<div class="field"><span class="lbl" style="color:var(--ink);font-weight:700;font-size:14px">Loader</span><div class="chips">'+['Vanilla','Fabric','NeoForge','Forge','Quilt'].map(function(l){return '<button class="chip" data-act="crLoader" data-v="'+l+'" aria-pressed="'+(CR.loader===l)+'">'+(CR.loader===l?'✓ ':'')+l+'</button>'}).join('')+'</div></div>'+
        '<label class="field"><span class="lbl" style="color:var(--ink);font-weight:700;font-size:14px">Version du jeu</span><select id="crVer">'+['1.21.4','1.21.1','1.20.1','1.19.2','1.16.5'].map(function(v){return '<option'+(v===CR.ver?' selected':'')+'>'+v+'</option>'}).join('')+'</select></label>'+
        (CR.loader==='Vanilla'?'':'<div class="field"><span class="lbl" style="color:var(--ink);font-weight:700;font-size:14px">Version du loader</span><div class="chips">'+['Stable','Dernière','Autre'].map(function(l){return '<button class="chip" data-act="crLv" data-v="'+l+'" aria-pressed="'+(CR.lv===l)+'">'+(CR.lv===l?'✓ ':'')+l+'</button>'}).join('')+'</div></div>')+
        '</div><div class="mfoot"><button class="btn" data-act="crBack">← Retour</button><button class="btn pri" data-act="crCreate">+ Créer l\'instance</button></div>';
      $('crName').addEventListener('input',function(){CR.name=this.value;var c=m.querySelector('.iconpick .cover span');c.textContent=initials(this.value||CR.loader+' '+CR.ver)||'W'});
      $('crVer').addEventListener('change',function(){CR.ver=this.value;$('crName').placeholder=CR.loader+' '+CR.ver});
    }
    refresh();
  }
  function openCreate(){CR={step:'choose',name:'',loader:'Fabric',ver:'1.21.4',lv:'Stable',c:PALS[0]};renderCreate();$('createOv').hidden=false;setTimeout(function(){var s=$('cSearch');if(s&&!dev)s.focus()},30)}
  function closeCreate(){$('createOv').hidden=true;refresh()}

  /* ---------- Actions (délégation) ---------- */
  appRoot.addEventListener('click',function(e){
    var t=e.target;
    if(S.pop&&!t.closest('#pop')&&!t.closest('[data-popbtn]')){S.pop=null;renderPop()}
    if(S.drawer&&!t.closest('#drawer')&&!t.closest('[data-drawer]')&&!t.closest('[data-act="openStaff"]')){S.drawer=null;renderDrawer()}
    var go=t.closest('[data-go]'); if(go){ if(go.closest('#bars')&&go.getAttribute('aria-current')==='page'){ reclick(); return; } var o={}; if(go.dataset.rl) o.rlTab=go.dataset.rl; else if(go.dataset.go==='relink'&&S.rlTab==='shop') o.rlTab='profil'; if(go.dataset.set) o.setTab=go.dataset.set; show(go.dataset.go,o); return; }
    var pl=t.closest('[data-play]'); if(pl){ launch(pl.dataset.play); return; }
    var st=t.closest('[data-settab]'); if(st){ S.setTab=st.dataset.settab; RENDER.settings(); refresh(); return; }
    var sk=t.closest('[data-skin-i]'); if(sk){ S.skin=+sk.dataset.skinI; try{localStorage.setItem('proto-skinsel',S.skin)}catch(_){} renderBars(); RENDER.relink(); refresh(); return; }
    var th=t.closest('[data-theme]'); if(th){ setSkin(th.dataset.theme); RENDER.settings(); return; }
    var ly=t.closest('[data-lay]'); if(ly){ var c=JSON.parse(ly.dataset.lay); var before=snapPos(); Object.keys(c).forEach(function(k){NAV[k]=c[k]}); saveNav(); return; }
    var ins=t.closest('[data-inst]'); if(ins){ var k=ins.dataset.inst; S.installed[k]=!S.installed[k]; RENDER.discover(); toast(S.installed[k]?'Ajouté à une nouvelle instance':'Retiré'); refresh(); return; }
    var nw=t.closest('[data-news]'); if(nw){ if(S.drawer==='news'){S.drawer=null;renderDrawer()} openNews(nw.dataset.news); $('main').scrollTop=0; return; }
    var lv=t.closest('[data-live]'); if(lv){ S.liveSel=lv.dataset.live; RENDER.live(); $('main').scrollTop=0; refresh(); return; }
    var a=t.closest('[data-act]'); if(!a) return;
    var act=a.dataset.act, i=+a.dataset.i, x;
    switch(act){
      case 'create': toast('Création d\'instance pas encore disponible dans cette version.'); break;
      case 'noInst': toast('Aucune instance à lancer pour l\'instant.'); break;
      case 'newsStep': var L3=lstOf(), ci=L3.findIndex(function(n){return n.id===S.newsSel}); S.newsSel=L3[(ci+(+a.dataset.d)+L3.length)%L3.length].id; RENDER.news(); refresh(); break;
      case 'reclickPref': PREF.reclick=a.dataset.v; store('proto-pref2',PREF); RENDER.settings(); break;
      case 'openStaff': S.drawer='staff'; renderDrawer(); break;
      case 'repDone': REPORTS=REPORTS.filter(function(r){return r.id!==a.dataset.id}); renderBars(); renderDrawer(); toast('Signalement classé'); break;
      case 'repOpen': var rp=REPORTS.find(function(r){return r.id===a.dataset.id}); toast('Dossier de '+rp.who+' : historique, preuves, sanctions'); break;
      case 'staffAct': toast({sAnnounce:'Rédaction d\'une annonce en jeu',sNews:'Éditeur d\'actualité : type d\'encart, image, texte, date',sEvent:'Gestion des events',sSanction:'Recherche d\'un joueur à sanctionner',sPack:'Publication d\'une nouvelle version de modpack',sLogs:'Journaux du staff',sSrv:'Console du serveur',sPanel:'Ouverture du panel web dans le navigateur'}[a.dataset.k]); break;
      case 'newsGo': goNews(a.dataset.id); break;
      case 'carPrev': carSet(S.car-1); break;
      case 'carNext': carSet(S.car+1); break;
      case 'carGo': carSet(+a.dataset.i); break;
      case 'carN': CAR.n=+a.dataset.n; S.car=0; store('proto-car',CAR); RENDER.settings(); break;
      case 'carAuto': CAR.auto=!CAR.auto; store('proto-car',CAR); RENDER.settings(); break;
      case 'readAll': NEWS.forEach(function(n){n.unread=false}); if(S.drawer==='news') NOTIFS=[]; renderBars(); if(S.drawer) renderDrawer(); if(S.view==='news') RENDER.news(); break;
      case 'notifGo': var nf=NOTIFS[+a.dataset.i]; if(nf.act){S.drawer=nf.act;renderDrawer()}else{S.drawer=null;renderDrawer();show(nf.go)} break;
      case 'drawer': toggleDrawer(a.dataset.drawer); break;
      case 'closeDrawer': S.drawer=null; renderDrawer(); break;
      case 'pin': togglePin(a.dataset.id); break;
      case 'openGroup': if(S.pop&&S.pop.gid===a.dataset.gid){S.pop=null}else{S.pop={kind:'group',gid:a.dataset.gid};S.popAnchor=a.dataset.a} renderPop(); break;
      case 'openSection': if(S.pop&&S.pop.kind==='section'){S.pop=null}else{S.pop={kind:'section'};S.popAnchor='nav-pins'} renderPop(); break;
      case 'openGroupIn': S.pop={kind:'group',gid:a.dataset.gid,back:true}; renderPop(); break;
      case 'popBack': S.pop={kind:'section'}; renderPop(); break;
      case 'closePop': S.pop=null; renderPop(); break;
      case 'ungroup': pullRaw(a.dataset.id); NAV.pins.push({t:'i',id:a.dataset.id}); savePins(); break;
      case 'dissolve': var dg=gById(a.dataset.gid), di=NAV.pins.indexOf(dg); NAV.pins.splice.apply(NAV.pins,[di,1].concat(dg.items.map(function(id){return {t:'i',id:id}}))); if(S.pop&&S.pop.gid===dg.id) S.pop=null; savePins(); break;
      case 'bgMode': PREF.bg=a.dataset.v; store('proto-pref2',PREF); applyBg(); RENDER.settings(); break;
      case 'wheelReset': PREF.custom={h:330,s:80,l:60}; setSkin('custom'); RENDER.settings(); break;
      case 'style': PREF.style=a.dataset.v; store('proto-pref2',PREF); applyStyle(); RENDER.settings(); toast(PREF.style==='lg'?'Style Liquid Glass activé':'Style standard activé'); break;
      case 'pinMode': NAV.pinMode=a.dataset.m; S.pop=null; saveNav(); renderPop(); break;
      case 'dockSide': NAV.dock.side=a.dataset.s; saveNav(); break;
      case 'dockAlign': NAV.dock.align=a.dataset.al; saveNav(); break;
      case 'dlPause': x=DL.find(function(d){return d.id===a.dataset.id}); x.st=x.st==='paused'?'active':'paused'; renderDrawer(); break;
      case 'dlCancel': DL=DL.filter(function(d){return d.id!==a.dataset.id}); renderDrawer(); updateCounts(); break;
      case 'dlPauseAll': var anyA=DL.some(function(d){return d.st==='active'}); DL.forEach(function(d){ if(anyA&&d.st==='active') d.st='paused'; else if(!anyA&&d.st==='paused') d.st='active'; }); renderDrawer(); break;
      case 'dlClear': DL=DL.filter(function(d){return d.st!=='done'}); renderDrawer(); break;
      case 'frAccept': var rq=REQS.findIndex(function(r){return r.n===a.dataset.n}); var r0=REQS.splice(rq,1)[0]; FRIENDS.splice(3,0,{n:r0.n,on:'online',st:'En ligne',sk:r0.sk}); renderDrawer(); toast(r0.n+' est maintenant ton ami'); break;
      case 'frDecline': REQS=REQS.filter(function(r){return r.n!==a.dataset.n}); renderDrawer(); break;
      case 'closeCreate': closeCreate(); break;
      case 'crCustom': CR.step='custom'; renderCreate(); break;
      case 'crBack': CR.step='choose'; renderCreate(); break;
      case 'crFrom': closeCreate(); S.dTab='modpacks'; show('discover'); break;
      case 'crRand': CR.c=PALS[(PALS.indexOf(CR.c)+1)%PALS.length]; renderCreate(); break;
      case 'crLoader': CR.loader=a.dataset.v; renderCreate(); break;
      case 'crLv': CR.lv=a.dataset.v; renderCreate(); break;
      case 'closeShot': $('shotOv').hidden=true; refresh(); break;
      case 'fav': x=byId(a.dataset.id); x.fav=!x.fav; RENDER[S.view](); refresh(); break;
      case 'del': S.delId=a.dataset.id; $('delName').textContent=byId(S.delId).n; $('delBox').hidden=false; refresh(); break;
      case 'delNo': $('delBox').hidden=true; refresh(); break;
      case 'navOn': NAV.items[i].on=!NAV.items[i].on; saveNav(); break;
      case 'navUp': moveNav(i,i-1); break;
      case 'navDown': moveNav(i,i+1); break;
      case 'navCount':
        if(a.dataset.n==='1'){ NAV.mode='single'; NAV.single=NAV.single||'left'; }
        else { NAV.mode='double'; if(NAV.joined!==false&&!(['top','bottom'].indexOf(NAV.h)>-1&&['left','right'].indexOf(NAV.v)>-1)){NAV.h='top';NAV.v='left';NAV.junction='logo'} }
        saveNav(); break;
      case 'navJoin':
        NAV.joined=(NAV.joined===false);
        if(NAV.joined&&!(['top','bottom'].indexOf(NAV.h)>-1&&['left','right'].indexOf(NAV.v)>-1)){NAV.h='top';NAV.v='left';NAV.junction='logo'}
        saveNav(); break;
      case 'fold': S.fold[a.dataset.k]=!S.fold[a.dataset.k]; RENDER.settings(); break;
      case 'preset': applyPreset(a.dataset.p); break;
      case 'navBar': NAV.items[i].bar=a.dataset.b; saveNav(); break;
      case 'navReset': NAV=clone(NAVDEF); saveNav(); break;
      case 'barSize': if(BARSIZES[a.dataset.v]){ NAV.size=a.dataset.v; saveNav(); } break;
      case 'rlTab': S.rlTab=a.dataset.t; RENDER.relink(); refresh(); break;
      case 'resumeTgl': HOME.resume=!HOME.resume; store('proto-home3',HOME); a.setAttribute('aria-checked',String(HOME.resume)); break;
      case 'pref': PREF[a.dataset.k]=!PREF[a.dataset.k]; store('proto-pref2',PREF); a.setAttribute('aria-checked',String(PREF[a.dataset.k])); break;
      case 'tgl': a.setAttribute('aria-checked',String(a.getAttribute('aria-checked')!=='true')); break;
      default: toast('Pas encore disponible dans cette version.');
    }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!dev&&S.pop){ S.pop=null; renderPop(); return; } if(e.key==='Escape'&&!dev&&S.drawer){ S.drawer=null; renderDrawer(); return; } if(e.key==='Escape'&&!dev){ if(!$('createOv').hidden) closeCreate(); if(!$('shotOv').hidden){$('shotOv').hidden=true;refresh()} } });
  $('createOv').addEventListener('click',function(e){if(e.target===this&&!dev)closeCreate()});
  $('shotOv').addEventListener('click',function(e){if(e.target===this&&!dev){this.hidden=true;refresh()}});

  /* [WeCraft] Mode développeur, annotations et boutons « Vue premium / staff » de la page de
     démonstration retirés (outils de la maquette). */
  var dev=false;
  function refresh(){}
  window.addEventListener('resize',function(){renderBars()});

  /* ---------- Démarrage ---------- */
  setSkin(PREF.skin);
  applyStyle(true);
  normPins();
  try{var ss=+localStorage.getItem('proto-skinsel');if(ss>=0&&ss<SKINS.length)S.skin=ss}catch(e){}
  renderBars();
  var vw=PREF.start||'home';
  try{vw=localStorage.getItem('proto-view2')||vw}catch(e){}
  show(vw);
  appRoot.classList.toggle('staffon',STAFF);
  applyBg();
})();
