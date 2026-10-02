const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// JSON body parser — YouTube search endpoint için
app.use(express.json());

// === YOUTUBE API KEY (Render env var) ===
// Set YOUTUBE_API_KEY in Render Dashboard → Environment
// Boşsa search devre dışı kalır, ama URL yapıştırma çalışmaya devam eder
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';


// Statik dosyaları sun — NO CACHE (mobil Chrome cache sorununu önle)
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// Sağlık kontrolü (Render.com için)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', users: connectedUsers.size });
});

// === YOUTUBE ARAMA ENDPOINT ===
// Frontend bu endpoint'e POST yapıp arama sonuçlarını alır.
// YOUTUBE_API_KEY yoksa 403 döner, frontend URL yapıştırmayı kullanır.
app.post('/youtube-search', async (req, res) => {
  try {
    const query = (req.body && req.body.q) || (req.query && req.query.q) || '';
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'En az 2 karakter gerekli' });
    }
    if (!YOUTUBE_API_KEY) {
      return res.status(403).json({
        error: 'YOUTUBE_API_KEY ayarlı değil. URL yapıştırmayı kullanabilirsiniz.',
        noApiKey: true
      });
    }
    // YouTube Data API v3 — search
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https.get(url, (r) => {
        let body = '';
        r.on('data', (chunk) => body += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    if (data.error) {
      console.error('YouTube API hatası:', data.error.message);
      return res.status(500).json({ error: 'YouTube API hatası: ' + (data.error.message || 'bilinmeyen') });
    }

    // Frontend için sadece gerekili alanları döndür
    const items = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default)
        ? (item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url
        : null,
      publishedAt: item.snippet.publishedAt
    }));
    return res.json({ items });
  } catch (err) {
    console.error('YouTube search error:', err);
    return res.status(500).json({ error: 'Sunucu hatası: ' + (err.message || 'bilinmeyen') });
  }
});

// === CONFIG ENDPOINT — frontend YOUTUBE_API_KEY olup olmadığını kontrol etsin diye ===
app.get('/config', (req, res) => {
  res.json({
    youtubeSearchEnabled: !!YOUTUBE_API_KEY,
    version: '2.0.0'
  });
});

// Oda ve kullanıcı yönetimi
let rooms = {
  'genel': { name: 'Genel', icon: '💬', isLocked: false, password: '', users: new Map() },
  'oyun': { name: 'Oyun', icon: '🎮', isLocked: false, password: '', users: new Map() },
  'muzik': { name: 'Müzik', icon: '🎵', isLocked: false, password: '', users: new Map() },
  'chill': { name: 'Chill', icon: '☕', isLocked: false, password: '', users: new Map() }
};

const ROOMS_FILE = path.join(__dirname, 'rooms.json');

function saveRooms() {
  try {
    const dataToSave = {};
    for (const [id, room] of Object.entries(rooms)) {
      dataToSave[id] = {
        name: room.name,
        icon: room.icon,
        isLocked: room.isLocked,
        password: room.password
      };
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('💾 Odalar kaydedildi.');
  } catch (err) {
    console.error('Oda kaydetme hatası:', err);
  }
}

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = fs.readFileSync(ROOMS_FILE, 'utf8');
      const loadedRooms = JSON.parse(data);
      for (const [id, room] of Object.entries(loadedRooms)) {
        rooms[id] = {
          ...room,
          users: new Map()
        };
      }
      console.log('📂 Odalar yüklendi.');
    } else {
      // Dosya yoksa varsayılanları kaydet
      saveRooms();
    }
  } catch (err) {
    console.error('Oda yükleme hatası:', err);
  }
}

loadRooms();

// Tüm bağlı kullanıcılar
const connectedUsers = new Map();

