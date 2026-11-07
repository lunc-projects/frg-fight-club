'use strict';
/* Luna Pool 3D — true-3D billiards for Luna Classic.
   Original/procedural: table, balls, textures and physics are all built
   in code (see LICENSES.md). Scoring identity preserved from Luna Pool:
   8 numbered balls, 12 shots, +100 a ball, +250 table-clear bonus,
   -50 cue-ball foul. Leaderboard: /api/luna-games?game=pool. */
import * as THREE from 'three';

const $ = id => document.getElementById(id);

/* ================= i18n (18 languages) ================= */
const LANGS = [
  ['en','English'],['es','Español'],['pt','Português'],['fr','Français'],['de','Deutsch'],
  ['it','Italiano'],['nl','Nederlands'],['ru','Русский'],['uk','Українська'],['tr','Türkçe'],
  ['ar','العربية'],['hi','हिन्दी'],['id','Bahasa Indonesia'],['vi','Tiếng Việt'],
  ['th','ไทย'],['ko','한국어'],['ja','日本語'],['zh','中文'],
];
const I18N = {
en:{break:'BREAK',leaderboard:'LEADERBOARD',submit:'SUBMIT SCORE',share:'SHARE SCORE',again:'PLAY AGAIN',close:'CLOSE',allTime:'ALL-TIME',thisWeek:'THIS WEEK',loading:'LOADING…',power:'POWER',
 howto:'One cue ball, eight numbered balls, six pockets, <b>12 shots</b>.<br><b>Drag</b> on the table to aim — the dashed line and ghost circle show the hit — then <b>pull the POWER bar down</b> and <b>release</b> to shoot.<br>Ball pocketed: <b>+100</b> · Clear the whole table: <b>+250 bonus</b><br>Sink the cue ball and it\'s a foul: <b>−50</b> and the cue ball comes back.',
 sec:'🔒 This game is 100% free and never asks you to connect a wallet or sign anything to play. Any page that does is a fake.',
 aim:'Drag to aim · pull POWER down & release to shoot',shot:'SHOT',saved:'Saved!',saving:'Saving…',saveFail:'Could not save — try again.',
 rank:'🏆 You\'re #{r} all-time!',boardLoad:'Loading…',boardEmpty:'No scores yet — be the first! 🏆',boardOff:'Board unavailable right now — play on! 🎱',
 namePh:'Your name — or just Guest',rackOver:'RACK OVER',clearedKick:'TABLE CLEARED',cleared:'TABLE CLEARED!',outShots:'OUT OF SHOTS',
 stats:'Balls pocketed: <b>{a} / 8</b> · Shots used: {b} / 12',fouls:'Fouls (cue sunk): {n} · −{p}',bonus:'Table-clear bonus: +250',final:'Time: {t}s · Final score: <b>{s}</b>',
 foulToast:'FOUL! −50',shareTxt:'I scored {s} on Luna Pool 3D — pocketed {a} of 8 balls! 🎱🌙',copied:'Copied!'},
es:{break:'ROMPER',leaderboard:'CLASIFICACIÓN',submit:'ENVIAR PUNTOS',share:'COMPARTIR',again:'JUGAR OTRA VEZ',close:'CERRAR',allTime:'HISTÓRICO',thisWeek:'ESTA SEMANA',loading:'CARGANDO…',power:'POTENCIA',
 howto:'Una bola blanca, ocho bolas numeradas, seis troneras, <b>12 tiros</b>.<br><b>Arrastra</b> sobre la mesa para apuntar — la línea y el círculo fantasma muestran el golpe — luego <b>baja la barra de POTENCIA</b> y <b>suelta</b> para tirar.<br>Bola embocada: <b>+100</b> · Mesa limpia: <b>+250 extra</b><br>Si embocas la blanca es falta: <b>−50</b> y la blanca vuelve.',
 sec:'🔒 Este juego es 100% gratis y nunca te pide conectar una cartera ni firmar nada para jugar. Cualquier página que lo pida es falsa.',
 aim:'Arrastra para apuntar · baja POTENCIA y suelta para tirar',shot:'TIRO',saved:'¡Guardado!',saving:'Guardando…',saveFail:'No se pudo guardar — inténtalo de nuevo.',
 rank:'🏆 ¡Eres el n.º {r} histórico!',boardLoad:'Cargando…',boardEmpty:'Aún no hay puntos — ¡sé el primero! 🏆',boardOff:'Clasificación no disponible — ¡sigue jugando! 🎱',
 namePh:'Tu nombre — o Invitado',rackOver:'FIN DE LA PARTIDA',clearedKick:'MESA LIMPIA',cleared:'¡MESA LIMPIA!',outShots:'SIN TIROS',
 stats:'Bolas embocadas: <b>{a} / 8</b> · Tiros usados: {b} / 12',fouls:'Faltas (blanca embocada): {n} · −{p}',bonus:'Extra por mesa limpia: +250',final:'Tiempo: {t}s · Puntos finales: <b>{s}</b>',
 foulToast:'¡FALTA! −50',shareTxt:'Hice {s} puntos en Luna Pool 3D — ¡emboqué {a} de 8 bolas! 🎱🌙',copied:'¡Copiado!'},
pt:{break:'SAIR',leaderboard:'CLASSIFICAÇÃO',submit:'ENVIAR PONTOS',share:'COMPARTILHAR',again:'JOGAR DE NOVO',close:'FECHAR',allTime:'GERAL',thisWeek:'ESTA SEMANA',loading:'CARREGANDO…',power:'FORÇA',
 howto:'Uma bola branca, oito bolas numeradas, seis caçapas, <b>12 tacadas</b>.<br><b>Arraste</b> na mesa para mirar — a linha e o círculo fantasma mostram a batida — depois <b>puxe a barra de FORÇA para baixo</b> e <b>solte</b> para tacar.<br>Bola encaçapada: <b>+100</b> · Mesa limpa: <b>+250 bônus</b><br>Encaçapar a branca é falta: <b>−50</b> e a branca volta.',
 sec:'🔒 Este jogo é 100% grátis e nunca pede para conectar uma carteira ou assinar qualquer coisa para jogar. Qualquer página que peça é falsa.',
 aim:'Arraste para mirar · puxe FORÇA e solte para tacar',shot:'TACADA',saved:'Salvo!',saving:'Salvando…',saveFail:'Não foi possível salvar — tente de novo.',
 rank:'🏆 Você é o n.º {r} de todos os tempos!',boardLoad:'Carregando…',boardEmpty:'Sem pontos ainda — seja o primeiro! 🏆',boardOff:'Classificação indisponível — continue jogando! 🎱',
 namePh:'Seu nome — ou Convidado',rackOver:'FIM DA PARTIDA',clearedKick:'MESA LIMPA',cleared:'MESA LIMPA!',outShots:'SEM TACADAS',
 stats:'Bolas encaçapadas: <b>{a} / 8</b> · Tacadas usadas: {b} / 12',fouls:'Faltas (branca caiu): {n} · −{p}',bonus:'Bônus de mesa limpa: +250',final:'Tempo: {t}s · Pontos finais: <b>{s}</b>',
 foulToast:'FALTA! −50',shareTxt:'Fiz {s} pontos no Luna Pool 3D — encaçapei {a} de 8 bolas! 🎱🌙',copied:'Copiado!'},
fr:{break:'CASSER',leaderboard:'CLASSEMENT',submit:'ENVOYER LE SCORE',share:'PARTAGER',again:'REJOUER',close:'FERMER',allTime:'TOUS TEMPS',thisWeek:'CETTE SEMAINE',loading:'CHARGEMENT…',power:'PUISSANCE',
 howto:'Une bille blanche, huit billes numérotées, six poches, <b>12 coups</b>.<br><b>Glissez</b> sur la table pour viser — la ligne et le cercle fantôme montrent l\'impact — puis <b>tirez la barre PUISSANCE vers le bas</b> et <b>relâchez</b> pour tirer.<br>Bille empochée : <b>+100</b> · Table nettoyée : <b>+250 bonus</b><br>Empocher la blanche est une faute : <b>−50</b> et la blanche revient.',
 sec:'🔒 Ce jeu est 100 % gratuit et ne demande jamais de connecter un portefeuille ni de signer quoi que ce soit pour jouer. Toute page qui le demande est fausse.',
 aim:'Glissez pour viser · tirez PUISSANCE et relâchez pour tirer',shot:'COUP',saved:'Enregistré !',saving:'Enregistrement…',saveFail:'Échec de l\'enregistrement — réessayez.',
 rank:'🏆 Vous êtes n.º {r} de tous les temps !',boardLoad:'Chargement…',boardEmpty:'Aucun score — soyez le premier ! 🏆',boardOff:'Classement indisponible — continuez à jouer ! 🎱',
 namePh:'Votre nom — ou Invité',rackOver:'PARTIE TERMINÉE',clearedKick:'TABLE NETTOYÉE',cleared:'TABLE NETTOYÉE !',outShots:'PLUS DE COUPS',
 stats:'Billes empochées : <b>{a} / 8</b> · Coups utilisés : {b} / 12',fouls:'Fautes (blanche empochée) : {n} · −{p}',bonus:'Bonus table nettoyée : +250',final:'Temps : {t}s · Score final : <b>{s}</b>',
 foulToast:'FAUTE ! −50',shareTxt:'J\'ai marqué {s} sur Luna Pool 3D — {a} billes sur 8 empochées ! 🎱🌙',copied:'Copié !'},
de:{break:'ANSTOSS',leaderboard:'BESTENLISTE',submit:'PUNKTE SENDEN',share:'TEILEN',again:'NOCHMAL SPIELEN',close:'SCHLIESSEN',allTime:'GESAMT',thisWeek:'DIESE WOCHE',loading:'LADEN…',power:'KRAFT',
 howto:'Eine weiße Kugel, acht nummerierte Kugeln, sechs Taschen, <b>12 Stöße</b>.<br><b>Ziehen</b> zum Zielen — Linie und Geisterkreis zeigen den Treffer — dann die <b>KRAFT-Leiste nach unten ziehen</b> und <b>loslassen</b> zum Stoßen.<br>Kugel versenkt: <b>+100</b> · Tisch leer: <b>+250 Bonus</b><br>Weiße versenkt ist ein Foul: <b>−50</b>, die Weiße kommt zurück.',
 sec:'🔒 Dieses Spiel ist 100 % kostenlos und verlangt nie, eine Wallet zu verbinden oder etwas zu signieren. Jede Seite, die das verlangt, ist eine Fälschung.',
 aim:'Ziehen zum Zielen · KRAFT ziehen & loslassen zum Stoßen',shot:'STOSS',saved:'Gespeichert!',saving:'Speichern…',saveFail:'Speichern fehlgeschlagen — erneut versuchen.',
 rank:'🏆 Du bist Nr. {r} aller Zeiten!',boardLoad:'Laden…',boardEmpty:'Noch keine Punkte — sei der Erste! 🏆',boardOff:'Bestenliste nicht verfügbar — weiterspielen! 🎱',
 namePh:'Dein Name — oder Gast',rackOver:'SPIEL VORBEI',clearedKick:'TISCH LEER',cleared:'TISCH LEER!',outShots:'KEINE STÖSSE MEHR',
 stats:'Versenkte Kugeln: <b>{a} / 8</b> · Stöße: {b} / 12',fouls:'Fouls (Weiße versenkt): {n} · −{p}',bonus:'Bonus Tisch leer: +250',final:'Zeit: {t}s · Endpunkte: <b>{s}</b>',
 foulToast:'FOUL! −50',shareTxt:'Ich habe {s} Punkte bei Luna Pool 3D — {a} von 8 Kugeln versenkt! 🎱🌙',copied:'Kopiert!'},
it:{break:'SPACCATA',leaderboard:'CLASSIFICA',submit:'INVIA PUNTI',share:'CONDIVIDI',again:'GIOCA ANCORA',close:'CHIUDI',allTime:'DI SEMPRE',thisWeek:'QUESTA SETTIMANA',loading:'CARICAMENTO…',power:'POTENZA',
 howto:'Una biglia bianca, otto biglie numerate, sei buche, <b>12 tiri</b>.<br><b>Trascina</b> sul tavolo per mirare — linea e cerchio fantasma mostrano il colpo — poi <b>tira giù la barra POTENZA</b> e <b>rilascia</b> per tirare.<br>Biglia in buca: <b>+100</b> · Tavolo pulito: <b>+250 bonus</b><br>Se va in buca la bianca è fallo: <b>−50</b> e la bianca torna.',
 sec:'🔒 Questo gioco è 100% gratuito e non chiede mai di collegare un portafoglio o firmare nulla per giocare. Qualsiasi pagina che lo chiede è falsa.',
 aim:'Trascina per mirare · tira POTENZA e rilascia per tirare',shot:'TIRO',saved:'Salvato!',saving:'Salvataggio…',saveFail:'Salvataggio non riuscito — riprova.',
 rank:'🏆 Sei il n. {r} di sempre!',boardLoad:'Caricamento…',boardEmpty:'Nessun punteggio — sii il primo! 🏆',boardOff:'Classifica non disponibile — continua a giocare! 🎱',
 namePh:'Il tuo nome — o Ospite',rackOver:'PARTITA FINITA',clearedKick:'TAVOLO PULITO',cleared:'TAVOLO PULITO!',outShots:'TIRI ESAURITI',
 stats:'Biglie in buca: <b>{a} / 8</b> · Tiri usati: {b} / 12',fouls:'Falli (bianca in buca): {n} · −{p}',bonus:'Bonus tavolo pulito: +250',final:'Tempo: {t}s · Punti finali: <b>{s}</b>',
 foulToast:'FALLO! −50',shareTxt:'Ho fatto {s} punti a Luna Pool 3D — {a} biglie su 8 in buca! 🎱🌙',copied:'Copiato!'},
nl:{break:'AFSTOOT',leaderboard:'RANGLIJST',submit:'SCORE VERSTUREN',share:'DELEN',again:'OPNIEUW SPELEN',close:'SLUITEN',allTime:'ALLERTIJDEN',thisWeek:'DEZE WEEK',loading:'LADEN…',power:'KRACHT',
 howto:'Eén witte bal, acht genummerde ballen, zes pockets, <b>12 stoten</b>.<br><b>Sleep</b> over de tafel om te richten — de lijn en spookcirkel tonen de treffer — trek dan de <b>KRACHT-balk omlaag</b> en <b>laat los</b> om te stoten.<br>Bal gepot: <b>+100</b> · Tafel leeg: <b>+250 bonus</b><br>Witte bal potten is een fout: <b>−50</b> en de witte bal komt terug.',
 sec:'🔒 Dit spel is 100% gratis en vraagt nooit om een wallet te verbinden of iets te ondertekenen om te spelen. Elke pagina die dat wel vraagt, is nep.',
 aim:'Sleep om te richten · trek KRACHT omlaag & laat los',shot:'STOOT',saved:'Opgeslagen!',saving:'Opslaan…',saveFail:'Opslaan mislukt — probeer opnieuw.',
 rank:'🏆 Je bent nr. {r} allertijden!',boardLoad:'Laden…',boardEmpty:'Nog geen scores — wees de eerste! 🏆',boardOff:'Ranglijst niet beschikbaar — speel verder! 🎱',
 namePh:'Je naam — of Gast',rackOver:'SPEL VOORBIJ',clearedKick:'TAFEL LEEG',cleared:'TAFEL LEEG!',outShots:'GEEN STOTEN MEER',
 stats:'Gepotte ballen: <b>{a} / 8</b> · Stoten gebruikt: {b} / 12',fouls:'Fouten (wit gepot): {n} · −{p}',bonus:'Bonus tafel leeg: +250',final:'Tijd: {t}s · Eindscore: <b>{s}</b>',
 foulToast:'FOUT! −50',shareTxt:'Ik scoorde {s} op Luna Pool 3D — {a} van 8 ballen gepot! 🎱🌙',copied:'Gekopieerd!'},
ru:{break:'РАЗБИТЬ',leaderboard:'ТАБЛИЦА ЛИДЕРОВ',submit:'ОТПРАВИТЬ РЕЗУЛЬТАТ',share:'ПОДЕЛИТЬСЯ',again:'ИГРАТЬ ЕЩЁ',close:'ЗАКРЫТЬ',allTime:'ЗА ВСЁ ВРЕМЯ',thisWeek:'ЭТА НЕДЕЛЯ',loading:'ЗАГРУЗКА…',power:'СИЛА',
 howto:'Один биток, восемь номерных шаров, шесть луз, <b>12 ударов</b>.<br><b>Ведите</b> по столу, чтобы прицелиться — линия и круг-призрак покажут удар — затем <b>потяните полосу СИЛЫ вниз</b> и <b>отпустите</b>, чтобы ударить.<br>Шар в лузе: <b>+100</b> · Чистый стол: <b>+250 бонус</b><br>Биток в лузе — фол: <b>−50</b>, биток возвращается.',
 sec:'🔒 Эта игра полностью бесплатна и никогда не просит подключить кошелёк или что-либо подписывать для игры. Любая страница, которая просит, — подделка.',
 aim:'Ведите для прицела · потяните СИЛУ вниз и отпустите',shot:'УДАР',saved:'Сохранено!',saving:'Сохранение…',saveFail:'Не удалось сохранить — попробуйте ещё раз.',
 rank:'🏆 Вы №{r} за всё время!',boardLoad:'Загрузка…',boardEmpty:'Пока нет результатов — будьте первым! 🏆',boardOff:'Таблица недоступна — играйте дальше! 🎱',
 namePh:'Ваше имя — или Гость',rackOver:'ИГРА ОКОНЧЕНА',clearedKick:'СТОЛ ЧИСТ',cleared:'СТОЛ ЧИСТ!',outShots:'УДАРЫ ЗАКОНЧИЛИСЬ',
 stats:'Забито шаров: <b>{a} / 8</b> · Ударов: {b} / 12',fouls:'Фолы (биток в лузе): {n} · −{p}',bonus:'Бонус за чистый стол: +250',final:'Время: {t}с · Итог: <b>{s}</b>',
 foulToast:'ФОЛ! −50',shareTxt:'Я набрал {s} в Luna Pool 3D — забил {a} из 8 шаров! 🎱🌙',copied:'Скопировано!'},
uk:{break:'РОЗБИТИ',leaderboard:'ТАБЛИЦЯ ЛІДЕРІВ',submit:'НАДІСЛАТИ РЕЗУЛЬТАТ',share:'ПОДІЛИТИСЯ',again:'ГРАТИ ЩЕ',close:'ЗАКРИТИ',allTime:'ЗА ВЕСЬ ЧАС',thisWeek:'ЦЕЙ ТИЖДЕНЬ',loading:'ЗАВАНТАЖЕННЯ…',power:'СИЛА',
 howto:'Один биток, вісім номерних куль, шість луз, <b>12 ударів</b>.<br><b>Ведіть</b> по столу, щоб прицілитися — лінія та коло-привид покажуть удар — потім <b>потягніть смугу СИЛИ вниз</b> і <b>відпустіть</b>, щоб ударити.<br>Куля в лузі: <b>+100</b> · Чистий стіл: <b>+250 бонус</b><br>Биток у лузі — фол: <b>−50</b>, биток повертається.',
 sec:'🔒 Ця гра повністю безкоштовна і ніколи не просить підключити гаманець чи щось підписувати для гри. Будь-яка сторінка, що просить, — підробка.',
 aim:'Ведіть для прицілу · потягніть СИЛУ вниз і відпустіть',shot:'УДАР',saved:'Збережено!',saving:'Збереження…',saveFail:'Не вдалося зберегти — спробуйте ще раз.',
 rank:'🏆 Ви №{r} за весь час!',boardLoad:'Завантаження…',boardEmpty:'Ще немає результатів — будьте першим! 🏆',boardOff:'Таблиця недоступна — грайте далі! 🎱',
 namePh:'Ваше ім\'я — або Гість',rackOver:'ГРУ ЗАВЕРШЕНО',clearedKick:'СТІЛ ЧИСТИЙ',cleared:'СТІЛ ЧИСТИЙ!',outShots:'УДАРИ ЗАКІНЧИЛИСЯ',
 stats:'Забито куль: <b>{a} / 8</b> · Ударів: {b} / 12',fouls:'Фоли (биток у лузі): {n} · −{p}',bonus:'Бонус за чистий стіл: +250',final:'Час: {t}с · Підсумок: <b>{s}</b>',
 foulToast:'ФОЛ! −50',shareTxt:'Я набрав {s} у Luna Pool 3D — забив {a} з 8 куль! 🎱🌙',copied:'Скопійовано!'},
tr:{break:'AÇILIŞ',leaderboard:'LİDERLİK TABLOSU',submit:'SKORU GÖNDER',share:'PAYLAŞ',again:'TEKRAR OYNA',close:'KAPAT',allTime:'TÜM ZAMANLAR',thisWeek:'BU HAFTA',loading:'YÜKLENİYOR…',power:'GÜÇ',
 howto:'Bir isteka topu, sekiz numaralı top, altı cep, <b>12 vuruş</b>.<br>Nişan almak için masada <b>sürükleyin</b> — kesikli çizgi ve hayalet daire teması gösterir — sonra <b>GÜÇ çubuğunu aşağı çekin</b> ve <b>bırakın</b>.<br>Top cepte: <b>+100</b> · Masa temiz: <b>+250 bonus</b><br>Beyaz topu sokmak faul: <b>−50</b> ve beyaz top geri gelir.',
 sec:'🔒 Bu oyun %100 ücretsizdir ve oynamak için asla cüzdan bağlamanızı veya bir şey imzalamanızı istemez. İsteyen herhangi bir sayfa sahtedir.',
 aim:'Nişan için sürükleyin · GÜÇ çubuğunu çekip bırakın',shot:'VURUŞ',saved:'Kaydedildi!',saving:'Kaydediliyor…',saveFail:'Kaydedilemedi — tekrar deneyin.',
 rank:'🏆 Tüm zamanlarda {r}. sıradasınız!',boardLoad:'Yükleniyor…',boardEmpty:'Henüz skor yok — ilk siz olun! 🏆',boardOff:'Tablo şu an yok — oynamaya devam! 🎱',
 namePh:'Adınız — veya Misafir',rackOver:'OYUN BİTTİ',clearedKick:'MASA TEMİZ',cleared:'MASA TEMİZ!',outShots:'VURUŞ BİTTİ',
 stats:'Sokulan toplar: <b>{a} / 8</b> · Vuruş: {b} / 12',fouls:'Fauller (beyaz cepte): {n} · −{p}',bonus:'Masa temiz bonusu: +250',final:'Süre: {t}sn · Final skoru: <b>{s}</b>',
 foulToast:'FAUL! −50',shareTxt:'Luna Pool 3D\'de {s} puan yaptım — 8 toptan {a} tanesini soktum! 🎱🌙',copied:'Kopyalandı!'},
ar:{break:'ابدأ',leaderboard:'لوحة المتصدرين',submit:'إرسال النتيجة',share:'مشاركة',again:'العب مجدداً',close:'إغلاق',allTime:'كل الأوقات',thisWeek:'هذا الأسبوع',loading:'جارٍ التحميل…',power:'القوة',
 howto:'كرة بيضاء واحدة وثماني كرات مرقمة وستة جيوب و<b>12 ضربة</b>.<br><b>اسحب</b> على الطاولة للتصويب — يُظهر الخط المتقطع والدائرة الشبحية نقطة الاصطدام — ثم <b>اسحب شريط القوة للأسفل</b> و<b>أفلته</b> للضرب.<br>كرة في الجيب: <b>+100</b> · طاولة نظيفة: <b>+250 مكافأة</b><br>إدخال الكرة البيضاء خطأ: <b>−50</b> وتعود الكرة البيضاء.',
 sec:'🔒 هذه اللعبة مجانية 100٪ ولا تطلب أبداً توصيل محفظة أو توقيع أي شيء للعب. أي صفحة تطلب ذلك مزيفة.',
 aim:'اسحب للتصويب · اسحب القوة للأسفل وأفلت للضرب',shot:'ضربة',saved:'تم الحفظ!',saving:'جارٍ الحفظ…',saveFail:'تعذر الحفظ — حاول مجدداً.',
 rank:'🏆 أنت رقم {r} في كل الأوقات!',boardLoad:'جارٍ التحميل…',boardEmpty:'لا نتائج بعد — كن الأول! 🏆',boardOff:'اللوحة غير متاحة الآن — واصل اللعب! 🎱',
 namePh:'اسمك — أو ضيف',rackOver:'انتهت اللعبة',clearedKick:'طاولة نظيفة',cleared:'طاولة نظيفة!',outShots:'انتهت الضربات',
 stats:'الكرات في الجيوب: <b>{a} / 8</b> · الضربات: {b} / 12',fouls:'أخطاء (البيضاء في الجيب): {n} · −{p}',bonus:'مكافأة الطاولة النظيفة: +250',final:'الوقت: {t}ث · النتيجة النهائية: <b>{s}</b>',
 foulToast:'خطأ! −50',shareTxt:'سجلت {s} في Luna Pool 3D — أدخلت {a} من 8 كرات! 🎱🌙',copied:'تم النسخ!'},
hi:{break:'ब्रेक',leaderboard:'लीडरबोर्ड',submit:'स्कोर भेजें',share:'शेयर करें',again:'फिर खेलें',close:'बंद करें',allTime:'सर्वकालिक',thisWeek:'इस सप्ताह',loading:'लोड हो रहा है…',power:'ताकत',
 howto:'एक क्यू बॉल, आठ नंबर वाली गेंदें, छह पॉकेट, <b>12 शॉट</b>।<br>निशाना लगाने के लिए टेबल पर <b>खींचें</b> — डैश वाली लाइन और गोस्ट सर्कल टक्कर दिखाते हैं — फिर <b>पावर बार को नीचे खींचें</b> और <b>छोड़ें</b>।<br>गेंद पॉकेट में: <b>+100</b> · पूरी टेबल साफ़: <b>+250 बोनस</b><br>क्यू बॉल गिराना फ़ाउल है: <b>−50</b> और क्यू बॉल वापस आती है।',
 sec:'🔒 यह गेम 100% मुफ़्त है और खेलने के लिए कभी वॉलेट कनेक्ट करने या कुछ साइन करने को नहीं कहता। जो पेज कहे, वह नकली है।',
 aim:'निशाने के लिए खींचें · पावर नीचे खींचकर छोड़ें',shot:'शॉट',saved:'सेव हो गया!',saving:'सेव हो रहा है…',saveFail:'सेव नहीं हुआ — फिर कोशिश करें।',
 rank:'🏆 आप सर्वकालिक #{r} हैं!',boardLoad:'लोड हो रहा है…',boardEmpty:'अभी कोई स्कोर नहीं — पहले बनें! 🏆',boardOff:'बोर्ड उपलब्ध नहीं — खेलते रहें! 🎱',
 namePh:'आपका नाम — या अतिथि',rackOver:'खेल खत्म',clearedKick:'टेबल साफ़',cleared:'टेबल साफ़!',outShots:'शॉट खत्म',
 stats:'पॉकेट हुई गेंदें: <b>{a} / 8</b> · शॉट: {b} / 12',fouls:'फ़ाउल (क्यू गिरी): {n} · −{p}',bonus:'टेबल साफ़ बोनस: +250',final:'समय: {t}s · अंतिम स्कोर: <b>{s}</b>',
 foulToast:'फ़ाउल! −50',shareTxt:'मैंने Luna Pool 3D में {s} स्कोर किया — 8 में से {a} गेंदें पॉकेट कीं! 🎱🌙',copied:'कॉपी हो गया!'},
id:{break:'MULAI',leaderboard:'PAPAN PERINGKAT',submit:'KIRIM SKOR',share:'BAGIKAN',again:'MAIN LAGI',close:'TUTUP',allTime:'SEPANJANG MASA',thisWeek:'MINGGU INI',loading:'MEMUAT…',power:'KEKUATAN',
 howto:'Satu bola putih, delapan bola bernomor, enam kantong, <b>12 pukulan</b>.<br><b>Seret</b> di meja untuk membidik — garis putus dan lingkaran hantu menunjukkan tumbukan — lalu <b>tarik bilah KEKUATAN ke bawah</b> dan <b>lepas</b> untuk memukul.<br>Bola masuk: <b>+100</b> · Meja bersih: <b>bonus +250</b><br>Memasukkan bola putih adalah pelanggaran: <b>−50</b> dan bola putih kembali.',
 sec:'🔒 Game ini 100% gratis dan tidak pernah meminta menghubungkan dompet atau menandatangani apa pun untuk bermain. Halaman yang meminta itu palsu.',
 aim:'Seret untuk membidik · tarik KEKUATAN ke bawah & lepas',shot:'PUKULAN',saved:'Tersimpan!',saving:'Menyimpan…',saveFail:'Gagal menyimpan — coba lagi.',
 rank:'🏆 Anda peringkat #{r} sepanjang masa!',boardLoad:'Memuat…',boardEmpty:'Belum ada skor — jadilah yang pertama! 🏆',boardOff:'Papan tidak tersedia — terus main! 🎱',
 namePh:'Nama Anda — atau Tamu',rackOver:'PERMAINAN SELESAI',clearedKick:'MEJA BERSIH',cleared:'MEJA BERSIH!',outShots:'PUKULAN HABIS',
 stats:'Bola masuk: <b>{a} / 8</b> · Pukulan: {b} / 12',fouls:'Pelanggaran (putih masuk): {n} · −{p}',bonus:'Bonus meja bersih: +250',final:'Waktu: {t}dtk · Skor akhir: <b>{s}</b>',
 foulToast:'PELANGGARAN! −50',shareTxt:'Saya mencetak {s} di Luna Pool 3D — memasukkan {a} dari 8 bola! 🎱🌙',copied:'Disalin!'},
vi:{break:'PHÁ BÓNG',leaderboard:'BẢNG XẾP HẠNG',submit:'GỬI ĐIỂM',share:'CHIA SẺ',again:'CHƠI LẠI',close:'ĐÓNG',allTime:'MỌI THỜI ĐẠI',thisWeek:'TUẦN NÀY',loading:'ĐANG TẢI…',power:'LỰC',
 howto:'Một bi cái, tám bi số, sáu lỗ, <b>12 cú đánh</b>.<br><b>Kéo</b> trên bàn để ngắm — đường đứt nét và vòng tròn ma cho thấy điểm chạm — rồi <b>kéo thanh LỰC xuống</b> và <b>thả ra</b> để đánh.<br>Bi vào lỗ: <b>+100</b> · Dọn sạch bàn: <b>+250 thưởng</b><br>Đánh bi cái vào lỗ là phạm luật: <b>−50</b> và bi cái quay lại.',
 sec:'🔒 Trò chơi này miễn phí 100% và không bao giờ yêu cầu kết nối ví hay ký bất cứ thứ gì để chơi. Trang nào yêu cầu là giả.',
 aim:'Kéo để ngắm · kéo LỰC xuống và thả để đánh',shot:'CÚ ĐÁNH',saved:'Đã lưu!',saving:'Đang lưu…',saveFail:'Không lưu được — thử lại.',
 rank:'🏆 Bạn đứng #{r} mọi thời đại!',boardLoad:'Đang tải…',boardEmpty:'Chưa có điểm — hãy là người đầu tiên! 🏆',boardOff:'Bảng không khả dụng — cứ chơi tiếp! 🎱',
 namePh:'Tên của bạn — hoặc Khách',rackOver:'HẾT VÁN',clearedKick:'DỌN SẠCH BÀN',cleared:'DỌN SẠCH BÀN!',outShots:'HẾT CÚ ĐÁNH',
 stats:'Bi vào lỗ: <b>{a} / 8</b> · Cú đánh: {b} / 12',fouls:'Phạm luật (bi cái vào lỗ): {n} · −{p}',bonus:'Thưởng dọn sạch bàn: +250',final:'Thời gian: {t}s · Điểm cuối: <b>{s}</b>',
 foulToast:'PHẠM LUẬT! −50',shareTxt:'Tôi ghi {s} điểm ở Luna Pool 3D — đưa {a}/8 bi vào lỗ! 🎱🌙',copied:'Đã sao chép!'},
th:{break:'เปิดเกม',leaderboard:'ตารางผู้นำ',submit:'ส่งคะแนน',share:'แชร์',again:'เล่นอีกครั้ง',close:'ปิด',allTime:'ตลอดกาล',thisWeek:'สัปดาห์นี้',loading:'กำลังโหลด…',power:'พลัง',
 howto:'ลูกขาวหนึ่งลูก ลูกหมายเลขแปดลูก หกหลุม <b>12 ช็อต</b><br><b>ลาก</b>บนโต๊ะเพื่อเล็ง — เส้นประและวงผีแสดงจุดปะทะ — จากนั้น<b>ดึงแถบพลังลง</b>แล้ว<b>ปล่อย</b>เพื่อแทง<br>ลูกเข้าหลุม: <b>+100</b> · เก็บหมดโต๊ะ: <b>โบนัส +250</b><br>แทงลูกขาวเข้าหลุมคือฟาวล์: <b>−50</b> และลูกขาวกลับมา',
 sec:'🔒 เกมนี้ฟรี 100% และไม่เคยขอให้เชื่อมต่อกระเป๋าเงินหรือเซ็นอะไรเพื่อเล่น หน้าที่ขอเป็นของปลอม',
 aim:'ลากเพื่อเล็ง · ดึงพลังลงแล้วปล่อยเพื่อแทง',shot:'ช็อต',saved:'บันทึกแล้ว!',saving:'กำลังบันทึก…',saveFail:'บันทึกไม่ได้ — ลองอีกครั้ง',
 rank:'🏆 คุณอยู่อันดับ #{r} ตลอดกาล!',boardLoad:'กำลังโหลด…',boardEmpty:'ยังไม่มีคะแนน — เป็นคนแรกเลย! 🏆',boardOff:'ตารางไม่พร้อม — เล่นต่อเลย! 🎱',
 namePh:'ชื่อของคุณ — หรือ แขก',rackOver:'จบเกม',clearedKick:'เก็บหมดโต๊ะ',cleared:'เก็บหมดโต๊ะ!',outShots:'หมดช็อต',
 stats:'ลูกเข้าหลุม: <b>{a} / 8</b> · ช็อตที่ใช้: {b} / 12',fouls:'ฟาวล์ (ลูกขาวเข้าหลุม): {n} · −{p}',bonus:'โบนัสเก็บหมดโต๊ะ: +250',final:'เวลา: {t}วิ · คะแนนสุดท้าย: <b>{s}</b>',
 foulToast:'ฟาวล์! −50',shareTxt:'ฉันทำได้ {s} คะแนนใน Luna Pool 3D — แทงลง {a} จาก 8 ลูก! 🎱🌙',copied:'คัดลอกแล้ว!'},
ko:{break:'브레이크',leaderboard:'리더보드',submit:'점수 제출',share:'공유',again:'다시 플레이',close:'닫기',allTime:'전체',thisWeek:'이번 주',loading:'로딩 중…',power:'파워',
 howto:'큐볼 1개, 번호공 8개, 포켓 6개, <b>12샷</b>.<br>테이블을 <b>드래그</b>해 조준하세요 — 점선과 고스트 원이 맞을 위치를 보여줍니다 — 그런 다음 <b>파워 바를 아래로 당겼다 놓으면</b> 샷!<br>공 포켓: <b>+100</b> · 테이블 클리어: <b>+250 보너스</b><br>큐볼을 넣으면 파울: <b>−50</b>, 큐볼이 돌아옵니다.',
 sec:'🔒 이 게임은 100% 무료이며 플레이를 위해 지갑 연결이나 서명을 절대 요구하지 않습니다. 요구하는 페이지는 가짜입니다.',
 aim:'드래그로 조준 · 파워를 당겼다 놓아 샷',shot:'샷',saved:'저장됨!',saving:'저장 중…',saveFail:'저장 실패 — 다시 시도하세요.',
 rank:'🏆 전체 {r}위입니다!',boardLoad:'로딩 중…',boardEmpty:'아직 점수가 없어요 — 첫 번째가 되세요! 🏆',boardOff:'보드를 불러올 수 없어요 — 계속 플레이! 🎱',
 namePh:'이름 — 또는 게스트',rackOver:'게임 종료',clearedKick:'테이블 클리어',cleared:'테이블 클리어!',outShots:'샷 소진',
 stats:'포켓한 공: <b>{a} / 8</b> · 사용한 샷: {b} / 12',fouls:'파울(큐볼 포켓): {n} · −{p}',bonus:'테이블 클리어 보너스: +250',final:'시간: {t}초 · 최종 점수: <b>{s}</b>',
 foulToast:'파울! −50',shareTxt:'Luna Pool 3D에서 {s}점 — 8개 중 {a}개 포켓! 🎱🌙',copied:'복사됨!'},
ja:{break:'ブレイク',leaderboard:'ランキング',submit:'スコアを送信',share:'シェア',again:'もう一度プレイ',close:'閉じる',allTime:'全期間',thisWeek:'今週',loading:'読み込み中…',power:'パワー',
 howto:'手球1個、番号ボール8個、ポケット6個、<b>12ショット</b>。<br>テーブルを<b>ドラッグ</b>して狙い（破線とゴーストサークルが当たる位置を表示）、<b>パワーバーを下に引いて離す</b>とショット。<br>ポケット: <b>+100</b> · テーブルクリア: <b>+250ボーナス</b><br>手球を落とすとファウル: <b>−50</b>で手球が戻ります。',
 sec:'🔒 このゲームは100%無料で、プレイのためにウォレット接続や署名を求めることは決してありません。求めるページは偽物です。',
 aim:'ドラッグで狙い · パワーを引いて離してショット',shot:'ショット',saved:'保存しました!',saving:'保存中…',saveFail:'保存できませんでした — 再試行してください。',
 rank:'🏆 全期間で#{r}位です!',boardLoad:'読み込み中…',boardEmpty:'まだスコアがありません — 最初の一人になろう! 🏆',boardOff:'ランキングは利用できません — プレイ続行! 🎱',
 namePh:'名前 — またはゲスト',rackOver:'ゲーム終了',clearedKick:'テーブルクリア',cleared:'テーブルクリア!',outShots:'ショット終了',
 stats:'ポケットしたボール: <b>{a} / 8</b> · ショット: {b} / 12',fouls:'ファウル(手球落下): {n} · −{p}',bonus:'テーブルクリアボーナス: +250',final:'時間: {t}秒 · 最終スコア: <b>{s}</b>',
 foulToast:'ファウル! −50',shareTxt:'Luna Pool 3Dで{s}点 — 8個中{a}個ポケット! 🎱🌙',copied:'コピーしました!'},
zh:{break:'开球',leaderboard:'排行榜',submit:'提交分数',share:'分享',again:'再来一局',close:'关闭',allTime:'总榜',thisWeek:'本周',loading:'加载中…',power:'力度',
 howto:'一颗主球、八颗号码球、六个袋口,<b>12 杆</b>。<br>在球桌上<b>拖动</b>瞄准 — 虚线和幽灵圈显示撞击点 — 然后<b>向下拉力度条</b>并<b>松手</b>击球。<br>进球: <b>+100</b> · 清台: <b>+250 奖励</b><br>主球落袋犯规: <b>−50</b>,主球回到原位。',
 sec:'🔒 本游戏 100% 免费,绝不会要求连接钱包或签署任何内容来游玩。任何提出这种要求的页面都是假的。',
 aim:'拖动瞄准 · 下拉力度并松手击球',shot:'杆',saved:'已保存!',saving:'保存中…',saveFail:'保存失败 — 请重试。',
 rank:'🏆 你是总榜第 #{r} 名!',boardLoad:'加载中…',boardEmpty:'暂无分数 — 来做第一名! 🏆',boardOff:'排行榜暂不可用 — 继续玩! 🎱',
 namePh:'你的名字 — 或访客',rackOver:'本局结束',clearedKick:'清台',cleared:'清台!',outShots:'杆数用完',
 stats:'进球: <b>{a} / 8</b> · 已用杆数: {b} / 12',fouls:'犯规(主球落袋): {n} · −{p}',bonus:'清台奖励: +250',final:'时间: {t}秒 · 最终分数: <b>{s}</b>',
 foulToast:'犯规! −50',shareTxt:'我在 Luna Pool 3D 得了 {s} 分 — 8 颗球进了 {a} 颗! 🎱🌙',copied:'已复制!'},
};
let lang = localStorage.getItem('lunaPoolLang') || 'en';
if (!I18N[lang]) lang = 'en';
const t = k => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
const tf = (k, o) => t(k).replace(/\{(\w)\}/g, (m, c) => o[c] !== undefined ? o[c] : m);
function applyLang(){
  document.querySelectorAll('[data-k]').forEach(el => { el.textContent = t(el.dataset.k); });
  $('howto').innerHTML = t('howto');
  $('secStrip').textContent = t('sec');
  $('powerLbl').textContent = t('power');
  $('aimHint').textContent = t('aim');
  $('loadTxt').textContent = t('loading');
  $('nameInput').placeholder = t('namePh');
  hud();
}
const langSel = $('langSel');
for (const [code, name] of LANGS){
  const op = document.createElement('option');
  op.value = code; op.textContent = name;
  langSel.appendChild(op);
}
langSel.value = lang;
langSel.onchange = () => { lang = langSel.value; localStorage.setItem('lunaPoolLang', lang); applyLang(); };

