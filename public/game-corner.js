// =========================================
// SesliChat — Oyun Köşesi v3
// iframe yerine YENİ SEKME açma yaklaşımı
// Sesli sohbet arka planda devam eder
// =========================================

(function() {
    'use strict';

    // === Multi-player oyun kütüphanesi ===
    // Hepsi yeni sekmede açılır (iframe engellemesi yok)
    // Test edilmiş, çalışan oyunlar
    const GAMES = [
        // FPS
        { id: 'krunker', name: 'Krunker', icon: '🔫', category: 'FPS', url: 'https://krunker.io/', desc: '3D Pixel FPS', players: '2-8' },
        { id: 'shellshock', name: 'Shell Shockers', icon: '🥚', category: 'FPS', url: 'https://shellshock.io/', desc: 'Yumurta FPS', players: '2-6' },
        { id: 'venge', name: 'Venge.io', icon: '🎯', category: 'FPS', url: 'https://venge.io/', desc: '3rd-person shooter', players: '2-8' },

        // Kart/Yarış
        { id: 'smashkarts', name: 'Smash Karts', icon: '🏎️', category: 'Kart Yarışı', url: 'https://smashkarts.io/', desc: 'Kart battle royale', players: '2-8' },
        { id: 'madalin', name: 'Madalin Stunt Cars', icon: '🚗', category: 'Yarış', url: 'https://madalinstuntcars2.io/', desc: 'Stunt yarış', players: '2-8' },

        // Battle Royale
        { id: 'zombsroyale', name: 'Zombs Royale', icon: '🧟', category: 'Battle Royale', url: 'https://zombsroyale.io/', desc: '2D BR (iframe çalışıyor)', players: '2-100', iframeOk: true },
        { id: 'lordz', name: 'Lordz.io', icon: '👑', category: 'Strateji', url: 'https://lordz.io/', desc: 'Ortaçağ RTS', players: '2-50' },

        // Aksiyon
        { id: 'wings', name: 'Wings.io', icon: '✈️', category: 'Aksiyon', url: 'https://wings.io/', desc: 'Uçak savaşı', players: '2-20' },

        // Casual
        { id: 'agar', name: 'Agar.io', icon: '🔵', category: 'Casual', url: 'https://agar.io/', desc: 'Hücre büyütme', players: '2-50' },
        { id: 'slither', name: 'Slither.io', icon: '🐍', category: 'Casual', url: 'https://slither.io/', desc: 'Yılan büyütme', players: '2-50' },
        { id: 'hole', name: 'Hole.io', icon: '🕳️', category: 'Casual', url: 'https://hole.io/', desc: 'Kara delik yutma', players: '2-10' },
        { id: 'paper', name: 'Paper.io 2', icon: '📄', category: 'Casual', url: 'https://paper-io.com/', desc: 'Bölge kap', players: '2-8' },

        // Spor
        { id: 'soccer', name: 'Soccer Skills', icon: '⚽', category: 'Spor', url: 'https://www.soccerskills.io/', desc: '3D futbol', players: '2-4' }
    ];

    function showGameLibrary() {
        const old = document.getElementById('game-corner-modal');
        if (old) old.remove();

        // Kategorilere göre grupla
        const categories = {};
        GAMES.forEach(g => {
            if (!categories[g.category]) categories[g.category] = [];
            categories[g.category].push(g);
        });

        const modal = document.createElement('div');
        modal.id = 'game-corner-modal';
        modal.className = 'game-corner-modal';

        let gameGridsHTML = '';
        Object.keys(categories).forEach(cat => {
            gameGridsHTML += `
                <div class="gc-category">
                    <h4 class="gc-cat-title">${getCategoryIcon(cat)} ${cat}</h4>
                    <div class="gc-grid">
                        ${categories[cat].map(g => `
                            <button class="gc-game-card" data-game-id="${g.id}">
                                <div class="gc-game-icon">${g.icon}</div>
                                <div class="gc-game-info">
                                    <div class="gc-game-name">${g.name}</div>
                                    <div class="gc-game-desc">${g.desc}</div>
                                </div>
                                <div class="gc-game-players">${g.players} 👤</div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="gc-card">
                <div class="gc-header">
                    <h3>🎮 Oyun Köşesi</h3>
                    <button class="gc-close" id="gc-close-btn">✕</button>
                </div>
                <div class="gc-intro">
                    <p>🌐 Tüm oyunlar <strong>multi-player</strong> — arkadaşlarınla aynı anda oynayın!</p>
                    <p>📌 Oyunlar <strong>yeni sekmede açılır</strong> — SesliChat sekmesinde sesli sohbet <strong>devam eder</strong></p>
                    <p>🔊 Karşındakine oyunun oda kodunu söylesin — aynı server'da buluşun</p>
                    <p>💡 <strong>Desktop:</strong> İki sekme yan yana — sesli sohbet + oyun beraber</p>
                    <p>📱 <strong>Mobil:</strong> Oyun sekmesinde oyna, ses için SesliChat'e geri dön</p>
                </div>
                <div class="gc-body">
                    ${gameGridsHTML}
                </div>
                <div class="gc-footer">
                    <span>💡 İpucu: Krunker/Smash Karts'ta <strong>'Party' oluştur</strong>, kodu arkadaşına gönder</span>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listener
        modal.querySelector('#gc-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        modal.querySelectorAll('.gc-game-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const gameId = btn.dataset.gameId;
                const game = GAMES.find(g => g.id === gameId);
                if (game) {
                    openGameInNewTab(game);
                }
            });
        });
    }

    function getCategoryIcon(cat) {
        const icons = {
            'FPS': '🔫',
            'Battle Royale': '🪂',
            'Kart Yarışı': '🏎️',
            'Yarış': '🏁',
            'Survival': '🔥',
            'Strateji': '👑',
            'Aksiyon': '⚡',
            'Casual': '🔵',
            'Spor': '⚽'
        };
        return icons[cat] || '🎮';
    }

    function openGameInNewTab(game) {
        // Yeni sekmede aç
        const gameWindow = window.open(game.url, '_blank', 'noopener,noreferrer');

        // Modal'ı kapat
        const modal = document.getElementById('game-corner-modal');
        if (modal) modal.remove();

        // Floating voice chat widget göster
        showVoiceChatWidget(game);

        // Toast mesajı
        if (window.app) {
            window.app.showToast('🎮', `${game.name} yeni sekmede açıldı! Sesli sohbet burada devam ediyor.`);
        }
    }

    function showVoiceChatWidget(game) {
        // Önceki widget'ı kaldır
        const old = document.getElementById('game-voice-widget');
        if (old) old.remove();

        const widget = document.createElement('div');
        widget.id = 'game-voice-widget';
        widget.className = 'game-voice-widget';
        widget.innerHTML = `
            <div class="gvw-icon">🎮</div>
            <div class="gvw-info">
                <div class="gvw-title">${game.name}</div>
                <div class="gvw-status">🔊 Sesli sohbet aktif</div>
            </div>
            <button class="gvw-close" title="Widget'ı kapat (oyun sekmesi açık kalır)">✕</button>
        `;
        document.body.appendChild(widget);

        // Otomatik kaybolma (60 saniye)
        const autoClose = setTimeout(() => widget.remove(), 60000);

        widget.querySelector('.gvw-close').addEventListener('click', () => {
            clearTimeout(autoClose);
            widget.remove();
        });

        // Animasyon: 5 saniye sonra küçülsün
        setTimeout(() => widget.classList.add('minimized'), 5000);
    }

    // === Başlatma ===
    function initGameCorner() {
        const btn = document.getElementById('vrc-games-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                if (window.app && !window.app.currentRoom) {
                    window.app.showToast('⚠️', 'Oyun oynamak için önce odaya katıl.');
                    return;
                }
                showGameLibrary();
            });
        }
        console.log('[GameCorner] Oyun Köşesi v3 yüklendi (yeni sekme modu) ✅');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initGameCorner, 2000);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initGameCorner, 2000));
    }
})();