function broadcastRoomUpdate() {
  const roomData = {};
  for (const [id, room] of Object.entries(rooms)) {
    roomData[id] = {
      name: room.name,
      icon: room.icon,
      isLocked: room.isLocked,
      users: Array.from(room.users.values()).map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        color: u.color,
        isMuted: u.isMuted || false,
        isDeafened: u.isDeafened || false
      }))
    };
  }

  const message = JSON.stringify({ type: 'room-update', rooms: roomData });
  connectedUsers.forEach((user) => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

function broadcastOnlineUsers() {
  const onlineList = Array.from(connectedUsers.values()).map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    color: u.color,
    currentRoom: u.currentRoom || null
  }));

  const message = JSON.stringify({ type: 'online-users', users: onlineList });
  connectedUsers.forEach((user) => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  let userId = null;

  // Bağlantı canlılık takibi
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'join': {
          // === DUPLICATE USER FIX ===
          // Aynı username ile başka bir aktif bağlantı varsa, eski bağlantıyı kapat.
          // Bu, sayfa yenileme / kopma / tekrar bağlanma anında "çift kullanıcı" sorununu çözer.
          // İstemci clientId de gönderebilir (localStorage'da saklanan UUID); aynı clientId gelirse kesin aynı kişi.
          const incomingClientId = message.clientId || null;
          for (const [existingId, existingUser] of connectedUsers.entries()) {
            const sameClient = incomingClientId && existingUser.clientId === incomingClientId;
            const sameUsername = existingUser.username === message.username;
            if (sameClient || sameUsername) {
              // Eski bağlantıya "force-disconnect" bildir
              try {
                if (existingUser.ws.readyState === WebSocket.OPEN) {
                  existingUser.ws.send(JSON.stringify({
                    type: 'force-disconnect',
                    message: 'Aynı kullanıcı adıyla yeni bir bağlantı açıldı. Eski oturum kapatılıyor.'
                  }));
                  setTimeout(() => {
                    try { existingUser.ws.close(); } catch (_) {}
                  }, 400);
                }
              } catch (_) {}
              // Eski kullanıcıyı odalar ve global listeden temizle
              if (existingUser.currentRoom && rooms[existingUser.currentRoom]) {
                rooms[existingUser.currentRoom].users.delete(existingId);
                // Odadaki diğer kullanıcılara peer-left bildir
                rooms[existingUser.currentRoom].users.forEach((otherUser) => {
                  if (otherUser.ws.readyState === WebSocket.OPEN) {
                    otherUser.ws.send(JSON.stringify({
                      type: 'peer-left',
                      userId: existingId,
                      username: existingUser.username
                    }));
                  }
                });
              }
              connectedUsers.delete(existingId);
            }
          }

          // Yeni kullanıcıyı oluştur
          userId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
          const user = {
            id: userId,
            clientId: incomingClientId,
            username: message.username,
            role: 'user', // varsayılan rol
            color: message.color || '#5865F2',
            ws: ws,
            currentRoom: null,
            isMuted: false,
            isDeafened: false,
            isSharingMusic: false, // müzik paylaşıyor mu?
            musicTrackName: ''     // çaldığı müziğin adı
          };
          connectedUsers.set(userId, user);

          ws.send(JSON.stringify({ type: 'joined', userId, role: user.role }));
          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        // === MÜZİK PLAYER RELAY (YOUTUBE) ===
        // DJ müzik başlattığında odadaki herkese haber ver
        case 'music-start': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          user.isSharingMusic = true;
          user.musicTrackName = (message.trackName || 'Müzik').substring(0, 100);
          // YouTube video ID'sini sakla — yeni katılanlara da iletmek için
          user.musicVideoId = (message.youtubeVideoId || '').substring(0, 30);
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'music-start',
            djId: userId,
            djName: user.username,
            trackName: user.musicTrackName,
            youtubeVideoId: user.musicVideoId,
            isPlaying: true,
            currentTime: 0
          });
          room.users.forEach((u) => {
            if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          // Oda seviyesinde "şu an çalan DJ" bilgisini sakla — yeni katılanlara iletmek için
          room.currentDjId = userId;
          room.currentVideoId = user.musicVideoId;
          room.currentTrackName = user.musicTrackName;
          break;
        }

        // DJ müziği durdurduğunda odadaki herkese haber ver
        case 'music-stop': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          user.isSharingMusic = false;
          user.musicTrackName = '';
          user.musicVideoId = '';
          if (user.currentRoom && rooms[user.currentRoom]) {
            const room = rooms[user.currentRoom];
            // Sadece bu kullanıcı şu anki DJ ise oda seviyesindeki state'i temizle
            if (room.currentDjId === userId) {
              room.currentDjId = null;
              room.currentVideoId = '';
              room.currentTrackName = '';
            }
            const payload = JSON.stringify({ type: 'music-stop', djId: userId });
            room.users.forEach((u) => {
              if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(payload);
              }
            });
          }
          break;
        }

        // DJ müzik durum güncellemesi (çalıyor/duraklatıldı, süre ilerlemesi)
        case 'music-status': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          // Sadece şu anki DJ'den gelen durum güncellemelerini ilet (çakışan DJ'ler için)
          if (room.currentDjId !== userId) return;
          const payload = JSON.stringify({
            type: 'music-status',
            djId: userId,
            isPlaying: !!message.isPlaying,
            currentTime: message.currentTime || 0,
            duration: message.duration || 0
          });
          room.users.forEach((u) => {
            if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          break;
        }

        // İstemciden sunucuya ping (heartbeat) — sessizce cevap ver
        case 'ping': {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;
        }

        // === NICK DEĞİŞTİRME ===
        // Kullanıcı nick'ini değiştirir — tüm odadakilere + online listesine haber ver
        case 'change-nick': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          const newUsername = (message.newUsername || '').trim().substring(0, 20);
          if (!newUsername) {
            ws.send(JSON.stringify({ type: 'nick-change-error', message: 'Nick boş olamaz.' }));
            return;
          }
          if (newUsername === user.username) {
            ws.send(JSON.stringify({ type: 'nick-change-error', message: 'Bu zaten senin nickin.' }));
            return;
          }
          // Aynı nick kullanımda mı kontrol et
          let isTaken = false;
          for (const [, existingUser] of connectedUsers.entries()) {
            if (existingUser.id !== userId && existingUser.username === newUsername) {
              isTaken = true;
              break;
            }
          }
          if (isTaken) {
            ws.send(JSON.stringify({ type: 'nick-change-error', message: 'Bu nick zaten kullanılıyor.' }));
            return;
          }

          const oldUsername = user.username;
          user.username = newUsername;

          // Kullanıcıya onay
          ws.send(JSON.stringify({
            type: 'nick-changed',
            userId,
            oldUsername,
            newUsername,
            you: true
          }));

          // Tüm bağlı kullanıcılara haber ver
          const broadcast = JSON.stringify({
            type: 'nick-changed',
            userId,
            oldUsername,
            newUsername,
            you: false
          });
          connectedUsers.forEach((u) => {
            if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(broadcast);
            }
          });

          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        // === VOICE CHANGER (Admin only) ===
        // Admin sesini değiştirdi — odadakilere haber ver (UI indicator için)
        case 'voice-effect-change': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          // Sadece admin voice changer kullanabilir
          if (user.role !== 'admin') {
            ws.send(JSON.stringify({ type: 'admin-error', message: 'Ses değiştirici sadece adminler içindir!' }));
            return;
          }
          const preset = (message.preset || 'normal').toString().substring(0, 30);
          user.voiceEffect = preset;
          if (user.currentRoom && rooms[user.currentRoom]) {
            const payload = JSON.stringify({
              type: 'voice-effect-change',
              userId: userId,
              username: user.username,
              preset: preset
            });
            rooms[user.currentRoom].users.forEach((u) => {
              if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(payload);
              }
            });
          }
          break;
        }

        case 'admin-login': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          // ADMIN_PASSWORD env var'dan oku; yoksa fallback 'admin123' (sadece geliştirme için)
          const adminPwd = process.env.ADMIN_PASSWORD || 'admin123';
          if (message.password === adminPwd) {
            user.role = 'admin';
            ws.send(JSON.stringify({ type: 'admin-success' }));
            broadcastRoomUpdate();
            broadcastOnlineUsers();
          } else {
            ws.send(JSON.stringify({ type: 'admin-error', message: 'Hatalı şifre!' }));
          }
          break;
        }

        case 'join-room': {
          const user = connectedUsers.get(userId);
          if (!user) return;

          // Önceki odadan ayrıl
          if (user.currentRoom && rooms[user.currentRoom]) {
            // EĞER MÜZİK PAYLAŞIYORDUYSA — eski odaya music-stop yayınla!
            if (user.isSharingMusic) {
              broadcastMusicStop(rooms[user.currentRoom], userId, user.username);
              user.isSharingMusic = false;
              user.musicTrackName = '';
              user.musicVideoId = '';
            }
            rooms[user.currentRoom].users.delete(userId);
            // Odadaki diğer kullanıcılara ayrılma bildir
            rooms[user.currentRoom].users.forEach((otherUser) => {
              if (otherUser.ws.readyState === WebSocket.OPEN) {
                otherUser.ws.send(JSON.stringify({
                  type: 'peer-left',
                  userId: userId,
                  username: user.username
                }));
              }
            });
          }

          const roomId = message.roomId;
          const attemptPassword = message.password || '';
          if (!rooms[roomId]) return;

          // Şifre kontrolü (Adminler şifresiz girebilir)
          if (rooms[roomId].isLocked && user.role !== 'admin' && rooms[roomId].password !== attemptPassword) {
            ws.send(JSON.stringify({ type: 'room-join-error', message: 'Hatalı oda şifresi!' }));
            return;
          }

          // Odadaki mevcut kullanıcılara yeni kullanıcıyı bildir
          rooms[roomId].users.forEach((otherUser) => {
            if (otherUser.ws.readyState === WebSocket.OPEN) {
              otherUser.ws.send(JSON.stringify({
                type: 'peer-joined',
                userId: userId,
                username: user.username
              }));
            }
          });

          user.currentRoom = roomId;
          // Ses Hırsızı için rastgele voice signature (-6 to +6 semitones)
          if (user.voiceSignature === undefined) {
            user.voiceSignature = Math.floor(Math.random() * 13) - 6;
          }
          rooms[roomId].users.set(userId, user);

          // Yeni kullanıcıya odadaki mevcut kullanıcıları bildir
          const existingUsers = Array.from(rooms[roomId].users.values())
            .filter(u => u.id !== userId)
            .map(u => ({ id: u.id, username: u.username }));

          ws.send(JSON.stringify({
            type: 'room-joined',
            roomId,
            existingUsers
          }));

          // === YENİ KATILANA MEVCUT MÜZİK DURUMUNU BİLDİR ===
          // Eğer odada şu an çalan bir DJ varsa, yeni katılan kullanıcıya da music-start gönder
          if (rooms[roomId].currentDjId && rooms[roomId].currentVideoId) {
            // DJ'yi bul
            const djUser = connectedUsers.get(rooms[roomId].currentDjId);
            const djName = djUser ? djUser.username : 'DJ';
            ws.send(JSON.stringify({
              type: 'music-start',
              djId: rooms[roomId].currentDjId,
              djName: djName,
              trackName: rooms[roomId].currentTrackName || 'Müzik',
              youtubeVideoId: rooms[roomId].currentVideoId,
              isPlaying: true,
              currentTime: 0
            }));
          }

          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        case 'leave-room': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;

          const roomId = user.currentRoom;
          if (rooms[roomId]) {
            // EĞER MÜZİK PAYLAŞIYORDUYSA — music-stop yayınla!
            if (user.isSharingMusic) {
              broadcastMusicStop(rooms[roomId], userId, user.username);
              user.isSharingMusic = false;
              user.musicTrackName = '';
              user.musicVideoId = '';
            }
            rooms[roomId].users.delete(userId);
            rooms[roomId].users.forEach((otherUser) => {
              if (otherUser.ws.readyState === WebSocket.OPEN) {
                otherUser.ws.send(JSON.stringify({
                  type: 'peer-left',
                  userId: userId,
                  username: user.username
                }));
              }
            });
          }

          user.currentRoom = null;
          ws.send(JSON.stringify({ type: 'room-left' }));
          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          // WebRTC sinyallerini hedef kullanıcıya ilet
          const targetUser = connectedUsers.get(message.targetId);
          if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
              type: message.type,
              senderId: userId,
              senderName: connectedUsers.get(userId)?.username,
              data: message.data
            }));
          }
          break;
        }

        case 'toggle-mute': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          user.isMuted = message.isMuted;
          broadcastRoomUpdate();
          break;
        }

        case 'toggle-deafen': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          user.isDeafened = message.isDeafened;
          user.isMuted = message.isDeafened ? true : user.isMuted;
          broadcastRoomUpdate();
          break;
        }

        case 'chat-message': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const chatMsg = JSON.stringify({
            type: 'chat-message',
            userId: userId,
            username: user.username,
            color: user.color,
            message: message.message.substring(0, 500),
            timestamp: Date.now()
          });
          room.users.forEach((u) => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(chatMsg);
            }
          });
          break;
        }

        case 'speaking': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const speakRoom = rooms[user.currentRoom];
          if (!speakRoom) return;
          const speakMsg = JSON.stringify({
            type: 'speaking',
            userId: userId,
            isSpeaking: message.isSpeaking
          });
          speakRoom.users.forEach((u) => {
            if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(speakMsg);
            }
          });
          break;
        }

        // --- ADMIN KOMUTLARI ---
        case 'admin-clear-chat': {
          const adminUser = connectedUsers.get(userId);
          if (!adminUser || adminUser.role !== 'admin' || !adminUser.currentRoom) return;

          const room = rooms[adminUser.currentRoom];
          if (!room) return;
          
          const clearMsg = JSON.stringify({ type: 'clear-chat' });
          room.users.forEach((u) => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(clearMsg);
            }
          });
          break;
        }

        case 'admin-kick': {
          const adminUser = connectedUsers.get(userId);
          if (!adminUser || adminUser.role !== 'admin') return;
          
          const targetUser = connectedUsers.get(message.targetId);
          if (targetUser) {
            // Kick mesajı gönder
            if (targetUser.ws.readyState === WebSocket.OPEN) {
              targetUser.ws.send(JSON.stringify({ type: 'kicked', message: 'Bir yönetici tarafından sunucudan atıldınız.' }));
              // targetUser bağlantısını kapat (close eventi otomatik temizlik yapar)
              setTimeout(() => targetUser.ws.close(), 500);
            }
          }
          break;
        }

        case 'admin-set-room-password': {
          const adminUser = connectedUsers.get(userId);
          if (!adminUser || adminUser.role !== 'admin') return;
          
          const targetRoomId = message.roomId;
          const newPassword = message.password || '';
          
          if (rooms[targetRoomId]) {
            rooms[targetRoomId].isLocked = !!newPassword;
            rooms[targetRoomId].password = newPassword;
            saveRooms();
            broadcastRoomUpdate();
          }
          break;
        }

        case 'admin-create-room': {
          const adminUser = connectedUsers.get(userId);
          if (!adminUser || adminUser.role !== 'admin') return;
          
          const newRoomId = message.roomId;
          const newRoomName = message.roomName;
          const newRoomIcon = message.roomIcon || '📌';
          const newPassword = message.password || '';

          if (newRoomId && newRoomName && !rooms[newRoomId]) {
            rooms[newRoomId] = {
              name: newRoomName,
              icon: newRoomIcon,
              isLocked: !!newPassword,
              password: newPassword,
              users: new Map()
            };
            saveRooms();
            broadcastRoomUpdate();
          }
          break;
        }

        case 'admin-delete-room': {
          const adminUser = connectedUsers.get(userId);
          if (!adminUser || adminUser.role !== 'admin') return;

          const roomIdToDelete = message.roomId;
          // Temel 4 odayı silmeyi engelleyelim
          const defaultRooms = ['genel', 'oyun', 'muzik', 'chill'];
          if (defaultRooms.includes(roomIdToDelete)) {
             ws.send(JSON.stringify({ type: 'admin-error', message: 'Varsayılan odalar silinemez!' }));
             return;
          }

          if (rooms[roomIdToDelete]) {
            // Odadaki kullanıcıları kickle veya çıkar
            rooms[roomIdToDelete].users.forEach((u) => {
               if (u.ws.readyState === WebSocket.OPEN) {
                 u.ws.send(JSON.stringify({ type: 'kicked', message: 'Oda yönetici tarafından kapatıldı.' }));
               }
               u.currentRoom = null;
            });
            delete rooms[roomIdToDelete];
            saveRooms();
            broadcastRoomUpdate();
          }
          break;
        }

        case 'update-color': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          user.color = message.color;
          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        // === EĞLENCE ÖZELLİKLERİ (FUN FEATURES) ===

        // 1. FISILTİ MODU — sadece hedef kullanıcıya relay
        case 'whisper-target': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const targetUser = connectedUsers.get(message.targetId);
          if (!targetUser) return;
          // Hedefe: "X sana fısıldıyor"
          targetUser.ws.send(JSON.stringify({
            type: 'whisper-target',
            fromUserId: userId,
            fromUsername: user.username,
            toUserId: message.targetId
          }));
          // Odaya bildir (görsel indikator için)
          if (rooms[user.currentRoom]) {
            const notify = JSON.stringify({
              type: 'whisper-notify',
              fromUserId: userId,
              fromUsername: user.username,
              toUserId: message.targetId,
              toUsername: targetUser.username
            });
            rooms[user.currentRoom].users.forEach(u => {
              if (u.id !== userId && u.id !== message.targetId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(notify);
              }
            });
          }
          break;
        }

        case 'whisper-stop': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const targetUser = connectedUsers.get(message.targetId);
          if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
              type: 'whisper-stop',
              fromUserId: userId
            }));
          }
          if (rooms[user.currentRoom]) {
            const notify = JSON.stringify({
              type: 'whisper-stop-notify',
              fromUserId: userId
            });
            rooms[user.currentRoom].users.forEach(u => {
              if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(notify);
              }
            });
          }
          break;
        }

        // 2. VOICE ROULETTE — odaya broadcast
        case 'voice-roulette-start': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'voice-roulette-start',
            userId: userId,
            username: user.username,
            preset: message.preset || 'robot',
            duration: message.duration || 60
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          break;
        }

        // 3. HAVAİ EMOJI REAKSİYONU — odaya broadcast
        case 'emoji-reaction': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'emoji-reaction',
            fromUserId: userId,
            fromUsername: user.username,
            toUserId: message.toUserId,
            emoji: (message.emoji || '🔥').substring(0, 10)
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          break;
        }

        // 4. AMBIENT SOUND — admin-only, odaya broadcast
        case 'ambient-change': {
          const user = connectedUsers.get(userId);
          if (!user || user.role !== 'admin' || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'ambient-change',
            mode: (message.mode || 'off').substring(0, 20)
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          break;
        }

        // 5. PARTI KONFETI — odaya broadcast
        case 'party-confetti': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'party-confetti',
            userId: userId,
            username: user.username
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
          break;
        }

        // === ÇILGIN FIKIRLER ===

        // 6. SES HIRSIZI
        case 'voice-steal': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const targetUser = connectedUsers.get(message.targetId);
          if (!targetUser) return;
          ws.send(JSON.stringify({
            type: 'voice-steal-apply',
            targetId: message.targetId,
            targetUsername: targetUser.username,
            voiceSignature: targetUser.voiceSignature || 0,
            duration: 30
          }));
          if (rooms[user.currentRoom]) {
            const notify = JSON.stringify({
              type: 'voice-steal-notify',
              fromUserId: userId,
              fromUsername: user.username,
              toUserId: message.targetId,
              toUsername: targetUser.username
            });
            rooms[user.currentRoom].users.forEach(u => {
              if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(notify);
              }
            });
          }
          break;
        }

        case 'voice-steal-stop': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          if (rooms[user.currentRoom]) {
            const notify = JSON.stringify({
              type: 'voice-steal-stop-notify',
              fromUserId: userId
            });
            rooms[user.currentRoom].users.forEach(u => {
              if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) {
                u.ws.send(notify);
              }
            });
          }
          break;
        }

        // 7. MAFIA OYUNU
        case 'mafia-start': {
          const user = connectedUsers.get(userId);
          if (!user || user.role !== 'admin' || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const playerIds = Array.from(room.users.keys());
          if (playerIds.length < 4) {
            ws.send(JSON.stringify({ type: 'mafia-error', message: 'En az 4 oyuncu gerekli!' }));
            return;
          }
          const numMafia = playerIds.length >= 8 ? 2 : 1;
          const roles = [];
          for (let i = 0; i < numMafia; i++) roles.push('mafia');
          roles.push('doctor');
          if (playerIds.length >= 5) roles.push('police');
          while (roles.length < playerIds.length) roles.push('villager');
          for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
          }
          const players = playerIds.map((pid, i) => ({
            id: pid,
            username: room.users.get(pid).username,
            role: roles[i],
            alive: true
          }));
          room.mafiaGame = {
            active: true,
            phase: 'night',
            day: 1,
            players: players,
            nightActions: {},
            votes: {},
            nightDeadline: Date.now() + 30000
          };
          players.forEach(p => {
            const u = room.users.get(p.id);
            if (u && u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(JSON.stringify({
                type: 'mafia-role',
                role: p.role,
                day: 1,
                phase: 'night'
              }));
              if (p.role === 'mafia') {
                const otherMafia = players.filter(x => x.role === 'mafia' && x.id !== p.id).map(x => x.username);
                if (otherMafia.length > 0) {
                  u.ws.send(JSON.stringify({
                    type: 'mafia-info',
                    message: '🦇 Mafya arkadaşların: ' + otherMafia.join(', ')
                  }));
                }
              }
            }
          });
          const stateMsg = JSON.stringify({
            type: 'mafia-state',
            phase: 'night',
            day: 1,
            players: players.map(p => ({ id: p.id, username: p.username, alive: p.alive })),
            deadline: room.mafiaGame.nightDeadline
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) u.ws.send(stateMsg);
          });
          setTimeout(() => {
            if (room.mafiaGame && room.mafiaGame.active && room.mafiaGame.phase === 'night') {
              endMafiaNight(room);
            }
          }, 30000);
          break;
        }

        case 'mafia-night-action': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room || !room.mafiaGame || room.mafiaGame.phase !== 'night') return;
          const player = room.mafiaGame.players.find(p => p.id === userId && p.alive);
          if (!player) return;
          room.mafiaGame.nightActions[userId] = {
            targetId: message.targetId,
            action: player.role
          };
          const aliveByRole = {};
          room.mafiaGame.players.filter(p => p.alive).forEach(p => {
            aliveByRole[p.role] = (aliveByRole[p.role] || 0) + 1;
          });
          const submitted = Object.keys(room.mafiaGame.nightActions);
          const expected = (aliveByRole['mafia'] || 0) + (aliveByRole['doctor'] || 0) + (aliveByRole['police'] || 0);
          if (submitted.length >= expected) {
            endMafiaNight(room);
          }
          break;
        }

        case 'mafia-vote': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room || !room.mafiaGame || room.mafiaGame.phase !== 'voting') return;
          const player = room.mafiaGame.players.find(p => p.id === userId && p.alive);
          if (!player) return;
          room.mafiaGame.votes[userId] = message.targetId;
          const aliveCount = room.mafiaGame.players.filter(p => p.alive).length;
          if (Object.keys(room.mafiaGame.votes).length >= aliveCount) {
            endMafiaVoting(room);
          }
          break;
        }

        case 'mafia-stop': {
          const user = connectedUsers.get(userId);
          if (!user || user.role !== 'admin' || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (room && room.mafiaGame) {
            room.mafiaGame.active = false;
            const endMsg = JSON.stringify({ type: 'mafia-end', reason: 'admin-iptal' });
            room.users.forEach(u => {
              if (u.ws.readyState === WebSocket.OPEN) u.ws.send(endMsg);
            });
            delete room.mafiaGame;
          }
          break;
        }

        // 8. UZAY YARISI
        case 'space-race-start': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const players = Array.from(room.users.values()).map(u => ({
            id: u.id, username: u.username, color: u.color || '#7C5CFF', progress: 0
          }));
          const payload = JSON.stringify({
            type: 'space-race-start',
            starterId: userId,
            starterName: user.username,
            players: players,
            duration: 60
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) u.ws.send(payload);
          });
          setTimeout(() => {
            if (rooms[user.currentRoom]) {
              const endPayload = JSON.stringify({ type: 'space-race-end' });
              rooms[user.currentRoom].users.forEach(u => {
                if (u.ws.readyState === WebSocket.OPEN) u.ws.send(endPayload);
              });
            }
          }, 60000);
          break;
        }

        case 'space-race-progress': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;
          const payload = JSON.stringify({
            type: 'space-race-progress',
            userId: userId,
            username: user.username,
            progress: Math.max(0, Math.min(100, message.progress || 0)),
            color: user.color || '#7C5CFF'
          });
          room.users.forEach(u => {
            if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) u.ws.send(payload);
          });
          if ((message.progress || 0) >= 100 && !room.raceWinner) {
            room.raceWinner = userId;
            const winPayload = JSON.stringify({
              type: 'space-race-winner',
              userId: userId,
              username: user.username
            });
            room.users.forEach(u => {
              if (u.ws.readyState === WebSocket.OPEN) u.ws.send(winPayload);
            });
            setTimeout(() => { if (room) room.raceWinner = null; }, 5000);
          }
          break;
        }

      }
    } catch (err) {
      console.error('Mesaj işleme hatası:', err);
    }
  });

  ws.on('close', () => {
    if (userId) {
      const user = connectedUsers.get(userId);
      if (user && user.currentRoom && rooms[user.currentRoom]) {
        // EĞER MÜZİK PAYLAŞIYORDUYSA — odadakilere music-stop yayınla!
        if (user.isSharingMusic) {
          broadcastMusicStop(rooms[user.currentRoom], userId, user.username);
        }
        rooms[user.currentRoom].users.delete(userId);
        rooms[user.currentRoom].users.forEach((otherUser) => {
          if (otherUser.ws.readyState === WebSocket.OPEN) {
            otherUser.ws.send(JSON.stringify({
              type: 'peer-left',
              userId: userId,
              username: user?.username
            }));
          }
        });
      }
      connectedUsers.delete(userId);
      broadcastRoomUpdate();
      broadcastOnlineUsers();
    }
  });
});

