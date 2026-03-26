const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', users: connectedUsers.size });
});

const rooms = {
    'genel': { name: 'Genel', icon: 'speech', users: new Map() },
    'oyun': { name: 'Oyun', icon: 'game', users: new Map() },
    'muzik': { name: 'Muzik', icon: 'music', users: new Map() },
    'chill': { name: 'Chill', icon: 'coffee', users: new Map() }
};

const connectedUsers = new Map();

function broadcastRoomUpdate() {
    const roomData = {};
    for (const [id, room] of Object.entries(rooms)) {
          roomData[id] = {
                  name: room.name,
                  icon: room.icon,
                  users: Array.from(room.users.values()).map(u => ({
                            id: u.id, username: u.username,
                            isMuted: u.isMuted || false, isDeafened: u.isDeafened || false
                  }))
          };
    }
    const message = JSON.stringify({ type: 'room-update', rooms: roomData });
    connectedUsers.forEach((user) => {
          if (user.ws.readyState === WebSocket.OPEN) user.ws.send(message);
    });
}

function broadcastOnlineUsers() {
    const onlineList = Array.from(connectedUsers.values()).map(u => ({
          id: u.id, username: u.username, currentRoom: u.currentRoom || null
    }));
    const message = JSON.stringify({ type: 'online-users', users: onlineList });
    connectedUsers.forEach((user) => {
          if (user.ws.readyState === WebSocket.OPEN) user.ws.send(message);
    });
}

wss.on('connection', (ws) => {
    let userId = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

         ws.on('message', (data) => {
               try {
                       const message = JSON.parse(data);
                       switch (message.type) {
                         case 'join': {
                                     userId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
                                     const user = { id: userId, username: message.username, ws, currentRoom: null, isMuted: false, isDeafened: false };
                                     connectedUsers.set(userId, user);
                                     ws.send(JSON.stringify({ type: 'joined', userId }));
                                     broadcastRoomUpdate(); broadcastOnlineUsers();
                                     break;
                         }
                         case 'join-room': {
                                     const user = connectedUsers.get(userId);
                                     if (!user) return;
                                     if (user.currentRoom && rooms[user.currentRoom]) {
                                                   rooms[user.currentRoom].users.delete(userId);
                                                   rooms[user.currentRoom].users.forEach((o) => {
                                                                   if (o.ws.readyState === WebSocket.OPEN) o.ws.send(JSON.stringify({ type: 'peer-left', userId, username: user.username }));
                                                   });
                                     }
                                     const roomId = message.roomId;
                                     if (!rooms[roomId]) return;
                                     rooms[roomId].users.forEach((o) => {
                                                   if (o.ws.readyState === WebSocket.OPEN) o.ws.send(JSON.stringify({ type: 'peer-joined', userId, username: user.username }));
                                     });
                                     user.currentRoom = roomId;
                                     rooms[roomId].users.set(userId, user);
                                     const existingUsers = Array.from(rooms[roomId].users.values()).filter(u => u.id !== userId).map(u => ({ id: u.id, username: u.username }));
                                     ws.send(JSON.stringify({ type: 'room-joined', roomId, existingUsers }));
                                     broadcastRoomUpdate(); broadcastOnlineUsers();
                                     break;
                         }
                         case 'leave-room': {
                                     const user = connectedUsers.get(userId);
                                     if (!user || !user.currentRoom) return;
                                     const roomId = user.currentRoom;
                                     if (rooms[roomId]) {
                                                   rooms[roomId].users.delete(userId);
                                                   rooms[roomId].users.forEach((o) => {
                                                                   if (o.ws.readyState === WebSocket.OPEN) o.ws.send(JSON.stringify({ type: 'peer-left', userId, username: user.username }));
                                                   });
                                     }
                                     user.currentRoom = null;
                                     ws.send(JSON.stringify({ type: 'room-left' }));
                                     broadcastRoomUpdate(); broadcastOnlineUsers();
                                     break;
                         }
                         case 'offer': case 'answer': case 'ice-candidate': {
                                     const t = connectedUsers.get(message.targetId);
                                     if (t && t.ws.readyState === WebSocket.OPEN) {
                                                   t.ws.send(JSON.stringify({ type: message.type, senderId: userId, senderName: connectedUsers.get(userId)?.username, data: message.data }));
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
                                     const chatMsg = JSON.stringify({ type: 'chat-message', userId, username: user.username, message: message.message.substring(0, 500), timestamp: Date.now() });
                                     room.users.forEach((u) => { if (u.ws.readyState === WebSocket.OPEN) u.ws.send(chatMsg); });
                                     break;
                         }
                         case 'speaking': {
                                     const user = connectedUsers.get(userId);
                                     if (!user || !user.currentRoom) return;
                                     const sr = rooms[user.currentRoom];
                                     if (!sr) return;
                                     const sm = JSON.stringify({ type: 'speaking', userId, isSpeaking: message.isSpeaking });
                                     sr.users.forEach((u) => { if (u.id !== userId && u.ws.readyState === WebSocket.OPEN) u.ws.send(sm); });
                                     break;
                         }
                       }
               } catch (err) { console.error('Error:', err); }
         });

         ws.on('close', () => {
               if (userId) {
                       const user = connectedUsers.get(userId);
                       if (user && user.currentRoom && rooms[user.currentRoom]) {
                                 rooms[user.currentRoom].users.delete(userId);
                                 rooms[user.currentRoom].users.forEach((o) => {
                                             if (o.ws.readyState === WebSocket.OPEN) o.ws.send(JSON.stringify({ type: 'peer-left', userId, username: user?.username }));
                                 });
                       }
                       connectedUsers.delete(userId);
                       broadcastRoomUpdate(); broadcastOnlineUsers();
               }
         });
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
          if (ws.isAlive === false) return ws.terminate();
          ws.isAlive = false; ws.ping();
    });
}, 25000);

wss.on('close', () => { clearInterval(heartbeatInterval); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('SesliChat server running on port ' + PORT);
});
