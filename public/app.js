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

        // === YOUTUBE MÜZİK PLAYER ELEMENTLERİ (yeni modern tasarım) ===
        this.musicBtn = document.getElementById('music-btn');
        this.musicPanel = document.getElementById('music-panel');
        this.musicCloseBtn = document.getElementById('music-close-btn');
        this.musicUrlInput = document.getElementById('music-url-input');
        this.musicLoadUrlBtn = document.getElementById('music-load-url-btn');
        this.ytSearchInput = document.getElementById('yt-search-input');
        this.ytSearchBtn = document.getElementById('yt-search-btn');
        this.ytSearchStatus = document.getElementById('yt-search-status');
        this.ytSearchResults = document.getElementById('yt-search-results');
        this.ytLinkToggleBtn = document.getElementById('yt-link-toggle-btn');
        this.ytLinkRow = document.getElementById('yt-link-row');
        this.ytPlayerWrapper = document.getElementById('yt-player-wrapper');
        this.ytPlayerDjContainer = document.getElementById('yt-player-dj');
        this.mpLoadingOverlay = document.getElementById('mp-loading-overlay');
        // Şu an çalıyor alanı
        this.mpNowPlaying = document.getElementById('mp-now-playing');
        this.mpNpTitle = document.getElementById('mp-np-title');
        this.mpNpThumb = document.getElementById('mp-np-thumb');
        this.musicProgress = document.getElementById('music-progress');
        this.musicCurrentTime = document.getElementById('music-current-time');
        this.musicDuration = document.getElementById('music-duration');
        this.musicLocalVolume = document.getElementById('music-local-volume');
        this.musicVolUp = document.getElementById('music-vol-up');
        this.musicVolDown = document.getElementById('music-vol-down');
        this.musicVolLabel = document.getElementById('mp-vol-label');
        this.musicLocalMuteBtn = document.getElementById('music-local-mute-btn');
        this.musicStopBtn = document.getElementById('music-stop-btn');
        this.musicPlayPauseBtn = document.getElementById('music-play-pause-btn');

        // Müzik durumu
        this.isSharingMusic = false;
        this.isMusicLocallyMuted = false;
        this.pendingMusicSeek = null;
        this.musicStatusInterval = null;
        this.ytPlayer = null;
        this.ytPlayerReady = false;
        this.ytApiReady = false;
        this.ytPendingVideoId = null;
        this.ytPendingThumb = null;
        this.currentVideoId = null;
        this.currentTrackName = '';
        this.currentThumbUrl = '';
        this.youtubeSearchEnabled = false;
        this.listenerPlayers = new Map();

        // === NICK DEĞİŞTİRME + MOBİL MENÜ + MENU MODAL ===
        this.nickChangeModal = document.getElementById('nick-change-modal');
        this.nickChangeInput = document.getElementById('nick-change-input');
        this.submitNickChangeBtn = document.getElementById('submit-nick-change-btn');
        this.cancelNickChangeBtn = document.getElementById('cancel-nick-change-btn');
        this.userInfoClickable = document.getElementById('user-info-clickable');
        this.mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        this.mobileOverlay = document.getElementById('mobile-overlay');
        this.channelSidebar = document.querySelector('.channel-sidebar');
        this.membersSidebar = document.querySelector('.members-sidebar');
        // Menu modal
        this.menuModal = document.getElementById('menu-modal');
        this.menuOpenBtn = document.getElementById('menu-open-btn');
        this.menuCloseBtn = document.getElementById('menu-close-btn');

        // Voice changer state
        this.vcPresetsContainer = document.getElementById('vc-presets');
        this.vcPitchSlider = document.getElementById('vc-pitch-slider');
        this.vcPitchValue = document.getElementById('vc-pitch-value');
        this.vcMonitorBtn = document.getElementById('vc-monitor-btn');
        this.vcStatus = document.getElementById('vc-status');
        this.currentVoicePreset = 'normal';
        this.currentPitch = 0;
        this.vcAudioContext = null;       // AudioContext
        this.vcSourceNode = null;         // mic → AudioContext source
        this.vcScriptProcessor = null;   // ScriptProcessorNode (real-time processing)
        this.vcDestNode = null;           // MediaStreamAudioDestinationNode → WebRTC
        this.vcSoundTouch = null;         // SoundTouch instance
        this.vcFilter = null;            // SimpleFilter
        this.vcBufferSource = null;       // WebAudioBufferSource (soundtouch input adapter)
        this.vcMonitorGain = null;       // monitor modu için gain node (lokal playback)
        this.vcMonitorActive = false;
        this.vcProcessedStream = null;   // WebRTC'ye gönderilen stream
        this.vcActive = false;           // voice changer aktif mi?
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

        // === VOICE CHANGER (Admin only) ===
        // Preset butonları
        if (this.vcPresetsContainer) {
            const presets = this.vcPresetsContainer.querySelectorAll('.vc-preset-btn');
            presets.forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = btn.dataset.preset;
                    this.applyVoicePreset(preset);
                    presets.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
        // Pitch slider
        if (this.vcPitchSlider) {
            this.vcPitchSlider.addEventListener('input', (e) => {
                const pitch = parseInt(e.target.value, 10);
                this.currentPitch = pitch;
                if (this.vcPitchValue) this.vcPitchValue.textContent = (pitch > 0 ? '+' : '') + pitch;
                this.applyPitchToSoundTouch(pitch);
                // Preset seçimini kaldır (custom pitch)
                if (this.vcPresetsContainer) {
                    this.vcPresetsContainer.querySelectorAll('.vc-preset-btn').forEach(b => b.classList.remove('active'));
                    if (pitch === 0) {
                        // Normal preset'i işaretle
                        const normalBtn = this.vcPresetsContainer.querySelector('[data-preset="normal"]');
                        if (normalBtn) normalBtn.classList.add('active');
                        this.currentVoicePreset = 'normal';
                    } else {
                        this.currentVoicePreset = 'custom';
                    }
                }
            });
        }
        // Monitor butonu (lokal dinleme)
        if (this.vcMonitorBtn) {
            this.vcMonitorBtn.addEventListener('click', () => this.toggleVoiceMonitor());
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

        // === YOUTUBE MÜZİK PLAYER OLAYLARI ===
        if (this.musicBtn) {
            this.musicBtn.addEventListener('click', () => {
                if (this.musicPanel) {
                    this.musicPanel.classList.toggle('hidden');
                    // İlk açılışta YouTube API ready mi kontrol et
                    if (!this.musicPanel.classList.contains('hidden')) {
                        this.ensureYtPlayerReady();
                        // Arama kutusuna otomatik fokus
                        if (this.ytSearchInput) setTimeout(() => this.ytSearchInput.focus(), 100);
                    }
                }
            });
        }
        // Panel kapatma butonu
        if (this.musicCloseBtn) {
            this.musicCloseBtn.addEventListener('click', () => {
                if (this.musicPanel) this.musicPanel.classList.add('hidden');
            });
        }
        // YouTube arama butonu
        if (this.ytSearchBtn) {
            this.ytSearchBtn.addEventListener('click', () => this.youtubeSearch());
        }
        if (this.ytSearchInput) {
            this.ytSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.youtubeSearch();
            });
        }
        // URL yapıştırma (link toggle butonu ile göster/gizle)
        if (this.ytLinkToggleBtn) {
            this.ytLinkToggleBtn.addEventListener('click', () => {
                if (this.ytLinkRow) this.ytLinkRow.classList.toggle('hidden');
            });
        }
        if (this.musicLoadUrlBtn) {
            this.musicLoadUrlBtn.addEventListener('click', () => {
                const url = (this.musicUrlInput.value || '').trim();
                if (url) {
                    const videoId = this.extractYouTubeId(url);
                    if (videoId) {
                        // URL'den video yükle — thumbnail bilmeden, sadece videoId ile
                        // getYouTubeVideoInfo ekleyerek thumbnail alabiliriz ama şimdilik basit tutalım
                        this.loadYouTubeVideo(videoId, url);
                    } else {
                        this.showToast('⚠️', 'Geçerli bir YouTube linki değil.');
                    }
                }
            });
            this.musicUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.musicLoadUrlBtn.click();
            });
        }
        if (this.musicStopBtn) {
            this.musicStopBtn.addEventListener('click', () => this.stopMusicShare());
        }
        // Play/Pause toggle butonu (autoplay engellenirse manuel başlatma için)
        if (this.musicPlayPauseBtn) {
            this.musicPlayPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }
        // Progress bar — DJ'nin video içinde ileri/geri sarma
        if (this.musicProgress) {
            this.musicProgress.addEventListener('input', (e) => {
                this.pendingMusicSeek = parseFloat(e.target.value);
                if (this.ytPlayer && this.ytPlayerReady) {
                    this.ytPlayer.seekTo(this.pendingMusicSeek, true);
                    this.pendingMusicSeek = null;
                }
            });
        }
        // Volume slider
        if (this.musicLocalVolume) {
            this.musicLocalVolume.addEventListener('input', (e) => {
                const vol = parseInt(e.target.value, 10);
                this.updateVolumeUI(vol);
                if (this.ytPlayer && this.ytPlayerReady) {
                    if (this.isMusicLocallyMuted) {
                        // Mute açıksa unmute yap ve yeni ses seviyesini uygula
                        this.isMusicLocallyMuted = false;
                        if (this.musicLocalMuteBtn) this.musicLocalMuteBtn.textContent = '🔊';
                    }
                    this.ytPlayer.unMute();
                    this.ytPlayer.setVolume(vol);
                }
            });
        }
        // Volume + / - butonları
        if (this.musicVolUp) {
            this.musicVolUp.addEventListener('click', () => {
                let vol = parseInt(this.musicLocalVolume.value, 10) + 10;
                if (vol > 100) vol = 100;
                this.musicLocalVolume.value = vol;
                this.musicLocalVolume.dispatchEvent(new Event('input'));
            });
        }
        if (this.musicVolDown) {
            this.musicVolDown.addEventListener('click', () => {
                let vol = parseInt(this.musicLocalVolume.value, 10) - 10;
                if (vol < 0) vol = 0;
                this.musicLocalVolume.value = vol;
                this.musicLocalVolume.dispatchEvent(new Event('input'));
            });
        }
        // Mute toggle
        if (this.musicLocalMuteBtn) {
            this.musicLocalMuteBtn.addEventListener('click', () => {
                this.isMusicLocallyMuted = !this.isMusicLocallyMuted;
                if (this.ytPlayer && this.ytPlayerReady) {
                    if (this.isMusicLocallyMuted) {
                        this.ytPlayer.mute();
                    } else {
                        this.ytPlayer.unMute();
                        this.ytPlayer.setVolume(parseInt(this.musicLocalVolume.value, 10));
                    }
                }
                this.musicLocalMuteBtn.textContent = this.isMusicLocallyMuted ? '🔇' : '🔊';
            });
        }

        // === YOUTUBE IFRAME API HAZIR OLUNCA ===
        // Race condition: script önceden yüklenmiş olabilir, sonra yükleniyor olabilir
        if (window.YT && window.YT.Player) {
            // Script zaten yüklenmiş — direkt ready kabul et
            this.onYtApiReady();
        } else {
            // Callback tanımla, script yüklenince çağrılacak
            if (!window.onYouTubeIframeAPIReady) {
                window.onYouTubeIframeAPIReady = () => {
                    if (window.app && window.app.onYtApiReady) window.app.onYtApiReady();
                };
            }
        }

        // Sayfa açılır açılmaz /config çek — YouTube arama açık mı kapalı mı öğren
        fetch('/config').then(r => r.json()).then(c => {
            this.youtubeSearchEnabled = !!c.youtubeSearchEnabled;
            if (this.ytSearchStatus) {
                if (this.youtubeSearchEnabled) {
                    this.ytSearchStatus.textContent = '🔍 Arama hazır — şarkı adı yaz, Ara\'ya bas';
                    this.ytSearchStatus.style.color = 'var(--green)';
                    // Link toggle butonunu gizle çünkü arama çalışıyor
                    if (this.ytLinkToggleBtn) this.ytLinkToggleBtn.style.display = 'none';
                } else {
                    this.ytSearchStatus.textContent = '⚠️ Arama kapalı (YOUTUBE_API_KEY yok). Link yapıştırmak için 🔗 butona bas.';
                    this.ytSearchStatus.style.color = 'var(--yellow)';
                    // Link toggle butonunu göster
                    if (this.ytLinkToggleBtn) this.ytLinkToggleBtn.style.display = 'flex';
                }
            }
        }).catch(() => {});

        // === NICK DEĞİŞTİRME ===
        // Profile kartına tıkla → modal aç
        if (this.userInfoClickable) {
            this.userInfoClickable.addEventListener('click', () => {
                if (this.nickChangeModal && this.nickChangeInput) {
                    this.nickChangeInput.value = this.username || '';
                    this.nickChangeModal.classList.remove('hidden');
                    setTimeout(() => this.nickChangeInput.focus(), 100);
                }
            });
        }
        if (this.cancelNickChangeBtn) {
            this.cancelNickChangeBtn.addEventListener('click', () => {
                if (this.nickChangeModal) this.nickChangeModal.classList.add('hidden');
            });
        }
        if (this.submitNickChangeBtn) {
            this.submitNickChangeBtn.addEventListener('click', () => this.submitNickChange());
        }
        if (this.nickChangeInput) {
            this.nickChangeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.submitNickChange();
            });
        }

        // === MOBİL MENÜ TOGGLE ===
        if (this.mobileMenuToggle) {
            this.mobileMenuToggle.addEventListener('click', () => this.toggleMobileSidebar());
        }
        if (this.mobileOverlay) {
            this.mobileOverlay.addEventListener('click', () => this.toggleMobileSidebar(false));
        }

        // === MENU MODAL ===
        if (this.menuOpenBtn) {
            this.menuOpenBtn.addEventListener('click', () => {
                if (this.menuModal) this.menuModal.classList.remove('hidden');
            });
        }
        // VRC buttons (voice room card controls)
        const vrcMicBtn = document.getElementById('vrc-mic-btn');
        const vrcDeafenBtn = document.getElementById('vrc-deafen-btn');
        const vrcScreenBtn = document.getElementById('vrc-screen-btn');
        const vrcMusicBtn = document.getElementById('vrc-music-btn');
        const vrcMenuBtn = document.getElementById('vrc-menu-btn');
        if (vrcMicBtn) vrcMicBtn.addEventListener('click', () => this.toggleMute());
        if (vrcDeafenBtn) vrcDeafenBtn.addEventListener('click', () => this.toggleDeafen());
        if (vrcScreenBtn) vrcScreenBtn.addEventListener('click', () => this.toggleScreenShare());
        if (vrcMusicBtn) vrcMusicBtn.addEventListener('click', () => {
            if (this.musicPanel) this.musicPanel.classList.toggle('hidden');
        });
        if (vrcMenuBtn) vrcMenuBtn.addEventListener('click', () => {
            if (this.menuModal) this.menuModal.classList.remove('hidden');
        });

        // === MOBİL TAB BAR ===
        this.mobileTabBar = document.getElementById('mobile-tab-bar');
        if (this.mobileTabBar) {
            this.mobileTabBar.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchMobileTab(btn.dataset.tab));
            });
        }
        // Members back button — geri dön
        const membersBackBtn = document.getElementById('members-back-btn');
        if (membersBackBtn) {
            membersBackBtn.addEventListener('click', () => this.switchMobileTab('channels'));
        }

        if (this.menuCloseBtn) {
            this.menuCloseBtn.addEventListener('click', () => {
                if (this.menuModal) this.menuModal.classList.add('hidden');
            });
        }
        // Menu modal dışına tıklayınca kapat
        if (this.menuModal) {
            this.menuModal.addEventListener('click', (e) => {
                if (e.target === this.menuModal) this.menuModal.classList.add('hidden');
            });
        }

        // === SAYFA YENİLEME OTOMATİK GİRİŞ ===
        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            setTimeout(() => {
                if (this.usernameInput) this.usernameInput.value = savedUsername;
                this.login();
            }, 200);
        }
    }

    /** Volume UI güncelle — label ve ikon */
    updateVolumeUI(vol) {
        if (this.musicVolLabel) this.musicVolLabel.textContent = String(vol);
        if (this.musicLocalMuteBtn) {
            // Mute ikonu sadece sessizse değişsin
            if (!this.isMusicLocallyMuted) {
                this.musicLocalMuteBtn.textContent = vol === 0 ? '🔇' : '🔊';
            }
        }
    }

    // =========================================
    // Ses Efektleri
    // =========================================
    playSound(type) {
        if (!this.notificationAudioContext) return;
        try {
            const ctx = this.notificationAudioContext;
            // Eğer askıdaysa resume ET (async, ama en azından dene)
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    this._playSoundInternal(type);
                }).catch(() => {});
            } else {
                this._playSoundInternal(type);
            }
        } catch (e) {
            console.error('Ses efekti çalınamadı:', e);
        }
    }

    _playSoundInternal(type) {
        const ctx = this.notificationAudioContext;
        if (!ctx || ctx.state !== 'running') return;
        try {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'join') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            } else if (type === 'leave') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(554, ctx.currentTime);
                osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
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

        // === GLOBAL USER INTERACTION → AudioContext RESUME ===
        // Tarayıcı AudioContext'i uzun boşlukta veya tab arka planda askıya alabilir.
        // Bu durumda voice changer zinciri çalışmaz, ses gitmez/dinlenmez.
        // Herhangi bir kullanıcı etkileşiminde AudioContext'i otomatik resume et.
        const resumeAudioOnInteraction = () => {
            // 1. Voice changer AudioContext
            if (this.vcAudioContext && this.vcAudioContext.state === 'suspended') {
                this.vcAudioContext.resume().catch(() => {});
            }
            // 2. Notification AudioContext (bildirim sesleri)
            if (this.notificationAudioContext && this.notificationAudioContext.state === 'suspended') {
                this.notificationAudioContext.resume().catch(() => {});
            }
            // 3. VAD AudioContext (konuşma algılama)
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            // 4. Durmuş peer audio elementlerini tekrar çal
            this.peers.forEach((peer) => {
                if (peer.audioEl && peer.remoteStream) {
                    if (peer.audioEl.paused) {
                        this.forcePlayAudio(peer.audioEl);
                    }
                }
            });
        };
        // Tüm etkileşim tipleri için dinleyici ekle
        document.addEventListener('click', resumeAudioOnInteraction);
        document.addEventListener('keydown', resumeAudioOnInteraction);
        document.addEventListener('touchstart', resumeAudioOnInteraction);
        // Tab tekrar görünür olduğunda da resume
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                resumeAudioOnInteraction();
            }
        });
        // Periyodik kontrol — her 5 saniyede bir (kullanıcı etkileşimi olmadan da çalışabilir)
        setInterval(() => {
            if (this.vcAudioContext && this.vcAudioContext.state === 'suspended' && !document.hidden) {
                // Sadece tab görünür durumdaysa deneyelim (arka planda çalışmaz zaten)
                this.vcAudioContext.resume().catch(() => {});
            }
        }, 5000);

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
                // === AUTO-JOIN: Son odaya veya varsayılan odaya otomatik katıl ===
                const roomToJoin = this.reconnectRoom || this.savedRoom || 'genel';
                if (roomToJoin) {
                    this.reconnectRoom = null;
                    this.currentRoom = null;
                    // Kısa gecikme — UI'nin hazır olması için
                    setTimeout(() => this.joinRoom(roomToJoin), 300);
                    this.showToast('✅', `Hoş geldin, ${this.username}!`);
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

            // === NICK DEĞİŞTİRME ===
            case 'nick-changed':
                this.onNickChanged(message);
                break;

            case 'nick-change-error':
                this.showToast('❌', message.message || 'Nick değiştirilemedi.');
                break;

            // === VOICE CHANGER ===
            // Karşı taraf (admin) sesini değiştirdi — UI'da indicator göster
            case 'voice-effect-change':
                this.onVoiceEffectChange(message);
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

        // === MOBİL: Kanal seçince sidebar otomatik kapanır ===
        if (document.body.classList.contains('mobile-sidebar-open')) {
            this.toggleMobileSidebar(false);
        }

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
                const rawMicStream = await navigator.mediaDevices.getUserMedia({
                    audio: this.audioConstraints,
                    video: false
                });

                // === VOICE CHANGER HAZIRLIĞI ===
                // Mikrofonu AudioContext + SoundTouch zincirinden geçir
                // Bu, admin sesini değiştirdiğinde anında karşı tarafa gitmesini sağlar
                this.localStream = await this.initVoiceChangerChain(rawMicStream);
                this.rawMicStream = rawMicStream;
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
        if (this.welcomeView) this.welcomeView.classList.add('hidden');
        if (this.voiceView) this.voiceView.classList.remove('hidden');
        if (this.disconnectBtn) this.disconnectBtn.style.display = 'flex';
        if (this.userStatusText) this.userStatusText.textContent = 'Sesli kanalda';

        // === AUDIO SYNC FIX ===
        // Oda yeniden girince AudioContext'i resume et
        // (leaveRoom'dan sonra uzun süre geçtiyse suspended olmuş olabilir)
        this.resumeVcAudioContext();

        // Odadaki mevcut kullanıcılarla bağlantı kur
        message.existingUsers.forEach(user => {
            this.createPeerConnection(user.id, true);
        });

        // === AUDIO SYNC FIX ===
        // Peer'lar oluştuktan kısa süre sonra audio elementlerini force-play et
        // (yeni peer'ların ontrack'i 1-2 sn içinde fire olacak, audio orada çalacak)
        setTimeout(() => {
            this.peers.forEach((peer) => {
                if (peer.audioEl && peer.remoteStream && peer.audioEl.paused) {
                    this.forcePlayAudio(peer.audioEl);
                }
            });
        }, 2000);

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

        // === DİNLEYİCİ PLAYER'LARI DA TEMİZLE ===
        // Tüm listener YouTube player'larını kaldır
        this.listenerPlayers.forEach((data, djId) => {
            try { if (data.player && data.player.destroy) data.player.destroy(); } catch (_) {}
        });
        this.listenerPlayers.clear();

        // Tüm peer bağlantılarını kapat
        this.peers.forEach((peer, peerId) => {
            try { peer.pc.close(); } catch (_) {}
            // Ses elementini temizle
            if (peer.audioEl) {
                try { peer.audioEl.srcObject = null; } catch (_) {}
                try { peer.audioEl.pause(); } catch (_) {}
                try { peer.audioEl.remove(); } catch (_) {}
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
        if (this.voiceView) this.voiceView.classList.add('hidden');
        if (this.welcomeView) this.welcomeView.classList.remove('hidden');
        if (this.disconnectBtn) this.disconnectBtn.style.display = 'none';
        if (this.userStatusText) this.userStatusText.textContent = 'Çevrimiçi';
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
        // === AUDIO SYNC FIX ===
        // Yeni kullanıcı katıldığında AudioContext'i resume et
        // (uzun süre etkileşim olmazsa tarayıcı suspended yapıyor → ses gitmiyor)
        this.resumeVcAudioContext();
        // Bu cihazda durmuş peer audio elementlerini tekrar çal
        this.peers.forEach((peer) => {
            if (peer.audioEl && peer.remoteStream && peer.audioEl.paused) {
                this.forcePlayAudio(peer.audioEl);
            }
        });
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
            this.peers.delete(message.userId);
        }
        // === YOUTUBE MÜZİK === - Bu DJ için listener player'ı da temizle
        // (Eğer bu kullanıcı DJ ise ve biz onu dinliyorduysak)
        const ldata = this.listenerPlayers.get(message.userId);
        if (ldata) {
            try { if (ldata.player && ldata.player.destroy) ldata.player.destroy(); } catch (_) {}
            if (ldata.wrapper && ldata.wrapper.parentNode) ldata.wrapper.parentNode.removeChild(ldata.wrapper);
            this.listenerPlayers.delete(message.userId);
        }
        // UI'daki müzik kutusu kalmışsa onu da kaldır
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

        // === Event handler'ları ÖNCE set et (addTrack'tan önce) ===
        // Bu, race condition'u önler: addTrack → onnegotiationneeded queued olur,
        // explicit createOffer ile çakışıp m-line order hatası vermesini engeller

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

        // Renegotiation — signalingState'i await'ten SONRA da kontrol et (race condition önle)
        pc.onnegotiationneeded = async () => {
            try {
                if (pc.signalingState !== "stable") {
                    console.log(`[WRTC] onnegotiationneeded skipped (state: ${pc.signalingState})`);
                    return;
                }
                const offer = await pc.createOffer();
                // Await sırasında explicit createOffer çalışmış olabilir — tekrar kontrol
                if (pc.signalingState !== "stable") {
                    console.log(`[WRTC] onnegotiationneeded: state changed during await (${pc.signalingState}), skipping`);
                    return;
                }
                await pc.setLocalDescription(offer);
                this.ws.send(JSON.stringify({
                    type: 'offer',
                    targetId: peerId,
                    data: pc.localDescription
                }));
            } catch (err) {
                console.error('[WRTC] Renegotiation hatası:', err);
            }
        };

        // Uzak ses / ekran akışını al
        pc.ontrack = (event) => {
            const track = event.track;
            const stream = event.streams[0];

            if (track.kind === 'video') {
                this.showRemoteVideo(peerId, stream);
                track.onended = () => {
                    this.removeRemoteVideo(peerId);
                };
                return;
            }

            // AUDIO TRACK (voice)
            let peerData = this.peers.get(peerId);
            if (!peerData) {
                peerData = { pc, audioEl: null, remoteStream: null };
                this.peers.set(peerId, peerData);
            }

            let audioEl = peerData.audioEl;
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `audio-${peerId}`;
                audioEl.autoplay = true;
                audioEl.playsInline = true;
                const volValue = this.peerVolumes.has(peerId) ? this.peerVolumes.get(peerId) : 1.0;
                audioEl.volume = volValue;
                document.body.appendChild(audioEl);
                peerData.audioEl = audioEl;
            }
            audioEl.srcObject = stream;
            this.forcePlayAudio(audioEl);
            peerData.remoteStream = stream;
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WRTC] Peer ${peerId} bağlantı durumu: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                const pd = this.peers.get(peerId);
                if (pd && pd.audioEl) { try { pd.audioEl.pause(); } catch (_) {} }
            } else if (pc.connectionState === 'connected') {
                const pd = this.peers.get(peerId);
                if (pd && pd.audioEl) this.forcePlayAudio(pd.audioEl);
            }
        };

        // Peer datasını başlat
        if (!this.peers.has(peerId)) {
            this.peers.set(peerId, { pc, audioEl: null, remoteStream: null });
        }

        // === ŞİMDİ tracks ekle (handler'lar set, onnegotiationneeded güvenli) ===
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        if (this.isScreenSharing && this.screenStream) {
            this.screenStream.getTracks().forEach(track => {
                pc.addTrack(track, this.screenStream);
            });
        }

        // Explicit createOffer (initiator ise) — race condition güvenli
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
            // Race condition önle: eğer onnegotiationneeded zaten çalıştıysa (state have-local-offer), atla
            if (pc.signalingState !== 'stable') {
                console.log(`[WRTC] createOffer skipped (state: ${pc.signalingState})`);
                return;
            }
            const offer = await pc.createOffer();
            // Await sırasında onnegotiationneeded fire etmiş olabilir — tekrar kontrol
            if (pc.signalingState !== 'stable') {
                console.log(`[WRTC] createOffer: state changed during await (${pc.signalingState}), skipping setLocalDescription`);
                return;
            }
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
            console.error('[WRTC] Offer işleme hatası:', err);
        }
    }

    async handleAnswer(message) {
        const peer = this.peers.get(message.senderId);
        if (peer) {
            try {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(message.data));
            } catch (err) {
                console.error('[WRTC] Answer işleme hatası:', err);
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
        if (this.micBtn) {
            this.micBtn.classList.toggle('muted', this.isMuted);
            this.micBtn.querySelector('.icon-mic-on')?.classList.toggle('hidden', this.isMuted);
            this.micBtn.querySelector('.icon-mic-off')?.classList.toggle('hidden', !this.isMuted);
        }
        this.updateVrcButtonState();

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
        if (this.deafenBtn) {
            this.deafenBtn.classList.toggle('muted', this.isDeafened);
            this.deafenBtn.querySelector('.icon-headphone-on')?.classList.toggle('hidden', this.isDeafened);
            this.deafenBtn.querySelector('.icon-headphone-off')?.classList.toggle('hidden', !this.isDeafened);
        }
        this.updateVrcButtonState();

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
    // YOUTUBE MÜZİK PLAYER — YARDIMCI FONKSİYONLAR
    // =========================================
    /** YouTube URL'inden video ID'sini ayıkla */
    extractYouTubeId(url) {
        if (!url) return null;
        // youtu.be/VIDEOID
        let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
        if (m) return m[1];
        // youtube.com/watch?v=VIDEOID
        m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
        if (m) return m[1];
        // youtube.com/embed/VIDEOID
        m = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
        if (m) return m[1];
        // sadece ID (11 karakter)
        if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
        return null;
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // =========================================
    // YOUTUBE IFRAME API
    // =========================================
    /** youtube/iframe_api script'i yüklendiğinde çağrılır */
    onYtApiReady() {
        console.log('[MUSIC] YouTube IFrame API hazır');
        this.ytApiReady = true;
        // Eğer bekleyen video varsa, player'ı oluştur ve videoyu yükle
        if (this.ytPendingVideoId && !this.ytPlayer) {
            console.log('[MUSIC] Bekleyen video var, player oluşturuluyor:', this.ytPendingVideoId);
            this.ensureYtPlayerReady();
        }
        // Listener player'lar için de bekleyen DJ varsa
        this.listenerPlayers.forEach((data, djId) => {
            if (data.pendingVideoId && !data.player) {
                this.createListenerPlayer(djId, data.pendingVideoId);
            }
        });
    }

    /** Loading overlay göster/gizle */
    showMusicLoading(show) {
        if (this.mpLoadingOverlay) {
            if (show) this.mpLoadingOverlay.classList.remove('hidden');
            else this.mpLoadingOverlay.classList.add('hidden');
        }
    }

    /** DJ player'ı oluştur (lazy — butona basınca veya video yüklenince) */
    ensureYtPlayerReady() {
        if (this.ytPlayer) {
            console.log('[MUSIC] Player zaten var, atlanıyor');
            return;
        }
        if (!this.ytApiReady) {
            console.log('[MUSIC] YT API henüz hazır değil, player oluşturulamadı');
            return;
        }
        if (!this.ytPlayerDjContainer) {
            console.error('[MUSIC] yt-player-dj container bulunamadı!');
            return;
        }
        console.log('[MUSIC] Player oluşturuluyor...');
        this.showMusicLoading(true);
        try {
            // eslint-disable-next-line no-undef
            this.ytPlayer = new YT.Player(this.ytPlayerDjContainer, {
                height: '180',
                width: '320',
                videoId: '',
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: () => {
                        console.log('[MUSIC] Player READY');
                        this.ytPlayerReady = true;
                        this.showMusicLoading(false);
                        // Player hazır olur olmaz bekleyen video varsa yükle + çal
                        if (this.ytPendingVideoId) {
                            const vid = this.ytPendingVideoId;
                            this.ytPendingVideoId = null;
                            this.ytPendingThumb = null;
                            console.log('[MUSIC] Bekleyen video yükleniyor:', vid);
                            try {
                                this.ytPlayer.loadVideoById(vid);
                                // playVideo'yu 500ms sonra çağır — bazı tarayıcılarda autoplay engellenir
                                setTimeout(() => {
                                    try {
                                        console.log('[MUSIC] playVideo çağrılı');
                                        this.ytPlayer.playVideo();
                                    } catch (_) {}
                                }, 500);
                            } catch (e) { 
                                console.error('[MUSIC] loadVideoById hatası:', e);
                                this.showToast('❌', 'Video yüklenemedi.');
                            }
                        }
                    },
                    onStateChange: (e) => this.onDjPlayerStateChange(e),
                    onError: (e) => {
                        console.error('[MUSIC] YT Player hata:', e);
                        this.showMusicLoading(false);
                        let msg = 'Video yüklenemedi.';
                        if (e.data === 2) msg = 'Video ID geçersiz.';
                        else if (e.data === 5) msg = 'HTML5 player hatası.';
                        else if (e.data === 100) msg = 'Video bulunamadı veya özel.';
                        else if (e.data === 101 || e.data === 150) msg = 'Sahibi gömülü oynatmaya izin vermiyor.';
                        this.showToast('❌', msg);
                    }
                }
            });
            console.log('[MUSIC] Player instance oluşturuldu');
        } catch (e) {
            console.error('[MUSIC] YT player oluşturulamadı:', e);
            this.showMusicLoading(false);
        }
    }

    /** DJ player durumu değişti — oynatıyor/durdu/bitti */
    onDjPlayerStateChange(event) {
        // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
        console.log('[MUSIC] State change:', event.data);
        if (event.data === 1) {
            // Çalmaya başladı → paylaşımı başlat
            this.showMusicLoading(false);
            this.setPlayPauseBtn(true);
            if (!this.isSharingMusic) {
                this.startMusicShare();
            } else {
                this.sendMusicStatus(true, this.ytPlayer.getCurrentTime(), this.ytPlayer.getDuration());
            }
        } else if (event.data === 2) {
            this.setPlayPauseBtn(false);
            if (this.isSharingMusic && this.ytPlayer) {
                this.sendMusicStatus(false, this.ytPlayer.getCurrentTime(), this.ytPlayer.getDuration());
            }
        } else if (event.data === 0) {
            this.setPlayPauseBtn(false);
            this.stopMusicShare();
        } else if (event.data === 3) {
            // Buffering — loading göster
            this.showMusicLoading(true);
        }
        this.updateDjProgressUI();
    }

    /** Play/Pause butonu ikonunu güncelle */
    setPlayPauseBtn(isPlaying) {
        if (!this.musicPlayPauseBtn) return;
        this.musicPlayPauseBtn.textContent = isPlaying ? '⏸' : '▶';
        this.musicPlayPauseBtn.title = isPlaying ? 'Duraklat' : 'Çal';
    }

    /** Manuel play/pause toggle — kullanıcı butona basınca */
    togglePlayPause() {
        if (!this.currentVideoId) {
            this.showToast('⚠️', 'Önce bir şarkı seç.');
            return;
        }
        console.log('[MUSIC] togglePlayPause çağrıldı. ytPlayer:', !!this.ytPlayer, 'ytPlayerReady:', this.ytPlayerReady);
        if (!this.ytPlayer) {
            // Player yok — oluştur
            this.ensureYtPlayerReady();
            if (!this.ytPlayer) {
                // API hazır değil, videoyu pending'e koy
                this.ytPendingVideoId = this.currentVideoId;
                this.showToast('⏳', 'Player yükleniyor... API henüz hazır değil.');
            } else if (!this.ytPlayerReady) {
                // Player var ama ready değil — video beklesin
                this.ytPendingVideoId = this.currentVideoId;
                this.showToast('⏳', 'Player hazır oluyor...');
            }
            return;
        }
        if (!this.ytPlayerReady) {
            // Player var ama ready değil — bekleyen videoyu güncelle
            this.ytPendingVideoId = this.currentVideoId;
            this.showToast('⏳', 'Player hazır oluyor, lütfen bekleyin...');
            return;
        }
        // Player hazır — state'i kontrol et
        const state = this.ytPlayer.getPlayerState();
        console.log('[MUSIC] Player state:', state);
        if (state === 1) {
            this.ytPlayer.pauseVideo();
        } else {
            this.ytPlayer.playVideo();
        }
    }

    updateDjProgressUI() {
        if (!this.ytPlayer || !this.ytPlayerReady) return;
        try {
            const cur = this.ytPlayer.getCurrentTime() || 0;
            const dur = this.ytPlayer.getDuration() || 0;
            if (this.musicCurrentTime) this.musicCurrentTime.textContent = this.formatTime(cur);
            if (this.musicDuration) this.musicDuration.textContent = this.formatTime(dur);
            if (this.musicProgress && !this.pendingMusicSeek) {
                this.musicProgress.max = Math.floor(dur);
                this.musicProgress.value = Math.floor(cur);
            }
        } catch (_) {}
    }

    // =========================================
    // YOUTUBE ARAMA
    // =========================================
    async youtubeSearch() {
        const q = (this.ytSearchInput.value || '').trim();
        if (!q) return;
        if (!this.youtubeSearchEnabled) {
            this.showToast('⚠️', 'Arama kapalı. Render Dashboard\'tan YOUTUBE_API_KEY ekleyin veya link yapıştırın.');
            return;
        }
        if (this.ytSearchStatus) {
            this.ytSearchStatus.textContent = '🔍 Aranıyor...';
            this.ytSearchStatus.style.color = 'var(--text-secondary)';
        }
        try {
            const res = await fetch('/youtube-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q })
            });
            const data = await res.json();
            if (!res.ok) {
                if (this.ytSearchStatus) {
                    this.ytSearchStatus.textContent = '❌ ' + (data.error || 'Arama hatası');
                    this.ytSearchStatus.style.color = 'var(--red)';
                }
                return;
            }
            this.renderYoutubeResults(data.items || []);
            if (this.ytSearchStatus) {
                this.ytSearchStatus.textContent = `${(data.items || []).length} sonuç`;
                this.ytSearchStatus.style.color = 'var(--text-secondary)';
            }
        } catch (e) {
            if (this.ytSearchStatus) {
                this.ytSearchStatus.textContent = '❌ Ağ hatası';
                this.ytSearchStatus.style.color = 'var(--red)';
            }
        }
    }

    renderYoutubeResults(items) {
        if (!this.ytSearchResults) return;
        this.ytSearchResults.innerHTML = '';
        if (!items.length) {
            this.ytSearchResults.innerHTML = '<div class="yt-no-results">Sonuç yok.</div>';
            return;
        }
        items.forEach(item => {
            if (!item.videoId) return;
            const el = document.createElement('div');
            el.className = 'yt-result-item';
            el.innerHTML = `
                ${item.thumbnail ? `<img src="${this.escapeHtml(item.thumbnail)}" alt="" class="yt-thumb">` : ''}
                <div class="yt-info">
                    <div class="yt-title">${this.escapeHtml(item.title || 'Başlıksız')}</div>
                    <div class="yt-channel">${this.escapeHtml(item.channelTitle || '')}</div>
                </div>
            `;
            el.addEventListener('click', () => {
                // === TIKLAYINCA ANINDA ÇAL ===
                // videoId + title + thumbnail bilgisini birlikte gönder
                this.loadYouTubeVideo(item.videoId, item.title, item.thumbnail);
                // Seçili sonucu işaretle
                this.ytSearchResults.querySelectorAll('.yt-result-item').forEach(x => x.classList.remove('selected'));
                el.classList.add('selected');
            });
            this.ytSearchResults.appendChild(el);
        });
    }

    /** Bir YouTube videosu yükle + ANINDA ÇAL (DJ tarafı)
     *  Tıklanan sonuç ya da yapıştırılan link ile çağrılır. */
    loadYouTubeVideo(videoId, title, thumbnail) {
        if (!videoId) return;
        this.currentVideoId = videoId;
        this.currentTrackName = title || `YouTube: ${videoId}`;
        // Thumbnail: parametre olarak verilmişse onu kullan, yoksa YouTube'un standart URL'i
        this.currentThumbUrl = thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

        // "Şu an çalıyor" alanını güncelle ve göster
        this.updateNowPlayingUI();
        if (this.mpNowPlaying) this.mpNowPlaying.classList.remove('hidden');
        this.showMusicLoading(true);

        // Önce eski paylaşımı durdur (yeni video seçildi) — sessizce
        if (this.isSharingMusic) {
            this._stopMusicShareInternal();
        }

        // Player'ı hazırla (yoksa oluştur)
        this.ensureYtPlayerReady();
        console.log('[MUSIC] loadYouTubeVideo — ytPlayer:', !!this.ytPlayer, 'ytPlayerReady:', this.ytPlayerReady);

        // === KRİTİK DÜZELTME ===
        // ytPlayerReady'yi kontrol et (ytPlayer değil) — çünkü player var ama henüz hazır olmayabilir
        if (this.ytPlayerReady && this.ytPlayer) {
            // Player hazır — loadVideoById + playVideo (autoplay için güvenlik)
            try {
                this.ytPlayer.loadVideoById(videoId);
                // playVideo'yu 500ms sonra çağır — bazı tarayıcılarda autoplay engellenir
                setTimeout(() => {
                    try { this.ytPlayer.playVideo(); } catch (_) {}
                }, 500);
            } catch (e) {
                console.error('[MUSIC] loadVideoById hatası:', e);
                this.showToast('❌', 'Video yüklenemedi.');
                this.showMusicLoading(false);
            }
        } else {
            // Player hazır DEĞİL — bekleyen video olarak sakla
            // onReady'de otomatik yüklenecek + çalacak
            this.ytPendingVideoId = videoId;
            this.ytPendingThumb = this.currentThumbUrl;
            console.log('[MUSIC] Video pending listesine eklendi');
        }
        this.showToast('🎵', 'Video yükleniyor...');
    }

    /** "Şu an çalıyor" UI'ını güncelle */
    updateNowPlayingUI() {
        if (this.mpNpTitle) this.mpNpTitle.textContent = this.currentTrackName || 'Müzik seçilmedi';
        if (this.mpNpThumb && this.currentThumbUrl) this.mpNpThumb.src = this.currentThumbUrl;
    }

    // =========================================
    // MÜZİK PAYLAŞIMI — DJ TARAFI
    // =========================================
    async toggleMusicPlay() {
        // togglePlayPause'a yönlendir (aynı fonksiyon — sadece isim uyumluluğu için)
        this.togglePlayPause();
    }

    /** DJ müziği çalmaya başladı → odadakilere "music-start" + videoId gönder */
    startMusicShare() {
        if (!this.currentVideoId) return;
        if (!this.currentRoom) {
            this.showToast('⚠️', 'Önce bir sesli odaya katıl.');
            return;
        }
        this.isSharingMusic = true;
        this.setPlayPauseBtn(true);

        // Server'a music-start gönder (server odadakilere yayar)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'music-start',
                trackName: this.currentTrackName,
                youtubeVideoId: this.currentVideoId
            }));
        }

        // Periyodik status gönder (süre ilerlemesi)
        if (this.musicStatusInterval) clearInterval(this.musicStatusInterval);
        this.musicStatusInterval = setInterval(() => {
            if (this.isSharingMusic && this.ytPlayer && this.ytPlayerReady) {
                const state = this.ytPlayer.getPlayerState();
                this.sendMusicStatus(state === 1, this.ytPlayer.getCurrentTime(), this.ytPlayer.getDuration());
                this.updateDjProgressUI();
            }
        }, 1000);

        this.showToast('🎵', 'Müzik paylaşıma başladı! Odadakiler duyuyor.');
    }

    /** İçsel durdurma — UI feedback olmadan (loadYouTubeVideo içinden çağrılır) */
    _stopMusicShareInternal() {
        if (this.ytPlayer && this.ytPlayerReady) {
            try { this.ytPlayer.pauseVideo(); } catch (_) {}
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isSharingMusic) {
            this.ws.send(JSON.stringify({ type: 'music-stop' }));
        }
        if (this.musicStatusInterval) {
            clearInterval(this.musicStatusInterval);
            this.musicStatusInterval = null;
        }
        this.isSharingMusic = false;
    }

    stopMusicShare() {
        // === HER ZAMAN GÖRÜNÜR AKSİYON YAP ===
        // Player'ı durdur (video çalmıyor olsa bile)
        if (this.ytPlayer && this.ytPlayerReady) {
            try { this.ytPlayer.pauseVideo(); } catch (_) {}
            try { this.ytPlayer.seekTo(0); } catch (_) {}
        }
        // Server'a music-stop gönder (dinleyiciler de dursun)
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isSharingMusic) {
            this.ws.send(JSON.stringify({ type: 'music-stop' }));
        }
        // Periyodik status timer'ı temizle
        if (this.musicStatusInterval) {
            clearInterval(this.musicStatusInterval);
            this.musicStatusInterval = null;
        }
        this.isSharingMusic = false;
        this.setPlayPauseBtn(false);

        // "Şu an çalıyor" alanını gizle
        if (this.mpNowPlaying) this.mpNowPlaying.classList.add('hidden');

        // Seçili sonuç işaretini kaldır
        if (this.ytSearchResults) {
            this.ytSearchResults.querySelectorAll('.yt-result-item').forEach(x => x.classList.remove('selected'));
        }

        // State'i temizle
        this.currentVideoId = null;
        this.currentTrackName = '';
        this.currentThumbUrl = '';
        this.ytPendingVideoId = null;

        this.showToast('⏹️', 'Müzik durduruldu ve paylaşımdan çıkıldı.');
    }

    sendMusicStatus(isPlaying, currentTime, duration) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.isSharingMusic) return;
        this.ws.send(JSON.stringify({
            type: 'music-status',
            isPlaying: !!isPlaying,
            currentTime: currentTime || 0,
            duration: duration || 0
        }));
    }

    // =========================================
    // MÜZİK PLAYER — DİNLEYİCİ TARAFI
    // =========================================
    /** Server'dan 'music-start' geldi: bir DJ video paylaşıyor */
    onMusicStartFromPeer(message) {
        const djId = message.djId;
        const djName = message.djName || 'DJ';
        const trackName = message.trackName || 'Müzik';
        const videoId = message.youtubeVideoId || '';
        if (!videoId) {
            // Eski tip mesaj (videoId yok) — yok say
            return;
        }
        // Listener player'ı oluştur veya mevcut videoyu güncelle
        this.renderListenerMusicBox(djId, djName, trackName, videoId);
        this.showToast('🎵', `${djName} müzik açtı: ${trackName}`);
    }

    onMusicStopFromPeer(message) {
        const djId = message.djId;
        // Listener player'ı kaldır
        const data = this.listenerPlayers.get(djId);
        if (data) {
            try { if (data.player && data.player.destroy) data.player.destroy(); } catch (_) {}
            if (data.wrapper && data.wrapper.parentNode) data.wrapper.parentNode.removeChild(data.wrapper);
            this.listenerPlayers.delete(djId);
        }
        // UI'da kutu kalmışsa onu da kaldır
        const controls = document.getElementById(`music-controls-${djId}`);
        if (controls) controls.remove();
        this.showToast('⏹️', 'Müzik durduruldu.');
    }

    onMusicStatusFromPeer(message) {
        const djId = message.djId;
        const data = this.listenerPlayers.get(djId);
        if (!data || !data.player || !data.ready) return;
        // Süre senkronu — 2 saniyeden fazla sapma varsa seek yap
        try {
            const localTime = data.player.getCurrentTime() || 0;
            const remoteTime = message.currentTime || 0;
            const drift = Math.abs(localTime - remoteTime);
            if (drift > 2) {
                data.player.seekTo(remoteTime, true);
            }
            // Play/pause durumunu senkronize et
            if (message.isPlaying) {
                const state = data.player.getPlayerState();
                if (state !== 1) data.player.playVideo();
            } else {
                const state = data.player.getPlayerState();
                if (state === 1) data.player.pauseVideo();
            }
            // UI güncelle
            const box = document.getElementById(`music-controls-${djId}`);
            if (box) {
                const playIcon = box.querySelector('.music-dj-play-icon');
                if (playIcon) playIcon.textContent = message.isPlaying ? '🎵' : '⏸';
                const timeEl = box.querySelector('.music-dj-time');
                if (timeEl) {
                    timeEl.textContent = `${this.formatTime(message.currentTime)} / ${this.formatTime(message.duration)}`;
                }
                const progress = box.querySelector('.music-dj-progress');
                if (progress) {
                    progress.max = Math.floor(message.duration || 0);
                    progress.value = Math.floor(message.currentTime || 0);
                }
            }
        } catch (_) {}
    }

    /** Dinleyici tarafında bir DJ için müzik kutusu oluştur */
    renderListenerMusicBox(djId, djName, trackName, videoId) {
        // Eğer zaten varsa, sadece videoyu güncelle
        let existing = this.listenerPlayers.get(djId);
        if (existing && existing.ready && existing.player) {
            try { existing.player.loadVideoById(videoId); } catch (_) {}
            // Track adı güncelle
            const box = document.getElementById(`music-controls-${djId}`);
            if (box) {
                const t = box.querySelector('.music-dj-track');
                if (t && trackName) t.textContent = trackName;
            }
            return;
        }

        const container = document.querySelector('.voice-body') || this.voiceParticipants.parentNode;
        const box = document.createElement('div');
        box.id = `music-controls-${djId}`;
        box.className = 'music-listener-controls';
        box.innerHTML = `
            <div class="music-dj-info">
                <span class="music-dj-play-icon">🎵</span>
                <div>
                    <div class="music-dj-title">🎧 ${this.escapeHtml(djName || 'DJ')} çalıyor</div>
                    <div class="music-dj-track">${this.escapeHtml(trackName || 'Müzik')}</div>
                </div>
                <button class="music-dj-hide-video-btn" title="Video klibini gizle (sadece müzik dinle)">🎬 Klibi Gizle</button>
            </div>
            <div class="yt-listener-player-wrapper">
                <div id="yt-listener-${djId}"></div>
            </div>
            <div class="music-dj-progress-row">
                <input type="range" class="music-dj-progress" min="0" max="100" value="0" disabled>
                <span class="music-dj-time">0:00 / 0:00</span>
            </div>
            <div class="music-dj-controls">
                <span class="volume-icon music-dj-vol-icon">🔊</span>
                <input type="range" class="music-dj-volume" min="0" max="100" step="1" value="70">
                <button class="music-dj-mute-btn" title="Müziği Sustur (sadece sizin için)">🔊</button>
            </div>
        `;
        container.appendChild(box);

        // Volume slider — bu DJ'nin YouTube player sesini etkiler
        const volSlider = box.querySelector('.music-dj-volume');
        const volIcon = box.querySelector('.music-dj-vol-icon');
        const muteBtn = box.querySelector('.music-dj-mute-btn');
        const hideVideoBtn = box.querySelector('.music-dj-hide-video-btn');
        const playerWrapper = box.querySelector('.yt-listener-player-wrapper');
        let userMuted = false;
        let videoHidden = false;

        const applyVolume = (vol) => {
            const data = this.listenerPlayers.get(djId);
            if (data && data.player && data.ready) {
                if (userMuted) {
                    data.player.mute();
                } else {
                    data.player.unMute();
                    data.player.setVolume(vol);
                }
            }
        };

        volSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            applyVolume(v);
            if (v === 0) volIcon.textContent = '🔇';
            else if (v < 50) volIcon.textContent = '🔉';
            else volIcon.textContent = '🔊';
        });

        muteBtn.addEventListener('click', () => {
            userMuted = !userMuted;
            applyVolume(parseInt(volSlider.value, 10));
            muteBtn.textContent = userMuted ? '🔇' : '🔊';
            muteBtn.title = userMuted ? 'Müzik susturuldu (sizin için)' : 'Müziği sustur';
        });

        hideVideoBtn.addEventListener('click', () => {
            videoHidden = !videoHidden;
            if (videoHidden) {
                playerWrapper.classList.add('video-hidden');
                hideVideoBtn.textContent = '🎬 Klibi Göster';
                hideVideoBtn.title = 'Video klibini tekrar göster';
            } else {
                playerWrapper.classList.remove('video-hidden');
                hideVideoBtn.textContent = '🎬 Klibi Gizle';
                hideVideoBtn.title = 'Video klibini gizle (sadece müzik dinle)';
            }
        });

        // Listener player datasını oluştur
        this.listenerPlayers.set(djId, {
            wrapper: box,
            player: null,
            ready: false,
            videoHidden: false,
            userMuted: false,
            pendingVideoId: videoId
        });

        // YouTube player'ı oluştur
        if (this.ytApiReady) {
            this.createListenerPlayer(djId, videoId);
        } else {
            // API hazır değil — onYtApiReady'de oluşturulacak
        }
    }

    /** Dinleyici tarafı için bir YouTube IFrame Player oluştur */
    createListenerPlayer(djId, videoId) {
        const data = this.listenerPlayers.get(djId);
        if (!data) return;
        const containerId = `yt-listener-${djId}`;
        const container = document.getElementById(containerId);
        if (!container) return;
        try {
            // eslint-disable-next-line no-undef
            const player = new YT.Player(containerId, {
                height: '180',
                width: '320',
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1
                },
                events: {
                    onReady: (e) => {
                        data.ready = true;
                        data.player = e.target;
                        // Başlangıç ses seviyesi
                        e.target.setVolume(70);
                        // Autoplay başarılıysa mute durumunu uygula
                        if (data.userMuted) e.target.mute();
                    },
                    onStateChange: (e) => {
                        // Dinleyici tarafı kendi video'sunu yönetir — DJ status'u override edebilir
                        // Boş bırakıyoruz; sync onMusicStatusFromPeer'da yönetiliyor
                    }
                }
            });
            data.player = player;
        } catch (e) {
            console.warn('Listener YT player oluşturulamadı:', e);
        }
    }

    // =========================================
    // VOICE CHANGER (Ses Değiştirici - Admin only)
    // =========================================
    // 10 kaliteli efekt preset — gerçek pitch shifting ile
    // Pitch değerleri daha dramatik (cubic interpolation + 4 grain overlap ile temiz)
    static VOICE_PRESETS = {
        'normal':    { pitch: 0,  filterType: 'allpass',   filterFreq: 1000, filterGain: 0,  delayTime: 0,    feedback: 0,   distortion: 0 },
        'deep_male': { pitch: -6, filterType: 'lowpass',   filterFreq: 3200, filterGain: 0,  delayTime: 0,    feedback: 0,   distortion: 0 },
        'thin_male': { pitch: -3, filterType: 'highpass',  filterFreq: 200,  filterGain: 0,  delayTime: 0,    feedback: 0,   distortion: 0 },
        'female':    { pitch: 5,  filterType: 'highshelf',filterFreq: 3500, filterGain: 5,  delayTime: 0,    feedback: 0,   distortion: 0 },
        'child':     { pitch: 8,  filterType: 'highpass', filterFreq: 200,  filterGain: 0,  delayTime: 0,    feedback: 0,   distortion: 0 },
        'robot':     { pitch: 0,  filterType: 'allpass',  filterFreq: 1000, filterGain: 0,  delayTime: 0.04, feedback: 0.3, distortion: 20 },
        'alien':     { pitch: 4,  filterType: 'allpass',  filterFreq: 1000, filterGain: 0,  delayTime: 0.08, feedback: 0.4, distortion: 0 },
        'ghost':     { pitch: -4, filterType: 'lowpass',  filterFreq: 1800, filterGain: 0,  delayTime: 0.18, feedback: 0.5, distortion: 0 },
        'santa':     { pitch: -6, filterType: 'lowpass',  filterFreq: 2800, filterGain: 0,  delayTime: 0.06, feedback: 0.2, distortion: 0 },
        'squeak':    { pitch: 12, filterType: 'highpass', filterFreq: 500,  filterGain: 0,  delayTime: 0,    feedback: 0,   distortion: 5 }
    };

    /** Mikrofonu AudioContext + AudioWorklet pitch shifter + Web Audio efekt zincirinden geçir.
     *  Zincir: mic → PitchNode (AudioWorklet) → BiquadFilter1 → BiquadFilter2 → WaveShaper → DelayNode → MediaStreamDestination → WebRTC
     *  AudioWorklet yüklenemezse pitch node'u bypass edilir (sadece EQ zinciri çalışır).
     */
    async initVoiceChangerChain(rawMicStream) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.vcAudioContext = new AudioContextClass();

            if (this.vcAudioContext.state === 'suspended') {
                try { await this.vcAudioContext.resume(); } catch (_) {}
            }

            // === AudioWorklet modülünü yükle ===
            // pitch-processor.js statik dosya olarak servis edilir
            this.vcPitchWorkletLoaded = false;
            try {
                await this.vcAudioContext.audioWorklet.addModule('/pitch-processor.js');
                this.vcPitchWorkletLoaded = true;
                console.log('[VC] AudioWorklet pitch-processor yüklendi ✅');
            } catch (e) {
                console.warn('[VC] AudioWorklet yüklenemedi, pitch bypass edilecek:', e);
            }

            // Mikrofon → AudioContext source
            this.vcSourceNode = this.vcAudioContext.createMediaStreamSource(rawMicStream);

            // === Pitch Shifter (AudioWorkletNode) — gerçek granular synthesis ===
            if (this.vcPitchWorkletLoaded) {
                this.vcPitchNode = new AudioWorkletNode(this.vcAudioContext, 'pitch-processor', {
                    parameterData: { pitch: 1 },  // 1 = passthrough
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    channelCount: 2,
                    channelCountMode: 'explicit',
                    channelInterpretation: 'speakers',
                    outputChannelCount: [2]
                });
                console.log('[VC] AudioWorkletNode (pitch-processor) oluşturuldu');
            } else {
                this.vcPitchNode = null;
            }

            // BiquadFilter1 — ana EQ
            this.vcBiquadFilter = this.vcAudioContext.createBiquadFilter();
            this.vcBiquadFilter.type = 'allpass';
            this.vcBiquadFilter.frequency.value = 1000;
            this.vcBiquadFilter.gain.value = 0;

            // BiquadFilter2 — ikincil EQ (formant simülasyonu için)
            this.vcBiquadFilter2 = this.vcAudioContext.createBiquadFilter();
            this.vcBiquadFilter2.type = 'allpass';
            this.vcBiquadFilter2.frequency.value = 1000;
            this.vcBiquadFilter2.gain.value = 0;

            // WaveShaper — distortion (robot/çiğlik)
            this.vcWaveShaper = this.vcAudioContext.createWaveShaper();
            this.vcWaveShaper.curve = null;
            this.vcWaveShaper.oversample = '2x';

            // DelayNode — echo/reverb
            this.vcDelayNode = this.vcAudioContext.createDelay(1.0);
            this.vcDelayNode.delayTime.value = 0;
            this.vcDelayFeedback = this.vcAudioContext.createGain();
            this.vcDelayFeedback.gain.value = 0;

            // MediaStreamDestination → WebRTC
            this.vcDestNode = this.vcAudioContext.createMediaStreamDestination();

            // Monitor için gain node (lokal dinleme — varsayılan 0)
            this.vcMonitorGain = this.vcAudioContext.createGain();
            this.vcMonitorGain.gain.value = 0;

            // === BAĞLANTI ZİNCİRİ ===
            // mic → pitchNode → biquad1 → biquad2 → waveShaper → delayNode → destNode (WebRTC)
            //                                                                        ↓
            //                                                                    monitorGain → speakers
            let lastNode = this.vcSourceNode;
            if (this.vcPitchNode) {
                lastNode.connect(this.vcPitchNode);
                lastNode = this.vcPitchNode;
            }
            lastNode.connect(this.vcBiquadFilter);
            this.vcBiquadFilter.connect(this.vcBiquadFilter2);
            this.vcBiquadFilter2.connect(this.vcWaveShaper);
            this.vcWaveShaper.connect(this.vcDelayNode);
            this.vcDelayNode.connect(this.vcDelayFeedback);
            this.vcDelayFeedback.connect(this.vcDelayNode);
            this.vcDelayNode.connect(this.vcDestNode);
            this.vcDelayNode.connect(this.vcMonitorGain);
            this.vcMonitorGain.connect(this.vcAudioContext.destination);

            this.vcProcessedStream = this.vcDestNode.stream;
            this.vcActive = true;
            console.log('[VC] Voice changer zinciri kuruldu — AudioWorklet + Biquad + WaveShaper + Delay');
            return this.vcProcessedStream;
        } catch (e) {
            console.error('[VC] Voice changer zinciri kurulamadı:', e);
            this.vcActive = false;
            return rawMicStream;
        }
    }

    /** WaveShaper için distortion curve oluştur (robot/çiğlik efekti) */
    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; ++i) {
            const x = i * 2 / samples - 1;
            curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    /** Pitch değerini AudioWorkletNode'a uygula (gerçek pitch shifting!)
     *  semitone → pitch ratio: 2^(semitones/12)
     *  0 semitone = ratio 1 (passthrough)
     *  +12 semitone = ratio 2 (bir oktav yukarı)
     *  -12 semitone = ratio 0.5 (bir oktav aşağı)
     */
    applyPitchToSoundTouch(semitones) {
        if (!this.vcActive) return;
        const pitchRatio = Math.pow(2, semitones / 12);

        // AudioWorkletNode pitch parametresini ayarla
        if (this.vcPitchNode && this.vcPitchWorkletLoaded) {
            const pitchParam = this.vcPitchNode.parameters.get('pitch');
            if (pitchParam) {
                pitchParam.value = pitchRatio;
                console.log('[VC] Pitch (AudioWorklet):', semitones, 'semitone → ratio', pitchRatio.toFixed(3));
            }
        }

        // Formant simülasyonu — BiquadFilter2 ile
        // Pitch yükselince: yüksek frekansları biraz daha vurgula (parlak ses)
        // Pitch düşürünce: düşük frekansları biraz daha vurgula (kalın ses)
        if (this.vcBiquadFilter2) {
            if (semitones > 0) {
                this.vcBiquadFilter2.type = 'highshelf';
                this.vcBiquadFilter2.frequency.value = Math.max(1500, 3500 - semitones * 150);
                this.vcBiquadFilter2.gain.value = Math.min(semitones * 1, 6);  // max +6dB
            } else if (semitones < 0) {
                this.vcBiquadFilter2.type = 'lowshelf';
                this.vcBiquadFilter2.frequency.value = Math.min(1500, 500 + Math.abs(semitones) * 150);
                this.vcBiquadFilter2.gain.value = Math.min(Math.abs(semitones) * 1, 6);  // max +6dB
            } else {
                this.vcBiquadFilter2.type = 'allpass';
                this.vcBiquadFilter2.gain.value = 0;
            }
        }
    }

    /** Voice changer hazır değilse lazy init et — admin VC butona bastığında çağrılır.
     *  SoundTouchJS dynamic import ile initVoiceChangerChain içinde yüklenir. */
    async ensureVoiceChangerReady() {
        if (this.vcActive) return true;

        // rawMicStream var mı? (oda katıldığımızda sakladığımız ham mikrofon)
        if (!this.rawMicStream) {
            this.showToast('⚠️', 'Mikrofon hazır değil — önce odaya katıl.');
            return false;
        }

        // VC chain'i init et (SoundTouchJS dynamic import ile yükleyecek)
        const newStream = await this.initVoiceChangerChain(this.rawMicStream);
        if (!this.vcActive) {
            this.showToast('❌', 'Voice changer başlatılamadı. Sayfayı yenileyin.');
            return false;
        }

        // Mevcut peer connection'larda audio track'i değiştir (replaceTrack)
        const newAudioTrack = newStream.getAudioTracks()[0];
        if (newAudioTrack) {
            this.peers.forEach((peer) => {
                try {
                    const senders = peer.pc.getSenders();
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) {
                        audioSender.replaceTrack(newAudioTrack).catch(e =>
                            console.warn('[VC] replaceTrack hatası:', e)
                        );
                    }
                } catch (e) {
                    console.warn('[VC] peer update hatası:', e);
                }
            });
        }

        // localStream'i güncelle — artık VC zincirinden geçen stream kullanılsın
        this.localStream = newStream;
        console.log('[VC] Voice changer lazy-init tamamlandı');
        return true;
    }

    /** AudioContext askıdaysa resume et — voice changer'i ve WebRTC ses akışını canlı tutar.
     *  Tarayıcı otomatik suspended yapabilir (uzun boşluk, tab arka plan vs). */
    async resumeVcAudioContext() {
        if (!this.vcAudioContext) return;
        if (this.vcAudioContext.state === 'suspended') {
            try {
                await this.vcAudioContext.resume();
                console.log('[VC] AudioContext resumed');
            } catch (e) {
                console.warn('[VC] AudioContext resume failed:', e);
            }
        }
    }

    /** Pitch değerini SoundTouch'a uygula (artık kullanılmıyor — bypass edildi) */
    applyPitchToSoundTouch_old(semitones) {
        // Eski SoundTouchJS metodu — artık kullanılmıyor
    }

    /** Bir preset uygula (admin butona bastığında) — 10 efektten biri */
    async applyVoicePreset(presetName) {
        const preset = VoiceChatApp.VOICE_PRESETS[presetName];
        if (!preset) {
            console.warn('[VC] Bilinmeyen preset:', presetName);
            return;
        }
        // Voice changer hazır değilse ŞİMDİ init et (SoundTouchJS artık yüklenmiş olmalı)
        if (!this.vcActive) {
            const ready = await this.ensureVoiceChangerReady();
            if (!ready) return;
        }
        // AudioContext askıdaysa resume et
        await this.resumeVcAudioContext();

        this.currentVoicePreset = presetName;
        this.currentPitch = preset.pitch;
        // UI güncelle
        if (this.vcPitchSlider) this.vcPitchSlider.value = preset.pitch;
        if (this.vcPitchValue) this.vcPitchValue.textContent = (preset.pitch > 0 ? '+' : '') + preset.pitch;

        // === 1. PITCH SHIFTER ===
        this.applyPitchToSoundTouch(preset.pitch);

        // === 2. EQ FİLTRESİ (BiquadFilter) ===
        if (this.vcBiquadFilter) {
            this.vcBiquadFilter.type = preset.filterType || 'allpass';
            this.vcBiquadFilter.frequency.value = preset.filterFreq || 1000;
            this.vcBiquadFilter.gain.value = preset.filterGain || 0;
            console.log('[VC] Filter:', preset.filterType, '@', preset.filterFreq, 'Hz, gain:', preset.filterGain);
        }

        // === 3. DELAY / ECHO ===
        if (this.vcDelayNode && this.vcDelayFeedback) {
            this.vcDelayNode.delayTime.value = preset.delayTime || 0;
            this.vcDelayFeedback.gain.value = preset.feedback || 0;
            console.log('[VC] Delay:', preset.delayTime, 's, feedback:', preset.feedback);
        }

        // === 4. DISTORTION (WaveShaper) — robot efekti ===
        if (this.vcWaveShaper) {
            if (preset.distortion && preset.distortion > 0) {
                this.vcWaveShaper.curve = this.makeDistortionCurve(preset.distortion);
            } else {
                this.vcWaveShaper.curve = null;  // bypass
            }
            console.log('[VC] Distortion amount:', preset.distortion || 0);
        }

        // Sunucuya + odadakilere haber ver
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'voice-effect-change',
                preset: presetName
            }));
        }

        // UI status güncelle
        const labels = {
            'normal':    null,
            'deep_male': 'Kalın Erkek',
            'thin_male': 'İnce Erkek',
            'female':    'Kadın',
            'child':     'Çocuk',
            'robot':     'Robot',
            'alien':     'Yabancı',
            'ghost':     'Hayalet',
            'santa':     'Noel Baba',
            'squeak':    'Çığlık'
        };
        if (this.vcStatus) {
            if (presetName === 'normal') {
                this.vcStatus.textContent = 'Pasif';
                this.vcStatus.classList.remove('active');
            } else {
                this.vcStatus.textContent = labels[presetName] || presetName;
                this.vcStatus.classList.add('active');
            }
        }

        const toastMessages = {
            'normal':    '🎤 Ses normal',
            'deep_male': '🧔 Kalın erkek sesi aktif!',
            'thin_male': '👨 İnce erkek sesi aktif!',
            'female':    '👩 Kadın sesi aktif!',
            'child':     '👧 Çocuk sesi aktif!',
            'robot':     '🤖 Robot sesi aktif!',
            'alien':     '👽 Yabancı sesi aktif!',
            'ghost':     '🎃 Hayalet sesi aktif!',
            'santa':     '🎅 Noel Baba sesi aktif!',
            'squeak':    '📣 Çığlık sesi aktif!'
        };
        this.showToast('🎭', toastMessages[presetName] || 'Ses değiştirildi');
    }

    /** Monitor (lokal dinleme) aç/kapat — sadece admin kendi sesini duyarak test eder */
    async toggleVoiceMonitor() {
        // Lazy init voice changer if not ready
        if (!this.vcActive) {
            const ready = await this.ensureVoiceChangerReady();
            if (!ready) return;
        }
        // AudioContext askıdaysa resume et
        await this.resumeVcAudioContext();
        if (!this.vcMonitorGain) {
            this.showToast('⚠️', 'Monitor hazır değil.');
            return;
        }
        this.vcMonitorActive = !this.vcMonitorActive;
        // 0.6 = yüksek ses (kendi sesini duyabilmek için)
        this.vcMonitorGain.gain.value = this.vcMonitorActive ? 0.6 : 0;
        if (this.vcMonitorBtn) {
            this.vcMonitorBtn.classList.toggle('active', this.vcMonitorActive);
            this.vcMonitorBtn.textContent = this.vcMonitorActive ? '🔇 Monitörü Kapat' : '🔊 Kendi Sesimi Dinle';
        }
        if (this.vcMonitorActive) {
            this.showToast('🔊', 'Sesinizi duyuyorsunuz — pitch efektini test edin!');
        } else {
            this.showToast('🔇', 'Monitör kapatıldı.');
        }
    }

    /** Karşı tarafın voice effect'i değişti — UI'da indicator göster */
    onVoiceEffectChange(message) {
        // message.userId, message.preset
        const labels = {
            'normal': null,
            'deep_male': '🧔 Kalın',
            'thin_male': '👨 İnce',
            'female': '👩 Kadın',
            'child': '👧 Çocuk',
            'robot': '🤖 Robot',
            'alien': '👽 Alien',
            'ghost': '🎃 Hayalet',
            'santa': '🎅 Baba',
            'squeak': '📣 Çığlık'
        };
        const label = labels[message.preset];
        if (!label) return; // normal ise gösterme

        // voice-participants içindeki kullanıcı kartında indicator ekle
        const card = document.getElementById(`participant-${message.userId}`);
        if (card) {
            let badge = card.querySelector('.voice-effect-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'voice-effect-badge';
                card.appendChild(badge);
            }
            badge.textContent = label;
        }
        // Sidebar'daki kullanıcı listesinde de
        const sidebarItems = document.querySelectorAll(`.channel-user-item[data-user-id="${message.userId}"]`);
        sidebarItems.forEach(item => {
            let badge = item.querySelector('.voice-effect-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'voice-effect-badge';
                item.appendChild(badge);
            }
            badge.textContent = label;
        });
        // Toast
        if (message.username) {
            this.showToast('🎭', `${message.username} sesini değiştirdi: ${label}`);
        }
    }

    // =========================================
    // NICK DEĞİŞTİRME
    // =========================================

    /** Nick değiştirme gönder → server'a change-nick mesajı */
    submitNickChange() {
        const newNick = (this.nickChangeInput.value || '').trim();
        if (!newNick) {
            this.showToast('⚠️', 'Nick boş olamaz.');
            return;
        }
        if (newNick === this.username) {
            this.showToast('ℹ️', 'Bu zaten senin nickin.');
            if (this.nickChangeModal) this.nickChangeModal.classList.add('hidden');
            return;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'change-nick',
                newUsername: newNick
            }));
        }
        // Modal'ı kapat — hata gelirse toast ile haber verir
        if (this.nickChangeModal) this.nickChangeModal.classList.add('hidden');
    }

    /** Server'dan nick-changed mesajı geldi → UI'ı güncelle */
    onNickChanged(message) {
        const { userId, oldUsername, newUsername, you } = message;

        if (you) {
            // Bu benim nick değişikliğim
            this.username = newUsername;
            localStorage.setItem('username', newUsername);
            if (this.displayName) this.displayName.textContent = newUsername;
            if (this.userAvatarLetter) this.userAvatarLetter.textContent = newUsername.charAt(0).toUpperCase();
            this.showToast('✏️', `Nick'iniz değiştirildi: ${newUsername}`);
        } else {
            // Başka bir kullanıcı nick değiştirdi
            this.showToast('✏️', `${oldUsername} → ${newUsername}`);
        }

        // Voice participant kartındaki ismi güncelle
        const card = document.getElementById(`participant-${userId}`);
        if (card) {
            const nameEl = card.querySelector('.participant-name');
            if (nameEl) nameEl.textContent = newUsername;
        }

        // Channel sidebar'daki kullanıcı isimlerini güncelle
        const sidebarItems = document.querySelectorAll(`.channel-user-item[data-user-id="${userId}"]`);
        sidebarItems.forEach(item => {
            const nameEl = item.querySelector('.channel-user-name');
            if (nameEl) {
                // Admin crown varsa koru
                const crown = nameEl.querySelector('.admin-crown');
                nameEl.textContent = newUsername;
                if (crown) nameEl.appendChild(crown);
            }
        });

        // Online members listesindeki ismi güncelle
        const memberItems = document.querySelectorAll('.member-item');
        memberItems.forEach(item => {
            const nameEl = item.querySelector('.member-name');
            if (nameEl && nameEl.textContent === oldUsername) {
                nameEl.textContent = newUsername;
                const avatarEl = item.querySelector('.member-avatar');
                if (avatarEl) avatarEl.textContent = newUsername.charAt(0).toUpperCase();
            }
        });
    }

    // =========================================
    // MOBİL MENÜ TOGGLE
    // =========================================

    /** Mobil cihazlarda sidebar'ı aç/kapat */
    toggleMobileSidebar(forceOpen) {
        const shouldOpen = forceOpen !== undefined ? forceOpen : !document.body.classList.contains('mobile-sidebar-open');

        if (shouldOpen) {
            document.body.classList.add('mobile-sidebar-open');
            if (this.channelSidebar) this.channelSidebar.classList.add('mobile-visible');
            if (this.mobileOverlay) this.mobileOverlay.classList.remove('hidden');
        } else {
            document.body.classList.remove('mobile-sidebar-open');
            if (this.channelSidebar) this.channelSidebar.classList.remove('mobile-visible');
            if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
        }
    }

    /** Mobil tab değiştir (Kanallar/Sohbet/İnsanlar) — toggle destekli */
    switchMobileTab(tabName) {
        // DEBUG: toast göster
        this.showToast('📱', 'Tab: ' + tabName);
        
        // Aynı tab'a tekrar tıklarsa → channels'e dön
        const currentTab = document.body.className.match(/tab-(\w+)/);
        if (currentTab && currentTab[1] === tabName && tabName !== 'channels') {
            tabName = 'channels';
        }
        
        // Tab butonlarını güncelle
        if (this.mobileTabBar) {
            this.mobileTabBar.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
        }
        
        // Element'leri direkt al
        const voiceView = document.getElementById('voice-view');
        const voiceRoomCard = document.querySelector('.voice-room-card');
        const chatPanel = document.getElementById('chat-panel');
        const membersSidebar = document.querySelector('.members-sidebar');
        const musicPanel = document.getElementById('music-panel');
        
        // Önce HER ŞEYİ sıfırla — removeProperty ile !important'ları temizle
        const allElements = [voiceRoomCard, chatPanel, musicPanel, membersSidebar, voiceView];
        allElements.forEach(el => {
            if (!el) return;
            el.style.removeProperty('display');
            el.style.removeProperty('position');
            el.style.removeProperty('top');
            el.style.removeProperty('left');
            el.style.removeProperty('right');
            el.style.removeProperty('bottom');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.style.removeProperty('z-index');
            el.style.removeProperty('flex');
            el.style.removeProperty('max-height');
            el.style.removeProperty('background');
            el.style.removeProperty('flex-direction');
        });
        
        if (tabName === 'chat') {
            // Chat panel DIREKT fixed full-screen
            if (voiceRoomCard) voiceRoomCard.style.setProperty('display', 'none', 'important');
            if (musicPanel) musicPanel.style.setProperty('display', 'none', 'important');
            if (voiceView) voiceView.classList.remove('hidden');
            if (chatPanel) {
                chatPanel.style.setProperty('display', 'flex', 'important');
                chatPanel.style.setProperty('position', 'fixed', 'important');
                chatPanel.style.setProperty('top', '0', 'important');
                chatPanel.style.setProperty('left', '0', 'important');
                chatPanel.style.setProperty('right', '0', 'important');
                chatPanel.style.setProperty('bottom', '56px', 'important');
                chatPanel.style.setProperty('z-index', '9999', 'important');
                chatPanel.style.setProperty('background', '#0B0E14', 'important');
            }
            // DEBUG: YENI element yarat — body'e direkt ekle
            var debugDiv = document.getElementById('mobile-chat-debug');
            if (debugDiv) debugDiv.remove();
            debugDiv = document.createElement('div');
            debugDiv.id = 'mobile-chat-debug';
            debugDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:56px;background:red;z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;padding:20px;';
            debugDiv.innerHTML = '<div>SOHBET PANELI TEST<br>Eger bunu goruyorsan JavaScript calisiyor<br>ama chat-panel gorunmuyor</div>';
            document.body.appendChild(debugDiv);
            // Eski chat content'i de debugDiv'e tasi
            if (chatPanel) {
                var chatContent = chatPanel.innerHTML;
                debugDiv.innerHTML += '<div style="margin-top:20px;font-size:14px;color:yellow;">Chat icerigi:<br>' + chatContent.substring(0, 200) + '</div>';
            }
            this.toggleMobileSidebar(false);
        } else if (tabName === 'people') {
            // İnsanlar TAM EKRAN
            if (voiceRoomCard) voiceRoomCard.style.setProperty('display', 'none', 'important');
            if (chatPanel) chatPanel.style.setProperty('display', 'none', 'important');
            if (musicPanel) musicPanel.style.setProperty('display', 'none', 'important');
            if (membersSidebar) {
                membersSidebar.style.setProperty('display', 'flex', 'important');
                membersSidebar.style.setProperty('position', 'fixed', 'important');
                membersSidebar.style.setProperty('top', '0', 'important');
                membersSidebar.style.setProperty('left', '0', 'important');
                membersSidebar.style.setProperty('right', '0', 'important');
                membersSidebar.style.setProperty('bottom', '56px', 'important');
                membersSidebar.style.setProperty('z-index', '300', 'important');
                membersSidebar.style.setProperty('background', '#0B0E14', 'important');
                membersSidebar.style.setProperty('flex-direction', 'column', 'important');
                membersSidebar.style.setProperty('overflow-y', 'auto', 'important');
            }
            this.toggleMobileSidebar(false);
        } else {
            // Kanallar (default) — her şeyi normale döndür
            if (voiceView) {
                voiceView.classList.remove('hidden');
                voiceView.style.setProperty('display', 'flex', 'important');
                voiceView.style.removeProperty('position');
                voiceView.style.removeProperty('top');
                voiceView.style.removeProperty('left');
                voiceView.style.removeProperty('right');
                voiceView.style.removeProperty('bottom');
                voiceView.style.removeProperty('z-index');
                voiceView.style.removeProperty('background');
            }
            if (membersSidebar) membersSidebar.style.setProperty('display', 'none', 'important');
            this.toggleMobileSidebar(false);
        }
    }

    /** VRC buton state güncelle (mute/deafen için) */
    updateVrcButtonState() {
        const vrcMicBtn = document.getElementById('vrc-mic-btn');
        const vrcDeafenBtn = document.getElementById('vrc-deafen-btn');
        if (vrcMicBtn) vrcMicBtn.classList.toggle('active-red', this.isMuted);
        if (vrcDeafenBtn) vrcDeafenBtn.classList.toggle('active-red', this.isDeafened);
    }
}

// Uygulamayı başlat
const app = new VoiceChatApp();
// window.app — YouTube IFrame API'nin onYouTubeIframeAPIReady callback'i bunu kullanır
window.app = app;
