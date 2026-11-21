# Trster

Kendi bastığın müzik kartlarıyla oynanan, zaman çizelgesi tahmin oyunu için açık kaynak bir web uygulaması. Kartın QR kodunu tara, şarkı Spotify'da **tam haliyle** çalsın, ekranda adı görünmesin. Kartı çevir, yılı gör.

*Open-source web app for a DIY music timeline card game: scan a card, the full track plays in Spotify with the title hidden.*

> Trster bağımsız bir hobi projesidir; Hitster veya Jumbo ile bir bağlantısı yoktur. Resmi Hitster kartlarıyla çalışmaz, kendi bastığın kartlar içindir.

## Nasıl çalışır

- Sunucu yok. Düz bir statik site (GitHub Pages'te çalışır).
- Oyunu yöneten kişi bir kez **Spotify ile bağlan** der (PKCE girişi, şifre bu siteye gelmez).
- Kart tarandığında site, Spotify Web API ile telefondaki Spotify uygulamasına "şu şarkıyı çal" komutu gönderir.
- Kartlar uygulamanın içinden ya da telefonun normal kamerasıyla taranabilir.
- Sadece ev sahibinin Spotify **Premium** hesabı olması yeterli; diğer oyuncular hiçbir şeye giriş yapmaz.

## Kartlar

QR kodlar şu biçimdedir: `https://SITEN/?t=<spotify_track_id>`
Uygulama düz Spotify linklerini (`open.spotify.com/track/...`) de okur.

Kart PDF'i üretmek için:

```bash
pip install qrcode reportlab
cd cards
python3 make_cards.py songs.csv kartlar.pdf https://SITEN
```

`songs.csv` sütunları: `artist,title,year,spotify_id`. PDF A4'tür, 65 mm kartlar, sayfa başına 12 kart; arka sayfalar uzun kenardan çift taraflı baskı için aynalanmıştır.

## Kendi kopyanı kurmak

Spotify, geliştirici modundaki her uygulamayı 5 kullanıcıyla sınırlıyor. Bu yüzden grubunda Premium'u olan biri kendi Spotify uygulamasını açabilir (ücretsiz, 5 dakika):

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**
2. **Redirect URI**: oyunu açtığın adres (ör. `https://oyun.ornek.com/`). Uygulamadaki Ayarlar ekranı tam adresi gösterir.
3. **Web API**'yi seç, kaydet, **Client ID**'yi kopyala.
4. Trster'da **Ayarlar → Kendi Spotify uygulamanı kullan** alanına yapıştır. (Ya da kendi fork'unda `config.js` dosyasına yaz.)
5. Kendin dışındaki oyuncuları Dashboard → **User Management**'tan ekle (en fazla 5).

**Client Secret'a ihtiyaç yok; hiçbir yere yazma.**

## Sorun giderme

- **"Spotify bulunamadı"**: Telefondaki Spotify uygulamasını aç, bir şarkıyı başlatıp durdur, siteye dön ve Tekrar dene'ye bas.
- **"Premium gerekiyor"**: Hesap Premium olmalı ve Spotify uygulamasının kullanıcı listesinde bulunmalı.
- Ayarlar'dan çalma cihazını (ör. evdeki hoparlör) seçebilir, otomatik durdurma süresi belirleyebilirsin.

## Lisans

MIT. QR okuyucu: [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0).
