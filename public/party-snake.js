// =========================================
// SesliChat — Parti Konfeti + Neon Snake
// 1. Konfeti yağmuru (canvas + emoji rain, odaya broadcast)
// 2. Neon Snake oyunu (smooth hareket, particle, ses)
// =========================================

(function() {
    'use strict';

    // ============================================
    // 1. CONFETTI & EMOJI RAIN
    // ============================================

    const CONFETTI_COLORS = ['#FF3D6E', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6B6B', '#7C5CFF', '#FF6EC7', '#3DFFAB', '#FFE066', '#00E5FF'];
    const CONFETTI_SHAPES = ['square', 'circle', 'strip', 'triangle'];
    const PARTY_EMOJIS = ['🎉', '🎊', '🎈', '🎁', '⭐', '✨', '💖', '🔥', '🌟', '💫', '🥳', '🍾', '👑', '💯'];

    function startConfettiRain(duration) {
        duration = duration || 5000;

        // Önceki canvas'ı kaldır
        const old = document.getElementById('confetti-canvas');
        if (old) old.remove();

        // Canvas oluştur
        const canvas = document.createElement('canvas');
        canvas.id = 'confetti-canvas';
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;pointer-events:none;';
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');

        // 200 konfeti parçacığı
        const particles = [];
        const count = window.innerWidth < 768 ? 120 : 200;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -50 - Math.random() * canvas.height * 0.5,
                vx: -3 + Math.random() * 6,
                vy: 2 + Math.random() * 5,
                size: 5 + Math.random() * 10,
                color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: -0.3 + Math.random() * 0.6,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.04 + Math.random() * 0.08
            });
        }

        const startTime = Date.now();
        let stopped = false;

        function drawConfetti(p) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;

            if (p.shape === 'square') {
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            } else if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size/2, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.shape === 'strip') {
                ctx.fillRect(-p.size, -p.size/4, p.size * 2, p.size/2);
            } else if (p.shape === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(0, -p.size/2);
                ctx.lineTo(-p.size/2, p.size/2);
                ctx.lineTo(p.size/2, p.size/2);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        function animate() {
            const elapsed = Date.now() - startTime;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Fade out son 1 saniye
            let alpha = 1;
            if (elapsed > duration - 1000) {
                alpha = Math.max(0, 1 - (elapsed - (duration - 1000)) / 1000);
            }
            ctx.globalAlpha = alpha;

            particles.forEach(p => {
                p.sway += p.swaySpeed;
                p.x += p.vx + Math.sin(p.sway) * 1.5;
                p.y += p.vy;
                p.vy += 0.06; // yerçekimi
                p.rotation += p.rotationSpeed;

                // Ekrandan çıkınca yukarı dön
                if (p.y > canvas.height + 50) {
                    p.y = -50;
                    p.x = Math.random() * canvas.width;
                    p.vy = 2 + Math.random() * 5;
                }

                drawConfetti(p);
            });
            ctx.globalAlpha = 1;

            if (elapsed < duration) {
                requestAnimationFrame(animate);
            } else {
                canvas.remove();
            }
        }
        animate();

        // Aynı anda emoji yağmuru başlat
        startEmojiRain(Math.floor(count / 4), duration);
    }

    function startEmojiRain(count, duration) {
        const els = [];
        const startTime = Date.now();

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.textContent = PARTY_EMOJIS[Math.floor(Math.random() * PARTY_EMOJIS.length)];
            el.style.cssText = `
                position:fixed;
                z-index:99999;
                pointer-events:none;
                font-size:${24 + Math.random() * 28}px;
                left:${Math.random() * window.innerWidth}px;
                top:-50px;
                filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            `;
            document.body.appendChild(el);
            els.push({
                el: el,
                x: parseFloat(el.style.left),
                y: -50 - Math.random() * 300,
                vx: -2 + Math.random() * 4,
                vy: 2 + Math.random() * 4,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: -0.15 + Math.random() * 0.3,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.03 + Math.random() * 0.05
            });
        }

        function animate() {
            const elapsed = Date.now() - startTime;
            let alpha = 1;
            if (elapsed > duration - 1000) {
                alpha = Math.max(0, 1 - (elapsed - (duration - 1000)) / 1000);
            }

            els.forEach(e => {
                e.sway += e.swaySpeed;
                e.x += e.vx + Math.sin(e.sway) * 1.5;
                e.y += e.vy;
                e.vy += 0.04;
                e.rotation += e.rotationSpeed;

                if (e.y > window.innerHeight + 50) {
                    e.y = -50;
                    e.x = Math.random() * window.innerWidth;
                    e.vy = 2 + Math.random() * 4;
                }

                e.el.style.transform = `translate(${e.x - parseFloat(e.el.style.left)}px, ${e.y}px) rotate(${e.rotation}rad)`;
                e.el.style.opacity = alpha;
            });

            if (elapsed < duration) {
                requestAnimationFrame(animate);
            } else {
                els.forEach(e => e.el.remove());
            }
        }
        animate();
    }

    // ============================================
    // 2. NEON SNAKE OYUNU
    // ============================================

    class NeonSnake {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.gridSize = 20;
            this.cols = Math.floor(canvas.width / this.gridSize);
            this.rows = Math.floor(canvas.height / this.gridSize);
            // Canvas'ı grid'e tam oturt
            canvas.width = this.cols * this.gridSize;
            canvas.height = this.rows * this.gridSize;

            this.bestScore = parseInt(localStorage.getItem('snake-best') || '0', 10);
            this.audioCtx = null;
            this.reset();
        }

        reset() {
            const cx = Math.floor(this.cols / 2);
            const cy = Math.floor(this.rows / 2);
            // DİKKAT: snake[0] = head (baş), hareket yönü sağa olduğu için
            // head en sağda olmalı, gövde sola doğru uzanmalı
            this.snake = [
                {x: cx, y: cy},       // head (en sağda)
                {x: cx - 1, y: cy},   // orta
                {x: cx - 2, y: cy}    // tail (en solda)
            ];
            this.prevSnake = this.snake.map(s => ({...s}));
            this.direction = {x: 1, y: 0};
            this.nextDirection = {x: 1, y: 0};
            this.food = this.spawnFood();
            this.score = 0;
            this.gameOver = false;
            this.paused = false;
            this.started = false;
            this.moveInterval = 130; // başlangıç hızı
            this.lastMoveTime = 0;
            this.moveProgress = 0;
            this.particles = [];
            this.foodPulse = 0;
            this.deathAnim = 0;
            this.restartShown = false;
            this.updateScoreUI();
        }

        start() {
            this.reset();
            this.started = true;
            this.lastMoveTime = performance.now();
        }

        spawnFood() {
            let f;
            let attempts = 0;
            do {
                f = {
                    x: Math.floor(Math.random() * this.cols),
                    y: Math.floor(Math.random() * this.rows),
                    spawnTime: performance.now()
                };
                attempts++;
            } while (this.snake.some(s => s.x === f.x && s.y === f.y) && attempts < 100);
            return f;
        }

        setDirection(dir) {
            if (!this.started || this.gameOver) return;
            // 180° dönüşü engelle
            if (dir.x === -this.direction.x && dir.y === -this.direction.y) return;
            this.nextDirection = {x: dir.x, y: dir.y};
        }

        moveSnake() {
            this.direction = this.nextDirection;
            this.prevSnake = this.snake.map(s => ({...s}));

            const head = {
                x: this.snake[0].x + this.direction.x,
                y: this.snake[0].y + this.direction.y
            };

            // Duvar çarpışması
            if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
                this.die();
                return;
            }
            // Kendine çarpışma
            if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
                this.die();
                return;
            }

            this.snake.unshift(head);

            // Yem yendi
            if (head.x === this.food.x && head.y === this.food.y) {
                this.score += 10;
                this.playEatSound();
                // Particle burst
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    this.particles.push({
                        x: this.food.x * this.gridSize + this.gridSize/2,
                        y: this.food.y * this.gridSize + this.gridSize/2,
                        vx: Math.cos(angle) * (2 + Math.random() * 2),
                        vy: Math.sin(angle) * (2 + Math.random() * 2),
                        size: 3 + Math.random() * 2,
                        color: ['#FF3D6E', '#FFB0CC', '#FF6B6B'][Math.floor(Math.random() * 3)],
                        life: 1
                    });
                }
                this.food = this.spawnFood();
                // Hız artır
                if (this.moveInterval > 70) this.moveInterval -= 3;
                this.updateScoreUI();
            } else {
                this.snake.pop();
            }
        }

        die() {
            this.gameOver = true;
            this.deathAnim = 0;
            this.restartShown = false;
            this.playDeathSound();
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('snake-best', this.bestScore);
                this.updateScoreUI();
            }
            // Ölüm particle'ları
            this.snake.forEach(s => {
                for (let i = 0; i < 4; i++) {
                    this.particles.push({
                        x: s.x * this.gridSize + this.gridSize/2,
                        y: s.y * this.gridSize + this.gridSize/2,
                        vx: -3 + Math.random() * 6,
                        vy: -3 + Math.random() * 6,
                        size: 2 + Math.random() * 3,
                        color: '#7C5CFF',
                        life: 1
                    });
                }
            });
        }

        update(timestamp) {
            if (!this.started || this.gameOver) {
                // Particles yine de güncelle
                this.updateParticles();
                if (this.gameOver) {
                    this.deathAnim += 0.05;
                    // 1.5 saniye sonra restart butonu göster (ölüm animasyonu bitsin)
                    if (this.deathAnim > 1.5 && !this.restartShown) {
                        this.restartShown = true;
                        showSnakeRestartOverlay(this.score, this.bestScore);
                    }
                }
                return;
            }
            if (this.paused) {
                this.updateParticles();
                return;
            }

            if (timestamp - this.lastMoveTime > this.moveInterval) {
                this.moveSnake();
                this.lastMoveTime = timestamp;
                this.moveProgress = 0;
            } else {
                this.moveProgress = Math.min(1, (timestamp - this.lastMoveTime) / this.moveInterval);
            }

            this.foodPulse += 0.05;
            this.updateParticles();
        }

        updateParticles() {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.15;
                p.life -= 0.03;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }

        render() {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            // Background gradient
            const bgGrad = ctx.createLinearGradient(0, 0, w, h);
            bgGrad.addColorStop(0, 'rgba(11, 14, 20, 0.85)');
            bgGrad.addColorStop(1, 'rgba(20, 15, 35, 0.85)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, w, h);

            // Grid (çok subtle)
            ctx.strokeStyle = 'rgba(124, 92, 252, 0.06)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= this.cols; x++) {
                ctx.beginPath();
                ctx.moveTo(x * this.gridSize, 0);
                ctx.lineTo(x * this.gridSize, h);
                ctx.stroke();
            }
            for (let y = 0; y <= this.rows; y++) {
                ctx.beginPath();
                ctx.moveTo(0, y * this.gridSize);
                ctx.lineTo(w, y * this.gridSize);
                ctx.stroke();
            }

            // Yem (pulsing apple with glow)
            this.drawFood();

            // Particle'lar
            this.drawParticles();

            // Yılan (smooth interpolated + neon glow)
            this.drawSnake();

            // Game over ekranı
            if (this.gameOver) {
                this.drawGameOver();
            }
        }

        drawFood() {
            const x = this.food.x * this.gridSize + this.gridSize / 2;
            const y = this.food.y * this.gridSize + this.gridSize / 2;
            const pulse = 1 + Math.sin(this.foodPulse) * 0.15;
            const r = (this.gridSize / 2 - 2) * pulse;

            // Glow
            this.ctx.shadowColor = '#FF3D6E';
            this.ctx.shadowBlur = 20;

            // 3D apple (radial gradient)
            const grad = this.ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
            grad.addColorStop(0, '#FFD0DD');
            grad.addColorStop(0.6, '#FF3D6E');
            grad.addColorStop(1, '#8B1538');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(x, y, r, 0, Math.PI * 2);
            this.ctx.fill();

            // Highlight
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.beginPath();
            this.ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
            this.ctx.fill();

            // Sap
            this.ctx.fillStyle = '#3A8B3A';
            this.ctx.fillRect(x - 1, y - r - 3, 2, 4);

            this.ctx.shadowBlur = 0;
        }

        drawSnake() {
            const ctx = this.ctx;
            const t = this.gameOver ? 1 : this.moveProgress;
            const gs = this.gridSize;

            // Her segment için smooth pozisyon
            for (let i = this.snake.length - 1; i >= 0; i--) {
                const seg = this.snake[i];
                const prev = this.prevSnake[i] || seg;
                // Wrap-around düzelt: eğer prev ve seg arasında büyük fark varsa, geçiş smooth olmasın
                let dx = seg.x - prev.x;
                let dy = seg.y - prev.y;
                if (Math.abs(dx) > 1) dx = 0; // teleport olmuş
                if (Math.abs(dy) > 1) dy = 0;
                const x = (prev.x + dx * t) * gs + gs / 2;
                const y = (prev.y + dy * t) * gs + gs / 2;

                // Renk gradyanı (baş parlak, kuyruk koyu)
                const ratio = i / Math.max(1, this.snake.length - 1);
                const r = Math.round(124 - ratio * 60);
                const g = Math.round(252 - ratio * 100);
                const b = Math.round(252 - ratio * 80);
                const color = `rgb(${r}, ${g}, ${b})`;

                // Glow
                ctx.shadowColor = color;
                ctx.shadowBlur = 15;

                // Body (daire)
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(x, y, gs / 2 - 1, 0, Math.PI * 2);
                ctx.fill();

                // Bağlantı çizgisi (önceki segment ile)
                if (i < this.snake.length - 1) {
                    const nextSeg = this.snake[i + 1];
                    const nextPrev = this.prevSnake[i + 1] || nextSeg;
                    let ndx = nextSeg.x - nextPrev.x;
                    let ndy = nextSeg.y - nextPrev.y;
                    if (Math.abs(ndx) > 1) ndx = 0;
                    if (Math.abs(ndy) > 1) ndy = 0;
                    const nx = (nextPrev.x + ndx * t) * gs + gs / 2;
                    const ny = (nextPrev.y + ndy * t) * gs + gs / 2;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = gs - 2;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(nx, ny);
                    ctx.stroke();
                }
            }

            ctx.shadowBlur = 0;

            // Gözler (sadece başta, yöne göre)
            if (this.snake.length > 0 && !this.gameOver) {
                const head = this.snake[0];
                const prevHead = this.prevSnake[0] || head;
                let hdx = head.x - prevHead.x;
                let hdy = head.y - prevHead.y;
                if (Math.abs(hdx) > 1) hdx = 0;
                if (Math.abs(hdy) > 1) hdy = 0;
                const hx = (prevHead.x + hdx * t) * gs + gs / 2;
                const hy = (prevHead.y + hdy * t) * gs + gs / 2;
                this.drawEyes(hx, hy);
            }
        }

        drawEyes(x, y) {
            const ctx = this.ctx;
            const dir = this.direction;
            const eyeOffset = 3;
            const eyeSize = 2.5;

            // Göz pozisyonları (yönüne göre)
            const perp = {x: -dir.y, y: dir.x};
            const e1x = x + dir.x * eyeOffset + perp.x * eyeOffset;
            const e1y = y + dir.y * eyeOffset + perp.y * eyeOffset;
            const e2x = x + dir.x * eyeOffset - perp.x * eyeOffset;
            const e2y = y + dir.y * eyeOffset - perp.y * eyeOffset;

            // Beyaz göz
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(e1x, e1y, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e2x, e2y, eyeSize, 0, Math.PI * 2);
            ctx.fill();

            // Siyah pupil
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(e1x + dir.x, e1y + dir.y, eyeSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e2x + dir.x, e2y + dir.y, eyeSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        drawParticles() {
            const ctx = this.ctx;
            ctx.globalAlpha = 1;
            this.particles.forEach(p => {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }

        drawGameOver() {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            // Karartma
            ctx.fillStyle = `rgba(0, 0, 0, ${0.4 + Math.min(0.4, this.deathAnim * 0.4)})`;
            ctx.fillRect(0, 0, w, h);

            // Yazı
            ctx.fillStyle = '#FF3D6E';
            ctx.shadowColor = '#FF3D6E';
            ctx.shadowBlur = 20;
            ctx.font = 'bold 32px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('OYUN BİTTİ', w / 2, h / 2 - 20);

            ctx.shadowBlur = 10;
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '20px Inter, sans-serif';
            ctx.fillText('Skor: ' + this.score, w / 2, h / 2 + 15);

            if (this.score === this.bestScore && this.score > 0) {
                ctx.fillStyle = '#FFD93D';
                ctx.shadowColor = '#FFD93D';
                ctx.font = '16px Inter, sans-serif';
                ctx.fillText('🏆 YENİ REKOR!', w / 2, h / 2 + 40);
            }

            ctx.fillStyle = '#7C5CFF';
            ctx.font = '14px Inter, sans-serif';
            ctx.shadowBlur = 0;
            ctx.fillText('Yeniden başla ▶', w / 2, h / 2 + 70);
        }

        updateScoreUI() {
            const scoreEl = document.getElementById('snake-score');
            const bestEl = document.getElementById('snake-best');
            if (scoreEl) scoreEl.textContent = this.score;
            if (bestEl) bestEl.textContent = this.bestScore;
        }

        playEatSound() {
            try {
                if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const ctx = this.audioCtx;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            } catch (e) {}
        }

        playDeathSound() {
            try {
                if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const ctx = this.audioCtx;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) {}
        }
    }

    // ============================================
    // SNAKE GAME UI & LIFECYCLE
    // ============================================

    let snakeGame = null;
    let snakeAnimFrame = null;
    let snakeModal = null;
    let snakeCanvas = null;

    function showSnakeGame() {
        snakeModal = document.getElementById('snake-game-modal');
        snakeCanvas = document.getElementById('snake-canvas');

        if (!snakeModal || !snakeCanvas) return;
        snakeModal.classList.remove('hidden');

        // Responsive canvas
        const maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 250, 500);
        snakeCanvas.style.width = maxSize + 'px';
        snakeCanvas.style.height = maxSize + 'px';
        snakeCanvas.width = maxSize;
        snakeCanvas.height = maxSize;

        if (!snakeGame) {
            snakeGame = new NeonSnake(snakeCanvas);
        } else {
            snakeGame.canvas = snakeCanvas;
            snakeGame.ctx = snakeCanvas.getContext('2d');
            snakeGame.gridSize = 20;
            snakeGame.cols = Math.floor(snakeCanvas.width / snakeGame.gridSize);
            snakeGame.rows = Math.floor(snakeCanvas.height / snakeGame.gridSize);
            snakeCanvas.width = snakeGame.cols * snakeGame.gridSize;
            snakeCanvas.height = snakeGame.rows * snakeGame.gridSize;
            snakeGame.reset();
        }

        // Overlay göster
        const overlay = document.getElementById('snake-overlay');
        const title = document.getElementById('snake-overlay-title');
        const subtitle = document.getElementById('snake-overlay-subtitle');
        const startBtn = document.getElementById('snake-start-btn');
        if (overlay) overlay.classList.remove('hidden');
        if (title) title.textContent = 'Hazır mısın?';
        if (subtitle) subtitle.textContent = 'Yön tuşları veya kaydır';
        if (startBtn) startBtn.textContent = '▶ Başla';

        // Render loop başlat
        if (snakeAnimFrame) cancelAnimationFrame(snakeAnimFrame);
        function loop(ts) {
            if (snakeGame) {
                snakeGame.update(ts);
                snakeGame.render();
            }
            snakeAnimFrame = requestAnimationFrame(loop);
        }
        snakeAnimFrame = requestAnimationFrame(loop);
    }

    function hideSnakeGame() {
        if (snakeModal) snakeModal.classList.add('hidden');
        if (snakeAnimFrame) {
            cancelAnimationFrame(snakeAnimFrame);
            snakeAnimFrame = null;
        }
        if (snakeGame) snakeGame.paused = true;
    }

    function startSnakeGame() {
        if (!snakeGame) return;
        const overlay = document.getElementById('snake-overlay');
        if (overlay) overlay.classList.add('hidden');
        snakeGame.start();
    }

    // Game over'da restart butonu göster
    function showSnakeRestartOverlay(score, bestScore) {
        const overlay = document.getElementById('snake-overlay');
        const title = document.getElementById('snake-overlay-title');
        const subtitle = document.getElementById('snake-overlay-subtitle');
        const startBtn = document.getElementById('snake-start-btn');
        if (overlay) overlay.classList.remove('hidden');
        if (title) title.textContent = '💀 Oyun Bitti!';
        if (subtitle) {
            let txt = 'Skor: ' + score;
            if (score === bestScore && score > 0) {
                txt += ' · 🏆 Yeni Rekor!';
            } else {
                txt += ' · Rekor: ' + bestScore;
            }
            subtitle.textContent = txt;
        }
        if (startBtn) startBtn.textContent = '↻ Yeniden Başla';
    }

    // ============================================
    // KLAVYE & SWIPE KONTROL
    // ============================================
    function setupControls() {
        // Klavye
        document.addEventListener('keydown', (e) => {
            if (!snakeGame || !snakeGame.started || snakeGame.gameOver) return;
            const key = e.key.toLowerCase();
            if (key === 'arrowup' || key === 'w') { snakeGame.setDirection({x:0, y:-1}); e.preventDefault(); }
            else if (key === 'arrowdown' || key === 's') { snakeGame.setDirection({x:0, y:1}); e.preventDefault(); }
            else if (key === 'arrowleft' || key === 'a') { snakeGame.setDirection({x:-1, y:0}); e.preventDefault(); }
            else if (key === 'arrowright' || key === 'd') { snakeGame.setDirection({x:1, y:0}); e.preventDefault(); }
        });

        // Dokunmatik butonlar
        document.querySelectorAll('.sgm-dir-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!snakeGame || !snakeGame.started) return;
                const dir = btn.dataset.dir;
                if (dir === 'up') snakeGame.setDirection({x:0, y:-1});
                else if (dir === 'down') snakeGame.setDirection({x:0, y:1});
                else if (dir === 'left') snakeGame.setDirection({x:-1, y:0});
                else if (dir === 'right') snakeGame.setDirection({x:1, y:0});
            });
        });

        // Swipe (canvas üzerinde)
        let touchStart = null;
        const canvas = document.getElementById('snake-canvas');
        if (canvas) {
            canvas.addEventListener('touchstart', (e) => {
                const t = e.touches[0];
                touchStart = {x: t.clientX, y: t.clientY};
                e.preventDefault();
            }, {passive: false});
            canvas.addEventListener('touchmove', (e) => {
                if (!touchStart || !snakeGame || !snakeGame.started) return;
                const t = e.touches[0];
                const dx = t.clientX - touchStart.x;
                const dy = t.clientY - touchStart.y;
                if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        snakeGame.setDirection({x: dx > 0 ? 1 : -1, y: 0});
                    } else {
                        snakeGame.setDirection({x: 0, y: dy > 0 ? 1 : -1});
                    }
                    touchStart = null;
                }
                e.preventDefault();
            }, {passive: false});
        }

        // Modal butonları
        const closeBtn = document.getElementById('snake-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', hideSnakeGame);
        const startBtn = document.getElementById('snake-start-btn');
        if (startBtn) startBtn.addEventListener('click', startSnakeGame);

        // Modal arka plan tıklayınca kapat
        const modal = document.getElementById('snake-game-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideSnakeGame();
            });
        }
    }

    // ============================================
    // BAŞLATMA
    // ============================================

    function initPartySnake() {
        // Parti butonu
        const partyBtn = document.getElementById('vrc-party-btn');
        if (partyBtn) {
            partyBtn.addEventListener('click', () => {
                // WS broadcast
                if (window.app && window.app.ws && window.app.currentRoom) {
                    window.app.ws.send(JSON.stringify({type: 'party-confetti'}));
                }
                startConfettiRain(5000);
                if (window.app) window.app.showToast('🎉', 'Parti başladı!');
            });
        }

        // Oyun butonu
        const gameBtn = document.getElementById('vrc-game-btn');
        if (gameBtn) {
            gameBtn.addEventListener('click', showSnakeGame);
        }

        // Kontrolleri hazırla
        setupControls();

        // WS handler hook — parti-confetti mesajını yakala
        if (window.app) {
            const orig = window.app.handleMessage.bind(window.app);
            window.app.handleMessage = function(msg) {
                if (msg.type === 'party-confetti') {
                    startConfettiRain(5000);
                    if (msg.username && msg.userId !== this.userId) {
                        this.showToast('🎉', msg.username + ' parti başlattı!');
                    }
                    return;
                }
                return orig(msg);
            };
        }

        console.log('[Party & Snake] Yüklendi ✅');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initPartySnake, 1500);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initPartySnake, 1500));
    }
})();