// Heartbeat: Her 25 saniyede ping gönder, ölü bağlantıları temizle
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎙️  Sesli Sohbet Sunucusu çalışıyor!`);
  console.log(`📡  Adres: http://localhost:${PORT}`);
  console.log(`🌐  Sağlık kontrolü: http://localhost:${PORT}/health`);
  console.log(`\n💡  Heartbeat aktif: Bağlantılar her 25 saniyede kontrol ediliyor.\n`);
});

// =========================================
// MAFIA OYUNU — yardımcı fonksiyonlar
// =========================================

function endMafiaNight(room) {
  if (!room.mafiaGame || room.mafiaGame.phase !== 'night') return;
  const actions = room.mafiaGame.nightActions;

  // Mafya öldürme hedefi
  const mafiaAction = Object.values(actions).find(a => a.action === 'mafia');
  const doctorAction = Object.values(actions).find(a => a.action === 'doctor');
  const policeAction = Object.values(actions).find(a => a.action === 'police');

  let killedPlayer = null;
  let saved = false;

  if (mafiaAction && mafiaAction.targetId) {
    // Doktor aynı kişiyi kurtardı mı?
    if (doctorAction && doctorAction.targetId === mafiaAction.targetId) {
      saved = true;
    } else {
      killedPlayer = room.mafiaGame.players.find(p => p.id === mafiaAction.targetId);
      if (killedPlayer) killedPlayer.alive = false;
    }
  }

  // Polis kontrolü
  if (policeAction && policeAction.targetId) {
    const investigated = room.mafiaGame.players.find(p => p.id === policeAction.targetId);
    const policeUser = room.users.get(Object.keys(actions).find(k => actions[k].action === 'police'));
    if (investigated && policeUser) {
      const isMafia = investigated.role === 'mafia';
      policeUser.ws.send(JSON.stringify({
        type: 'mafia-info',
        message: '🔍 ' + investigated.username + ' ' + (isMafia ? '🦇 MAFYA!' : 'masum')
      }));
    }
  }

  // Gece sonu bildirimi
  const nightEndMsg = JSON.stringify({
    type: 'mafia-night-end',
    killedUserId: killedPlayer ? killedPlayer.id : null,
    killedUsername: killedPlayer ? killedPlayer.username : null,
    killedRole: killedPlayer ? killedPlayer.role : null,
    saved: saved,
    day: room.mafiaGame.day
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(nightEndMsg);
  });

  // Kazanma kontrolü
  const winner = checkMafiaWin(room);
  if (winner) {
    endMafiaGame(room, winner);
    return;
  }

  // Gündüz fazına geç
  room.mafiaGame.phase = 'day';
  room.mafiaGame.day = room.mafiaGame.day; // aynı gün
  room.mafiaGame.dayDeadline = Date.now() + 60000;
  const dayMsg = JSON.stringify({
    type: 'mafia-state',
    phase: 'day',
    day: room.mafiaGame.day,
    players: room.mafiaGame.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })),
    deadline: room.mafiaGame.dayDeadline
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(dayMsg);
  });

  // 60sn sonra voting'e geç
  setTimeout(() => {
    if (room.mafiaGame && room.mafiaGame.active && room.mafiaGame.phase === 'day') {
      startMafiaVoting(room);
    }
  }, 60000);
}

