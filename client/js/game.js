// ═══════════════════════════════════════════════════════════
//   CS 1.6 Browser Clone — FPS Client Engine v2
// ═══════════════════════════════════════════════════════════

'use strict';

// ─── State ───────────────────────────────────────────────
let socket, myId, myTeam;
let scene, camera, weaponScene, weaponCamera, renderer, clock;

// FPS look
let yaw = 0, pitch = 0;
const SENSITIVITY = 0.0018;
let mouseDX = 0, mouseDY = 0;
let pointerLocked = false;

// Movement
const PLAYER_HEIGHT = 1.72;
const SPEED = 9;
const GRAVITY = -28;
let velY = 0, onGround = true;
const keys = {};

// Game data
const WEAPONS_DATA = {};
let phase = 'waiting', roundTimer = 0;
let alive = true, health = 100, armor = 0, money = 800;
let currentWeapon = 'usp', ammoMap = {}, myWeapons = [];
let myX = 0, myY = 0, myZ = 0;

// Remote entities
const remoteEntities = {};

// UI flags
let showBuyMenu = false, showScoreboard = false, showBotMenu = false, chatOpen = false;
let selectedTeam = 'ct';

// Weapon render
let weaponMesh = null;
let weaponBobT = 0;
let isShooting = false, lastShotTime = 0;

// ─── MENU ────────────────────────────────────────────────
function selectTeam(team) {
  selectedTeam = team;
  document.getElementById('btnCT').className = 'team-btn' + (team === 'ct' ? ' active ct' : '');
  document.getElementById('btnT').className  = 'team-btn' + (team === 't'  ? ' active t'  : '');
}
selectTeam('ct');

function connectToGame() {
  const name = (document.getElementById('playerName').value || '').trim() || 'Player';
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';
  simulateLoading(function() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    initThree();
    initSocket(name, selectedTeam);
  });
}

function simulateLoading(cb) {
  const bar = document.getElementById('loadingBar');
  const txt = document.getElementById('loadingText');
  const steps = [
    [15,'Loading textures...'],[35,'Building de_dust2...'],[60,'Loading weapons...'],
    [80,'Connecting to server...'],[95,'Joining game...'],[100,'Ready!']
  ];
  let i = 0;
  function go() {
    if (i >= steps.length) { setTimeout(cb, 300); return; }
    var s = steps[i++]; bar.style.width = s[0]+'%'; txt.textContent = s[1];
    setTimeout(go, 220 + Math.random()*280);
  }
  go();
}

// ─── THREE.JS SETUP ──────────────────────────────────────
function initThree() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  weaponScene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  // Main FPS camera
  camera = new THREE.PerspectiveCamera(90, window.innerWidth/window.innerHeight, 0.05, 500);
  camera.rotation.order = 'YXZ';

  // Weapon viewmodel camera
  weaponCamera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 10);
  weaponCamera.rotation.order = 'YXZ';

  MAP.init(scene);
  buildWeaponMesh();
  setupPointerLock();
  setupInput();

  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    weaponCamera.aspect = camera.aspect;
    weaponCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setInterval(function() {
    document.getElementById('roundTimer').textContent = fmtTime(roundTimer);
  }, 500);

  renderLoop();
}

// ─── WEAPON VIEW MODEL ───────────────────────────────────
function buildWeaponMesh() {
  if (weaponMesh) weaponScene.remove(weaponMesh);
  var g = new THREE.Group();
  var dark  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  var metal = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  var wood  = new THREE.MeshLambertMaterial({ color: 0x7a5020 });

  function box(w,h,d,mat,px,py,pz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(px,py,pz); g.add(m); return m;
  }

  box(0.055,0.09,0.38, dark,  0,     0,     0);       // body
  box(0.012*2,0.014*2,0.32, metal, 0, 0.015,-0.28);   // barrel area
  box(0.008,0.022,0.008, metal, 0, 0.058,-0.40);      // front sight
  box(0.048,0.075,0.18, wood,  0,-0.008, 0.19);       // stock
  box(0.042,0.11,0.058, wood,  0,-0.088, 0.05);       // grip
  box(0.038,0.13,0.048, dark,  0,-0.118,-0.055);      // mag
  box(0.052,0.055,0.16, metal, 0, 0.018,-0.14);       // handguard

  // Barrel cylinder
  var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.014,0.32,6), metal);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.015, -0.28); g.add(barrel);

  g.position.set(0.22, -0.19, -0.32);
  weaponMesh = g;

  weaponScene.add(new THREE.AmbientLight(0xffffff, 0.9));
  var dl = new THREE.DirectionalLight(0xffffff, 0.6);
  dl.position.set(1,2,1); weaponScene.add(dl);
  weaponScene.add(weaponMesh);
}

