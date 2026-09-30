// =========================================
// SesliChat — Eğlence Özellikleri v1
// Fısıltı, Sürpriz Ses, Havai Emoji, Avatar Animasyonu, Fal Botu, Ambient Sound
// VoiceChatApp sınıfına prototip üzerinden metot ekler
// =========================================

(function() {
    'use strict';

    // Hook: handleMessage — yeni mesaj tiplerini yönet
    const _origHandleMessage = VoiceChatApp.prototype.handleMessage;
    VoiceChatApp.prototype.handleMessage = function(message) {
        switch (message.type) {
            case 'whisper-target':
                this.onWhisperTarget(message);
                return;
            case 'whisper-stop':
                this.onWhisperStop(message);
                return;
            case 'whisper-notify':
                this.onWhisperNotify(message);
                return;
            case 'whisper-stop-notify':
                this.onWhisperStopNotify(message);
                return;
            case 'voice-roulette-start':
                this.onVoiceRouletteStart(message);
                return;
            case 'emoji-reaction':
                this.onEmojiReaction(message);
                return;
            case 'ambient-change':
                this.onAmbientChange(message);
                return;
        }
        return _origHandleMessage.call(this, message);
    };

    // Hook: sendChatMessage — /fal komutunu yakala
    const _origSendChat = VoiceChatApp.prototype.sendChatMessage;
    VoiceChatApp.prototype.sendChatMessage = function() {
        const text = (this.chatInput.value || '').trim();
        const lower = text.toLowerCase();
        if (lower === '/fal' || lower.startsWith('/fal ')) {
            const question = text.substring(4).trim() || 'Genel fal';
            if (this.ws && this.currentRoom) {
                this.ws.send(JSON.stringify({
                    type: 'fal-bot',
                    question: question
                }));
                this.showToast('🔮', 'Fal bakılıyor...');
            }
            this.chatInput.value = '';
            return;
        }
        // Yardım komutu
        if (lower === '/eğlence' || lower === '/eglence' || lower === '/help') {
            this.addChatMessage({
                username: '🎮 Komutlar',
                color: '#7C5CFF',
                message: '🔮 <b>/fal soru</b> — Fal botu cevaplasın (sesli!)<br>🎮 Daha fazla eğlence yakında!',
                timestamp: Date.now()
            });
            this.chatInput.value = '';
            return;
        }
        return _origSendChat.call(this);
    };

    // Hook: updateSpeakingUI — ON FIRE + sleeping badge ekle
    const _origUpdateSpeakingUI = VoiceChatApp.prototype.updateSpeakingUI;
    VoiceChatApp.prototype.updateSpeakingUI = function(userId, isSpeaking) {
        _origUpdateSpeakingUI.call(this, userId, isSpeaking);

        // Speaking duration tracker
        if (!this.speakingTracker) this.speakingTracker = new Map();
        let tracker = this.speakingTracker.get(userId);
        if (!tracker) {
            tracker = { startedAt: 0, duration: 0, lastActive: 0, onFire: false, sleeping: false };
            this.speakingTracker.set(userId, tracker);
        }

        const card = document.getElementById('participant-' + userId);
        if (!card) return;
        const avatar = card.querySelector('.participant-avatar');
        if (!avatar) return;

        if (isSpeaking) {
            if (tracker.startedAt === 0) tracker.startedAt = Date.now();
            tracker.lastActive = Date.now();
            tracker.sleeping = false;
            avatar.classList.remove('sleeping');

            // ON FIRE badge: 3+ saniye konuşma
            const elapsed = Date.now() - tracker.startedAt;
            if (elapsed >= 3000 && !tracker.onFire) {
                tracker.onFire = true;
                this.showOnFireBadge(userId, true);
            }
        } else {
            if (tracker.startedAt > 0) {
                tracker.duration += Date.now() - tracker.startedAt;
                tracker.startedAt = 0;
            }
            // 5 saniye sessiz → sleeping
            setTimeout(() => {
                const t = this.speakingTracker && this.speakingTracker.get(userId);
                if (!t) return;
                if (Date.now() - t.lastActive >= 5000 && !t.sleeping) {
                    t.sleeping = true;
                    t.onFire = false;
                    this.showOnFireBadge(userId, false);
                    this.showSleepingBadge(userId, true);
                }
            }, 5100);
        }
    };

    // ============================================================
    // 1. WHISPER / FISILTİ MODU
    // ============================================================
    VoiceChatApp.prototype.initWhisperMode = function() {
        this.whisperTarget = null; // userId

        const self = this;
        // Sağ tık → context menu
        document.addEventListener('contextmenu', function(e) {
            const card = e.target.closest('.participant-card');
            if (!card) return;
            const id = card.id.replace('participant-', '');
            if (id === self.userId) return;
            e.preventDefault();
            self.showWhisperMenu(id, e.clientX, e.clientY);
        }, true);

        // Mobil long-press
        let pressTimer = null;
        document.addEventListener('touchstart', function(e) {
            const card = e.target.closest('.participant-card');
            if (!card) return;
            const id = card.id.replace('participant-', '');
            if (id === self.userId) return;
            const touch = e.touches[0];
            pressTimer = setTimeout(() => {
                self.showWhisperMenu(id, touch.clientX, touch.clientY);
            }, 600);
        }, { passive: true });
        document.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
        document.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });

        // Whisper butonu (varsa)
        const whisperBtn = document.getElementById('vrc-whisper-btn');
        if (whisperBtn) {
            whisperBtn.addEventListener('click', () => {
                if (self.whisperTarget) {
                    self.stopWhisper();
                } else {
                    self.showToast('🤫', 'Bir avatar üzerine sağ tıkla (veya uzun bas) ve "Fısıltı" seç.');
                }
            });
        }
    };

    VoiceChatApp.prototype.showWhisperMenu = function(targetId, x, y) {
        // Önceki menüyü kaldır
        const old = document.getElementById('whisper-context-menu');
        if (old) old.remove();

        const self = this;
        const targetCard = document.getElementById('participant-' + targetId);
        const targetName = targetCard ? (targetCard.querySelector('.participant-name')?.textContent || 'Kullanıcı') : 'Kullanıcı';

        const menu = document.createElement('div');
        menu.id = 'whisper-context-menu';
        menu.className = 'whisper-context-menu';
        menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
        menu.innerHTML = `
            <div class="wcm-header">👤 ${this.escapeHtml(targetName)}</div>
            <button class="wcm-item" data-action="whisper">
                <span style="font-size:20px;">🤫</span> Fısıltı Modu
                <small>Sadece sen duyulursun</small>
            </button>
            <button class="wcm-item" data-action="emoji">
                <span style="font-size:20px;">🎈</span> Emoji Gönder
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
            }
        });

        // Dışarı tıklayınca kapat
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

    VoiceChatApp.prototype.startWhisper = function(targetId) {
        this.whisperTarget = targetId;
        // Diğer peer'larda audio track'i disable et
        this.peers.forEach((peer, peerId) => {
            try {
                const senders = peer.pc.getSenders();
                senders.forEach(s => {
                    if (s.track && s.track.kind === 'audio') {
                        s.track.enabled = (peerId === targetId);
                    }
                });
            } catch (e) {
                console.warn('[Whisper] peer track disable hatası:', e);
            }
        });
        // Hedefe bildir
        this.ws.send(JSON.stringify({
            type: 'whisper-target',
            targetId: targetId
        }));
        // UI güncelle
        const btn = document.getElementById('vrc-whisper-btn');
        if (btn) btn.classList.add('active-fun');
        this.showToast('🤫', 'Fısıltı modu aktif! Sadece hedef duyuyor. Durdurmak için butona bas.');
    };

    VoiceChatApp.prototype.stopWhisper = function() {
        if (!this.whisperTarget) return;
        const targetId = this.whisperTarget;
        this.whisperTarget = null;
        // Tüm peer'larda audio track'i tekrar enable et
        this.peers.forEach((peer) => {
            try {
                const senders = peer.pc.getSenders();
                senders.forEach(s => {
                    if (s.track && s.track.kind === 'audio') s.track.enabled = true;
                });
            } catch (e) {
                console.warn('[Whisper] peer track re-enable hatası:', e);
            }
        });
        this.ws.send(JSON.stringify({
            type: 'whisper-stop',
            targetId: targetId
        }));
        const btn = document.getElementById('vrc-whisper-btn');
        if (btn) btn.classList.remove('active-fun');
        this.showToast('🔊', 'Fısıltı modu kapatıldı.');
    };

    VoiceChatApp.prototype.onWhisperTarget = function(message) {
        // Ben hedefim — biri bana fısıldıyor
        this.whisperFrom = message.fromUserId;
        this.showToast('🤫', message.fromUsername + ' sana fısıldıyor...');
        const card = document.getElementById('participant-' + message.fromUserId);
        if (card) card.classList.add('whisper-active');
    };

    VoiceChatApp.prototype.onWhisperStop = function(message) {
        this.whisperFrom = null;
        const card = document.getElementById('participant-' + message.fromUserId);
        if (card) card.classList.remove('whisper-active');
    };

    VoiceChatApp.prototype.onWhisperNotify = function(message) {
        // Odaya bilgi: X, Y'ye fısıldıyor
        const fromCard = document.getElementById('participant-' + message.fromUserId);
        const toCard = document.getElementById('participant-' + message.toUserId);
        if (fromCard) fromCard.classList.add('whisper-to');
        if (toCard) toCard.classList.add('whisper-from');
        // Toast sadece kısa bilgi
        if (this.userId !== message.fromUserId && this.userId !== message.toUserId) {
            this.showToast('🤫', `${message.fromUsername} → ${message.toUsername} fısıldıyor`);
        }
    };

    VoiceChatApp.prototype.onWhisperStopNotify = function(message) {
        const fromCard = document.getElementById('participant-' + message.fromUserId);
        if (fromCard) fromCard.classList.remove('whisper-to');
        // tüm whisper-from class'ları temizle (basit çözüm)
        document.querySelectorAll('.whisper-from').forEach(c => c.classList.remove('whisper-from'));
    };

    // ============================================================
    // 2. VOICE ROULETTE / SÜRPRİZ SES
    // ============================================================
    VoiceChatApp.prototype.initVoiceRoulette = function() {
        this.rouletteActive = false;
        this.rouletteTimer = null;
        this.roulettePreviousPreset = null;

        const self = this;
        const btn = document.getElementById('vrc-roulette-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                if (self.rouletteActive) {
                    self.showToast('🎰', 'Sürpriz ses hala aktif!');
                    return;
                }
                if (!self.currentRoom) {
                    self.showToast('⚠️', 'Önce odaya katıl.');
                    return;
                }
                self.triggerVoiceRoulette();
            });
        }
    };

    VoiceChatApp.prototype.triggerVoiceRoulette = function() {
        const presets = [
            { name: 'robot', pitch: -4 },
            { name: 'bebek', pitch: 8 },
            { name: 'dev', pitch: -8 },
            { name: 'sincap', pitch: 12 },
            { name: 'uzaylı', pitch: 4 },
            { name: 'mişyav', pitch: -6 }
        ];
        const chosen = presets[Math.floor(Math.random() * presets.length)];

        // WS broadcast
        this.ws.send(JSON.stringify({
            type: 'voice-roulette-start',
            preset: chosen.name,
            pitch: chosen.pitch,
            duration: 60
        }));

        // Kendi sesimi de uygula
        this.applyRoulettePreset(chosen);

        this.showToast('🎰', `Sürpriz ses: ${chosen.name.toUpperCase()}! 60 saniye geçerli.`);
    };

    VoiceChatApp.prototype.onVoiceRouletteStart = function(message) {
        const presetMap = {
            robot: { name: 'robot', pitch: -4 },
            bebek: { name: 'bebek', pitch: 8 },
            dev: { name: 'dev', pitch: -8 },
            sincap: { name: 'sincap', pitch: 12 },
            'uzaylı': { name: 'uzaylı', pitch: 4 },
            'uzayli': { name: 'uzaylı', pitch: 4 },
            mişyav: { name: 'mişyav', pitch: -6 },
            'misyav': { name: 'mişyav', pitch: -6 }
        };
        let chosen = presetMap[message.preset];
        if (!chosen) {
            chosen = { name: message.preset, pitch: parseInt(message.pitch) || -4 };
        }
        this.applyRoulettePreset(chosen);
        if (message.username && message.userId !== this.userId) {
            this.showToast('🎰', `${message.username} sürpriz ses başlattı: ${chosen.name.toUpperCase()}`);
        }
    };

    VoiceChatApp.prototype.applyRoulettePreset = function(preset) {
        const self = this;
        // Önce voice changer hazır mı?
        this.ensureVoiceChangerReady().then(ok => {
            if (!ok) {
                self.showToast('⚠️', 'Ses değiştirici hazır değil. Mikrofon izni gerekli.');
                return;
            }
            // Önceki preset'i kaydet (geri dönmek için)
            if (!self.roulettePreviousPreset) {
                self.roulettePreviousPreset = self.currentVoicePreset || 'normal';
                self.roulettePreviousPitch = self.currentPitch || 0;
            }
            // Yeni pitch'i uygula
            self.applyPitchToSoundTouch(preset.pitch);
            self.currentPitch = preset.pitch;
            self.rouletteActive = true;
            const btn = document.getElementById('vrc-roulette-btn');
            if (btn) btn.classList.add('active-fun');

            // Timer başlat
            self.startRouletteCountdown(60);

            // 60 saniye sonra reset
            if (self.rouletteTimer) clearTimeout(self.rouletteTimer);
            self.rouletteTimer = setTimeout(() => {
                self.stopVoiceRoulette();
            }, 60000);
        });
    };

    VoiceChatApp.prototype.startRouletteCountdown = function(seconds) {
        let remaining = seconds;
        const self = this;
        const update = () => {
            const btn = document.getElementById('vrc-roulette-btn');
            if (btn) {
                const span = btn.querySelector('span:last-child');
                if (span && self.rouletteActive) {
                    span.textContent = '🎰 ' + remaining + 's';
                } else if (span) {
                    span.textContent = 'Sürpriz';
                }
            }
            if (remaining > 0 && self.rouletteActive) {
                remaining--;
                self.rouletteCountdown = setTimeout(update, 1000);
            }
        };
        update();
    };

    VoiceChatApp.prototype.stopVoiceRoulette = function() {
        this.rouletteActive = false;
        if (this.rouletteTimer) clearTimeout(this.rouletteTimer);
        if (this.rouletteCountdown) clearTimeout(this.rouletteCountdown);
        // Eski preset'e dön
        if (this.roulettePreviousPreset) {
            const prevPitch = this.roulettePreviousPitch || 0;
            this.applyPitchToSoundTouch(prevPitch);
            this.currentPitch = prevPitch;
            this.roulettePreviousPreset = null;
        }
        const btn = document.getElementById('vrc-roulette-btn');
        if (btn) {
            btn.classList.remove('active-fun');
            const span = btn.querySelector('span:last-child');
            if (span) span.textContent = 'Sürpriz';
        }
    };

    // ============================================================
    // 3. HAVAİ EMOJI REAKSİYONLARI
    // ============================================================
    VoiceChatApp.prototype.initEmojiReactions = function() {
        const self = this;
        // Avatar tıklama → emoji picker
        document.addEventListener('click', function(e) {
            const avatar = e.target.closest('.participant-avatar');
            if (!avatar) return;
            const card = e.target.closest('.participant-card');
            if (!card) return;
            const id = card.id.replace('participant-', '');
            if (id === self.userId) return; // kendine emoji gönderme

            const rect = avatar.getBoundingClientRect();
            self.showEmojiPicker(id, rect.left + rect.width / 2, rect.top + rect.height / 2);
        });
    };

    // Emoji kütüphanesi — 32 komik emoji, animasyonlu webp URL'leri ile
    VoiceChatApp.prototype.getEmojiLibrary = function() {
        // { char, code (Noto animated webp code, null ise text emoji olarak render edilir) }
        return [
            { char: '🔥', code: '1f525' },
            { char: '❤️', code: '2764' },
            { char: '😂', code: '1f602' },
            { char: '💀', code: '1f480' },
            { char: '👍', code: '1f44d' },
            { char: '👀', code: '1f440' },
            { char: '🎉', code: '1f389' },
            { char: '🤡', code: '1f921' },
            { char: '🤣', code: '1f923' },
            { char: '😍', code: '1f60d' },
            { char: '🥳', code: '1f973' },
            { char: '😎', code: '1f60e' },
            { char: '🥺', code: '1f97a' },
            { char: '😭', code: '1f62d' },
            { char: '😡', code: '1f621' },
            { char: '💯', code: '1f4af' },
            { char: '🤯', code: '1f92f' },
            { char: '😱', code: '1f631' },
            { char: '😵', code: '1f635' },
            { char: '🥵', code: '1f975' },
            { char: '🤮', code: '1f92e' },
            { char: '😈', code: '1f608' },
            { char: '👻', code: '1f476' },
            { char: '👾', code: '1f47e' },
            { char: '🤖', code: '1f916' },
            { char: '💩', code: '1f4a9' },
            { char: '🐸', code: '1f438' },
            { char: '💃', code: '1f483' },
            { char: '🕺', code: '1f57a' },
            { char: '🚀', code: '1f680' },
            { char: '💥', code: '1f4a5' },
            { char: '✨', code: '2728' }
        ];
    };

    VoiceChatApp.prototype.emojiToWebpUrl = function(emoji) {
        // Emoji nesnesi → Noto animated webp URL
        if (!emoji || !emoji.code) return null;
        return 'https://fonts.gstatic.com/s/e/notoemoji/latest/' + emoji.code + '/512.webp';
    };

    VoiceChatApp.prototype.findEmojiByChar = function(char) {
        const lib = this.getEmojiLibrary();
        return lib.find(e => e.char === char);
    };

    VoiceChatApp.prototype.showEmojiPicker = function(targetId, x, y) {
        const old = document.getElementById('emoji-reaction-picker');
        if (old) old.remove();

        const self = this;
        const emojis = this.getEmojiLibrary();

        const picker = document.createElement('div');
        picker.id = 'emoji-reaction-picker';
        picker.className = 'emoji-reaction-picker';
        picker.style.left = Math.max(10, Math.min(x - 160, window.innerWidth - 340)) + 'px';
        picker.style.top = Math.max(10, y - 80) + 'px';
        picker.innerHTML = `
            <div class="erp-title">🎈 Reaksiyon gönder</div>
            <div class="erp-tabs">
                <button class="erp-tab active" data-cat="all">Hepsi</button>
                <button class="erp-tab" data-cat="komik">Komik</button>
                <button class="erp-tab" data-cat="yüz">Yüzler</button>
                <button class="erp-tab" data-cat="nesne">Nesne</button>
            </div>
            <div class="erp-grid">
                ${emojis.map((em, i) => `<button class="erp-emoji" data-emoji="${em.char}" data-idx="${i}"><img src="${this.emojiToWebpUrl(em)}" alt="${em.char}" loading="lazy"></button>`).join('')}
            </div>
        `;
        document.body.appendChild(picker);

        picker.addEventListener('click', function(e) {
            const btn = e.target.closest('.erp-emoji');
            if (!btn) {
                // Tab tıklama?
                const tab = e.target.closest('.erp-tab');
                if (tab) {
                    picker.querySelectorAll('.erp-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    const cat = tab.dataset.cat;
                    const all = picker.querySelectorAll('.erp-emoji');
                    all.forEach((b, idx) => {
                        const emoji = emojis[idx];
                        let show = true;
                        if (cat === 'komik') show = ['🤣','😂','💀','🤡','🤯','😱','🤮','💩','👻','👾'].includes(emoji.char);
                        else if (cat === 'yüz') show = ['😍','🥳','😎','🥺','😭','😡','😈','🥵','😵','🔥','❤️','💯','👀'].includes(emoji.char);
                        else if (cat === 'nesne') show = ['🎉','👍','🐸','💃','🕺','🚀','💥','✨','🤖'].includes(emoji.char);
                        b.style.display = show ? 'flex' : 'none';
                    });
                }
                return;
            }
            const emoji = btn.dataset.emoji;
            picker.remove();
            self.sendEmojiReaction(targetId, emoji);
        });

        // Dışarı tıkla → kapat
        setTimeout(() => {
            const close = function(ev) {
                if (!picker.contains(ev.target)) {
                    picker.remove();
                    document.removeEventListener('click', close, true);
                }
            };
            document.addEventListener('click', close, true);
        }, 50);
    };

    VoiceChatApp.prototype.sendEmojiReaction = function(targetId, emoji) {
        if (!this.ws || !this.currentRoom) return;
        this.ws.send(JSON.stringify({
            type: 'emoji-reaction',
            toUserId: targetId,
            emoji: emoji
        }));
        // Kendi ekranımda da hemen göster
        this.renderFlyingEmoji(this.userId, targetId, emoji);
    };

    VoiceChatApp.prototype.onEmojiReaction = function(message) {
        this.renderFlyingEmoji(message.fromUserId, message.toUserId, message.emoji);
    };

    VoiceChatApp.prototype.renderFlyingEmoji = function(fromId, toId, emoji) {
        const fromCard = document.getElementById('participant-' + fromId);
        const toCard = document.getElementById('participant-' + toId);
        if (!toCard) return;

        const fromRect = fromCard ? fromCard.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight - 80, width: 60, height: 60 };
        const toRect = toCard.getBoundingClientRect();

        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;
        const toX = toRect.left + toRect.width / 2;
        const toY = toRect.top + toRect.height / 2;

        // Emoji lookup — animasyonlu webp kullan
        const emojiObj = this.findEmojiByChar(emoji);
        const webpUrl = emojiObj ? this.emojiToWebpUrl(emojiObj) : null;

        // 3 emoji parçacığı (arka arkaya)
        for (let i = 0; i < 3; i++) {
            const el = document.createElement('div');
            el.className = 'flying-emoji';
            if (webpUrl) {
                el.innerHTML = `<img src="${webpUrl}" alt="${emoji}" style="width:36px;height:36px;">`;
            } else {
                el.textContent = emoji;
            }
            el.style.left = fromX + 'px';
            el.style.top = fromY + 'px';
            el.style.setProperty('--to-x', (toX - fromX) + 'px');
            el.style.setProperty('--to-y', (toY - fromY) + 'px');
            el.style.setProperty('--delay', (i * 0.15) + 's');
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2200);
        }

        // Hedef avatar'a pulse animasyonu
        const toAvatar = toCard.querySelector('.participant-avatar');
        if (toAvatar) {
            toAvatar.classList.remove('emoji-received');
            void toAvatar.offsetWidth; // reflow
            toAvatar.classList.add('emoji-received');
        }
    };

    // ============================================================
    // 4. AVATAR ANİMASYONU — ON FIRE + SLEEPING BADGES
    // ============================================================
    VoiceChatApp.prototype.showOnFireBadge = function(userId, show) {
        const card = document.getElementById('participant-' + userId);
        if (!card) return;
        const avatar = card.querySelector('.participant-avatar');
        if (!avatar) return;
        if (show) {
            avatar.classList.add('on-fire');
            if (!avatar.querySelector('.fire-badge')) {
                const badge = document.createElement('div');
                badge.className = 'fire-badge';
                badge.textContent = '🔥';
                avatar.appendChild(badge);
            }
        } else {
            avatar.classList.remove('on-fire');
            const badge = avatar.querySelector('.fire-badge');
            if (badge) badge.remove();
        }
    };

    VoiceChatApp.prototype.showSleepingBadge = function(userId, show) {
        const card = document.getElementById('participant-' + userId);
        if (!card) return;
        const avatar = card.querySelector('.participant-avatar');
        if (!avatar) return;
        if (show) {
            avatar.classList.add('sleeping');
            if (!avatar.querySelector('.sleep-badge')) {
                const badge = document.createElement('div');
                badge.className = 'sleep-badge';
                badge.textContent = '😴';
                avatar.appendChild(badge);
            }
        } else {
            avatar.classList.remove('sleeping');
            const badge = avatar.querySelector('.sleep-badge');
            if (badge) badge.remove();
        }
    };

    // ============================================================
    // 5. AMBIENT SOUND — YAĞMUR / KAFE / ŞÖMİNE / PLAJ
    // ============================================================
    VoiceChatApp.prototype.initAmbientSounds = function() {
        this.ambientAudioContext = null;
        this.ambientNodes = []; // tüm node referansları (durdururken)
        this.ambientMode = 'off';

        const self = this;
        const btn = document.getElementById('vrc-ambient-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                self.showAmbientPicker();
            });
        }
    };

    VoiceChatApp.prototype.showAmbientPicker = function() {
        const old = document.getElementById('ambient-picker-modal');
        if (old) old.remove();

        const self = this;
        const isAdmin = (this.role === 'admin');
        const options = [
            { id: 'off', icon: '🔇', name: 'Kapalı' },
            { id: 'rain', icon: '🌧️', name: 'Yağmur Ormanı' },
            { id: 'cafe', icon: '☕', name: 'Kafe' },
            { id: 'fire', icon: '🔥', name: 'Şömine' },
            { id: 'beach', icon: '🏖️', name: 'Plaj' }
        ];

        const modal = document.createElement('div');
        modal.id = 'ambient-picker-modal';
        modal.className = 'ambient-picker-modal';
        modal.innerHTML = `
            <div class="apm-card">
                <div class="apm-header">
                    <h3>🌧️ Oda Atmosferi</h3>
                    <button class="apm-close">✕</button>
                </div>
                <div class="apm-current">Şu an: <strong>${this.ambientMode || 'off'}</strong></div>
                <div class="apm-grid">
                    ${options.map(o => `<button class="apm-option" data-mode="${o.id}"><span class="apm-icon">${o.icon}</span><span class="apm-name">${o.name}</span></button>`).join('')}
                </div>
                ${!isAdmin ? '<div class="apm-warn">⚠️ Sadece admin değiştirebilir. Sen yine de dinleyebilirsin.</div>' : ''}
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.apm-close').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        modal.querySelectorAll('.apm-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const mode = opt.dataset.mode;
                if (isAdmin) {
                    // Admin: odaya broadcast
                    self.ws.send(JSON.stringify({ type: 'ambient-change', mode: mode }));
                    self.setAmbientMode(mode);
                    close();
                } else {
                    self.showToast('⚠️', 'Atmosfer değiştirmek için admin olmalısın.');
                }
            });
        });
    };

    VoiceChatApp.prototype.onAmbientChange = function(message) {
        this.setAmbientMode(message.mode);
        const names = { off: 'Kapalı', rain: 'Yağmur Ormanı', cafe: 'Kafe', fire: 'Şömine', beach: 'Plaj' };
        this.showToast('🌧️', 'Oda atmosferi: ' + (names[message.mode] || message.mode));
    };

    VoiceChatApp.prototype.setAmbientMode = function(mode) {
        // Önceki ambient'i durdur
        this.stopAmbient();
        this.ambientMode = mode;
        if (mode === 'off') return;

        try {
            if (!this.ambientAudioContext) {
                this.ambientAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ambientAudioContext.state === 'suspended') {
                this.ambientAudioContext.resume();
            }
            const ctx = this.ambientAudioContext;

            // Master gain
            const masterGain = ctx.createGain();
            masterGain.gain.value = 0.3;
            masterGain.connect(ctx.destination);

            // Beyaz gürültü üreteci
            const bufferSize = 2 * ctx.sampleRate;
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                // Brown/pink noise karışımı
                const white = Math.random() * 2 - 1;
                lastOut = (lastOut + 0.02 * white) / 1.02;
                output[i] = lastOut * 3.5;
            }

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            noiseSource.loop = true;
            this.ambientNodes.push(noiseSource);

            if (mode === 'rain') {
                // Yağmur: yüksek frekans vurgulu, hafif rüzgar
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 2000;
                filter.Q.value = 0.5;
                const filter2 = ctx.createBiquadFilter();
                filter2.type = 'highshelf';
                filter2.frequency.value = 4000;
                filter2.gain.value = 4;
                const gain = ctx.createGain();
                gain.gain.value = 0.5;
                noiseSource.connect(filter);
                filter.connect(filter2);
                filter2.connect(gain);
                gain.connect(masterGain);

                // Rastgele damla sesleri
                this.startRainDroplets(ctx, masterGain);
            } else if (mode === 'cafe') {
                // Kafe: sıcak, düşük frekanslı
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 1200;
                const gain = ctx.createGain();
                gain.gain.value = 0.4;
                noiseSource.connect(filter);
                filter.connect(gain);
                gain.connect(masterGain);
            } else if (mode === 'fire') {
                // Şömine: çok düşük frekans + çıtırtı
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 500;
                const gain = ctx.createGain();
                gain.gain.value = 0.7;
                noiseSource.connect(filter);
                filter.connect(gain);
                gain.connect(masterGain);

                // Çıtırtı
                this.startFireCrackles(ctx, masterGain);
            } else if (mode === 'beach') {
                // Plaj: LFO ile dalga efekti
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 800;
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 0.13; // yavaş dalga
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 0.3;
                lfo.connect(lfoGain);
                const waveGain = ctx.createGain();
                waveGain.gain.value = 0.5;
                lfoGain.connect(waveGain.gain);
                noiseSource.connect(filter);
                filter.connect(waveGain);
                waveGain.connect(masterGain);
                lfo.start();
                this.ambientNodes.push(lfo);
            }

            noiseSource.start();
        } catch (e) {
            console.error('[Ambient] başlatma hatası:', e);
        }
    };

    VoiceChatApp.prototype.startRainDroplets = function(ctx, masterGain) {
        const self = this;
        const playDrop = () => {
            if (!self.ambientAudioContext || self.ambientMode !== 'rain') return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 800 + Math.random() * 2400;
            gain.gain.value = 0;
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start();
            osc.stop(ctx.currentTime + 0.06);
            setTimeout(playDrop, 100 + Math.random() * 300);
        };
        playDrop();
    };

    VoiceChatApp.prototype.startFireCrackles = function(ctx, masterGain) {
        const self = this;
        const playCrackle = () => {
            if (!self.ambientAudioContext || self.ambientMode !== 'fire') return;
            // Kısa rastgele pop
            const bufferSize = Math.floor(ctx.sampleRate * 0.05);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize / 4));
            }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1500 + Math.random() * 2000;
            filter.Q.value = 1;
            const gain = ctx.createGain();
            gain.gain.value = 0.4 + Math.random() * 0.4;
            src.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            src.start();
            setTimeout(playCrackle, 200 + Math.random() * 800);
        };
        playCrackle();
    };

    VoiceChatApp.prototype.stopAmbient = function() {
        if (this.ambientNodes) {
            this.ambientNodes.forEach(node => {
                try { node.stop(); } catch (e) {}
                try { node.disconnect(); } catch (e) {}
            });
        }
        this.ambientNodes = [];
    };

    // ============================================================
    // BAŞLATMA — app hazır olunca çağrılır
    // ============================================================
    function initFunFeatures() {
        if (!window.app) {
            setTimeout(initFunFeatures, 500);
            return;
        }
        const app = window.app;
        try {
            app.initWhisperMode();
            app.initVoiceRoulette();
            app.initEmojiReactions();
            app.initAmbientSounds();
            app.speakingTracker = new Map();
            initStarField();
            console.log('[Fun] Eğlence özellikleri yüklendi ✅');
        } catch (e) {
            console.error('[Fun] init hatası:', e);
        }
    }

    // Stars generator — twinkling background stars
    function initStarField() {
        const container = document.getElementById('aurora-stars');
        if (!container) return;
        container.innerHTML = '';
        const count = window.innerWidth < 768 ? 30 : 60;
        for (let i = 0; i < count; i++) {
            const star = document.createElement('div');
            star.className = 'aurora-star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = Math.random() * 3 + 's';
            star.style.animationDuration = (2 + Math.random() * 3) + 's';
            // Bazı yıldızlar daha büyük
            if (Math.random() > 0.8) {
                star.style.width = '3px';
                star.style.height = '3px';
            }
            container.appendChild(star);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initFunFeatures, 1000);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initFunFeatures, 1000));
    }
})();
