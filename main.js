import * as Phaser from 'phaser';
import { io } from 'socket.io-client';

// ---> CHANGE THIS TO YOUR LOCAL IP <---
const SERVER_IP = 'https://phaser-server.onrender.com';
const socket = io(`http://${SERVER_IP}:3000`);

class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }

    create() {
        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        this.add.text(cx, cy - 100, 'NEON ARENA', { fontSize: '48px', fill: '#00ffcc', fontStyle: 'bold' }).setOrigin(0.5);
        this.status = this.add.text(cx, cy - 50, 'Connecting...', { fontSize: '18px', fill: '#ffaa00' }).setOrigin(0.5);

        socket.on('connect', () => this.status.setText('Server Online - Ready').setFill('#00ffcc'));

        const inputEl = document.getElementById('playerName');
        inputEl.style.display = 'block';

        const joinBtn = this.add.rectangle(cx, cy + 60, 220, 50, 0x00ffcc).setInteractive();
        this.add.text(cx, cy + 60, 'ENTER MATCH', { fontSize: '20px', fill: '#000', fontStyle: 'bold' }).setOrigin(0.5);

        joinBtn.on('pointerdown', () => {
            let name = inputEl.value.trim();
            if (!name) return alert("Enter a name!");
            inputEl.style.display = 'none';
            this.scene.start('ArenaScene', { playerName: name });
        });
    }
}

class ArenaScene extends Phaser.Scene {
    constructor() { super('ArenaScene'); }
    init(data) { this.myName = data.playerName; }

    preload() {
        // Load Audio Assets
        this.load.audio('bgm', 'https://labs.phaser.io/assets/audio/oedipus_wizball_highscore.ogg');
        this.load.audio('shootSnd', 'https://labs.phaser.io/assets/audio/SoundEffects/blaster.mp3');
    }

