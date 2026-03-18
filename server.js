require('dotenv').config(); // YENİ: .env dosyasındaki API şifresini okumak için
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios'); // YENİ: ElevenLabs ile konuşmak için
const FormData = require('form-data'); // YENİ: Ses dosyasını paketlemek için
const multer = require('multer'); // YENİ: Tarayıcıdan gelen sesi karşılamak için

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// YENİ: Ses dosyalarını RAM'de geçici olarak tutmak için Multer ayarı
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' })); // Ses dosyaları için limiti biraz daha artırdık
app.use(express.static(path.join(__dirname, 'public')));

// YENİ: ElevenLabs Şifresi
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

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
    
    // Yeni kullanıcı modeli (Profil ayarları ve Ses ID'si dahil)
    const newUser = { 
        id: Date.now(), name, email, password, code: generateUserCode(), friends: [],
        avatar: null, about: "Merhaba! Ben CyanChat kullanıyorum.", 
        settings: { readReceipts: true, lastSeen: true },
        online: false, lastSeenDate: null,
        voiceId: null // YENİ: Kullanıcının klonlanmış yapay zeka ses kimliği
    };
    users.push(newUser);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ success: false, message: 'Hatalı e-posta veya şifre!' });
    
    res.json({ success: true, user: { name: user.name, email: user.email, code: user.code, avatar: user.avatar, voiceId: user.voiceId } });
});

// =========================================================
// --- YAPAY ZEKA (ELEVENLABS) API UÇ NOKTALARI ---
// =========================================================

// 1. Kullanıcının Sesini Klonlama API'si (Sesi Al -> ElevenLabs'e At -> ID'yi Kaydet)
app.post('/api/clone-voice', upload.single('audio'), async (req, res) => {
    try {
        const userCode = req.body.userCode;
        const user = users.find(u => u.code === userCode);
        
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        if (!req.file) return res.status(400).json({ success: false, message: 'Ses dosyası yüklenemedi.' });

        const formData = new FormData();
        formData.append('name', `CyanChat_${user.name}_${user.code}`);
        formData.append('description', 'Kullanıcının klonlanmış kendi sesi');
        formData.append('files', req.file.buffer, { filename: 'voice_sample.webm', contentType: req.file.mimetype });

        const response = await axios.post('https://api.elevenlabs.io/v1/voices/add', formData, {
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                ...formData.getHeaders()
            }
        });

        user.voiceId = response.data.voice_id; // Gelen ID'yi RAM'e kaydet
        console.log(`🎙️ ${user.name} için yapay zeka sesi klonlandı! ID: ${user.voiceId}`);
        
        res.json({ success: true, voiceId: user.voiceId });
    } catch (error) {
        console.error('Ses Klonlama Hatası:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Ses klonlanırken hata oluştu. Aboneliğinizi kontrol edin.' });
    }
});

// 2. Metni Sese Çevirme (TTS) API'si (Mesajı + VoiceID'yi Al -> MP3 Üret)
// 2. Metni Sese Çevirme (TTS) API'si
app.post('/api/speak', async (req, res) => {
    try {
        const { text, voiceId } = req.body;
        
        if (!text || !voiceId) return res.status(400).json({ success: false, message: 'Metin veya Ses ID eksik.' });

        // YENİ: Yapay zekanın cümlenin sonunda saçmalamasını engellemek için gizli bir bitiş noktası koyuyoruz
        const safeText = text.trim() + " ."; 

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                text: safeText, // text yerine safeText gönderiyoruz
                model_id: "eleven_multilingual_v2", 
                
                voice_settings: { 
                    stability: 0.85,         // Halüsinasyonu engeller
                    similarity_boost: 0.70,  // Dip gürültüsünü taklit etmesini engellemek için biraz daha düşürdük
                    style: 0.0,              
                    use_speaker_boost: true  
                }
            },
            {
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' 
            }
        );

        res.set('Content-Type', 'audio/mpeg'); 
        res.send(response.data);
    } catch (error) {
        console.error('TTS Hatası:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Ses üretilemedi.' });
    }
});

// =========================================================
// --- SOCKET.IO SİSTEMİ ---
// =========================================================

io.on('connection', (socket) => {
    let currentUserCode = null;

    socket.on('userConnected', (userCode) => {
        currentUserCode = userCode;
        userSockets[userCode] = socket.id; 
        
        const user = users.find(u => u.code === userCode);
        if(user) {
            user.online = true; 
            socket.emit('updateFriendsList', user.friends);
            
            user.friends.forEach(f => {
                if(userSockets[f.code]) io.to(userSockets[f.code]).emit('friendStatusChanged', { code: userCode, online: true });
            });
        }

        const pending = friendRequests.filter(req => req.toCode === userCode);
        socket.emit('incomingFriendRequests', pending);
    });

    socket.on('updateProfile', (data) => {
        const user = users.find(u => u.code === currentUserCode);
        if(user) {
            if(data.avatar !== undefined) user.avatar = data.avatar;
            if(data.about !== undefined) user.about = data.about;
            if(data.settings) user.settings = data.settings;
            socket.emit('profileUpdated', user);
        }
    });

    socket.on('getUserProfile', (code) => {
        const user = users.find(u => u.code === code);
        if(user) {
            const profileData = {
                name: user.name, code: user.code, avatar: user.avatar, about: user.about,
                online: user.online, lastSeenDate: user.settings.lastSeen ? user.lastSeenDate : null,
                voiceId: user.voiceId // YENİ: Başkasının profiline bakarken onun Ses ID'sini de gönderiyoruz
            };
            socket.emit('receiveUserProfile', profileData);
        }
    });

    socket.on('markAsRead', ({ room, senderCode }) => {
        const user = users.find(u => u.code === currentUserCode);
        if(user && user.settings.readReceipts) {
            const targetUser = users.find(u => u.code === senderCode);
            if(targetUser && targetUser.settings.readReceipts && userSockets[senderCode]) {
                io.to(userSockets[senderCode]).emit('messageRead', room);
            }
        }
    });

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
            // YENİ: Arkadaş eklenirken voiceId'leri de birbirinin profiline ekliyoruz ki sesi okutabilelim
            user1.friends.push({ name: user2.name, code: user2.code, avatar: user2.avatar, voiceId: user2.voiceId });
            user2.friends.push({ name: user1.name, code: user1.code, avatar: user1.avatar, voiceId: user1.voiceId });
            
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
        data.status = 'sent'; 
        messagesDB[data.room].push(data);
        io.to(data.room).emit('receivePrivateMessage', data);
    });

    socket.on('disconnect', () => {
        if (currentUserCode) {
            const user = users.find(u => u.code === currentUserCode);
            if(user) {
                user.online = false;
                user.lastSeenDate = Date.now();
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