// =========================================
// SesliChat — Oyun Köşesi
// iframe ile multiplayer .io oyunları gömer
// Sesli sohbet arka planda çalışmaya devam eder
// =========================================

(function() {
    'use strict';

    // === Multi-player oyun kütüphanesi ===
    // Hepsi iframe ile embed edilebilir (X-Frame-Options YOK, CSP frame-ancestors YOK)
    // Engellenen oyunlar (Poki, venge.io, starve.io) listeden ÇIKARILDI
    const GAMES = [
        // FPS
        { id: 'krunker', name: 'Krunker', icon: '🔫', category: 'FPS', url: 'https://krunker.io/', desc: '3D Pixel FPS', players: '2-8' },
        { id: 'shellshock', name: 'Shell Shockers', icon: '🥚', category: 'FPS', url: 'https://shellshock.io/', desc: 'Yumurta FPS', players: '2-6' },
        { id: 'miniroyle', name: 'MiniRoyale', icon: '🪂', category: 'Battle Royale', url: 'https://miniroyale2.io/', desc: 'BR FPS', players: '2-10' },
        { id: 'dogfight', name: 'Dogfight 2', icon: '✈️', category: 'Aksiyon', url: 'https://www.dogfight2.com/', desc: 'Uçak savaşı (Flash)', players: 'Single+İzle' },

        // Kart/Yarış
        { id: 'smashkarts', name: 'Smash Karts', icon: '🏎️', category: 'Kart Yarışı', url: 'https://smashkarts.io/', desc: 'Kart battle royale', players: '2-8' },
        { id: 'madalin', name: 'Madalin Stunt Cars', icon: '🚗', category: 'Yarış', url: 'https://madalinstuntcars2.io/', desc: 'Stunt yarış', players: '2-8' },
        { id: 'hexgl', name: 'HexGL Racing', icon: '🚀', category: 'Yarış', url: 'https://hexgl.babylonjs.com/', desc: 'Future yarış', players: 'Single+İzle' },

        // Battle Royale
        { id: 'zombsroyale', name: 'Zombs Royale', icon: '🧟', category: 'Battle Royale', url: 'https://zombsroyale.io/', desc: '2D BR', players: '2-100' },
        { id: 'lordz', name: 'Lordz.io', icon: '👑', category: 'Strateji', url: 'https://lordz.io/', desc: 'Ortaçağ RTS', players: '2-50' },

        // Hızlı casual
        { id: 'wings', name: 'Wings.io', icon: '✈️', category: 'Aksiyon', url: 'https://wings.io/', desc: 'Uçak savaşı', players: '2-20' },
        { id: 'agar', name: 'Agar.io', icon: '🔵', category: 'Casual', url: 'https://agar.io/', desc: 'Hücre büyütme', players: '2-50' },
        { id: 'slither', name: 'Slither.io', icon: '🐍', category: 'Casual', url: 'https://slither.io/', desc: 'Yılan büyütme', players: '2-50' },
        { id: 'hole', name: 'Hole.io', icon: '🕳️', category: 'Casual', url: 'https://hole.io/', desc: 'Kara delik yutma', players: '2-10' },
        { id: 'paper', name: 'Paper.io 2', icon: '📄', category: 'Casual', url: 'https://paper-io.com/', desc: 'Bölge kap', players: '2-8' },

        // Spor
        { id: 'soccer', name: 'Soccer Skills', icon: '⚽', category: 'Spor', url: 'https://www.soccerskills.io/', desc: '3D futbol', players: '2-4' }
    ];

    // === State ===
    let gameModal = null;
    let gameFrame = null;
    let currentGame = null;

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
                    <p>🔊 <strong>Sesli sohbet devam eder</strong> — oyun modalı kapansa bile sesli kanaldan çıkış yapmazsın</p>
                    <p>📋 Oyun açılınca arkadaşlarına "ben şu odaya katıl" de — aynı server'da buluşun</p>
                </div>
                <div class="gc-body">
                    ${gameGridsHTML}
                </div>
                <div class="gc-footer">
                    <span>💡 İpucu: Bazı oyunlar (Krunker, Smash Karts) <strong>özel oda kodu</strong> oluşturur — arkadaşlarınla paylaş!</span>
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
                    openGameFrame(game);
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
            'Spor': '⚽',
            'Düello': '⚔️'
        };
        return icons[cat] || '🎮';
    }

    function openGameFrame(game) {
        const old = document.getElementById('game-corner-modal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'game-frame-modal';
        modal.className = 'game-frame-modal';
        modal.innerHTML = `
            <div class="gf-header">
                <div class="gf-title">
                    <span class="gf-icon">${game.icon}</span>
                    <span>${game.name}</span>
                    <span class="gf-cat">${game.category}</span>
                </div>
                <div class="gf-status">
                    <span class="gf-voice-indicator">🔊 Sesli sohbet aktif</span>
                </div>
                <div class="gf-actions">
                    <button class="gf-back-btn" id="gf-back-btn" title="Oyun listesine dön">← Oyunlar</button>
                    <button class="gf-external" id="gf-external-btn" title="Yeni sekmede aç">↗</button>
                    <button class="gf-close-btn" id="gf-close-btn" title="Kapat">✕</button>
                </div>
            </div>
            <div class="gf-frame-wrap">
                <iframe src="${game.url}" class="gf-iframe" allow="autoplay; fullscreen; gamepad; microphone; camera; encrypted-media; gyroscope; accelerometer" allowfullscreen referrerpolicy="no-referrer"></iframe>
                <div class="gf-loading" id="gf-loading">
                    <div class="gf-spinner"></div>
                    <div>Yükleniyor...</div>
                    <div style="margin-top: 12px; font-size: 12px; color: #888;">
                        Açılmıyor mu? <button class="gf-external-inline" onclick="window.open('${game.url}', '_blank', 'noopener')">↗ Yeni sekmede aç</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('#gf-back-btn').addEventListener('click', () => {
            modal.remove();
            showGameLibrary();
        });
        modal.querySelector('#gf-external-btn').addEventListener('click', () => {
            window.open(game.url, '_blank', 'noopener');
        });
        modal.querySelector('#gf-close-btn').addEventListener('click', () => modal.remove());

        // Iframe load event — loading'i gizle
        const iframe = modal.querySelector('.gf-iframe');
        const loading = modal.querySelector('#gf-loading');
        if (iframe && loading) {
            iframe.addEventListener('load', () => {
                loading.style.display = 'none';
            });
            // 8 saniye sonra da loading'i gizle (bazı oyunlar load event'i fire etmiyor)
            setTimeout(() => {
                if (loading) loading.style.display = 'none';
            }, 8000);
        }

        // ESC ile kapat
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        currentGame = game;
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
        console.log('[GameCorner] Oyun Köşesi yüklendi ✅');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initGameCorner, 2000);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initGameCorner, 2000));
    }
})();