    create() {
        // --- AUDIO SETUP ---
        this.sound.play('bgm', { volume: 0.2, loop: true });

        // --- COOLDOWN VARIABLE ---
        this.lastFiredTime = 0;

        // --- CODE-GENERATED PLAYER GRAPHICS ---
        let g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(20, 20, 20);
        g.fillStyle(0x888888, 1);
        g.fillRect(20, 15, 25, 10);
        g.generateTexture('player_sprite', 50, 40);

        // Map Setup
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.add.grid(1000, 1000, 2000, 2000, 50, 50, 0x0d0d0d, 1, 0x222222, 1);

        this.playerMap = {};
        this.isDead = false;

        // Bullet Pool
        this.bullets = this.add.group({ classType: Phaser.GameObjects.Arc, maxSize: 40 });
        for (let i = 0; i < 40; i++) {
            this.bullets.add(this.add.circle(0, 0, 6, 0xffaa00).setActive(false).setVisible(false));
        }

        // Leaderboard UI
        this.add.rectangle(10, 10, 250, 150, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(100);
        this.add.text(20, 20, 'LIVE LEADERBOARD', { fontSize: '16px', fill: '#00ffcc', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);
        this.lbText = this.add.text(20, 45, 'Loading...', { fontSize: '14px', fill: '#fff', lineSpacing: 5 }).setScrollFactor(0).setDepth(100);

        // Death Screen UI
        this.deathScreen = this.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
        this.deathScreen.add(this.add.rectangle(this.cameras.main.centerX, this.cameras.main.centerY, 4000, 4000, 0xff0000, 0.5));
        this.deathScreen.add(this.add.text(this.cameras.main.centerX, this.cameras.main.centerY - 50, 'YOU DIED', { fontSize: '50px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
        let exitBtn = this.add.rectangle(this.cameras.main.centerX, this.cameras.main.centerY + 50, 200, 50, 0x000000).setInteractive();
        exitBtn.on('pointerdown', () => window.location.reload());
        this.deathScreen.add(exitBtn);
        this.deathScreen.add(this.add.text(this.cameras.main.centerX, this.cameras.main.centerY + 50, 'Main Menu', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5));

        // --- NETWORK LISTENERS ---
        socket.on('matchInit', (data) => {
            Object.keys(data.players).forEach(id => {
                if (id === socket.id) this.spawnMe(data.players[id]);
                else this.spawnOpponent(data.players[id]);
            });
        });

        socket.on('stateUpdate', (players) => {
            Object.keys(players).forEach(id => {
                let pData = players[id];
                if (id === socket.id && this.myShip && !this.isDead) {
                    this.updateHealthBar(this.myShip, pData.hp);
                } else if (this.playerMap[id]) {
                    if (pData.hp <= 0) {
                        this.removeOpponent(id);
                    } else {
                        this.updateHealthBar(this.playerMap[id], pData.hp);
                    }
                } else if (id !== socket.id && pData.hp > 0) {
                    this.spawnOpponent(pData);
                }
            });
        });

        socket.on('playerMoved', (data) => {
            const enemy = this.playerMap[data.id];
            if (enemy) {
                this.tweens.add({ targets: [enemy.container], x: data.x, y: data.y, duration: 50 });
                enemy.container.rotation = data.rotation;
                this.updateHealthBar(enemy, null);
            }
        });

        socket.on('playerShot', (data) => {
            // Play sound locally when others shoot
            this.sound.play('shootSnd', { volume: 0.1 });
            this.spawnBullet(data.x, data.y, data.vx, data.vy, false);
        });

        socket.on('leaderboardSync', (jsonArray) => {
            let text = "";
            jsonArray.slice(0, 5).forEach((p, i) => text += `${i + 1}. ${p.name}: ${Math.floor(p.score)} pts\n`);
            this.lbText.setText(text);
        });

        socket.on('playerDisconnected', (id) => this.removeOpponent(id));

        socket.on('youDied', () => {
            this.isDead = true;
            this.myShip.container.setVisible(false);
            this.myShip.label.setVisible(false);
            this.myShip.hpBg.setVisible(false);
            this.myShip.hpBar.setVisible(false);
            this.deathScreen.setVisible(true);
        });

        socket.on('matchOver', (winner) => {
            alert(`Match Over! Winner: ${winner}`);
            window.location.reload();
        });

        // Setup Controls
        this.isDesktop = this.sys.game.device.os.desktop;
        if (this.isDesktop) {
            this.wasd = this.input.keyboard.addKeys({ W: 87, A: 65, S: 83, D: 68 });
            this.input.on('pointerdown', (pointer) => this.fireWeapon(pointer));
        } else {
            this.setupMobileControls();
        }

        socket.emit('joinArena', this.myName);
    }

    setupMobileControls() {
        this.joyActive = false; this.joyAngle = 0; this.joyForce = 0;

        const joyZone = this.add.zone(0, 0, this.cameras.main.width / 2, this.cameras.main.height).setOrigin(0).setInteractive().setScrollFactor(0).setDepth(50);
        const base = this.add.circle(0, 0, 50, 0xffffff, 0.1).setVisible(false).setScrollFactor(0).setDepth(51);
        const thumb = this.add.circle(0, 0, 25, 0x00ffcc, 0.4).setVisible(false).setScrollFactor(0).setDepth(52);

        joyZone.on('pointerdown', (ptr) => { base.setPosition(ptr.x, ptr.y).setVisible(true); thumb.setPosition(ptr.x, ptr.y).setVisible(true); this.joyActive = true; });
        joyZone.on('pointermove', (ptr) => {
            if (ptr.isDown) {
                let dist = Phaser.Math.Distance.Between(base.x, base.y, ptr.x, ptr.y);
                this.joyAngle = Phaser.Math.Angle.Between(base.x, base.y, ptr.x, ptr.y);
                let clampedDist = Math.min(dist, 40);
                thumb.setPosition(base.x + Math.cos(this.joyAngle) * clampedDist, base.y + Math.sin(this.joyAngle) * clampedDist);
                this.joyForce = clampedDist / 40;
            }
        });
        joyZone.on('pointerup', () => { base.setVisible(false); thumb.setVisible(false); this.joyActive = false; this.joyForce = 0; });

        const fireX = this.cameras.main.width - 90;
        const fireY = this.cameras.main.height - 150;
        const fireBtn = this.add.circle(fireX, fireY, 50, 0xff0000, 0.4).setInteractive().setScrollFactor(0).setDepth(50);
        this.add.text(fireX, fireY, 'FIRE', { fontSize: '18px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
        fireBtn.on('pointerdown', () => this.fireWeapon(null));
    }

    createCharacterGraphic(x, y, isMe) {
        let bodyColor = isMe ? 0x00aaff : 0xff3333;
        let body = this.add.circle(0, 0, 20, bodyColor);
        let gun = this.add.rectangle(20, 8, 25, 8, 0x888888);
        return this.add.container(x, y, [body, gun]);
    }

    createUIElements(playerObj, info, isMe) {
        playerObj.label = this.add.text(info.x, info.y - 45, info.name, { fontSize: '14px', fill: isMe ? '#00ffcc' : '#fff' }).setOrigin(0.5);
        playerObj.hpBg = this.add.rectangle(info.x, info.y - 30, 40, 6, 0xff0000);
        playerObj.hpBar = this.add.rectangle(info.x, info.y - 30, 40, 6, 0x00ff00);
        playerObj.hp = info.hp;
        this.updateHealthBar(playerObj, info.hp);
    }

    updateHealthBar(playerObj, newHp) {
        if (newHp !== null) playerObj.hp = newHp;
        let cont = playerObj.container;
        if (playerObj.label) playerObj.label.setPosition(cont.x, cont.y - 45);
        if (playerObj.hpBg) playerObj.hpBg.setPosition(cont.x, cont.y - 30);
        if (playerObj.hpBar) {
            playerObj.hpBar.setPosition(cont.x - 20 + ((40 * (playerObj.hp / 20)) / 2), cont.y - 30);
            playerObj.hpBar.width = 40 * (playerObj.hp / 20);
        }
    }

    spawnMe(info) {
        this.myShip = { container: this.createCharacterGraphic(info.x, info.y, true) };
        this.createUIElements(this.myShip, info, true);
        this.cameras.main.startFollow(this.myShip.container);
    }

    spawnOpponent(info) {
        let container = this.createCharacterGraphic(info.x, info.y, false);
        this.playerMap[info.id] = { container: container };
        this.createUIElements(this.playerMap[info.id], info, false);
    }

    removeOpponent(id) {
        if (this.playerMap[id]) {
            this.playerMap[id].container.destroy();
            this.playerMap[id].hpBg.destroy();
            this.playerMap[id].hpBar.destroy();
            this.playerMap[id].label.destroy();
            delete this.playerMap[id];
        }
    }

    fireWeapon(pointer) {
        if (!this.myShip || this.isDead) return;

        // --- ENFORCE 1-SECOND COOLDOWN ---
        let now = Date.now();
        if (now - this.lastFiredTime < 1000) return; // Ignore input if < 1000ms
        this.lastFiredTime = now; // Update timestamp

        this.sound.play('shootSnd', { volume: 0.3 }); // Play sound

        if (this.isDesktop && pointer) {
            let worldX = pointer.x + this.cameras.main.scrollX;
            let worldY = pointer.y + this.cameras.main.scrollY;
            this.myShip.container.rotation = Phaser.Math.Angle.Between(this.myShip.container.x, this.myShip.container.y, worldX, worldY);
        }

        let vx = Math.cos(this.myShip.container.rotation) * 15;
        let vy = Math.sin(this.myShip.container.rotation) * 15;

        let barrelX = this.myShip.container.x + (Math.cos(this.myShip.container.rotation) * 30);
        let barrelY = this.myShip.container.y + (Math.sin(this.myShip.container.rotation) * 30);

        this.spawnBullet(barrelX, barrelY, vx, vy, true);
        socket.emit('shoot', { x: barrelX, y: barrelY, vx: vx, vy: vy });
    }

    spawnBullet(x, y, vx, vy, isMine) {
        let b = this.bullets.getFirstDead(false);
        if (b) { b.setActive(true).setVisible(true).setPosition(x, y); b.vx = vx; b.vy = vy; b.isMine = isMine; }
    }

    update() {
        if (!this.myShip || this.isDead) return;

        // Bullets & Hit Detection
        this.bullets.getChildren().forEach(b => {
            if (b.active) {
                b.x += b.vx; b.y += b.vy;
                if (b.isMine) {
                    Object.keys(this.playerMap).forEach(id => {
                        let enemy = this.playerMap[id].container;
                        if (Math.abs(b.x - enemy.x) < 30 && Math.abs(b.y - enemy.y) < 30) {
                            b.setActive(false).setVisible(false);
                            socket.emit('playerTagged', id);
                        }
                    });
                }
                if (b.x < 0 || b.x > 2000 || b.y < 0 || b.y > 2000) b.setActive(false).setVisible(false);
            }
        });

        let speed = 5; let moved = false;

        if (!this.isDesktop && this.joyActive) {
            this.myShip.container.x += Math.cos(this.joyAngle) * speed * this.joyForce;
            this.myShip.container.y += Math.sin(this.joyAngle) * speed * this.joyForce;
            this.myShip.container.rotation = this.joyAngle;
            moved = true;
        } else if (this.isDesktop) {
            if (this.wasd.A.isDown) { this.myShip.container.x -= speed; moved = true; }
            if (this.wasd.D.isDown) { this.myShip.container.x += speed; moved = true; }
            if (this.wasd.W.isDown) { this.myShip.container.y -= speed; moved = true; }
            if (this.wasd.S.isDown) { this.myShip.container.y += speed; moved = true; }

            if (moved && !this.input.activePointer.isDown) {
                let dx = (this.wasd.D.isDown ? 1 : 0) - (this.wasd.A.isDown ? 1 : 0);
                let dy = (this.wasd.S.isDown ? 1 : 0) - (this.wasd.W.isDown ? 1 : 0);
                this.myShip.container.rotation = Math.atan2(dy, dx);
            }
        }

        // Keep strictly inside the 2000x2000 grid
        this.myShip.container.x = Phaser.Math.Clamp(this.myShip.container.x, 20, 1980);
        this.myShip.container.y = Phaser.Math.Clamp(this.myShip.container.y, 20, 1980);

        if (moved) {
            this.updateHealthBar(this.myShip, null);
            socket.emit('playerMovement', { x: this.myShip.container.x, y: this.myShip.container.y, rotation: this.myShip.container.rotation });
        }
    }
}

const config = { type: Phaser.AUTO, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, parent: 'game-container', scene: [LobbyScene, ArenaScene] };
new Phaser.Game(config);