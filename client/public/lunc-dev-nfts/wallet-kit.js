/* =====================================================================
   LUNC Dev NFTs — house wallet kit adapter (wallet-kit.js)
   ONE shared file for the launchpad page and the generator page.

   This is the house wallet kit our games already proved on phones
   (Garuda Dash / LUNC Grand Prix / Frog Fight ffwallet.js / the
   airdrop tool — the same code in four places), ported so the two
   NFT pages can use it WITHOUT giving up their hand-rolled
   protobuf pipeline. The kit machinery below (CosmosKit core /
   keplr / station / walletconnect bundles lazily loaded from
   esm.sh, the custom Galaxy Station WC wallet, the LUNCDash legacy
   WalletConnect v1 client over https://walletconnect.luncdash.com,
   Keplr injected + Keplr Mobile deep link, QR pairing UI) is copied
   near-verbatim from frog-fight/ffwallet.js; the game-specific
   parts (boost reads, panels, fa2SendLunc) are replaced by:

   THE ADAPTER — window.LDWalletKit.provider() returns ONE
   Keplr-shaped provider { enable, getKey, signDirect,
   experimentalSuggestChain? } for whichever wallet the user
   adopted, so the pages keep calling the exact same three methods
   they always called:
     - Keplr (injected): the REAL window.keplr, untouched.
     - Keplr Mobile / Galaxy Station / Station (CosmosKit chain
       wallets): signDirect delegates to the chain wallet's direct
       offline signer (the Grand Prix kitPay pattern:
       initOfflineSigner('direct') -> offlineSigner.signDirect) —
       bodyBytes / authInfoBytes pass through byte-identical.
     - LUNCDash (legacy WC v1): AMINO ONLY. The wallet speaks
       terra_signAmino (the Garuda DEX __dexDashSign flow), so the
       adapter decodes the page's TxBody/AuthInfo protobuf into a
       StdSignDoc (CosmJS 0.33 wasm amino converters, mirrored
       field-for-field), has LUNCDash sign it, then reassembles
       body/authInfo from the RETURNED signed doc with
       SIGN_MODE_LEGACY_AMINO_JSON — exactly what CosmJS does with
       an amino signer in the proven DEX flow.

   The pages own all status text (#walletLine, logs); this file
   only writes status through the callbacks the pages register in
   LDWalletKit.init({ onAdopt, onStatus, onError }).
   ===================================================================== */
