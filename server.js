const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

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
const rooms = {
  'genel': { name: 'Genel', icon: '💬', users: new Map() },
  'oyun': { name: 'Oyun', icon: '🎮', users: new Map() },
  'muzik': { name: 'Müzik', icon: '🎵', users: new Map() },
  'chill': { name: 'Chill', icon: '☕', users: new Map() }
};

// Tüm bağlı kullanıcılar
const connectedUsers = new Map();

function broadcastRoomUpdate() {
  const roomData = {};
  for (const [id, room] of Object.entries(rooms)) {
    roomData[id] = {
      name: room.name,
      icon: room.icon,
      users: Array.from(room.users.values()).map(u => ({
        id: u.id,
        username: u.username,
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
            ws: ws,
            currentRoom: null,
            isMuted: false,
            isDeafened: false
          };
          connectedUsers.set(userId, user);

          ws.send(JSON.stringify({ type: 'joined', userId }));
          broadcastRoomUpdate();
          broadcastOnlineUsers();
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
          if (!rooms[roomId]) return;

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
