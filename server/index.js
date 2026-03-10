const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ─── Game State ───────────────────────────────────────────────────────────────
const TEAMS = { CT: 'ct', T: 't' };
const MAX_PER_TEAM = 6;
const ROUND_TIME = 115; // seconds
const FREEZE_TIME = 5;
const BOMB_TIME = 40;

const SPAWN_POINTS = {
  ct: [
    { x: 120, y: 0, z: -180 }, { x: 130, y: 0, z: -170 },
    { x: 110, y: 0, z: -190 }, { x: 140, y: 0, z: -185 },
    { x: 125, y: 0, z: -195 }, { x: 115, y: 0, z: -175 }
  ],
  t: [
    { x: -120, y: 0, z: 180 }, { x: -130, y: 0, z: 170 },
    { x: -110, y: 0, z: 190 }, { x: -140, y: 0, z: 185 },
    { x: -125, y: 0, z: 195 }, { x: -115, y: 0, z: 175 }
  ]
};

const WEAPONS = {
  ak47:  { name: 'AK-47',    damage: 35, fireRate: 100, ammo: 30, reserve: 90,  price: 2500, recoil: 3.5, team: 't'  },
  m4a1:  { name: 'M4A1',     damage: 32, fireRate: 90,  ammo: 30, reserve: 90,  price: 3100, recoil: 3.0, team: 'ct' },
  awp:   { name: 'AWP',      damage: 115,fireRate: 1300,ammo: 10, reserve: 30,  price: 4750, recoil: 8.0, team: 'any'},
  deagle:{ name: 'Desert Eagle', damage: 53, fireRate: 400, ammo: 7, reserve: 35, price: 650, recoil: 5.0, team: 'any'},
  glock: { name: 'Glock-18', damage: 25, fireRate: 150, ammo: 20, reserve: 120, price: 0,    recoil: 1.5, team: 't'  },
  usp:   { name: 'USP',      damage: 34, fireRate: 300, ammo: 12, reserve: 100, price: 0,    recoil: 1.8, team: 'ct' },
  mp5:   { name: 'MP5',      damage: 27, fireRate: 70,  ammo: 30, reserve: 120, price: 1500, recoil: 2.0, team: 'any'},
  heg:   { name: 'HE Grenade',damage: 98,fireRate: 0,   ammo: 1,  reserve: 0,   price: 300,  recoil: 0,   team: 'any'},
};

