document.addEventListener('DOMContentLoaded', () => {
    
    // --- KARANLIK TEMA KONTROLÜ ---
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = themeToggleBtn.querySelector('i');

    // Sayfa ilk açıldığında hafızadaki temayı kontrol et
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
    }

    // Butona tıklandığında temayı değiştir
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            localStorage.setItem('theme', 'light');
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    });

    // --- SPOTLIGHT ETKİSİ ---
    const cards = document.querySelectorAll('.feature-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // --- MODAL KONTROLLERİ ---
    const authOverlay = document.getElementById('authOverlay');
    const loginBox = document.getElementById('loginBox');
    const registerBox = document.getElementById('registerBox');
    const closeAuth = document.getElementById('closeAuth');

    const showLogin = () => {
        authOverlay.classList.add('show');
        loginBox.classList.remove('hidden');
        registerBox.classList.add('hidden');
    };

    const showRegister = () => {
        authOverlay.classList.add('show');
        loginBox.classList.add('hidden');
        registerBox.classList.remove('hidden');
    };

    document.getElementById('showLogin').onclick = showLogin;
    document.getElementById('showRegister').onclick = showRegister;
    document.getElementById('getStarted').onclick = showRegister;
    document.getElementById('toRegister').onclick = showRegister;
    document.getElementById('toLogin').onclick = showLogin;

    closeAuth.onclick = () => authOverlay.classList.remove('show');

    // Pencere dışına tıklanınca kapat
    window.onclick = (e) => {
        if(e.target === authOverlay) authOverlay.classList.remove('show');
    };

    // --- ŞİFREYİ GÖSTER KONTROLLERİ ---
    const loginPass = document.getElementById('loginPass');
    const loginShowPass = document.getElementById('loginShowPass');
    const regPass = document.getElementById('regPass');
    const regPassConfirm = document.getElementById('regPassConfirm');
    const regShowPass = document.getElementById('regShowPass');

    // Giriş sayfasında şifreyi göster
    if(loginShowPass) {
        loginShowPass.addEventListener('change', (e) => {
            loginPass.type = e.target.checked ? 'text' : 'password';
        });
    }

    // Kayıt sayfasında şifreleri göster
    if(regShowPass) {
        regShowPass.addEventListener('change', (e) => {
            const type = e.target.checked ? 'text' : 'password';
            regPass.type = type;
            regPassConfirm.type = type;
        });
    }

    // --- ŞİFRE GÜCÜ HESAPLAYICI ---
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');

    if(regPass) {
        regPass.addEventListener('input', () => {
            const val = regPass.value;
            let strength = 0;
            
            if (val.length >= 6) strength += 1; 
            if (val.match(/[a-z]+/)) strength += 1; 
            if (val.match(/[A-Z]+/)) strength += 1; 
            if (val.match(/[0-9]+/)) strength += 1; 
            if (val.match(/[$@#&!*%]+/)) strength += 1; 

            if (val.length === 0) {
                strengthFill.style.width = '0%';
                strengthText.innerText = 'Şifre Gücü';
                strengthText.style.color = 'var(--text-muted)';
            } else if (strength <= 2) {
                strengthFill.style.width = '33%';
                strengthFill.style.backgroundColor = '#ff4757'; 
                strengthText.innerText = 'Zayıf (Daha uzun ve karmaşık yapın)';
                strengthText.style.color = '#ff4757';
            } else if (strength === 3 || strength === 4) {
                strengthFill.style.width = '66%';
                strengthFill.style.backgroundColor = '#ffa502'; 
                strengthText.innerText = 'Orta';
                strengthText.style.color = '#ffa502';
            } else {
                strengthFill.style.width = '100%';
                strengthFill.style.backgroundColor = '#2ed573'; 
                strengthText.innerText = 'Güçlü';
                strengthText.style.color = '#2ed573';
            }
        });
    }

    // --- SUNUCU İLE HABERLEŞEN GERÇEK KAYIT KONTROLÜ ---
    const registerBtn = document.getElementById('registerBtn');
    const termsCheck = document.getElementById('termsCheck');
    
    if(registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const password = regPass.value;
            const passwordConfirm = regPassConfirm.value;

            // Ön Doğrulamalar
            if(password !== passwordConfirm) {
                return alert('Şifreler birbiriyle eşleşmiyor! Lütfen kontrol edin.');
            }
            if(!termsCheck.checked) {
                return alert('Lütfen Açık Rıza Metni\'ni kabul edin.');
            }
            if(!name || !email || !password) {
                return alert('Lütfen tüm alanları doldurun!');
            }

            // Node.js Sunucusuna (RAM'e) Kayıt İsteği Gönderme
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                
                const data = await response.json();
                
                if(data.success) {
                    alert('Harika! Kaydınız oluşturuldu. Şimdi giriş yapabilirsiniz.');
                    document.getElementById('showLogin').click(); // Kayıt olunca login sekmesine geç
                } else {
                    alert('Hata: ' + data.message);
                }
            } catch(err) {
                console.error(err);
                alert('Sunucu ile bağlantı kurulamadı! Sunucunun (node server.js) çalıştığından emin olun.');
            }
        });
    }

    // --- SUNUCU İLE HABERLEŞEN GERÇEK GİRİŞ (LOGIN) KONTROLÜ ---
    const loginBtn = document.getElementById('loginBtn');
    
    if(loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPass').value;

            if(!email || !password) {
                return alert('Lütfen e-posta ve şifrenizi girin!');
            }

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if(data.success) {
                    // Kullanıcı bilgilerini ana sayfada kullanmak üzere tarayıcıya kaydet
                    localStorage.setItem('currentUser', JSON.stringify(data.user));
                    
                    // Giriş başarılı, sohbet ekranına yönlendir!
                    window.location.href = 'index.html';
                } else {
                    alert('Hata: ' + data.message);
                }
            } catch(err) {
                console.error(err);
                alert('Sunucu ile bağlantı kurulamadı! Sunucunun (node server.js) çalıştığından emin olun.');
            }
        });
    }
});