// ─── POINTER LOCK ────────────────────────────────────────
function setupPointerLock() {
  var canvas = renderer.domElement;
  var overlay = document.createElement('div');
  overlay.id = 'pointerLockOverlay';
  overlay.innerHTML = '<div class="click-to-play">CLICK TO PLAY<small>ESC to pause</small></div>';
  document.getElementById('gameContainer').appendChild(overlay);

  overlay.addEventListener('click', function() { canvas.requestPointerLock(); });

  var ignoreMouseFrames = 0;

  document.addEventListener('pointerlockchange', function() {
    pointerLocked = (document.pointerLockElement === canvas);
    overlay.style.display = pointerLocked ? 'none' : 'flex';
    if (pointerLocked) ignoreMouseFrames = 5;
  });

  document.addEventListener('mousemove', function(e) {
    if (!pointerLocked) return;
    if (ignoreMouseFrames > 0) { ignoreMouseFrames--; return; }
    var dx = Math.max(-30, Math.min(30, e.movementX));
    var dy = Math.max(-30, Math.min(30, e.movementY));
    yaw   -= dx * SENSITIVITY;
    pitch -= dy * SENSITIVITY;
    pitch  = Math.max(-1.4, Math.min(1.4, pitch));
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  });
}

// ─── INPUT ───────────────────────────────────────────────
function setupInput() {
  document.addEventListener('keydown', function(e) {
    if (chatOpen) {
      if (e.key === 'Enter') sendChat();
      if (e.key === 'Escape') closeChatInput();
      return;
    }
    keys[e.code] = true;
    switch(e.code) {
      case 'KeyB': if (phase === 'freeze') toggleBuyMenu(); break;
      case 'Escape': if(showBuyMenu) closeBuyMenu(); if(showBotMenu) toggleBotMenu(); break;
      case 'Tab': e.preventDefault(); showScoreboard=true; document.getElementById('scoreboard').style.display='block'; break;
      case 'KeyO': toggleBotMenu(); break;
      case 'KeyT': openChatInput(); break;
      case 'KeyR': reloadWeapon(); break;
      case 'KeyF': tryBombAction(); break;
      case 'Digit1': switchWeaponIdx(0); break;
      case 'Digit2': switchWeaponIdx(1); break;
      case 'Digit3': switchWeaponIdx(2); break;
    }
  });

  document.addEventListener('keyup', function(e) {
    keys[e.code] = false;
    if (e.code === 'Tab') { showScoreboard=false; document.getElementById('scoreboard').style.display='none'; }
  });

  var shootInt = null;
  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0 || !pointerLocked || showBuyMenu || chatOpen) return;
    shoot();
    shootInt = setInterval(shoot, 90);
  });
  document.addEventListener('mouseup', function(e) {
    if (e.button===0) { clearInterval(shootInt); shootInt=null; }
  });

  document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

// ─── RENDER LOOP ─────────────────────────────────────────
var netSendTimer = 0;
function renderLoop() {
  requestAnimationFrame(renderLoop);
  var dt = Math.min(clock.getDelta(), 0.05);

  // camera rotation applied directly in mousemove handler

  if (alive && phase !== 'freeze') {
    movePlayer(dt);
    netSendTimer += dt;
    if (netSendTimer > 0.05 && socket) {
      netSendTimer = 0;
      socket.emit('playerMove', { x:myX, y:myY, z:myZ, yaw:yaw, pitch:pitch });
    }
  }

  tickWeaponAnim(dt);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);
}