let gameState = {
  phase: 'waiting',    // waiting | freeze | live | roundEnd | half
  round: 0,
  roundTimer: 0,
  score: { ct: 0, t: 0 },
  players: {},
  bomb: { planted: false, planter: null, site: null, timer: 0, defuser: null, defused: false, exploded: false },
  bots: {},
  roundInterval: null,
  freezeTimeout: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTeamCount(team) {
  const humans = Object.values(gameState.players).filter(p => p.team === team).length;
  const bots = Object.values(gameState.bots).filter(b => b.team === team).length;
  return humans + bots;
}

function broadcastState() {
  io.emit('gameState', {
    phase: gameState.phase,
    round: gameState.round,
    roundTimer: gameState.roundTimer,
    score: gameState.score,
    players: gameState.players,
    bots: gameState.bots,
    bomb: gameState.bomb,
  });
}

function respawnPlayer(player) {
  const spawns = SPAWN_POINTS[player.team];
  const spawnIndex = Math.floor(Math.random() * spawns.length);
  const spawn = spawns[spawnIndex];
  player.x = spawn.x + (Math.random() - 0.5) * 4;
  player.y = spawn.y;
  player.z = spawn.z + (Math.random() - 0.5) * 4;
  player.health = 100;
  player.armor = 0;
  player.alive = true;
  player.yaw = player.team === 'ct' ? 0 : Math.PI;
  const defaultWeapon = player.team === 'ct' ? 'usp' : 'glock';
  player.weapons = [defaultWeapon];
  player.currentWeapon = defaultWeapon;
  player.ammo = { [defaultWeapon]: { ...WEAPONS[defaultWeapon] } };
}

function startRound() {
  gameState.round++;
  gameState.phase = 'freeze';
  gameState.bomb = { planted: false, planter: null, site: null, timer: 0, defuser: null, defused: false, exploded: false };

  // Respawn all
  Object.values(gameState.players).forEach(p => respawnPlayer(p));
  Object.values(gameState.bots).forEach(b => respawnPlayer(b));

  broadcastState();
  io.emit('roundStart', { round: gameState.round });

  gameState.freezeTimeout = setTimeout(() => {
    gameState.phase = 'live';
    gameState.roundTimer = ROUND_TIME;
    broadcastState();
    startRoundTimer();
  }, FREEZE_TIME * 1000);
}

function startRoundTimer() {
  if (gameState.roundInterval) clearInterval(gameState.roundInterval);
  gameState.roundInterval = setInterval(() => {
    if (gameState.phase !== 'live') return;

    if (gameState.bomb.planted && !gameState.bomb.defused && !gameState.bomb.exploded) {
      gameState.bomb.timer--;
      if (gameState.bomb.timer <= 0) {
        gameState.bomb.exploded = true;
        endRound('t', 'bomb_explode');
        return;
      }
    }

    gameState.roundTimer--;
    if (gameState.roundTimer <= 0) {
      endRound('ct', 'time');
    }
    broadcastState();
  }, 1000);
}

function endRound(winTeam, reason) {
  if (gameState.roundInterval) clearInterval(gameState.roundInterval);
  gameState.phase = 'roundEnd';
  gameState.score[winTeam]++;
  io.emit('roundEnd', { winner: winTeam, reason, score: gameState.score });
  broadcastState();

  setTimeout(() => {
    if (gameState.score.ct >= 16 || gameState.score.t >= 16) {
      io.emit('matchEnd', { winner: gameState.score.ct >= 16 ? 'ct' : 't', score: gameState.score });
      gameState.score = { ct: 0, t: 0 };
      gameState.round = 0;
    }
    if (Object.keys(gameState.players).length > 0) {
      startRound();
    } else {
      gameState.phase = 'waiting';
      broadcastState();
    }
  }, 5000);
}

function checkRoundEnd() {
  if (gameState.phase !== 'live') return;
  const ctAlive = Object.values(gameState.players).concat(Object.values(gameState.bots))
    .filter(p => p.team === 'ct' && p.alive).length;
  const tAlive = Object.values(gameState.players).concat(Object.values(gameState.bots))
    .filter(p => p.team === 't' && p.alive).length;

  if (ctAlive === 0 && !gameState.bomb.planted) endRound('t', 'elim');
  else if (ctAlive === 0 && gameState.bomb.planted) {} // bomb still ticking
  else if (tAlive === 0 && !gameState.bomb.planted) endRound('ct', 'elim');
  else if (tAlive === 0 && gameState.bomb.defused) endRound('ct', 'defuse');
}

// ─── Bot AI ──────────────────────────────────────────────────────────────────
const BOT_WAYPOINTS = {
  t: [
    { x: -80, z: 120 }, { x: -40, z: 60 }, { x: 0, z: 20 },
    { x: 40, z: -20 }, { x: 80, z: -80 }, { x: 100, z: -140 }
  ],
  ct: [
    { x: 80, z: -120 }, { x: 40, z: -60 }, { x: 0, z: -20 },
    { x: -40, z: 20 }, { x: -80, z: 80 }, { x: -100, z: 140 }
  ]
};

function updateBots() {
  const now = Date.now();
  Object.values(gameState.bots).forEach(bot => {
    if (!bot.alive || gameState.phase !== 'live') return;

    // Move toward next waypoint
    if (!bot.wpIndex) bot.wpIndex = 0;
    const wps = BOT_WAYPOINTS[bot.team];
    const target = wps[bot.wpIndex % wps.length];
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 5) {
      bot.wpIndex = (bot.wpIndex + 1) % wps.length;
    } else {
      const speed = 0.05;
      bot.x += (dx / dist) * speed * 16;
      bot.z += (dz / dist) * speed * 16;
      bot.yaw = Math.atan2(dx, dz);
    }

    // Shoot at enemies randomly
    if (!bot.lastShot || now - bot.lastShot > 800 + Math.random() * 1200) {
      const enemies = Object.values(gameState.players).concat(Object.values(gameState.bots))
        .filter(p => p.team !== bot.team && p.alive);
      if (enemies.length > 0) {
        const enemy = enemies[Math.floor(Math.random() * enemies.length)];
        const edx = enemy.x - bot.x, edz = enemy.z - bot.z;
        const eDist = Math.sqrt(edx * edx + edz * edz);
        if (eDist < 120) {
          const hitChance = Math.max(0.2, 1 - eDist / 150);
          if (Math.random() < hitChance) {
            const dmg = 20 + Math.floor(Math.random() * 20);
            applyDamage(enemy, bot, dmg);
          }
          bot.lastShot = now;
          io.emit('botShoot', { id: bot.id });
        }
      }
    }
  });
}