/* ================= audio (WebAudio synth, no assets) ================= */
let muted = localStorage.getItem('lunaPoolMute') === '1';
let AC = null;
function ensureAudio(){
  if (AC || muted) { if (AC && AC.resume) AC.resume(); return; }
  try { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) AC = new Ctx(); } catch (e) { AC = null; }
}
function beep(freq, t0, dur, type, vol, slide){
  if (!AC || muted) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, AC.currentTime + t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, AC.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol || 0.12, AC.currentTime + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + t0 + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(AC.currentTime + t0); o.stop(AC.currentTime + t0 + dur + 0.05);
  } catch (e) {}
}
function noiseBurst(dur, vol, freq){
  if (!AC || muted) return;
  try {
    const len = Math.max(1, (AC.sampleRate * dur) | 0), buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.createBufferSource(); src.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 0.8;
    const g = AC.createGain(); g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
  } catch (e) {}
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function sndClick(v){ noiseBurst(0.05, clamp(0.05 + v * 0.14, 0.05, 0.22), 2400); }
function sndCushion(v){ noiseBurst(0.06, clamp(0.03 + v * 0.07, 0.03, 0.12), 700); }
function sndShoot(p){ beep(190 + p * 120, 0, 0.07, 'triangle', 0.14, 90); noiseBurst(0.04, 0.12, 1500); }
function sndPocket(){ beep(520, 0, 0.09, 'sine', 0.13, 240); beep(880, 0.07, 0.1, 'sine', 0.11); beep(1318, 0.15, 0.16, 'sine', 0.1); }
function sndFoul(){ beep(220, 0, 0.16, 'sawtooth', 0.1, 110); beep(160, 0.14, 0.22, 'sawtooth', 0.09, 80); }
function sndClear(){ beep(784, 0, 0.12, 'triangle', 0.13); beep(988, 0.1, 0.12, 'triangle', 0.13); beep(1318, 0.2, 0.24, 'triangle', 0.13); }

/* ================= three setup ================= */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04061a);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);

