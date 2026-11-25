/* LUNC Dev NFTs — house wallet picker add-on.
   Adds Galaxy Station + LUNCDash connect buttons next to the page's own
   Keplr button, without touching the page's proven main script.
   How it works: each of these wallets injects a Keplr-compatible provider
   inside its own app browser. When the user picks one, we detect that
   provider, point window.keplr at it (the main script reads window.keplr
   at click time), and trigger the page's own connect flow — so create /
   mint signing all runs through the page's unchanged code. When no
   compatible provider is present we say so honestly and tell the user
   to open the page inside that wallet app's browser. Keplr on mobile
   with no provider deep-links into the Keplr app browser (the house
   pattern from the airdrop tool). */
(function(){
  var STR = {
    en:{hint:"Works with Keplr, Galaxy Station and LUNCDash. The connected wallet becomes the collection's creator, minter and admin.",
        station:"No Galaxy Station found in this browser. On a phone, open this page inside the Galaxy Station app's browser.",
        luncdash:"No LUNCDash found in this browser. On a phone, open this page inside the LUNCDash app's browser."},
    es:{hint:"Funciona con Keplr, Galaxy Station y LUNCDash. La billetera conectada será la creadora, minteadora y administradora de la colección.",
        station:"No se encontró Galaxy Station en este navegador. En el teléfono, abre esta página dentro del navegador de la app Galaxy Station.",
        luncdash:"No se encontró LUNCDash en este navegador. En el teléfono, abre esta página dentro del navegador de la app LUNCDash."},
    fr:{hint:"Fonctionne avec Keplr, Galaxy Station et LUNCDash. Le portefeuille connecté devient le créateur, l'émetteur et l'administrateur de la collection.",
        station:"Galaxy Station introuvable dans ce navigateur. Sur téléphone, ouvrez cette page dans le navigateur de l'app Galaxy Station.",
        luncdash:"LUNCDash introuvable dans ce navigateur. Sur téléphone, ouvrez cette page dans le navigateur de l'app LUNCDash."},
    de:{hint:"Funktioniert mit Keplr, Galaxy Station und LUNCDash. Die verbundene Wallet wird Ersteller, Minter und Admin der Kollektion.",
        station:"Galaxy Station wurde in diesem Browser nicht gefunden. Öffne diese Seite auf dem Handy im Browser der Galaxy-Station-App.",
        luncdash:"LUNCDash wurde in diesem Browser nicht gefunden. Öffne diese Seite auf dem Handy im Browser der LUNCDash-App."},
    it:{hint:"Funziona con Keplr, Galaxy Station e LUNCDash. Il wallet collegato diventa creatore, emittente e amministratore della collezione.",
        station:"Galaxy Station non trovato in questo browser. Sul telefono, apri questa pagina nel browser dell'app Galaxy Station.",
        luncdash:"LUNCDash non trovato in questo browser. Sul telefono, apri questa pagina nel browser dell'app LUNCDash."},
    pt:{hint:"Funciona com Keplr, Galaxy Station e LUNCDash. A carteira conectada se torna a criadora, emissora e administradora da coleção.",
        station:"Galaxy Station não encontrado neste navegador. No celular, abra esta página no navegador do app Galaxy Station.",
        luncdash:"LUNCDash não encontrado neste navegador. No celular, abra esta página no navegador do app LUNCDash."},
    nl:{hint:"Werkt met Keplr, Galaxy Station en LUNCDash. De verbonden wallet wordt de maker, minter en beheerder van de collectie.",
        station:"Galaxy Station niet gevonden in deze browser. Open deze pagina op je telefoon in de browser van de Galaxy Station-app.",
        luncdash:"LUNCDash niet gevonden in deze browser. Open deze pagina op je telefoon in de browser van de LUNCDash-app."},
    pl:{hint:"Działa z Keplr, Galaxy Station i LUNCDash. Połączony portfel staje się twórcą, emiterem i administratorem kolekcji.",
        station:"Nie znaleziono Galaxy Station w tej przeglądarce. Na telefonie otwórz tę stronę w przeglądarce aplikacji Galaxy Station.",
        luncdash:"Nie znaleziono LUNCDash w tej przeglądarce. Na telefonie otwórz tę stronę w przeglądarce aplikacji LUNCDash."},
    ru:{hint:"Работает с Keplr, Galaxy Station и LUNCDash. Подключённый кошелёк станет создателем, эмитентом и администратором коллекции.",
        station:"Galaxy Station не найден в этом браузере. На телефоне откройте эту страницу в браузере приложения Galaxy Station.",
        luncdash:"LUNCDash не найден в этом браузере. На телефоне откройте эту страницу в браузере приложения LUNCDash."},
    uk:{hint:"Працює з Keplr, Galaxy Station і LUNCDash. Підключений гаманець стане творцем, емітентом і адміністратором колекції.",
        station:"Galaxy Station не знайдено в цьому браузері. На телефоні відкрийте цю сторінку в браузері застосунку Galaxy Station.",
        luncdash:"LUNCDash не знайдено в цьому браузері. На телефоні відкрийте цю сторінку в браузері застосунку LUNCDash."},
    tr:{hint:"Keplr, Galaxy Station ve LUNCDash ile çalışır. Bağlanan cüzdan, koleksiyonun oluşturucusu, basıcısı ve yöneticisi olur.",
        station:"Bu tarayıcıda Galaxy Station bulunamadı. Telefonda bu sayfayı Galaxy Station uygulamasının tarayıcısında aç.",
        luncdash:"Bu tarayıcıda LUNCDash bulunamadı. Telefonda bu sayfayı LUNCDash uygulamasının tarayıcısında aç."},
    ar:{hint:"يعمل مع Keplr وGalaxy Station وLUNCDash. تصبح المحفظة المرتبطة منشئ المجموعة ومُصدِرها ومسؤولها.",
        station:"لم يتم العثور على Galaxy Station في هذا المتصفح. على الهاتف، افتح هذه الصفحة داخل متصفح تطبيق Galaxy Station.",
        luncdash:"لم يتم العثور على LUNCDash في هذا المتصفح. على الهاتف، افتح هذه الصفحة داخل متصفح تطبيق LUNCDash."},
    fa:{hint:"با Keplr ،Galaxy Station و LUNCDash کار می‌کند. کیف پول متصل‌شده سازنده، صادرکننده و مدیر مجموعه می‌شود.",
        station:"Galaxy Station در این مرورگر پیدا نشد. در تلفن، این صفحه را در مرورگر برنامه Galaxy Station باز کن.",
        luncdash:"LUNCDash در این مرورگر پیدا نشد. در تلفن، این صفحه را در مرورگر برنامه LUNCDash باز کن."},
    hi:{hint:"Keplr, Galaxy Station और LUNCDash के साथ काम करता है। जुड़ा हुआ वॉलेट कलेक्शन का निर्माता, मिंटर और एडमिन बनता है।",
        station:"इस ब्राउज़र में Galaxy Station नहीं मिला। फ़ोन पर, इस पेज को Galaxy Station ऐप के ब्राउज़र में खोलें।",
        luncdash:"इस ब्राउज़र में LUNCDash नहीं मिला। फ़ोन पर, इस पेज को LUNCDash ऐप के ब्राउज़र में खोलें।"},
    bn:{hint:"Keplr, Galaxy Station এবং LUNCDash-এর সাথে কাজ করে। সংযুক্ত ওয়ালেটটি কালেকশনের স্রষ্টা, মিন্টার এবং অ্যাডমিন হয়।",
        station:"এই ব্রাউজারে Galaxy Station পাওয়া যায়নি। ফোনে, Galaxy Station অ্যাপের ব্রাউজারে এই পেজটি খুলুন।",
        luncdash:"এই ব্রাউজারে LUNCDash পাওয়া যায়নি। ফোনে, LUNCDash অ্যাপের ব্রাউজারে এই পেজটি খুলুন।"},
    zh:{hint:"支持 Keplr、Galaxy Station 和 LUNCDash。连接的钱包将成为收藏的创建者、铸造者和管理员。",
        station:"此浏览器中未找到 Galaxy Station。在手机上，请在 Galaxy Station 应用的浏览器中打开此页面。",
        luncdash:"此浏览器中未找到 LUNCDash。在手机上，请在 LUNCDash 应用的浏览器中打开此页面。"},
    ja:{hint:"Keplr、Galaxy Station、LUNCDash に対応しています。接続したウォレットがコレクションの作成者、ミンター、管理者になります。",
        station:"このブラウザで Galaxy Station が見つかりません。スマートフォンでは Galaxy Station アプリのブラウザでこのページを開いてください。",
        luncdash:"このブラウザで LUNCDash が見つかりません。スマートフォンでは LUNCDash アプリのブラウザでこのページを開いてください。"},
    ko:{hint:"Keplr, Galaxy Station, LUNCDash를 지원합니다. 연결된 지갑이 컬렉션의 생성자, 민터, 관리자가 됩니다.",
        station:"이 브라우저에서 Galaxy Station을 찾을 수 없습니다. 휴대폰에서는 Galaxy Station 앱의 브라우저에서 이 페이지를 여세요.",
        luncdash:"이 브라우저에서 LUNCDash를 찾을 수 없습니다. 휴대폰에서는 LUNCDash 앱의 브라우저에서 이 페이지를 여세요."}
  };
  var connectBtn = document.getElementById("connectBtn");
  var walletLine = document.getElementById("walletLine");
  var hintEl = document.getElementById("connectHint");
  var langSel = document.getElementById("lang");
  if(!connectBtn || !walletLine) return;
  function lang(){ return (langSel && STR[langSel.value]) ? langSel.value : "en"; }
  function d(){ return STR[lang()]; }
  function label(name){
    var base = connectBtn.textContent || "Connect Keplr";
    return base.indexOf("Keplr") !== -1 ? base.replace("Keplr", name) : ("Connect " + name);
  }
  function findProvider(kind){
    try {
      if(kind === "station"){
        var st = window.station;
        if(st && st.keplr && st.keplr.signDirect) return st.keplr;
        if(st && st.enable && st.getKey && st.signDirect) return st;
        return null;
      }
      if(kind === "luncdash"){
        var ld = window.luncdash;
        if(ld && ld.keplr && ld.keplr.signDirect) return ld.keplr;
        if(ld && ld.enable && ld.getKey && ld.signDirect) return ld;
        if(!window.keplr && window.getOfflineSigner && window.getKey && window.signDirect) return window;
        return null;
      }
    } catch(e) { return null; }
    return null;
  }
  function showMissing(kind){
    walletLine.innerHTML = "";
    var span = document.createElement("span");
    span.style.color = "#ff8a8a";
    span.textContent = d()[kind];
    walletLine.appendChild(span);
  }
  function pick(kind){
    var p = findProvider(kind);
    if(p){
      if(window.keplr !== p) window.keplr = p;
      connectBtn.click();
    } else {
      showMissing(kind);
    }
  }
  function applyTexts(){
    if(hintEl) hintEl.textContent = d().hint;
    var bs = document.getElementById("wpStationBtn");
    var bl = document.getElementById("wpLuncdashBtn");
    if(bs) bs.textContent = label("Galaxy Station");
    if(bl) bl.textContent = label("LUNCDash");
  }
  function mkBtn(id, kind){
    var b = document.createElement("button");
    b.type = "button";
    b.className = connectBtn.className;
    b.id = id;
    b.style.marginTop = "10px";
    b.addEventListener("click", function(){ pick(kind); });
    return b;
  }
  var bs = mkBtn("wpStationBtn", "station");
  var bl = mkBtn("wpLuncdashBtn", "luncdash");
  var parent = connectBtn.parentNode;
  parent.insertBefore(bs, connectBtn.nextSibling);
  parent.insertBefore(bl, bs.nextSibling);
  if(langSel) langSel.addEventListener("change", function(){ setTimeout(applyTexts, 0); });
  applyTexts();
})();
