# Klipfon

Türkçe yayıncı / klipper kampanya platformu. Bu dal, eski Sites sürümünden bağımsız olarak Railway üzerinde Node.js 24 + Next.js + kalıcı SQLite ile çalışır.

## Durum

Canlı adres: https://klipfon-web-production.up.railway.app

Railway Docker derlemesi ve yayını başarılıdır. `/app/data` yoluna 500 MB kalıcı volume bağlıdır. Telefon zorunlu kayıt, yerel üretim kimlik doğrulama ve mali kayıt testleri geçmiştir. Banka transferleri ve görüntülenme kontrolleri manueldir. Yönetici hesabı, site sahibi tarafından `/kurulum` üzerinden özel anahtarla etkinleştirilir. Anahtar kaynak depoda bulunmaz.

18 Eylül 2026 tarihinde bu projenin etkin hesap limitleri otomatik volume yedeğine izin vermediğinden otomatik yedekleme kurulamadı. Gerçek para kabulünden önce özel ve tutarlı veritabanı/dekont yedekleme düzeni kurulmalıdır. Ödeme kabulü ilk kurulumda kapalıdır.

## Yerel çalışma

Node.js 24 ve pnpm 11.25.0 gerekir.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Üretim: `pnpm build && pnpm start`. Üretimde `APP_ORIGIN` tam site adresi olmalıdır. Yerel test için `http://localhost:3000`; gerçek yayında HTTPS kullanılır. Sonda `/` olmamalı.

## Railway kurulumu

1. Kaynağı özel bir GitHub deposuna gönder. Gerçek müşteri verisi, `.env` ve veri klasörü depoya gönderilmez.
2. Railway'de bu depodan servis oluştur. Dockerfile ve railway.json derleme / sağlık kontrolünü tanımlar.
3. **İlk müşteri kaydından önce `/app/data` yoluna kalıcı volume bağla.** Tek servis kopyası kullan. Bu sürüm birden fazla replica veya bölgeye uygun değildir.
4. Değişkenler: `DATA_DIR=/app/data`, `APP_ORIGIN=https://<gerçek-alan-adı>`, `KLIPFON_SETUP_SECRET=<rastgele-en-az-32-karakter>`. Kurulum anahtarı için `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` çalıştırılabilir. Anahtarı depoya veya herkese açık bir yere ekleme.
5. Railway servis alan adını aç, `APP_ORIGIN` değerini bu adresle eşleştir ve deploy et. `/api/health` 200 dönmeli. Railway'nin verdiği `PORT` kullanılır.
6. Siteye normal kayıt ol, kurtarma kodunu sakla. `/kurulum` sayfasında gizli kurulum anahtarını girerek bu hesabı ilk yönetici yap. Yönetici tek sefer kurulur. Kurulumdan sonra Railway'den kurulum anahtarını kaldır.
7. Admin panelinde işletme, iletişim, banka IBAN/alıcı ve onaylı sözleşme metinlerini doldur. Bunlar tamamlanmadan ödeme kabulü açılmaz.
8. Volume yedeklerini etkinleştir ve geri yüklemeyi dene. SQLite canlıyken yalnız ana `.sqlite` dosyasını kopyalama; tutarlı SQLite backup veya servis durdurularak tüm volume yedeği kullan. Dekontlar aynı volume içindeki `private` dizinindedir. Yedekleri özel tut.
9. Gerçek para kabulünden önce HTTPS kayıt, çıkış, kurtarma, admin erişimi, dekont erişimi ve küçük tutarlı manuel banka mutabakatını canlıda kontrol et. Deploy/restart sonrası kayıtların kaldığını doğrula.

Yeni özel domain bağlandığında DNS doğrulaması tamamlandıktan sonra `APP_ORIGIN` değerini değiştir; eski domain üzerinden yapılan yazma işlemleri kaynak kontrolü nedeniyle reddedilir.

## İşleyiş

### Topluluk ve herkese açık profiller

`/topluluk`, aktif ve sosyal hesabı yönetici tarafından onaylanmış klipper/yayıncıları listeler. Her üyenin `/topluluk/<kullanıcı-id>` bağlantısı vardır. Onay kaldırıldığında, hesap askıya alındığında veya sosyal hesap değiştirildiğinde profil gizlenir. Profil düzenleme ekranından herkese açık biyografi eklenebilir.

- İsimle arama (Türkçe büyük/küçük harf), rol filtresi, görüntülenme/klip/yeni üye sıralaması ve sayfalama.
- Görüntülenme, yayınlanmış veya kesinleşmiş kliplerin son yönetici ölçümündeki `eligible_views` toplamıdır. Ölçüm geçmişi toplanmaz. Reddedilen klipler sayılmaz; düzeltmeler toplamı aşağı da çekebilir.
- Klipper seviyeleri: Yeni (0), Yükselen (10.000), Profesyonel (100.000), Elit (1.000.000), Efsane (10.000.000). Seviye; rozet, çerçeve rengi ve ilerlemeye yansır. Sıra hesap türü bazındadır; eşit görüntülenmeler aynı sırayı alır. Sıfır görüntülenmeli üyeye sıra verilmez.
- Yayıncıda kampanya/klip/klipper sayısı ve görüntülenme; klipperda klip/kampanya/yayıncı sayısı görünür. Portföyde yalnızca onaylı, aktif klipperların yayınlanmış klipleri gösterilir.
- Public API alanları açıkça seçilir. Telefon, e-posta, IBAN, banka alıcı adı, kazanç/bakiye, taslak ve ölçüm dayanakları aktarılmaz.
- `0004_public_profiles.sql` yalnız biyografi alanını ve topluluk indeksini ekler; mevcut kayıt ve mali akışı değiştirmez. Sayfalar 60 saniyede ve pencereye dönüldüğünde yenilenir.
- Kontrol: `pnpm build` sonrasında `python tests/community_flow.py` (geçici veritabanıyla; canlı veriye dokunmaz).

