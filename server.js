const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Sağlık kontrolü (Render.com için)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', users: connectedUsers.size });
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
          userId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
          const user = {
            id: userId,
            username: message.username,
            role: 'user', // varsayılan rol
            color: message.color || '#5865F2',
            ws: ws,
            currentRoom: null,
            isMuted: false,
            isDeafened: false
          };
          connectedUsers.set(userId, user);

          ws.send(JSON.stringify({ type: 'joined', userId, role: user.role }));
          broadcastRoomUpdate();
          broadcastOnlineUsers();
          break;
        }

        case 'admin-login': {
          const user = connectedUsers.get(userId);
          if (!user) return;
          if (message.password === 'admin123') { // Basit şifre kontrolü
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
