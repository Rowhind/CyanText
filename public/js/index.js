document.addEventListener('DOMContentLoaded', () => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return window.location.href = 'landing.html';

    document.getElementById('myNameDisplay').innerText = currentUser.name;
    document.getElementById('myCodeDisplay').innerText = '#' + currentUser.code;
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'landing.html';
    });

    const socket = io();
    socket.emit('userConnected', currentUser.code);

    let activeChatFriendCode = null; 
    let activeRoomID = null;
    let selectedAvatarBase64 = null; // Profil resmi tutucu

    // --- TARİH VE SAAT FORMATLAYICI (Bugün, Dün) ---
    function formatLastSeen(timestamp) {
        if (!timestamp) return 'Uzun zaman önce';
        const date = new Date(timestamp);
        const now = new Date();
        const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        if (isToday) return `Bugün ${time}`;
        if (isYesterday) return `Dün ${time}`;
        return `${date.toLocaleDateString('tr-TR')} ${time}`;
    }

    // --- PROFIL AYARLARI YÖNETİMİ ---
    const profileModal = document.getElementById('profileModal');
    const avatarUpload = document.getElementById('avatarUpload');
    const profilePicImg = document.getElementById('profilePicImg');
    const profilePicIcon = document.getElementById('profilePicIcon');

    // Profil açıldığında sunucudan güncel bilgiyi iste
    document.getElementById('openProfileSettings').addEventListener('click', () => {
        socket.emit('getUserProfile', currentUser.code);
        profileModal.classList.add('show');
    });
    document.getElementById('closeProfileModal').addEventListener('click', () => profileModal.classList.remove('show'));

    // Resim Yükleme (Base64 Dönüşümü)
    avatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                selectedAvatarBase64 = evt.target.result;
                profilePicImg.src = selectedAvatarBase64;
                profilePicImg.style.display = 'block';
                profilePicIcon.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('removeAvatarBtn').addEventListener('click', () => {
        selectedAvatarBase64 = null;
        profilePicImg.src = '';
        profilePicImg.style.display = 'none';
        profilePicIcon.style.display = 'block';
    });

    document.getElementById('saveProfileBtn').addEventListener('click', () => {
        const about = document.getElementById('aboutMeInput').value;
        const readReceipts = document.getElementById('readReceiptsToggle').checked;
        const lastSeen = document.getElementById('lastSeenToggle').checked;

        socket.emit('updateProfile', {
            avatar: selectedAvatarBase64,
            about: about,
            settings: { readReceipts, lastSeen }
        });
        
        // Kendi küçük yan menü profil resmimi güncelle
        const mySidebarAvatar = document.getElementById('mySidebarAvatar');
        if(selectedAvatarBase64) mySidebarAvatar.innerHTML = `<img src="${selectedAvatarBase64}">`;
        else mySidebarAvatar.innerHTML = `<i class="fas fa-user"></i>`;
        
        alert('Profiliniz güncellendi!');
        profileModal.classList.remove('show');
    });

    // Sunucudan profil bilgilerim gelince formu doldur
    socket.on('receiveUserProfile', (data) => {
        if(data.code === currentUser.code) { // Kendi profilimse formlara doldur
            document.getElementById('aboutMeInput').value = data.about || '';
            document.getElementById('readReceiptsToggle').checked = data.lastSeenDate !== null; // Basit simülasyon
            if(data.avatar) {
                selectedAvatarBase64 = data.avatar;
                profilePicImg.src = data.avatar;
                profilePicImg.style.display = 'block';
                profilePicIcon.style.display = 'none';
            }
        }
    });

    // --- BAŞKASININ PROFiLİNİ GÖRÜNTÜLEME ---
    const viewProfileModal = document.getElementById('viewProfileModal');
    document.getElementById('chatHeaderClickable').addEventListener('click', () => {
        if(activeChatFriendCode) {
            socket.emit('getUserProfile', activeChatFriendCode);
            viewProfileModal.classList.add('show');
        }
    });
    document.getElementById('closeViewProfile').addEventListener('click', () => viewProfileModal.classList.remove('show'));

    socket.on('receiveUserProfile', (data) => {
        if(data.code !== currentUser.code) { // Başkasının profilini görüntülüyorsam
            document.getElementById('viewProfileName').innerText = data.name;
            document.getElementById('viewProfileCode').innerText = '#' + data.code;
            document.getElementById('viewProfileAbout').innerText = data.about || 'Merhaba! Ben CyanChat kullanıyorum.';
            
            const vImg = document.getElementById('viewProfileImg');
            const vIcon = document.getElementById('viewProfileIcon');
            if(data.avatar) {
                vImg.src = data.avatar; vImg.style.display = 'block'; vIcon.style.display = 'none';
            } else {
                vImg.src = ''; vImg.style.display = 'none'; vIcon.style.display = 'block';
            }
        }
    });

    // --- ARKADAŞLIK VE ODA YÖNETİMİ ---
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        const toCode = document.getElementById('addFriendInput').value.trim().toUpperCase();
        if(toCode) socket.emit('sendFriendRequest', { fromCode: currentUser.code, fromName: currentUser.name, toCode });
        document.getElementById('addFriendInput').value = '';
    });

    socket.on('requestSuccess', (msg) => alert(msg));
    socket.on('requestError', (msg) => alert(msg));
    socket.on('newFriendRequest', renderFriendRequest);
    socket.on('incomingFriendRequests', (reqs) => { document.getElementById('requestsArea').innerHTML = ''; reqs.forEach(renderFriendRequest); });

    function renderFriendRequest(req) {
        const div = document.createElement('div');
        div.className = 'request-box';
        div.innerHTML = `<strong>${req.fromName}</strong> sana istek gönderdi.<div class="request-btns"><button class="req-btn req-accept">Kabul Et</button><button class="req-btn req-reject">Reddet</button></div>`;
        div.querySelector('.req-accept').addEventListener('click', () => { socket.emit('acceptFriendRequest', { fromCode: req.fromCode, toCode: currentUser.code }); div.remove(); });
        div.querySelector('.req-reject').addEventListener('click', () => div.remove() );
        document.getElementById('requestsArea').appendChild(div);
    }

    // LİSTE VE DURUM GÜNCELLEMELERİ (ÇEVRİMİÇİ/SON GÖRÜLME)
    socket.on('updateFriendsList', (friends) => {
        const contactList = document.getElementById('contactList');
        if (friends.length === 0) return contactList.innerHTML = `<div class="empty-state" style="margin-top: 50px;"><i class="fas fa-user-friends"></i><p>Arkadaş ekleyin!</p></div>`;
        
        contactList.innerHTML = ''; 
        friends.forEach(friend => {
            const div = document.createElement('div');
            div.className = `contact-item ${activeChatFriendCode === friend.code ? 'active' : ''}`;
            div.id = `contact_${friend.code}`;
            const avatarHtml = friend.avatar ? `<img src="${friend.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : `<i class="fas fa-user"></i>`;
            div.innerHTML = `<div class="avatar">${avatarHtml}</div><div class="contact-info"><h4>${friend.name}</h4><p>#${friend.code}</p></div>`;
            div.addEventListener('click', () => {
                document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                openChat(friend);
            });
            contactList.appendChild(div);
        });
    });

    // Arkadaşım girip çıktığında üstteki durumu güncelle
    socket.on('friendStatusChanged', ({ code, online, lastSeen }) => {
        if(activeChatFriendCode === code) {
            updateChatHeaderStatus(online, lastSeen);
        }
    });

    function updateChatHeaderStatus(online, lastSeen) {
        const statusEl = document.getElementById('chatHeaderStatus');
        if(online) {
            statusEl.innerHTML = `<span class="online-dot"></span> Çevrimiçi`;
        } else {
            const text = lastSeen ? `Son görülme: ${formatLastSeen(lastSeen)}` : 'Çevrimdışı';
            statusEl.innerHTML = `<span class="offline-text">${text}</span>`;
        }
    }

    function openChat(friend) {
        activeChatFriendCode = friend.code;
        const codes = [currentUser.code, friend.code].sort();
        activeRoomID = `room_${codes[0]}_${codes[1]}`;

        socket.emit('joinPrivateRoom', activeRoomID);

        document.getElementById('noChatSelected').style.display = 'none';
        document.getElementById('chatHeader').style.display = 'flex';
        document.getElementById('messageContainer').style.display = 'flex';
        document.getElementById('chatFooter').style.display = 'flex';
        document.getElementById('chatHeaderTitle').innerText = friend.name;
        
        const avatarEl = document.getElementById('activeChatAvatar');
        avatarEl.innerHTML = friend.avatar ? `<img src="${friend.avatar}">` : `<i class="fas fa-user"></i>`;
        
        // Karşı tarafın o anki durumunu öğrenmek için profilini çekelim
        socket.emit('getUserProfile', friend.code);
    }

    // --- MESAJLAŞMA VE GÖRÜLDÜ SİSTEMİ ---
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    sendBtn.addEventListener('click', () => {
        const text = messageInput.value.trim();
        if (!text || !activeRoomID) return;

        socket.emit('privateMessage', {
            room: activeRoomID,
            senderName: currentUser.name,
            senderCode: currentUser.code,
            text: text,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        });
        messageInput.value = ''; messageInput.focus();
    });
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendBtn.click(); });

    socket.on('chatHistory', (messages) => {
        const mc = document.getElementById('messageContainer');
        mc.innerHTML = ''; 
        messages.forEach(appendMessage);
        mc.scrollTop = mc.scrollHeight;
        
        // Odaya girdiğimde karşı tarafın mesajlarını gördüğümü bildir
        if(messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if(lastMsg.senderCode !== currentUser.code) {
                socket.emit('markAsRead', { room: activeRoomID, senderCode: lastMsg.senderCode });
            }
        }
    });

    socket.on('receivePrivateMessage', (data) => {
        appendMessage(data);
        const mc = document.getElementById('messageContainer');
        mc.scrollTop = mc.scrollHeight;

        // Mesaj geldiğinde ben bu odadaysam hemen "Görüldü" at
        if(activeRoomID === data.room && data.senderCode !== currentUser.code) {
            socket.emit('markAsRead', { room: activeRoomID, senderCode: data.senderCode });
        }
    });

    // Mesajım karşı tarafta okunduğunda mavi tike çevir
    socket.on('messageRead', (room) => {
        if(activeRoomID === room) {
            document.querySelectorAll('.msg-status.sent').forEach(icon => {
                icon.classList.remove('sent');
                icon.classList.add('read');
                icon.innerHTML = '<i class="fas fa-check-double"></i>'; // Mavi Çift Tik
            });
        }
    });

    function appendMessage(data) {
        const isMine = data.senderCode === currentUser.code;
        const div = document.createElement('div');
        div.className = `message ${isMine ? 'sent' : 'received'}`;
        
        const safeText = data.text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const playBtn = !isMine ? `<button class="icon-btn play-btn" onclick="speakText('${safeText}')" style="font-size: 0.95rem; margin-left: 10px; color: var(--primary-cyan); cursor: pointer; border: none; background: transparent;"><i class="fas fa-volume-up"></i></button>` : '';
        
        // Durum İkonu (Tek tik gönderildi, Çift tik okundu simülasyonu)
        const statusHtml = isMine ? `<span class="msg-status ${data.status === 'read' ? 'read' : 'sent'}"><i class="fas fa-check"></i></span>` : '';

        div.innerHTML = `
            <div class="msg-bubble" style="display: flex; align-items: center;">
                <div><span>${data.text}</span></div>${playBtn}
            </div>
            <span class="msg-time">${data.time} ${statusHtml}</span>
        `;
        document.getElementById('messageContainer').appendChild(div);
    }

    // AYARLAR VE TEMA
    const settingsModal = document.getElementById('settingsModal');
    document.getElementById('openSettings').addEventListener('click', () => settingsModal.classList.add('show'));
    document.getElementById('closeSettings').addEventListener('click', () => settingsModal.classList.remove('show'));
    
    const themeToggle = document.getElementById('themeToggle');
    if(localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark-mode'); themeToggle.checked = true; }
    themeToggle.addEventListener('change', () => {
        if(themeToggle.checked) { document.body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); } 
        else { document.body.classList.remove('dark-mode'); localStorage.setItem('theme', 'light'); }
    });
});

window.speakText = function(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        window.speechSynthesis.speak(utterance);
    }
};