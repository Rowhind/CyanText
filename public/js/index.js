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
    let selectedAvatarBase64 = null; 
    let activeFriendVoiceId = null; 

    // ==========================================
    // YENİ: OTOMATİK OKUMA HAVUZU (BUFFER) MANTIĞI
    // ==========================================
    let autoReadTimer = null;
    let autoReadBuffer = [];
    const AUTO_READ_DELAY = 10000; // 10 Saniye sessizlik olunca havuzu oku

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

    const profileModal = document.getElementById('profileModal');
    const avatarUpload = document.getElementById('avatarUpload');
    const profilePicImg = document.getElementById('profilePicImg');
    const profilePicIcon = document.getElementById('profilePicIcon');

    document.getElementById('openProfileSettings').addEventListener('click', () => {
        socket.emit('getUserProfile', currentUser.code);
        profileModal.classList.add('show');
    });
    document.getElementById('closeProfileModal').addEventListener('click', () => profileModal.classList.remove('show'));

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

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    const recordBtn = document.getElementById('recordBtn');
    const voiceStatusText = document.getElementById('voiceStatusText');

    if (recordBtn) {
        recordBtn.addEventListener('click', async (e) => {
            e.preventDefault(); 
            if (!isRecording) {
                try {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        alert("HATA: Tarayıcı mikrofonu engelliyor!");
                        return;
                    }
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);

                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        audioChunks = []; 
                        voiceStatusText.innerHTML = '<span style="color:var(--primary-cyan)"><i class="fas fa-spinner fa-spin"></i> Sesiniz analiz ediliyor...</span>';
                        recordBtn.style.display = 'none';

                        const formData = new FormData();
                        formData.append('audio', audioBlob, 'voice.webm');
                        formData.append('userCode', currentUser.code);

                        try {
                            const response = await fetch('/api/clone-voice', { method: 'POST', body: formData });
                            const data = await response.json();
                            if (data.success) {
                                voiceStatusText.innerHTML = '<span style="color:#2ed573"><i class="fas fa-check-circle"></i> Ses başarıyla klonlandı.</span>';
                            } else {
                                voiceStatusText.innerHTML = `<span style="color:#ff4757"><i class="fas fa-times-circle"></i> Hata: ${data.message}</span>`;
                                recordBtn.style.display = 'block';
                            }
                        } catch (error) {
                            voiceStatusText.innerText = "Bağlantı hatası.";
                            recordBtn.style.display = 'block';
                        }
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    recordBtn.classList.add('recording');
                    recordBtn.innerHTML = '<i class="fas fa-stop"></i> Kaydı Bitir ve Gönder';
                } catch (err) {
                    alert("Mikrofon izni reddedildi!");
                }
            } else {
                mediaRecorder.stop();
                isRecording = false;
                recordBtn.classList.remove('recording');
            }
        });
    }

    document.getElementById('saveProfileBtn').addEventListener('click', () => {
        const about = document.getElementById('aboutMeInput').value;
        const readReceipts = document.getElementById('readReceiptsToggle').checked;
        const lastSeen = document.getElementById('lastSeenToggle').checked;

        socket.emit('updateProfile', {
            avatar: selectedAvatarBase64,
            about: about,
            settings: { readReceipts, lastSeen }
        });
        
        const mySidebarAvatar = document.getElementById('mySidebarAvatar');
        if(selectedAvatarBase64) mySidebarAvatar.innerHTML = `<img src="${selectedAvatarBase64}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        else mySidebarAvatar.innerHTML = `<i class="fas fa-user"></i>`;
        
        alert('Profiliniz güncellendi!');
        profileModal.classList.remove('show');
    });

    socket.on('receiveUserProfile', (data) => {
        if(data.code === currentUser.code) { 
            document.getElementById('aboutMeInput').value = data.about || '';
            document.getElementById('readReceiptsToggle').checked = data.lastSeenDate !== null; 
            if(data.avatar) {
                selectedAvatarBase64 = data.avatar;
                profilePicImg.src = data.avatar;
                profilePicImg.style.display = 'block';
                profilePicIcon.style.display = 'none';
            }
            if(data.voiceId && voiceStatusText) {
                voiceStatusText.innerHTML = '<span style="color:#2ed573"><i class="fas fa-check-circle"></i> Yapay Zeka Sesiniz aktif.</span>';
                if(recordBtn) recordBtn.style.display = 'none';
            }
        } else {
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
            
            if(activeChatFriendCode === data.code) {
                activeFriendVoiceId = data.voiceId;
            }
        }
    });

    const viewProfileModal = document.getElementById('viewProfileModal');
    document.getElementById('chatHeaderClickable').addEventListener('click', () => {
        if(activeChatFriendCode) {
            socket.emit('getUserProfile', activeChatFriendCode);
            viewProfileModal.classList.add('show');
        }
    });
    document.getElementById('closeViewProfile').addEventListener('click', () => viewProfileModal.classList.remove('show'));

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

    socket.on('friendStatusChanged', ({ code, online, lastSeen }) => {
        if(activeChatFriendCode === code) updateChatHeaderStatus(online, lastSeen);
    });

    function updateChatHeaderStatus(online, lastSeen) {
        const statusEl = document.getElementById('chatHeaderStatus');
        if(online) statusEl.innerHTML = `<span class="online-dot"></span> Çevrimiçi`;
        else statusEl.innerHTML = `<span class="offline-text">${lastSeen ? `Son görülme: ${formatLastSeen(lastSeen)}` : 'Çevrimdışı'}</span>`;
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
        avatarEl.innerHTML = friend.avatar ? `<img src="${friend.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : `<i class="fas fa-user"></i>`;
        
        socket.emit('getUserProfile', friend.code);
        
        // Odaya girince havuzu sıfırla
        if(autoReadTimer) clearTimeout(autoReadTimer);
        autoReadBuffer = [];
        const autoReadIcon = document.getElementById('autoReadIcon');
        if(autoReadIcon) autoReadIcon.className = 'fas fa-volume-up';
    }

    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    sendBtn.addEventListener('click', () => {
        const text = messageInput.value.trim();
        if (!text || !activeRoomID) return;

        // YENİ: Ben mesaj atarsam, karşı tarafın yarım kalan oto-okumasını iptal et.
        if (autoReadTimer) {
            clearTimeout(autoReadTimer);
            autoReadBuffer = [];
            const autoReadIcon = document.getElementById('autoReadIcon');
            if(autoReadIcon) autoReadIcon.className = 'fas fa-volume-up';
        }

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

        if(activeRoomID === data.room && data.senderCode !== currentUser.code) {
            socket.emit('markAsRead', { room: activeRoomID, senderCode: data.senderCode });

            // ==========================================
            // YENİ: MESAJ GELDİĞİNDE OTO-OKUMA MANTIĞI
            // ==========================================
            const autoReadToggle = document.getElementById('autoReadToggle');
            if (autoReadToggle && autoReadToggle.checked) {
                const autoReadIcon = document.getElementById('autoReadIcon');
                
                // 1. Yeni mesajı havuza at
                autoReadBuffer.push(data.text);
                
                // 2. İkonu yanıp sönen "dinleniyor/bekleniyor" ikonuna çevir
                if(autoReadIcon) {
                    autoReadIcon.className = 'fas fa-microphone';
                    autoReadIcon.style.color = '#2ed573';
                }

                // 3. Önceki sayacı iptal et
                if (autoReadTimer) clearTimeout(autoReadTimer);

                // 4. Yeni 5 saniyelik sayaç başlat
                autoReadTimer = setTimeout(() => {
                    if (autoReadBuffer.length > 0) {
                        // Havuzdaki tüm kelimeleri boşluk ve noktayla birleştir
                        const combinedText = autoReadBuffer.join('. '); 
                        autoReadBuffer = []; // Okunduğu için havuzu boşalt
                        
                        // İkonu normale çevir
                        if(autoReadIcon) {
                            autoReadIcon.className = 'fas fa-volume-up';
                            autoReadIcon.style.color = 'var(--text-muted)';
                        }
                        
                        // Birleşik metni API'ye yolla
                        speakText(combinedText, null);
                    }
                }, AUTO_READ_DELAY);
            }
        }
    });

    socket.on('messageRead', (room) => {
        if(activeRoomID === room) {
            document.querySelectorAll('.msg-status.sent').forEach(icon => {
                icon.classList.remove('sent');
                icon.classList.add('read');
                icon.innerHTML = '<i class="fas fa-check-double"></i>'; 
            });
        }
    });

    function appendMessage(data) {
        const isMine = data.senderCode === currentUser.code;
        const div = document.createElement('div');
        div.className = `message ${isMine ? 'sent' : 'received'}`;
        
        const safeText = data.text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const playBtn = !isMine ? `<button class="icon-btn play-btn" onclick="speakText('${safeText}', this)" style="font-size: 0.95rem; margin-left: 10px; color: var(--primary-cyan); cursor: pointer; border: none; background: transparent;"><i class="fas fa-volume-up"></i></button>` : '';
        const statusHtml = isMine ? `<span class="msg-status ${data.status === 'read' ? 'read' : 'sent'}"><i class="fas fa-check"></i></span>` : '';

        div.innerHTML = `
            <div class="msg-bubble" style="display: flex; align-items: center;">
                <div><span>${data.text}</span></div>${playBtn}
            </div>
            <span class="msg-time">${data.time} ${statusHtml}</span>
        `;
        document.getElementById('messageContainer').appendChild(div);
    }

    const settingsModal = document.getElementById('settingsModal');
    document.getElementById('openSettings').addEventListener('click', () => settingsModal.classList.add('show'));
    document.getElementById('closeSettings').addEventListener('click', () => settingsModal.classList.remove('show'));
    
    const themeToggle = document.getElementById('themeToggle');
    if(localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark-mode'); themeToggle.checked = true; }
    themeToggle.addEventListener('change', () => {
        if(themeToggle.checked) { document.body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); } 
        else { document.body.classList.remove('dark-mode'); localStorage.setItem('theme', 'light'); }
    });

    // ==========================================
    // YENİ: DÜZENLENMİŞ SES OKUMA FONKSİYONU
    // ==========================================
    window.speakText = async function(text, btnElement = null) {
        let originalIcon = '';
        if (btnElement) {
            originalIcon = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
        } else {
            // Otomatik okumadaysa üstteki genel ikonu döndürelim
            const autoReadIcon = document.getElementById('autoReadIcon');
            if(autoReadIcon) autoReadIcon.className = 'fas fa-spinner fa-spin';
        }
        
        if (!activeFriendVoiceId) {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'tr-TR';
                
                utterance.onend = () => {
                    if (btnElement) btnElement.innerHTML = originalIcon;
                    else {
                        const icon = document.getElementById('autoReadIcon');
                        if(icon) icon.className = 'fas fa-volume-up';
                    }
                };
                window.speechSynthesis.speak(utterance);
            } 
            return;
        }

        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, voiceId: activeFriendVoiceId })
            });

            if (!response.ok) throw new Error('Ses alınamadı.');

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            
            audio.onended = () => {
                if (btnElement) btnElement.innerHTML = originalIcon; 
                else {
                    const icon = document.getElementById('autoReadIcon');
                    if(icon) { icon.className = 'fas fa-volume-up'; icon.style.color = 'var(--text-muted)'; }
                }
            };
            
            audio.play();
        } catch (error) {
            console.error("Yapay Zeka Ses Hatası:", error);
            if (btnElement) btnElement.innerHTML = originalIcon;
            else {
                const icon = document.getElementById('autoReadIcon');
                if(icon) { icon.className = 'fas fa-volume-up'; icon.style.color = 'var(--text-muted)'; }
            }
        }
    };
});