/* environment reflections from a procedural equirect "pool hall" */
function makeEnvTexture(){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0a1030'); grad.addColorStop(0.55, '#13224d'); grad.addColorStop(1, '#05070f');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  /* bright softbox strips = the highlights you see in glossy balls */
  for (let i = 0; i < 6; i++){
    const x = 60 + i * 165, w = 88, y = 120 + (i % 2) * 40;
    const rg = g.createLinearGradient(x, y, x + w, y);
    rg.addColorStop(0, 'rgba(255,244,214,0)');
    rg.addColorStop(0.5, 'rgba(255,244,214,0.95)');
    rg.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = rg; g.fillRect(x, y, w, 26);
  }
  g.fillStyle = 'rgba(120,200,255,0.5)';
  for (let i = 0; i < 26; i++) g.fillRect(Math.random() * 1024, Math.random() * 200, 3, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.environment = makeEnvTexture();

const hemi = new THREE.HemisphereLight(0xbdd4ff, 0x1a1208, 0.55);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.4);
keyLight.position.set(1.4, 3.4, 1.8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -2.2; keyLight.shadow.camera.right = 2.2;
keyLight.shadow.camera.top = 2.6; keyLight.shadow.camera.bottom = -2.6;
keyLight.shadow.camera.far = 9; keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const lampLight = new THREE.PointLight(0xffc873, 5.5, 7, 1.8);
lampLight.position.set(0, 1.15, 0);
scene.add(lampLight);

/* ================= procedural textures ================= */
function feltTexture(){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 2048;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(512, 1024, 200, 512, 1024, 1500);
  grad.addColorStop(0, '#1b5c9c'); grad.addColorStop(0.6, '#17548f'); grad.addColorStop(1, '#123f6b');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 2048);
  /* cloth noise */
  for (let i = 0; i < 26000; i++){
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 1024, Math.random() * 2048, 1.6, 1.6);
  }
  /* Luna Classic crescent + wording printed on the cloth, classy and faint.
     Canvas y axis runs along table length; foot (rack end) is canvas top. */
  g.save();
  g.translate(512, 1024);
  g.globalAlpha = 0.10; g.fillStyle = '#ffd76a';
  g.beginPath();
  g.arc(0, 0, 118, 0, Math.PI * 2);
  g.arc(50, -30, 96, 0, Math.PI * 2, true);
  g.fill('evenodd');
  g.restore();
  g.save();
  g.globalAlpha = 0.16; g.fillStyle = '#ffe9a8';
  g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('L U N A   C L A S S I C', 512, 420);
  g.font = '700 30px system-ui, sans-serif'; g.globalAlpha = 0.12;
  g.fillText('★ LUNC DEV STUDIO ★', 512, 470);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function woodTexture(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6d4423'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++){
    const y = Math.random() * 512;
    g.strokeStyle = `rgba(${30 + Math.random() * 40 | 0},${16 + Math.random() * 22 | 0},6,${0.14 + Math.random() * 0.22})`;
    g.lineWidth = 1 + Math.random() * 3.4;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  for (let i = 0; i < 26; i++){
    const y = Math.random() * 512;
    g.strokeStyle = 'rgba(255,205,130,0.10)'; g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + (Math.random() * 10 - 5)); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function drawCrescent(g, x, y, r, color){
  g.save(); g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(x + r * 0.42, y - r * 0.25, r * 0.85, 0, Math.PI * 2); g.fill();
  g.restore();
}
const BALL_COLORS = [null, '#f7c531', '#2050c8', '#d8232a', '#6a2a91', '#f07818', '#1d9e4b', '#8e2434', '#17181c'];
function ballTexture(n){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  if (n === 0){
    g.fillStyle = '#f8f6f0'; g.fillRect(0, 0, 512, 256);
    drawCrescent(g, 128, 128, 34, '#e8a812');
    drawCrescent(g, 384, 128, 34, '#e8a812');
    g.fillStyle = '#c33';
    g.beginPath(); g.arc(256, 128, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, 128, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(512, 128, 7, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = BALL_COLORS[n]; g.fillRect(0, 0, 512, 256);
    /* subtle vertical shading so the wrap reads as a sphere print */
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)'); grad.addColorStop(0.5, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    for (const cx of [128, 384]){
      g.fillStyle = '#fdfdf8';
      g.beginPath(); g.arc(cx, 128, 54, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#14151a';
      g.font = '900 74px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), cx, 134);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function floorTexture(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  grad.addColorStop(0, '#101a3e'); grad.addColorStop(0.7, '#080d24'); grad.addColorStop(1, '#03040c');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= table ================= */
const HW = 0.71, HL = 1.42;          /* play-field half extents (cushion nose line) */
const BR = 0.0405;                   /* ball radius */
const POCKETS = [
  { x: -HW, z: -HL, r: 0.080, vr: 0.064 }, { x: HW, z: -HL, r: 0.080, vr: 0.064 },
  { x: -HW - 0.018, z: 0, r: 0.072, vr: 0.058 }, { x: HW + 0.018, z: 0, r: 0.072, vr: 0.058 },
  { x: -HW, z: HL, r: 0.080, vr: 0.064 }, { x: HW, z: HL, r: 0.080, vr: 0.064 },
];
const HEAD_Z = 0.92, FOOT_Z = -0.88;
const tableGroup = new THREE.Group();
scene.add(tableGroup);
{
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.88, metalness: 0, envMapIntensity: 0.3 });
  const felt = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.16, 0.05, HL * 2 + 0.16), feltMat);
  felt.position.y = -0.025; felt.receiveShadow = true;
  tableGroup.add(felt);

  const woodTex = woodTexture();
  const woodMat = new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x17548f, roughness: 0.95, envMapIntensity: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.6, envMapIntensity: 0.4 });

  function railRun(len, x, z, rotY){
    const grp = new THREE.Group();
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, len), clothMat);
    cushion.position.set(0, 0.017, 0); cushion.castShadow = true; cushion.receiveShadow = true;
    grp.add(cushion);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, len + 0.1), woodMat);
    cap.position.set(0.075, 0.026, 0); cap.castShadow = true; cap.receiveShadow = true;
    grp.add(cap);
    /* gold diamond sights */
    const diaGeo = new THREE.BoxGeometry(0.02, 0.008, 0.02);
    const diaMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.25, metalness: 0.9, envMapIntensity: 1.4 });
    const n = Math.max(2, Math.round(len / 0.36));
    for (let i = 1; i < n; i++){
      const d = new THREE.Mesh(diaGeo, diaMat);
      d.position.set(0.075, 0.056, -len / 2 + (len * i) / n);
      d.rotation.y = Math.PI / 4;
      grp.add(d);
    }
    grp.position.set(x, 0, z); grp.rotation.y = rotY;
    tableGroup.add(grp);
  }
  /* long side rails (split by the side pockets) */
  const segLen = HL - 0.10;
  for (const sx of [-1, 1]){
    railRun(segLen, sx * (HW + 0.028), -(HL / 2 + 0.012), sx > 0 ? Math.PI : 0);
    railRun(segLen, sx * (HW + 0.028), (HL / 2 + 0.012), sx > 0 ? Math.PI : 0);
  }
  /* end rails */
  railRun(HW * 2 - 0.14, 0, -(HL + 0.028), -Math.PI / 2);
  railRun(HW * 2 - 0.14, 0, (HL + 0.028), Math.PI / 2);

  /* apron + branding plate */
  const apron = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.44, 0.17, HL * 2 + 0.44), darkMat);
  apron.position.y = -0.135; apron.castShadow = true;
  tableGroup.add(apron);

  /* pockets: black depth + leather rim */
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x010102 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x191008, roughness: 0.55, envMapIntensity: 0.5 });
  for (const p of POCKETS){
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(p.vr, p.vr * 0.8, 0.09, 24), holeMat);
    hole.position.set(p.x, -0.028, p.z);
    tableGroup.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(p.vr + 0.004, 0.011, 10, 28), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(p.x, 0.012, p.z);
    tableGroup.add(rim);
  }

  /* floor + starfield */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.62; floor.receiveShadow = true;
  scene.add(floor);
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 420; i++){
    const a = Math.random() * Math.PI * 2, r = 7 + Math.random() * 16, y = Math.random() * 9 - 1;
    sp.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaac4ff, size: 0.045, sizeAttenuation: true })));

  /* hanging lamp shades over the table */
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x0d3f33, roughness: 0.4, metalness: 0.4, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdca8 });
  for (const lz of [-0.72, 0, 0.72]){
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.13, 24, 1, true), shadeMat);
    shade.position.set(0, 1.18, lz);
    scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), bulbMat);
    bulb.position.set(0, 1.12, lz);
    scene.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0x0a0a12 }));
    cord.position.set(0, 2.0, lz);
    scene.add(cord);
  }
}

