// =========================================
// SesliChat — ÇILGIN FIKIRLER
// 1. Voice Thief (Ses Hırsızı) — sağ tık → sesini çal
// 2. Mafia (Werewolf) — full oyun
// 3. Uzay Yarışı — sesinle roketi hızlandır
// =========================================

(function() {
    'use strict';

    // ============================================
    // 1. SES HIRSIZI (VOICE THIEF)
    // ============================================

    // Whisper context menu'ya "Sesini Çal" seçeneği ekle
    function extendWhisperMenuForVoiceThief() {
        // Mevcut whisper menu'de "Fısıltı Modu" ve "Emoji Gönder" var
        // 3. seçenek olarak "Sesini Çal" ekle
        if (window.app && window.app.showWhisperMenu) {
            const orig = window.app.showWhisperMenu.bind(window.app);
            window.app.showWhisperMenu = function(targetId, x, y) {
                const self = this;
                const targetCard = document.getElementById('participant-' + targetId);
                const targetName = targetCard ? (targetCard.querySelector('.participant-name')?.textContent || 'Kullanıcı') : 'Kullanıcı';

                const old = document.getElementById('whisper-context-menu');
                if (old) old.remove();

                const menu = document.createElement('div');
                menu.id = 'whisper-context-menu';
                menu.className = 'whisper-context-menu';
                menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
                menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
                menu.innerHTML = `
                    <div class="wcm-header">👤 ${self.escapeHtml(targetName)}</div>
                    <button class="wcm-item" data-action="whisper">
                        <span style="font-size:20px;">🤫</span> Fısıltı Modu
                        <small>Sadece seni duyar</small>
                    </button>
                    <button class="wcm-item" data-action="emoji">
                        <span style="font-size:20px;">🎈</span> Emoji Gönder
                    </button>
                    <button class="wcm-item" data-action="steal">
                        <span style="font-size:20px;">🎙️</span> Sesini Çal
                        <small>30sn onun ses tonunla konuş</small>
                    </button>
                    <button class="wcm-item wcm-cancel" data-action="cancel">
                        <span style="font-size:20px;">✕</span> Kapat
                    </button>
                `;
                document.body.appendChild(menu);

                menu.addEventListener('click', function(e) {
                    const btn = e.target.closest('.wcm-item');
                    if (!btn) return;
                    const action = btn.dataset.action;
                    menu.remove();
                    if (action === 'whisper') {
                        self.startWhisper(targetId);
                    } else if (action === 'emoji') {
                        self.showEmojiPicker(targetId, x, y);
                    } else if (action === 'steal') {
                        startVoiceThief(targetId, targetName);
                    }
                });

                setTimeout(() => {
                    const closeHandler = function(ev) {
                        if (!menu.contains(ev.target)) {
                            menu.remove();
                            document.removeEventListener('click', closeHandler, true);
                        }
                    };
                    document.addEventListener('click', closeHandler, true);
                }, 50);
            };
        }
    }

    function startVoiceThief(targetId, targetName) {
        if (!window.app || !window.app.ws || !window.app.currentRoom) return;
        // Server'a ses çalma isteği gönder
        window.app.ws.send(JSON.stringify({
            type: 'voice-steal',
            targetId: targetId
        }));
        window.app.showToast('🎙️', targetName + ' sesi çalınıyor...');
    }

    function onVoiceStealApply(message) {
        if (!window.app) return;
        const targetName = message.targetUsername;
        const signature = message.voiceSignature || 0;
        const duration = message.duration || 30;

        // Voice changer'ı hazırla
        window.app.ensureVoiceChangerReady().then(ok => {
            if (!ok) {
                window.app.showToast('⚠️', 'Ses değiştirici hazır değil.');
                return;
            }
            // Hedefin pitch'ini uygula
            window.app.applyPitchToSoundTouch(signature);
            window.app.currentPitch = signature;
            // Buton görsel
            const btn = document.getElementById('vrc-whisper-btn');
            if (btn) btn.classList.add('active-fun');
            // Ses hırsızı aktif
            window.app.voiceThiefActive = true;
            window.app.voiceThiefTarget = message.targetId;
            window.app.showToast('🎙️', `Artık ${targetName} gibi konuşuyorsun! 30 saniye süre var.`);

            // Süre dolduğunda otomatik kapat
            if (window.app.voiceThiefTimer) clearTimeout(window.app.voiceThiefTimer);
            window.app.voiceThiefTimer = setTimeout(() => {
                stopVoiceThief();
            }, duration * 1000);

            // Süre sayaç
            let remaining = duration;
            const countdown = setInterval(() => {
                remaining--;
                if (btn && remaining > 0) {
                    const span = btn.querySelector('span:last-child');
                    if (span && window.app.voiceThiefActive) {
                        span.textContent = '🎙️ ' + remaining + 's';
                    }
                }
                if (remaining <= 0) {
                    clearInterval(countdown);
                    if (btn) {
                        const span = btn.querySelector('span:last-child');
                        if (span) span.textContent = 'Fısıltı';
                    }
                }
            }, 1000);
        });
    }

    function stopVoiceThief() {
        if (!window.app) return;
        // Pitch'i sıfırla
        if (window.app.applyPitchToSoundTouch && window.app.vcActive) {
            window.app.applyPitchToSoundTouch(0);
            window.app.currentPitch = 0;
        }
        if (window.app.voiceThiefTimer) clearTimeout(window.app.voiceThiefTimer);
        window.app.voiceThiefActive = false;
        // Server'a dur bildir
        if (window.app.ws && window.app.voiceThiefTarget) {
            window.app.ws.send(JSON.stringify({
                type: 'voice-steal-stop',
                targetId: window.app.voiceThiefTarget
            }));
            window.app.voiceThiefTarget = null;
        }
        const btn = document.getElementById('vrc-whisper-btn');
        if (btn) {
            btn.classList.remove('active-fun');
            const span = btn.querySelector('span:last-child');
            if (span) span.textContent = 'Fısıltı';
        }
    }

    function onVoiceStealNotify(message) {
        if (!window.app) return;
        if (window.app.userId !== message.fromUserId && window.app.userId !== message.toUserId) {
            window.app.showToast('🎙️', `${message.fromUsername} → ${message.toUsername} sesini çaldı!`);
        } else if (window.app.userId === message.toUserId) {
            window.app.showToast('🎙️', message.fromUsername + ' sesini çalıyor!');
        }
    }

    function onVoiceStealStopNotify(message) {
        // Sessizce temizle
    }

    // ============================================
    // 2. MAFIA OYUNU
    // ============================================

    function showMafiaModal() {
        const old = document.getElementById('mafia-modal');
        if (old) old.remove();

        const isAdmin = window.app && window.app.role === 'admin';
        const modal = document.createElement('div');
        modal.id = 'mafia-modal';
        modal.className = 'mafia-modal';
        modal.innerHTML = `
            <div class="mafia-card">
                <div class="mafia-header">
                    <h3>🕵️ Mafia (Werewolf)</h3>
                    <button class="mafia-close" id="mafia-close-btn">✕</button>
                </div>
                <div class="mafia-body" id="mafia-body">
                    <div class="mafia-intro">
                        <p>🎭 <strong>Klasik sesli Mafia oyunu</strong> — rolünü öğren, gece mafya birini seçer, gündüz herkes oylar.</p>
                        <div class="mafia-roles">
                            <div class="mafia-role"><span>🦇</span> Mafya — gece birini öldürür</div>
                            <div class="mafia-role"><span>👨‍⚕️</span> Doktor — gece birini kurtarır</div>
                            <div class="mafia-role"><span>👮</span> Polis — gece birini araştırır</div>
                            <div class="mafia-role"><span>👨‍🌾</span> Köylü — sadece gündüz oylar</div>
                        </div>
                        ${isAdmin ? '<button class="mafia-start-btn" id="mafia-start-btn">▶ Oyunu Başlat</button>' : '<div class="mafia-warn">⚠️ Sadece admin başlatabilir. Admin odaya girmesini iste.</div>'}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.mafia-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        if (isAdmin) {
            modal.querySelector('#mafia-start-btn').addEventListener('click', () => {
                if (window.app && window.app.ws) {
                    window.app.ws.send(JSON.stringify({ type: 'mafia-start' }));
                    window.app.showToast('🕵️', 'Mafia oyunu başlatılıyor...');
                }
            });
        }
    }

    function onMafiaRole(message) {
        const roleNames = {
            mafia: { name: '🦇 MAFYA', color: '#FF3D6E', desc: 'Geceleri birini öldür. Gündüz yakalanma!' },
            doctor: { name: '👨‍⚕️ DOKTOR', color: '#3DFFAB', desc: 'Her gece birini kurtarma şansı. Mafyayı engelle!' },
            police: { name: '👮 POLİS', color: '#4D96FF', desc: 'Her gece birini araştır, mafya mı öğren.' },
            villager: { name: '👨‍🌾 KÖYLÜ', color: '#FFD93D', desc: 'Sadece gündüz oy ver. Mafyayı yakala!' }
        };
        const role = roleNames[message.role] || roleNames.villager;
        window.app.showToast(role.name, role.desc);

        // Modal'da da göster
        let modal = document.getElementById('mafia-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mafia-modal';
            modal.className = 'mafia-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="mafia-card">
                <div class="mafia-header">
                    <h3>🕵️ Mafia — Gün ${message.day || 1}</h3>
                    <button class="mafia-close" onclick="this.closest('.mafia-modal').remove()">✕</button>
                </div>
                <div class="mafia-body" id="mafia-body">
                    <div class="mafia-role-display" style="color:${role.color}; text-align:center; padding:20px 10px;">
                        <div style="font-size:48px;">${role.name.split(' ')[0]}</div>
                        <div style="font-size:24px; font-weight:700; margin-top:8px;">${role.name}</div>
                        <div style="font-size:13px; opacity:0.8; margin-top:6px;">${role.desc}</div>
                    </div>
                    <div id="mafia-info-area" style="padding:10px; text-align:center; min-height:40px;"></div>
                    <div id="mafia-action-area" style="padding:10px;"></div>
                </div>
            </div>
        `;
    }

    function onMafiaInfo(message) {
        const area = document.getElementById('mafia-info-area');
        if (area) {
            area.innerHTML = `<div class="mafia-info-msg">${message.message}</div>`;
        }
        // Ayrıca toast'ta göster
        if (window.app) window.app.showToast('🕵️', message.message);
    }

    function onMafiaState(message) {
        const actionArea = document.getElementById('mafia-action-area');
        if (!actionArea) return;

        // Modal açık değilse aç
        if (!document.getElementById('mafia-modal')) {
            // Otomatik modal aç
            const modal = document.createElement('div');
            modal.id = 'mafia-modal';
            modal.className = 'mafia-modal';
            modal.innerHTML = `
                <div class="mafia-card">
                    <div class="mafia-header">
                        <h3>🕵️ Mafia — ${message.phase === 'night' ? '🌙 Gece' : message.phase === 'day' ? '☀️ Gündüz' : '🗳️ Oylama'} (Gün ${message.day})</h3>
                        <button class="mafia-close" onclick="this.closest('.mafia-modal').remove()">✕</button>
                    </div>
                    <div class="mafia-body" id="mafia-body">
                        <div id="mafia-info-area" style="padding:10px; text-align:center; min-height:40px;"></div>
                        <div id="mafia-action-area" style="padding:10px;"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const header = document.querySelector('.mafia-header h3');
        if (header) {
            const phaseLabel = message.phase === 'night' ? '🌙 Gece' : message.phase === 'day' ? '☀️ Gündüz' : '🗳️ Oylama';
            header.textContent = `🕵️ Mafia — ${phaseLabel} (Gün ${message.day})`;
        }

        const area = document.getElementById('mafia-action-area');
        if (!area) return;

        if (message.phase === 'night') {
            // Gece — rolüne göre aksiyon göster
            const myRole = window.app && window.app.mafiaRole;
            if (!myRole) {
                area.innerHTML = '<div class="mafia-info">🌙 Gece... Rolü bekliyorsun.</div>';
                return;
            }
            const alivePlayers = message.players.filter(p => p.alive && p.id !== window.app.userId);
            const playerButtons = alivePlayers.map(p => `<button class="mafia-target-btn" data-id="${p.id}">${p.username}</button>`).join('');

            if (myRole === 'mafia') {
                area.innerHTML = `
                    <div class="mafia-action-title">🦇 Bu gece kimi öldüreceksin?</div>
                    <div class="mafia-targets">${playerButtons}</div>
                `;
            } else if (myRole === 'doctor') {
                area.innerHTML = `
                    <div class="mafia-action-title">👨‍⚕️ Bu gece kimi kurtaracaksın?</div>
                    <div class="mafia-targets">${playerButtons}</div>
                `;
            } else if (myRole === 'police') {
                area.innerHTML = `
                    <div class="mafia-action-title">👮 Bu gece kimi araştıracaksın?</div>
                    <div class="mafia-targets">${playerButtons}</div>
                `;
            } else {
                area.innerHTML = '<div class="mafia-info">👨‍🌾 Sadece köylüsün, gece uyu. 🌙</div>';
                return;
            }

            area.querySelectorAll('.mafia-target-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.app.ws.send(JSON.stringify({
                        type: 'mafia-night-action',
                        targetId: btn.dataset.id
                    }));
                    area.innerHTML = '<div class="mafia-info">✅ Seçim yapıldı. Diğerlerini bekle...</div>';
                });
            });

            // Timer
            const deadline = message.deadline || (Date.now() + 30000);
            startMafiaTimer(area, deadline, 'Gece');
        } else if (message.phase === 'day') {
            const alivePlayers = message.players.filter(p => p.alive && p.id !== window.app.userId);
            const me = message.players.find(p => p.id === window.app.userId);
            area.innerHTML = `
                <div class="mafia-action-title">☀️ Gündüz — tartışın, sonra oylama</div>
                <div class="mafia-info">${me && me.alive ? 'Yaşıyorsun ✅' : 'Öldün 💀 (sadece izle)'}</div>
                <div class="mafia-players-list">
                    ${message.players.map(p => `<div class="mafia-player-row ${p.alive ? 'alive' : 'dead'}">${p.username} ${p.alive ? '✅' : '💀'}</div>`).join('')}
                </div>
            `;
            const deadline = message.deadline || (Date.now() + 60000);
            startMafiaTimer(area, deadline, 'Gündüz');
        } else if (message.phase === 'voting') {
            const me = message.players.find(p => p.id === window.app.userId);
            if (!me || !me.alive) {
                area.innerHTML = '<div class="mafia-info">💀 Öldün, oylamaya katılamazsın. İzle...</div>';
            } else {
                const alivePlayers = message.players.filter(p => p.alive && p.id !== window.app.userId);
                area.innerHTML = `
                    <div class="mafia-action-title">🗳️ Kimi eleyeceksin?</div>
                    <div class="mafia-targets">${alivePlayers.map(p => `<button class="mafia-target-btn" data-id="${p.id}">${p.username}</button>`).join('')}</div>
                `;
                area.querySelectorAll('.mafia-target-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        window.app.ws.send(JSON.stringify({
                            type: 'mafia-vote',
                            targetId: btn.dataset.id
                        }));
                        area.innerHTML = '<div class="mafia-info">✅ Oy verdin! Diğerlerini bekle...</div>';
                    });
                });
            }
            const deadline = message.deadline || (Date.now() + 30000);
            startMafiaTimer(area, deadline, 'Oylama');
        }
    }

    function startMafiaTimer(area, deadline, phaseName) {
        let timerEl = area.querySelector('.mafia-timer');
        if (!timerEl) {
            timerEl = document.createElement('div');
            timerEl.className = 'mafia-timer';
            area.appendChild(timerEl);
        }
        const update = () => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            timerEl.textContent = `${phaseName}: ${remaining}s`;
            if (remaining > 0) {
                setTimeout(update, 500);
            }
        };
        update();
    }

    function onMafiaNightEnd(message) {
        const infoArea = document.getElementById('mafia-info-area');
        let txt = '';
        if (message.saved) {
            txt = '🌅 Şehir huzur içinde uyandı. Doktor birini kurtardı! Hiç ölümcül saldırı yok.';
        } else if (message.killedUsername) {
            txt = `💀 Gece boyunca ${message.killedUsername} öldürüldü. Rolü: ${message.killedRole}`;
        } else {
            txt = '🌅 Şehir huzur içinde uyandı.';
        }
        if (infoArea) {
            infoArea.innerHTML = `<div class="mafia-info">${txt}</div>`;
        }
        if (window.app) window.app.showToast('🌙', txt);
    }

    function onMafiaVoteEnd(message) {
        const infoArea = document.getElementById('mafia-info-area');
        let txt;
        if (message.eliminatedUsername) {
            txt = `🗳️ ${message.eliminatedUsername} elendi! Rolü: ${message.eliminatedRole}`;
        } else {
            txt = '🗳️ Bu turda kimse elenmedi (oy berabere).';
        }
        if (infoArea) {
            infoArea.innerHTML = `<div class="mafia-info">${txt}</div>`;
        }
        if (window.app) window.app.showToast('🗳️', txt);
    }

    function onMafiaEnd(message) {
        const modal = document.getElementById('mafia-modal');
        if (modal) {
            const winnerText = message.reason === 'admin-iptal' ? 'Oyun admin tarafından iptal edildi.' : (message.winner === 'mafia' ? '🦇 MAFYA KAZANDI!' : '👨‍🌾 KÖYLÜLER KAZANDI!');
            modal.innerHTML = `
                <div class="mafia-card">
                    <div class="mafia-header">
                        <h3>🕵️ Mafia Bitti</h3>
                        <button class="mafia-close" onclick="this.closest('.mafia-modal').remove()">✕</button>
                    </div>
                    <div class="mafia-body" style="text-align:center;">
                        <div style="font-size:32px; font-weight:700; padding:20px;">${winnerText}</div>
                        <div style="margin:10px 0;">Tüm roller:</div>
                        <div class="mafia-players-list">
                            ${message.players.map(p => `<div class="mafia-player-row"><strong>${p.username}</strong> — ${p.role === 'mafia' ? '🦇' : p.role === 'doctor' ? '👨‍⚕️' : p.role === 'police' ? '👮' : '👨‍🌾'} ${p.role} ${p.alive ? '✅' : '💀'}</div>`).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        if (window.app) {
            window.app.mafiaRole = null;
            window.app.showToast('🎭', message.reason === 'admin-iptal' ? 'Oyun iptal edildi.' : (message.winner === 'mafia' ? 'Mafya kazandı!' : 'Köylüler kazandı!'));
        }
    }

    function onMafiaError(message) {
        if (window.app) window.app.showToast('❌', message.message);
    }

    // ============================================
    // 3. UZAY YARISI
    // ============================================

    let raceCanvas = null;
    let raceCtx = null;
    let raceAnimFrame = null;
    let racePlayers = new Map(); // userId -> { x, y, username, color, progress }
    let raceMyProgress = 0;
    let raceActive = false;
    let raceStars = [];

    function startSpaceRace() {
        if (!window.app || !window.app.ws || !window.app.currentRoom) {
            if (window.app) window.app.showToast('⚠️', 'Önce odaya katıl.');
            return;
        }
        window.app.ws.send(JSON.stringify({ type: 'space-race-start' }));
        window.app.showToast('🚀', 'Yarış başlıyor! Sesinle roketini hızlandır!');
    }

    function onSpaceRaceStart(message) {
        // Overlay canvas oluştur
        if (raceCanvas) raceCanvas.remove();
        raceCanvas = document.createElement('canvas');
        raceCanvas.id = 'space-race-canvas';
        raceCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99998;pointer-events:none;';
        raceCanvas.width = window.innerWidth;
        raceCanvas.height = window.innerHeight;
        document.body.appendChild(raceCanvas);
        raceCtx = raceCanvas.getContext('2d');

        // Yıldız arka planı
        raceStars = [];
        for (let i = 0; i < 200; i++) {
            raceStars.push({
                x: Math.random() * raceCanvas.width,
                y: Math.random() * raceCanvas.height,
                r: Math.random() * 1.5,
                speed: 0.5 + Math.random() * 2
            });
        }

        // Oyuncuları yerleştir (alt kısımda, yan yana)
        racePlayers = new Map();
        const playerCount = message.players.length;
        const trackWidth = raceCanvas.width / playerCount;
        message.players.forEach((p, i) => {
            racePlayers.set(p.id, {
                id: p.id,
                username: p.username,
                color: p.color || '#7C5CFF',
                x: trackWidth * (i + 0.5),
                y: raceCanvas.height - 60,
                progress: 0,
                trail: []
            });
        });
        raceMyProgress = 0;
        raceActive = true;

        // Canvas render loop
        if (raceAnimFrame) cancelAnimationFrame(raceAnimFrame);

        // Audio level tracker — mevcut analyser'ı kullan
        const self = window.app;
        let lastProgressSend = 0;

        function render(ts) {
            if (!raceActive || !raceCanvas) return;
            raceCtx.clearRect(0, 0, raceCanvas.width, raceCanvas.height);

            // Arkaplan (uzay)
            raceCtx.fillStyle = 'rgba(5, 8, 20, 0.6)';
            raceCtx.fillRect(0, 0, raceCanvas.width, raceCanvas.height);

            // Yıldızlar (hareketli)
            raceStars.forEach(s => {
                s.y += s.speed;
                if (s.y > raceCanvas.height) { s.y = 0; s.x = Math.random() * raceCanvas.width; }
                raceCtx.fillStyle = 'rgba(255, 255, 255, ' + (0.3 + Math.random() * 0.4) + ')';
                raceCtx.fillRect(s.x, s.y, s.r, s.r);
            });

            // Track çizgileri
            racePlayers.forEach((p, id) => {
                const targetY = raceCanvas.height - 60 - (raceCanvas.height - 120) * (p.progress / 100);
                // Trail
                p.trail.push({ x: p.x, y: p.y, life: 1 });
                if (p.trail.length > 15) p.trail.shift();
                p.trail.forEach((t, i) => {
                    t.life -= 0.07;
                    if (t.life > 0) {
                        raceCtx.fillStyle = p.color;
                        raceCtx.globalAlpha = t.life * 0.5;
                        raceCtx.beginPath();
                        raceCtx.arc(t.x, t.y, 3, 0, Math.PI * 2);
                        raceCtx.fill();
                    }
                });
                raceCtx.globalAlpha = 1;

                // Roket
                const x = p.x;
                const y = targetY;
                raceCtx.save();
                raceCtx.translate(x, y);
                // Glow
                raceCtx.shadowColor = p.color;
                raceCtx.shadowBlur = 15;
                // Roket gövdesi
                raceCtx.fillStyle = p.color;
                raceCtx.beginPath();
                raceCtx.moveTo(0, -12); // burun
                raceCtx.lineTo(8, 8);
                raceCtx.lineTo(4, 12);
                raceCtx.lineTo(-4, 12);
                raceCtx.lineTo(-8, 8);
                raceCtx.closePath();
                raceCtx.fill();
                // Pencere
                raceCtx.fillStyle = '#FFFFFF';
                raceCtx.beginPath();
                raceCtx.arc(0, -2, 3, 0, Math.PI * 2);
                raceCtx.fill();
                // Alev (eğer hareket ediyorsa)
                if (p.progress > 0 && p.progress < 100) {
                    raceCtx.fillStyle = '#FFD93D';
                    raceCtx.shadowColor = '#FF6B6B';
                    raceCtx.shadowBlur = 20;
                    raceCtx.beginPath();
                    raceCtx.moveTo(-3, 12);
                    raceCtx.lineTo(0, 12 + 8 + Math.random() * 4);
                    raceCtx.lineTo(3, 12);
                    raceCtx.closePath();
                    raceCtx.fill();
                }
                raceCtx.shadowBlur = 0;
                raceCtx.restore();

                // İsim + progress bar
                raceCtx.fillStyle = '#FFFFFF';
                raceCtx.font = '12px Inter, sans-serif';
                raceCtx.textAlign = 'center';
                raceCtx.fillText(p.username, x, y - 20);
                // Bar
                const barW = 40;
                const barH = 4;
                raceCtx.fillStyle = 'rgba(255,255,255,0.2)';
                raceCtx.fillRect(x - barW/2, raceCanvas.height - 30, barW, barH);
                raceCtx.fillStyle = p.color;
                raceCtx.fillRect(x - barW/2, raceCanvas.height - 30, barW * p.progress / 100, barH);
            });

            // Finish line (en üstte)
            raceCtx.strokeStyle = '#FFFFFF';
            raceCtx.lineWidth = 2;
            raceCtx.setLineDash([10, 5]);
            raceCtx.beginPath();
            raceCtx.moveTo(0, 60);
            raceCtx.lineTo(raceCanvas.width, 60);
            raceCtx.stroke();
            raceCtx.setLineDash([]);
            raceCtx.fillStyle = '#FFFFFF';
            raceCtx.font = '14px Inter, sans-serif';
            raceCtx.textAlign = 'center';
            raceCtx.fillText('🏁 FİNİŞ', raceCanvas.width / 2, 50);

            // Ses seviyemi ölç ve ilerlet
            if (self && self.analyser && !self.isMuted) {
                const dataArray = new Uint8Array(self.analyser.frequencyBinCount);
                self.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                if (avg > self.speakingThreshold) {
                    // Ses yüksek → ilerle
                    const increment = (avg - self.speakingThreshold) * 0.02;
                    raceMyProgress = Math.min(100, raceMyProgress + increment);
                    // Kendi progress'imi güncelle
                    const me = racePlayers.get(self.userId);
                    if (me) me.progress = raceMyProgress;
                }
            }

            // Progress gönder (500ms'de bir)
            if (ts - lastProgressSend > 500) {
                lastProgressSend = ts;
                if (self && self.ws) {
                    self.ws.send(JSON.stringify({
                        type: 'space-race-progress',
                        progress: raceMyProgress
                    }));
                }
            }

            raceAnimFrame = requestAnimationFrame(render);
        }
        raceAnimFrame = requestAnimationFrame(render);

        // Mobil banner
        showRaceBanner();
    }

    function showRaceBanner() {
        const old = document.getElementById('race-banner');
        if (old) old.remove();
        const banner = document.createElement('div');
        banner.id = 'race-banner';
        banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(124,92,252,0.9);color:#fff;padding:8px 16px;border-radius:20px;z-index:99999;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(124,92,252,0.4);';
        banner.textContent = '🚀 Konuş, roketin hızlansın! 60 saniye süre var.';
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 5000);
    }

    function onSpaceRaceProgress(message) {
        const p = racePlayers.get(message.userId);
        if (p) {
            p.progress = message.progress;
            if (message.color) p.color = message.color;
        }
    }

    function onSpaceRaceWinner(message) {
        if (window.app) {
            const isMe = window.app.userId === message.userId;
            window.app.showToast(
                isMe ? '🏆' : '🎉',
                isMe ? 'Kazandın! 🚀' : `${message.username} yarışı kazandı!`
            );
        }
        // Konfeti
        if (typeof startConfettiRain === 'function') {
            startConfettiRain(3000);
        }
        // 3 saniye sonra yarışı kapat
        setTimeout(() => endSpaceRace(), 3000);
    }

    function onSpaceRaceEnd() {
        endSpaceRace();
        if (window.app) window.app.showToast('🏁', 'Yarış bitti!');
    }

    function endSpaceRace() {
        raceActive = false;
        if (raceAnimFrame) {
            cancelAnimationFrame(raceAnimFrame);
            raceAnimFrame = null;
        }
        if (raceCanvas) {
            // 2 saniye fade out
            raceCanvas.style.transition = 'opacity 2s';
            raceCanvas.style.opacity = '0';
            setTimeout(() => {
                if (raceCanvas) { raceCanvas.remove(); raceCanvas = null; }
            }, 2000);
        }
        const banner = document.getElementById('race-banner');
        if (banner) banner.remove();
    }

    // ============================================
    // WS HANDLER HOOK
    // ============================================

    function hookWSHandler() {
        if (!window.app) return;
        const orig = window.app.handleMessage.bind(window.app);
        window.app.handleMessage = function(msg) {
            switch (msg.type) {
                case 'voice-steal-apply': onVoiceStealApply(msg); return;
                case 'voice-steal-notify': onVoiceStealNotify(msg); return;
                case 'voice-steal-stop-notify': onVoiceStealStopNotify(msg); return;
                case 'mafia-role':
                    this.mafiaRole = msg.role;
                    onMafiaRole(msg);
                    return;
                case 'mafia-info': onMafiaInfo(msg); return;
                case 'mafia-state': onMafiaState(msg); return;
                case 'mafia-night-end': onMafiaNightEnd(msg); return;
                case 'mafia-vote-end': onMafiaVoteEnd(msg); return;
                case 'mafia-end': onMafiaEnd(msg); return;
                case 'mafia-error': onMafiaError(msg); return;
                case 'space-race-start': onSpaceRaceStart(msg); return;
                case 'space-race-progress': onSpaceRaceProgress(msg); return;
                case 'space-race-winner': onSpaceRaceWinner(msg); return;
                case 'space-race-end': onSpaceRaceEnd(msg); return;
            }
            return orig(msg);
        };
    }

    // ============================================
    // BAŞLATMA
    // ============================================

    function initCrazyFeatures() {
        extendWhisperMenuForVoiceThief();
        hookWSHandler();

        // Mafia butonu
        const mafiaBtn = document.getElementById('vrc-mafia-btn');
        if (mafiaBtn) {
            mafiaBtn.addEventListener('click', () => {
                if (window.app && window.app.role !== 'admin') {
                    window.app.showToast('⚠️', 'Sadece admin başlatabilir.');
                }
                showMafiaModal();
            });
        }

        // Yarış butonu
        const raceBtn = document.getElementById('vrc-race-btn');
        if (raceBtn) {
            raceBtn.addEventListener('click', startSpaceRace);
        }

        // Whisper butonu — eğer ses hırsızı aktifse durdur
        const whisperBtn = document.getElementById('vrc-whisper-btn');
        if (whisperBtn) {
            whisperBtn.addEventListener('click', () => {
                if (window.app && window.app.voiceThiefActive) {
                    stopVoiceThief();
                }
            });
        }

        console.log('[Crazy] Çılgın fikirler yüklendi ✅');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initCrazyFeatures, 2000);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initCrazyFeatures, 2000));
    }
})();
