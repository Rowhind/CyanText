const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// JSON verilerini okumak için gerekli
app.use(express.json());

// Tarayıcıya sunulacak statik dosyaların klasörü
app.use(express.static(path.join(__dirname, 'public')));

// --- GEÇİCİ RAM VERİTABANI ---
const users = []; 

// --- KAYIT OLMA API ---
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    const userExists = users.find(u => u.email === email);
    
    if (userExists) {
        return res.status(400).json({ success: false, message: 'Bu e-posta zaten kayıtlı!' });
    }

    const newUser = { id: Date.now(), name, email, password };
    users.push(newUser);
    console.log('🟢 RAM Kaydı Yapıldı:', newUser.name);
    res.json({ success: true });
});

// --- GİRİŞ YAPMA API ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ success: false, message: 'Hatalı e-posta veya şifre!' });
    }

    console.log('🔵 Giriş Başarılı:', user.name);
    res.json({ success: true, user: { name: user.name, email: user.email } });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('⚡ Soket bağlantısı aktif:', socket.id);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu Hazır: http://localhost:${PORT}`);
});