// ─── MOVEMENT ────────────────────────────────────────────
function movePlayer(dt) {
  var speed = SPEED * (keys['ShiftLeft'] ? 0.55 : 1.0);
  var fx=0, fz=0;
  if (keys['KeyW']||keys['ArrowUp'])    fz-=1;
  if (keys['KeyS']||keys['ArrowDown'])  fz+=1;
  if (keys['KeyA']||keys['ArrowLeft'])  fx-=1;
  if (keys['KeyD']||keys['ArrowRight']) fx+=1;

  if (fx!==0||fz!==0) {
    var len = Math.sqrt(fx*fx+fz*fz); fx/=len; fz/=len;
    var cy=Math.cos(yaw), sy=Math.sin(yaw);
    var wx= cy*fx+sy*fz;
    var wz=-sy*fx+cy*fz;
    var step=speed*dt;
    var nx=myX+wx*step, nz=myZ+wz*step;
    if (!MAP.checkCollision(nx,myY,myZ)) myX=nx;
    if (!MAP.checkCollision(myX,myY,nz)) myZ=nz;
  }

  if (keys['Space'] && onGround) { velY=7; onGround=false; }
  velY += GRAVITY*dt;
  var ny=myY+velY*dt;
  if (ny<=0) { myY=0; velY=0; onGround=true; } else { myY=ny; onGround=false; }

  camera.position.set(myX, myY+PLAYER_HEIGHT, myZ);
}

// ─── WEAPON ANIMATION ────────────────────────────────────
function tickWeaponAnim(dt) {
  if (!weaponMesh) return;
  var moving = keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD'];
  weaponBobT += dt*(moving?9:3);
  var bobX = Math.sin(weaponBobT)*(moving?0.009:0.002);
  var bobY = Math.abs(Math.cos(weaponBobT))*(moving?0.007:0.001);
  var rz   = isShooting ? 0.04 : 0;
  weaponMesh.position.set(0.22+bobX, -0.19+bobY, -0.32+rz);
  weaponCamera.rotation.y = yaw;
  weaponCamera.rotation.x = pitch;
  weaponCamera.position.set(0,0,0);
}

// ─── SHOOTING ────────────────────────────────────────────
function shoot() {
  if (!alive||phase!=='live'||!socket) return;
  var wd = WEAPONS_DATA[currentWeapon]; if (!wd) return;
  var now = Date.now();
  if (now-lastShotTime < wd.fireRate) return;
  lastShotTime = now;

  var wa = ammoMap[currentWeapon];
  if (wa&&wa.ammo<=0) { reloadWeapon(); return; }
  if (wa) { wa.ammo=Math.max(0,wa.ammo-1); updateHUD(); }

  isShooting=true; setTimeout(function(){isShooting=false;},80);
  pitch -= 0.018*wd.recoil*0.12;
  playShootSound(currentWeapon);
  showMuzzleFlash();

  var raycaster = new THREE.Raycaster();
  var spread = wd.recoil*0.0025;
  var dir = new THREE.Vector3(
    (Math.random()-0.5)*spread,
    (Math.random()-0.5)*spread,
    -1
  ).normalize().applyEuler(camera.rotation);
  raycaster.set(camera.position, dir);

  var meshTargets = [];
  for (var id in remoteEntities) {
    var ent = remoteEntities[id];
    if (!ent.mesh.visible||ent.data.team===myTeam) continue;
    (function(eid){
      ent.mesh.traverse(function(child) {
        if (child.isMesh) { child.userData.eid=eid; child.userData.isHead=(child.position.y>1.1); meshTargets.push(child); }
      });
    })(id);
  }

  var hits = raycaster.intersectObjects(meshTargets);
  var hitId=null, hitPart='body';
  if (hits.length>0) { hitId=hits[0].object.userData.eid; hitPart=hits[0].object.userData.isHead?'head':'body'; showHitMarker(); }
  socket.emit('shoot',{hitId,hitPart});
}

