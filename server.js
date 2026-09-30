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

        // 5. FAL BOTU — akıllı kategori bazlı cevap (keyword matching)
        case 'fal-bot': {
          const user = connectedUsers.get(userId);
          if (!user || !user.currentRoom) return;
          const room = rooms[user.currentRoom];
          if (!room) return;

          // === Cevap kategorileri — her kategori için 12-15 cevap ===
          const falAnswers = {
            // AŞK / İLİŞKİ
            ask: [
              'Kalbin biliyor, sadece duymak istemiyorsun. Cevap: evet ama biraz zamanla.',
              'Yıldızlar aşk konusunda net: içiniz sıcak, cevap EVET.',
              'Bok gibi görünüyor ama temeli sağlam. Bekle, geçecek.',
              'Aşk falında en güvenilmez cevabı verir. Hadi yine iyisin, gözün kapalı git.',
              'Sana iyi gelmiyor. Bunu fala değil terapiste sor.',
              'Eski sevgili geri mi gelir? Fal tutmadıysa gelir, tuttuysa gelmez. Karma bu.',
              'Yeni biri geliyor ama o da işe yaramaz. Yine de dene, tecrübedir.',
              'Flört aşaması bitsin, seni oyuncak yapıyor. Çekil.',
              'İki kalp birleşmeye yakın. Risk al, EVET.',
              'Sevgili mi arkadaş mı? İkisi de olmaz. Boşver, gez.',
              'Evlenme falan sorma, çok erken. Önce bir tanış.',
              'Aşk fal tutmadı bu sefer. Kahvende kalp çıktı, umut var.',
              'Kalbin temiz, karşındaki de temiz. Cevap: beklemeye değer.',
              'Sana yaranmak istiyor, gerçekten seviyor. EVET.',
              'Fısıltıları duyuyorum: dudaklar çok yakın, gerçek öpücük yakın.'
            ],
            // İŞ / KARİYER
            is: [
              'İş konusunda yıldızlar tutuyor. Sorun yok, git bare.',
              'Patronun gözünde büyüdün. Terfi kapıda, ama yine de iyi davran.',
              'İşten çıkma yok falda. Sadece biraz daha çalış, güvendesin.',
              'Mülakat için: hazırlıklı ol. Sonuç: başarı yakın.',
              'Yeni iş teklifi gelecek ama mezat eder. Acele etme.',
              'Şu anki işin seni boğuyor. Fal: değişim iyi gelir.',
              'Kariyer falında bulutlu. 3 ay sonra netleşir.',
              'Patron kötü biri değil, sadece baskılı. Sabreden için ödül var.',
              'İş değiştirme zamanı geldi. Fal kesin evet diyor.',
              'Çalışma arkadaşın seni çekemiyor. Mesafe koy, sorun olmaz.',
              'Terfi için biraz daha sabret. Sonuç: alırsın.',
              'Yeni bir sektör senin için. Düşün.',
              'Patronun gözdesi sensin. Doğru yoldasın.',
              'Maaş pazarlığı yap. Fal: kazanırsın.',
              'İşe gömülmekten sosyal hayatın ölmüş. Fal: dengeyi kur.'
            ],
            // PARA / ZENGİNLİK
            para: [
              'Para geliyor ama kapıda takılıyor. Bekle, açılır.',
              'Borcun ödenecek ama yeni borç da gelmesin diye dua et.',
              'Yatırım yapma zamanı. Fal: risk ama değer.',
              'Para falında bol yeşil yaprak var. Şanslısın.',
              'Kazanacağın para harcayacağın parayı geçer. Sevin.',
              'Bahis oynama. Fal: kaybedersin. Cüzdanını koru.',
              'Hediye bekliyor. Birinden sürpriz para gelebilir.',
              'Borç veren olarak kalma, verdiğin geri gelmez.',
              'Kısmet kapalı bu ay. Gelecek ay açılır.',
              'Loto oynama. Fal: kayıp %99.',
              'Yatırım yapacak paran varsa, gayrimenkul. Fal: kazanç.',
              'Para falı net: kazanıyorsun, sadece biraz sabırlı ol.',
              'Birinden borç almak yerine, daha çok çalış. Fal bunu söylüyor.',
              'Yeni bir gelir kaynağı geliyor. Haberin olsun.',
              'Cüzdanın şişecek, ama harcama huyun da artacak. Dikkat.'
            ],
            // OKUL / SINAV
            okul: [
              'Sınav falın: geçersin. Ama az daha çalış.',
              'Hoca seni seviyor, notun güzel olur. Rahat ol.',
              'Geçme falı tutuyor. Az bir gayret yeter.',
              'Kopya çekme. Fal: yakalanırsın, rezil olursun.',
              'Sınava hazırsın. Sonuç: başarılı.',
              'Üniversite seçiminde zorlanıyorsun. Fal: ilk tercih doğru.',
              'Tez falın: biraz daha araştır, geçer.',
              'Diploma falın: alınacak, ama biraz zaman.',
              'Okul falında bulutlu. 2 ay sonra net.',
              'Hocayla aran iyi, notun da iyi. Sorun yok.',
              'Sınav için fal tutmadı. Belki az daha çalış.',
              'Geç kalma riski var. Erken başla.',
              'Sonuç falında: sarı yaprak, yani geçer. Rahat ol.',
              'Sınava son gün çalışma. Fal: bilgi yeterli değil.',
              'Diploma alacaksın, ama biraz daha sabırlı ol.'
            ],
            // SEYAHAT / TATİL
            seyahat: [
              'Yurt dışı falın: vize gelir. Tatil güzel olur.',
              'Tatil planı yap. Fal: mutlu dönersin.',
              'Uçak biletini al. Fırsat kaçmadan.',
              'Seyahat falında yollar açık. Güzel bir yolculuk.',
              'Yurt içi tatil daha iyi. Fal: bütçe dostu.',
              'Seyahat için doğru zaman. Fal: EVET.',
              'Pasaport sorun olmayacak. Fal: iş kolay.',
              'Tatil için biriyle gitmen daha iyi olur. Fal: beraberlik var.',
              'Seyahat falında gecikme var. Tarih değiştir.',
              'Yeni bir şehir senin için keşif. Fal: EVET.',
              'Tatilde para harcama huyun artacak. Fal: tedbir.',
              'Seyahat falı net: gidilecek. Geri dönmek istemeyeceksin.',
              'Tatil için beklemek zorundasın. 3 ay sonra mümkün.',
              'Yurt dışı falında vize zorlanıyor. Yurt içi seç.',
              'Tatil iyi gelir. Fal: zihin açılır.'
            ],
            // SAĞLIK
            saglik: [
              'Sağlık falında yeşil yaprak var. Şifalı, rahat ol.',
              'Biraz dinlen. Fal: yorgunsun, dur.',
              'Spor falın: başla, faydası büyük olur.',
              'Diyet falı: tutar. Azimlisin, başarılı olursun.',
              'Sağlık falında bulut var. Doktora görün.',
              'Uyku falın: az uyuyorsun. Düzelt.',
              'Stresten kaç. Fal: hastalık kapıda.',
              'Hastalık geçici. Fal: 1 hafta içinde geçer.',
              'Sigarayı bırak. Fal: ciğerler iyi olmayacak.',
              'Kilo falın: biraz azalsan iyi olur. Spor başla.',
              'Sağlık falı: iyiye gidiyor. Devam et.',
              'Biraz ara ver, dinlen. Fal: yorgunluk var.',
              'Diyet falın: 2 ayda sonuç. Sabırlı ol.',
              'Spora başla. Fal: zinde olursun.',
              'Su iç. Fal: dehidrasyon tehlikesi.'
            ],
            // GELECEK / KADER (genel)
            gelecek: [
              'Gelecek falında parlak yıldızlar var. Mutlu olursun.',
              'Kader yolu çiçekli. Sabırla yürü.',
              'Yeni bir dönem başlıyor. Fal: umutlu.',
              '5 yıl sonra falın: güzel bir hayat. Şimdi zorlan ama değer.',
              'Kısmet falın: bol. Yeter ki sabret.',
              'Fal: önünde üç yol var. Doğru olanı seç.',
              'Gelecek falında umut var. Acele etme.',
              'Bir yıl içinde her şey değişir. Fal: iyilik için.',
              'Kader falın: yazgı. İsyan etme, kabul et.',
              'Fal: umut ışığı görünüyor. Bekle, geliyor.',
              'Kısmetin yolda. Fal: yakında.',
              'Gelecek falında bulut açılıyor. Şanslısın.',
              'Fal: önünde büyük fırsat. Kaçırma.',
              'Kısmet falın: iki kapı var. Hangisini açsan iyi.',
              'Gelecek falında umutlu bir kış. Bahar güzel olur.'
            ],
            // AİLE
            aile: [
              'Anne falın: sağlığı yerinde. Ona sarıl.',
              'Baba falın: seni düşünüyor. Ara.',
              'Kardeş falın: küslük var. Barış.',
              'Aile falında bereket var. Bereketli yıllar.',
              'Dede falın: ışık var, sana hayır dua ediyor.',
              'Aile falında umutlu bulut. Sorunlar geçici.',
              'Aile büyüyecek. Fal: yeni bir üye geliyor.',
              'Aile falın: beraberlik güçlü. Devam et.',
              'Anne-baba için fal: rahatlarlar. Sorun yok.',
              'Kardeş için fal: yardım etmen gerekir.',
              'Aile falında mutluluk. Sürer.',
              'Aile sorunları bitecek. Fal: 1 ay içinde.',
              'Fal: aile toplantısı iyi gelir. Düzenle.',
              'Aile falında yıldız parlak. Mutlu dönem.',
              'Fal: aile için sürpriz güzel haber var.'
            ],
            // ŞANS / TALİH
            sans: [
              'Şans falında açık kapı var. Yürü.',
              'Talih kuşu başında. Bekle, fırsat gelecek.',
              'Şans falı: kısmetin var, ama azim de göster.',
              'Bahis falı: küçük kazanır, büyük kaybeder.',
              'Şans falında yıldız kayıyor. Yakala fırsatı.',
              'Çekiliş falın: %50 şans. Boşver, yine de gir.',
              'Şans falı: biraz şanssızsın bu ay. Gelecek ay iyi.',
              'Fal: beklenmedik bir haber. Şanslı.',
              'Şans falında balık var. Yani: para yok, huzur var.',
              'Talih falın: 2 ay içinde güzel gelişme.',
              'Şans falında kuş uçar. Hediye gelebilir.',
              'Fal: küçük şanslar çok, büyük şans az. Değerlendir.',
              'Şans falında umut var. Sabırlı ol.',
              'Fal: oyun oynama, kaybedersin. Mantıklı ol.',
              'Şans falın: biraz daha bekle. Yakında.'
            ],
            // GENEL CEVAPLAR (fallback)
            genel: [
              'Kesinlikle evet, başka yolu yok.',
              'Hayır, hiç sanmıyorum. Belki başka hayatında.',
              'Belki... ama büyük ihtimalle değil. Fal işte, garantisi yok.',
              'Tabii ki! Ne bekliyordun ki?',
              'İmzalar tatlı, kalbin temiz, cevap: evet.',
              'Sakla saklayabileceğin şeyi, fal da tutmadı bunu.',
              'Yıldızlar diyor ki: bekle, sabret, gelecek.',
              'Hocam bu fal tutmuyor gibi, tekrar dene.',
              'Ay dede kafayı üzmüş, cevap bulanık.',
              'Fal değil bu, muamma. Cevap: 42.',
              'Bana kalırsa yapma, ama sen bilirsin.',
              'Evet ama bir şartla: çoraplarını ters giyeceksin.',
              'Kediler de evet diyor, kuşlar da. Tam konsensüs var.',
              'Geçen hafta falıma baktım, tam tersini söyledi. İnanma bana.',
              'Kader yolu garip, ama bu seferlik evet diyorum.',
              'Kafam karıştı, fal biraz dumanlı bugün. Soruyu netle.',
              'Açık söyle: EVET, derhal, hemen şimdi.',
              'Karar veremedim, kahveyi içip tekrar gel.',
              'Çok güzel bir soru, berbat bir cevap: hayır.',
              'Son sözcük bende: KESİN evet. Gözünü kör edeyim, yine evet.',
              'Beklemedim bu soruyu. Cevap beklenmedik: belki.',
              'Fal tutmadı, telve bulanık. Sonra tekrar sor.',
              'Yıldızlar yorgun bugün. Net cevap veremiyor.',
              'Kahve falında balık çıktı. Yani: hayır, ama tatlı hayır.',
              'Gelecek muallâk, ama bence evet.',
              'Fal bitti, cevap yok. Yeni kahve iç, tekrar dene.',
              'Sorduğun sorunun cevabı yok falda. Ama: iyice bekle.',
              'Acele etme. Fal: olgunlaşınca gelir.',
              'Kısmet falında kapı çalınıyor. Aç.',
              'Telve düştü, cevap: evet ama geç olur.',
              'Fal tutmadı bu sefer. İstersen 5 dk sonra tekrar dene.'
            ]
          };

          // === Keyword → kategori eşleştirme ===
          const falKeywords = {
            ask: ['aşk', 'ask', 'sev', 'evlen', 'sevgili', 'flört', 'flort', 'kalp', 'sevgi', 'eşi', 'esi', 'erkek arkadaş', 'kız arkadaş', 'partner', 'relationship', 'love', 'ex', 'taze', 'flört', 'hoşlan', 'hoslan', 'aşık', 'asik', 'sevda', 'gönül', 'gonul', 'romantik'],
            is: ['iş', 'is', 'meslek', 'kariyer', 'mülakat', 'mulakat', 'terfi', 'patron', 'işten', 'isten', 'çıkma', 'cikma', 'maaş', 'maas', 'kariyer', 'patron', 'şirket', 'sirket', 'çalış', 'calis', 'proje', 'deadline', 'başarı', 'basari', 'ödül', 'odul', 'task', 'görev', 'gorev', 'meeting', 'toplantı', 'toplanti', 'boss'],
            para: ['para', 'zengin', 'kredi', 'borç', 'borc', 'bahis', 'lotto', 'lottery', 'yatırım', 'yatirim', 'kazanç', 'kazanc', 'hediye', 'banka', 'faiz', 'maaş', 'maas', 'kira', 'borçlu', 'borclu', 'bütçe', 'butce', 'finans', 'para kazan', 'zenginleş', 'zenginles', 'kazan', 'mülk', 'mulk', 'araba', 'ev'],
            okul: ['sınav', 'sinav', 'okul', 'üniversite', 'universite', 'üniversite', 'diploma', 'hoca', 'geçme', 'gecme', 'ders', 'ödev', 'odev', 'öğrenci', 'ogrenci', 'öğretmen', 'ogretmen', 'mezun', 'final', 'vize', 'ortaokul', 'lise', 'master', 'tez', 'doktora', 'üniversite', 'kayıt', 'kayit', 'devamsızlık', 'devamsizlik'],
            seyahat: ['seyahat', 'tatil', 'uçak', 'ucak', 'yurt dışı', 'yurt disi', 'vize', 'pasaport', 'gezi', 'tur', 'bilet', 'otel', 'otel', 'kampa', 'kaçak', 'kacak', 'yerli', 'yabancı', 'yabanci', 'şehir', 'sehir', 'ülke', 'ulke', 'tren', 'metro', 'metro', 'kara', 'deniz', 'kruvaziyer', 'cruise', 'tour'],
            saglik: ['hasta', 'saglik', 'sağlık', 'kilo', 'diyet', 'spor', 'sigara', 'içki', 'icki', 'uyku', 'stres', 'yorgun', 'ağrı', 'agri', 'sırt', 'sirt', 'baş ağrı', 'bas agrı', 'bel', 'boyun', 'diş', 'dis', 'göz', 'goz', 'kalp', 'tansiyon', 'şeker', 'seker', 'kolestrol', 'vitamin', 'eklem', 'kas', 'grip', 'nezle'],
            gelecek: ['gelecek', 'kader', 'kısmet', 'kismet', 'şans', 'sans', 'talih', 'yazgı', 'yazgi', 'destan', 'kahraman', 'yarın', 'yarin', 'sonra', '5 yıl', '10 yıl', 'ileri', 'zaman', 'kader', 'mukadderat', 'alın yazısı', 'alin yazisi', 'fortune', 'destiny', 'future', 'life'],
            aile: ['anne', 'baba', 'kardeş', 'kardes', 'aile', 'dede', 'nine', 'teyze', 'amca', 'hala', 'dayı', 'dayi', 'enişte', 'eniste', 'yeğen', 'yegen', 'kuzen', 'evlat', 'torun', 'eş', 'es', 'çocuk', 'cocuk', 'bebek', 'evlat', 'ailece', 'hısımlar', 'akraba'],
            sans: ['şans', 'sans', 'talih', 'bahis', 'lotto', 'lottery', 'çekiliş', 'cekilis', 'kumar', 'casino', 'rulet', 'slot', 'bet', 'bahis', 'tombala', 'piyango', 'piyango', 'kazanma', 'şanslı', 'sansli', 'şansız', 'sansiz', 'talihsiz', 'talihli']
          };

          function falKategoriBul(soru) {
            const lower = soru.toLowerCase();
            let bestCat = null;
            let bestScore = 0;
            for (const [cat, words] of Object.entries(falKeywords)) {
              let score = 0;
              for (const w of words) {
                if (lower.includes(w)) score += 1;
              }
              if (score > bestScore) {
                bestScore = score;
                bestCat = cat;
              }
            }
            return bestCat || 'genel';
          }

          const question = (message.question || 'Genel fal').substring(0, 200);
          const kategori = falKategoriBul(question);
          const cevaplar = falAnswers[kategori] || falAnswers.genel;
          const answer = cevaplar[Math.floor(Math.random() * cevaplar.length)];

          const payload = JSON.stringify({
            type: 'chat-message',
            username: '🔮 Fal Botu',
            color: '#FFD700',
            message: '💬 ' + question + ' → ' + answer + ' <small style="color:#999">[' + kategori + ']</small>',
            timestamp: Date.now()
          });
          room.users.forEach(u => {
            if (u.ws.readyState === WebSocket.OPEN) {
              u.ws.send(payload);
            }
          });
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