/* ================= balls ================= */
const ballGeo = new THREE.SphereGeometry(BR, 40, 28);
let balls = [];
function makeBallMesh(n){
  const mat = new THREE.MeshStandardMaterial({ map: ballTexture(n), roughness: 0.15, metalness: 0, envMapIntensity: 1.2 });
  const m = new THREE.Mesh(ballGeo, mat);
  m.castShadow = true;
  return m;
}
function rackBalls(){
  for (const b of balls) scene.remove(b.mesh);
  balls = [];
  const cue = { n: 0, cue: true, x: 0, z: HEAD_Z, vx: 0, vz: 0, active: true, sinking: 0, mesh: makeBallMesh(0) };
  balls.push(cue); scene.add(cue.mesh);
  const rows = [[0], [-0.5, 0.5], [-1, 0, 1], [-0.5, 0.5]];
  const dx = BR * 2 + 0.0012, dz = BR * 1.78;
  let n = 1;
  rows.forEach((row, r) => {
    for (const off of row){
      if (n > 8) break;
      const b = { n, cue: false, x: off * dx, z: FOOT_Z - r * dz, vx: 0, vz: 0, active: true, sinking: 0, mesh: makeBallMesh(n) };
      n++;
      balls.push(b); scene.add(b.mesh);
    }
  });
  syncMeshes();
}
function syncMeshes(){
  for (const b of balls){
    b.mesh.position.set(b.x, BR, b.z);
    b.mesh.visible = b.active || b.sinking > 0;
  }
}
function moonsLeft(){ return balls.filter(b => !b.cue && b.active).length; }
function allStopped(){ return balls.every(b => !b.active || b.sinking > 0 || (b.vx === 0 && b.vz === 0)); }

