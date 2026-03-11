'use strict';

// ─── Globals ─────────────────────────────────────────────
let socket, myId, myTeam;
let scene, camera, renderer, clock;
let yaw = 0, pitch = 0;
let pointerLocked = false;
const SENSITIVITY = 0.002;

const PLAYER_HEIGHT = 1.7;
const SPEED = 8;
const GRAVITY = -25;
let velY = 0, onGround = true;
const keys = {};

const WEAPONS_DATA = {};
let phase = 'waiting', roundTimer = 0;
let alive = true, health = 100, armor = 0, money = 800;
let currentWeapon = 'usp', ammoMap = {}, myWeapons = [];
let myX = 0, myY = 0, myZ = 0;

const remoteEntities = {};
let showBuyMenu = false, showScoreboard = false, showBotMenu = false, chatOpen = false;
let selectedTeam = 'ct';

// Weapon viewmodel (simple group on camera)
let gunGroup = null;
let bobT = 0;
let isShooting = false, lastShotTime = 0;

// ─── MENU ────────────────────────────────────────────────
function selectTeam(t) {
  selectedTeam = t;
  document.getElementById('btnCT').className = 'team-btn' + (t==='ct'?' active ct':'');
  document.getElementById('btnT').className  = 'team-btn' + (t==='t' ?' active t' :'');
}
selectTeam('ct');

function connectToGame() {
  var name = (document.getElementById('playerName').value||'').trim()||'Player';
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';
  simulateLoading(function() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    initGame();
    initSocket(name, selectedTeam);
  });
}

function simulateLoading(cb) {
  var bar = document.getElementById('loadingBar');
  var txt = document.getElementById('loadingText');
  var steps = [[15,'Loading...'],[40,'Building map...'],[70,'Connecting...'],[100,'Ready!']];
  var i = 0;
  function go() {
    if (i >= steps.length) { setTimeout(cb, 200); return; }
    bar.style.width = steps[i][0]+'%';
    txt.textContent  = steps[i][1];
    i++; setTimeout(go, 300);
  }
  go();
}

// ─── INIT ────────────────────────────────────────────────
function initGame() {
  clock = new THREE.Clock();

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 60, 300);

  // Camera — simple, no nesting
  camera = new THREE.PerspectiveCamera(90, innerWidth/innerHeight, 0.05, 500);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gameCanvas'),
    antialias: false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);

  MAP.init(scene);
  buildGun();
  initPointerLock();
  initInput();

  window.addEventListener('resize', function() {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  setInterval(function() {
    document.getElementById('roundTimer').textContent = fmtTime(roundTimer);
  }, 500);

  loop();
}

// ─── GUN MODEL (attached to camera) ──────────────────────
function buildGun() {
  if (gunGroup) camera.remove(gunGroup);
  gunGroup = new THREE.Group();

  var dark = new THREE.MeshBasicMaterial({color:0x222222});
  var wood = new THREE.MeshBasicMaterial({color:0x6B3A1F});
  var grey = new THREE.MeshBasicMaterial({color:0x444444});

  function b(w,h,d,mat,x,y,z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); gunGroup.add(m);
  }

  b(0.06, 0.08, 0.35, dark,  0,    0,    -0.2);  // body
  b(0.05, 0.12, 0.05, wood,  0,   -0.09,  0.0);  // grip
  b(0.04, 0.12, 0.04, dark,  0,   -0.10, -0.14); // mag
  b(0.03, 0.03, 0.20, grey,  0,    0.04, -0.32); // barrel

  // position bottom-right like CS
  gunGroup.position.set(0.18, -0.15, -0.05);

  camera.add(gunGroup);
  scene.add(camera); // must add camera to scene for children to render
}