function reloadWeapon() {
  var wa=ammoMap[currentWeapon]; if(!wa)return;
  var wd=WEAPONS_DATA[currentWeapon];
  var needed=(wd?wd.ammo:30)-wa.ammo;
  var take=Math.min(needed,wa.reserve||0);
  wa.ammo+=take; wa.reserve-=take;
  updateHUD(); playReloadSound();
}

function switchWeaponIdx(i) {
  if (myWeapons[i]&&myWeapons[i]!==currentWeapon) {
    currentWeapon=myWeapons[i]; socket&&socket.emit('switchWeapon',{weapon:currentWeapon}); updateHUD();
  }
}

// ─── BOMB ────────────────────────────────────────────────
function tryBombAction() {
  if (!socket||phase!=='live') return;
  if (myTeam==='t') { var site=MAP.nearBombSite(myX,myZ); if(site) socket.emit('plantBomb',{site,x:myX,z:myZ}); }
  else socket.emit('defuseBomb');
}

// ─── REMOTE ENTITIES ─────────────────────────────────────
function addEntity(id, data, isBot) {
  if (remoteEntities[id]) return;
  var mesh = makePlayerMesh(data.team);
  mesh.position.set(data.x||0, data.y||0, data.z||0);
  mesh.visible = !!data.alive;
  scene.add(mesh);
  remoteEntities[id] = { mesh, data, isBot };
}

function removeEntity(id) {
  if (remoteEntities[id]) { scene.remove(remoteEntities[id].mesh); delete remoteEntities[id]; }
}

function makePlayerMesh(team) {
  var g = new THREE.Group();
  var tc = team==='ct' ? 0x1a4480 : 0x8a3010;

  function mkBox(w,h,d,col,px,py,pz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({color:col}));
    m.position.set(px,py,pz); g.add(m); return m;
  }

  mkBox(0.58,0.72,0.28, tc,       0, 1.02, 0);   // torso
  mkBox(0.36,0.36,0.30, 0xd4a870, 0, 1.58, 0);   // head
  mkBox(0.40,0.20,0.32, team==='ct'?0x0a2a5a:0x3a1a00, 0, 1.78, 0); // helmet
  mkBox(0.24,0.68,0.26, tc,      -0.18,0.32,0);  // leg L
  mkBox(0.24,0.68,0.26, tc,       0.18,0.32,0);  // leg R
  mkBox(0.18,0.60,0.22, tc,      -0.38,1.0, 0);  // arm L
  mkBox(0.18,0.60,0.22, tc,       0.38,1.0, 0);  // arm R
  mkBox(0.055,0.08,0.30, 0x222222, 0.40,0.95,-0.18); // gun

  return g;
}

