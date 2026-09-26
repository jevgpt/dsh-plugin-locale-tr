# dsh-plugin-locale-tr

Türkçe | [English](README.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web arayüzü için Türkçe (`tr`) dil paketi.

DeepSeek Harness İngilizce ve Basitleştirilmiş Çince ile gelir. Bu eklenti Türkçeyi üçüncü seçilebilir dil olarak ekler — **çekirdek dosyalara hiç dokunmadan**. `@deepseek-ai/dsh-client-locale` paketinin eklenti yazarları için belgelediği dil paketi genişletme noktasını kullanır:

- `ctx.locale.addLanguage({ id: 'tr', label: 'Türkçe', fallback: 'en' })` dil kataloğuna kaydı ekler; **Ayarlar → Genel → Dil** menüsünde "Türkçe" seçeneğinin görünmesini sağlayan budur.
- `ctx.locale.register(adAlanı, 'tr', sözlük)` her ad alanının çevrilmiş metinlerini kaydeder.

## Kapsam

**45 ad alanı, 1.870 metin** — sohbet, kenar çubuğu, ayarlar, araç sonuçları, plan modu, alt-ajanlar, oturum izi (trajectory), zamanlanmış görevler, eklenti yöneticisi, sesli giriş, belge/Excel/PDF önizleme ve klavye kısayolları. Hedeflenen dsh sürümünün sunduğu arayüz metinlerinin **%100'ü**.

Bu paketin taşımadığı bir anahtar olursa arama zinciri İngilizceye düşer; arayüz hiçbir durumda ham anahtar adı göstermez.

## Kurulum

npm'e yayınlanana kadar bir kopyadan kurun:

```sh
# 1. Paketi profilinizin çözümleyebileceği yere koyun
mkdir -p ~/.dsh/profiles/desktop/node_modules/dsh-plugin-locale-tr
cp -r package.json lib README.md LICENSE ~/.dsh/profiles/desktop/node_modules/dsh-plugin-locale-tr/

# 2. Profil manifestine ekleyin
#    ~/.dsh/profiles/desktop/package.json
#    "dependencies": { "dsh-plugin-locale-tr": "file:/paketin/tam/yolu" }
```

```yaml
# 3. Profilin patch katmanına ekleyin
#    ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: locale-tr
      name: dsh-plugin-locale-tr
```

**`insert` biçimi zorunludur.** Yalın `id` taşıyan bir patch var olan bir satırı hedefler; eşleşen satır yoksa yükleyici uyarı verip atlar — yani tek başına `- id: locale-tr` yazımı sessizce hiçbir şey yüklemez.

DeepSeek Harness'ı yeniden başlatın, ardından **Ayarlar → Genel → Dil** menüsünden **Türkçe** seçin.

## Kaldırma

`cordis.patch.yml` içindeki `- insert:` bloğunu silip yeniden başlatın. Türkçe seçiciden kalkar ve arayüz önceki dile döner.

## Nasıl çalışır

```
package.json          dsh.client beyanı: platform "web", locale paketini inject eder
lib/index.js          host yarısı — kasıtlı olarak boş; paketin istemci taramasının
                      çözümleyebileceği meşru bir Loader satırı olması için var
lib/client.js         tarayıcı yarısı — üretilmiş; dili ve sözlükleri kaydeder
src/dictionaries/     her ad alanı için tek dosya: bu paketin çevrildiği İngilizce/Çince
                      kaynak satırları ve Türkçe değerler
scripts/              çıkarma, derleme, doğrulama ve kayma denetimi araçları
tests/                bütünlük, yer tutucu ve manifest kapıları
```

`dsh` istemci modül yükleyicisi bir paketi manifestini okuyarak keşfeder: `platform: 'web'` içeren bir `dsh.client` beyanı ve bir `./client` dışa aktarımı. Ardından o bundle'ı servis eder ve dışa aktardığı `apply` fonksiyonunu istemcinin Cordis fiber'i içinde çağırır.

Bundle yalnızca belgelenmiş genel API'yi çağırır ve hiçbir özel iç yapıya dokunmaz; bu yüzden istemci geliştikçe çalışmaya devam eder — yeni arayüz metinleri burada çevrilene kadar İngilizce görünür.

## Geliştirme

Node.js 22.19 veya üzeri gerekir (dsh ile aynı taban; `node --test` glob desteği için de gerekli). Bağımlılık yoktur.

```sh
npm run build        # src/dictionaries/ içinden lib/client.js üretir
npm run verify       # bundle'ı yükleyici kum havuzunda yükleyip kayıtlarını doğrular
npm test             # sözlük bütünlüğü, yer tutucu, CJK ve manifest kapıları
npm run test:all     # verify + test
```

### Entegrasyon testi

`npm test` paketin doğru biçimde üretildiğini kanıtlar. Türkçenin gerçekten çözümlendiğini de kanıtlamak için entegrasyon paketini kurulu bir uygulamaya karşı çalıştırın — uygulamanın kendi sözlüklerini alır, bu paketi üzerlerine yükler ve locale servisinin gerçek arama algoritmasını çalıştırır:

```sh
npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
DSH_EXTRACT=.dsh-extract npm run test:e2e
```

Testler şunları doğrular: 1.870 çevrilmiş anahtarın tamamı kaydedilen Türkçe değere çözümleniyor, yer tutucular hâlâ değiştiriliyor, bir özellik ad alanı `common` sözlüğüne düşüyor ve İngilizce seçildiğinde arayüz yine İngilizce. `DSH_EXTRACT` verilmezse paket gerekçesiyle atlanır, böylece temiz bir kopyada `npm test` yeşil kalır.

### dsh ile uyumu korumak

Bir dil paketi, hedeflediği sürümün metinlerine bağlıdır: dsh yeni anahtar eklerse bunlar İngilizceye düşer; anahtar kaldırırsa bu paket ölü kayıtlar taşır. İkisi de bir şeyi bozmaz, dolayısıyla kayma kendiliğinden görünmez.

```sh
# app.asar'ı bir kez çıkarın, sonra tam paket kümesiyle karşılaştırın
npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
npm run check:drift -- --packages .dsh-extract/dsh/node_modules/@deepseek-ai
npm run extract -- --packages .dsh-extract/dsh/node_modules/@deepseek-ai
```

`check:drift` anahtar eksikse sıfırdan farklı çıkar, yani CI kapısı olarak kullanılabilir. `extract` ise `src/dictionaries/` dizinini yeniden yazar ama **mevcut çevirilerin tamamını korur** — yalnızca gerçekten yeni anahtarlar `null` olarak görünür. Onları çevirip `npm run build` çalıştırın.

`scripts/dsh-app.mjs` kurulu uygulamayı kendiliğinden bulur; ancak masaüstü kurulumu paketlerin çoğunu `app.asar` içinde tuttuğu için tam karşılaştırma adına `--packages` verin.

## Katkı

En değerli katkı Türkçe ifadelerin düzeltilmesidir. `src/dictionaries/<ad-alanı>.json` dosyasını düzenleyin, `npm run build && npm run test:all` çalıştırın ve pull request açın. Ayrıntılar için [CONTRIBUTING.md](CONTRIBUTING.md).

## Notlar

- Paket DeepSeek Harness `0.1.7-rc.2` sürümüne göre üretildi. DSH geliştirici önizlemesinde ve metinleri sürümler arasında değişiyor; güncellemeden sonra kayma denetimini çalıştırın.
- İngilizceyle aynı kalan değerler kasıtlıdır: biçim şablonları (`{value}M`), birim son ekleri (`{value} tok/s`), tanımlayıcılar (`compact`, `export`) ve Türkçe arayüzlerin geleneksel olarak çevirmeden bıraktığı teknoloji adları (`JSON`, `Terminal`, `Markdown`).
- Ürün adları, model kimlikleri, komut belirteçleri ve dosya uzantıları hiçbir zaman çevrilmez.

## Lisans

[MIT](LICENSE). Bu resmî olmayan bir topluluk dil paketidir ve DeepSeek AI ile bağlantılı değildir.