// ─── POINTER LOCK ────────────────────────────────────────
function initPointerLock() {
  var canvas = renderer.domElement;

  var overlay = document.createElement('div');
  overlay.id = 'pointerLockOverlay';
  overlay.innerHTML = '<div class="click-to-play">CLICK TO PLAY<small>ESC to pause</small></div>';
  document.getElementById('gameContainer').appendChild(overlay);
  overlay.addEventListener('click', function() { canvas.requestPointerLock(); });

  document.addEventListener('pointerlockchange', function() {
    pointerLocked = document.pointerLockElement === canvas;
    overlay.style.display = pointerLocked ? 'none' : 'flex';
  });

  // ── THE FIX: apply mouse directly, reset accumulation each frame ──
  document.addEventListener('mousemove', function(e) {
    if (!pointerLocked) return;
    // hard clamp to prevent insane jumps
    var dx = Math.max(-20, Math.min(20, e.movementX));
    var dy = Math.max(-20, Math.min(20, e.movementY));
    yaw   -= dx * SENSITIVITY;
    pitch -= dy * SENSITIVITY;
    // clamp pitch so you can't flip upside down
    pitch = Math.max(-Math.PI*0.45, Math.min(Math.PI*0.45, pitch));
    applyLook();
  });
}

// Apply yaw and pitch to camera with EULER YXZ — the only correct FPS way
function applyLook() {
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0; // always zero, prevents roll
}

