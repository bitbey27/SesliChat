# 🎙️ SesliChat

Discord benzeri **sesli iletişim uygulaması** — Node.js + WebSocket + WebRTC tabanlı.

## ✨ Özellikler

- 🎙️ WebRTC ile peer-to-peer sesli sohbet (geçici STUN/TURN)
- 💬 Oda bazlı text chat + emoji picker
- 🎵 **Müzik player** (DJ bir müzik çalar, herkes duyar, herkes kendi ses seviyesini/mute'unu ayarlar)
- 🔒 Şifreli özel odalar
- 👑 Admin paneli (oda oluştur/sil, kullanıcı at, sohbet temizle)
- 🟢 Konuşma algılama (Voice Activity Detection — kim konuşuyor animasyonu)
- 🔌 Auto-reconnect + heartbeat
- 📱 Mobil uyumlu (responsive)
- 🎥 Kamera / Ekran paylaşımı (WebRTC video track)
- 🚪 Sayfa yenilenince otomatik giriş + son odaya otomatik geri katıl

## 🚀 Render'a Deploy

1. GitHub'a push yapın
2. Render.com → New Web Service → bu repo'yu seçin
3. Build: `npm install`
4. Start: `node server.js`
5. (Opsiyonel) Environment Variable olarak `ADMIN_PASSWORD` ekleyin

## 🛠️ Geliştirme

```bash
npm install
npm start
# http://localhost:3000
```

## 📁 Yapı

```
SesliChat/
├── server.js        # Backend (Express + ws + WebRTC signaling)
├── public/
│   ├── index.html   # Ana UI
│   ├── app.js       # Frontend JS
│   └── style.css    # Stiller
├── rooms.json       # Oda config (server restart'ta kalıcı)
├── render.yaml      # Render.com deploy config
└── package.json
```

## 🎵 Müzik Player Kullanımı

1. Bir sesli odaya katıl
2. Sol paneldeki **🎵** butona tıkla → müzik paneli açılır
3. Dosya seç veya URL yapıştır → "Çal" butonuna bas
4. Odadaki herkes müziği duyacaktır
5. Her dinleyicinin kendi panelinde müziği kısma/mute etme imkânı vardır

## 🔑 Admin Girişi

Sohbet kutusuna `/admin <şifre>` yazın. (Şifre hardcoded `admin123` — production için `process.env.ADMIN_PASSWORD` kullanılması önerilir.)

## 📜 Lisans

MIT
