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
        huzur: { id: 'huzur', icon: '🕊️', name: 'Huzur', desc: 'Video + dalga sesi' },
        hayal1: { id: 'hayal1', icon: '💫', name: 'Hayal1', desc: 'Sessiz video arka plan' },
        cicekler: { id: 'cicekler', icon: '🌸', name: 'Çiçekler', desc: 'Video + ses (portre)' }
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

    // === Gezegen texture'ları offscreen canvas'a pre-render (her gezegen için 1x) ===
    const planetTextures = {}; // type → offscreen canvas

    function getPlanetTexture(type, r) {
        const key = `${type}-${Math.round(r)}`;
        if (planetTextures[key]) return planetTextures[key];

        // Offscreen canvas — 2r x 2r (gezegenin tamamı + doku)
        const size = Math.ceil(r * 2.2);
        const off = document.createElement('canvas');
        off.width = size;
        off.height = size;
        const octx = off.getContext('2d');
        const cx = size / 2;
        const cy = size / 2;

        // Clip to circle
        octx.save();
        octx.beginPath();
        octx.arc(cx, cy, r, 0, Math.PI * 2);
        octx.clip();

        if (type === 'jupiter') {
            drawJupiterTexture(octx, cx, cy, r);
        } else if (type === 'saturn') {
            drawSaturnTexture(octx, cx, cy, r);
        } else if (type === 'mars') {
            drawMarsTexture(octx, cx, cy, r);
        } else if (type === 'earth') {
            drawEarthTexture(octx, cx, cy, r);
        } else if (type === 'venus') {
            drawVenusTexture(octx, cx, cy, r);
        } else if (type === 'mercury') {
            drawMercuryTexture(octx, cx, cy, r);
        }

        octx.restore();
        planetTextures[key] = off;
        return off;
    }

    // === JUPITER — dalgalı turbulent bantlar + Büyük Kırmızı Leke ===
    function drawJupiterTexture(ctx, cx, cy, r) {
        // Base color
        ctx.fillStyle = '#C9A878';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Dalgalı bantlar — sinusoidal y offset
        const bands = [
            { y: -0.85, h: 0.12, color1: '#8B5A2B', color2: '#A56B3A' },
            { y: -0.65, h: 0.15, color1: '#E8C490', color2: '#D4A66F' },
            { y: -0.45, h: 0.13, color1: '#A67B5B', color2: '#8B6543' },
            { y: -0.25, h: 0.16, color1: '#F0D0A0', color2: '#E8C490' },
            { y: -0.05, h: 0.14, color1: '#7A4F2A', color2: '#6B4020' },
            { y: 0.15, h: 0.17, color1: '#D4A66F', color2: '#C89060' },
            { y: 0.40, h: 0.13, color1: '#B8855A', color2: '#A67B5B' },
            { y: 0.60, h: 0.14, color1: '#E8C490', color2: '#D4A66F' },
            { y: 0.82, h: 0.12, color1: '#7A4F2A', color2: '#6B4020' }
        ];

        bands.forEach((band, i) => {
            const yStart = cy + band.y * r;
            const yEnd = yStart + band.h * r;
            // Gradient ile yumuşak geçiş
            const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
            grad.addColorStop(0, band.color1);
            grad.addColorStop(0.5, band.color2);
            grad.addColorStop(1, band.color1);
            ctx.fillStyle = grad;

            // Dalgalı kenarlar — sinus eğrisi
            ctx.beginPath();
            ctx.moveTo(cx - r, yStart);
            for (let x = -r; x <= r; x += 2) {
                const wave = Math.sin((x + i * 10) * 0.08 + i) * 4;
                ctx.lineTo(cx + x, yStart + wave);
            }
            for (let x = r; x >= -r; x -= 2) {
                const wave = Math.sin((x + i * 10 + 5) * 0.08 + i) * 4;
                ctx.lineTo(cx + x, yEnd + wave);
            }
            ctx.closePath();
            ctx.fill();
        });

        // Turbulent swirls — küçük girdaplar bantların içinde
        for (let i = 0; i < 12; i++) {
            const sx = cx + (Math.random() - 0.5) * r * 1.8;
            const sy = cy + (Math.random() - 0.5) * r * 1.6;
            const sr = 3 + Math.random() * 8;
            ctx.fillStyle = `rgba(${200 + Math.random() * 40}, ${150 + Math.random() * 40}, ${100 + Math.random() * 30}, ${0.3 + Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.ellipse(sx, sy, sr * 1.5, sr * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        // Büyük Kırmızı Leke — oval, salmon, çevresinde girdap
        const grsX = cx + r * 0.3;
        const grsY = cy + r * 0.18;
        // Outer ring (lighter)
        ctx.fillStyle = 'rgba(200, 100, 70, 0.5)';
        ctx.beginPath();
        ctx.ellipse(grsX, grsY, r * 0.28, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        // Inner spot (darker red)
        const grsGrad = ctx.createRadialGradient(grsX, grsY, 0, grsX, grsY, r * 0.25);
        grsGrad.addColorStop(0, '#C04030');
        grsGrad.addColorStop(0.6, '#A03020');
        grsGrad.addColorStop(1, '#802015');
        ctx.fillStyle = grsGrad;
        ctx.beginPath();
        ctx.ellipse(grsX, grsY, r * 0.22, r * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        // Spiral inside
        ctx.strokeStyle = 'rgba(220, 150, 120, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
            const rr = r * 0.18 * (1 - a / (Math.PI * 4));
            const px = grsX + Math.cos(a) * rr;
            const py = grsY + Math.sin(a) * rr * 0.5;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // === SATURN — ince bantlar + üstü düz ===
    function drawSaturnTexture(ctx, cx, cy, r) {
        ctx.fillStyle = '#E8D5A0';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        const bands = [
            { y: -0.80, h: 0.15, color: '#D4B070' },
            { y: -0.55, h: 0.18, color: '#F0DCAC' },
            { y: -0.30, h: 0.15, color: '#C8A060' },
            { y: -0.10, h: 0.18, color: '#E8D5A0' },
            { y: 0.15, h: 0.15, color: '#D4B070' },
            { y: 0.40, h: 0.18, color: '#F0DCAC' },
            { y: 0.65, h: 0.15, color: '#B8954F' }
        ];
        bands.forEach((band, i) => {
            const yStart = cy + band.y * r;
            const yEnd = yStart + band.h * r;
            const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
            grad.addColorStop(0, band.color);
            grad.addColorStop(0.5, band.color);
            grad.addColorStop(1, band.color);
            ctx.fillStyle = grad;
            // Subtle wave
            ctx.beginPath();
            ctx.moveTo(cx - r, yStart);
            for (let x = -r; x <= r; x += 3) {
                const wave = Math.sin((x + i * 5) * 0.05 + i) * 2;
                ctx.lineTo(cx + x, yStart + wave);
            }
            for (let x = r; x >= -r; x -= 3) {
                const wave = Math.sin((x + i * 5 + 3) * 0.05 + i) * 2;
                ctx.lineTo(cx + x, yEnd + wave);
            }
            ctx.closePath();
            ctx.fill();
        });

        // Kuzey kutupta hexagon (subtle, çok ince)
        ctx.strokeStyle = 'rgba(120, 100, 70, 0.3)';
        ctx.lineWidth = 1;
        const hexY = cy - r * 0.75;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = cx + Math.cos(a) * r * 0.18;
            const py = hexY + Math.sin(a) * r * 0.08;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // === MARS — koyu bölgeler + toz + Valles Marineris ===
    function drawMarsTexture(ctx, cx, cy, r) {
        // Base Mars red
        const baseGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        baseGrad.addColorStop(0, '#D67042');
        baseGrad.addColorStop(0.7, '#B8552E');
        baseGrad.addColorStop(1, '#8B3A20');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Syrtis Major — büyük koyu yeşil-kahve bölge
        ctx.fillStyle = 'rgba(70, 50, 30, 0.6)';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.2, cy - r * 0.4);
        ctx.bezierCurveTo(cx, cy - r * 0.3, cx + r * 0.3, cy - r * 0.1, cx + r * 0.4, cy + r * 0.2);
        ctx.bezierCurveTo(cx + r * 0.2, cy + r * 0.4, cx - r * 0.1, cy + r * 0.3, cx - r * 0.2, cy);
        ctx.bezierCurveTo(cx - r * 0.3, cy - r * 0.1, cx - r * 0.25, cy - r * 0.3, cx - r * 0.2, cy - r * 0.4);
        ctx.fill();

        // Koyu bölgeler (Mare Acidalium, Mare Erythraeum vb.)
        const darkRegions = [
            { x: -0.5, y: -0.5, w: 0.4, h: 0.25, rot: 0.3 },
            { x: 0.4, y: -0.3, w: 0.3, h: 0.2, rot: -0.5 },
            { x: -0.3, y: 0.4, w: 0.35, h: 0.18, rot: 0.1 },
            { x: 0.2, y: 0.55, w: 0.25, h: 0.12, rot: -0.3 }
        ];
        darkRegions.forEach(reg => {
            ctx.fillStyle = `rgba(80, 50, 25, ${0.4 + Math.random() * 0.2})`;
            ctx.beginPath();
            ctx.ellipse(cx + reg.x * r, cy + reg.y * r, reg.w * r, reg.h * r, reg.rot, 0, Math.PI * 2);
            ctx.fill();
        });

        // Valles Marineris — büyük kanyon çizgisi
        ctx.strokeStyle = 'rgba(40, 20, 10, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.3, cy + r * 0.1);
        ctx.bezierCurveTo(
            cx - r * 0.1, cy + r * 0.05,
            cx + r * 0.2, cy + r * 0.15,
            cx + r * 0.5, cy + r * 0.08
        );
        ctx.stroke();
        // Yan kanyonlar
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = `rgba(40, 20, 10, ${0.3 + Math.random() * 0.2})`;
            ctx.beginPath();
            const startX = cx + (Math.random() - 0.5) * r;
            const startY = cy + r * 0.1 + (Math.random() - 0.5) * r * 0.2;
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + (Math.random() - 0.5) * r * 0.3, startY + (Math.random() - 0.5) * r * 0.1);
            ctx.stroke();
        }

        // Toz fırtınası — açık kırmızı-turuncu hafif alanlar
        for (let i = 0; i < 8; i++) {
            const dx = cx + (Math.random() - 0.5) * r * 1.6;
            const dy = cy + (Math.random() - 0.5) * r * 1.6;
            const dr = 4 + Math.random() * 12;
            ctx.fillStyle = `rgba(255, 180, 100, ${0.15 + Math.random() * 0.15})`;
            ctx.beginPath();
            ctx.arc(dx, dy, dr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Kraterler — küçük çukurlar
        for (let i = 0; i < 15; i++) {
            const cr = cx + (Math.random() - 0.5) * r * 1.7;
            const cy_ = cy + (Math.random() - 0.5) * r * 1.7;
            const crSize = 1 + Math.random() * 4;
            ctx.fillStyle = 'rgba(60, 30, 15, 0.5)';
            ctx.beginPath();
            ctx.arc(cr, cy_, crSize, 0, Math.PI * 2);
            ctx.fill();
            // Highlight (krater kenarı)
            ctx.fillStyle = 'rgba(255, 180, 100, 0.3)';
            ctx.beginPath();
            ctx.arc(cr - 0.5, cy_ - 0.5, crSize * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // === EARTH — okyanuslar + kıtalar + bulutlar + buzullar ===
    function drawEarthTexture(ctx, cx, cy, r) {
        // Okyanus — derin mavi gradyan
        const oceanGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        oceanGrad.addColorStop(0, '#1E5A9E');
        oceanGrad.addColorStop(0.5, '#164580');
        oceanGrad.addColorStop(1, '#0A2A50');
        ctx.fillStyle = oceanGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Kıtalar — gerçekçi şekiller (basit bezier)
        // Afrika + Avrupa benzeri
        ctx.fillStyle = '#2D6B2D';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.15, cy - r * 0.4);
        ctx.bezierCurveTo(cx + r * 0.05, cy - r * 0.5, cx + r * 0.25, cy - r * 0.3, cx + r * 0.2, cy - r * 0.1);
        ctx.bezierCurveTo(cx + r * 0.3, cy + r * 0.1, cx + r * 0.15, cy + r * 0.4, cx - r * 0.05, cy + r * 0.45);
        ctx.bezierCurveTo(cx - r * 0.2, cy + r * 0.3, cx - r * 0.25, cy, cx - r * 0.15, cy - r * 0.4);
        ctx.fill();

        // Amerika benzeri (sol taraf)
        ctx.fillStyle = '#357A35';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.55, cy - r * 0.35);
        ctx.bezierCurveTo(cx - r * 0.45, cy - r * 0.5, cx - r * 0.35, cy - r * 0.2, cx - r * 0.4, cy + r * 0.1);
        ctx.bezierCurveTo(cx - r * 0.5, cy + r * 0.3, cx - r * 0.6, cy + r * 0.2, cx - r * 0.55, cy - r * 0.35);
        ctx.fill();

        // Asya/Avustralya (sağ alt)
        ctx.fillStyle = '#3A803A';
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.5, cy + r * 0.3, r * 0.2, r * 0.12, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Kıyı çizgileri (daha koyu yeşil)
        ctx.strokeStyle = 'rgba(20, 50, 20, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Çöller (kum rengi)
        ctx.fillStyle = 'rgba(200, 170, 100, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.1, cy - r * 0.15, r * 0.15, r * 0.08, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.45, cy + r * 0.05, r * 0.1, r * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bulut sistemi — swirl pattern
        for (let i = 0; i < 8; i++) {
            const clx = cx + (Math.random() - 0.5) * r * 1.8;
            const cly = cy + (Math.random() - 0.5) * r * 1.8;
            const clSize = 5 + Math.random() * 15;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.4})`;
            // Spiral bulut
            for (let j = 0; j < 5; j++) {
                const angle = j * 0.5;
                const dist = j * 2;
                ctx.beginPath();
                ctx.ellipse(clx + Math.cos(angle) * dist, cly + Math.sin(angle) * dist * 0.6, clSize - j, (clSize - j) * 0.5, angle, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Şehir ışıkları (gece tarafında) — küçük sarı noktalar
        for (let i = 0; i < 20; i++) {
            const lx = cx + (Math.random() - 0.5) * r * 1.8;
            const ly = cy + (Math.random() - 0.5) * r * 1.8;
            ctx.fillStyle = `rgba(255, 220, 100, ${0.2 + Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.arc(lx, ly, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // === VENUS — kalın bulut örtüsü, swirl ===
    function drawVenusTexture(ctx, cx, cy, r) {
        // Base cream-yellow
        const baseGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        baseGrad.addColorStop(0, '#F5E0A0');
        baseGrad.addColorStop(0.7, '#DDB070');
        baseGrad.addColorStop(1, '#A07840');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Yatay bulut şeritleri — dalgalı
        for (let i = -5; i <= 5; i++) {
            const y = cy + i * r * 0.18;
            const opacity = 0.2 + Math.random() * 0.3;
            ctx.fillStyle = `rgba(${200 + Math.random() * 50}, ${160 + Math.random() * 40}, ${80 + Math.random() * 30}, ${opacity})`;
            ctx.beginPath();
            ctx.moveTo(cx - r, y);
            for (let x = -r; x <= r; x += 4) {
                const wave = Math.sin(x * 0.06 + i * 0.5) * 6;
                ctx.lineTo(cx + x, y + wave);
            }
            for (let x = r; x >= -r; x -= 4) {
                const wave = Math.sin(x * 0.06 + i * 0.5 + 1) * 6;
                ctx.lineTo(cx + x, y + r * 0.06 + wave);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Büyük bulut girdapları
        for (let i = 0; i < 5; i++) {
            const sx = cx + (Math.random() - 0.5) * r * 1.5;
            const sy = cy + (Math.random() - 0.5) * r * 1.5;
            ctx.fillStyle = `rgba(220, 180, 100, ${0.3 + Math.random() * 0.2})`;
            // Çok ince spiral
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 4; a += 0.1) {
                const rr = (1 - a / (Math.PI * 4)) * r * 0.15;
                const px = sx + Math.cos(a) * rr;
                const py = sy + Math.sin(a) * rr * 0.5;
                if (a === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.lineWidth = 2;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.stroke();
        }
    }

    // === MERCURY — yoğun kraterli, gri ===
    function drawMercuryTexture(ctx, cx, cy, r) {
        const baseGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        baseGrad.addColorStop(0, '#A8A095');
        baseGrad.addColorStop(0.7, '#7F7868');
        baseGrad.addColorStop(1, '#4A4540');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Renk değişim bölgeleri
        for (let i = 0; i < 6; i++) {
            const rx = cx + (Math.random() - 0.5) * r * 1.7;
            const ry = cy + (Math.random() - 0.5) * r * 1.7;
            ctx.fillStyle = `rgba(${100 + Math.random() * 50}, ${90 + Math.random() * 40}, ${80 + Math.random() * 30}, 0.3)`;
            ctx.beginPath();
            ctx.ellipse(rx, ry, r * (0.15 + Math.random() * 0.15), r * (0.1 + Math.random() * 0.1), Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        // Kraterler — çeşitli boyutlarda + ışınlar
        for (let i = 0; i < 25; i++) {
            const cr = cx + (Math.random() - 0.5) * r * 1.7;
            const cy_ = cy + (Math.random() - 0.5) * r * 1.7;
            const csize = 1 + Math.random() * 6;
            // Işınlar (büyük kraterler için)
            if (csize > 4) {
                ctx.strokeStyle = `rgba(180, 170, 160, ${0.15 + Math.random() * 0.15})`;
                ctx.lineWidth = 0.5;
                for (let j = 0; j < 6; j++) {
                    const angle = (j / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(cr, cy_);
                    ctx.lineTo(cr + Math.cos(angle) * csize * 3, cy_ + Math.sin(angle) * csize * 3);
                    ctx.stroke();
                }
            }
            // Krater gölgesi
            ctx.fillStyle = `rgba(40, 35, 30, ${0.4 + Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.arc(cr, cy_, csize, 0, Math.PI * 2);
            ctx.fill();
            // Krater highlight (kenar)
            ctx.fillStyle = `rgba(200, 190, 180, ${0.3 + Math.random() * 0.2})`;
            ctx.beginPath();
            ctx.arc(cr - csize * 0.3, cy_ - csize * 0.3, csize * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // === ANA drawPlanet — gerçekçi render ===
    function drawPlanet(ctx, p, canvasW, canvasH) {
        const x = p.x * canvasW;
        const y = p.y * canvasH;
        const r = p.r;

        ctx.save();
        ctx.translate(x, y);

        // 1. Atmosfer halo — çok daha gerçekçi (limb brightening)
        const haloColor = p.haloColor || 'rgba(255, 255, 255, 0.15)';
        // Dış atmosferik saçılma
        const haloGrad = ctx.createRadialGradient(0, 0, r * 0.92, 0, 0, r * 1.4);
        haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        haloGrad.addColorStop(0.05, haloColor);
        haloGrad.addColorStop(0.5, haloColor.replace(/[\d.]+\)$/, '0.05)'));
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // 2. Satürn arka halka
        if (p.type === 'saturn') {
            ctx.save();
            ctx.rotate(-0.4);
            // Çoklu ince halka şeritleri (Cassini Division dahil)
            const ringColors = [
                { rx: 1.95, ry: 0.46, w: 1.5, c: 'rgba(180, 160, 120, 0.4)' },
                { rx: 1.80, ry: 0.43, w: 2.5, c: 'rgba(200, 180, 140, 0.6)' },
                { rx: 1.70, ry: 0.40, w: 3, c: 'rgba(220, 200, 150, 0.8)' },
                { rx: 1.55, ry: 0.36, w: 1, c: 'rgba(120, 100, 70, 0.2)' }, // Cassini Division
                { rx: 1.45, ry: 0.34, w: 2.5, c: 'rgba(210, 190, 150, 0.7)' },
                { rx: 1.30, ry: 0.30, w: 2, c: 'rgba(190, 170, 130, 0.5)' }
            ];
            ringColors.forEach(ring => {
                ctx.strokeStyle = ring.c;
                ctx.lineWidth = ring.w;
                ctx.beginPath();
                ctx.ellipse(0, 0, r * ring.rx, r * ring.ry, 0, Math.PI, Math.PI * 2);
                ctx.stroke();
            });
            ctx.restore();
        }

        // 3. Gezegen gövdesi — pre-rendered texture + rotation
        const texture = getPlanetTexture(p.type, r);
        if (texture) {
            ctx.save();
            ctx.rotate(p.rotation);
            // Texture'ı çiz — wrap around the sphere
            const texSize = texture.width;
            ctx.drawImage(texture, -texSize / 2, -texSize / 2);
            ctx.restore();
        }

        // 4. DÖNMEYEN özellikler (kutuplar)
        if (p.type === 'mars') {
            // Kuzey kutup buzu — küçük ve asimetrik
            const poleGrad = ctx.createRadialGradient(0, -r * 0.85, 0, 0, -r * 0.85, r * 0.4);
            poleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            poleGrad.addColorStop(0.6, 'rgba(220, 230, 240, 0.6)');
            poleGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = poleGrad;
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.85, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            // Güney kutup — daha küçük
            const poleGrad2 = ctx.createRadialGradient(0, r * 0.88, 0, 0, r * 0.88, r * 0.32);
            poleGrad2.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            poleGrad2.addColorStop(0.6, 'rgba(220, 230, 240, 0.5)');
            poleGrad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = poleGrad2;
            ctx.beginPath();
            ctx.ellipse(0, r * 0.88, r * 0.32, r * 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'earth') {
            // Kutup buzulları — yumuşak kenarlı
            const npole = ctx.createRadialGradient(0, -r * 0.9, 0, 0, -r * 0.9, r * 0.5);
            npole.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            npole.addColorStop(0.7, 'rgba(240, 245, 250, 0.4)');
            npole.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = npole;
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.9, r * 0.5, r * 0.15, 0, 0, Math.PI * 2);
            ctx.fill();
            const spole = ctx.createRadialGradient(0, r * 0.9, 0, 0, r * 0.9, r * 0.42);
            spole.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            spole.addColorStop(0.7, 'rgba(240, 245, 250, 0.35)');
            spole.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = spole;
            ctx.beginPath();
            ctx.ellipse(0, r * 0.9, r * 0.4, r * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Satürn ön halka (gezegenin önünde kalan kısım)
        if (p.type === 'saturn') {
            ctx.save();
            ctx.rotate(-0.4);
            const ringColorsFront = [
                { rx: 1.95, ry: 0.46, w: 1.5, c: 'rgba(180, 160, 120, 0.5)' },
                { rx: 1.80, ry: 0.43, w: 2.5, c: 'rgba(200, 180, 140, 0.7)' },
                { rx: 1.70, ry: 0.40, w: 3, c: 'rgba(220, 200, 150, 0.9)' },
                { rx: 1.55, ry: 0.36, w: 1, c: 'rgba(120, 100, 70, 0.3)' }, // Cassini Division
                { rx: 1.45, ry: 0.34, w: 2.5, c: 'rgba(210, 190, 150, 0.8)' },
                { rx: 1.30, ry: 0.30, w: 2, c: 'rgba(190, 170, 130, 0.6)' }
            ];
            ringColorsFront.forEach(ring => {
                ctx.strokeStyle = ring.c;
                ctx.lineWidth = ring.w;
                ctx.beginPath();
                ctx.ellipse(0, 0, r * ring.rx, r * ring.ry, 0, 0, Math.PI);
                ctx.stroke();
            });
            // Ring shadow on planet (in front)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.95, r * 0.22, 0, Math.PI * 0.1, Math.PI * 0.9);
            ctx.stroke();
            ctx.restore();
        }

        // 6. Specular highlight — sol üstten gelen güneş ışığı (limb brightening değil, atmospheric scattering)
        const highlight = ctx.createRadialGradient(
            -r * 0.4, -r * 0.4, 0,
            -r * 0.4, -r * 0.4, r * 0.9
        );
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        highlight.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 7. Terminator — gece/gündüz çizgisi (yumuşak gölge)
        const shadow = ctx.createRadialGradient(
            r * 0.5, r * 0.3, 0,
            r * 0.5, r * 0.3, r * 1.8
        );
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shadow.addColorStop(0.4, 'rgba(0, 0, 0, 0)');
        shadow.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 8. Atmospheric limb — gezegen kenarında ince atmosferik halka (Rayleigh saçılması)
        ctx.strokeStyle = p.haloColor ? p.haloColor.replace(/[\d.]+\)$/, '0.4)') : 'rgba(100, 150, 255, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r + 0.5, 0, Math.PI * 2);
        ctx.stroke();

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
        ['theme-snow-canvas', 'theme-rain-canvas', 'theme-galaxy-canvas'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        ['theme-fog'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        // Huzur videosunu gizle (başka temaya geçince)
        const huzurVid = document.getElementById('huzur-video');
        if (huzurVid && themeId !== 'huzur') {
            huzurVid.classList.add('hidden');
            try { huzurVid.pause(); } catch (e) {}
        }
        // Hayal1 videosunu gizle
        const hayal1Vid = document.getElementById('hayal1-video');
        if (hayal1Vid && themeId !== 'hayal1') {
            hayal1Vid.classList.add('hidden');
            try { hayal1Vid.pause(); } catch (e) {}
        }
        // Çiçekler videosunu gizle
        const ciceklerVid = document.getElementById('cicekler-video');
        if (ciceklerVid && themeId !== 'cicekler') {
            ciceklerVid.classList.add('hidden');
            try { ciceklerVid.pause(); } catch (e) {}
        }
        // Huzur audio control gizle
        const huzurAudioCtrl = document.getElementById('huzur-audio-control');
        if (huzurAudioCtrl && themeId !== 'huzur') {
            huzurAudioCtrl.style.display = 'none';
        }
        // Huzur active class'ı kaldır (paneller normale dönsün)
        document.body.classList.remove('theme-huzur-active');

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
        } else if (themeId === 'fog') {
            document.getElementById('theme-fog').classList.remove('hidden');
        } else if (themeId === 'huzur') {
            // === HUZUR TEMA — Video arka plan, sadece dalga sesi ===
            const vid = document.getElementById('huzur-video');
            if (vid) {
                vid.classList.remove('hidden');
                vid.muted = true;
                vid.volume = 0.3;
                vid.play().catch(() => {});
                // İlk kullanıcı tıklamasında sessiz modu kapat, %30 ses
                const unmuteOnInteraction = () => {
                    if (vid.muted) {
                        vid.muted = false;
                        vid.volume = 0.3;
                        vid.play().catch(() => {});
                    }
                    document.removeEventListener('click', unmuteOnInteraction);
                    document.removeEventListener('touchstart', unmuteOnInteraction);
                    document.removeEventListener('keydown', unmuteOnInteraction);
                };
                document.addEventListener('click', unmuteOnInteraction, { once: true });
                document.addEventListener('touchstart', unmuteOnInteraction, { once: true });
                document.addEventListener('keydown', unmuteOnInteraction, { once: true });
                // Volume %30'da sabit tut
                vid.addEventListener('volumechange', () => {
                    if (vid.volume > 0.3 && !vid.muted) vid.volume = 0.3;
                });
                vid.addEventListener('play', () => {
                    if (!vid.muted) vid.volume = 0.3;
                });
            }
            // Tüm panelleri şeffaf yap
            document.body.classList.add('theme-huzur-active');
        } else if (themeId === 'hayal1') {
            // === HAYAL1 TEMA — Sessiz video arka plan ===
            const vid = document.getElementById('hayal1-video');
            if (vid) {
                vid.classList.remove('hidden');
                vid.muted = true;  // sessiz zaten, ama browser policy
                vid.play().catch(() => {});
            }
            // Tüm panelleri şeffaf yap
            document.body.classList.add('theme-huzur-active');
        } else if (themeId === 'cicekler') {
            // === ÇİÇEKLER TEMA — Video + ses, %30 sabit ===
            const vid = document.getElementById('cicekler-video');
            if (vid) {
                vid.classList.remove('hidden');
                vid.muted = true;
                vid.volume = 0.3;
                vid.play().catch(() => {});
                // İlk tıklamada sessiz modu kapat — ses %30 sabit
                const unmuteCicekler = () => {
                    if (vid.muted) {
                        vid.muted = false;
                        vid.volume = 0.3;
                        vid.play().catch(() => {});
                    }
                    document.removeEventListener('click', unmuteCicekler);
                    document.removeEventListener('touchstart', unmuteCicekler);
                    document.removeEventListener('keydown', unmuteCicekler);
                };
                document.addEventListener('click', unmuteCicekler, { once: true });
                document.addEventListener('touchstart', unmuteCicekler, { once: true });
                document.addEventListener('keydown', unmuteCicekler, { once: true });
                // Volume %30'da sabit tut — loop'ta sıfırlanırsa geri al
                vid.addEventListener('volumechange', () => {
                    if (vid.volume > 0.3 && !vid.muted) {
                        vid.volume = 0.3;
                    }
                });
                vid.addEventListener('play', () => {
                    if (!vid.muted) vid.volume = 0.3;
                });
            }
            // Tüm panelleri şeffaf yap
            document.body.classList.add('theme-huzur-active');
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

        // === HUZUR AUDIO CONTROL ===
        const hMuteBtn = document.getElementById('huzur-mute-btn');
        const hVolSlider = document.getElementById('huzur-volume-slider');
        const hVolLabel = document.getElementById('huzur-volume-label');
        const hVid = document.getElementById('huzur-video');

        if (hMuteBtn && hVid) {
            let hMuted = true;
            hMuteBtn.addEventListener('click', () => {
                hMuted = !hMuted;
                if (hMuted) {
                    hVid.muted = true;
                    hMuteBtn.textContent = '🔇';
                } else {
                    hVid.muted = false;
                    const v = parseInt(hVolSlider ? hVolSlider.value : '30', 10) / 100;
                    hVid.volume = v;
                    hMuteBtn.textContent = '🔊';
                    if (hVid.paused) hVid.play().catch(() => {});
                }
            });
        }

        if (hVolSlider && hVid) {
            hVolSlider.addEventListener('input', (e) => {
                const v = parseInt(e.target.value, 10) / 100;
                hVid.volume = v;
                if (hVolLabel) hVolLabel.textContent = e.target.value + '%';
                if (v > 0 && hVid.muted) {
                    hVid.muted = false;
                    if (hMuteBtn) hMuteBtn.textContent = '🔊';
                } else if (v === 0 && !hVid.muted) {
                    hVid.muted = true;
                    if (hMuteBtn) hMuteBtn.textContent = '🔇';
                }
                if (hVid.paused) hVid.play().catch(() => {});
            });
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