// ─── INPUT ───────────────────────────────────────────────
function initInput() {
  document.addEventListener('keydown', function(e) {
    if (chatOpen) {
      if (e.key==='Enter') sendChat();
      if (e.key==='Escape') closeChatInput();
      return;
    }
    keys[e.code] = true;
    switch(e.code) {
      case 'KeyB': if(phase==='freeze') toggleBuyMenu(); break;
      case 'Escape': if(showBuyMenu) closeBuyMenu(); if(showBotMenu) toggleBotMenu(); break;
      case 'Tab': e.preventDefault(); showScoreboard=true; document.getElementById('scoreboard').style.display='block'; break;
      case 'KeyO': toggleBotMenu(); break;
      case 'KeyT': openChatInput(); break;
      case 'KeyR': reloadGun(); break;
      case 'KeyF': tryBombAction(); break;
      case 'Digit1': switchGun(0); break;
      case 'Digit2': switchGun(1); break;
      case 'Digit3': switchGun(2); break;
    }
  });
  document.addEventListener('keyup', function(e) {
    keys[e.code] = false;
    if (e.code==='Tab') { showScoreboard=false; document.getElementById('scoreboard').style.display='none'; }
  });

  var si = null;
  document.addEventListener('mousedown', function(e) {
    if (e.button!==0||!pointerLocked||showBuyMenu||chatOpen) return;
    shoot(); si = setInterval(shoot, 100);
  });
  document.addEventListener('mouseup', function(e) {
    if (e.button===0) { clearInterval(si); si=null; }
  });
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

// ─── GAME LOOP ───────────────────────────────────────────
var _netT = 0;
function loop() {
  requestAnimationFrame(loop);
  var dt = Math.min(clock.getDelta(), 0.05);

  if (alive && phase !== 'freeze') {
    move(dt);
    _netT += dt;
    if (_netT > 0.05 && socket) {
      _netT = 0;
      socket.emit('playerMove', {x:myX, y:myY, z:myZ, yaw:yaw, pitch:pitch});
    }
  }

  animGun(dt);
  renderer.render(scene, camera);
}

// ─── MOVEMENT ────────────────────────────────────────────
function move(dt) {
  var spd = SPEED * (keys['ShiftLeft'] ? 0.55 : 1);
  var fx=0, fz=0;
  if (keys['KeyW']||keys['ArrowUp'])    fz -= 1;
  if (keys['KeyS']||keys['ArrowDown'])  fz += 1;
  if (keys['KeyA']||keys['ArrowLeft'])  fx -= 1;
  if (keys['KeyD']||keys['ArrowRight']) fx += 1;

  if (fx||fz) {
    var l = Math.sqrt(fx*fx+fz*fz); fx/=l; fz/=l;
    var cy=Math.cos(yaw), sy=Math.sin(yaw);
    var wx = cy*fx + sy*fz;
    var wz =-sy*fx + cy*fz;
    var nx=myX+wx*spd*dt, nz=myZ+wz*spd*dt;
    if (!MAP.checkCollision(nx, myY, myZ)) myX=nx;
    if (!MAP.checkCollision(myX, myY, nz)) myZ=nz;
  }

  if (keys['Space'] && onGround) { velY=7; onGround=false; }
  velY += GRAVITY*dt;
  var ny = myY + velY*dt;
  if (ny <= 0) { ny=0; velY=0; onGround=true; }
  else onGround = false;
  myY = ny;

  camera.position.set(myX, myY+PLAYER_HEIGHT, myZ);
}

// ─── GUN ANIMATION ───────────────────────────────────────
function animGun(dt) {
  if (!gunGroup) return;
  var moving = keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD'];
  bobT += dt * (moving ? 8 : 2);
  var bx = Math.sin(bobT) * (moving ? 0.008 : 0.002);
  var by = Math.abs(Math.cos(bobT)) * (moving ? 0.006 : 0.001);
  var rz = isShooting ? 0.03 : 0;
  gunGroup.position.set(0.18+bx, -0.15+by, -0.05+rz);
}

// ─── SHOOTING ────────────────────────────────────────────
function shoot() {
  if (!alive||phase!=='live'||!socket) return;
  var wd = WEAPONS_DATA[currentWeapon]; if(!wd) return;
  var now = Date.now();
  if (now-lastShotTime < wd.fireRate) return;
  lastShotTime = now;

  var wa = ammoMap[currentWeapon];
  if (wa&&wa.ammo<=0) { reloadGun(); return; }
  if (wa) { wa.ammo=Math.max(0,wa.ammo-1); updateHUD(); }

  isShooting=true; setTimeout(function(){isShooting=false;},80);
  pitch -= 0.015 * (wd.recoil||1) * 0.1;
  pitch = Math.max(-Math.PI*0.45, Math.min(Math.PI*0.45, pitch));
  applyLook();

  playShot(currentWeapon);

  var ray = new THREE.Raycaster();
  var spread = (wd.recoil||1)*0.002;
  var dir = new THREE.Vector3(
    (Math.random()-0.5)*spread,
    (Math.random()-0.5)*spread,
    -1
  ).normalize();
  // rotate dir by camera world quaternion
  var q = new THREE.Quaternion();
  camera.getWorldQuaternion(q);
  dir.applyQuaternion(q);

  var camWorldPos = new THREE.Vector3();
  camera.getWorldPosition(camWorldPos);
  ray.set(camWorldPos, dir);

  var targets = [];
  Object.keys(remoteEntities).forEach(function(id) {
    var ent = remoteEntities[id];
    if (!ent.mesh.visible || ent.data.team===myTeam) return;
    ent.mesh.traverse(function(child) {
      if (child.isMesh) {
        child.userData.eid = id;
        child.userData.head = child.position.y > 1.1;
        targets.push(child);
      }
    });
  });

  var hits = ray.intersectObjects(targets);
  var hitId=null, hitPart='body';
  if (hits.length>0) {
    hitId = hits[0].object.userData.eid;
    hitPart = hits[0].object.userData.head ? 'head' : 'body';
    flashHit();
  }
  socket.emit('shoot', {hitId:hitId, hitPart:hitPart});
}

function reloadGun() {
  var wa=ammoMap[currentWeapon]; if(!wa) return;
  var wd=WEAPONS_DATA[currentWeapon];
  var need=(wd?wd.ammo:30)-wa.ammo;
  var take=Math.min(need,wa.reserve||0);
  wa.ammo+=take; wa.reserve-=take; updateHUD();
}

function switchGun(i) {
  if (myWeapons[i]&&myWeapons[i]!==currentWeapon) {
    currentWeapon=myWeapons[i];
    socket&&socket.emit('switchWeapon',{weapon:currentWeapon});
    updateHUD();
  }
}

// ─── BOMB ────────────────────────────────────────────────
function tryBombAction() {
  if (!socket||phase!=='live') return;
  if (myTeam==='t') { var s=MAP.nearBombSite(myX,myZ); if(s) socket.emit('plantBomb',{site:s,x:myX,z:myZ}); }
  else socket.emit('defuseBomb');
}

// ─── REMOTE PLAYERS ──────────────────────────────────────
function addEnt(id, data, isBot) {
  if (remoteEntities[id]) return;
  var mesh = makeChar(data.team);
  mesh.position.set(data.x||0, data.y||0, data.z||0);
  mesh.visible = !!data.alive;
  scene.add(mesh);
  remoteEntities[id] = {mesh:mesh, data:data, isBot:isBot};
}
function removeEnt(id) {
  if (remoteEntities[id]) { scene.remove(remoteEntities[id].mesh); delete remoteEntities[id]; }
}
function makeChar(team) {
  var g = new THREE.Group();
  var tc = team==='ct' ? 0x1a4480 : 0x8a3010;
  function b(w,h,d,col,x,y,z) {
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:col}));
    m.position.set(x,y,z); g.add(m);
  }
  b(0.58,0.72,0.28,tc,       0,1.02,0);
  b(0.36,0.36,0.30,0xd4a870, 0,1.58,0);
  b(0.40,0.18,0.32,team==='ct'?0x0a2a5a:0x3a1a00, 0,1.76,0);
  b(0.24,0.68,0.26,tc,      -0.18,0.32,0);
  b(0.24,0.68,0.26,tc,       0.18,0.32,0);
  b(0.055,0.08,0.28,0x222222, 0.38,0.95,-0.16);
  return g;
}

