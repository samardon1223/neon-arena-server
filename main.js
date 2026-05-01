import * as Phaser from 'phaser';
import { io } from 'socket.io-client';

const SERVER_IP = 'https://phaser-server.onrender.com'; // Keep your current Render URL here
const socket = io(SERVER_IP); 

class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }
    create() {
        const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;
        
        this.add.text(cx, cy - 100, 'NEON ARENA', { fontSize: '48px', fill: '#00ffcc' }).setOrigin(0.5);
        this.status = this.add.text(cx, cy - 50, 'Connecting...', { fill: '#ffaa00' }).setOrigin(0.5);
        this.playerCount = this.add.text(cx, cy - 15, 'Players: 0', { fill: '#fff' }).setOrigin(0.5);

        socket.on('connect', () => this.status.setText('Ready').setFill('#00ffcc'));
        socket.on('playerCountUpdate', (c) => this.playerCount.setText(`Players: ${c}`));

        const inputEl = document.getElementById('playerName');
        inputEl.style.display = 'block';

        this.add.rectangle(cx, cy + 60, 220, 50, 0x00ffcc).setInteractive().on('pointerdown', () => {
            let name = inputEl.value.trim();
            if (!name) return alert("Enter a name!");
            inputEl.style.display = 'none';
            this.scene.start('ArenaScene', { playerName: name });
        });
        this.add.text(cx, cy + 60, 'ENTER MATCH', { color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    }
}

class ArenaScene extends Phaser.Scene {
    constructor() { super('ArenaScene'); }
    init(data) { this.myName = data.playerName; }
    
    preload() {
        this.load.audio('bgm', 'https://labs.phaser.io/assets/audio/oedipus_wizball_highscore.ogg');
        this.load.audio('shootSnd', 'https://labs.phaser.io/assets/audio/SoundEffects/blaster.mp3');
    }

    create() {
        this.sound.play('bgm', { volume: 0.2, loop: true });
        this.lastFire = 0; this.players = {}; this.isDead = false;

        // Map Setup
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.add.grid(1000, 1000, 2000, 2000, 50, 50, 0x0d0d0d, 1, 0x222222, 1);

        // Procedural Textures
        let g = this.make.graphics({ add: false }).fillStyle(0xffffff).fillCircle(20, 20, 20).fillStyle(0x888888).fillRect(20, 15, 25, 10);
        g.generateTexture('player_sprite', 50, 40);

        // Object Pooling for Bullets
        this.bullets = this.add.group({ classType: Phaser.GameObjects.Arc, maxSize: 40 });
        for(let i=0; i<40; i++) this.bullets.add(this.add.circle(0, 0, 6, 0xffaa00).setActive(false).setVisible(false));

        // UI Setup
        this.add.rectangle(10, 10, 250, 150, 0x000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(100);
        this.lbText = this.add.text(20, 20, 'LEADERBOARD\nLoading...', { fill: '#0ff', lineSpacing: 5 }).setScrollFactor(0).setDepth(100);

        // Death Screen
        this.deathUi = this.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
        this.deathUi.add([
            this.add.rectangle(this.cameras.main.centerX, this.cameras.main.centerY, 4000, 4000, 0xff0000, 0.5),
            this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 'YOU DIED\nClick anywhere to Restart', { fontSize: '40px', align: 'center' }).setOrigin(0.5)
        ]);
        this.input.on('pointerdown', () => { if(this.isDead) window.location.reload(); });

        // --- NETWORK LISTENERS ---
        socket.on('matchInit', (data) => Object.values(data.players).forEach(p => this.spawn(p, p.id === socket.id)));
        
        socket.on('stateUpdate', (players) => {
            Object.values(players).forEach(p => {
                let obj = p.id === socket.id ? this.myShip : this.players[p.id];
                if (obj && p.hp > 0) this.updateHp(obj, p.hp);
                else if (obj && p.hp <= 0 && p.id !== socket.id) this.removePlayer(p.id);
                else if (!obj && p.hp > 0 && p.id !== socket.id) this.spawn(p, false);
            });
        });

        socket.on('playerMoved', (p) => {
            if (this.players[p.id]) {
                this.tweens.add({ targets: this.players[p.id].cont, x: p.x, y: p.y, duration: 50 }); // Interpolation
                this.players[p.id].cont.rotation = p.rotation;
            }
        });

        socket.on('playerShot', (d) => { this.sound.play('shootSnd', { volume: 0.1 }); this.fire(d.x, d.y, d.vx, d.vy, false); });
        socket.on('leaderboardSync', (arr) => this.lbText.setText('LEADERBOARD\n' + arr.slice(0,5).map((p,i)=>`${i+1}. ${p.name}: ${p.score}`).join('\n')));
        socket.on('playerDisconnected', (id) => this.removePlayer(id));
        socket.on('youDied', () => { this.isDead = true; this.myShip.cont.setVisible(false); this.deathUi.setVisible(true); });
        socket.on('matchOver', (w) => { alert(`Winner: ${w}`); window.location.reload(); });

        // Controls Setup
        this.isDesktop = this.sys.game.device.os.desktop;
        if (this.isDesktop) {
            this.wasd = this.input.keyboard.addKeys('W,A,S,D');
            this.input.on('pointerdown', (ptr) => !this.isDead && this.playerShoot(ptr));
        } else this.setupMobile();

        socket.emit('joinArena', this.myName);
    }

    spawn(info, isMe) {
        let cont = this.add.container(info.x, info.y, [
            this.add.circle(0, 0, 20, isMe ? 0x00aaff : 0xff3333), 
            this.add.rectangle(20, 8, 25, 8, 0x888888)
        ]);
        let ui = {
            lbl: this.add.text(info.x, info.y - 45, info.name, { fontSize: '14px', fill: isMe ? '#0ff' : '#fff' }).setOrigin(0.5),
            bg: this.add.rectangle(info.x, info.y - 30, 40, 6, 0xf00),
            bar: this.add.rectangle(info.x, info.y - 30, 40, 6, 0x0f0)
        };
        let obj = { cont, ...ui, hp: info.hp };
        
        if (isMe) { this.myShip = obj; this.cameras.main.startFollow(cont); } 
        else this.players[info.id] = obj;
        this.updateHp(obj, info.hp);
    }

    removePlayer(id) {
        if (this.players[id]) {
            let p = this.players[id];
            [p.cont, p.lbl, p.bg, p.bar].forEach(x => x.destroy());
            delete this.players[id];
        }
    }

    updateHp(obj, hp) {
        obj.hp = hp; obj.lbl.setPosition(obj.cont.x, obj.cont.y - 45);
        obj.bg.setPosition(obj.cont.x, obj.cont.y - 30);
        obj.bar.setPosition(obj.cont.x - 20 + hp, obj.cont.y - 30).width = hp * 2; // Math simplified
    }

    playerShoot(ptr) {
        if (Date.now() - this.lastFire < 1000) return;
        this.lastFire = Date.now(); this.sound.play('shootSnd', { volume: 0.3 });
        
        if (this.isDesktop && ptr) {
            this.myShip.cont.rotation = Phaser.Math.Angle.Between(this.myShip.cont.x, this.myShip.cont.y, ptr.worldX, ptr.worldY);
        }
        let angle = this.myShip.cont.rotation;
        let data = { x: this.myShip.cont.x + Math.cos(angle)*30, y: this.myShip.cont.y + Math.sin(angle)*30, vx: Math.cos(angle)*15, vy: Math.sin(angle)*15 };
        
        this.fire(data.x, data.y, data.vx, data.vy, true);
        socket.emit('shoot', data);
    }

    fire(x, y, vx, vy, isMine) {
        let b = this.bullets.getFirstDead(false);
        if (b) Object.assign(b, {x, y, vx, vy, isMine}).setActive(true).setVisible(true);
    }

    setupMobile() {
        this.joy = { active: false, angle: 0, force: 0 };
        let zone = this.add.zone(0, 0, 1000, 2000).setOrigin(0).setInteractive().setScrollFactor(0);
        let base = this.add.circle(0,0,50,0xffffff,0.1).setVisible(false).setScrollFactor(0);
        let thumb = this.add.circle(0,0,25,0x00ffcc,0.4).setVisible(false).setScrollFactor(0);

        zone.on('pointerdown', p => { base.setPosition(p.x, p.y).setVisible(true); thumb.copyPosition(base).setVisible(true); this.joy.active = true; });
        zone.on('pointermove', p => {
            if(!p.isDown) return;
            let dist = Math.min(Phaser.Math.Distance.Between(base.x, base.y, p.x, p.y), 40);
            this.joy.angle = Phaser.Math.Angle.Between(base.x, base.y, p.x, p.y);
            this.joy.force = dist / 40;
            thumb.setPosition(base.x + Math.cos(this.joy.angle)*dist, base.y + Math.sin(this.joy.angle)*dist);
        });
        zone.on('pointerup', () => { base.setVisible(false); thumb.setVisible(false); this.joy.active = false; });

        this.add.circle(this.cameras.main.width - 90, this.cameras.main.height - 150, 50, 0xff0000, 0.4)
            .setInteractive().setScrollFactor(0).on('pointerdown', () => this.playerShoot());
    }

    update() {
        if (!this.myShip || this.isDead) return;
        let ship = this.myShip.cont, speed = 5, moved = false;

        // Bullet Logic & Collision
        this.bullets.getChildren().filter(b => b.active).forEach(b => {
            b.x += b.vx; b.y += b.vy;
            if (b.isMine) {
                Object.keys(this.players).forEach(id => {
                    if (Math.hypot(b.x - this.players[id].cont.x, b.y - this.players[id].cont.y) < 30) {
                        b.setActive(false).setVisible(false); socket.emit('playerTagged', id);
                    }
                });
            }
            if (b.x < 0 || b.x > 2000 || b.y < 0 || b.y > 2000) b.setActive(false).setVisible(false);
        });

        // Movement Math
        if (!this.isDesktop && this.joy.active) {
            ship.x += Math.cos(this.joy.angle) * speed * this.joy.force;
            ship.y += Math.sin(this.joy.angle) * speed * this.joy.force;
            ship.rotation = this.joy.angle; moved = true;
        } else if (this.isDesktop) {
            if (this.wasd.A.isDown) { ship.x -= speed; moved = true; }
            if (this.wasd.D.isDown) { ship.x += speed; moved = true; }
            if (this.wasd.W.isDown) { ship.y -= speed; moved = true; }
            if (this.wasd.S.isDown) { ship.y += speed; moved = true; }
            if (moved && !this.input.activePointer.isDown) {
                ship.rotation = Math.atan2((this.wasd.S.isDown?1:0) - (this.wasd.W.isDown?1:0), (this.wasd.D.isDown?1:0) - (this.wasd.A.isDown?1:0));
            }
        }

        ship.x = Phaser.Math.Clamp(ship.x, 20, 1980); ship.y = Phaser.Math.Clamp(ship.y, 20, 1980);
        if (moved) { this.updateHp(this.myShip, this.myShip.hp); socket.emit('playerMovement', { x: ship.x, y: ship.y, rotation: ship.rotation }); }
    }
}

const config = { type: Phaser.AUTO, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, parent: 'game-container', scene: [LobbyScene, ArenaScene] };
new Phaser.Game(config);