### Tawk.to canlı destek

Tüm sayfalarda Klipfon renkleriyle bir destek menüsü vardır. Mevcut destek/itiraz
formuna ve yardım merkezine bağlantı içerir. Tawk.to kodu yalnız kullanıcı canlı
sohbet düğmesine bastığında yüklenir; site açılışında üçüncü taraf sohbet isteği
yapılmaz. Müşteri telefonu, e-posta, IBAN veya bakiye bilgisi otomatik aktarılmaz.

Site sahibinin sağladığı `6aadc798c048683449aa1362/default` widget'ı varsayılandır.
Ek ortam değişkeni olmadan kullanılır. Farklı bir widget bağlamak için
Tawk.to > Administration > Chat Widget içindeki Widget Code
alanından `https://embed.tawk.to/PROPERTY_ID/WIDGET_ID` adresinin iki kimliğini al.
Railway servis değişkenlerine `TAWK_PROPERTY_ID` ve `TAWK_WIDGET_ID` olarak ekle.
Bunlar herkese açık widget kimlikleridir; hesap şifresi veya API anahtarı değildir.
Sunucu yeniden başladığında yeni ayarlar okunur. Kimlikler eksik/geçersizse canlı
sohbet düğmesi gösterilmez, mevcut yardım ve talep bağlantıları çalışmaya devam eder.

Tawk.to panelinde Widget Appearance > Advanced ayarları:

| Ayar | Değer |
| --- | --- |
| Header | `#2F2047` |
| Header Text | `#FFFFFF` |
| Agent Message / Agent Text | `#292437` / `#F3F3F7` |
| Visitor Message / Visitor Text | `#36D6C4` / `#0B0C10` |
| Konum | Sağ alt; masaüstü ve mobil önizlemede kontrol et |
| Dil | Türkçe |
| Başlık | Klipfon Destek |
| Karşılama | Merhaba! Sana nasıl yardımcı olabiliriz? |

Attention Grabber ve otomatik pencere açma tetikleyicilerini kapat; özel destek
düğmesini kullanıyoruz. Çevrimdışı formunu etkinleştir ve “Şu an çevrimdışıyız.
Mesajını ve e-posta adresini bırakabilirsin.” metnini kullan. Gerçek çalışma
saatlerini Tawk.to panelinde tanımla. Operatör yanıtları Tawk.to üzerinden verilir;
Klipfon ödeme/itiraz kayıtları kendi panelinde kalır.

Sohbet içi renkler ve metinler Tawk.to panelinden ayarlanır; site CSS'i iframe
içini değiştirmez. Widget bağlandıktan sonra gerçek çevrimiçi/çevrimdışı mesaj
gönderimi, mobil görünüm ve operatör yanıtı ayrıca kontrol edilmelidir.

Kaynaklar: https://developer.tawk.to/jsapi/ ve
https://help.tawk.to/article/changing-the-appearance-of-the-chat-widget

### Kampanya ve ödeme akışı

- Kayıtta telefon zorunlu; biçimi sunucuda doğrulanır. SMS ve e-posta sahiplik doğrulaması yoktur.
- E-posta/şifre girişi, scrypt şifre özeti, özel HTTP-only oturum çerezi. Parola sıfırlama için kayıt sırasında gösterilen tek kullanımlık kurtarma kodu vardır. Kod yenilendiğinde eski kod ve bütün oturumlar iptal olur. E-posta gönderimi yoktur.
- Yayıncı, admin tarafından tanımlanan IBAN'a bankasından havale yapar, bildirim / dekont gönderir. Admin gerçek tahsilatı banka işlem referansıyla onaylayınca bakiye oluşur. Sistem banka hesabını otomatik okuyamaz.
- Klipper kendi IBAN ve alıcı adını kaydeder. Hakediş sonrası çekim talep eder. Admin transferi bankadan yapar ve sonucunu kaydeder; otomatik havale yoktur.
- Kampanya bütçesi, klip limiti, ön onay, sosyal hesap kontrolü, 14 günlük ölçüm ve 7 günlük inceleme dönemi vardır. Görüntülenme kontrolü ve sonuçlandırma manueldir.
- Muhasebe kayıtları değiştirilemez; tekrar gönderilen işlemler ikinci kez bakiye oluşturmaz. Eşzamanlı katılımda bütçe aşımı SQLite transaction ve trigger ile engellenir.
- Admin dışındaki hesaplar diğer kişilerin telefon, IBAN ve dekontlarını göremez.

## Teknik sınırlar

Bu sürüm tek sunuculu pilot içindir. SQLite, dekontlar, oturum ve hız sınırları kalıcı volume üzerinde saklanır. Yatay ölçek için veritabanı/nesne depolama geçişi gerekir. Küresel kayıt sınırı saatte 30, kimlik doğrulama sınırı dakikada 120 istektir; büyümeden önce IP bazlı kötüye kullanım koruması ve doğrulanmış e-posta/SMS akışı eklenmelidir. Banka hareketleriyle düzenli mutabakat işletme sorumluluğundadır.

## Doğrulama

```sh
pnpm build
python tests/financial_flow.py
python tests/native_auth_smoke.py
```

HTTP testi geçici bir veritabanında localhost:3017 üzerinde üretim sunucusu açar; gerçek bankaya veya üçüncü kişiye işlem göndermez. Veri şeması `drizzle/*.sql` içinden transaction ile uygulanır. Uygulanmış migration dosyalarını değiştirme; yeni SQL dosyası ekle. SQLite trigger gövdeleri tek parça yürütülür.
