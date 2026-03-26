// =========================================
// SesliChat - Ana Uygulama Mantığı
// =========================================

class VoiceChatApp {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.username = null;
        this.currentRoom = null;
        this.peers = new Map(); // userId -> { pc: RTCPeerConnection, stream: MediaStream }
        this.peerVolumes = new Map(); // userId -> volume (0.0 to 1.0)
        this.localStream = null;
        this.isMuted = false;
        this.isDeafened = false;

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

        // Kanallar
        this.channelList = document.getElementById('channel-list');

        // Kullanıcı Paneli
        this.displayName = document.getElementById('display-name');
        this.userAvatarLetter = document.getElementById('user-avatar-letter');
        this.userStatusText = document.getElementById('user-status-text');
        this.micBtn = document.getElementById('mic-btn');
        this.deafenBtn = document.getElementById('deafen-btn');
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

        // Chat
        this.chatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendChatMessage();
        });

        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
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
            this.ws.send(JSON.stringify({
                type: 'join',
                username: this.username
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
            const previousRoom = this.currentRoom;
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
        this.channelList.innerHTML = '';

        for (const [roomId, room] of Object.entries(rooms)) {
            const isActive = this.currentRoom === roomId;
            const userCount = room.users.length;

            const channelEl = document.createElement('div');
            channelEl.className = `channel-item${isActive ? ' active' : ''}`;
            channelEl.innerHTML = `
                <span class="channel-icon">${room.icon}</span>
                <span class="channel-name">${room.name}</span>
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
                    const avatarColor = this.getAvatarColor(user.username);
                    userEl.innerHTML = `
                        <span class="mini-avatar" style="background: ${avatarColor}">${user.username.charAt(0).toUpperCase()}</span>
                        <span class="channel-user-name">${user.username}</span>
                        ${user.isMuted ? '<span class="user-muted-icon">🔇</span>' : ''}
                    `;
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
            const avatarColor = this.getAvatarColor(user.username);
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

        try {
            // Mikrofon erişimi al
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
            }

            this.ws.send(JSON.stringify({
                type: 'join-room',
                roomId: roomId
            }));
        } catch (err) {
            console.error('Mikrofon erişim hatası:', err);
            this.showToast('❌', 'Mikrofon erişimi reddedildi. Lütfen izin verin.');
        }
    }

    onRoomJoined(message) {
        this.currentRoom = message.roomId;

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

        // Tüm peer bağlantılarını kapat
        this.peers.forEach((peer, peerId) => {
            peer.pc.close();
            if (peer.audioEl) {
                peer.audioEl.srcObject = null;
                peer.audioEl.remove();
            }
        });
        this.peers.clear();

        this.ws.send(JSON.stringify({ type: 'leave-room' }));
    }

    onRoomLeft() {
        this.currentRoom = null;
        this.voiceView.classList.add('hidden');
        this.welcomeView.classList.remove('hidden');
        this.disconnectBtn.style.display = 'none';
        this.userStatusText.textContent = 'Çevrimiçi';
        this.voiceParticipants.innerHTML = '';
        this.speakingUsers.clear();
        this.stopVoiceActivityDetection();

        // Chat temizle
        this.chatMessages.innerHTML = '<div class="chat-welcome-msg"><span>👋</span> Sesli kanala hoş geldin! Buradan mesaj yazabilirsin.</div>';

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
            peer.pc.close();
            if (peer.audioEl) {
                peer.audioEl.srcObject = null;
                peer.audioEl.remove();
            }
            this.peers.delete(message.userId);
        }
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

        // Uzak ses akışını al
        pc.ontrack = (event) => {
            const stream = event.streams[0];
            let audioEl = document.getElementById(`audio-${peerId}`);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `audio-${peerId}`;
                audioEl.autoplay = true;
                audioEl.playsInline = true;
                
                // Kaydedilmiş ses seviyesini uygula
                const volValue = this.peerVolumes.has(peerId) ? this.peerVolumes.get(peerId) : 1.0;
                audioEl.volume = volValue;
                
                document.body.appendChild(audioEl);
            }
            audioEl.srcObject = stream;

            const peerData = this.peers.get(peerId);
            if (peerData) {
                peerData.audioEl = audioEl;
                peerData.remoteStream = stream;
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Peer ${peerId} bağlantı durumu: ${pc.connectionState}`);
        };

        const peerData = { pc, audioEl: null, remoteStream: null };
        this.peers.set(peerId, peerData);

        // Teklif oluştur (initiator ise)
        if (isInitiator) {
            this.createOffer(peerId, pc);
        }

        return pc;
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
        const pc = this.createPeerConnection(message.senderId, false);

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
            const avatarColor = this.getAvatarColor(user.username);
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
        if (!text || !this.currentRoom) return;

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

        msgEl.innerHTML = `
            <div class="chat-msg-header">
                <span class="chat-msg-author" style="color: ${this.getAuthorColor(message.username)}">${message.username}</span>
                <span class="chat-msg-time">${timeStr}</span>
            </div>
            <div class="chat-msg-text">${this.escapeHtml(message.message)}</div>
        `;

        this.chatMessages.appendChild(msgEl);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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
    getAvatarColor(name) {
        const colors = [
            'linear-gradient(135deg, #7C5CFC, #5865F2)',
            'linear-gradient(135deg, #3BA55D, #2D8B4E)',
            'linear-gradient(135deg, #FAA81A, #E09400)',
            'linear-gradient(135deg, #ED4245, #C73335)',
            'linear-gradient(135deg, #F47B67, #E0654F)',
            'linear-gradient(135deg, #00B0F4, #0090D0)',
            'linear-gradient(135deg, #E67E22, #D35400)',
            'linear-gradient(135deg, #9B59B6, #8E44AD)',
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

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
}

// Uygulamayı başlat
const app = new VoiceChatApp();