/* cue stick */
const cueGroup = new THREE.Group();
{
  const cueTex = woodTexture();
  const cueMat = new THREE.MeshStandardMaterial({ map: cueTex, roughness: 0.42, envMapIntensity: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0135, 1.45, 12), cueMat);
  shaft.geometry.rotateX(Math.PI / 2);           /* length along Z */
  shaft.geometry.translate(0, 0, -0.725);        /* tip at local origin, butt at -Z */
  shaft.castShadow = true;
  cueGroup.add(shaft);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.012, 10), new THREE.MeshStandardMaterial({ color: 0x3a6ad8, roughness: 0.6 }));
  tip.geometry.rotateX(Math.PI / 2); tip.position.z = 0.004;
  cueGroup.add(tip);
  scene.add(cueGroup);
}

/* aim visuals: dashed line + ghost ring + target tick */
const aimMat = new THREE.LineDashedMaterial({ color: 0xffe9a8, dashSize: 0.035, gapSize: 0.022, transparent: true, opacity: 0.95 });
const aimLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimLineGeo, aimMat);
aimLine.frustumCulled = false; scene.add(aimLine);
const tickMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const tickGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tickLine = new THREE.Line(tickGeo, tickMat);
tickLine.frustumCulled = false; scene.add(tickLine);
const ghost = new THREE.Mesh(new THREE.RingGeometry(BR * 0.72, BR * 0.98, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
ghost.rotation.x = -Math.PI / 2; ghost.position.y = 0.006;
scene.add(ghost);

let aimA = 0;                       /* 0 = straight up-table (-Z) */
let power = 0;
function aimDir(){ return { x: Math.sin(aimA), z: -Math.cos(aimA) }; }
function computeAim(){
  const cue = balls[0], d = aimDir();
  const ox = cue.x, oz = cue.z;
  let bestT = Infinity, hitBall = null;
  for (const b of balls){
    if (b.cue || !b.active || b.sinking) continue;
    const rx = b.x - ox, rz = b.z - oz;
    const proj = rx * d.x + rz * d.z;
    if (proj <= 0) continue;
    const perp2 = rx * rx + rz * rz - proj * proj;
    const rr = 2 * BR;
    if (perp2 >= rr * rr) continue;
    const tt = proj - Math.sqrt(rr * rr - perp2);
    if (tt > 0 && tt < bestT){ bestT = tt; hitBall = b; }
  }
  /* cushion distance */
  let tRail = Infinity;
  if (d.x > 1e-6) tRail = Math.min(tRail, ((HW - BR) - ox) / d.x);
  if (d.x < -1e-6) tRail = Math.min(tRail, ((-HW + BR) - ox) / d.x);
  if (d.z > 1e-6) tRail = Math.min(tRail, ((HL - BR) - oz) / d.z);
  if (d.z < -1e-6) tRail = Math.min(tRail, ((-HL + BR) - oz) / d.z);
  const tEnd = Math.min(bestT, tRail);
  const gx = ox + d.x * tEnd, gz = oz + d.z * tEnd;
  return { gx, gz, hitBall, tEnd };
}
function updateAimVisuals(){
  const cue = balls[0]; if (!cue) return;
  const show = state === 'play' && phase === 'aim' && cue.active && !cue.sinking;
  aimLine.visible = tickLine.visible = ghost.visible = cueGroup.visible = !!show;
  $('powerRail').style.display = show ? 'block' : 'none';
  $('aimHint').style.display = show ? 'block' : 'none';
  if (!show) return;
  const d = aimDir();
  const { gx, gz, hitBall } = computeAim();
  const p = aimLineGeo.attributes.position.array;
  p[0] = cue.x + d.x * (BR + 0.004); p[1] = 0.008; p[2] = cue.z + d.z * (BR + 0.004);
  p[3] = gx; p[4] = 0.008; p[5] = gz;
  aimLineGeo.attributes.position.needsUpdate = true;
  aimLine.computeLineDistances();
  ghost.position.set(gx, 0.006, gz);
  const tp = tickGeo.attributes.position.array;
  if (hitBall){
    let tx = hitBall.x - gx, tz = hitBall.z - gz;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    tp[0] = hitBall.x; tp[1] = 0.008; tp[2] = hitBall.z;
    tp[3] = hitBall.x + tx * 0.17; tp[4] = 0.008; tp[5] = hitBall.z + tz * 0.17;
    tickLine.visible = true;
  } else tickLine.visible = false;
  tickGeo.attributes.position.needsUpdate = true;
  /* cue stick behind the ball, pulled back with power */
  const pull = 0.015 + power * 0.21;
  cueGroup.position.set(cue.x - d.x * (BR + pull), BR + 0.018, cue.z - d.z * (BR + pull));
  cueGroup.lookAt(cue.x, BR - 0.01, cue.z);
}

/* ================= physics ================= */
let shotPotted = 0, cuePotted = false;
function startSink(b){
  if (b.sinking) return;
  b.sinking = 0.0001; b.vx = 0; b.vz = 0;
  if (b.cue) cuePotted = true;
  else { shotPotted++; pocketedCount++; score += 100; sndPocket(); }
  hud();
}
function physicsStep(dt){
  const steps = Math.max(1, Math.min(24, Math.ceil(dt / (1 / 480))));
  const h = dt / steps;
  for (let s = 0; s < steps; s++){
    for (const b of balls){
      if (!b.active || b.sinking) continue;
      if (b.vx === 0 && b.vz === 0) continue;
      b.x += b.vx * h; b.z += b.vz * h;
      /* friction: exponential cloth drag + rolling stop */
      const damp = Math.exp(-0.42 * h);
      b.vx *= damp; b.vz *= damp;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 0.02){ b.vx = 0; b.vz = 0; }
      /* pockets */
      for (const p of POCKETS){
        const ddx = b.x - p.x, ddz = b.z - p.z;
        if (ddx * ddx + ddz * ddz < p.r * p.r){ startSink(b); break; }
      }
      if (!b.active || b.sinking) continue;
      /* safety: never leave the table */
      if (Math.abs(b.x) > HW + 0.05 || Math.abs(b.z) > HL + 0.05){
        let np = null, nd = 1e9;
        for (const p of POCKETS){ const dd = Math.hypot(b.x - p.x, b.z - p.z); if (dd < nd){ nd = dd; np = p; } }
        if (nd < 0.15){ startSink(b); continue; }
        b.x = clamp(b.x, -HW + BR, HW - BR); b.z = clamp(b.z, -HL + BR, HL - BR);
        b.vx *= -0.5; b.vz *= -0.5;
      }
      /* cushions (skipped inside pocket mouths) */
      const nearPocketZ = Math.min(Math.abs(b.z + HL), Math.abs(b.z), Math.abs(b.z - HL)) < 0.115;
      const nearPocketX = Math.abs(Math.abs(b.x) - HW) < 0.115;
      if (!nearPocketZ){
        if (b.x < -HW + BR){ b.x = -HW + BR; if (b.vx < 0){ if (b.vx < -0.35) sndCushion(-b.vx); b.vx = -b.vx * 0.74; } }
        if (b.x > HW - BR){ b.x = HW - BR; if (b.vx > 0){ if (b.vx > 0.35) sndCushion(b.vx); b.vx = -b.vx * 0.74; } }
      }
      if (!nearPocketX){
        if (b.z < -HL + BR){ b.z = -HL + BR; if (b.vz < 0){ if (b.vz < -0.35) sndCushion(-b.vz); b.vz = -b.vz * 0.74; } }
        if (b.z > HL - BR){ b.z = HL - BR; if (b.vz > 0){ if (b.vz > 0.35) sndCushion(b.vz); b.vz = -b.vz * 0.74; } }
      }
    }
    /* ball-ball collisions */
    for (let i = 0; i < balls.length; i++){
      const a = balls[i];
      if (!a.active || a.sinking) continue;
      for (let j = i + 1; j < balls.length; j++){
        const b = balls[j];
        if (!b.active || b.sinking) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz, min = 2 * BR;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const overlap = (min - d) / 2;
        a.x -= nx * overlap; a.z -= nz * overlap;
        b.x += nx * overlap; b.z += nz * overlap;
        const rvn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rvn >= 0) continue;
        const imp = -(1 + 0.95) * rvn / 2;
        a.vx -= imp * nx; a.vz -= imp * nz;
        b.vx += imp * nx; b.vz += imp * nz;
        if (rvn < -0.4) sndClick(-rvn);
      }
    }
  }
}
function updateSinks(dt){
  for (const b of balls){
    if (!b.sinking) continue;
    b.sinking += dt / 0.38;
    const k = Math.min(1, b.sinking);
    b.mesh.position.y = BR - k * 0.085;
    const sc = 1 - k * 0.35;
    b.mesh.scale.setScalar(sc);
    if (b.sinking >= 1){
      b.sinking = 0; b.active = false; b.mesh.visible = false;
      b.mesh.position.y = BR; b.mesh.scale.setScalar(1);
    }
  }
}
const _rollAxis = new THREE.Vector3(), _rollQ = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _vel = new THREE.Vector3();
function updateRolling(dt){
  for (const b of balls){
    if (!b.active || b.sinking) continue;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp <= 0) continue;
    _vel.set(b.vx, 0, b.vz);
    _rollAxis.crossVectors(_up, _vel).normalize();
    _rollQ.setFromAxisAngle(_rollAxis, (sp * dt) / BR);
    b.mesh.quaternion.premultiply(_rollQ);
  }
}