(function(){
"use strict";

/* ---------------- i18n: ONLY the strings this file adds ----------------
   Button labels are proper nouns derived from the page's own
   connectBtn text; Copy/Copied are reused from the page dictionary.
   Everything else user-facing that originates here is in this table,
   all 18 languages, keyed like the pages' #lang select. */
var WK_STR = {
en:{opening:"Opening {w}…",approve:"Approve the connection in {w} — then come back here…",pairScan:"Scan the QR code with {w} — or copy the pairing link into its WalletConnect scanner.",open:"Open {w}",close:"Close",fail:"{w} couldn't connect — nothing connected. Try again, or pick another wallet.",rejected:"Connection rejected in {w} — nothing connected.",dashHint:"Tap OPEN LUNCDASH — approve in the app. If it doesn't open, copy the link and paste it into LUNCDash's WalletConnect scanner.",notLive:"{w} session is not live — connect {w} again.",noSig:"{w} did not return a signature — nothing was sent.",timeout:"Signing in {w} timed out — nothing was sent."},
es:{opening:"Abriendo {w}…",approve:"Aprueba la conexión en {w} — luego vuelve aquí…",pairScan:"Escanea el código QR con {w} — o copia el enlace de emparejamiento en su escáner de WalletConnect.",open:"Abrir {w}",close:"Cerrar",fail:"{w} no pudo conectarse — no se conectó nada. Inténtalo de nuevo o elige otra billetera.",rejected:"Conexión rechazada en {w} — no se conectó nada.",dashHint:"Toca ABRIR LUNCDASH — aprueba en la app. Si no se abre, copia el enlace y pégalo en el escáner de WalletConnect de LUNCDash.",notLive:"La sesión de {w} no está activa — conecta {w} de nuevo.",noSig:"{w} no devolvió una firma — no se envió nada.",timeout:"La firma en {w} agotó el tiempo — no se envió nada."},
fr:{opening:"Ouverture de {w}…",approve:"Approuvez la connexion dans {w} — puis revenez ici…",pairScan:"Scannez le QR code avec {w} — ou copiez le lien d'appairage dans son scanner WalletConnect.",open:"Ouvrir {w}",close:"Fermer",fail:"{w} n'a pas pu se connecter — rien n'est connecté. Réessayez ou choisissez un autre portefeuille.",rejected:"Connexion refusée dans {w} — rien n'est connecté.",dashHint:"Touchez OUVRIR LUNCDASH — approuvez dans l'app. Si elle ne s'ouvre pas, copiez le lien et collez-le dans le scanner WalletConnect de LUNCDash.",notLive:"La session {w} n'est pas active — reconnectez {w}.",noSig:"{w} n'a pas renvoyé de signature — rien n'a été envoyé.",timeout:"La signature dans {w} a expiré — rien n'a été envoyé."},
de:{opening:"{w} wird geöffnet…",approve:"Bestätige die Verbindung in {w} — und komm dann hierher zurück…",pairScan:"Scanne den QR-Code mit {w} — oder kopiere den Pairing-Link in seinen WalletConnect-Scanner.",open:"{w} öffnen",close:"Schließen",fail:"{w} konnte sich nicht verbinden — nichts ist verbunden. Versuch es erneut oder wähle eine andere Wallet.",rejected:"Verbindung in {w} abgelehnt — nichts ist verbunden.",dashHint:"Tippe auf LUNCDASH ÖFFNEN — bestätige in der App. Wenn sie sich nicht öffnet, kopiere den Link und füge ihn in den WalletConnect-Scanner von LUNCDash ein.",notLive:"Die {w}-Sitzung ist nicht aktiv — verbinde {w} erneut.",noSig:"{w} hat keine Signatur zurückgegeben — es wurde nichts gesendet.",timeout:"Die Signatur in {w} ist abgelaufen — es wurde nichts gesendet."},
it:{opening:"Apertura di {w}…",approve:"Approva la connessione in {w} — poi torna qui…",pairScan:"Scansiona il codice QR con {w} — oppure copia il link di abbinamento nel suo scanner WalletConnect.",open:"Apri {w}",close:"Chiudi",fail:"{w} non è riuscito a connettersi — non è connesso nulla. Riprova o scegli un altro wallet.",rejected:"Connessione rifiutata in {w} — non è connesso nulla.",dashHint:"Tocca APRI LUNCDASH — approva nell'app. Se non si apre, copia il link e incollalo nello scanner WalletConnect di LUNCDash.",notLive:"La sessione di {w} non è attiva — connetti di nuovo {w}.",noSig:"{w} non ha restituito una firma — non è stato inviato nulla.",timeout:"La firma in {w} è scaduta — non è stato inviato nulla."},
pt:{opening:"Abrindo {w}…",approve:"Aprove a conexão em {w} — depois volte aqui…",pairScan:"Escaneie o QR code com {w} — ou copie o link de pareamento no scanner WalletConnect dele.",open:"Abrir {w}",close:"Fechar",fail:"{w} não conseguiu conectar — nada foi conectado. Tente de novo ou escolha outra carteira.",rejected:"Conexão rejeitada em {w} — nada foi conectado.",dashHint:"Toque em ABRIR LUNCDASH — aprove no app. Se ele não abrir, copie o link e cole no scanner WalletConnect do LUNCDash.",notLive:"A sessão do {w} não está ativa — conecte o {w} novamente.",noSig:"O {w} não retornou uma assinatura — nada foi enviado.",timeout:"A assinatura no {w} expirou — nada foi enviado."},
nl:{opening:"{w} openen…",approve:"Keur de verbinding goed in {w} — kom daarna hier terug…",pairScan:"Scan de QR-code met {w} — of kopieer de koppelingslink naar zijn WalletConnect-scanner.",open:"Open {w}",close:"Sluiten",fail:"{w} kon geen verbinding maken — er is niets verbonden. Probeer opnieuw of kies een andere wallet.",rejected:"Verbinding geweigerd in {w} — er is niets verbonden.",dashHint:"Tik op LUNCDASH OPENEN — keur goed in de app. Als de app niet opent, kopieer de link en plak hem in de WalletConnect-scanner van LUNCDash.",notLive:"De {w}-sessie is niet actief — verbind {w} opnieuw.",noSig:"{w} gaf geen handtekening terug — er is niets verzonden.",timeout:"Het ondertekenen in {w} duurde te lang — er is niets verzonden."},
pl:{opening:"Otwieranie {w}…",approve:"Zatwierdź połączenie w {w} — potem wróć tutaj…",pairScan:"Zeskanuj kod QR za pomocą {w} — albo skopiuj link parowania do jego skanera WalletConnect.",open:"Otwórz {w}",close:"Zamknij",fail:"{w} nie mógł się połączyć — nic nie jest połączone. Spróbuj ponownie lub wybierz inny portfel.",rejected:"Połączenie odrzucone w {w} — nic nie jest połączone.",dashHint:"Dotknij OTWÓRZ LUNCDASH — zatwierdź w aplikacji. Jeśli się nie otworzy, skopiuj link i wklej go do skanera WalletConnect w LUNCDash.",notLive:"Sesja {w} nie jest aktywna — połącz {w} ponownie.",noSig:"{w} nie zwrócił podpisu — nic nie zostało wysłane.",timeout:"Podpisywanie w {w} przekroczyło czas — nic nie zostało wysłane."},
ru:{opening:"Открытие {w}…",approve:"Подтвердите подключение в {w} — затем вернитесь сюда…",pairScan:"Отсканируйте QR-код с помощью {w} — или скопируйте ссылку сопряжения в его сканер WalletConnect.",open:"Открыть {w}",close:"Закрыть",fail:"{w} не смог подключиться — ничего не подключено. Попробуйте ещё раз или выберите другой кошелёк.",rejected:"Подключение отклонено в {w} — ничего не подключено.",dashHint:"Нажмите ОТКРЫТЬ LUNCDASH — подтвердите в приложении. Если оно не открылось, скопируйте ссылку и вставьте её в сканер WalletConnect в LUNCDash.",notLive:"Сессия {w} неактивна — подключите {w} снова.",noSig:"{w} не вернул подпись — ничего не было отправлено.",timeout:"Время подписи в {w} истекло — ничего не было отправлено."},
uk:{opening:"Відкриття {w}…",approve:"Підтвердьте підключення в {w} — потім поверніться сюди…",pairScan:"Відскануйте QR-код за допомогою {w} — або скопіюйте посилання для сполучення в його сканер WalletConnect.",open:"Відкрити {w}",close:"Закрити",fail:"{w} не зміг підключитися — нічого не підключено. Спробуйте ще раз або виберіть інший гаманець.",rejected:"Підключення відхилено в {w} — нічого не підключено.",dashHint:"Натисніть ВІДКРИТИ LUNCDASH — підтвердьте в застосунку. Якщо він не відкрився, скопіюйте посилання та вставте його в сканер WalletConnect у LUNCDash.",notLive:"Сесія {w} неактивна — підключіть {w} знову.",noSig:"{w} не повернув підпис — нічого не було надіслано.",timeout:"Час підпису в {w} минув — нічого не було надіслано."},
tr:{opening:"{w} açılıyor…",approve:"{w} içinde bağlantıyı onayla — sonra buraya geri dön…",pairScan:"QR kodunu {w} ile tara — veya eşleştirme bağlantısını onun WalletConnect tarayıcısına kopyala.",open:"{w} uygulamasını aç",close:"Kapat",fail:"{w} bağlanamadı — hiçbir şey bağlanmadı. Tekrar dene veya başka bir cüzdan seç.",rejected:"{w} içinde bağlantı reddedildi — hiçbir şey bağlanmadı.",dashHint:"LUNCDASH'İ AÇ'a dokun — uygulamada onayla. Uygulama açılmazsa bağlantıyı kopyalayıp LUNCDash'in WalletConnect tarayıcısına yapıştır.",notLive:"{w} oturumu aktif değil — {w} cüzdanını yeniden bağla.",noSig:"{w} bir imza döndürmedi — hiçbir şey gönderilmedi.",timeout:"{w} içinde imzalama zaman aşımına uğradı — hiçbir şey gönderilmedi."},
ar:{opening:"جارٍ فتح {w}…",approve:"وافق على الاتصال في {w} — ثم عد إلى هنا…",pairScan:"امسح رمز QR باستخدام {w} — أو انسخ رابط الإقران إلى ماسح WalletConnect الخاص به.",open:"فتح {w}",close:"إغلاق",fail:"تعذّر على {w} الاتصال — لم يتم اتصال أي شيء. حاول مرة أخرى أو اختر محفظة أخرى.",rejected:"تم رفض الاتصال في {w} — لم يتم اتصال أي شيء.",dashHint:"اضغط فتح LUNCDASH — وافق في التطبيق. إذا لم يفتح، انسخ الرابط والصقه في ماسح WalletConnect في LUNCDash.",notLive:"جلسة {w} ليست نشطة — اتصل بـ{w} مرة أخرى.",noSig:"لم يُعد {w} توقيعًا — لم يتم إرسال أي شيء.",timeout:"انتهت مهلة التوقيع في {w} — لم يتم إرسال أي شيء."},
fa:{opening:"در حال باز کردن {w}…",approve:"اتصال را در {w} تأیید کن — سپس به اینجا برگرد…",pairScan:"کد QR را با {w} اسکن کن — یا پیوند جفت‌سازی را در اسکنر WalletConnect آن کپی کن.",open:"باز کردن {w}",close:"بستن",fail:"{w} نتوانست متصل شود — چیزی متصل نشد. دوباره تلاش کن یا کیف پول دیگری انتخاب کن.",rejected:"اتصال در {w} رد شد — چیزی متصل نشد.",dashHint:"روی باز کردن LUNCDASH بزن — در برنامه تأیید کن. اگر باز نشد، پیوند را کپی و در اسکنر WalletConnect لونک‌دش بچسبان.",notLive:"نشست {w} فعال نیست — {w} را دوباره متصل کن.",noSig:"{w} امضایی برنگرداند — چیزی ارسال نشد.",timeout:"مهلت امضا در {w} تمام شد — چیزی ارسال نشد."},
hi:{opening:"{w} खोला जा रहा है…",approve:"{w} में कनेक्शन स्वीकृत करें — फिर यहाँ वापस आएँ…",pairScan:"{w} से QR कोड स्कैन करें — या पेयरिंग लिंक को उसके WalletConnect स्कैनर में कॉपी करें।",open:"{w} खोलें",close:"बंद करें",fail:"{w} कनेक्ट नहीं हो सका — कुछ भी कनेक्ट नहीं हुआ। फिर से कोशिश करें या दूसरा वॉलेट चुनें।",rejected:"{w} में कनेक्शन अस्वीकार किया गया — कुछ भी कनेक्ट नहीं हुआ।",dashHint:"LUNCDASH खोलें पर टैप करें — ऐप में स्वीकृत करें। अगर ऐप न खुले, तो लिंक कॉपी करके LUNCDash के WalletConnect स्कैनर में चिपकाएँ।",notLive:"{w} सत्र सक्रिय नहीं है — {w} फिर से कनेक्ट करें।",noSig:"{w} ने हस्ताक्षर नहीं लौटाया — कुछ नहीं भेजा गया।",timeout:"{w} में हस्ताक्षर का समय समाप्त — कुछ नहीं भेजा गया।"},
bn:{opening:"{w} খোলা হচ্ছে…",approve:"{w}-এ সংযোগ অনুমোদন করুন — তারপর এখানে ফিরে আসুন…",pairScan:"{w} দিয়ে QR কোড স্ক্যান করুন — অথবা পেয়ারিং লিংকটি তার WalletConnect স্ক্যানারে কপি করুন।",open:"{w} খুলুন",close:"বন্ধ করুন",fail:"{w} সংযুক্ত হতে পারেনি — কিছুই সংযুক্ত হয়নি। আবার চেষ্টা করুন বা অন্য ওয়ালেট বেছে নিন।",rejected:"{w}-এ সংযোগ প্রত্যাখ্যাত হয়েছে — কিছুই সংযুক্ত হয়নি।",dashHint:"LUNCDash খুলুন-এ ট্যাপ করুন — অ্যাপে অনুমোদন করুন। অ্যাপ না খুললে লিংক কপি করে LUNCDash-এর WalletConnect স্ক্যানারে পেস্ট করুন।",notLive:"{w} সেশন সক্রিয় নয় — {w} আবার সংযুক্ত করুন।",noSig:"{w} স্বাক্ষর ফেরত দেয়নি — কিছুই পাঠানো হয়নি।",timeout:"{w}-এ স্বাক্ষরের সময় শেষ — কিছুই পাঠানো হয়নি।"},
zh:{opening:"正在打开 {w}…",approve:"在 {w} 中批准连接 — 然后回到这里…",pairScan:"用 {w} 扫描二维码 — 或将配对链接复制到它的 WalletConnect 扫描器中。",open:"打开 {w}",close:"关闭",fail:"{w} 无法连接 — 尚未连接任何钱包。再试一次，或选择其他钱包。",rejected:"在 {w} 中连接被拒绝 — 尚未连接任何钱包。",dashHint:"点按打开 LUNCDASH — 在应用中批准。如果应用没有打开，复制链接并粘贴到 LUNCDash 的 WalletConnect 扫描器中。",notLive:"{w} 会话未激活 — 请重新连接 {w}。",noSig:"{w} 未返回签名 — 未发送任何内容。",timeout:"在 {w} 中签名超时 — 未发送任何内容。"},
ja:{opening:"{w} を開いています…",approve:"{w} で接続を承認してください — その後ここに戻ってください…",pairScan:"{w} でQRコードをスキャンするか、ペアリングリンクをその WalletConnect スキャナーにコピーしてください。",open:"{w} を開く",close:"閉じる",fail:"{w} に接続できませんでした — 何も接続されていません。もう一度試すか、別のウォレットを選んでください。",rejected:"{w} で接続が拒否されました — 何も接続されていません。",dashHint:"「LUNCDASH を開く」をタップし、アプリで承認してください。開かない場合は、リンクをコピーして LUNCDash の WalletConnect スキャナーに貼り付けてください。",notLive:"{w} のセッションが有効ではありません — {w} を再接続してください。",noSig:"{w} が署名を返しませんでした — 何も送信されていません。",timeout:"{w} での署名がタイムアウトしました — 何も送信されていません。"},
ko:{opening:"{w} 여는 중…",approve:"{w}에서 연결을 승인한 뒤 여기로 돌아오세요…",pairScan:"{w}(으)로 QR 코드를 스캔하거나 페어링 링크를 해당 WalletConnect 스캐너에 복사하세요.",open:"{w} 열기",close:"닫기",fail:"{w}에 연결할 수 없습니다 — 아무것도 연결되지 않았습니다. 다시 시도하거나 다른 지갑을 선택하세요.",rejected:"{w}에서 연결이 거부되었습니다 — 아무것도 연결되지 않았습니다.",dashHint:"LUNCDASH 열기를 탭하고 앱에서 승인하세요. 앱이 열리지 않으면 링크를 복사해 LUNCDash의 WalletConnect 스캐너에 붙여넣으세요.",notLive:"{w} 세션이 활성화되어 있지 않습니다 — {w}를 다시 연결하세요.",noSig:"{w}가 서명을 반환하지 않았습니다 — 아무것도 전송되지 않았습니다.",timeout:"{w}에서 서명 시간이 초과되었습니다 — 아무것도 전송되지 않았습니다."}
};
function wkLang(){
  var sel = document.getElementById("lang");
  var v = sel && sel.value;
  return WK_STR[v] ? v : "en";
}
function wkT(key, w){
  var s = (WK_STR[wkLang()] || WK_STR.en)[key] || WK_STR.en[key] || key;
  return w ? s.split("{w}").join(w) : s;
}
function wkPageStr(key, fallback){
  try {
    var d = window.I18N && window.I18N[wkLang()];
    if (d && d[key]) return d[key];
    if (window.I18N && window.I18N.en && window.I18N.en[key]) return window.I18N.en[key];
  } catch (e) {}
  return fallback;
}

/* ---------------- session + host callbacks ---------------- */
var CHAIN_ID = "columbus-5";
var wkSession = null;   /* { via, label, address, cw?, walletName?, wc? } */
var wkHost = { onAdopt: null, onStatus: null, onError: null };
function wkStatus(msg){ if (wkHost.onStatus) wkHost.onStatus(msg); }
function wkError(msg){ if (wkHost.onError) wkHost.onError(msg); else wkStatus(msg); }
function wkValidAddr(a){ return /^terra1[02-9ac-hj-np-z]{38}$/.test(String(a || "")); }
var wkIsMobileUA = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

/* =====================================================================
   Tiny protobuf codec + the LUNCDash amino bridge.
   The pages build TxBody/AuthInfo with their own writer; this is
   the mirror reader/writer the amino path needs. Only the two wasm
   message types these pages ever send are convertible — anything
   else throws, honestly, instead of signing a wrong doc.
   ===================================================================== */
function pbVarintRead(buf, pos){
  var result = 0n, shift = 0n;
  while (pos < buf.length){
    var b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return { value: result, pos: pos };
}
function pbReadFields(buf){
  var fields = [], pos = 0;
  while (pos < buf.length){
    var t = pbVarintRead(buf, pos); pos = t.pos;
    var field = Number(t.value >> 3n), wire = Number(t.value & 7n);
    if (wire === 0){
      var v = pbVarintRead(buf, pos); pos = v.pos;
      fields.push({ field: field, wire: 0, varint: v.value });
    } else if (wire === 2){
      var l = pbVarintRead(buf, pos); pos = l.pos;
      var len = Number(l.value);
      fields.push({ field: field, wire: 2, bytes: buf.slice(pos, pos + len) });
      pos += len;
    } else if (wire === 5){ fields.push({ field: field, wire: 5, bytes: buf.slice(pos, pos + 4) }); pos += 4; }
    else if (wire === 1){ fields.push({ field: field, wire: 1, bytes: buf.slice(pos, pos + 8) }); pos += 8; }
    else throw new Error("protobuf: bad wire type " + wire);
  }
  return fields;
}
function pbField(fields, n){ for (var i = 0; i < fields.length; i++) if (fields[i].field === n) return fields[i]; return null; }
function pbFields(fields, n){ return fields.filter(function(f){ return f.field === n; }); }
function pbUtf8(bytes){ return new TextDecoder("utf-8").decode(bytes); }
function pbStrField(fields, n){ var f = pbField(fields, n); return f ? pbUtf8(f.bytes) : ""; }
function pbVarField(fields, n){ var f = pbField(fields, n); return f && f.varint !== undefined ? f.varint : 0n; }
/* writer — same shapes as the pages' writer */
function pbVarintBytes(n){ var out = [], v = BigInt(n); do { var b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; }
function pbTag(field, wire){ return pbVarintBytes(field * 8 + wire); }
function pbFieldBytes(field, bytes){ return [].concat(pbTag(field, 2), pbVarintBytes(bytes.length), bytes); }
function pbFieldStr(field, str){ if (str === "" || str == null) return []; return pbFieldBytes(field, Array.prototype.slice.call(new TextEncoder().encode(str))); }
function pbFieldVar(field, n){ if (!n || BigInt(n) === 0n) return []; return [].concat(pbTag(field, 0), pbVarintBytes(n)); }
function pbU8(arr){ return new Uint8Array(arr); }
function pbSlice(u8arr){ return Array.prototype.slice.call(u8arr); }
function pbCoinFromProto(bytes){
  var f = pbReadFields(bytes);
  return { denom: pbStrField(f, 1), amount: pbStrField(f, 2) };
}
function pbCoinToProto(coin){
  return pbU8([].concat(pbFieldStr(1, coin.denom), pbFieldStr(2, String(coin.amount))));
}
/* MsgInstantiateContract{sender=1, admin=2, code_id=3, label=4, msg=5, funds=6} */
function wasmInstantiateToAmino(valueBytes){
  var f = pbReadFields(valueBytes);
  var funds = pbFields(f, 6).map(function(x){ return pbCoinFromProto(x.bytes); });
  var value = {
    sender: pbStrField(f, 1),
    code_id: pbVarField(f, 3).toString(),
    label: pbStrField(f, 4),
    msg: JSON.parse(pbUtf8(pbField(f, 5).bytes)),
    funds: funds
  };
  var admin = pbStrField(f, 2);
  if (admin) value.admin = admin;   /* CosmJS omitDefault(admin) */
  return { type: "wasm/MsgInstantiateContract", value: value };
}
function wasmInstantiateFromAmino(value){
  var msgBytes = new TextEncoder().encode(JSON.stringify(value.msg));
  var parts = [].concat(
    pbFieldStr(1, value.sender),
    pbFieldStr(2, value.admin || ""),
    pbFieldVar(3, BigInt(value.code_id)),
    pbFieldStr(4, value.label || ""),
    pbFieldBytes(5, Array.prototype.slice.call(msgBytes)));
  (value.funds || []).forEach(function(c){ parts = parts.concat(pbFieldBytes(6, pbSlice(pbCoinToProto(c)))); });
  return pbU8(parts);
}
/* MsgExecuteContract{sender=1, contract=2, msg=3, funds=4} */
function wasmExecuteToAmino(valueBytes){
  var f = pbReadFields(valueBytes);
  var funds = pbFields(f, 4).map(function(x){ return pbCoinFromProto(x.bytes); });
  return { type: "wasm/MsgExecuteContract", value: {
    sender: pbStrField(f, 1),
    contract: pbStrField(f, 2),
    msg: JSON.parse(pbUtf8(pbField(f, 3).bytes)),
    funds: funds
  } };
}
function wasmExecuteFromAmino(value){
  var msgBytes = new TextEncoder().encode(JSON.stringify(value.msg));
  var parts = [].concat(
    pbFieldStr(1, value.sender),
    pbFieldStr(2, value.contract),
    pbFieldBytes(3, Array.prototype.slice.call(msgBytes)));
  (value.funds || []).forEach(function(c){ parts = parts.concat(pbFieldBytes(4, pbSlice(pbCoinToProto(c)))); });
  return pbU8(parts);
}
var AMINO_CONVERTERS = {
  "/cosmwasm.wasm.v1.MsgInstantiateContract": { toAmino: wasmInstantiateToAmino, fromAmino: wasmInstantiateFromAmino },
  "/cosmwasm.wasm.v1.MsgExecuteContract": { toAmino: wasmExecuteToAmino, fromAmino: wasmExecuteFromAmino }
};
function anyToAmino(anyBytes){
  var f = pbReadFields(anyBytes);
  var typeUrl = pbStrField(f, 1);
  var conv = AMINO_CONVERTERS[typeUrl];
  if (!conv) throw new Error("LUNCDash cannot sign this message type (" + typeUrl + ") — use Keplr or Galaxy Station for it.");
  return conv.toAmino(pbField(f, 2).bytes);
}
function anyFromAmino(aminoMsg){
  for (var url in AMINO_CONVERTERS){
    var conv = AMINO_CONVERTERS[url];
    var probe = { "/cosmwasm.wasm.v1.MsgInstantiateContract": "wasm/MsgInstantiateContract", "/cosmwasm.wasm.v1.MsgExecuteContract": "wasm/MsgExecuteContract" }[url];
    if (probe === aminoMsg.type){
      var valueBytes = conv.fromAmino(aminoMsg.value);
      return pbU8([].concat(pbFieldStr(1, url), pbFieldBytes(2, pbSlice(valueBytes))));
    }
  }
  throw new Error("LUNCDash returned an unknown message type (" + aminoMsg.type + ") — nothing was sent.");
}
/* TxBody/AuthInfo -> the pieces a StdSignDoc needs (and back) */
function aminoDocFromTxBytes(bodyBytes, authInfoBytes){
  var bf = pbReadFields(bodyBytes);
  var msgs = pbFields(bf, 1).map(function(x){ return anyToAmino(x.bytes); });
  var memo = pbStrField(bf, 2);
  var af = pbReadFields(authInfoBytes);
  var signerInfo = pbField(af, 1);
  var sif = signerInfo ? pbReadFields(signerInfo.bytes) : [];
  var pubAny = pbField(sif, 1);
  var sequence = pbVarField(sif, 3);
  var feeF = pbField(af, 2);
  var ff = feeF ? pbReadFields(feeF.bytes) : [];
  var amount = pbFields(ff, 1).map(function(x){ return pbCoinFromProto(x.bytes); });
  var gas = pbVarField(ff, 2);
  return {
    msgs: msgs, memo: memo,
    fee: { amount: amount, gas: gas.toString() },
    sequence: sequence.toString(),
    pubAnyBytes: pubAny ? pubAny.bytes : null
  };
}
function txBodyFromAmino(msgs, memo){
  var parts = [];
  (msgs || []).forEach(function(m){ parts = parts.concat(pbFieldBytes(1, pbSlice(anyFromAmino(m)))); });
  parts = parts.concat(pbFieldStr(2, memo || ""));
  return pbU8(parts);
}
function authInfoFromAmino(signed, pubAnyBytes){
  /* SignerInfo{ public_key = the SAME Any the page built,
     mode_info = single{ LEGACY_AMINO_JSON = 2 }, sequence } —
     the page's writer with the mode flipped, fee from the
     wallet-returned signed doc (CosmJS amino assembly parity). */
  var modeInfo = pbU8(pbFieldBytes(1, pbSlice(pbU8(pbFieldVar(1, 2)))));
  var signerInfo = pbU8([].concat(
    pubAnyBytes ? pbFieldBytes(1, pbSlice(pubAnyBytes)) : [],
    pbFieldBytes(2, pbSlice(modeInfo)),
    pbFieldVar(3, BigInt(signed.sequence || "0"))));
  var feeParts = [];
  var amt = (signed.fee && signed.fee.amount) || [];
  amt.forEach(function(c){ feeParts = feeParts.concat(pbFieldBytes(1, pbSlice(pbCoinToProto(c)))); });
  feeParts = feeParts.concat(pbFieldVar(2, BigInt((signed.fee && signed.fee.gas) || "0")));
  var fee = pbU8(feeParts);
  return pbU8([].concat(pbFieldBytes(1, pbSlice(signerInfo)), pbFieldBytes(2, pbSlice(fee))));
}

/* =====================================================================
   Pairing UI — the kit's pair box as a modal in the pages' Sample A
   design. The kit clients hold the pairing URI (WC v2: client.qrUrl;
   LUNCDash: the legacy connector's wc.uri); on a phone the WC v2
   clients redirect into the wallet app themselves and no box is
   needed; anywhere else the box offers the QR + the raw link for
   the wallet's own WalletConnect scanner.
   ===================================================================== */
var wkModal = null;
function wkEnsureModal(){
  if (wkModal) return wkModal;
  var css = document.createElement("style");
  css.textContent =
    ".wk-ovl{position:fixed;inset:0;z-index:9990;background:rgba(4,8,6,.78);display:none;align-items:center;justify-content:center;padding:18px}" +
    ".wk-ovl.on{display:flex}" +
    ".wk-box{background:linear-gradient(180deg,#121d17,#0e1512);border:1px solid #2b4237;border-radius:22px;max-width:400px;width:100%;padding:24px;color:#e8f1ec;box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".wk-box h3{font-size:20px;font-weight:800;margin:0 0 6px}" +
    ".wk-box h3 .wk-gold{color:#e8b33c}" +
    ".wk-hint{font-size:14px;line-height:1.55;color:#8fa89b;margin:0 0 14px}" +
    ".wk-qr{display:none;margin:0 auto 14px;background:#fff;border-radius:12px}" +
    ".wk-uri{width:100%;box-sizing:border-box;background:#0a100c;border:1px solid #1f2f27;border-radius:12px;color:#e8f1ec;font-size:12px;padding:11px;margin:0 0 12px;word-break:break-all}" +
    ".wk-row{display:flex;gap:10px;flex-wrap:wrap}" +
    ".wk-btn{flex:1;min-height:48px;padding:12px 14px;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid #2b4237;background:rgba(255,255,255,.03);color:#e8f1ec;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}" +
    ".wk-btn.gold{background:linear-gradient(180deg,#f5cd6b,#e8b33c);color:#241a02;border-color:transparent}" +
    ".wk-status{font-size:13.5px;color:#8fa89b;line-height:1.5;margin-top:12px;min-height:18px}";
  document.head.appendChild(css);
  var ovl = document.createElement("div");
  ovl.className = "wk-ovl"; ovl.id = "wkPairOvl";
  ovl.innerHTML =
    '<div class="wk-box" role="dialog" aria-modal="true">' +
      '<h3><span class="wk-gold">✦</span> <span id="wkPairTitle"></span></h3>' +
      '<p class="wk-hint" id="wkPairHint"></p>' +
      '<canvas class="wk-qr" id="wkPairQr" width="180" height="180"></canvas>' +
      '<input class="wk-uri" id="wkPairUri" readonly value="">' +
      '<div class="wk-row">' +
        '<a class="wk-btn gold" id="wkPairOpen" href="#" style="display:none"></a>' +
        '<button type="button" class="wk-btn" id="wkPairCopy"></button>' +
        '<button type="button" class="wk-btn" id="wkPairClose"></button>' +
      "</div>" +
      '<div class="wk-status" id="wkPairStatus"></div>' +
    "</div>";
  document.body.appendChild(ovl);
  ovl.querySelector("#wkPairClose").addEventListener("click", function(){ wkHidePair(); });
  ovl.querySelector("#wkPairCopy").addEventListener("click", function(){
    var inp = ovl.querySelector("#wkPairUri");
    var uri = inp ? inp.value : "";
    if (!uri) return;
    var done = function(){ ovl.querySelector("#wkPairCopy").textContent = wkPageStr("copied", "Copied ✓"); };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(uri).then(done).catch(function(){ try { inp.select(); document.execCommand("copy"); done(); } catch (e) {} });
    else { try { inp.select(); document.execCommand("copy"); done(); } catch (e) {} }
  });
  wkModal = ovl;
  return ovl;
}
var wkQrPromise = null;
function wkRenderQr(uri){
  var cv = wkEnsureModal().querySelector("#wkPairQr");
  if (!cv) return;
  if (!wkQrPromise){
    wkQrPromise = import("https://esm.sh/qrcode@1.5.4?bundle")
      .then(function(m){ return m.default || m; })
      .catch(function(err){ wkQrPromise = null; throw err; });
  }
  wkQrPromise.then(function(QR){
    if (!QR || typeof QR.toCanvas !== "function") return;
    QR.toCanvas(cv, uri, { width: 180, margin: 1 }, function(err){ if (!err) cv.style.display = "block"; });
  }).catch(function(){ /* QR is a bonus — the raw link + copy still work */ });
}
function wkShowPair(uri, pretty, opts){
  opts = opts || {};
  var ovl = wkEnsureModal();
  ovl.querySelector("#wkPairTitle").textContent = pretty;
  ovl.querySelector("#wkPairHint").textContent = opts.dash ? wkT("dashHint") : wkT("pairScan", pretty);
  ovl.querySelector("#wkPairUri").value = uri;
  var copy = ovl.querySelector("#wkPairCopy");
  copy.textContent = wkPageStr("copyBtn", "Copy");
  ovl.querySelector("#wkPairClose").textContent = wkT("close");
  var open = ovl.querySelector("#wkPairOpen");
  if (opts.openHref){
    open.style.display = "";
    open.textContent = wkT("open", pretty);
    open.setAttribute("href", opts.openHref);
  } else open.style.display = "none";
  ovl.querySelector("#wkPairStatus").textContent = wkT("approve", pretty);
  ovl.classList.add("on");
  wkRenderQr(uri);
}
function wkHidePair(){
  if (!wkModal) return;
  wkModal.classList.remove("on");
  var cv = wkModal.querySelector("#wkPairQr");
  if (cv) cv.style.display = "none";
  var inp = wkModal.querySelector("#wkPairUri");
  if (inp) inp.value = "";
}
function wkPairStatus(msg){
  if (!wkModal) return;
  var st = wkModal.querySelector("#wkPairStatus");
  if (st) st.textContent = msg;
}

/* =====================================================================
   THE KIT CORE — ported from frog-fight/ffwallet.js (itself the
   proven Garuda Dash implementation). Host-specific names changed
   only where the donor called game glue.
   ===================================================================== */
/* ---- the chain definition: the LNC app's chainDef.js, verbatim
   (LCD/RPC inlined from its config.js — the publicnode endpoints).
   Columbus-5 is not in the upstream chain-registry package
   CosmosKit consumes, so the app ships its own Chain + AssetList. */
var TERRA_CLASSIC_CHAIN = {
  $schema: '../chain.schema.json',
  chain_name: 'terraclassic',
  status: 'live',
  network_type: 'mainnet',
  pretty_name: 'Terra Classic',
  chain_id: 'columbus-5',
  bech32_prefix: 'terra',
  daemon_name: 'terrad',
  node_home: '$HOME/.terra',
  slip44: 330,
  fees: {
    fee_tokens: [
      { denom: 'uluna', fixed_min_gas_price: 0.15, low_gas_price: 0.15, average_gas_price: 0.15, high_gas_price: 0.15 },
    ],
  },
  staking: { staking_tokens: [{ denom: 'uluna' }] },
  codebase: { git_repo: 'https://github.com/classic-terra/core', recommended_version: 'v4.1.1', compatible_versions: ['v4.1.1'] },
  apis: {
    rpc: [{ address: 'https://terra-classic-rpc.publicnode.com', provider: 'PublicNode' }],
    rest: [{ address: 'https://terra-classic-lcd.publicnode.com', provider: 'PublicNode' }],
    grpc: [],
  },
  explorers: [{ kind: 'Terra Finder', url: 'https://finder.terraclassic.community/mainnet', tx_page: 'https://finder.terraclassic.community/mainnet/tx/${txHash}' }],
};
var TERRA_CLASSIC_ASSETS = {
  $schema: '../assetlist.schema.json',
  chain_name: 'terraclassic',
  assets: [
    {
      description: 'The native staking and gas token of Terra Classic.',
      denom_units: [
        { denom: 'uluna', exponent: 0 },
        { denom: 'luna', exponent: 6 },
      ],
      base: 'uluna',
      name: 'Terra Luna Classic',
      display: 'luna',
      symbol: 'LUNC',
      logo_URIs: { png: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/terraclassic/images/lunc.png' },
      coingecko_id: 'terra-luna',
    },
  ],
};

/* ---- the custom Galaxy Station WalletConnect wallet: the LNC
   app's wallets.js, ported near-verbatim (the base classes arrive
   with the lazily loaded @cosmos-kit/walletconnect bundle, so the
   classes are built by this factory at load time). Galaxy Station
   is not listed in the WalletConnect explorer registry, so no
   upstream CosmosKit package exists for it; in its in-app browser
   it injects window.station, covered by the Station entry — this
   entry adds the standard pairing flow for other browsers. */
var GALAXY_STATION_LOGO = 'https://station.terraclassic.community/favicon.svg';
function galaxyKitFrom(wc){
  /* Galaxy Station has no WalletConnect Explorer listing (no
     listing ID), so WCClient's Explorer lookup leaves wcCloudInfo
     undefined and initAppUrl() throws before it can fall back to
     the registry `mobile` links below — leaving redirect
     permanently false and the modal stuck on the QR view. Seed an
     empty wcCloudInfo so the fallback is reached (the same
     pattern @cosmos-kit/keplr-mobile uses). */
  class GalaxyClient extends wc.WCClient {
    async initWCCloudInfo() {
      this.wcCloudInfo = { mobile: {} };
    }
  }
  const galaxyStationInfo = {
    name: 'galaxy-station',
    prettyName: 'Galaxy Station',
    logo: GALAXY_STATION_LOGO,
    mode: 'wallet-connect',
    mobileDisabled: false,
    rejectMessage: {
      source: 'Request rejected',
    },
    downloads: [
      {
        link: 'https://station.terraclassic.community',
      },
    ],
    supportedChains: ['terraclassic'],
    walletconnect: {
      name: 'Galaxy Station',
      /* Galaxy Station returns base64-encoded pubkeys; with the
         client default ('hex') account decoding after approval
         would be wrong. */
      encoding: 'base64',
      mobile: {
        /* Real app links, proven in the FRG app — NOT the project
           website. Android goes through the Hexxagon intent link;
           iOS only answers to its native scheme (the HTTPS site
           just loads the web dashboard and strands the user). */
        native: {
          ios: 'galaxystation:',
          android: 'https://station.hexxagon.io/wcV2',
        },
      },
      /* Composes the pairing deep link from the native app URL +
         the WalletConnect URI, modeled on @cosmos-kit/keplr-mobile:
           iOS:     galaxystation://wcV2?<encoded wc uri>
           Android: https://station.hexxagon.io/wcV2?<encoded wc uri>
                    #Intent;package=io.hexxagon.station;scheme=galaxystation;end; */
      formatNativeUrl: (appUrl, wcUri, os, _name) => {
        const encodedWcUrl = encodeURIComponent(wcUri);
        switch (os) {
          case 'ios':
            return `galaxystation://wcV2?${encodedWcUrl}`;
          case 'android':
            return `${appUrl}?${encodedWcUrl}#Intent;package=io.hexxagon.station;scheme=galaxystation;end;`;
          default:
            return `galaxystation://wcV2?${encodedWcUrl}`;
        }
      },
    },
  };
  class ChainGalaxyStation extends wc.ChainWC {
    constructor(walletInfo, chainInfo) {
      super(walletInfo, chainInfo, GalaxyClient);
    }
  }
  class GalaxyStationWallet extends wc.WCWallet {
    constructor(walletInfo) {
      super(walletInfo, ChainGalaxyStation, GalaxyClient);
    }
  }
  return { GalaxyClient, ChainGalaxyStation, GalaxyStationWallet, galaxyStationInfo };
}

/* ---- the CosmosKit libraries, loaded lazily as ES modules from
   esm.sh (plain, non-bundled entry points — the ?bundle build of
   @cosmos-kit/keplr fails to resolve on esm.sh; the plain entries
   resolve their own dependency graph and were smoke-verified on
   2026-10-28). Nothing is fetched until a connect or a restore
   actually needs the stack. The Buffer shim comes first (the LNC
   app's polyfills.js does the same): WCClient decodes account
   pubkeys with the global Buffer. */
var KIT_PROJECT_ID = '7e363f1ed5d676ecc4ae2d40c5b83fbf';   /* the Reown project id every kit instance in this repo uses (ffwallet.js / Grand Prix / airdrop tool). NOTE: frog-fight/index.html ALSO carries 'ffe9d1215a3961f45348681f9df744c1' as PACK_WC_PROJECT_ID for its separate pack flow — a different project; the kit's is this one. */
var KIT_CHAIN_NAME = 'terraclassic';   /* CosmosKit lookup key (chainDef chain_name) */
var KIT_GAS_PRICE = 28.325;   /* uluna per gas unit (manager signer options only — signing itself is the pages' own pipeline) */
var KIT_APP_URL = 'https://frg-fight-club.vercel.app/lunc-dev-nfts/';
var KIT_URLS = {
  buffer: 'https://esm.sh/buffer@6.0.3?bundle',
  core: 'https://esm.sh/@cosmos-kit/core@2.18.1',
  keplr: 'https://esm.sh/@cosmos-kit/keplr@2.17.1',
  station: 'https://esm.sh/@cosmos-kit/station@2.15.1',
  walletconnect: 'https://esm.sh/@cosmos-kit/walletconnect@2.15.1',
  stargate: 'https://esm.sh/@cosmjs/stargate@0.33.1?bundle',
};
var kitTestHook = null;   /* headless hook only — { manager } or { libs } (or the libs themselves); never set in play */
var kitLibsCache = null;
var kitLibsPromise = null;
function kitHook(){
  if (kitTestHook) return kitTestHook;
  if (typeof window !== 'undefined' && window.__ldWalletKitTestHook) return window.__ldWalletKitTestHook;
  return null;
}
function normalizeKitLibs(libs){
  if (!libs || !libs.core || !libs.core.WalletManager || !libs.keplr || !libs.station || !libs.walletconnect)
    throw new Error('the CosmosKit libraries loaded incomplete');
  if (!libs.cosmjs || !libs.cosmjs.SigningStargateClient || !libs.cosmjs.GasPrice)
    throw new Error('the signing library loaded incomplete');
  var out = {
    core: libs.core, keplr: libs.keplr, station: libs.station, walletconnect: libs.walletconnect,
    cosmjs: libs.cosmjs, galaxy: galaxyKitFrom(libs.walletconnect),
    chain: TERRA_CLASSIC_CHAIN, assets: TERRA_CLASSIC_ASSETS,
  };
  kitLibsCache = out;
  return out;
}
/* normalizeKitLibs can throw Realm-brand errors when the WC bundle
   carries its own copies of @cosmjs packages ("Expected a
   Uint8Array" / "not a valid instance") — the donor's fallback:
   drop the WC bundle's own Galaxy factory inputs and pass its base
   classes through. */
function normalizeWkKitLibs(raw){
  try { return normalizeKitLibs(raw); }
  catch (e) {
    var msg = String((e && e.message) || e);
    if (!/Uint8Array|valid instance|Realm|instanceof/.test(msg)) throw e;
    var cleaned = Object.assign({}, raw);
    try {
      var wc = Object.assign({}, raw.walletconnect);
      delete wc.GalaxyClient; delete wc.ChainGalaxyStation; delete wc.GalaxyStationWallet;
      cleaned.walletconnect = wc;
    } catch (e2) {}
    return normalizeKitLibs(cleaned);
  }
}
function loadKitLibs(){
  if (kitLibsCache) return Promise.resolve(kitLibsCache);
  var hook = kitHook();
  var hookLibs = hook && (hook.libs || (hook.core ? hook : null));
  if (hookLibs)
    return Promise.resolve().then(function(){ return (typeof hookLibs === 'function' ? hookLibs() : hookLibs); })
      .then(function(raw){ return (raw && raw.galaxy) ? raw : normalizeWkKitLibs(raw); });
  if (!kitLibsPromise){
    kitLibsPromise = Promise.resolve()
      .then(function(){ return import(KIT_URLS.buffer); })
      .then(function(bm){
        if (typeof globalThis !== 'undefined' && !globalThis.Buffer && bm && bm.Buffer) globalThis.Buffer = bm.Buffer;
        if (typeof window !== 'undefined' && !window.global) window.global = window;
      })
      .then(function(){ return Promise.all([import(KIT_URLS.core), import(KIT_URLS.keplr), import(KIT_URLS.station), import(KIT_URLS.walletconnect), import(KIT_URLS.stargate)]); })
      .then(function(mods){
        return normalizeKitLibs({
          core: mods[0], keplr: mods[1], station: mods[2], walletconnect: mods[3],
          cosmjs: { SigningStargateClient: mods[4] && mods[4].SigningStargateClient, GasPrice: mods[4] && mods[4].GasPrice },
        });
      })
      .catch(function(err){ kitLibsPromise = null; throw err; });
  }
  return kitLibsPromise;
}

/* ---- the WalletManager: the LNC app's ChainProvider wiring
   (wallets = keplr group + station group + the custom Galaxy
   wallet; the same sign-client options, with this app's name and
   URL). onMounted runs un-awaited: it initializes every
   WalletConnect client (network work) before it restores stored
   accounts, and a connect must not queue behind that — a chain
   wallet's own connect() initializes its client itself. The
   restore path awaits it under a ceiling instead. */
var kitManager = null;
var kitMountedPromise = null;
function kitNoopActions(){
  return { viewOpen(){}, viewWalletRepo(){}, data(){}, state(){}, message(){}, clientState(){}, clientMessage(){}, render(){} };
}
function ensureKitManager(){
  if (kitManager) return Promise.resolve(kitManager);
  var hook = kitHook();
  if (hook && hook.manager){
    kitManager = hook.manager;
    kitMountedPromise = Promise.resolve().then(function(){ return (kitManager.onMounted ? kitManager.onMounted() : undefined); }).catch(function(){});
    kitMountedPromise.then(function(){ wkScanAdopt(); });
    return Promise.resolve(kitManager);
  }
  return loadKitLibs().then(function(kit){
    var wallets = [].concat(kit.keplr.wallets, kit.station.wallets,
      [new kit.galaxy.GalaxyStationWallet(kit.galaxy.galaxyStationInfo)]);
    var wm = new kit.core.WalletManager(
      [kit.chain], wallets, new kit.core.Logger('WARN'), false, true, undefined,
      [kit.assets], 'icns',
      { signClient: { projectId: KIT_PROJECT_ID, metadata: {
          name: 'LUNC Dev NFTs', description: 'LUNC Dev NFTs — create and mint NFT collections on Terra Classic', url: KIT_APP_URL, icons: [],
          redirect: { native: KIT_APP_URL, universal: KIT_APP_URL } } } },
      { signingCosmwasm: function(){ return { gasPrice: kit.cosmjs.GasPrice.fromString(KIT_GAS_PRICE + 'uluna') }; },
        signingStargate: function(){ return { gasPrice: kit.cosmjs.GasPrice.fromString(KIT_GAS_PRICE + 'uluna') }; } },
      undefined, undefined);
    try {
      var acts = kitNoopActions();
      wm.setActions(acts);
      (wm.walletRepos || []).forEach(function(repo){
        if (repo.setActions) repo.setActions(acts);
        (repo.wallets || []).forEach(function(w){ if (w.setActions) w.setActions(acts); });
      });
      (wm.mainWallets || []).forEach(function(w){ if (w.setActions) w.setActions(acts); });
    } catch (e) {}
    kitManager = wm;
    kitMountedPromise = Promise.resolve().then(function(){ return wm.onMounted(); }).catch(function(){});
    /* backstop: when the mount (and its stored-account restore)
       finishes — whenever that is — adopt whatever it found */
    kitMountedPromise.then(function(){ wkScanAdopt(); });
    return wm;
  });
}

/* while a WalletConnect pairing waits, the client holds the
   pairing URI (client.qrUrl). On a phone the client redirects
   into the wallet app itself (client.redirect) and no box is
   needed; anywhere else the box offers the raw link for the
   wallet's own WalletConnect scanner. */
function watchPairing(cw, pretty){
  var stopped = false, timer = null;
  var tick = function(){
    if (stopped) return;
    try {
      var client = cw.client;
      var uri = client && client.qrUrl && client.qrUrl.data;
      if (uri && !(client && client.redirect)){
        wkShowPair(uri, pretty, {});
        wkStatus(wkT("approve", pretty));
      }
    } catch (e) {}
    if (!stopped) timer = setTimeout(tick, 500);
  };
  timer = setTimeout(tick, 600);
  return { stop: function(){ stopped = true; if (timer) clearTimeout(timer); } };
}

/* ---- adoption: the ONE door every connect route lands in ---- */
function wkAdopt(session){
  wkHidePair();
  if (!wkValidAddr(session.address)){
    wkError(wkT("fail", session.label || "Wallet"));
    return Promise.resolve(false);
  }
  wkSession = session;
  if (wkHost.onAdopt) wkHost.onAdopt(session.address, session.via, session.label);
  return Promise.resolve(true);
}
function wkFail(cw, pretty){
  wkHidePair();
  if (cw && cw.isWalletRejected) return wkError(wkT("rejected", pretty));
  var msg = cw && cw.message ? String(cw.message) : '';
  wkError(wkT("fail", pretty) + (msg ? ' (' + msg.slice(0, 90) + ')' : ''));
}

/* ---- connect ---- */
function injectedKeplr(){ try { return (typeof window !== 'undefined' && window.keplr) || null; } catch (e) { return null; } }
function injectedStation(){ try { return (typeof window !== 'undefined' && window.station) || null; } catch (e) { return null; } }
var kitConnecting = '';
function kitConnectWallet(walletName, entryId, label){
  if (kitConnecting) return Promise.resolve(false);
  kitConnecting = entryId;
  wkStatus(wkT("opening", label));
  return ensureKitManager()
    .then(function(wm){
      var cw = wm.getChainWallet(KIT_CHAIN_NAME, walletName);
      if (!cw) throw new Error('the ' + label + ' wallet is not registered');
      var pretty = cw.walletPrettyName || label;
      wkStatus(wkT("approve", pretty));
      var watch = watchPairing(cw, pretty);
      return Promise.resolve().then(function(){ return cw.connect(); })
        .then(function(){ watch.stop(); return { cw: cw, pretty: pretty }; })
        .catch(function(err){ watch.stop(); throw err; });
    })
    .then(function(r){
      kitConnecting = '';
      wkHidePair();
      if (r.cw.isWalletConnected && r.cw.address){
        return wkAdopt({ via: entryId, label: r.pretty, address: r.cw.address, cw: r.cw, walletName: walletName });
      }
      wkFail(r.cw, r.pretty);
      return false;
    })
    .catch(function(err){
      kitConnecting = '';
      wkHidePair();
      console.log('[ld-nft] ' + label + ' connect failed: ' + (err && err.message));
      wkError(wkT("fail", label) + (err && err.message ? ' (' + String(err.message).slice(0, 90) + ')' : ''));
      return false;
    });
}
/* Keplr injected — the donor's gdConnectKeplr, with the pages' own
   suggest-chain params for the enable retry. */
function wkSuggestTerraClassic(kp){
  if (!kp.experimentalSuggestChain) return Promise.reject(new Error("no suggest"));
  return kp.experimentalSuggestChain({
    chainId: CHAIN_ID, chainName: "Terra Classic",
    rpc: "https://terra-classic-rpc.publicnode.com", rest: "https://terra-classic-lcd.publicnode.com",
    bip44: { coinType: 330 },
    bech32Config: { bech32PrefixAccAddr: "terra", bech32PrefixAccPub: "terrapub",
      bech32PrefixValAddr: "terravaloper", bech32PrefixValPub: "terravaloperpub",
      bech32PrefixConsAddr: "terravalcons", bech32PrefixConsPub: "terravalconspub" },
    currencies: [{ coinDenom: "LUNC", coinMinimalDenom: "uluna", coinDecimals: 6 }],
    feeCurrencies: [{ coinDenom: "LUNC", coinMinimalDenom: "uluna", coinDecimals: 6,
      gasPriceStep: { low: 28.325, average: 28.325, high: 28.325 } }],
    stakeCurrency: { coinDenom: "LUNC", coinMinimalDenom: "uluna", coinDecimals: 6 },
    coinType: 330
  });
}
function wkWaitForKeplr(timeoutMs){
  var t0 = Date.now();
  return new Promise(function(res){
    (function poll(){
      if (window.keplr) return res(window.keplr);
      if (Date.now() - t0 >= timeoutMs) return res(null);
      setTimeout(poll, 120);
    })();
  });
}
function wkConnectInjectedKeplr(){
  wkStatus(wkT("opening", "Keplr"));
  return wkWaitForKeplr(wkIsMobileUA ? 2500 : 1200).then(function(provider){
    if (!provider || !window.keplr){
      if (wkIsMobileUA){
        wkStatus(wkT("opening", "Keplr"));
        window.location.href = 'keplrwallet://web-browser?url=' + encodeURIComponent(window.location.href);
        return false;
      }
      return wkWaitForKeplr(4000).then(function(p2){
        if (!p2 || !window.keplr) return kitConnectWallet('keplr-mobile', 'keplr-mobile', 'Keplr Mobile');
        return wkEnableInjected();
      });
    }
    return wkEnableInjected();
  });
}
function wkEnableInjected(){
  var kp = window.keplr;
  var en = kp.enable(CHAIN_ID).catch(function(){
    return wkSuggestTerraClassic(kp).then(function(){ return kp.enable(CHAIN_ID); });
  });
  return en.then(function(){ return kp.getKey(CHAIN_ID); }).then(function(key){
    if (!key || !key.bech32Address) throw new Error('no key');
    return wkAdopt({ via: 'keplr', label: 'Keplr', address: key.bech32Address });
  }).catch(function(){
    wkError(wkT("rejected", "Keplr"));
    return false;
  });
}

/* ---- session restore: on load and on pageshow, adopt a live
   CosmosKit session silently. Detection first: CosmosKit keeps
   the current wallet under its own localStorage key (and the WC
   sign clients theirs under wc@2:*) — with neither present and
   no test hook injected there is nothing to restore and the
   stack is not even loaded. */
var KIT_WALLET_NAMES = ['keplr-extension', 'keplr-mobile', 'station-extension', 'galaxy-station'];
function kitHasStoredState(){
  try {
    if (localStorage.getItem('cosmos-kit@2:core//current-wallet')) return true;
  } catch (e) {}
  try {
    if (typeof localStorage.key === 'function' && typeof localStorage.length === 'number'){
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (k && (k.indexOf('wc@2:') === 0 || k.indexOf('cosmos-kit@2:') === 0)) return true;
      }
    }
  } catch (e) {}
  return false;
}
function wkViaForWalletName(name){
  if (name === 'galaxy-station') return 'galaxy';
  if (name === 'keplr-mobile') return 'keplr-mobile';
  if (name === 'keplr-extension') return 'keplr';
  return 'station';
}
function wkScanAdopt(){
  if (!kitManager || wkSession) return false;
  for (var i = 0; i < KIT_WALLET_NAMES.length; i++){
    var name = KIT_WALLET_NAMES[i];
    var cw = null;
    try { cw = kitManager.getChainWallet(KIT_CHAIN_NAME, name); } catch (e) {}
    if (cw && cw.isWalletConnected && cw.address && wkValidAddr(cw.address)){
      wkAdopt({ via: wkViaForWalletName(name), label: cw.walletPrettyName || name, address: cw.address, cw: cw, walletName: name });
      return true;
    }
  }
  return false;
}
var kitAdopting = false;
function kitRestoreSession(){
  if (kitAdopting) return Promise.resolve(false);
  if (wkSession) return Promise.resolve(true);
  if (!kitHook() && !kitHasStoredState()) return Promise.resolve(false);
  kitAdopting = true;
  return ensureKitManager()
    .then(function(){ return Promise.race([kitMountedPromise || Promise.resolve(), new Promise(function(r){ setTimeout(r, 6000); })]); })
    .then(function(){ return wkScanAdopt(); })
    .catch(function(err){ console.log('[ld-nft] CosmosKit restore skipped: ' + (err && err.message)); return false; })
    .then(function(ok){ kitAdopting = false; return ok; });
}

/* =====================================================================
   LUNCDash — the legacy WalletConnect v1 client over LUNCDash's
   own bridge, ported from ffwallet.js (fa2DashConnect /
   gdLuncDashConnect / the Garuda DEX __dexDashSign). LUNCDash is
   NOT Station (Tom's ruling): in its own in-app browser it injects
   window.station and the Station entry above covers it; everywhere
   else it pairs through this bridge. Signing is AMINO ONLY —
   terra_signAmino — see the adapter below.
   ===================================================================== */
var WK_DASH_BRIDGE = 'https://walletconnect.luncdash.com';
var WK_DASH_SESSION_KEY = 'cosmes.wallet.luncdash.wcSession';
var wkDashWc = null;        /* the live legacy connector (signing needs it) */
var wkDashWcPromise = null;
function wkLoadDashLib(){
  if (wkDashWcPromise) return wkDashWcPromise;
  wkDashWcPromise = import('https://esm.sh/@walletconnect/client@1.8.0?bundle')
    .then(function(m){
      var ctor = (m && (m.default || m.WalletConnect || m.WalletConnectClient)) || null;
      if (!ctor) throw new Error('the LUNCDash connector failed to load');
      return ctor;
    })
    .catch(function(err){ wkDashWcPromise = null; throw err; });
  return wkDashWcPromise;
}
function wkDashClientMeta(){
  return { description: 'LUNC Dev NFTs — NFT launchpad on Terra Classic', url: KIT_APP_URL, icons: [], name: 'LUNC Dev NFTs' };
}
function wkCachedDashSession(){
  try {
    var raw = localStorage.getItem(WK_DASH_SESSION_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    return (s && s.connected && s.accounts && s.accounts.length) ? s : null;
  } catch (e) { return null; }
}
function wkCacheDashSession(wc){
  try { if (wc && wc.session) localStorage.setItem(WK_DASH_SESSION_KEY, JSON.stringify(wc.session)); } catch (e) {}
}
function wkClearDashSession(){ try { localStorage.removeItem(WK_DASH_SESSION_KEY); } catch (e) {} }
function wkDashOpenHref(uri){
  var payload = encodeURIComponent('payload=' + encodeURIComponent(uri));
  var ua = navigator.userAgent || '';
  if (/android/i.test(ua))
    return 'intent://wallet_connect?' + payload + '#Intent;scheme=luncdash;package=com.luncdash.wallet;end';
  return 'luncdash://wallet_connect?' + payload;
}
function wkDashAddress(wc){
  try {
    var list = (wc.getAccounts ? wc.getAccounts('terra') : []) || [];
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].chainId === CHAIN_ID && wkValidAddr(list[i].address)) return list[i].address;
  } catch (e) {}
  var accts = (wc && wc.accounts) || [];
  for (var j = 0; j < accts.length; j++){
    var a = String(accts[j] || '');
    var m = a.match(/terra1[02-9ac-hj-np-z]{38}/);
    if (m) return m[0];
  }
  return null;
}
function wkDashWatch(wc){
  try {
    wc.on('disconnect', function(){
      wkClearDashSession();
      if (wkDashWc === wc) wkDashWc = null;
      if (wkSession && wkSession.via === 'luncdash') wkSession = null;
    });
  } catch (e) {}
}
function wkDashAdopt(wc){
  var addr = wkDashAddress(wc);
  if (!addr){ wkError(wkT("fail", "LUNCDash")); return false; }
  wkDashWc = wc;
  wkCacheDashSession(wc);
  wkDashWatch(wc);
  wkAdopt({ via: 'luncdash', label: 'LUNCDash', address: addr, wc: wc });
  return true;
}
function wkDashConnect(){
  wkStatus(wkT("opening", "LUNCDash"));
  return wkLoadDashLib().then(function(WC){
    var cached = wkCachedDashSession();
    if (cached){
      var wc0 = new WC({ bridge: WK_DASH_BRIDGE, clientMeta: wkDashClientMeta() }, cached);
      if (wc0.connected && wkDashAdopt(wc0)) return true;
    }
    var wc = new WC({ bridge: WK_DASH_BRIDGE, clientMeta: wkDashClientMeta() });
    wkDashWc = wc;
    if (!wc.connected){
      return wc.createSession().then(function(){
        wkShowPair(wc.uri, "LUNCDash", { dash: true, openHref: wkDashOpenHref(wc.uri) });
        wkStatus(wkT("approve", "LUNCDash"));
        return new Promise(function(res){
          wc.on('connect', function(err){
            if (err){ wkHidePair(); wkError(wkT("fail", "LUNCDash")); return res(false); }
            res(wkDashAdopt(wc));
          });
          wc.on('session_update', function(){ wkCacheDashSession(wc); });
        });
      });
    }
    return wkDashAdopt(wc);
  }).catch(function(err){
    console.log('[ld-nft] LUNCDash connect failed: ' + (err && err.message));
    wkError(wkT("fail", "LUNCDash") + (err && err.message ? ' (' + String(err.message).slice(0, 90) + ')' : ''));
    return false;
  });
}
function wkDashRestore(){
  if (wkSession) return Promise.resolve(true);
  var cached = wkCachedDashSession();
  if (!cached) return Promise.resolve(false);
  return wkLoadDashLib().then(function(WC){
    var wc = new WC({ bridge: WK_DASH_BRIDGE, clientMeta: wkDashClientMeta() }, cached);
    if (wc.connected) return wkDashAdopt(wc);
    return false;
  }).catch(function(){ return false; });
}
/* terra_signAmino over the live connector — the DEX flow verbatim:
   foreground the app on mobile, 120 s ceiling, { signed, signature }
   straight out of the wallet's response. */
function wkDashSignAmino(signDoc){
  var wc = wkDashWc;
  if (!wc || !wc.connected) return Promise.reject(new Error(wkT("notLive", "LUNCDash")));
  try {
    if (wkIsMobileUA && wc.uri){
      var href = wkDashOpenHref(wc.uri);
      if (href) window.location.href = href;
    }
  } catch (e) {}
  var req;
  try { req = wc.sendCustomRequest({ method: 'terra_signAmino', params: [signDoc] }); }
  catch (e) { return Promise.reject(e); }
  var timed = Promise.race([
    Promise.resolve(req),
    new Promise(function(_, rej){ setTimeout(function(){ rej(new Error(wkT("timeout", "LUNCDash"))); }, 120000); })
  ]);
  return timed.then(function(res){
    var r0 = (res && res.result) || res;
    if (!r0 || !r0.signed || !r0.signature) throw new Error(wkT("noSig", "LUNCDash"));
    return { signed: r0.signed, signature: r0.signature };
  });
}

/* =====================================================================
   THE ADAPTER — one Keplr-shaped provider per adopted wallet.
   ===================================================================== */
function wkKitSigner(cw){
  return Promise.resolve()
    .then(function(){ return cw.initOfflineSigner('direct'); })
    .then(function(){
      var s = cw.offlineSigner || null;
      if (!s && cw.client && cw.client.getOfflineSigner) s = cw.client.getOfflineSigner(CHAIN_ID, 'direct');
      if (!s) throw new Error('no direct signer');
      return s;
    });
}
function wkKitProvider(session){
  var cw = session.cw;
  return {
    enable: function(chainId){
      if (!cw || !cw.isWalletConnected)
        return Promise.reject(new Error(wkT("notLive", session.label)));
      return Promise.resolve();
    },
    getKey: function(chainId){
      return wkKitSigner(cw).then(function(signer){ return signer.getAccounts(); })
        .then(function(accs){
          var a = accs && accs[0];
          return {
            name: '', algo: (a && a.algo) || 'secp256k1',
            pubKey: a && a.pubKey ? a.pubKey : null,
            address: session.address, bech32Address: session.address,
            isNanoLedger: false, isKeystone: false
          };
        })
        .catch(function(){
          return { name: '', algo: 'secp256k1', pubKey: null, address: session.address, bech32Address: session.address, isNanoLedger: false, isKeystone: false };
        });
    },
    signDirect: function(chainId, signerAddress, signDoc){
      return wkKitSigner(cw).then(function(signer){
        return signer.signDirect(signerAddress, {
          bodyBytes: signDoc.bodyBytes,
          authInfoBytes: signDoc.authInfoBytes,
          chainId: chainId,
          accountNumber: signDoc.accountNumber
        });
      });
    }
    /* no experimentalSuggestChain: columbus-5 is pre-registered
       in the kit's chain def, so the pages' enable() resolves and
       their suggest fallback is never needed for kit wallets. */
  };
}
function wkDashProvider(session){
  return {
    enable: function(chainId){
      if (!wkDashWc || !wkDashWc.connected)
        return Promise.reject(new Error(wkT("notLive", "LUNCDash")));
      return Promise.resolve();
    },
    getKey: function(chainId){
      /* LUNCDash's amino session exposes no pubkey; the pages fall
         back to the account's on-chain pubkey from the LCD — the
         same position the proven DEX flow is in. */
      return Promise.resolve({ name: '', algo: 'secp256k1', pubKey: null, address: session.address, bech32Address: session.address, isNanoLedger: false, isKeystone: false });
    },
    signDirect: function(chainId, signerAddress, signDoc){
      var pieces = aminoDocFromTxBytes(signDoc.bodyBytes, signDoc.authInfoBytes);
      var stdDoc = {
        account_number: String(signDoc.accountNumber),
        chain_id: chainId,
        fee: pieces.fee,
        memo: pieces.memo,
        msgs: pieces.msgs,
        sequence: pieces.sequence
      };
      return wkDashSignAmino(stdDoc).then(function(res){
        var bodyBytes = txBodyFromAmino(res.signed.msgs, res.signed.memo);
        var authInfoBytes = authInfoFromAmino(res.signed, pieces.pubAnyBytes);
        return {
          signed: { bodyBytes: bodyBytes, authInfoBytes: authInfoBytes, chainId: chainId, accountNumber: String(signDoc.accountNumber) },
          signature: res.signature
        };
      });
    }
  };
}

/* =====================================================================
   Public API — window.LDWalletKit
   ===================================================================== */
var WK_BUTTONS = [
  { id: 'wkMobileBtn', entry: 'keplr-mobile', name: 'Keplr Mobile' },
  { id: 'wkGalaxyBtn', entry: 'galaxy', name: 'Galaxy Station' },
  { id: 'wkDashBtn', entry: 'luncdash', name: 'LUNCDash' }
];
function wkRefreshLabels(){
  var cb = document.getElementById('connectBtn');
  var base = cb ? (cb.textContent || '') : '';
  WK_BUTTONS.forEach(function(b){
    var el = document.getElementById(b.id);
    if (!el) return;
    if (/Keplr/.test(base)) el.textContent = base.replace(/Keplr/g, b.name);
    else if (!el.textContent) el.textContent = 'Connect ' + b.name;
  });
}
function wkRestoreAll(){
  if (wkSession) return;
  kitRestoreSession().then(function(ok){ if (!ok) wkDashRestore(); });
}
var wkInited = false;
window.LDWalletKit = {
  init: function(opts){
    opts = opts || {};
    wkHost.onAdopt = opts.onAdopt || null;
    wkHost.onStatus = opts.onStatus || null;
    wkHost.onError = opts.onError || null;
    WK_BUTTONS.forEach(function(b){
      var el = document.getElementById(b.id);
      if (el) el.addEventListener('click', function(){ window.LDWalletKit.connect(b.entry); });
    });
    wkRefreshLabels();
    var langSel = document.getElementById('lang');
    if (langSel) langSel.addEventListener('change', function(){ setTimeout(wkRefreshLabels, 0); });
    if (!wkInited){
      wkInited = true;
      window.addEventListener('pageshow', wkRestoreAll);
      document.addEventListener('visibilitychange', function(){ if (!document.hidden) wkRestoreAll(); });
    }
    wkRestoreAll();
  },
  connect: function(entry){
    if (entry === 'keplr') return wkConnectInjectedKeplr();
    if (entry === 'keplr-mobile') return kitConnectWallet('keplr-mobile', 'keplr-mobile', 'Keplr Mobile');
    if (entry === 'galaxy') return kitConnectWallet('galaxy-station', 'galaxy', 'Galaxy Station');
    if (entry === 'station'){
      if (injectedStation()) return kitConnectWallet('station-extension', 'station', 'LUNCDash');
      return wkDashConnect();
    }
    if (entry === 'luncdash') return wkDashConnect();
    return Promise.resolve(false);
  },
  disconnect: function(){
    try { if (wkSession && wkSession.cw && wkSession.cw.disconnect) wkSession.cw.disconnect(); } catch (e) {}
    try { if (wkSession && wkSession.via === 'luncdash' && wkDashWc) wkDashWc.killSession(); } catch (e) {}
    if (wkSession && wkSession.via === 'luncdash'){ wkClearDashSession(); wkDashWc = null; }
    wkSession = null;
    return Promise.resolve();
  },
  provider: function(){
    if (!wkSession) return (typeof window !== 'undefined' && window.keplr) || null;
    if (wkSession.via === 'keplr') return window.keplr || null;
    if (wkSession.via === 'luncdash') return wkDashProvider(wkSession);
    if (wkSession.cw) return wkKitProvider(wkSession);
    return window.keplr || null;
  },
  session: function(){
    return wkSession ? { via: wkSession.via, label: wkSession.label, address: wkSession.address } : null;
  },
  /* proof-harness seams (used by the Node checks in proof/; inert
     in normal browsing) */
  _test: {
    aminoDocFromTxBytes: aminoDocFromTxBytes,
    txBodyFromAmino: txBodyFromAmino,
    authInfoFromAmino: authInfoFromAmino,
    setDashSession: function(wc, address){ wkDashWc = wc; wkSession = { via: 'luncdash', label: 'LUNCDash', address: address, wc: wc }; },
    setSession: function(s){ wkSession = s; },
    getSession: function(){ return wkSession; }
  }
};
})();