function applyDamage(victim, attacker, damage) {
  if (!victim.alive) return;
  const armorAbsorb = Math.min(victim.armor, damage * 0.5);
  victim.armor = Math.max(0, victim.armor - armorAbsorb);
  victim.health -= (damage - armorAbsorb);

  if (victim.health <= 0) {
    victim.health = 0;
    victim.alive = false;
    io.emit('playerKilled', {
      victim: victim.id,
      attacker: attacker ? attacker.id : null,
      weapon: attacker ? (attacker.currentWeapon || 'unknown') : 'unknown'
    });
    checkRoundEnd();
  } else {
    if (victim.socketId) {
      io.to(victim.socketId).emit('takeDamage', { health: victim.health, armor: victim.armor, attacker: attacker?.id });
    }
  }
}

setInterval(updateBots, 50);

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.on('joinGame', ({ name, team }) => {
    if (getTeamCount(team) >= MAX_PER_TEAM) {
      socket.emit('joinError', 'Team is full (max 6)');
      return;
    }

    const player = {
      id: socket.id,
      socketId: socket.id,
      name: name || `Player_${socket.id.slice(0, 4)}`,
      team,
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0,
      health: 100, armor: 0,
      alive: false,
      weapons: [],
      currentWeapon: team === 'ct' ? 'usp' : 'glock',
      ammo: {},
      money: 800,
      kills: 0, deaths: 0, score: 0,
      isBot: false,
    };

    gameState.players[socket.id] = player;
    respawnPlayer(player);

    socket.emit('joined', {
      id: socket.id,
      player,
      weapons: WEAPONS,
      gameState: {
        phase: gameState.phase,
        round: gameState.round,
        score: gameState.score,
        players: gameState.players,
        bots: gameState.bots,
      }
    });

    io.emit('playerJoined', { id: socket.id, player });

    // Start game if enough players
    if (gameState.phase === 'waiting' && Object.keys(gameState.players).length >= 1) {
      setTimeout(() => startRound(), 2000);
    }

    console.log(`[+] ${player.name} joined team ${team}`);
  });

  socket.on('playerMove', (data) => {
    const p = gameState.players[socket.id];
    if (!p || !p.alive || gameState.phase === 'freeze') return;
    p.x = data.x; p.y = data.y; p.z = data.z;
    p.yaw = data.yaw; p.pitch = data.pitch;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
  });

  socket.on('shoot', (data) => {
    const shooter = gameState.players[socket.id];
    if (!shooter || !shooter.alive || gameState.phase !== 'live') return;

    const weapon = WEAPONS[shooter.currentWeapon];
    if (!weapon) return;

    // Broadcast shoot effect
    socket.broadcast.emit('playerShot', { id: socket.id, weapon: shooter.currentWeapon });

    // Hit detection (server-side simple raycasting approximation)
    if (data.hitId) {
      const victim = gameState.players[data.hitId] || gameState.bots[data.hitId];
      if (victim && victim.alive && victim.team !== shooter.team) {
        const headshot = data.hitPart === 'head';
        const dmg = headshot ? weapon.damage * 2.5 : weapon.damage;
        applyDamage(victim, shooter, Math.floor(dmg));
        if (!victim.alive) {
          shooter.kills++;
          shooter.money = Math.min(16000, shooter.money + 300);
          io.to(socket.id).emit('killFeed', { victim: victim.name, headshot });
        }
      }
    }
  });

  socket.on('plantBomb', (data) => {
    const p = gameState.players[socket.id];
    if (!p || p.team !== 't' || !p.alive || gameState.phase !== 'live') return;
    gameState.bomb.planted = true;
    gameState.bomb.planter = socket.id;
    gameState.bomb.site = data.site;
    gameState.bomb.timer = BOMB_TIME;
    gameState.bomb.x = data.x; gameState.bomb.z = data.z;
    io.emit('bombPlanted', { planter: p.name, site: data.site, timer: BOMB_TIME });
  });

  socket.on('defuseBomb', () => {
    const p = gameState.players[socket.id];
    if (!p || p.team !== 'ct' || !p.alive || !gameState.bomb.planted) return;
    gameState.bomb.defuser = socket.id;
    const defuseTime = p.armor > 0 ? 5000 : 10000;
    io.emit('bombDefusing', { defuser: p.name, time: defuseTime / 1000 });
    setTimeout(() => {
      if (gameState.phase === 'live' && gameState.bomb.planted && !gameState.bomb.exploded) {
        gameState.bomb.defused = true;
        endRound('ct', 'defuse');
      }
    }, defuseTime);
  });

  socket.on('buyWeapon', (data) => {
    const p = gameState.players[socket.id];
    if (!p || gameState.phase !== 'freeze') return;
    const weapon = WEAPONS[data.weapon];
    if (!weapon) return;
    if (weapon.team !== 'any' && weapon.team !== p.team) {
      socket.emit('buyError', 'Wrong team weapon');
      return;
    }
    if (p.money < weapon.price) {
      socket.emit('buyError', 'Not enough money');
      return;
    }
    p.money -= weapon.price;
    if (!p.weapons.includes(data.weapon)) p.weapons.push(data.weapon);
    p.ammo[data.weapon] = { ammo: weapon.ammo, reserve: weapon.reserve };
    p.currentWeapon = data.weapon;
    socket.emit('weaponBought', { weapon: data.weapon, money: p.money, ammo: p.ammo });
  });

  socket.on('switchWeapon', (data) => {
    const p = gameState.players[socket.id];
    if (!p || !p.weapons.includes(data.weapon)) return;
    p.currentWeapon = data.weapon;
    socket.emit('weaponSwitched', { weapon: data.weapon });
  });

  socket.on('addBot', (data) => {
    const team = data.team || 't';
    if (getTeamCount(team) >= MAX_PER_TEAM) {
      socket.emit('botError', 'Team full');
      return;
    }
    const botId = 'bot_' + uuidv4().slice(0, 8);
    const botNames = ['Viktor', 'Alexei', 'Dmitri', 'Ivan', 'Mikhail', 'Sergei', 'Boris', 'Nikolai'];
    const bot = {
      id: botId,
      name: botNames[Math.floor(Math.random() * botNames.length)] + '[BOT]',
      team,
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0,
      health: 100, armor: 0,
      alive: true,
      weapons: [team === 'ct' ? 'm4a1' : 'ak47', team === 'ct' ? 'usp' : 'glock'],
      currentWeapon: team === 'ct' ? 'm4a1' : 'ak47',
      ammo: {},
      kills: 0, deaths: 0,
      isBot: true,
      wpIndex: 0,
    };
    respawnPlayer(bot);
    gameState.bots[botId] = bot;
    io.emit('botAdded', { bot });
    console.log(`[BOT] ${bot.name} added to team ${team}`);
  });

  socket.on('removeBot', (data) => {
    if (gameState.bots[data.id]) {
      delete gameState.bots[data.id];
      io.emit('botRemoved', { id: data.id });
    }
  });

  socket.on('chatMessage', (data) => {
    const p = gameState.players[socket.id];
    if (!p) return;
    io.emit('chatMessage', { name: p.name, team: p.team, msg: data.msg.slice(0, 128) });
  });

  socket.on('disconnect', () => {
    const p = gameState.players[socket.id];
    if (p) {
      io.emit('playerLeft', { id: socket.id, name: p.name });
      delete gameState.players[socket.id];
      if (Object.keys(gameState.players).length === 0) {
        if (gameState.roundInterval) clearInterval(gameState.roundInterval);
        if (gameState.freezeTimeout) clearTimeout(gameState.freezeTimeout);
        gameState.phase = 'waiting';
        gameState.round = 0;
        gameState.score = { ct: 0, t: 0 };
        gameState.bots = {};
      } else {
        checkRoundEnd();
      }
    }
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`CS 1.6 Browser Clone running on port ${PORT}`);
});