// ─── SOCKET ──────────────────────────────────────────────
function initSocket(name, team) {
  socket = io();
  myTeam = team;
  socket.on('connect', function() { myId=socket.id; socket.emit('joinGame',{name:name,team:team}); });

  socket.on('joined', function(d) {
    myId=d.id; Object.assign(WEAPONS_DATA,d.weapons);
    applyMe(d.player);
    if (d.gameState) {
      Object.entries(d.gameState.players||{}).forEach(function(e){ if(e[0]!==myId) addEnt(e[0],e[1],false); });
      Object.entries(d.gameState.bots||{}).forEach(function(e){ addEnt(e[0],e[1],true); });
    }
    updateBuyMenu(); updateHUD();
  });

  socket.on('joinError', function(m) {
    document.getElementById('gameContainer').style.display='none';
    document.getElementById('mainMenu').style.display='flex';
    document.getElementById('connectError').textContent=m;
  });

  socket.on('playerJoined', function(d){ if(d.id!==myId) addEnt(d.id,d.player,false); });
  socket.on('playerLeft',   function(d){ removeEnt(d.id); sysMsg(d.name+' left'); });
  socket.on('botAdded',     function(d){ addEnt(d.bot.id,d.bot,true); });
  socket.on('botRemoved',   function(d){ removeEnt(d.id); });

  socket.on('playerMoved', function(d) {
    var e=remoteEntities[d.id]; if(!e) return;
    e.mesh.position.set(d.x,d.y,d.z); e.mesh.rotation.y=d.yaw||0;
  });

  socket.on('takeDamage', function(d) { health=d.health; armor=d.armor; redFlash(); updateHUD(); });

  socket.on('playerKilled', function(d) {
    killFeedAdd((d.attacker?eName(d.attacker):'World')+' ➜ '+eName(d.victim)+' ['+d.weapon+']');
    if (d.victim===myId) { alive=false; health=0; document.getElementById('deadOverlay').style.display='flex'; updateHUD(); }
    var e=remoteEntities[d.victim]; if(e) e.mesh.visible=false;
  });

  socket.on('roundStart', function(d) {
    document.getElementById('deadOverlay').style.display='none';
    document.getElementById('roundBanner').style.display='none';
    document.getElementById('roundInfo').textContent='ROUND '+d.round;
    closeBuyMenu(); alive=true;
    Object.values(remoteEntities).forEach(function(e){ e.mesh.visible=true; });
    updateHUD();
  });

  socket.on('roundEnd', function(d) {
    var l={ct:'COUNTER-TERRORISTS WIN!',t:'TERRORISTS WIN!'};
    var r={elim:'All enemies eliminated',time:'Time ran out',defuse:'Bomb defused',bomb_explode:'Bomb exploded!'};
    document.getElementById('bannerText').textContent=l[d.winner];
    document.getElementById('bannerReason').textContent=r[d.reason]||'';
    document.getElementById('roundBanner').style.display='block';
    document.getElementById('scoreT').textContent=d.score.t;
    document.getElementById('scoreCT').textContent=d.score.ct;
  });

  socket.on('gameState', function(gs) {
    phase=gs.phase; roundTimer=gs.roundTimer;
    var pl={waiting:'WAITING',freeze:'FREEZE TIME',live:'LIVE',roundEnd:'ROUND END'};
    document.getElementById('phaseLabel').textContent=pl[phase]||phase;
    var bomb=gs.bomb, bi=document.getElementById('bombIndicator');
    if(bomb&&bomb.planted&&!bomb.defused&&!bomb.exploded){
      bi.style.display='block';
      document.getElementById('bombTimer').textContent=bomb.timer;
      document.getElementById('bombSite').textContent='SITE '+(bomb.site||'?');
    } else bi.style.display='none';
    syncAll(gs.players,false); syncAll(gs.bots,true);
    updateSB(gs.players,gs.bots);
  });

  socket.on('weaponBought', function(d) {
    money=d.money; ammoMap=d.ammo; currentWeapon=d.weapon;
    if(!myWeapons.includes(d.weapon)) myWeapons.push(d.weapon);
    updateHUD(); updateBuyMenu();
  });
  socket.on('buyError',     function(m){ sysMsg(m); });
  socket.on('bombPlanted',  function(d){ sysMsg('★ '+d.planter+' planted at '+d.site+'!'); });
  socket.on('bombDefusing', function(d){ sysMsg(d.defuser+' defusing...'); });
  socket.on('killFeed',     function(d){ sysMsg('★ You killed '+d.victim+(d.headshot?' [HS]':'')+'!'); });
  socket.on('chatMessage',  function(d){ chatAdd(d.name,d.team,d.msg); });
  socket.on('matchEnd',     function(d){ sysMsg('MATCH END — '+d.winner.toUpperCase()+' wins!'); });
  socket.on('playerShot',   function(){ playDistant(); });
  socket.on('botShoot',     function(){ playDistant(); });
}

