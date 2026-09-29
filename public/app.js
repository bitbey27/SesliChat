// =========================================
// SesliChat - Ana Uygulama Mantığı
// =========================================

class VoiceChatApp {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.username = null;
        this.role = 'user'; // 'user' veya 'admin'
        this.currentRoom = null;
        this.peers = new Map(); // userId -> { pc, audioEl, musicEl, remoteStream, isSharingMusic, musicTrackName }
        this.peerVolumes = new Map(); // userId -> volume (0.0 to 1.0)
        this.peerMusicVolumes = new Map(); // userId -> music volume (0.0 to 1.0) - sadece dinleyici tarafı
        this.roomPasswords = JSON.parse(localStorage.getItem('roomPasswords') || '{}');
        this.localStream = null;
        this.isMuted = false;
        this.isDeafened = false;

        // === SAYFA YENİLEME OTOMATİK GİRİŞ ===
        // localStorage'da kalıcı clientId (UUID) — server bu ID'den aynı kişi tanıyor
        if (!localStorage.getItem('clientId')) {
            localStorage.setItem('clientId', 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10));
        }
        this.clientId = localStorage.getItem('clientId');
        // Sayfa yenilenince girilen son odayı hatırla
        this.savedRoom = localStorage.getItem('currentRoom') || null;

        
        // Ses Ayarları (Kullanıcı tarafından değiştirilebilir)
        this.audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        this.audioContext = null;
        this.notificationAudioContext = null; // Bildirim sesleri için ortak bağlam
        this.analyser = null;
        this.isSpeaking = false;
        this.speakingThreshold = 15;
        this.vadInterval = null;
        this.speakingUsers = new Set();

        // Farklı şehirlerden bağlantı için STUN/TURN sunucuları
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.stunprotocol.org:3478' },
            // Ücretsiz TURN sunucuları (sınırlı)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ];

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Giriş
        this.loginScreen = document.getElementById('login-screen');
        this.appScreen = document.getElementById('app-screen');
        this.loginForm = document.getElementById('login-form');
        this.usernameInput = document.getElementById('username-input');

        // Kayıtlı kullanıcı adını yükle
        const savedUsername = localStorage.getItem('username');
        if (savedUsername && this.usernameInput) {
            this.usernameInput.value = savedUsername;
        }

        // Kanallar
        this.channelList = document.getElementById('channel-list');

        // Kullanıcı Paneli
        this.displayName = document.getElementById('display-name');
        this.userAvatarLetter = document.getElementById('user-avatar-letter');
        this.userStatusText = document.getElementById('user-status-text');
        this.micBtn = document.getElementById('mic-btn');
        this.deafenBtn = document.getElementById('deafen-btn');
        this.camBtn = document.getElementById('cam-btn');
        this.shareScreenBtn = document.getElementById('share-screen-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');

        // Sesli Oda
        this.welcomeView = document.getElementById('welcome-view');
        this.voiceView = document.getElementById('voice-view');
        this.voiceRoomName = document.getElementById('voice-room-name');
        this.voiceRoomIcon = document.getElementById('voice-room-icon');
        this.voiceParticipants = document.getElementById('voice-participants');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');

        // Üyeler
        this.onlineMembers = document.getElementById('online-members');
        this.onlineCount = document.getElementById('online-count');

        // Chat
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInputForm = document.getElementById('chat-input-form');
        this.chatInput = document.getElementById('chat-input');
        
        // Modallar ve Yeni Araçlar
        this.settingsBtn = document.getElementById('settings-btn');
        this.adminPanelBtn = document.getElementById('admin-panel-btn');
        
        this.passwordModal = document.getElementById('password-modal');
        this.roomPasswordInput = document.getElementById('room-password-input');
        this.cancelPasswordBtn = document.getElementById('cancel-password-btn');
        this.submitPasswordBtn = document.getElementById('submit-password-btn');
        
        this.settingsModal = document.getElementById('settings-modal');
        this.closeSettingsBtn = document.getElementById('close-settings-btn');
        this.settingEcho = document.getElementById('setting-echo');
        this.settingNoise = document.getElementById('setting-noise');
        this.settingGain = document.getElementById('setting-gain');
        this.settingColor = document.getElementById('setting-color');
        
        this.adminModal = document.getElementById('admin-modal');
        this.closeAdminBtn = document.getElementById('close-admin-btn');
        this.adminNewRoomId = document.getElementById('admin-new-room-id');
        this.adminNewRoomName = document.getElementById('admin-new-room-name');
        this.adminNewRoomIcon = document.getElementById('admin-new-room-icon');
        this.adminNewRoomPassword = document.getElementById('admin-new-room-password');
        this.adminCreateRoomBtn = document.getElementById('admin-create-room-btn');
        this.adminSelectRoom = document.getElementById('admin-select-room');
        this.adminUpdatePassword = document.getElementById('admin-update-password');
        this.adminSetPasswordBtn = document.getElementById('admin-set-password-btn');
        this.adminDeleteRoomBtn = document.getElementById('admin-delete-room-btn');

        // Emoji
        this.emojiToggleBtn = document.getElementById('emoji-toggle-btn');
        this.emojiPicker = document.getElementById('emoji-picker');
        this.emojiGrid = document.getElementById('emoji-grid');
        
        // Yeni Özellikler (Faz 6 & 7)
        this.shareScreenBtn = document.getElementById('share-screen-btn');
        this.videoStage = document.getElementById('video-stage');
        this.clearChatBtn = document.getElementById('clear-chat-btn');
        this.isScreenSharing = false;
        this.isCameraOn = false;
        this.screenStream = null;
        this.cameraStream = null;

        // === MÜZİK PLAYER ELEMENTLERİ ===
        this.musicBtn = document.getElementById('music-btn');
        this.musicPanel = document.getElementById('music-panel');
        this.musicFileInput = document.getElementById('music-file-input');
        this.musicUrlInput = document.getElementById('music-url-input');
        this.musicLoadUrlBtn = document.getElementById('music-load-url-btn');
        this.musicAudio = document.getElementById('music-audio');           // DJ'nin yerel <audio> elementi
        this.musicPlayBtn = document.getElementById('music-play-btn');
        this.musicStopBtn = document.getElementById('music-stop-btn');
        this.musicTrackLabel = document.getElementById('music-track-label');
        this.musicProgress = document.getElementById('music-progress');
        this.musicCurrentTime = document.getElementById('music-current-time');
        this.musicDuration = document.getElementById('music-duration');
        this.musicLocalVolume = document.getElementById('music-local-volume');
        this.musicLocalMuteBtn = document.getElementById('music-local-mute-btn');

        // Müzik durumu
        this.isSharingMusic = false;
        this.musicStream = null;            // Müziği peer'lara gönderen MediaStream
        this.musicAudioContext = null;      // Müziği yakalamak için AudioContext
        this.musicSourceNode = null;
        this.musicDestNode = null;
        this.musicStatusInterval = null;
        this.isMusicLocallyMuted = false;
        this.pendingMusicSeek = null;
    }

    initEventListeners() {
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        this.micBtn.addEventListener('click', () => this.toggleMute());
        this.deafenBtn.addEventListener('click', () => this.toggleDeafen());
        this.disconnectBtn.addEventListener('click', () => this.leaveRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());

        // Modallar
        this.settingsBtn.addEventListener('click', () => {
            this.settingsModal.classList.remove('hidden');
        });
        this.closeSettingsBtn.addEventListener('click', () => {
            this.audioConstraints.echoCancellation = this.settingEcho.checked;
            this.audioConstraints.noiseSuppression = this.settingNoise.checked;
            this.audioConstraints.autoGainControl = this.settingGain.checked;
            
            if (this.settingColor) {
               const newColor = this.settingColor.value;
               if (this.avatarColor !== newColor) {
                  this.avatarColor = newColor;
                  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                      this.ws.send(JSON.stringify({ type: 'update-color', color: this.avatarColor }));
                  }
                  if (this.userAvatarLetter && this.userAvatarLetter.parentElement) {
                      this.userAvatarLetter.parentElement.style.background = this.avatarColor;
                  }
               }
            }

            this.settingsModal.classList.add('hidden');
            this.showToast('⚙️', 'Ayarlar güncellendi.');
        });

        this.adminPanelBtn.addEventListener('click', () => {
            this.adminModal.classList.remove('hidden');
        });
        this.closeAdminBtn.addEventListener('click', () => {
            this.adminModal.classList.add('hidden');
        });

        // Admin Oda Oluştur
        this.adminCreateRoomBtn.addEventListener('click', () => {
            const id = this.adminNewRoomId.value.trim();
            const name = this.adminNewRoomName.value.trim();
            const icon = this.adminNewRoomIcon.value.trim() || '📌';
            const password = this.adminNewRoomPassword.value;
            if (!id || !name) return this.showToast('⚠️', 'Oda ID ve Adı zorunlu!');
            this.ws.send(JSON.stringify({
                type: 'admin-create-room', roomId: id, roomName: name, roomIcon: icon, password
            }));
            this.adminNewRoomId.value = ''; this.adminNewRoomName.value = ''; this.adminNewRoomPassword.value = '';
            this.adminModal.classList.add('hidden');
        });

        // Admin Sifre Guncelle
        this.adminSetPasswordBtn.addEventListener('click', () => {
            const roomId = this.adminSelectRoom.value;
            const password = this.adminUpdatePassword.value;
            if (!roomId) return this.showToast('⚠️', 'Lütfen bir oda seçin!');
            this.ws.send(JSON.stringify({
                type: 'admin-set-room-password', roomId, password
            }));
            this.adminUpdatePassword.value = '';
            this.adminModal.classList.add('hidden');
        });

        // Admin Oda Sil
        if (this.adminDeleteRoomBtn) {
            this.adminDeleteRoomBtn.addEventListener('click', () => {
                const roomId = this.adminSelectRoom.value;
                if (!roomId) return this.showToast('⚠️', 'Lütfen silinecek odayı seçin!');
                if (confirm('Bu odayı tamamen silmek istediğinize emin misiniz?')) {
                    this.ws.send(JSON.stringify({
                        type: 'admin-delete-room', roomId
                    }));
                    this.adminModal.classList.add('hidden');
                }
            });
        }

        // Oda Şifresi
        this.cancelPasswordBtn.addEventListener('click', () => {
            this.passwordModal.classList.add('hidden');
            this.pendingRoomId = null;
        });
        this.submitPasswordBtn.addEventListener('click', () => {
            if (this.pendingRoomId) {
                this.executeJoinRoom(this.pendingRoomId, this.roomPasswordInput.value);
                this.passwordModal.classList.add('hidden');
                this.pendingRoomId = null;
            }
        });

        // Chat
        this.chatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendChatMessage();
        });

        // Emoji
        if (this.emojiToggleBtn && this.emojiPicker && this.emojiGrid) {
            const animatedMap = {
                '😀': '1f600', '😂': '1f602', '🤣': '1f923', '😍': '1f60d', '🥰': '1f970', '😘': '1f618',
                '🤪': '1f92a', '🥳': '1f973', '😎': '1f60e', '🥺': '1f97a', '😭': '1f62d', '😡': '1f621',
                '💀': '1f480', '💯': '1f4af', '🔥': '1f525', '✨': '2728', '🎉': '1f389', '👍': '1f44d'
            };
            
            for (const [char, id] of Object.entries(animatedMap)) {
                const btn = document.createElement('button');
                btn.className = 'emoji-btn animated-emoji-btn';
                btn.type = 'button';
                btn.title = char;
                
                const img = document.createElement('img');
                img.src = `https://fonts.gstatic.com/s/e/notoemoji/latest/${id}/512.webp`;
                img.alt = char;
                img.style.width = '32px';
                img.style.height = '32px';
                img.style.pointerEvents = 'none';
                
                btn.appendChild(img);
                
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.chatInput.value += char;
                    this.chatInput.focus();
                    this.emojiPicker.classList.add('hidden');
                });
                this.emojiGrid.appendChild(btn);
            }

            this.emojiToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.emojiPicker.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.emojiPicker.contains(e.target) && !this.emojiToggleBtn.contains(e.target)) {
                    this.emojiPicker.classList.add('hidden');
                }
            });
        }

        // Kamera ve Ekran Paylaşımı
        if (this.camBtn) {
            this.camBtn.addEventListener('click', () => this.toggleCamera());
        }
        if (this.shareScreenBtn) {
            this.shareScreenBtn.addEventListener('click', () => this.toggleScreenShare());
        }

        // Admin: Sohbeti Temizle
        if (this.clearChatBtn) {
            this.clearChatBtn.addEventListener('click', () => {
                if (confirm('Sohbet geçmişini odadaki herkes için tamamen silmek istediğinize emin misiniz?')) {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ type: 'admin-clear-chat' }));
                    }
                }
            });
        }

        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });

        // === MÜZİK PLAYER OLAYLARI ===
        if (this.musicBtn) {
            this.musicBtn.addEventListener('click', () => {
                if (this.musicPanel) {
                    this.musicPanel.classList.toggle('hidden');
                }
            });
        }
        if (this.musicFileInput) {
            this.musicFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.loadMusicFromFile(file);
                }
            });
        }
        if (this.musicLoadUrlBtn) {
            this.musicLoadUrlBtn.addEventListener('click', () => {
                const url = (this.musicUrlInput.value || '').trim();
                if (url) {
                    this.loadMusicFromUrl(url);
                }
            });
        }
        if (this.musicPlayBtn) {
            this.musicPlayBtn.addEventListener('click', () => this.toggleMusicPlay());
        }
        if (this.musicStopBtn) {
            this.musicStopBtn.addEventListener('click', () => this.stopMusicShare());
        }
        if (this.musicProgress) {
            this.musicProgress.addEventListener('input', (e) => {
                // DJ seeking — anlık değil, change'de uygula
                this.pendingMusicSeek = parseFloat(e.target.value);
                if (this.musicAudio && this.musicAudio.duration) {
                    this.musicAudio.currentTime = this.pendingMusicSeek;
                    this.pendingMusicSeek = null;
                }
            });
        }
        if (this.musicLocalVolume) {
            this.musicLocalVolume.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                // Sadece DJ'nin kendi duyduğu ses seviyesini değiştir (peer'lara giden stream etkilenmez)
                if (this.musicAudio) {
                    this.musicAudio.volume = this.isMusicLocallyMuted ? 0 : vol;
                }
                this.musicLocalVolume.dataset.value = vol;
            });
        }
        if (this.musicLocalMuteBtn) {
            this.musicLocalMuteBtn.addEventListener('click', () => {
                this.isMusicLocallyMuted = !this.isMusicLocallyMuted;
                if (this.musicAudio) {
                    this.musicAudio.volume = this.isMusicLocallyMuted ? 0 : parseFloat(this.musicLocalVolume.value);
                }
                this.musicLocalMuteBtn.textContent = this.isMusicLocallyMuted ? '🔇' : '🔊';
            });
        }
        // Müzik audio elementi olayları
        if (this.musicAudio) {
            this.musicAudio.addEventListener('loadedmetadata', () => {
                if (this.musicDuration) {
                    this.musicDuration.textContent = this.formatTime(this.musicAudio.duration);
                }
                if (this.musicProgress) {
                    this.musicProgress.max = Math.floor(this.musicAudio.duration || 0);
                }
            });
            this.musicAudio.addEventListener('timeupdate', () => {
                if (this.musicCurrentTime) {
                    this.musicCurrentTime.textContent = this.formatTime(this.musicAudio.currentTime);
                }
                if (this.musicProgress && !this.pendingMusicSeek) {
                    this.musicProgress.value = Math.floor(this.musicAudio.currentTime || 0);
                }
            });
            this.musicAudio.addEventListener('ended', () => {
                this.musicAudio.currentTime = 0;
                this.sendMusicStatus(false, 0, this.musicAudio.duration);
                if (this.musicPlayBtn) this.musicPlayBtn.textContent = '▶';
            });
        }

        // === SAYFA YENİLEME OTOMATİK GİRİŞ ===
        // Eğer kullanıcı adı kayıtlıysa otomatik giriş yap
        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            // Input'u doldur ve login() fonksiyonunu çağır
            // Kısa bir gecikme ile, DOM tamamen hazır olsun
            setTimeout(() => {
                if (this.usernameInput) this.usernameInput.value = savedUsername;
                this.login();
            }, 200);
        }
    }

    // =========================================
    // Ses Efektleri
    // =========================================
    playSound(type) {
        if (!this.notificationAudioContext) return;

        try {
            const ctx = this.notificationAudioContext;
            
            // Eğer tarayıcı tarafından durdurulduysa devam ettir
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'join') {
                // Katılma sesi: Yükselen iki ton (ör: Discord join)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
                osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1); // C#5
                
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            } else if (type === 'leave') {
                // Ayrılma sesi: Düşen iki ton
                osc.type = 'sine';
                osc.frequency.setValueAtTime(554, ctx.currentTime); // C#5
                osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1); // A4
                
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            }
        } catch (e) {
            console.error('Ses efekti çalınamadı:', e);
        }
    }

    // =========================================
    // Giriş
    // =========================================
    login() {
        const username = this.usernameInput.value.trim();
        if (!username) return;

        this.username = username;
        localStorage.setItem('username', username);
        // Başlangıç için rastgele bir renk ata
        if (!this.avatarColor) {
            const colors = ['#7C5CFC', '#3BA55D', '#FAA81A', '#ED4245', '#F47B67', '#00B0F4', '#E67E22', '#9B59B6'];
            this.avatarColor = colors[Math.floor(Math.random() * colors.length)];
            if (this.settingColor) this.settingColor.value = this.avatarColor;
        }
        
        if (this.userAvatarLetter && this.userAvatarLetter.parentElement) {
            this.userAvatarLetter.parentElement.style.background = this.avatarColor;
        }
        
        // Autoplay kurallarını aşmak için kullanıcı etkileşimi anında AudioContext oluştur
        if (!this.notificationAudioContext) {
            try {
                this.notificationAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error('Bildirim sesleri için AudioContext oluşturulamadı:', e);
            }
        }

        this.connectWebSocket();
    }

    // =========================================
    // WebSocket Bağlantısı
    // =========================================
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            // === clientId ile giriş ===
            // Bu, sayfa yenilenince sunucunun "aynı kişi" tanıması için kullanılır
            this.ws.send(JSON.stringify({
                type: 'join',
                username: this.username,
                color: this.avatarColor,
                clientId: this.clientId
            }));

            // Client-side heartbeat: Her 20 saniyede ping gönder
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 20000);
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            // Bağlantı koparsa daha hızlı yeniden bağlan
            const previousRoom = this.currentRoom || this.savedRoom;
            this.showToast('⚠️', 'Bağlantı kesildi. Yeniden bağlanılıyor...');
            setTimeout(() => {
                this.reconnectRoom = previousRoom;
                this.connectWebSocket();
            }, 2000);
        };

        this.ws.onerror = () => {
            this.showToast('❌', 'Bağlantı hatası oluştu.');
        };
    }

    // =========================================
    // Mesaj İşleme
    // =========================================
    handleMessage(message) {
        switch (message.type) {
            case 'joined':
                this.userId = message.userId;
                this.role = message.role || 'user';
                if (this.role === 'admin') {
                    this.adminPanelBtn.classList.remove('hidden');
                    if (this.clearChatBtn) this.clearChatBtn.classList.remove('hidden');
                } else {
                    // Kullanıcı yetkisiyle bağlandıysa admin panellerini devre dışı bırak
                    this.adminPanelBtn.classList.add('hidden');
                    this.adminModal.classList.add('hidden');
                    if (this.clearChatBtn) this.clearChatBtn.classList.add('hidden');
                }
                this.showApp();
                // Yeniden bağlantıda önceki odaya otomatik katıl
                if (this.reconnectRoom) {
                    const roomToJoin = this.reconnectRoom;
                    this.reconnectRoom = null;
                    this.currentRoom = null;
                    this.joinRoom(roomToJoin);
                    this.showToast('✅', 'Yeniden bağlandın!');
                } else {
                    this.showToast('✅', `Hoş geldin, ${this.username}!`);
                }
                break;
                
            case 'admin-success':
                this.role = 'admin';
                this.adminPanelBtn.classList.remove('hidden');
                if (this.clearChatBtn) this.clearChatBtn.classList.remove('hidden');
                this.showToast('👑', 'Admin yetkisi alındı!');
                break;
                
            case 'admin-error':
                this.showToast('❌', message.message);
                break;
                
            case 'clear-chat':
                this.chatMessages.innerHTML = '<div class="chat-welcome-msg"><span>👋</span> Sohbet yöneticisi tarafından temizlendi.</div>';
                break;
                
            case 'kicked':
                this.leaveRoom();
                this.showToast('⚠️', message.message);
                break;
                
            case 'room-join-error':
                this.showToast('❌', message.message);
                break;

            case 'room-update':
                this.updateChannelList(message.rooms);
                break;

            case 'online-users':
                this.updateOnlineMembers(message.users);
                break;

            case 'room-joined':
                this.onRoomJoined(message);
                break;

            case 'room-left':
                this.onRoomLeft();
                break;

            case 'peer-joined':
                this.onPeerJoined(message);
                break;

            case 'peer-left':
                this.onPeerLeft(message);
                break;

            case 'offer':
                this.handleOffer(message);
                break;

            case 'answer':
                this.handleAnswer(message);
                break;

            case 'ice-candidate':
                this.handleIceCandidate(message);
                break;

            case 'chat-message':
                this.addChatMessage(message);
                break;

            case 'speaking':
                this.handleSpeakingState(message);
                break;

            // === SAYFA YENİLEME / DUPLICATE USER ===
            // Sunucu, aynı username'le yeni giriş yapıldığında eski bağlantıya bunu gönderir
            case 'force-disconnect':
                // Bu istemci kapatılıyor — ama sayfa yenileniyorsa zaten yeni bağlantı açılmış olacak
                // Sadece info göster, reconnect döngüsünü tetikleme
                if (this.ws) {
                    // onclose tetiklenmesin diye handler'ları temizle
                    this.ws.onclose = null;
                    try { this.ws.close(); } catch (_) {}
                    this.ws = null;
                }
                this.showToast('ℹ️', message.message || 'Bu oturum kapatıldı.');
                break;

            // === MÜZİK PLAYER ===
            // DJ müzik başlattı — müzik track'i peer bağlantısından gelecek, hazır ol
            case 'music-start':
                this.onMusicStartFromPeer(message);
                break;

            // DJ müziği durdurdu
            case 'music-stop':
                this.onMusicStopFromPeer(message);
                break;

            // DJ müzik durum güncellemesi (çalıyor/duraklatıldı/süre)
            case 'music-status':
                this.onMusicStatusFromPeer(message);
                break;

            case 'pong':
                // Sunucudan heartbeat cevabı — bir şey yapma
                break;
        }
    }

    // =========================================
    // UI Geçişleri
    // =========================================
    showApp() {
        this.loginScreen.classList.add('hidden');
        this.appScreen.classList.remove('hidden');
        this.displayName.textContent = this.username;
        this.userAvatarLetter.textContent = this.username.charAt(0).toUpperCase();
    }

    // =========================================
    // Kanal Listesi Güncelle
    // =========================================
    updateChannelList(rooms) {
        this.roomsList = rooms; // Odaları yerel state'e kaydet
        this.channelList.innerHTML = '';
        
        // Admin paneli için seçiciyi güncelle
        if (this.role === 'admin' && this.adminSelectRoom) {
            const selected = this.adminSelectRoom.value;
            this.adminSelectRoom.innerHTML = '<option value="">Oda Seçin...</option>';
            for (const [roomId, room] of Object.entries(rooms)) {
                const opt = document.createElement('option');
                opt.value = roomId; opt.textContent = room.name;
                if (roomId === selected) opt.selected = true;
                this.adminSelectRoom.appendChild(opt);
            }
        }

        for (const [roomId, room] of Object.entries(rooms)) {
            const isActive = this.currentRoom === roomId;
            const userCount = room.users.length;

            const channelEl = document.createElement('div');
            channelEl.className = `channel-item${isActive ? ' active' : ''}`;
            const lockIcon = room.isLocked ? '<span class="room-lock">🔒</span>' : '';
            channelEl.innerHTML = `
                <span class="channel-icon">${room.icon}</span>
                <span class="channel-name">${room.name}</span>
                ${lockIcon}
                ${userCount > 0 ? `<span class="channel-user-count">${userCount}</span>` : ''}
            `;
            channelEl.addEventListener('click', () => this.joinRoom(roomId));
            this.channelList.appendChild(channelEl);

            // Odadaki kullanıcıları göster
            if (userCount > 0) {
                const usersContainer = document.createElement('div');
                usersContainer.className = 'channel-users-in-room';
                room.users.forEach(user => {
                    const isSpeaking = this.speakingUsers.has(user.id) || (user.id === this.userId && this.isSpeaking);
                    const userEl = document.createElement('div');
                    userEl.className = `channel-user-item${isSpeaking ? ' speaking' : ''}`;
                    userEl.setAttribute('data-user-id', user.id);
                    const avatarColor = user.color || '#5865F2';
                    const isAdmin = user.role === 'admin' ? 
                        `<span class="admin-crown" title="Yönetici Paneli" ${user.id === this.userId ? 'style="cursor:pointer;"' : ''}>👑</span>` : '';
                    userEl.innerHTML = `
                        <span class="mini-avatar" style="background: ${avatarColor}">${user.username.charAt(0).toUpperCase()}</span>
                        <span class="channel-user-name">${user.username}${isAdmin}</span>
                        ${user.isMuted ? '<span class="user-muted-icon">🔇</span>' : ''}
                    `;
                    
                    // Kendi taç ikonumuza tıklarsak admin panelini aç
                    if (user.role === 'admin' && user.id === this.userId) {
                        const crownIcon = userEl.querySelector('.admin-crown');
                        if (crownIcon) {
                            crownIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (this.adminModal) {
                                    this.adminModal.classList.remove('hidden');
                                }
                            });
                        }
                    }

                    // Admin ise "Kullanıcıyı At" butonu ekle
                    if (this.role === 'admin' && user.id !== this.userId) {
                        const kickBtn = document.createElement('span');
                        kickBtn.innerHTML = '❌';
                        kickBtn.className = 'admin-kick-icon';
                        kickBtn.title = 'Kanaldan At';
                        kickBtn.style.cursor = 'pointer';
                        kickBtn.style.marginLeft = 'auto';
                        kickBtn.style.fontSize = '12px';
                        kickBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.ws.send(JSON.stringify({ type: 'admin-kick', targetId: user.id }));
                        };
                        userEl.appendChild(kickBtn);
                    }
                    
                    usersContainer.appendChild(userEl);
                });
                this.channelList.appendChild(usersContainer);
            }
        }

        // Eğer sesli odadaysak, katılımcıları güncelle
        if (this.currentRoom && rooms[this.currentRoom]) {
            this.updateVoiceParticipants(rooms[this.currentRoom].users);
        }
    }

    // =========================================
    // Çevrimiçi Üyeler
    // =========================================
    updateOnlineMembers(users) {
        this.onlineMembers.innerHTML = '';
        this.onlineCount.textContent = users.length;

        users.forEach(user => {
            const memberEl = document.createElement('div');
            memberEl.className = 'member-item';
            const avatarColor = user.color || '#5865F2';
            memberEl.innerHTML = `
                <div class="member-avatar" style="background: ${avatarColor}">
                    ${user.username.charAt(0).toUpperCase()}
                    <span class="status-indicator"></span>
                </div>
                <div class="member-info">
                    <span class="member-name">${user.username}</span>
                    ${user.currentRoom ? `<span class="member-room">🔊 Sesli kanalda</span>` : `<span class="member-room">Çevrimiçi</span>`}
                </div>
            `;
            this.onlineMembers.appendChild(memberEl);
        });
    }

    // =========================================
    // Odaya Katıl
    // =========================================
    async joinRoom(roomId) {
        if (this.currentRoom === roomId) return;
        
        const roomInfo = this.roomsList && this.roomsList[roomId];
        if (roomInfo && roomInfo.isLocked && this.role !== 'admin') {
            // Kayıtlı şifre var mı kontrol et
            if (this.roomPasswords[roomId]) {
                return this.executeJoinRoom(roomId, this.roomPasswords[roomId]);
            }
            this.pendingRoomId = roomId;
            this.roomPasswordInput.value = '';
            this.passwordModal.classList.remove('hidden');
            return;
        }

        this.executeJoinRoom(roomId, '');
    }

    async executeJoinRoom(roomId, password) {
        try {
            // Mikrofon erişimi al - Kullanıcının ses ayarlarını uygula
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: this.audioConstraints,
                    video: false
                });
            }

            this.ws.send(JSON.stringify({
                type: 'join-room',
                roomId: roomId,
                password: password
            }));

            // Şifreyi yerel olarak kaydet (başarısız olsa bile deneriz, başarılıysa kalır)
            if (password) {
                this.roomPasswords[roomId] = password;
                localStorage.setItem('roomPasswords', JSON.stringify(this.roomPasswords));
            }
        } catch (err) {
            console.error('Mikrofon erişim hatası:', err);
            this.showToast('❌', 'Mikrofon erişimi reddedildi veya ayarlarda bir sorun oluştu.');
        }
    }

    onRoomJoined(message) {
        this.currentRoom = message.roomId;
        // === SAYFA YENİLEME === - son girilen odayı localStorage'a kaydet
        localStorage.setItem('currentRoom', message.roomId);

        // UI güncelle
        this.welcomeView.classList.add('hidden');
        this.voiceView.classList.remove('hidden');
        this.disconnectBtn.style.display = 'flex';
        this.userStatusText.textContent = 'Sesli kanalda';

        // Odadaki mevcut kullanıcılarla bağlantı kur
        message.existingUsers.forEach(user => {
            this.createPeerConnection(user.id, true);
        });

        // Konuşma algılamayı başlat
        this.startVoiceActivityDetection();

        this.playSound('join');
        this.showToast('🔊', 'Sesli kanala katıldın!');
    }

    // =========================================
    // Odadan Ayrıl
    // =========================================
    leaveRoom() {
        if (!this.currentRoom) return;

        // === MÜZİK PLAYER === - odadan çıkınca müziği durdur
        if (this.isSharingMusic) {
            this.stopMusicShare();
        }

        // Tüm peer bağlantılarını kapat
        this.peers.forEach((peer, peerId) => {
            try { peer.pc.close(); } catch (_) {}
            // Ses elementini temizle
            if (peer.audioEl) {
                try { peer.audioEl.srcObject = null; } catch (_) {}
                try { peer.audioEl.pause(); } catch (_) {}
                try { peer.audioEl.remove(); } catch (_) {}
            }
            // Müzik elementini de temizle
            if (peer.musicEl) {
                try { peer.musicEl.srcObject = null; } catch (_) {}
                try { peer.musicEl.pause(); } catch (_) {}
                try { peer.musicEl.remove(); } catch (_) {}
            }
        });
        this.peers.clear();

        this.ws.send(JSON.stringify({ type: 'leave-room' }));
    }

    onRoomLeft() {
        this.currentRoom = null;
        // === SAYFA YENİLEME === - odadan çıkınca kaydı temizle
        localStorage.removeItem('currentRoom');
        this.savedRoom = null;
        this.voiceView.classList.add('hidden');
        this.welcomeView.classList.remove('hidden');
        this.disconnectBtn.style.display = 'none';
        this.userStatusText.textContent = 'Çevrimiçi';
        this.voiceParticipants.innerHTML = '';
        this.speakingUsers.clear();
        this.stopVoiceActivityDetection();

        // Chat temizle
        this.chatMessages.innerHTML = '<div class="chat-welcome-msg"><span>👋</span> Sesli kanala hoş geldin! Buradan mesaj yazabilirsin.</div>';
        
        // Ekran paylaşımı kapanır
        if (this.isScreenSharing) this.stopScreenShare();
        this.videoStage.innerHTML = '';
        this.videoStage.classList.add('hidden');

        this.playSound('leave');
        this.showToast('📤', 'Sesli kanaldan ayrıldın.');
    }

    // =========================================
    // Peer Olayları
    // =========================================
    onPeerJoined(message) {
        this.playSound('join');
        this.showToast('👋', `${message.username} katıldı!`);
    }

    onPeerLeft(message) {
        this.playSound('leave');
        const peer = this.peers.get(message.userId);
        if (peer) {
            try { peer.pc.close(); } catch (_) {}
            if (peer.audioEl) {
                try { peer.audioEl.srcObject = null; } catch (_) {}
                try { peer.audioEl.pause(); } catch (_) {}
                try { peer.audioEl.remove(); } catch (_) {}
            }
            // === MÜZİK PLAYER === - müzik elementini de temizle
            if (peer.musicEl) {
                try { peer.musicEl.srcObject = null; } catch (_) {}
                try { peer.musicEl.pause(); } catch (_) {}
                try { peer.musicEl.remove(); } catch (_) {}
            }
            this.peers.delete(message.userId);
        }
        // UI'daki müzik kontrollerini de kaldır
        const musicControls = document.getElementById(`music-controls-${message.userId}`);
        if (musicControls) musicControls.remove();
        this.showToast('👋', `${message.username} ayrıldı.`);
    }

    // =========================================
    // WebRTC - Bağlantı Kurulumu
    // =========================================
    createPeerConnection(peerId, isInitiator) {
        const pc = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // Yerel ses akışını ekle
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Eğer ekran paylaşıyorsak, onu da ekle (Yeni katılacak kişinin ekranımızı görebilmesi için)
        if (this.isScreenSharing && this.screenStream) {
            this.screenStream.getTracks().forEach(track => {
                pc.addTrack(track, this.screenStream);
            });
        }

        // ICE adaylarını gönder
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    targetId: peerId,
                    data: event.candidate
                }));
            }
        };

        // Renegotiation (Örneğin canlı yayına track eklendiğinde)
        pc.onnegotiationneeded = async () => {
            try {
                if (pc.signalingState !== "stable") return;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.ws.send(JSON.stringify({
                    type: 'offer',
                    targetId: peerId,
                    data: pc.localDescription
                }));
            } catch (err) {
                console.error('Renegotiation hatası:', err);
            }
        };

        // Uzak ses / ekran akışını al
        pc.ontrack = (event) => {
            const track = event.track;
            const stream = event.streams[0];
            
            // Eğer video (Ekran Paylaşımı) ise Stage'e ekle
            if (track.kind === 'video') {
                this.showRemoteVideo(peerId, stream);
                
                track.onended = () => {
                    this.removeRemoteVideo(peerId);
                };
                return;
            }

            // === AUDIO TRACK ===
            // İlk audio track = sesli konuşma (voice)
            // İkinci audio track = müzik (eğer DJ müzik paylaşıyorsa)
            // Peer datasını al
            let peerData = this.peers.get(peerId);
            if (!peerData) {
                peerData = { pc, audioEl: null, musicEl: null, remoteStream: null, isSharingMusic: false, musicTrackName: '' };
                this.peers.set(peerId, peerData);
            }

            // Eğer peer müzik paylaşıyorsa VE zaten bir voice audio elementi varsa → yeni track müziktir
            const isMusicTrack = peerData.isSharingMusic && peerData.audioEl && peerData.audioEl.srcObject;

            if (isMusicTrack) {
                // Müzik track — ayrı bir audio elementi oluştur
                let musicEl = peerData.musicEl;
                if (!musicEl) {
                    musicEl = document.createElement('audio');
                    musicEl.id = `music-${peerId}`;
                    musicEl.autoplay = true;
                    musicEl.playsInline = true;
                    // Müzik için kaydedilmiş ses seviyesini uygula (default 0.7)
                    const musicVol = this.peerMusicVolumes.has(peerId) ? this.peerMusicVolumes.get(peerId) : 0.7;
                    musicEl.volume = musicVol;
                    document.body.appendChild(musicEl);
                    peerData.musicEl = musicEl;
                }
                musicEl.srcObject = stream;
                // === AUDIO SYNC FIX === - tarayıcı autoplay politikası nedeniyle .play() çağır
                this.forcePlayAudio(musicEl);
            } else {
                // Voice track — mevcut davranış
                let audioEl = peerData.audioEl;
                if (!audioEl) {
                    audioEl = document.createElement('audio');
                    audioEl.id = `audio-${peerId}`;
                    audioEl.autoplay = true;
                    audioEl.playsInline = true;
                    // Kaydedilmiş ses seviyesini uygula
                    const volValue = this.peerVolumes.has(peerId) ? this.peerVolumes.get(peerId) : 1.0;
                    audioEl.volume = volValue;
                    document.body.appendChild(audioEl);
                    peerData.audioEl = audioEl;
                }
                audioEl.srcObject = stream;
                // === AUDIO SYNC FIX === - tarayıcı autoplay politikası nedeniyle .play() çağır
                this.forcePlayAudio(audioEl);
                peerData.remoteStream = stream;
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Peer ${peerId} bağlantı durumu: ${pc.connectionState}`);
            // === AUDIO SYNC FIX === - bağlantı "failed" olursa peer'ı temizle, "connected" olursa audio'yu yeniden çal
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                const pd = this.peers.get(peerId);
                if (pd) {
                    if (pd.audioEl) { try { pd.audioEl.pause(); } catch (_) {} }
                    if (pd.musicEl) { try { pd.musicEl.pause(); } catch (_) {} }
                }
            } else if (pc.connectionState === 'connected') {
                const pd = this.peers.get(peerId);
                if (pd) {
                    if (pd.audioEl) this.forcePlayAudio(pd.audioEl);
                    if (pd.musicEl) this.forcePlayAudio(pd.musicEl);
                }
            }
        };

        // Peer datasını başlat (yoksa)
        if (!this.peers.has(peerId)) {
            this.peers.set(peerId, { pc, audioEl: null, musicEl: null, remoteStream: null, isSharingMusic: false, musicTrackName: '' });
        }

        // Teklif oluştur (initiator ise)
        if (isInitiator) {
            this.createOffer(peerId, pc);
        }

        return pc;
    }

    // === AUDIO SYNC FIX ===
    // Tarayıcı autoplay politikası bazen <audio>.play()'i engeller.
    // Bu metod .play()'i dener, başarısız olursa kullanıcı etkileşiminde tekrar dener.
    forcePlayAudio(audioEl) {
        if (!audioEl) return;
        try {
            const p = audioEl.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    // Autoplay engellendi — bir sonraki kullanıcı tıklaması/klavyede sesi çal
                    const resume = () => {
                        try { audioEl.play().catch(() => {}); } catch (_) {}
                        document.removeEventListener('click', resume);
                        document.removeEventListener('keydown', resume);
                        document.removeEventListener('touchstart', resume);
                    };
                    document.addEventListener('click', resume, { once: true });
                    document.addEventListener('keydown', resume, { once: true });
                    document.addEventListener('touchstart', resume, { once: true });
                });
            }
        } catch (e) {
            console.warn('Audio play hatası:', e);
        }
    }

    async createOffer(peerId, pc) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.ws.send(JSON.stringify({
                type: 'offer',
                targetId: peerId,
                data: offer
            }));
        } catch (err) {
            console.error('Offer oluşturma hatası:', err);
        }
    }

    async handleOffer(message) {
        let peer = this.peers.get(message.senderId);
        let pc;
        if (peer) {
            pc = peer.pc;
        } else {
            pc = this.createPeerConnection(message.senderId, false);
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(message.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.ws.send(JSON.stringify({
                type: 'answer',
                targetId: message.senderId,
                data: answer
            }));
        } catch (err) {
            console.error('Offer işleme hatası:', err);
        }
    }

    async handleAnswer(message) {
        const peer = this.peers.get(message.senderId);
        if (peer) {
            try {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(message.data));
            } catch (err) {
                console.error('Answer işleme hatası:', err);
            }
        }
    }

    async handleIceCandidate(message) {
        const peer = this.peers.get(message.senderId);
        if (peer) {
            try {
                await peer.pc.addIceCandidate(new RTCIceCandidate(message.data));
            } catch (err) {
                console.error('ICE candidate işleme hatası:', err);
            }
        }
    }

    // =========================================
    // Ses Kontrolleri
    // =========================================
    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
        }

        // UI güncelle
        this.micBtn.classList.toggle('muted', this.isMuted);
        this.micBtn.querySelector('.icon-mic-on').classList.toggle('hidden', this.isMuted);
        this.micBtn.querySelector('.icon-mic-off').classList.toggle('hidden', !this.isMuted);

        // Sunucuya bildir
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'toggle-mute',
                isMuted: this.isMuted
            }));
        }
    }

    toggleDeafen() {
        this.isDeafened = !this.isDeafened;

        // Kulaklık kapatılınca mikrofon da kapatılır
        if (this.isDeafened && !this.isMuted) {
            this.toggleMute();
        } else if (!this.isDeafened && this.isMuted) {
            this.toggleMute();
        }

        // Uzak sesleri kapat/aç
        this.peers.forEach((peer) => {
            if (peer.audioEl) {
                peer.audioEl.muted = this.isDeafened;
            }
        });

        // UI güncelle
        this.deafenBtn.classList.toggle('muted', this.isDeafened);
        this.deafenBtn.querySelector('.icon-headphone-on').classList.toggle('hidden', this.isDeafened);
        this.deafenBtn.querySelector('.icon-headphone-off').classList.toggle('hidden', !this.isDeafened);

        // Sunucuya bildir
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'toggle-deafen',
                isDeafened: this.isDeafened
            }));
        }
    }

    // =========================================
    // Sesli Oda Katılımcıları Güncelle
    // =========================================
    updateVoiceParticipants(users) {
        const roomData = users;
        const roomInfo = this.getRoomInfo();

        if (roomInfo) {
            this.voiceRoomName.textContent = roomInfo.name;
            this.voiceRoomIcon.textContent = roomInfo.icon;
        }

        this.voiceParticipants.innerHTML = '';
        roomData.forEach(user => {
            const card = document.createElement('div');
            const isSpeaking = this.speakingUsers.has(user.id) || (user.id === this.userId && this.isSpeaking);
            card.className = `participant-card${isSpeaking ? ' speaking' : ''}`;
            card.id = `participant-${user.id}`;
            const avatarColor = user.color || '#5865F2';
            card.innerHTML = `
                <div class="participant-avatar${user.isMuted ? ' muted' : ''}" style="background: ${avatarColor}">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <span class="participant-name">${user.username}</span>
                <span class="participant-status">${user.isMuted ? '🔇 Sessiz' : user.isDeafened ? '🔇 Sağır' : isSpeaking ? '🗣️ Konuşuyor' : '🎤 Dinliyor'}</span>
            `;

            // Eğer kullanıcı kendimiz değilse ses ayar çubuğu ekle
            if (user.id !== this.userId) {
                const volValue = this.peerVolumes.has(user.id) ? this.peerVolumes.get(user.id) : 1.0;
                
                const volControl = document.createElement('div');
                volControl.className = 'participant-volume-control';
                volControl.innerHTML = `
                    <span class="volume-icon">🔊</span>
                    <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="${volValue}">
                `;

                // Slider olayı
                const slider = volControl.querySelector('.volume-slider');
                slider.addEventListener('input', (e) => {
                    const newVol = parseFloat(e.target.value);
                    this.peerVolumes.set(user.id, newVol);
                    
                    const peer = this.peers.get(user.id);
                    if (peer && peer.audioEl) {
                        peer.audioEl.volume = newVol;
                    }
                    
                    const icon = volControl.querySelector('.volume-icon');
                    if (newVol === 0) icon.textContent = '🔇';
                    else if (newVol < 0.5) icon.textContent = '🔉';
                    else icon.textContent = '🔊';
                });

                // Başlangıç ikonunu ayarla
                const icon = volControl.querySelector('.volume-icon');
                if (volValue === 0) icon.textContent = '🔇';
                else if (volValue < 0.5) icon.textContent = '🔉';
                
                // Event delegation'ı engellemek için tıklandığında üst kapsayıcıya gitmesini durdur
                volControl.addEventListener('click', e => e.stopPropagation());

                card.appendChild(volControl);
            }

            // Eğer Admin isek "Kick" simgesi ekle
            if (this.role === 'admin' && user.id !== this.userId) {
                const kickIcon = document.createElement('div');
                kickIcon.className = 'admin-kick-icon';
                kickIcon.innerHTML = '❌';
                kickIcon.title = 'Kullanıcıyı At';
                
                kickIcon.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`${user.username} adlı kullanıcıyı atmak istediğinize emin misiniz?`)) {
                        this.ws.send(JSON.stringify({ type: 'admin-kick', targetId: user.id }));
                    }
                };
                card.appendChild(kickIcon);
            }

            this.voiceParticipants.appendChild(card);
        });
    }

    // =========================================
    // Konuşma Algılama (Voice Activity Detection)
    // =========================================
    startVoiceActivityDetection() {
        if (!this.localStream) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.4;

            const source = this.audioContext.createMediaStreamSource(this.localStream);
            source.connect(this.analyser);

            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            let consecutiveSpeaking = 0;
            let consecutiveSilent = 0;

            this.vadInterval = setInterval(() => {
                if (this.isMuted) {
                    if (this.isSpeaking) {
                        this.isSpeaking = false;
                        this.updateSpeakingUI(this.userId, false);
                        this.sendSpeakingState(false);
                    }
                    return;
                }

                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;

                if (average > this.speakingThreshold) {
                    consecutiveSpeaking++;
                    consecutiveSilent = 0;
                } else {
                    consecutiveSilent++;
                    consecutiveSpeaking = 0;
                }

                // Konuşma başla: 3 ardışık frame
                if (!this.isSpeaking && consecutiveSpeaking >= 3) {
                    this.isSpeaking = true;
                    this.updateSpeakingUI(this.userId, true);
                    this.sendSpeakingState(true);
                }

                // Konuşma bitir: 8 ardışık sessiz frame
                if (this.isSpeaking && consecutiveSilent >= 8) {
                    this.isSpeaking = false;
                    this.updateSpeakingUI(this.userId, false);
                    this.sendSpeakingState(false);
                }
            }, 60);
        } catch (err) {
            console.error('Ses algılama başlatma hatası:', err);
        }
    }

    stopVoiceActivityDetection() {
        if (this.vadInterval) {
            clearInterval(this.vadInterval);
            this.vadInterval = null;
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
        this.isSpeaking = false;
    }

    sendSpeakingState(isSpeaking) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'speaking',
                isSpeaking: isSpeaking
            }));
        }
    }

    handleSpeakingState(message) {
        if (message.isSpeaking) {
            this.speakingUsers.add(message.userId);
        } else {
            this.speakingUsers.delete(message.userId);
        }
        this.updateSpeakingUI(message.userId, message.isSpeaking);
    }

    updateSpeakingUI(userId, isSpeaking) {
        // Ortadaki katılımcı kartı
        const card = document.getElementById(`participant-${userId}`);
        if (card) {
            if (isSpeaking) {
                card.classList.add('speaking');
                const statusEl = card.querySelector('.participant-status');
                if (statusEl) statusEl.textContent = '🗣️ Konuşuyor';
            } else {
                card.classList.remove('speaking');
                const statusEl = card.querySelector('.participant-status');
                if (statusEl) statusEl.textContent = '🎤 Dinliyor';
            }
        }

        // Sol sidebar'daki kanal nick listesi
        const sidebarItems = document.querySelectorAll(`.channel-user-item[data-user-id="${userId}"]`);
        sidebarItems.forEach(item => {
            if (isSpeaking) {
                item.classList.add('speaking');
            } else {
                item.classList.remove('speaking');
            }
        });
    }

    // =========================================
    // Chat Mesajlaşma
    // =========================================
    sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;
        
        // Admin Girişi (Gizli Komut)
        if (text.startsWith('/admin ')) {
            const pwd = text.replace('/admin ', '').trim();
            this.ws.send(JSON.stringify({ type: 'admin-login', password: pwd }));
            this.chatInput.value = '';
            return;
        }

        if (!this.currentRoom) return;

        this.ws.send(JSON.stringify({
            type: 'chat-message',
            message: text
        }));

        this.chatInput.value = '';
    }

    addChatMessage(message) {
        // Hoşgeldin mesajını kaldır
        const welcomeMsg = this.chatMessages.querySelector('.chat-welcome-msg');
        if (welcomeMsg) welcomeMsg.remove();

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg';

        const time = new Date(message.timestamp);
        const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

        let safeText = this.escapeHtml(message.message);
        
        // Animasyonlu emojileri değiştir
        const animatedMap = {
            '😀': '1f600', '😂': '1f602', '🤣': '1f923', '😍': '1f60d', '🥰': '1f970', '😘': '1f618',
            '🤪': '1f92a', '🥳': '1f973', '😎': '1f60e', '🥺': '1f97a', '😭': '1f62d', '😡': '1f621',
            '💀': '1f480', '💯': '1f4af', '🔥': '1f525', '✨': '2728', '🎉': '1f389', '👍': '1f44d'
        };
        
        for (const [char, id] of Object.entries(animatedMap)) {
            const regex = new RegExp(char, 'g');
            safeText = safeText.replace(regex, `<img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${id}/512.webp" class="chat-animated-emoji" alt="${char}">`);
        }
        
        const avatarColor = message.color || '#5865F2';

        msgEl.innerHTML = `
            <div class="chat-msg-header">
                <span class="chat-msg-author" style="color: ${avatarColor}">${message.username}</span>
                <span class="chat-msg-time">${timeStr}</span>
            </div>
            <div class="chat-msg-text">${safeText}</div>
        `;

        this.chatMessages.appendChild(msgEl);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    // =========================================
    // Kamera (Camera Share)
    // =========================================
    async toggleCamera() {
        if (this.isCameraOn) {
            this.stopCamera();
            return;
        }

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
                audio: false
            });

            this.isCameraOn = true;
            this.camBtn.classList.add('active');
            this.camBtn.querySelector('.icon-cam-on').classList.add('hidden');
            this.camBtn.querySelector('.icon-cam-off').classList.remove('hidden');
            
            const videoTrack = this.cameraStream.getVideoTracks()[0];
            
            this.peers.forEach((peer) => {
                peer.pc.addTrack(videoTrack, this.cameraStream);
            });
            
            this.showLocalVideo(this.cameraStream);
            this.showToast('📷', 'Kameranız açıldı!');

        } catch (err) {
            console.error('Kamera hatası:', err);
            this.showToast('❌', 'Kamera başlatılamadı. İzinlerinizi kontrol edin.');
        }
    }

    stopCamera() {
        if (!this.isCameraOn) return;
        this.isCameraOn = false;
        this.camBtn.classList.remove('active');
        this.camBtn.querySelector('.icon-cam-on').classList.remove('hidden');
        this.camBtn.querySelector('.icon-cam-off').classList.add('hidden');

        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            const videoTrack = this.cameraStream.getVideoTracks()[0];
            if (videoTrack) {
                this.peers.forEach((peer) => {
                    const senders = peer.pc.getSenders();
                    const sender = senders.find(s => s.track && s.track.kind === 'video');
                    if (sender) peer.pc.removeTrack(sender);
                });
            }
            this.cameraStream = null;
        }

        this.videoStage.innerHTML = '';
        this.videoStage.classList.add('hidden');
        this.showToast('📷', 'Kamera kapatıldı.');
    }

    // =========================================
    // Ekran Paylaşımı (Screen Share)
    // =========================================
    async toggleScreenShare() {
        if (this.isScreenSharing) {
            this.stopScreenShare();
            return;
        }

        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
                audio: true
            });

            this.isScreenSharing = true;
            this.shareScreenBtn.classList.add('active');
            this.shareScreenBtn.style.color = '#3BA55D';
            
            const videoTrack = this.screenStream.getVideoTracks()[0];
            videoTrack.onended = () => {
                this.stopScreenShare();
            };

            this.peers.forEach((peer, peerId) => {
                peer.pc.addTrack(videoTrack, this.screenStream);
            });
            
            this.showLocalVideo(this.screenStream);

        } catch (err) {
            console.error('Ekran paylaşımı hatası:', err);
            this.showToast('❌', 'Ekran paylaşımı başlatılamadı veya iptal edildi.');
        }
    }

    stopScreenShare() {
        if (!this.isScreenSharing) return;
        this.isScreenSharing = false;
        if (this.shareScreenBtn) {
            this.shareScreenBtn.classList.remove('active');
            this.shareScreenBtn.style.color = '';
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            
            const videoTrack = this.screenStream.getVideoTracks()[0] || this.screenStream.getTracks().find(t => t.kind === 'video');
            if (videoTrack) {
                this.peers.forEach((peer) => {
                    const senders = peer.pc.getSenders();
                    const sender = senders.find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        peer.pc.removeTrack(sender);
                    }
                });
            }
            this.screenStream = null;
        }

        this.videoStage.innerHTML = '';
        this.videoStage.classList.add('hidden');
    }

    showLocalVideo(stream) {
        this.videoStage.innerHTML = '';
        this.videoStage.classList.remove('hidden');
        
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.autoplay = true;
        videoEl.muted = true; // Kendi sesimizi engelle
        videoEl.playsInline = true;
        videoEl.className = 'stage-video';
        
        const label = document.createElement('div');
        label.className = 'stage-label';
        label.textContent = 'Sizin Ekranınız';
        
        this.videoStage.appendChild(videoEl);
        this.videoStage.appendChild(label);
    }

    showRemoteVideo(peerId, stream) {
        this.videoStage.innerHTML = '';
        this.videoStage.classList.remove('hidden');
        
        // Ana Konteyner
        const container = document.createElement('div');
        container.className = 'remote-stream-container';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.position = 'relative';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';

        const videoEl = document.createElement('video');
        videoEl.id = `video-${peerId}`;
        videoEl.srcObject = stream;
        videoEl.playsInline = true;
        videoEl.className = 'stage-video';
        videoEl.style.display = 'none'; // Başlangıçta gizli

        // Kullanıcı adını bul
        const pCard = document.getElementById(`participant-${peerId}`);
        const username = pCard ? pCard.querySelector('.participant-name').textContent : 'Bir Kullanıcı';
        
        // Overlay (Yayına Katıl)
        const overlay = document.createElement('div');
        overlay.className = 'stream-overlay';
        overlay.style.textAlign = 'center';
        overlay.style.color = '#fff';
        overlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.6); padding: 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="font-size: 30px; margin-bottom: 10px;">📺</div>
                <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 500;">${username} yayın başlattı</h3>
                <button class="btn-primary" id="join-stream-btn-${peerId}" style="width: 100%;">Yayını İzle</button>
            </div>
        `;

        // Kontrol Çubuğu
        const controls = document.createElement('div');
        controls.className = 'stream-controls hidden';
        controls.style.position = 'absolute';
        controls.style.bottom = '15px';
        controls.style.left = '50%';
        controls.style.transform = 'translateX(-50%)';
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.background = 'rgba(0,0,0,0.85)';
        controls.style.padding = '8px 15px';
        controls.style.borderRadius = '20px';
        controls.style.border = '1px solid rgba(255,255,255,0.1)';
        controls.style.backdropFilter = 'blur(10px)';
        controls.style.zIndex = '10';
        controls.innerHTML = `
            <span style="color:var(--green); font-size:13px; font-weight:bold; align-self:center; margin-right:10px;">🔴 ${username}</span>
            <button class="btn-secondary" style="padding: 4px 12px; font-size: 13px;" id="fs-stream-btn-${peerId}">🔲 Tam Ekran</button>
            <button class="btn-leave" style="padding: 4px 12px; font-size: 13px; background: rgba(237,66,69,0.2); color: #ED4245; border: 1px solid rgba(237,66,69,0.5);" id="close-stream-btn-${peerId}">Kapat</button>
        `;

        container.appendChild(videoEl);
        container.appendChild(overlay);
        container.appendChild(controls);
        this.videoStage.appendChild(container);

        // Event Listeners
        const joinBtn = document.getElementById(`join-stream-btn-${peerId}`);
        const closeBtn = document.getElementById(`close-stream-btn-${peerId}`);
        const fsBtn = document.getElementById(`fs-stream-btn-${peerId}`);

        joinBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            videoEl.style.display = 'block';
            controls.classList.remove('hidden');
            videoEl.play().catch(e => {
                console.error('Video oynatılamadı:', e);
                this.showToast('⚠️', 'Tarayıcınız otomatik oynatmayı engelledi.');
            });
        });

        closeBtn.addEventListener('click', () => {
            videoEl.pause();
            videoEl.style.display = 'none';
            controls.classList.add('hidden');
            overlay.classList.remove('hidden');
            joinBtn.textContent = 'Yayına Geri Dön';
        });

        fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => {
                    this.showToast('❌', 'Tam ekran yapılamadı.');
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    removeRemoteVideo(peerId) {
        const videoEl = document.getElementById(`video-${peerId}`);
        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.remove();
        }
        const labelEl = document.getElementById(`video-label-${peerId}`);
        if (labelEl) labelEl.remove();
        
        if (this.videoStage.children.length === 0) {
            this.videoStage.classList.add('hidden');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getAuthorColor(name) {
        const colors = ['#7C5CFC', '#3BA55D', '#FAA81A', '#ED4245', '#F47B67', '#00B0F4', '#E67E22', '#9B59B6'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    getRoomInfo() {
        const rooms = {
            'genel': { name: 'Genel', icon: '💬' },
            'oyun': { name: 'Oyun', icon: '🎮' },
            'muzik': { name: 'Müzik', icon: '🎵' },
            'chill': { name: 'Chill', icon: '☕' }
        };
        return rooms[this.currentRoom] || null;
    }

    // =========================================
    // Yardımcı Fonksiyonlar
    // =========================================
    showToast(icon, message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =========================================
    // MÜZİK PLAYER — DJ TARAFI
    // =========================================
    loadMusicFromFile(file) {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            this.showToast('⚠️', 'Dosya çok büyük (maks 50MB).');
            return;
        }
        const url = URL.createObjectURL(file);
        this.loadMusicFromUrl(url, file.name);
    }

    loadMusicFromUrl(url, trackName) {
        if (!url) return;
        // Önce eski müziği tamamen durdur
        this.stopMusicShare();

        if (!this.musicAudio) return;
        this.musicAudio.crossOrigin = 'anonymous';
        this.musicAudio.src = url;
        this.musicAudio.volume = this.isMusicLocallyMuted ? 0 : parseFloat(this.musicLocalVolume.value || 0.7);
        this.musicTrackLabel.textContent = trackName || url.split('/').pop() || 'Müzik';

        // Yüklenince metadata'yı göster ve hazır hale getir
        this.musicAudio.addEventListener('loadedmetadata', () => {
            if (this.musicDuration) this.musicDuration.textContent = this.formatTime(this.musicAudio.duration);
            if (this.musicProgress) {
                this.musicProgress.max = Math.floor(this.musicAudio.duration || 0);
                this.musicProgress.value = 0;
            }
        }, { once: true });

        this.showToast('🎵', 'Müzik yüklendi. "Çal" ile başlatın.');
    }

    async toggleMusicPlay() {
        if (!this.musicAudio || !this.musicAudio.src) {
            this.showToast('⚠️', 'Önce bir müzik yükle.');
            return;
        }
        if (this.musicAudio.paused) {
            await this.startMusicShare();
        } else {
            // Duraklat — sadece DJ'nin çalmayı durdurması; peer'lara haber ver
            this.musicAudio.pause();
            if (this.musicPlayBtn) this.musicPlayBtn.textContent = '▶';
            this.sendMusicStatus(false, this.musicAudio.currentTime, this.musicAudio.duration);
        }
    }

    async startMusicShare() {
        if (!this.musicAudio || !this.musicAudio.src) return;
        if (!this.currentRoom) {
            this.showToast('⚠️', 'Önce bir sesli odaya katıl.');
            return;
        }

        try {
            // AudioContext'i hazırla (müzik yakalama)
            if (!this.musicAudioContext) {
                this.musicAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.musicAudioContext.state === 'suspended') {
                await this.musicAudioContext.resume();
            }

            // MediaElementSource — sadece 1 kez oluşturulabilir
            if (!this.musicSourceNode) {
                this.musicSourceNode = this.musicAudioContext.createMediaElementSource(this.musicAudio);
                this.musicDestNode = this.musicAudioContext.createMediaStreamDestination();
                // Source → hem hedefe (peer'lara) hem de hoparlöre (DJ'nin duyması için)
                this.musicSourceNode.connect(this.musicDestNode);
                this.musicSourceNode.connect(this.musicAudioContext.destination);
            }
            this.musicStream = this.musicDestNode.stream;

            // Müzik track'i tüm mevcut peer'lara ekle
            const musicTrack = this.musicStream.getAudioTracks()[0];
            this.peers.forEach((peer) => {
                if (peer.musicSender) {
                    // Zaten eklenmiş, atla
                    return;
                }
                try {
                    const sender = peer.pc.addTrack(musicTrack, this.musicStream);
                    peer.musicSender = sender;
                } catch (e) {
                    console.warn('Müzik track eklenemedi:', e);
                }
            });

            // Müziği çal
            await this.musicAudio.play();
            if (this.musicPlayBtn) this.musicPlayBtn.textContent = '⏸';

            // Sunucuya müzik başladı bildirimi gönder (server odadakilere 'music-start' yayınlar)
            this.isSharingMusic = true;
            this.ws.send(JSON.stringify({
                type: 'music-start',
                trackName: this.musicTrackLabel.textContent || 'Müzik'
            }));

            // Periyodik olarak durum bilgisi gönder (süre ilerlemesi için)
            if (this.musicStatusInterval) clearInterval(this.musicStatusInterval);
            this.musicStatusInterval = setInterval(() => {
                if (this.isSharingMusic && this.musicAudio && !this.musicAudio.paused) {
                    this.sendMusicStatus(true, this.musicAudio.currentTime, this.musicAudio.duration);
                }
            }, 1000);

            this.showToast('🎵', 'Müzik paylaşıma başladı!');
        } catch (err) {
            console.error('Müzik başlatma hatası:', err);
            this.showToast('❌', 'Müzik başlatılamadı: ' + (err.message || 'bilinmeyen hata'));
        }
    }

    stopMusicShare() {
        if (!this.isSharingMusic) {
            // Sadece yerel audio'yu durdur yeter
            if (this.musicAudio) {
                try { this.musicAudio.pause(); } catch (_) {}
            }
            if (this.musicPlayBtn) this.musicPlayBtn.textContent = '▶';
            return;
        }
        this.isSharingMusic = false;
        if (this.musicAudio) {
            try { this.musicAudio.pause(); } catch (_) {}
            try { this.musicAudio.currentTime = 0; } catch (_) {}
        }
        if (this.musicPlayBtn) this.musicPlayBtn.textContent = '▶';

        // Peer'lardan müzik track'ini çıkar
        this.peers.forEach((peer) => {
            if (peer.musicSender) {
                try {
                    peer.pc.removeTrack(peer.musicSender);
                } catch (e) {
                    console.warn('Müzik track çıkarılamadı:', e);
                }
                peer.musicSender = null;
            }
        });

        // Sunucuya haber ver
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'music-stop' }));
        }

        if (this.musicStatusInterval) {
            clearInterval(this.musicStatusInterval);
            this.musicStatusInterval = null;
        }
        this.showToast('⏹️', 'Müzik durduruldu.');
    }

    sendMusicStatus(isPlaying, currentTime, duration) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.isSharingMusic) return;
        this.ws.send(JSON.stringify({
            type: 'music-status',
            isPlaying: isPlaying,
            currentTime: currentTime || 0,
            duration: duration || 0
        }));
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // =========================================
    // MÜZİK PLAYER — DİNLEYİCİ TARAFI
    // =========================================
    // Server'dan 'music-start' geldi: bir DJ müzik paylaşıyor
    onMusicStartFromPeer(message) {
        const peer = this.peers.get(message.djId);
        if (peer) {
            peer.isSharingMusic = true;
            peer.musicTrackName = message.trackName || 'Müzik';
        } else {
            // Henüz peer yoksa (yeni DJ katıldı ve hemen müzik başlattı)
            // Bir sonraki ontrack eventinde kullanılmak üzere bekleyen bir state tut
            this.pendingMusicDJs = this.pendingMusicDJs || new Map();
            this.pendingMusicDJs.set(message.djId, { trackName: message.trackName || 'Müzik', djName: message.djName });
        }
        this.renderMusicControlsForPeer(message.djId, message.djName, message.trackName);
        this.showToast('🎵', `${message.djName} müzik çalmaya başladı: ${message.trackName}`);
    }

    onMusicStopFromPeer(message) {
        const peer = this.peers.get(message.djId);
        if (peer) {
            peer.isSharingMusic = false;
            peer.musicTrackName = '';
            if (peer.musicEl) {
                try { peer.musicEl.srcObject = null; } catch (_) {}
                try { peer.musicEl.pause(); } catch (_) {}
                try { peer.musicEl.remove(); } catch (_) {}
                peer.musicEl = null;
            }
        }
        // UI'daki müzik kontrollerini kaldır
        const controls = document.getElementById(`music-controls-${message.djId}`);
        if (controls) controls.remove();
        const toast = this.showToast('⏹️', 'Müzik durduruldu.');
    }

    onMusicStatusFromPeer(message) {
        // Dinleyici tarafında DJ'nin çalma durumu UI'sını güncelle
        const controls = document.getElementById(`music-controls-${message.djId}`);
        if (controls) {
            const playIcon = controls.querySelector('.music-dj-play-icon');
            if (playIcon) playIcon.textContent = message.isPlaying ? '🎵' : '⏸';
            const timeEl = controls.querySelector('.music-dj-time');
            if (timeEl) {
                timeEl.textContent = `${this.formatTime(message.currentTime)} / ${this.formatTime(message.duration)}`;
            }
            const progress = controls.querySelector('.music-dj-progress');
            if (progress) {
                progress.value = message.currentTime || 0;
                progress.max = message.duration || 0;
            }
        }
    }

    // Dinleyici tarafında her DJ için bir "müzik kutusu" oluştur (volume + mute)
    renderMusicControlsForPeer(djId, djName, trackName) {
        // Eğer zaten varsa, sadece track adını güncelle
        let controls = document.getElementById(`music-controls-${djId}`);
        if (controls) {
            const t = controls.querySelector('.music-dj-track');
            if (t && trackName) t.textContent = trackName;
            return;
        }

        // Konteynır: voice-participants üstüne veya chat-panel üstüne ekle
        // En güzeli voice-participants içinde DJ'nin kartının yanına eklemek olurdu
        // ama şimdilik ayrı bir kutu olarak sesli görünümün üstüne ekleyelim
        const container = document.querySelector('.voice-body') || this.voiceParticipants.parentNode;
        controls = document.createElement('div');
        controls.id = `music-controls-${djId}`;
        controls.className = 'music-listener-controls';
        controls.innerHTML = `
            <div class="music-dj-info">
                <span class="music-dj-play-icon">🎵</span>
                <div>
                    <div class="music-dj-title">🎧 ${this.escapeHtml(djName || 'DJ')} çalıyor</div>
                    <div class="music-dj-track">${this.escapeHtml(trackName || 'Müzik')}</div>
                </div>
            </div>
            <div class="music-dj-progress-row">
                <input type="range" class="music-dj-progress" min="0" max="100" value="0" disabled>
                <span class="music-dj-time">0:00 / 0:00</span>
            </div>
            <div class="music-dj-controls">
                <span class="volume-icon music-dj-vol-icon">🔊</span>
                <input type="range" class="music-dj-volume" min="0" max="1" step="0.05" value="0.7">
                <button class="music-dj-mute-btn" title="Müziği Sustur (sadece sizin için)">🔇</button>
            </div>
        `;
        container.appendChild(controls);

        // Volume slider — sadece bu DJ'nin müziğini etkiler
        const volSlider = controls.querySelector('.music-dj-volume');
        const volIcon = controls.querySelector('.music-dj-vol-icon');
        const muteBtn = controls.querySelector('.music-dj-mute-btn');
        let userMuted = false;

        volSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.peerMusicVolumes.set(djId, v);
            const peer = this.peers.get(djId);
            if (peer && peer.musicEl && !userMuted) {
                peer.musicEl.volume = v;
            }
            if (v === 0) volIcon.textContent = '🔇';
            else if (v < 0.5) volIcon.textContent = '🔉';
            else volIcon.textContent = '🔊';
        });

        muteBtn.addEventListener('click', () => {
            userMuted = !userMuted;
            const peer = this.peers.get(djId);
            if (peer && peer.musicEl) {
                peer.musicEl.muted = userMuted;
            }
            muteBtn.textContent = userMuted ? '🔇' : '🔊';
            muteBtn.title = userMuted ? 'Müzik susturuldu (sizin için)' : 'Müziği sustur';
        });
    }
}

// Uygulamayı başlat
const app = new VoiceChatApp();
