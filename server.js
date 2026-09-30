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
      }
    } catch (err) {
      console.error('Mesaj işleme hatası:', err);
    }
  });

  ws.on('close', () => {
    if (userId) {
      const user = connectedUsers.get(userId);
      if (user && user.currentRoom && rooms[user.currentRoom]) {
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
