const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Redis } = require('@upstash/redis');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Upstash DB Connection (Updated with your specific keys)
const redis = new Redis({
    url: 'https://meet-satyr-111648.upstash.io',
    token: 'gQAAAAAAAbQgAAIgcDFmYjEyMjBjOGNjYmQ0ZTczYjllOWFhMjMyOTAzYTRmNA',
});

const JSON_LEADERBOARD_KEY = "bca_assignment_leaderboard"; 
const ROOM = "NEON_ARENA";
let localPlayers = {}; 

function getSortedLeaderboard() {
    return Object.values(localPlayers)
        .map(p => ({ name: p.name, score: p.score }))
        .sort((a, b) => b.score - a.score);
}

async function syncUpstash() {
    try {
        await redis.set(JSON_LEADERBOARD_KEY, JSON.stringify(getSortedLeaderboard()));
    } catch (err) {
        console.error("Upstash Error:", err.message);
    }
}

function checkWinCondition() {
    let alive = Object.values(localPlayers).filter(p => p.hp > 0);
    // Trigger win if more than 1 player was in the game, and only 1 is left
    if (Object.keys(localPlayers).length > 1 && alive.length <= 1) {
        let winner = alive.length === 1 ? alive[0].name : "Draw";
        io.to(ROOM).emit('matchOver', winner);
        
        // Reset lobby for next round
        Object.keys(localPlayers).forEach(id => {
            localPlayers[id].hp = 20;
            localPlayers[id].score = 0;
            localPlayers[id].x = Math.floor(Math.random() * 1800) + 100;
            localPlayers[id].y = Math.floor(Math.random() * 1800) + 100;
        });
    }
}

// Passive Healing: 0.2 HP per sec (0.02 per 100ms) if out of combat for 5s
setInterval(() => {
    let now = Date.now();
    let updated = false;
    Object.values(localPlayers).forEach(p => {
        if (p.hp > 0 && p.hp < 20 && (now - p.lastHit > 5000)) {
            p.hp = Math.min(20, p.hp + 0.02);
            updated = true;
        }
    });
    if (updated) io.to(ROOM).emit('stateUpdate', localPlayers);
}, 100);

io.on('connection', (socket) => {
    
    // --> NEW: Send the current player count to the lobby immediately on connect
    socket.emit('playerCountUpdate', Object.keys(localPlayers).length);

    socket.on('joinArena', (name) => {
        if (!name) return;
        localPlayers[socket.id] = { 
            id: socket.id, 
            name: name, 
            x: Math.floor(Math.random() * 1800) + 100, 
            y: Math.floor(Math.random() * 1800) + 100, 
            rotation: 0, score: 0, hp: 20, lastHit: 0
        };
        socket.join(ROOM);

        // --> NEW: Broadcast updated count to everyone's lobby
        io.emit('playerCountUpdate', Object.keys(localPlayers).length);

        socket.emit('matchInit', { players: localPlayers });
        io.to(ROOM).emit('stateUpdate', localPlayers);
        io.to(ROOM).emit('leaderboardSync', getSortedLeaderboard());
        syncUpstash();
    });

    socket.on('playerMovement', (data) => {
        if (localPlayers[socket.id]) {
            // --> NEW: Server-side clamping to prevent out-of-bounds exploits
            localPlayers[socket.id].x = Math.max(20, Math.min(1980, data.x));
            localPlayers[socket.id].y = Math.max(20, Math.min(1980, data.y));
            localPlayers[socket.id].rotation = data.rotation;
            socket.to(ROOM).emit('playerMoved', localPlayers[socket.id]); 
        }
    });

    socket.on('shoot', (data) => socket.to(ROOM).emit('playerShot', data));

    socket.on('playerTagged', (targetId) => {
        let shooter = localPlayers[socket.id];
        let target = localPlayers[targetId];

        if (shooter && target && target.hp > 0) {
            // --> NEW: Server-side logic validation. Checks if shooter is reasonably close to target.
            // This prevents hackers from killing players across the map.
            let distance = Math.hypot(shooter.x - target.x, shooter.y - target.y);
            
            if (distance < 1000) { // 1000px is generous for lag compensation
                target.hp -= 1;
                target.lastHit = Date.now();
                shooter.score += 10;
                
                if (target.hp <= 0) {
                    target.hp = 0;
                    io.to(target.id).emit('youDied');
                    checkWinCondition();
                }

                io.to(ROOM).emit('stateUpdate', localPlayers);
                io.to(ROOM).emit('leaderboardSync', getSortedLeaderboard());
                syncUpstash(); 
            }
        }
    });

    socket.on('disconnect', () => {
        delete localPlayers[socket.id];
        
        // --> NEW: Broadcast updated count to everyone's lobby
        io.emit('playerCountUpdate', Object.keys(localPlayers).length);
        
        checkWinCondition();
        io.to(ROOM).emit('playerDisconnected', socket.id);
        io.to(ROOM).emit('leaderboardSync', getSortedLeaderboard());
        syncUpstash();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
