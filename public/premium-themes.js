// =========================================
// SesliChat — Premium Arka Plan Temaları
// 6 tema: Aurora / Kar / Yağmur / Neon / Galaksi / Şimşek + Sis + Matrix
// Her kullanıcı kendi temasını seçer, localStorage'da saklanır
// =========================================

(function() {
    'use strict';

    const THEMES = {
        galaxy: { id: 'galaxy', icon: '🌟', name: 'Galaksi', desc: 'Yıldız + gezegenler (varsayılan)' },
        aurora: { id: 'aurora', icon: '🌌', name: 'Kuzey Işıkları', desc: 'Aurora borealis' },
        snow: { id: 'snow', icon: '❄️', name: 'Kar Yağışı', desc: 'Gerçek kar taneleri' },
        rain: { id: 'rain', icon: '🌧️', name: 'Yoğun Yağmur', desc: 'Cama çarpan damlalar' },
        neon: { id: 'neon', icon: '💡', name: 'Neon Işıklar', desc: 'Renkli neon şeritler' },
        lightning: { id: 'lightning', icon: '⚡', name: 'Şimşek', desc: 'Fırtına + çakmalar' },
        fog: { id: 'fog', icon: '🌫️', name: 'Sisli', desc: 'Hareketli sis katmanları' },
        matrix: { id: 'matrix', icon: '🟢', name: 'Matrix', desc: 'Dijital yağmur' }
    };

    // === Active particle animations ===
    let activeAnimation = null;
    let activeCanvases = [];

    // ============================================
    // SNOW — gerçekçi kar taneleri, iz YOK (clearRect)
    // ============================================
    function initSnow(canvas) {
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        const flakes = [];
        const flakeCount = window.innerWidth < 768 ? 70 : 140;
        for (let i = 0; i < flakeCount; i++) {
            const rand = Math.random();
            let flake;
            if (rand < 0.65) {
                // 65% — küçük nokta (gerçek kar tanelerinin çoğu böyle)
                flake = {
                    type: 'dot',
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: 1 + Math.random() * 1.8,
                    speedY: 0.4 + Math.random() * 1.2,
                    speedX: -0.15 + Math.random() * 0.3,
                    opacity: 0.5 + Math.random() * 0.5,
                    sway: Math.random() * Math.PI * 2,
                    swaySpeed: 0.004 + Math.random() * 0.01
                };
            } else if (rand < 0.88) {
                // 23% — orta 6 kollu yıldız
                flake = {
                    type: 'star',
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: 2.5 + Math.random() * 2,
                    speedY: 0.6 + Math.random() * 1.5,
                    speedX: -0.3 + Math.random() * 0.6,
                    opacity: 0.7 + Math.random() * 0.3,
                    sway: Math.random() * Math.PI * 2,
                    swaySpeed: 0.005 + Math.random() * 0.012,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: -0.008 + Math.random() * 0.016
                };
            } else {
                // 12% — büyük detaylı kar tanesi (dallı)
                flake = {
                    type: 'flake',
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: 4 + Math.random() * 3,
                    speedY: 0.7 + Math.random() * 1.8,
                    speedX: -0.35 + Math.random() * 0.7,
                    opacity: 0.85 + Math.random() * 0.15,
                    sway: Math.random() * Math.PI * 2,
                    swaySpeed: 0.005 + Math.random() * 0.012,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: -0.012 + Math.random() * 0.024
                };
            }
            flakes.push(flake);
        }

        function drawSnowflake(ctx, f) {
            ctx.save();
            ctx.translate(f.x, f.y);
            if (f.rotation !== undefined) ctx.rotate(f.rotation);
            ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
            ctx.strokeStyle = `rgba(255, 255, 255, ${f.opacity})`;

            if (f.type === 'dot') {
                // Basit nokta
                ctx.beginPath();
                ctx.arc(0, 0, f.r, 0, Math.PI * 2);
                ctx.fill();
            } else if (f.type === 'star') {
                // 6 kollu yıldız
                ctx.lineWidth = 1;
                ctx.lineCap = 'round';
                for (let i = 0; i < 6; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 3);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -f.r);
                    ctx.stroke();
                    ctx.restore();
                }
                // Merkez nokta
                ctx.beginPath();
                ctx.arc(0, 0, f.r * 0.3, 0, Math.PI * 2);
                ctx.fill();
            } else if (f.type === 'flake') {
                // Tam kar tanesi — 6 kol + dallar
                ctx.lineWidth = 1.2;
                ctx.lineCap = 'round';
                for (let i = 0; i < 6; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 3);
                    // Ana kol
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -f.r);
                    ctx.stroke();
                    // Dallar (üst kısım)
                    ctx.beginPath();
                    ctx.moveTo(0, -f.r * 0.4);
                    ctx.lineTo(-f.r * 0.3, -f.r * 0.6);
                    ctx.moveTo(0, -f.r * 0.4);
                    ctx.lineTo(f.r * 0.3, -f.r * 0.6);
                    ctx.stroke();
                    // Dallar (üst daha)
                    ctx.beginPath();
                    ctx.moveTo(0, -f.r * 0.7);
                    ctx.lineTo(-f.r * 0.22, -f.r * 0.88);
                    ctx.moveTo(0, -f.r * 0.7);
                    ctx.lineTo(f.r * 0.22, -f.r * 0.88);
                    ctx.stroke();
                    // Köşe topu
                    ctx.beginPath();
                    ctx.arc(0, -f.r, f.r * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                // Merkez top
                ctx.beginPath();
                ctx.arc(0, 0, f.r * 0.18, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function animate() {
            // CLEAR — İZ BIRAKMA!
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            flakes.forEach(f => {
                f.sway += f.swaySpeed;
                f.x += f.speedX + Math.sin(f.sway) * 0.5;
                f.y += f.speedY;
                if (f.rotation !== undefined) f.rotation += f.rotationSpeed;
                if (f.y > canvas.height + 10) {
                    f.y = -10;
                    f.x = Math.random() * canvas.width;
                }
                if (f.x > canvas.width + 10) f.x = -10;
                if (f.x < -10) f.x = canvas.width + 10;

                drawSnowflake(ctx, f);
            });

            if (activeAnimation === 'snow') {
                requestAnimationFrame(animate);
            }
        }
        animate();
    }

    // ============================================
    // RAIN — yoğun yağmur + cama çarpan damlalar + camda damlacıklar
    // ============================================
    function initRain(canvas) {
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        // 1. Yağmur damlaları (uzun, parlak, kalın)
        const drops = [];
        const dropCount = window.innerWidth < 768 ? 200 : 400;
        for (let i = 0; i < dropCount; i++) {
            drops.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                length: 18 + Math.random() * 30,  // uzun çizgiler
                speed: 14 + Math.random() * 16,
                thickness: 1.2 + Math.random() * 1.3,  // kalın
                opacity: 0.6 + Math.random() * 0.4
            });
        }

        // 2. Cama çarpan splash efektleri
        const splashes = [];
        const splashY = canvas.height - 25;

        // 3. Camda kalan damlacıklar (yavaşça aşağı kayar)
        const droplets = [];
        const dropletCount = window.innerWidth < 768 ? 25 : 50;
        for (let i = 0; i < dropletCount; i++) {
            droplets.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: 1.5 + Math.random() * 3.5,
                speed: 0.15 + Math.random() * 0.6,
                trail: 0,
                opacity: 0.4 + Math.random() * 0.4,
                stuck: Math.random() * 200 + 50  // bir süre sabit kalır
            });
        }

        // 4. Şimşek flash'ı (rastgele)
        let nextFlash = Date.now() + 5000 + Math.random() * 8000;
        let flashOpacity = 0;

        function animate() {
            // Hafif koyu arka plan (fırtına bulutları hissi)
            ctx.fillStyle = 'rgba(8, 10, 22, 0.18)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Şimşek flash
            if (Date.now() > nextFlash) {
                flashOpacity = 0.5 + Math.random() * 0.4;
                nextFlash = Date.now() + 6000 + Math.random() * 10000;
            }
            if (flashOpacity > 0) {
                ctx.fillStyle = `rgba(200, 220, 255, ${flashOpacity})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                flashOpacity -= 0.05;
            }

            // Yağmur damlaları — beyaz, kalın, çapraz
            drops.forEach(d => {
                // Çizgi gradyanı (üstte şeffaf, altta parlak)
                const grad = ctx.createLinearGradient(d.x, d.y, d.x - 5, d.y + d.length);
                grad.addColorStop(0, `rgba(220, 235, 255, 0)`);
                grad.addColorStop(0.5, `rgba(220, 235, 255, ${d.opacity * 0.7})`);
                grad.addColorStop(1, `rgba(255, 255, 255, ${d.opacity})`);
                ctx.strokeStyle = grad;
                ctx.lineWidth = d.thickness;
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - 5, d.y + d.length);  // 15° eğimli
                ctx.stroke();

                // Parlak baş noktası
                ctx.fillStyle = `rgba(255, 255, 255, ${d.opacity})`;
                ctx.beginPath();
                ctx.arc(d.x - 5, d.y + d.length, d.thickness * 0.8, 0, Math.PI * 2);
                ctx.fill();

                d.y += d.speed;
                d.x -= 1;
                if (d.y > splashY) {
                    // Splash oluştur
                    splashes.push({
                        x: d.x,
                        y: splashY,
                        r: 0,
                        maxR: 5 + Math.random() * 4,
                        opacity: 0.9
                    });
                    d.y = -d.length;
                    d.x = Math.random() * (canvas.width + 100);
                }
            });

            // Splash efektleri (cama çarpma)
            for (let i = splashes.length - 1; i >= 0; i--) {
                const s = splashes[i];
                // Yarım daire (üst kısım)
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, Math.PI, 0);
                ctx.strokeStyle = `rgba(220, 235, 255, ${s.opacity})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Etrafa sıçrayan küçük damlalar
                for (let j = 0; j < 4; j++) {
                    const angle = -Math.PI/2 + (j - 1.5) * 0.5;
                    const dist = s.r * 1.5;
                    ctx.beginPath();
                    ctx.arc(
                        s.x + Math.cos(angle) * dist,
                        s.y + Math.sin(angle) * dist - 2,
                        0.7, 0, Math.PI * 2
                    );
                    ctx.fillStyle = `rgba(220, 235, 255, ${s.opacity * 0.8})`;
                    ctx.fill();
                }

                s.r += 1;
                s.opacity -= 0.04;
                if (s.opacity <= 0 || s.r > s.maxR) splashes.splice(i, 1);
            }

            // Camda kalan damlacıklar (yavaşça aşağı kayar + iz bırakır)
            droplets.forEach(d => {
                if (d.stuck > 0) {
                    d.stuck--;
                } else {
                    // İz (trail)
                    if (d.trail > 0) {
                        const grad = ctx.createLinearGradient(d.x, d.y - d.trail, d.x, d.y);
                        grad.addColorStop(0, 'rgba(180, 200, 230, 0)');
                        grad.addColorStop(1, `rgba(200, 220, 255, ${d.opacity * 0.25})`);
                        ctx.fillStyle = grad;
                        ctx.fillRect(d.x - 1, d.y - d.trail, 2, d.trail);
                    }

                    d.y += d.speed;
                    d.trail += d.speed;
                    if (d.y > canvas.height + 10) {
                        d.y = -10;
                        d.x = Math.random() * canvas.width;
                        d.trail = 0;
                        d.stuck = Math.random() * 200 + 50;
                    }
                }

                // Damlacık gövdesi (cam efektli)
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 220, 255, ${d.opacity * 0.6})`;
                ctx.fill();
                // Highlight (parlak nokta)
                ctx.beginPath();
                ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${d.opacity * 0.8})`;
                ctx.fill();
            });

            if (activeAnimation === 'rain') {
                requestAnimationFrame(animate);
            }
        }
        animate();
    }

    // ============================================
    // GALAXY — yıldız + nebula + kayan yıldız + GEZEGENLER (rotasyonlu)
    // ============================================

    // Gezegen çizim fonksiyonu — kendi ekseninde döner
    function drawPlanet(ctx, p, canvasW, canvasH) {
        const x = p.x * canvasW;
        const y = p.y * canvasH;
        const r = p.r;

        ctx.save();
        ctx.translate(x, y);

        // 1. Atmosfer parıltısı (gezegenin etrafında ince halo)
        const haloGrad = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.3);
        haloGrad.addColorStop(0, p.haloColor || 'rgba(255, 255, 255, 0.15)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // 2. Satürn için arka halka (gezegenin arkasında kalan kısım)
        if (p.type === 'saturn') {
            ctx.save();
            ctx.rotate(-0.4);
            ctx.strokeStyle = 'rgba(220, 200, 150, 0.7)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.7, r * 0.4, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(180, 160, 120, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.4, r * 0.32, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Gezegen gövdesi (radial gradient — 3D küre efekti)
        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 0, 0, 0, r);
        grad.addColorStop(0, p.light);
        grad.addColorStop(0.7, p.mid);
        grad.addColorStop(1, p.dark);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 4. Dönen yüzey özellikleri (gezegenin klip içinde kalan kısmı)
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.rotate(p.rotation);

        if (p.type === 'jupiter') {
            // Yatay bantlar
            const bands = ['#8B5A2B', '#D4A66F', '#A67B5B', '#E8C490', '#7A4F2A', '#C89060'];
            const bh = r * 2 / bands.length;
            for (let i = 0; i < bands.length; i++) {
                ctx.fillStyle = bands[i];
                ctx.fillRect(-r, -r + i * bh, r * 2, bh + 0.5);
            }
            // Büyük Kırmızı Leke
            ctx.fillStyle = '#B04020';
            ctx.beginPath();
            ctx.ellipse(r * 0.3, r * 0.15, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'mars') {
            // Koyu yüzey özellikleri (Vallis Marineris benzeri)
            ctx.fillStyle = 'rgba(80, 30, 10, 0.5)';
            ctx.beginPath();
            ctx.ellipse(r * 0.2, -r * 0.1, r * 0.35, r * 0.15, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-r * 0.3, r * 0.3, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(r * 0.1, r * 0.5, r * 0.2, r * 0.08, 0.1, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'earth') {
            // Kıtalar (yeşil blob'lar)
            ctx.fillStyle = '#3A8B3A';
            ctx.beginPath();
            ctx.ellipse(-r * 0.3, -r * 0.15, r * 0.35, r * 0.4, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(r * 0.35, r * 0.25, r * 0.28, r * 0.22, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-r * 0.1, r * 0.45, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
            // Bulutlar (beyaz)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath();
            ctx.ellipse(r * 0.1, -r * 0.45, r * 0.4, r * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-r * 0.3, r * 0.5, r * 0.3, r * 0.08, 0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'saturn') {
            // Hafif bantlar
            const bands = ['#D4B070', '#E8C490', '#C8A060', '#D4B070', '#B8954F'];
            const bh = r * 2 / bands.length;
            for (let i = 0; i < bands.length; i++) {
                ctx.fillStyle = bands[i];
                ctx.fillRect(-r, -r + i * bh, r * 2, bh + 0.5);
            }
        } else if (p.type === 'venus') {
            // Sıcak bulut swoşları
            ctx.fillStyle = 'rgba(180, 140, 60, 0.4)';
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.ellipse(0, i * r * 0.3, r * 0.95, r * 0.07, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = 'rgba(220, 180, 100, 0.3)';
            ctx.beginPath();
            ctx.ellipse(r * 0.2, -r * 0.2, r * 0.5, r * 0.15, 0.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'mercury') {
            // Kraterler
            ctx.fillStyle = 'rgba(40, 35, 30, 0.6)';
            const craters = [
                { x: 0.4, y: -0.2, r: 0.18 },
                { x: -0.3, y: 0.3, r: 0.15 },
                { x: 0.1, y: 0.5, r: 0.12 },
                { x: -0.4, y: -0.4, r: 0.1 },
                { x: 0.5, y: 0.4, r: 0.08 }
            ];
            craters.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x * r, c.y * r, c.r * r, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore(); // un-clip

        // 5. DÖNMEYEN özellikler (kutuplar, halka ön kısmı)
        if (p.type === 'mars') {
            // Kutup buzulları (kuzey & güney)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.85, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, r * 0.88, r * 0.32, r * 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'earth') {
            // Kutup buzulları
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.9, r * 0.5, r * 0.15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, r * 0.9, r * 0.4, r * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // 6. Satürn ön halka (gezegenin önünde kalan kısım)
        if (p.type === 'saturn') {
            ctx.save();
            ctx.rotate(-0.4);
            ctx.strokeStyle = 'rgba(220, 200, 150, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.7, r * 0.4, 0, 0, Math.PI);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(180, 160, 120, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.4, r * 0.32, 0, 0, Math.PI);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(200, 180, 140, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 2.0, r * 0.48, 0, 0, Math.PI);
            ctx.stroke();
            ctx.restore();
        }

        // 7. Highlight (specular — sol üstten ışık)
        const highlight = ctx.createRadialGradient(
            -r * 0.35, -r * 0.35, 0,
            -r * 0.35, -r * 0.35, r * 0.7
        );
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        highlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 8. Gölge (terminator — karanlık taraf)
        const shadow = ctx.createRadialGradient(
            r * 0.4, r * 0.4, 0,
            r * 0.4, r * 0.4, r * 1.5
        );
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shadow.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Rotasyonu güncelle
        p.rotation += p.speed;
    }

    function initGalaxy(canvas) {
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        const stars = [];
        const starCount = window.innerWidth < 768 ? 150 : 300;
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.5,
                opacity: 0.3 + Math.random() * 0.7,
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.01 + Math.random() * 0.04,
                color: Math.random() > 0.85 ? '#FFD5A0' : (Math.random() > 0.5 ? '#FFFFFF' : '#A0C4FF')
            });
        }

        // Nebula cloud (büyük renkli spotlar)
        const nebulas = [
            { x: canvas.width * 0.2, y: canvas.height * 0.3, r: 250, color: 'rgba(124, 92, 252, 0.15)' },
            { x: canvas.width * 0.7, y: canvas.height * 0.6, r: 300, color: 'rgba(255, 110, 199, 0.12)' },
            { x: canvas.width * 0.5, y: canvas.height * 0.2, r: 200, color: 'rgba(0, 229, 255, 0.1)' }
        ];

        // === GEZEGENLER — kendi eksenlerinde yavaşça döner ===
        const planets = [
            { x: 0.12, y: 0.25, r: 22, type: 'mars',
              light: '#FFB088', mid: '#CC5533', dark: '#552211',
              haloColor: 'rgba(255, 120, 80, 0.2)',
              rotation: 0, speed: 0.005 },
            { x: 0.78, y: 0.20, r: 38, type: 'jupiter',
              light: '#F4D8A0', mid: '#C89060', dark: '#5C3A20',
              haloColor: 'rgba(220, 170, 100, 0.25)',
              rotation: 0, speed: 0.003 },
            { x: 0.85, y: 0.65, r: 18, type: 'earth',
              light: '#7FCCFF', mid: '#2266AA', dark: '#0A2244',
              haloColor: 'rgba(100, 180, 255, 0.25)',
              rotation: 0, speed: 0.008 },
            { x: 0.20, y: 0.75, r: 28, type: 'saturn',
              light: '#F4E0A0', mid: '#C8A060', dark: '#5C4020',
              haloColor: 'rgba(230, 200, 130, 0.2)',
              rotation: 0, speed: 0.004 },
            { x: 0.55, y: 0.15, r: 16, type: 'venus',
              light: '#FFF0B0', mid: '#DDB070', dark: '#554020',
              haloColor: 'rgba(255, 220, 120, 0.2)',
              rotation: 0, speed: 0.006 },
            { x: 0.42, y: 0.88, r: 14, type: 'mercury',
              light: '#C0BBB0', mid: '#7F7868', dark: '#3A3530',
              haloColor: 'rgba(180, 170, 150, 0.15)',
              rotation: 0, speed: 0.007 }
        ];

        const shootingStars = [];
        let lastShootingStar = 0;

        function animate(timestamp) {
            ctx.fillStyle = 'rgba(5, 8, 16, 0.6)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Nebula bulutları
            nebulas.forEach(n => {
                const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
                grad.addColorStop(0, n.color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
            });

            // Yıldızlar (twinkle)
            stars.forEach(s => {
                s.twinkle += s.twinkleSpeed;
                const alpha = s.opacity * (0.5 + 0.5 * Math.sin(s.twinkle));
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.globalAlpha = alpha;
                ctx.shadowColor = s.color;
                ctx.shadowBlur = s.r * 3;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // === GEZEGENLER ===
            planets.forEach(p => drawPlanet(ctx, p, canvas.width, canvas.height));

            // Kayan yıldız (her 3-7 saniyede bir)
            if (timestamp - lastShootingStar > 3000 + Math.random() * 4000) {
                lastShootingStar = timestamp;
                shootingStars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height * 0.5,
                    vx: 8 + Math.random() * 6,
                    vy: 4 + Math.random() * 3,
                    length: 60 + Math.random() * 40,
                    opacity: 1
                });
            }
            for (let i = shootingStars.length - 1; i >= 0; i--) {
                const s = shootingStars[i];
                const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 8, s.y - s.vy * 8);
                grad.addColorStop(0, `rgba(255, 255, 255, ${s.opacity})`);
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
                ctx.stroke();
                s.x += s.vx;
                s.y += s.vy;
                s.opacity -= 0.02;
                if (s.opacity <= 0 || s.x > canvas.width || s.y > canvas.height) {
                    shootingStars.splice(i, 1);
                }
            }

            if (activeAnimation === 'galaxy') {
                requestAnimationFrame(animate);
            }
        }
        requestAnimationFrame(animate);
    }

    // ============================================
    // MATRIX — dijital yağmur
    // ============================================
    function initMatrix(canvas) {
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops = new Array(columns).fill(0).map(() => Math.random() * canvas.height / fontSize);

        function animate() {
            // Hafif fade effect (izler kalır)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#00FF41';
            ctx.font = fontSize + 'px monospace';
            ctx.shadowColor = '#00FF41';
            ctx.shadowBlur = 4;

            for (let i = 0; i < drops.length; i++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                // Baş karakteri parlak
                if (Math.random() > 0.95) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(text, x, y);
                    ctx.fillStyle = '#00FF41';
                } else {
                    ctx.fillText(text, x, y);
                }

                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
            ctx.shadowBlur = 0;

            if (activeAnimation === 'matrix') {
                requestAnimationFrame(animate);
            }
        }
        animate();
    }

    // ============================================
    // TEMA UYGULA
    // ============================================
    function applyTheme(themeId) {
        // Önceki temayı durdur
        activeAnimation = null;
        activeCanvases.forEach(c => { try { c.getContext('2d').clearRect(0, 0, c.width, c.height); } catch (e) {} });

        // Tüm tema elementlerini gizle
        ['theme-snow-canvas', 'theme-rain-canvas', 'theme-galaxy-canvas', 'theme-matrix-canvas'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        ['theme-neon', 'theme-lightning', 'theme-fog'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Aurora orbs default görünür mü? (aurora hariç tüm temalarda orbs'ı azalt)
        // Not: Canvas'lar artık aurora-bg DIŞINDA - opacity change canvas'ları etkilemez
        const auroraBg = document.querySelector('.aurora-bg');
        if (auroraBg) {
            if (themeId === 'aurora') {
                auroraBg.style.opacity = '1';
            } else if (themeId === 'neon' || themeId === 'matrix') {
                auroraBg.style.opacity = '0.2';  // Neon/Matrix için aurora çok parlak
            } else if (themeId === 'rain' || themeId === 'lightning' || themeId === 'fog') {
                auroraBg.style.opacity = '0.25';  // Fırtına temalarında aurora sönük
            } else {
                auroraBg.style.opacity = '0.4';  // Snow, galaxy - aurora yardımcı
            }
        }

        // Yeni temayı aktif et
        if (themeId === 'snow') {
            const canvas = document.getElementById('theme-snow-canvas');
            canvas.classList.remove('hidden');
            activeAnimation = 'snow';
            activeCanvases = [canvas];
            initSnow(canvas);
        } else if (themeId === 'rain') {
            const canvas = document.getElementById('theme-rain-canvas');
            canvas.classList.remove('hidden');
            activeAnimation = 'rain';
            activeCanvases = [canvas];
            initRain(canvas);
        } else if (themeId === 'galaxy') {
            const canvas = document.getElementById('theme-galaxy-canvas');
            canvas.classList.remove('hidden');
            activeAnimation = 'galaxy';
            activeCanvases = [canvas];
            initGalaxy(canvas);
        } else if (themeId === 'matrix') {
            const canvas = document.getElementById('theme-matrix-canvas');
            canvas.classList.remove('hidden');
            activeAnimation = 'matrix';
            activeCanvases = [canvas];
            initMatrix(canvas);
        } else if (themeId === 'neon') {
            document.getElementById('theme-neon').classList.remove('hidden');
        } else if (themeId === 'lightning') {
            document.getElementById('theme-lightning').classList.remove('hidden');
        } else if (themeId === 'fog') {
            document.getElementById('theme-fog').classList.remove('hidden');
        }
        // aurora temayı için hiçbir şey gizleme (default)

        // Kaydet
        try { localStorage.setItem('chat-theme', themeId); } catch (e) {}

        // Buton güncelle
        const btn = document.getElementById('vrc-theme-btn');
        if (btn) {
            const theme = THEMES[themeId];
            const span = btn.querySelector('span:first-child');
            if (span) span.textContent = theme.icon;
        }
    }

    // ============================================
    // TEMA SEÇİCİ MODAL
    // ============================================
    function showThemePicker() {
        const old = document.getElementById('theme-picker-modal');
        if (old) old.remove();

        const currentTheme = localStorage.getItem('chat-theme') || 'galaxy';

        const modal = document.createElement('div');
        modal.id = 'theme-picker-modal';
        modal.className = 'ambient-picker-modal';
        modal.innerHTML = `
            <div class="apm-card">
                <div class="apm-header">
                    <h3>🎨 Arka Plan Teması</h3>
                    <button class="apm-close">✕</button>
                </div>
                <div class="apm-current">Şu an: <strong>${THEMES[currentTheme] ? THEMES[currentTheme].name : 'Bilinmeyen'}</strong></div>
                <div class="apm-grid apm-grid-themes">
                    ${Object.values(THEMES).map(t => `
                        <button class="apm-option ${t.id === currentTheme ? 'apm-option-active' : ''}" data-theme="${t.id}">
                            <span class="apm-icon">${t.icon}</span>
                            <span class="apm-name">${t.name}</span>
                            <span class="apm-desc">${t.desc}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="apm-warn">🌙 Tema sadece senin ekranında görünür, kişisel tercih.</div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.apm-close').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        modal.querySelectorAll('.apm-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const themeId = opt.dataset.theme;
                applyTheme(themeId);
                modal.querySelectorAll('.apm-option').forEach(o => o.classList.remove('apm-option-active'));
                opt.classList.add('apm-option-active');
                const cur = modal.querySelector('.apm-current strong');
                if (cur) cur.textContent = THEMES[themeId].name;
                setTimeout(close, 400);
            });
        });
    }

    // ============================================
    // BAŞLATMA
    // ============================================
    function initPremiumThemes() {
        // Buton event listener
        const btn = document.getElementById('vrc-theme-btn');
        if (btn) {
            btn.addEventListener('click', showThemePicker);
        }

        // Kaydedilmiş temayı yükle — default GALAXY
        const savedTheme = localStorage.getItem('chat-theme') || 'galaxy';
        // Sayfa yüklenir yüklenmez uygula (1s gecikme — canvas ready olsun)
        setTimeout(() => applyTheme(savedTheme), 1000);
        // Buton ikonunu ayarla
        const btn2 = document.getElementById('vrc-theme-btn');
        if (btn2) {
            const span2 = btn2.querySelector('span:first-child');
            if (span2) span2.textContent = (THEMES[savedTheme] || THEMES.galaxy).icon;
        }

        console.log('[Themes] Premium temalar yüklendi ✅');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initPremiumThemes, 1500);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initPremiumThemes, 1500));
    }
})();
