const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Redis } = require('@upstash/redis');
const cors = require('cors');

const app = express(); app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const redis = new Redis({ url: 'https://meet-satyr-111648.upstash.io', token: 'gQAAAAAAAbQgAAIgcDFmYjEyMjBjOGNjYmQ0ZTczYjllOWFhMjMyOTAzYTRmNA' });
const ROOM = "NEON_ARENA";
let players = {}; 

// Helper Functions
const getLeaderboard = () => Object.values(players).map(p => ({ name: p.name, score: p.score })).sort((a, b) => b.score - a.score);
const syncDB = () => redis.set("bca_assignment_leaderboard", JSON.stringify(getLeaderboard())).catch(console.error);
const updateLobby = () => io.emit('playerCountUpdate', Object.keys(players).length);

function checkWin() {
    let alive = Object.values(players).filter(p => p.hp > 0);
    if (Object.keys(players).length > 1 && alive.length <= 1) {
        io.to(ROOM).emit('matchOver', alive.length === 1 ? alive[0].name : "Draw");
        Object.values(players).forEach(p => Object.assign(p, { hp: 20, score: 0, x: Math.random() * 1800 + 100, y: Math.random() * 1800 + 100 }));
    }
}

// Passive Healing Loop
setInterval(() => {
    let updated = false, now = Date.now();
    Object.values(players).forEach(p => {
        if (p.hp > 0 && p.hp < 20 && (now - p.lastHit > 5000)) { p.hp = Math.min(20, p.hp + 0.02); updated = true; }
    });
    if (updated) io.to(ROOM).emit('stateUpdate', players);
}, 100);

io.on('connection', (socket) => {
    socket.emit('playerCountUpdate', Object.keys(players).length);

    socket.on('joinArena', (name) => {
        if (!name) return;
        players[socket.id] = { id: socket.id, name, hp: 20, score: 0, lastHit: 0, x: Math.random() * 1800 + 100, y: Math.random() * 1800 + 100, rotation: 0 };
        socket.join(ROOM);
        updateLobby();
        socket.emit('matchInit', { players });
        io.to(ROOM).emit('stateUpdate', players);
        io.to(ROOM).emit('leaderboardSync', getLeaderboard());
        syncDB();
    });

    socket.on('playerMovement', (data) => {
        let p = players[socket.id];
        if (p) {
            p.x = Math.max(20, Math.min(1980, data.x));
            p.y = Math.max(20, Math.min(1980, data.y));
            p.rotation = data.rotation;
            socket.to(ROOM).emit('playerMoved', p); 
        }
    });

    socket.on('shoot', (data) => socket.to(ROOM).emit('playerShot', data));

    socket.on('playerTagged', (targetId) => {
        let s = players[socket.id], t = players[targetId];
        // Server-Side Distance check (Anti-Cheat)
        if (s && t && t.hp > 0 && Math.hypot(s.x - t.x, s.y - t.y) < 1000) {
            t.hp -= 1; t.lastHit = Date.now(); s.score += 10;
            if (t.hp <= 0) { io.to(t.id).emit('youDied'); checkWin(); }
            
            io.to(ROOM).emit('stateUpdate', players);
            io.to(ROOM).emit('leaderboardSync', getLeaderboard());
            syncDB(); 
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        updateLobby(); checkWin();
        io.to(ROOM).emit('playerDisconnected', socket.id);
        io.to(ROOM).emit('leaderboardSync', getLeaderboard());
        syncDB();
    });
});

server.listen(process.env.PORT || 3000);