function applyMe(p) {
  myX=p.x; myY=p.y; myZ=p.z;
  camera.position.set(myX, myY+PLAYER_HEIGHT, myZ);
  yaw=p.yaw||0; pitch=0; applyLook();
  alive=p.alive; health=p.health; armor=p.armor;
  myWeapons=p.weapons||[]; currentWeapon=p.currentWeapon;
  ammoMap=p.ammo||{}; money=p.money;
}

function syncAll(map, isBot) {
  if (!map) return;
  Object.entries(map).forEach(function(entry) {
    var id=entry[0], p=entry[1];
    if (id===myId) {
      money=p.money; myWeapons=p.weapons||[]; currentWeapon=p.currentWeapon;
      ammoMap=p.ammo||ammoMap; health=p.health; armor=p.armor; alive=p.alive;
      updateHUD(); return;
    }
    var e=remoteEntities[id];
    if(e){ e.mesh.position.set(p.x,p.y,p.z); e.mesh.rotation.y=p.yaw||0; e.mesh.visible=!!p.alive; e.data=p; }
    else addEnt(id,p,isBot);
  });
}

function eName(id) {
  if(id===myId) return 'You';
  return (remoteEntities[id]&&remoteEntities[id].data&&remoteEntities[id].data.name)||'Player';
}

// ─── CHAT ────────────────────────────────────────────────
function openChatInput() {
  chatOpen=true; document.getElementById('chatInputWrap').style.display='flex';
  document.getElementById('chatInput').focus();
  if(pointerLocked) document.exitPointerLock();
}
function closeChatInput() { chatOpen=false; document.getElementById('chatInputWrap').style.display='none'; document.getElementById('chatInput').value=''; }
function sendChat() { var m=document.getElementById('chatInput').value.trim(); if(m) socket&&socket.emit('chatMessage',{msg:m}); closeChatInput(); }
function chatAdd(name,team,msg) {
  var d=document.createElement('div'); d.className='chat-msg '+team;
  d.innerHTML=(name?'<span class="chat-name">'+name+':</span> ':'')+msg;
  document.getElementById('chatMessages').appendChild(d);
  setTimeout(function(){d.remove();},8000);
}
function sysMsg(m) { chatAdd('','sys',m); }