/* ================= game state & flow ================= */
let state = 'menu';                 /* menu | play | over */
let phase = 'aim';                  /* aim | rolling */
let score = 0, shots = 0, elapsed = 0, fouls = 0, pocketedCount = 0;
let clearBonusGiven = false, wasMoving = false;
const MAX_SHOTS = 12;

function hud(){
  $('hudShots').textContent = t('shot') + ' ' + shots + '/' + MAX_SHOTS;
  $('hudBalls').textContent = '🎱×' + (balls.length ? moonsLeft() : 8);
  $('hudScore').textContent = score;
}
function toast(txt, ms){
  const el = $('toast');
  el.textContent = txt; el.style.opacity = 1;
  clearTimeout(el._h);
  el._h = setTimeout(() => { el.style.opacity = 0; }, ms || 1300);
}
function startRack(){
  score = 0; shots = 0; elapsed = 0; fouls = 0; pocketedCount = 0;
  clearBonusGiven = false; wasMoving = false;
  shotPotted = 0; cuePotted = false;
  aimA = 0; power = 0; setPowerUI();
  rackBalls();
  state = 'play'; phase = 'aim';
  $('startScreen').style.display = 'none';
  $('overScreen').style.display = 'none';
  ensureAudio();
  hud();
}
function respotCue(){
  const cue = balls[0];
  cue.active = true; cue.sinking = 0; cue.vx = 0; cue.vz = 0;
  cue.mesh.visible = true; cue.mesh.position.y = BR; cue.mesh.scale.setScalar(1);
  let z = HEAD_Z;
  const blocked = zz => balls.some(b => b !== cue && b.active && Math.hypot(b.x - 0, b.z - zz) < 2.2 * BR);
  while (blocked(z) && z > -HL + 0.2) z -= 0.05;
  cue.x = 0; cue.z = z;
  syncMeshes();
}
function shoot(pw){
  if (state !== 'play' || phase !== 'aim') return;
  const cue = balls[0];
  if (!cue.active || cue.sinking) return;
  const d = aimDir();
  const sp = 2.0 + clamp(pw, 0, 1) * 6.6;
  cue.vx = d.x * sp; cue.vz = d.z * sp;
  shots++; shotPotted = 0; cuePotted = false;
  phase = 'rolling'; wasMoving = true;
  sndShoot(pw);
  power = 0; setPowerUI();
  hud();
}
function resolveSettled(){
  if (cuePotted){
    fouls++; score -= 50;
    toast(t('foulToast'), 1500);
    sndFoul();
    respotCue();
    cuePotted = false;
  }
  if (moonsLeft() === 0 && !clearBonusGiven){
    score += 250; clearBonusGiven = true;
    sndClear();
  }
  hud();
  if (moonsLeft() === 0 || shots >= MAX_SHOTS){
    setTimeout(endRack, 650);
    phase = 'done';
  } else {
    phase = 'aim';
  }
}
function endRack(){
  if (state !== 'play') return;
  state = 'over';
  const cleared = moonsLeft() === 0;
  localStorage.setItem('lunaPoolBest', Math.max(+(localStorage.getItem('lunaPoolBest') || 0), score));
  $('overKicker').textContent = cleared ? t('clearedKick') : t('rackOver');
  $('overBadge').textContent = cleared ? '🏆' : '🎱';
  $('overTitle').textContent = cleared ? t('cleared') : t('outShots');
  $('overStats').innerHTML =
    tf('stats', { a: pocketedCount, b: shots }) + '<br>' +
    (fouls ? tf('fouls', { n: fouls, p: fouls * 50 }) + '<br>' : '') +
    (clearBonusGiven ? t('bonus') + '<br>' : '') +
    tf('final', { t: elapsed.toFixed(1), s: score });
  $('submitStatus').textContent = '';
  $('submitBtn').disabled = false;
  prefillName();
  $('overScreen').style.display = 'flex';
  if (cleared) sndClear();
  hud();
}

