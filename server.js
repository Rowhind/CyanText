const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json({ limit: '5mb' })); // Profil resimleri için limiti artırdık
app.use(express.static(path.join(__dirname, 'public')));

// --- RAM VERİTABANLARI ---
const users = []; 
const friendRequests = []; 
const messagesDB = {}; 
const userSockets = {}; 

function generateUserCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Bu e-posta zaten kayıtlı!' });
    
    // Yeni kullanıcı modeli (Profil ayarları dahil)
    const newUser = { 
        id: Date.now(), name, email, password, code: generateUserCode(), friends: [],
        avatar: null, about: "Merhaba! Ben CyanChat kullanıyorum.", 
        settings: { readReceipts: true, lastSeen: true },
        online: false, lastSeenDate: null
    };
    users.push(newUser);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ success: false, message: 'Hatalı e-posta veya şifre!' });
    
    res.json({ success: true, user: { name: user.name, email: user.email, code: user.code, avatar: user.avatar } });
});

io.on('connection', (socket) => {
    let currentUserCode = null;

    socket.on('userConnected', (userCode) => {
        currentUserCode = userCode;
        userSockets[userCode] = socket.id; 
        
        const user = users.find(u => u.code === userCode);
        if(user) {
            user.online = true; // Çevrimiçi yap
            socket.emit('updateFriendsList', user.friends);
            
            // Arkadaşlarına çevrimiçi olduğunu bildir
            user.friends.forEach(f => {
                if(userSockets[f.code]) io.to(userSockets[f.code]).emit('friendStatusChanged', { code: userCode, online: true });
            });
        }

        const pending = friendRequests.filter(req => req.toCode === userCode);
        socket.emit('incomingFriendRequests', pending);
    });

    // Profil Güncelleme (Resim, Hakkımda, Ayarlar)
    socket.on('updateProfile', (data) => {
        const user = users.find(u => u.code === currentUserCode);
        if(user) {
            if(data.avatar !== undefined) user.avatar = data.avatar;
            if(data.about !== undefined) user.about = data.about;
            if(data.settings) user.settings = data.settings;
            socket.emit('profileUpdated', user);
        }
    });

    // Başkasının Profilini Görüntüleme
    socket.on('getUserProfile', (code) => {
        const user = users.find(u => u.code === code);
        if(user) {
            // Gizlilik ayarlarına göre verileri filtrele
            const profileData = {
                name: user.name, code: user.code, avatar: user.avatar, about: user.about,
                online: user.online, lastSeenDate: user.settings.lastSeen ? user.lastSeenDate : null
            };
            socket.emit('receiveUserProfile', profileData);
        }
    });

    // Görüldü Bilgisi Gönderme
    socket.on('markAsRead', ({ room, senderCode }) => {
        const user = users.find(u => u.code === currentUserCode);
        if(user && user.settings.readReceipts) {
            // Karşı tarafın da okundu bilgisi açıksa ilet
            const targetUser = users.find(u => u.code === senderCode);
            if(targetUser && targetUser.settings.readReceipts && userSockets[senderCode]) {
                io.to(userSockets[senderCode]).emit('messageRead', room);
            }
        }
    });

    // Arkadaş Ekleme ve İstek (Önceki kodlarla aynı)
    socket.on('sendFriendRequest', ({ fromCode, fromName, toCode }) => {
        if (fromCode === toCode) return socket.emit('requestError', 'Kendinize istek atamazsınız!');
        const targetUser = users.find(u => u.code === toCode);
        if (!targetUser) return socket.emit('requestError', 'Kullanıcı bulunamadı!');
        const sender = users.find(u => u.code === fromCode);
        if (sender.friends.some(f => f.code === toCode)) return socket.emit('requestError', 'Zaten arkadaşsınız!');
        if (friendRequests.find(r => r.fromCode === fromCode && r.toCode === toCode)) return socket.emit('requestError', 'İstek zaten gönderildi!');

        const reqObj = { fromCode, fromName, toCode };
        friendRequests.push(reqObj);
        socket.emit('requestSuccess', 'İstek gönderildi!');
        if (userSockets[toCode]) io.to(userSockets[toCode]).emit('newFriendRequest', reqObj);
    });

    socket.on('acceptFriendRequest', ({ fromCode, toCode }) => {
        const idx = friendRequests.findIndex(r => r.fromCode === fromCode && r.toCode === toCode);
        if (idx > -1) friendRequests.splice(idx, 1);
        const user1 = users.find(u => u.code === fromCode);
        const user2 = users.find(u => u.code === toCode);
        if(user1 && user2) {
            user1.friends.push({ name: user2.name, code: user2.code, avatar: user2.avatar });
            user2.friends.push({ name: user1.name, code: user1.code, avatar: user1.avatar });
            if (userSockets[fromCode]) io.to(userSockets[fromCode]).emit('updateFriendsList', user1.friends);
            if (userSockets[toCode]) io.to(userSockets[toCode]).emit('updateFriendsList', user2.friends);
        }
    });

    socket.on('joinPrivateRoom', (roomID) => {
        Array.from(socket.rooms).forEach(room => { if(room !== socket.id) socket.leave(room); });
        socket.join(roomID);
        socket.emit('chatHistory', messagesDB[roomID] || []);
    });

    socket.on('privateMessage', (data) => {
        if(!messagesDB[data.room]) messagesDB[data.room] = [];
        data.status = 'sent'; // sent, read
        messagesDB[data.room].push(data);
        io.to(data.room).emit('receivePrivateMessage', data);
    });

    // Çıkış Yapıldığında veya Sayfa Kapandığında
    socket.on('disconnect', () => {
        if (currentUserCode) {
            const user = users.find(u => u.code === currentUserCode);
            if(user) {
                user.online = false;
                user.lastSeenDate = Date.now();
                // Arkadaşlarına çevrimdışı olduğunu bildir
                user.friends.forEach(f => {
                    if(userSockets[f.code]) io.to(userSockets[f.code]).emit('friendStatusChanged', { code: currentUserCode, online: false, lastSeen: user.lastSeenDate });
                });
            }
            delete userSockets[currentUserCode];
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Sunucu Hazır: http://localhost:${PORT}`));