// ─── SOCKET ──────────────────────────────────────────────
function initSocket(name, team) {
  socket = io();
  myTeam = team;

  socket.on('connect', function() {
    myId = socket.id;
    socket.emit('joinGame', { name, team });
  });

  socket.on('joined', function(d) {
    myId = d.id;
    Object.assign(WEAPONS_DATA, d.weapons);
    applyMyState(d.player);
    if (d.gameState) {
      Object.entries(d.gameState.players||{}).forEach(function(e){ if(e[0]!==myId) addEntity(e[0],e[1],false); });
      Object.entries(d.gameState.bots||{}).forEach(function(e){ addEntity(e[0],e[1],true); });
    }
    updateBuyMenu(); updateHUD();
  });

  socket.on('joinError', function(msg) {
    document.getElementById('gameContainer').style.display='none';
    document.getElementById('mainMenu').style.display='flex';
    document.getElementById('connectError').textContent=msg;
  });

  socket.on('playerJoined', function(d){ if(d.id!==myId) addEntity(d.id,d.player,false); });
  socket.on('playerLeft',   function(d){ removeEntity(d.id); addSysMsg(d.name+' left'); });
  socket.on('botAdded',     function(d){ addEntity(d.bot.id,d.bot,true); });
  socket.on('botRemoved',   function(d){ removeEntity(d.id); });

  socket.on('playerMoved', function(d) {
    var e=remoteEntities[d.id]; if(!e) return;
    e.mesh.position.set(d.x,d.y,d.z); e.mesh.rotation.y=d.yaw||0;
    e.data.x=d.x; e.data.y=d.y; e.data.z=d.z;
  });

  socket.on('takeDamage', function(d) {
    health=d.health; armor=d.armor; showDamageFlash(); updateHUD();
  });

  socket.on('playerKilled', function(d) {
    var vn=entityName(d.victim), an=d.attacker?entityName(d.attacker):'World';
    addKillFeedEntry(an+' ➜ '+vn+'  ['+d.weapon+']');
    if (d.victim===myId) {
      alive=false; health=0;
      document.getElementById('deadOverlay').style.display='flex';
      updateHUD();
    }
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
    var labels={ct:'COUNTER-TERRORISTS WIN!',t:'TERRORISTS WIN!'};
    var reasons={elim:'All enemies eliminated',time:'Time ran out',defuse:'Bomb defused',bomb_explode:'Bomb exploded!'};
    document.getElementById('bannerText').textContent=labels[d.winner];
    document.getElementById('bannerReason').textContent=reasons[d.reason]||'';
    document.getElementById('roundBanner').style.display='block';
    document.getElementById('scoreT').textContent=d.score.t;
    document.getElementById('scoreCT').textContent=d.score.ct;
  });

  socket.on('gameState', function(gs) {
    phase=gs.phase; roundTimer=gs.roundTimer; updatePhaseLabel();
    var bomb=gs.bomb, bi=document.getElementById('bombIndicator');
    if (bomb&&bomb.planted&&!bomb.defused&&!bomb.exploded) {
      bi.style.display='block';
      document.getElementById('bombTimer').textContent=bomb.timer;
      document.getElementById('bombSite').textContent='SITE '+(bomb.site||'?');
    } else { bi.style.display='none'; }
    syncEntities(gs.players,false); syncEntities(gs.bots,true);
    updateScoreboard(gs.players,gs.bots);
  });

  socket.on('weaponBought', function(d) {
    money=d.money; ammoMap=d.ammo; currentWeapon=d.weapon;
    if(!myWeapons.includes(d.weapon)) myWeapons.push(d.weapon);
    updateHUD(); updateBuyMenu();
  });

  socket.on('buyError',     function(m){ addSysMsg(m); });
  socket.on('bombPlanted',  function(d){ addSysMsg('★ '+d.planter+' planted at site '+d.site+'!'); });
  socket.on('bombDefusing', function(d){ addSysMsg(d.defuser+' defusing... ('+d.time+'s)'); });
  socket.on('killFeed',     function(d){ addSysMsg('★ You killed '+d.victim+(d.headshot?' [HEADSHOT]':'')+'!'); });
  socket.on('chatMessage',  function(d){ addChatMsg(d.name,d.team,d.msg); });
  socket.on('matchEnd',     function(d){ addSysMsg('MATCH END — '+d.winner.toUpperCase()+' wins!'); });
  socket.on('playerShot',   function(){ playDistantShot(); });
  socket.on('botShoot',     function(){ playDistantShot(); });
}

function applyMyState(p) {
  myX=p.x; myY=p.y; myZ=p.z;
  camera.position.set(myX, myY+PLAYER_HEIGHT, myZ);
  yaw=p.yaw||0; pitch=0;
  camera.rotation.y=yaw; camera.rotation.x=pitch;
  alive=p.alive; health=p.health; armor=p.armor;
  myWeapons=p.weapons||[]; currentWeapon=p.currentWeapon;
  ammoMap=p.ammo||{}; money=p.money;
}