// ─── BOT / BUY ───────────────────────────────────────────
function toggleBotMenu() { showBotMenu=!showBotMenu; document.getElementById('botMenu').style.display=showBotMenu?'block':'none'; if(showBotMenu&&pointerLocked) document.exitPointerLock(); }
function addBot(team){ socket&&socket.emit('addBot',{team:team}); }
function toggleBuyMenu() { showBuyMenu=!showBuyMenu; document.getElementById('buyMenu').style.display=showBuyMenu?'block':'none'; if(showBuyMenu&&pointerLocked) document.exitPointerLock(); }
function closeBuyMenu() { showBuyMenu=false; document.getElementById('buyMenu').style.display='none'; }
function updateBuyMenu() {
  document.getElementById('buyMoney').textContent=money;
  var grid=document.getElementById('buyGrid'); grid.innerHTML='';
  Object.entries(WEAPONS_DATA).forEach(function(e) {
    var key=e[0],w=e[1];
    if(w.price===0) return;
    if(w.team!=='any'&&w.team!==myTeam) return;
    var div=document.createElement('div');
    div.className='buy-item'+(money<w.price?' cant-afford':'');
    div.innerHTML='<div class="w-name">'+w.name+'</div><div class="w-price">$'+w.price+'</div>';
    div.onclick=function(){ socket&&socket.emit('buyWeapon',{weapon:key}); closeBuyMenu(); };
    grid.appendChild(div);
  });
}

// ─── SCOREBOARD ──────────────────────────────────────────
function updateSB(players, bots) {
  if(!showScoreboard) return;
  var all=Object.assign({},players,bots), ct=[], t=[];
  Object.entries(all).forEach(function(e){ (e[1].team==='ct'?ct:t).push(Object.assign({id:e[0]},e[1])); });
  function render(arr,elId) {
    var el=document.getElementById(elId), hdr=el.querySelector('.sb-team-header');
    el.innerHTML=''; el.appendChild(hdr);
    arr.forEach(function(p){
      var d=document.createElement('div'); d.className='sb-player'+(p.id===myId?' is-me':'');
      d.innerHTML='<span class="p-name">'+(p.name||'Bot')+'</span><span class="p-kills">'+(p.kills||0)+'K</span><span class="p-deaths">'+(p.deaths||0)+'D</span>';
      el.appendChild(d);
    });
  }
  render(ct,'sbCT'); render(t,'sbT');
}

// ─── HUD ─────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hudHealth').textContent=Math.max(0,Math.floor(health));
  document.getElementById('hudArmor').textContent=Math.floor(armor);
  document.getElementById('hudMoney').textContent=money;
  var wd=WEAPONS_DATA[currentWeapon];
  document.getElementById('hudWeapon').textContent=(wd?wd.name:currentWeapon).toUpperCase();
  var wa=ammoMap[currentWeapon];
  document.getElementById('hudAmmo').textContent=wa?wa.ammo:'--';
  document.getElementById('hudReserve').textContent=wa?wa.reserve:'--';
  document.getElementById('buyMoney').textContent=money;
}
function fmtTime(s) { s=Math.max(0,Math.floor(s)); return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0'); }
function killFeedAdd(text) {
  var d=document.createElement('div'); d.className='kill-entry'; d.textContent=text;
  document.getElementById('killFeed').appendChild(d);
  setTimeout(function(){d.remove();},4000);
}
function flashHit() {
  var hm=document.getElementById('hitMarker'); hm.classList.add('show');
  setTimeout(function(){hm.classList.remove('show');},150);
}
function redFlash() {
  document.getElementById('gameContainer').style.boxShadow='inset 0 0 80px rgba(200,0,0,0.5)';
  setTimeout(function(){document.getElementById('gameContainer').style.boxShadow='';},150);
}

// ─── AUDIO ───────────────────────────────────────────────
var actx;
function ac(){ if(!actx) actx=new(window.AudioContext||window.webkitAudioContext)(); return actx; }
function playShot(w) {
  try {
    var ctx=ac(), t=ctx.currentTime, sniper=w==='awp', dur=sniper?0.5:0.15;
    var buf=ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,sniper?0.6:2.5);
    var src=ctx.createBufferSource(); src.buffer=buf;
    var flt=ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=sniper?600:2500;
    var g=ctx.createGain(); g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start(t);
  } catch(e){}
}
function playDistant() {
  try {
    var ctx=ac(),t=ctx.currentTime;
    var buf=ctx.createBuffer(1,ctx.sampleRate*0.06,ctx.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
    var src=ctx.createBufferSource(); src.buffer=buf;
    var g=ctx.createGain(); g.gain.value=0.08;
    src.connect(g); g.connect(ctx.destination); src.start(t);
  } catch(e){}
}

selectTeam('ct');