/* ================= input: drag to aim, pull power ================= */
let aimDrag = null;
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (state !== 'play' || phase !== 'aim') return;
  aimDrag = { x: e.clientX, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!aimDrag || e.pointerId !== aimDrag.id) return;
  const dx = e.clientX - aimDrag.x;
  aimDrag.x = e.clientX;
  aimA += dx * 0.0042;
});
const endAimDrag = e => { if (aimDrag && e.pointerId === aimDrag.id) aimDrag = null; };
canvas.addEventListener('pointerup', endAimDrag);
canvas.addEventListener('pointercancel', endAimDrag);

const rail = $('powerRail');
let railDrag = null;
function setPowerUI(){ $('powerFill').style.height = (power * 100).toFixed(1) + '%'; }
rail.addEventListener('pointerdown', e => {
  ensureAudio();
  if (state !== 'play' || phase !== 'aim') return;
  railDrag = { y: e.clientY, id: e.pointerId };
  rail.setPointerCapture(e.pointerId);
  e.preventDefault();
});
rail.addEventListener('pointermove', e => {
  if (!railDrag || e.pointerId !== railDrag.id) return;
  const h = rail.getBoundingClientRect().height || 200;
  power = clamp((e.clientY - railDrag.y) / (h * 0.92), 0, 1);
  setPowerUI();
});
const endRail = e => {
  if (!railDrag || e.pointerId !== railDrag.id) return;
  railDrag = null;
  if (power >= 0.04) shoot(power);
  else { power = 0; setPowerUI(); }
};
rail.addEventListener('pointerup', endRail);
rail.addEventListener('pointercancel', endRail);
addEventListener('keydown', e => {
  if (state !== 'play' || phase !== 'aim') return;
  if (e.key === 'ArrowLeft' || e.key === 'a') aimA -= 0.045;
  else if (e.key === 'ArrowRight' || e.key === 'd') aimA += 0.045;
  else if (e.key === 'ArrowUp' || e.key === 'w'){ power = clamp(power + 0.06, 0, 1); setPowerUI(); }
  else if (e.key === 'ArrowDown' || e.key === 's'){ power = clamp(power - 0.06, 0, 1); setPowerUI(); }
  else if (e.key === ' '){ shoot(power > 0.03 ? power : 0.65); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') startRack();
});

/* ================= camera ================= */
const camPos = new THREE.Vector3(0, 1.6, 3.2), camTgt = new THREE.Vector3(0, 0, 0);
camera.position.copy(camPos);
let menuAngle = 0.6, shotOrigin = new THREE.Vector3(), shotDirV = new THREE.Vector2(0, -1);
function updateCamera(dt){
  const desired = new THREE.Vector3(), tgt = new THREE.Vector3();
  if (state === 'menu' || state === 'over'){
    menuAngle += dt * 0.07;
    desired.set(Math.sin(menuAngle) * 2.55, 1.5, Math.cos(menuAngle) * 2.55);
    tgt.set(0, -0.05, -0.1);
  } else if (phase === 'aim' || phase === 'done'){
    const cue = balls[0], d = aimDir();
    desired.set(cue.x - d.x * 0.36, 0.17, cue.z - d.z * 0.36);
    tgt.set(cue.x + d.x * 0.45, -0.01, cue.z + d.z * 0.45);
  } else {
    /* follow the action from behind the shot line */
    let cx = 0, cz = 0, wsum = 0;
    for (const b of balls){
      if (!b.active || b.sinking) continue;
      const w = 0.25 + Math.hypot(b.vx, b.vz);
      cx += b.x * w; cz += b.z * w; wsum += w;
    }
    if (wsum){ cx /= wsum; cz /= wsum; } else { cx = shotOrigin.x; cz = shotOrigin.z; }
    desired.set(shotOrigin.x - shotDirV.x * 1.45, 0.98, shotOrigin.z - shotDirV.y * 1.45);
    tgt.set(cx, 0, cz);
  }
  const k = 1 - Math.exp(-dt * (phase === 'rolling' ? 3.2 : 5.2));
  camPos.lerp(desired, k); camTgt.lerp(tgt, k);
  camera.position.copy(camPos);
  camera.lookAt(camTgt);
}
const _origShoot = shoot;
shoot = function(pw){
  const cue = balls[0];
  if (cue){ shotOrigin.set(cue.x, 0, cue.z); const d = aimDir(); shotDirV.set(d.x, d.z); }
  _origShoot(pw);
};

/* ================= leaderboard (same contract as the original) ================= */
const API_URL = 'https://frg-fight-club.vercel.app/api/luna-games?game=pool';
function prefillName(){
  const inp = $('nameInput');
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
  const tname = tg && tg.user && tg.user.first_name;
  inp.value = (localStorage.getItem('lunaPoolName') || tname || 'Guest').slice(0, 16);
}
let boardData = null, boardTab = 'all', boardErr = false;
async function loadBoard(){
  $('boardList').innerHTML = '<p style="text-align:center; opacity:.8">' + t('boardLoad') + '</p>';
  boardErr = false;
  try {
    const r = await fetch(API_URL);
    if (!r.ok) throw new Error('board ' + r.status);
    boardData = await r.json();
  } catch (e) { boardData = null; boardErr = true; }
  renderBoard();
}
function renderBoard(){
  $('tabAll').className = 'play' + (boardTab === 'all' ? '' : ' alt');
  $('tabWeek').className = 'play' + (boardTab === 'week' ? '' : ' alt');
  if (boardErr || !boardData){
    $('boardList').innerHTML = '<p style="text-align:center; opacity:.8">' + t('boardOff') + '</p>';
    return;
  }
  const rows = boardData[boardTab] || [];
  if (!rows.length){
    $('boardList').innerHTML = '<p style="text-align:center; opacity:.8">' + t('boardEmpty') + '</p>';
    return;
  }
  $('boardList').innerHTML = rows.map((r, i) =>
    `<div class="row"><span class="rk">${i + 1}.</span><span class="nm"></span><span class="sc">${r.score}</span></div>`
  ).join('');
  [...$('boardList').querySelectorAll('.row .nm')].forEach((el, i) => { el.textContent = rows[i].name; });
}
function openBoard(){
  $('boardScreen').style.display = 'flex';
  boardTab = 'all';
  loadBoard();
}
$('tabAll').onclick = () => { boardTab = 'all'; renderBoard(); };
$('tabWeek').onclick = () => { boardTab = 'week'; renderBoard(); };
$('boardClose').onclick = () => { $('boardScreen').style.display = 'none'; };
$('boardBtn').onclick = openBoard;
$('overBoardBtn').onclick = openBoard;
$('submitBtn').onclick = async () => {
  const btn = $('submitBtn');
  btn.disabled = true;
  const name = ($('nameInput').value.trim() || 'Guest').slice(0, 16);
  localStorage.setItem('lunaPoolName', name);
  $('submitStatus').textContent = t('saving');
  const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.initData) || '';
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, name, score, seconds: Math.round(elapsed) }),
    });
    const d = await r.json();
    if (d && d.ok){
      $('submitStatus').textContent = d.rank ? tf('rank', { r: d.rank }) : t('saved');
      boardData = null;
    } else {
      $('submitStatus').textContent = t('saveFail');
      btn.disabled = false;
    }
  } catch (e) {
    $('submitStatus').textContent = t('saveFail');
    btn.disabled = false;
  }
};
$('shareBtn').onclick = async () => {
  const text = tf('shareTxt', { s: score, a: pocketedCount });
  try {
    if (navigator.share){
      await navigator.share({ title: 'Luna Pool 3D', text, url: location.href });
    } else if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text + ' ' + location.href);
      $('shareStatus').textContent = t('copied');
    }
  } catch (e) { /* user cancelled the share sheet */ }
};
$('startBtn').onclick = () => { ensureAudio(); startRack(); };
$('againBtn').onclick = () => { ensureAudio(); startRack(); };
$('rstBtn').onclick = () => { if (state === 'play' || state === 'over') startRack(); };
$('muteBtn').onclick = () => {
  muted = !muted;
  localStorage.setItem('lunaPoolMute', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
  if (!muted) ensureAudio();
};

/* ================= resize ================= */
function fit(){
  const wrap = $('cvwrap');
  const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 120));