function syncEntities(map, isBot) {
  if (!map) return;
  Object.entries(map).forEach(function(entry) {
    var id=entry[0], p=entry[1];
    if (id===myId) {
      money=p.money; myWeapons=p.weapons||[]; currentWeapon=p.currentWeapon;
      ammoMap=p.ammo||ammoMap; health=p.health; armor=p.armor; alive=p.alive;
      updateHUD(); return;
    }
    var e=remoteEntities[id];
    if (e) { e.mesh.position.set(p.x,p.y,p.z); e.mesh.rotation.y=p.yaw||0; e.mesh.visible=!!p.alive; e.data=p; }
    else addEntity(id,p,isBot);
  });
}

function entityName(id) {
  if (id===myId) return 'You';
  return (remoteEntities[id]&&remoteEntities[id].data&&remoteEntities[id].data.name)||id;
}

// ─── CHAT ────────────────────────────────────────────────
function openChatInput() {
  chatOpen=true;
  document.getElementById('chatInputWrap').style.display='flex';
  document.getElementById('chatInput').focus();
  if (pointerLocked) document.exitPointerLock();
}
function closeChatInput() {
  chatOpen=false;
  document.getElementById('chatInputWrap').style.display='none';
  document.getElementById('chatInput').value='';
}
function sendChat() {
  var msg=document.getElementById('chatInput').value.trim();
  if (msg) socket&&socket.emit('chatMessage',{msg});
  closeChatInput();
}
function addChatMsg(name, team, msg) {
  var d=document.createElement('div');
  d.className='chat-msg '+team;
  d.innerHTML=(name?'<span class="chat-name">'+escHtml(name)+':</span> ':'')+escHtml(msg);
  document.getElementById('chatMessages').appendChild(d);
  setTimeout(function(){d.remove();},8000);
}
function addSysMsg(msg) {
  var d=document.createElement('div'); d.className='chat-msg sys';
  d.innerHTML='<em>'+escHtml(msg)+'</em>';
  document.getElementById('chatMessages').appendChild(d);
  setTimeout(function(){d.remove();},7000);
}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── BOT MENU ────────────────────────────────────────────
function toggleBotMenu() {
  showBotMenu=!showBotMenu;
  document.getElementById('botMenu').style.display=showBotMenu?'block':'none';
  if (showBotMenu&&pointerLocked) document.exitPointerLock();
}
function addBot(team){ socket&&socket.emit('addBot',{team}); }

// ─── BUY MENU ────────────────────────────────────────────
function toggleBuyMenu() {
  showBuyMenu=!showBuyMenu;
  document.getElementById('buyMenu').style.display=showBuyMenu?'block':'none';
  if (showBuyMenu&&pointerLocked) document.exitPointerLock();
}
function closeBuyMenu() { showBuyMenu=false; document.getElementById('buyMenu').style.display='none'; }

function updateBuyMenu() {
  document.getElementById('buyMoney').textContent=money;
  var grid=document.getElementById('buyGrid'); grid.innerHTML='';
  Object.entries(WEAPONS_DATA).forEach(function(entry) {
    var key=entry[0], w=entry[1];
    if (w.price===0) return;
    if (w.team!=='any'&&w.team!==myTeam) return;
    var div=document.createElement('div');
    div.className='buy-item'+(money<w.price?' cant-afford':'');
    div.innerHTML='<div class="w-name">'+w.name+'</div><div class="w-price">$'+w.price+'</div>';
    div.onclick=function(){ socket&&socket.emit('buyWeapon',{weapon:key}); closeBuyMenu(); };
    grid.appendChild(div);
  });
}