function startMafiaVoting(room) {
  if (!room.mafiaGame) return;
  room.mafiaGame.phase = 'voting';
  room.mafiaGame.votes = {};
  room.mafiaGame.votingDeadline = Date.now() + 30000;
  const voteStartMsg = JSON.stringify({
    type: 'mafia-state',
    phase: 'voting',
    day: room.mafiaGame.day,
    players: room.mafiaGame.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })),
    deadline: room.mafiaGame.votingDeadline
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(voteStartMsg);
  });
  setTimeout(() => {
    if (room.mafiaGame && room.mafiaGame.active && room.mafiaGame.phase === 'voting') {
      endMafiaVoting(room);
    }
  }, 30000);
}

function endMafiaVoting(room) {
  if (!room.mafiaGame || room.mafiaGame.phase !== 'voting') return;

  // Oyları say
  const voteCount = {};
  Object.values(room.mafiaGame.votes).forEach(targetId => {
    if (targetId) {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });

  // En çok oy alanı bul
  let maxVotes = 0;
  let eliminatedId = null;
  for (const [pid, count] of Object.entries(voteCount)) {
    if (count > maxVotes) {
      maxVotes = count;
      eliminatedId = pid;
    }
  }

  let eliminated = null;
  if (eliminatedId && maxVotes > 0) {
    eliminated = room.mafiaGame.players.find(p => p.id === eliminatedId);
    if (eliminated) eliminated.alive = false;
  }

  const voteEndMsg = JSON.stringify({
    type: 'mafia-vote-end',
    eliminatedUserId: eliminated ? eliminated.id : null,
    eliminatedUsername: eliminated ? eliminated.username : null,
    eliminatedRole: eliminated ? eliminated.role : null,
    day: room.mafiaGame.day,
    votes: voteCount
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(voteEndMsg);
  });

  // Kazanma kontrolü
  const winner = checkMafiaWin(room);
  if (winner) {
    endMafiaGame(room, winner);
    return;
  }

  // Yeni gece
  room.mafiaGame.day += 1;
  room.mafiaGame.phase = 'night';
  room.mafiaGame.nightActions = {};
  room.mafiaGame.votes = {};
  room.mafiaGame.nightDeadline = Date.now() + 30000;
  const newNightMsg = JSON.stringify({
    type: 'mafia-state',
    phase: 'night',
    day: room.mafiaGame.day,
    players: room.mafiaGame.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })),
    deadline: room.mafiaGame.nightDeadline
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(newNightMsg);
  });
  setTimeout(() => {
    if (room.mafiaGame && room.mafiaGame.active && room.mafiaGame.phase === 'night') {
      endMafiaNight(room);
    }
  }, 30000);
}