/* ================= test/autopilot API (same shape as the original) ================= */
window.LP = {
  get state(){ return state; },
  get phase(){ return phase; },
  get balls(){ return balls.map(b => ({ n: b.n, cue: b.cue, x: b.x, y: b.z, z: b.z, vx: b.vx, vz: b.vz, active: b.active })); },
  get score(){ return score; },
  get shots(){ return shots; },
  get elapsed(){ return elapsed; },
  get fouls(){ return fouls; },
  get pocketedCount(){ return pocketedCount; },
  get clearBonusGiven(){ return clearBonusGiven; },
  get aimA(){ return aimA; },
  get power(){ return power; },
  moonsLeft, allStopped,
  canShoot(){ return state === 'play' && phase === 'aim'; },
  startRack,
  shoot(pw){ shoot(pw === undefined ? 0.8 : pw); },
  setAim(a){ aimA = a; },
  setPower(p){ power = clamp(p, 0, 1); setPowerUI(); },
  aimTarget(){ const c = computeAim(); return { x: c.gx, z: c.gz, hit: c.hitBall ? c.hitBall.n : null }; },
  step(dt){ if (state === 'play'){ physicsStep(dt); updateSinks(dt); checkSettle(); } },
  debugPlace(n, x, z){ const b = balls[n]; if (b){ b.x = x; b.z = z; b.vx = 0; b.vz = 0; b.active = true; b.sinking = 0; b.mesh.visible = true; b.mesh.position.y = BR; syncMeshes(); } },
  debugPocket(n){ const b = balls[n]; if (b){ b.active = false; b.vx = 0; b.vz = 0; b.mesh.visible = false; if (!b.cue) pocketedCount = balls.filter(x => !x.cue && !x.active).length; hud(); } },
  POCKETS: POCKETS.map(p => ({ x: p.x, y: p.z, z: p.z, r: p.r })),
  HEAD: { x: 0, y: HEAD_Z },
  THREE, scene, camera, renderer,
};
function checkSettle(){
  const moving = balls.some(b => b.active && !b.sinking && (b.vx !== 0 || b.vz !== 0)) || balls.some(b => b.sinking);
  if (phase === 'rolling' && wasMoving && !moving){
    wasMoving = false;
    resolveSettled();
  }
}

/* ================= main loop & boot ================= */
const clock = new THREE.Clock();
function frame(){
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, clock.getDelta() || 0.016);
  if (state === 'play'){
    elapsed += dt;
    if (phase === 'rolling'){
      physicsStep(dt);
      updateSinks(dt);
      checkSettle();
    }
  }
  updateRolling(dt);
  syncMeshes();
  for (const b of balls) if (b.sinking) b.mesh.position.y = BR - Math.min(1, b.sinking) * 0.085;
  updateAimVisuals();
  updateCamera(dt);
  renderer.render(scene, camera);
}
rackBalls();
applyLang();
$('muteBtn').textContent = muted ? '🔇' : '🔊';
fit();
requestAnimationFrame(frame);
setTimeout(() => {
  $('loadBar').style.width = '100%';
  setTimeout(() => {
    $('loadScreen').style.display = 'none';
    $('startScreen').style.display = 'flex';
  }, 250);
}, 350);
