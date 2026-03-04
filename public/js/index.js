document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. BELGE EKLEME MENÜSÜ ---
    const attachBtn = document.getElementById('attachBtn');
    const attachmentMenu = document.getElementById('attachmentMenu');

    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachmentMenu.classList.toggle('show');
        
        const icon = attachBtn.querySelector('i');
        if(attachmentMenu.classList.contains('show')) {
            icon.classList.remove('fa-plus');
            icon.classList.add('fa-times');
            attachBtn.style.color = 'var(--primary-cyan)';
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-plus');
            attachBtn.style.color = 'var(--text-muted)';
        }
    });

    // Menü açıkken dışarı tıklanırsa kapat
    document.addEventListener('click', (e) => {
        if (!attachmentMenu.contains(e.target) && attachmentMenu.classList.contains('show')) {
            attachmentMenu.classList.remove('show');
            const icon = attachBtn.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-plus');
            attachBtn.style.color = 'var(--text-muted)';
        }
    });

    // --- 2. AYARLAR MODAL PENCERESİ ---
    const settingsBtn = document.getElementById('openSettings');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('show');
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('show');
        }
    });

    // --- 3. KARANLIK TEMA (DARK MODE) ---
    const themeToggle = document.getElementById('themeToggle');
    
    // Sayfa yüklendiğinde tarayıcı hafızasını kontrol et
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', () => {
        if(themeToggle.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    });

    // --- 4. SOHBET KİŞİSİ DEĞİŞTİRME ---
    const contactItems = document.querySelectorAll('.contact-item');
    const chatHeaderTitle = document.querySelector('.current-chat-info h3');
    const chatHeaderStatus = document.querySelector('.current-chat-info .status');
    const chatHeaderAvatar = document.querySelector('.current-chat-info .avatar');
    
    contactItems.forEach(item => {
        item.addEventListener('click', () => {
            // Önceki aktifi temizle
            document.querySelector('.contact-item.active').classList.remove('active');
            
            // Tıklanana aktif sınıfını ver
            item.classList.add('active');
            
            // İsimleri Güncelle
            const contactName = item.querySelector('h4').innerText;
            chatHeaderTitle.innerText = contactName;

            // Grup mu, kişi mi kontrolü yapıp başlık altı durumunu güncelle (Basit Simülasyon)
            if(contactName.includes('Sınıfı') || contactName.includes('Ekibi')) {
                chatHeaderStatus.innerText = "Grup Sohbeti";
                chatHeaderAvatar.innerHTML = '<i class="fas fa-users"></i>';
            } else {
                chatHeaderStatus.innerText = "Çevrimiçi";
                chatHeaderAvatar.innerHTML = '<i class="fas fa-user"></i>';
            }
        });
    });
});