function checkMafiaWin(room) {
  if (!room.mafiaGame) return null;
  const alivePlayers = room.mafiaGame.players.filter(p => p.alive);
  const aliveMafia = alivePlayers.filter(p => p.role === 'mafia').length;
  const aliveVillagers = alivePlayers.length - aliveMafia;
  if (aliveMafia === 0) return 'villagers';
  if (aliveMafia >= aliveVillagers) return 'mafia';
  return null;
}

function endMafiaGame(room, winner) {
  if (!room.mafiaGame) return;
  const endMsg = JSON.stringify({
    type: 'mafia-game-end',
    winner: winner,
    players: room.mafiaGame.players.map(p => ({ id: p.id, username: p.username, role: p.role, alive: p.alive }))
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(endMsg);
  });
  delete room.mafiaGame;
}

// =========================================
// MÜZİK CLEANUP — DJ ayrılınca otomatik durdur
// =========================================

function broadcastMusicStop(room, djId, djName) {
  if (!room) return;
  // Oda state'ini temizle (bu DJ şu anki aktif DJ ise)
  if (room.currentDjId === djId) {
    room.currentDjId = null;
    room.currentVideoId = '';
    room.currentTrackName = '';
  }
  const payload = JSON.stringify({
    type: 'music-stop',
    djId: djId,
    djName: djName || '',
    reason: 'dj-left'  // Dinleyiciye "DJ ayrıldı" mesajı için
  });
  room.users.forEach(u => {
    if (u.ws.readyState === WebSocket.OPEN) {
      u.ws.send(payload);
    }
  });
  console.log(`[Music] DJ ${djName || djId} ayrıldı, müzik durduruldu (oda: ${room.id || '?'})`);
}