// ─── SCOREBOARD ──────────────────────────────────────────
function updateScoreboard(players, bots) {
  if (!showScoreboard) return;
  var all=Object.assign({},players,bots);
  var ct=[], t=[];
  Object.entries(all).forEach(function(e){ (e[1].team==='ct'?ct:t).push(Object.assign({id:e[0]},e[1])); });
  function render(arr, elId) {
    var el=document.getElementById(elId);
    var hdr=el.querySelector('.sb-team-header');
    el.innerHTML=''; el.appendChild(hdr);
    arr.forEach(function(p) {
      var d=document.createElement('div');
      d.className='sb-player'+(p.id===myId?' is-me':'');
      d.innerHTML='<span class="p-name">'+escHtml(p.name||'Bot')+'</span><span class="p-kills">'+(p.kills||0)+'K</span><span class="p-deaths">'+(p.deaths||0)+'D</span>';
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
function updatePhaseLabel() {
  var labels={waiting:'WAITING',freeze:'FREEZE TIME',live:'LIVE',roundEnd:'ROUND END'};
  document.getElementById('phaseLabel').textContent=labels[phase]||phase.toUpperCase();
}
function fmtTime(s) {
  s=Math.max(0,Math.floor(s));
  return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0');
}
function addKillFeedEntry(text) {
  var d=document.createElement('div'); d.className='kill-entry'; d.textContent=text;
  document.getElementById('killFeed').appendChild(d);
  setTimeout(function(){d.remove();},4000);
}

// ─── EFFECTS ─────────────────────────────────────────────
function showHitMarker() {
  var hm=document.getElementById('hitMarker');
  hm.classList.add('show'); setTimeout(function(){hm.classList.remove('show');},160);
}
function showDamageFlash() {
  var el=document.getElementById('gameContainer');
  el.style.boxShadow='inset 0 0 80px rgba(200,0,0,0.5)';
  setTimeout(function(){el.style.boxShadow='';},150);
}
var muzzleTO=null;
function showMuzzleFlash() {
  if (muzzleTO) return;
  var light=new THREE.PointLight(0xffaa44,3,0.8);
  light.position.set(0.22,-0.15,-0.65); weaponScene.add(light);
  muzzleTO=setTimeout(function(){ weaponScene.remove(light); muzzleTO=null; },55);
}

// ─── AUDIO ───────────────────────────────────────────────
var actx=null;
function getActx(){ if(!actx) actx=new(window.AudioContext||window.webkitAudioContext)(); return actx; }

function playShootSound(weapon) {
  try {
    var ctx=getActx(), t=ctx.currentTime;
    var isSniper=weapon==='awp', isRifle=['ak47','m4a1','mp5'].includes(weapon);
    var dur=isSniper?0.55:0.18;
    var buf=ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,isSniper?0.5:2.5);
    var src=ctx.createBufferSource(); src.buffer=buf;
    var flt=ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=isSniper?700:(isRifle?2800:2200);
    var gain=ctx.createGain(); gain.gain.setValueAtTime(isSniper?0.7:0.45,t); gain.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(flt); flt.connect(gain); gain.connect(ctx.destination); src.start(t);
    var osc=ctx.createOscillator(); osc.type='sawtooth';
    osc.frequency.setValueAtTime(isSniper?90:(isRifle?160:260),t);
    osc.frequency.exponentialRampToValueAtTime(35,t+dur);
    var g2=ctx.createGain(); g2.gain.setValueAtTime(isSniper?0.3:0.18,t); g2.gain.exponentialRampToValueAtTime(0.001,t+dur);
    osc.connect(g2); g2.connect(ctx.destination); osc.start(t); osc.stop(t+dur);
  } catch(e){}
}
function playDistantShot() {
  try {
    var ctx=getActx(),t=ctx.currentTime;
    var buf=ctx.createBuffer(1,ctx.sampleRate*0.07,ctx.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
    var src=ctx.createBufferSource(); src.buffer=buf;
    var flt=ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=700;
    var g=ctx.createGain(); g.gain.value=0.1;
    src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start(t);
  } catch(e){}
}
function playReloadSound() {
  try {
    var ctx=getActx(),t=ctx.currentTime;
    var osc=ctx.createOscillator(); osc.type='square'; osc.frequency.value=750;
    var g=ctx.createGain(); g.gain.setValueAtTime(0.04,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.035);
    osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t+0.035);
  } catch(e){}
}

// ─── INIT ────────────────────────────────────────────────
selectTeam('ct');
