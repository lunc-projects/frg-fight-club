/* PIPE HERO — a bagpipe rhythm game.
   Notes stream down 4 chanter lanes; tap (or D F J K) as they cross the
   ring. All music is ORIGINAL and synthesized live with WebAudio: a
   constant bagpipe drone + a monophonic chanter voice the player
   literally plays — hit a note and it sounds, miss and it SQUEAKS.
   Charts are procedurally composed in Scottish style from seeded
   patterns (deterministic: the same chart for every player). */
window.__errs = [];
window.addEventListener('error', e => { window.__errs.push(String(e.message || e.error)); });
const $ = id => document.getElementById(id);

/* ================= i18n (18 languages, menus/buttons/judgements) ================= */
const LANGS = [
  ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['ru', 'Русский'],
  ['uk', 'Українська'], ['tr', 'Türkçe'], ['ar', 'العربية'], ['hi', 'हिन्दी'],
  ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['ko', '한국어'],
  ['ja', '日本語'], ['zh', '中文'],
];
const I18N = {
en: { tagline: 'PLAY THE PIPES · ROCK THE PUB', language: 'LANGUAGE', score: 'SCORE', combo: 'COMBO', crowd: 'CROWD', tune: 'TUNE',
  top10: 'TOP 10', top_pipers: 'TOP 10 PIPERS', play: 'PLAY', best: 'BEST',
  t1n: 'Pub Opener', t1d: 'Slow march · gentle start', t2n: 'Highland Reel', t2d: 'Brisk reel · fingers flying',
  t3n: 'Ceilidh Chaos', t3d: 'Frantic jig · hold on tight',
  perfect: 'PERFECT', good: 'GOOD', miss: 'MISS',
  res_ovation: 'STANDING OVATION!', res_done: 'SONG FINISHED', res_fail: 'BOOED OFF STAGE',
  max_combo: 'MAX COMBO', submit: 'SUBMIT SCORE', name_ph: 'YOUR NAME', saving: 'Saving…',
  saved_rank: "🏆 You're #{n} on the board!", saved: 'Saved to the board! 🏆', save_fail: 'Could not save — tap to retry.',
  again: 'PLAY AGAIN', song_select: 'SONG SELECT', board_empty: 'No scores yet — be the first! 🏆',
  board_down: 'Board unavailable right now.', paused: 'PAUSED', rank: 'RANK', notes: 'NOTES',
  howto: '<b>Tap the lanes</b> (or keys <b>D F J K</b>) as each note crosses the ring. <b>PERFECT</b> timing fills the <b>CROWD</b> meter — miss too often and you get <b>booed off stage!</b>' },
es: { tagline: 'TOCA LA GAITA · AGITA EL PUB', language: 'IDIOMA', score: 'PUNTOS', combo: 'COMBO', crowd: 'PÚBLICO', tune: 'TEMA',
  top10: 'TOP 10', top_pipers: 'LOS 10 MEJORES GAITEROS', play: 'JUGAR', best: 'RÉCORD',
  t1n: 'Apertura del Pub', t1d: 'Marcha lenta · comienzo suave', t2n: 'Reel de las Highlands', t2d: 'Reel rápido · dedos volando',
  t3n: 'Caos Ceilidh', t3d: 'Jiga frenética · agárrate fuerte',
  perfect: 'PERFECTO', good: 'BIEN', miss: 'FALLO',
  res_ovation: '¡OVACIÓN DE PIE!', res_done: 'CANCIÓN TERMINADA', res_fail: 'ABUCHEADO FUERA DEL ESCENARIO',
  max_combo: 'COMBO MÁX', submit: 'ENVIAR PUNTOS', name_ph: 'TU NOMBRE', saving: 'Guardando…',
  saved_rank: '🏆 ¡Eres el #{n} en la tabla!', saved: '¡Guardado en la tabla! 🏆', save_fail: 'No se pudo guardar — toca para reintentar.',
  again: 'JUGAR OTRA VEZ', song_select: 'ELEGIR CANCIÓN', board_empty: 'Aún no hay puntos — ¡sé el primero! 🏆',
  board_down: 'Tabla no disponible por ahora.', paused: 'PAUSA', rank: 'RANGO', notes: 'NOTAS',
  howto: '<b>Toca los carriles</b> (o las teclas <b>D F J K</b>) cuando cada nota cruce el anillo. El ritmo <b>PERFECTO</b> llena el medidor del <b>PÚBLICO</b> — ¡falla demasiado y te <b>abuchearán fuera del escenario!</b>' },
pt: { tagline: 'TOQUE A GAITA · AGITE O PUB', language: 'IDIOMA', score: 'PONTOS', combo: 'COMBO', crowd: 'PÚBLICO', tune: 'MÚSICA',
  top10: 'TOP 10', top_pipers: 'OS 10 MELHORES GAITEIROS', play: 'JOGAR', best: 'RECORDE',
  t1n: 'Abertura do Pub', t1d: 'Marcha lenta · começo suave', t2n: 'Reel das Highlands', t2d: 'Reel rápido · dedos voando',
  t3n: 'Caos Ceilidh', t3d: 'Jiga frenética · segure firme',
  perfect: 'PERFEITO', good: 'BOM', miss: 'ERROU',
  res_ovation: 'OVACIONADO DE PÉ!', res_done: 'MÚSICA TERMINADA', res_fail: 'VAIADO PARA FORA DO PALCO',
  max_combo: 'COMBO MÁX', submit: 'ENVIAR PONTOS', name_ph: 'SEU NOME', saving: 'Salvando…',
  saved_rank: '🏆 Você é o #{n} na tabela!', saved: 'Salvo na tabela! 🏆', save_fail: 'Não foi possível salvar — toque para tentar de novo.',
  again: 'JOGAR DE NOVO', song_select: 'ESCOLHER MÚSICA', board_empty: 'Ainda sem pontos — seja o primeiro! 🏆',
  board_down: 'Tabela indisponível no momento.', paused: 'PAUSA', rank: 'CLASSE', notes: 'NOTAS',
  howto: '<b>Toque nas pistas</b> (ou nas teclas <b>D F J K</b>) quando cada nota cruzar o anel. O ritmo <b>PERFEITO</b> enche o medidor do <b>PÚBLICO</b> — erre demais e será <b>vaiado para fora do palco!</b>' },
fr: { tagline: 'JOUEZ DE LA CORNEMUSE · FAITES VIBRER LE PUB', language: 'LANGUE', score: 'SCORE', combo: 'COMBO', crowd: 'PUBLIC', tune: 'AIR',
  top10: 'TOP 10', top_pipers: 'LES 10 MEILLEURS SONNEURS', play: 'JOUER', best: 'RECORD',
  t1n: 'Ouverture du Pub', t1d: 'Marche lente · début en douceur', t2n: 'Reel des Highlands', t2d: 'Reel vif · les doigts volent',
  t3n: 'Chaos Ceilidh', t3d: 'Gigue frénétique · accrochez-vous',
  perfect: 'PARFAIT', good: 'BIEN', miss: 'RATÉ',
  res_ovation: 'OVATION DEBOUT !', res_done: 'AIR TERMINÉ', res_fail: 'HUÉ HORS DE SCÈNE',
  max_combo: 'COMBO MAX', submit: 'ENVOYER LE SCORE', name_ph: 'VOTRE NOM', saving: 'Enregistrement…',
  saved_rank: '🏆 Vous êtes n°{n} au classement !', saved: 'Enregistré au classement ! 🏆', save_fail: "Échec de l'enregistrement — touchez pour réessayer.",
  again: 'REJOUER', song_select: 'CHOISIR UN AIR', board_empty: 'Aucun score — soyez le premier ! 🏆',
  board_down: 'Classement indisponible pour le moment.', paused: 'PAUSE', rank: 'RANG', notes: 'NOTES',
  howto: '<b>Touchez les couloirs</b> (ou les touches <b>D F J K</b>) quand chaque note traverse l\'anneau. Le rythme <b>PARFAIT</b> remplit la jauge du <b>PUBLIC</b> — manquez trop souvent et vous serez <b>hué hors de scène !</b>' },
de: { tagline: 'SPIEL DEN DUDELSACK · ROCK DAS PUB', language: 'SPRACHE', score: 'PUNKTE', combo: 'COMBO', crowd: 'PUBLIKUM', tune: 'STÜCK',
  top10: 'TOP 10', top_pipers: 'DIE 10 BESTEN DUDELSACKSPIELER', play: 'SPIELEN', best: 'REKORD',
  t1n: 'Pub-Eröffnung', t1d: 'Langsamer Marsch · sanfter Start', t2n: 'Highland Reel', t2d: 'Flotter Reel · Finger fliegen',
  t3n: 'Ceilidh-Chaos', t3d: 'Rasanter Jig · festhalten',
  perfect: 'PERFEKT', good: 'GUT', miss: 'DANEBEN',
  res_ovation: 'STANDING OVATIONS!', res_done: 'STÜCK BEENDET', res_fail: 'VON DER BÜHNE GEBUHT',
  max_combo: 'MAX-COMBO', submit: 'PUNKTE SENDEN', name_ph: 'DEIN NAME', saving: 'Speichern…',
  saved_rank: '🏆 Du bist Nr. {n} auf der Tafel!', saved: 'Auf der Tafel gespeichert! 🏆', save_fail: 'Speichern fehlgeschlagen — zum Wiederholen tippen.',
  again: 'NOCHMAL SPIELEN', song_select: 'STÜCK WÄHLEN', board_empty: 'Noch keine Punkte — sei der Erste! 🏆',
  board_down: 'Tafel derzeit nicht verfügbar.', paused: 'PAUSE', rank: 'RANG', notes: 'NOTEN',
  howto: '<b>Tippe auf die Spuren</b> (oder Tasten <b>D F J K</b>), wenn jede Note den Ring kreuzt. <b>PERFEKTES</b> Timing füllt die <b>PUBLIKUMS</b>-Leiste — verfehle zu oft und du wirst <b>von der Bühne gebuht!</b>' },
it: { tagline: 'SUONA LA CORNAMUSA · SCUOTI IL PUB', language: 'LINGUA', score: 'PUNTI', combo: 'COMBO', crowd: 'PUBBLICO', tune: 'BRANO',
  top10: 'TOP 10', top_pipers: 'I 10 MIGLIORI ZAMPOGNARI', play: 'GIOCA', best: 'RECORD',
  t1n: 'Apertura del Pub', t1d: 'Marcia lenta · inizio morbido', t2n: 'Reel delle Highlands', t2d: 'Reel veloce · dita che volano',
  t3n: 'Caos Ceilidh', t3d: 'Giga frenetica · tieniti forte',
  perfect: 'PERFETTO', good: 'BENE', miss: 'ERRORE',
  res_ovation: 'OVAZIONE IN PIEDI!', res_done: 'BRANO FINITO', res_fail: 'FISCHIATO FUORI DAL PALCO',
  max_combo: 'COMBO MAX', submit: 'INVIA PUNTI', name_ph: 'IL TUO NOME', saving: 'Salvataggio…',
  saved_rank: '🏆 Sei il n. {n} in classifica!', saved: 'Salvato in classifica! 🏆', save_fail: 'Salvataggio fallito — tocca per riprovare.',
  again: 'GIOCA ANCORA', song_select: 'SCEGLI BRANO', board_empty: 'Nessun punto ancora — sii il primo! 🏆',
  board_down: 'Classifica non disponibile ora.', paused: 'PAUSA', rank: 'VOTO', notes: 'NOTE',
  howto: '<b>Tocca le corsie</b> (o i tasti <b>D F J K</b>) quando ogni nota attraversa l\'anello. Il ritmo <b>PERFETTO</b> riempie il misuratore del <b>PUBBLICO</b> — sbaglia troppo e verrai <b>fischiato fuori dal palco!</b>' },
nl: { tagline: 'SPEEL DE DOEDELZAK · ROCK DE PUB', language: 'TAAL', score: 'SCORE', combo: 'COMBO', crowd: 'PUBLIEK', tune: 'NUMMER',
  top10: 'TOP 10', top_pipers: 'DE 10 BESTE PIJPERS', play: 'SPELEN', best: 'RECORD',
  t1n: 'Pub-opener', t1d: 'Langzame mars · zachte start', t2n: 'Highland Reel', t2d: 'Vlotte reel · vingers vliegen',
  t3n: 'Ceilidh-chaos', t3d: 'Razende jig · hou je vast',
  perfect: 'PERFECT', good: 'GOED', miss: 'MIS',
  res_ovation: 'STAANDE OVATIE!', res_done: 'NUMMER KLAAR', res_fail: 'VAN HET PODIUM GEJOELD',
  max_combo: 'MAX-COMBO', submit: 'SCORE VERSTUREN', name_ph: 'JE NAAM', saving: 'Opslaan…',
  saved_rank: '🏆 Je bent #{n} op het bord!', saved: 'Opgeslagen op het bord! 🏆', save_fail: 'Opslaan mislukt — tik om opnieuw te proberen.',
  again: 'OPNIEUW SPELEN', song_select: 'NUMMER KIEZEN', board_empty: 'Nog geen scores — wees de eerste! 🏆',
  board_down: 'Bord nu niet beschikbaar.', paused: 'PAUZE', rank: 'RANG', notes: 'NOTEN',
  howto: '<b>Tik op de banen</b> (of toetsen <b>D F J K</b>) als elke noot de ring kruist. <b>PERFECTE</b> timing vult de <b>PUBLIEK</b>-meter — mis te vaak en je wordt <b>van het podium gejoeld!</b>' },
ru: { tagline: 'ИГРАЙ НА ВОЛЫНКЕ · ЗАЖГИ ПАБ', language: 'ЯЗЫК', score: 'ОЧКИ', combo: 'КОМБО', crowd: 'ПУБЛИКА', tune: 'МЕЛОДИЯ',
  top10: 'ТОП 10', top_pipers: '10 ЛУЧШИХ ВОЛЫНЩИКОВ', play: 'ИГРАТЬ', best: 'РЕКОРД',
  t1n: 'Открытие паба', t1d: 'Медленный марш · мягкий старт', t2n: 'Хайленд-рил', t2d: 'Бодрый рил · пальцы летают',
  t3n: 'Хаос кейли', t3d: 'Бешеная джига · держись крепче',
  perfect: 'ИДЕАЛЬНО', good: 'ХОРОШО', miss: 'МИМО',
  res_ovation: 'ОВАЦИИ СТОЯ!', res_done: 'МЕЛОДИЯ СЫГРАНА', res_fail: 'ОСВИСТАЛИ СО СЦЕНЫ',
  max_combo: 'МАКС. КОМБО', submit: 'ОТПРАВИТЬ ОЧКИ', name_ph: 'ВАШЕ ИМЯ', saving: 'Сохранение…',
  saved_rank: '🏆 Вы №{n} на доске!', saved: 'Сохранено на доске! 🏆', save_fail: 'Не удалось сохранить — нажмите, чтобы повторить.',
  again: 'ИГРАТЬ ЕЩЁ', song_select: 'ВЫБОР МЕЛОДИИ', board_empty: 'Очков пока нет — будьте первым! 🏆',
  board_down: 'Доска сейчас недоступна.', paused: 'ПАУЗА', rank: 'РАНГ', notes: 'НОТЫ',
  howto: '<b>Касайтесь дорожек</b> (или клавиш <b>D F J K</b>), когда каждая нота пересекает кольцо. <b>ИДЕАЛЬНЫЙ</b> ритм наполняет шкалу <b>ПУБЛИКИ</b> — ошибайтесь слишком часто, и вас <b>освищут со сцены!</b>' },
uk: { tagline: 'ГРАЙ НА ВОЛИНЦІ · ЗАПАЛИ ПАБ', language: 'МОВА', score: 'ОЧКИ', combo: 'КОМБО', crowd: 'ПУБЛІКА', tune: 'МЕЛОДІЯ',
  top10: 'ТОП 10', top_pipers: '10 НАЙКРАЩИХ ВОЛИНЩИКІВ', play: 'ГРАТИ', best: 'РЕКОРД',
  t1n: 'Відкриття пабу', t1d: 'Повільний марш · м’який старт', t2n: 'Хайленд-ріл', t2d: 'Жвавий ріл · пальці літають',
  t3n: 'Хаос кейлі', t3d: 'Шалена джига · тримайся міцно',
  perfect: 'ІДЕАЛЬНО', good: 'ДОБРЕ', miss: 'МИМО',
  res_ovation: 'ОВАЦІЇ СТОЯЧИ!', res_done: 'МЕЛОДІЮ ЗІГРАНО', res_fail: 'ОСВИСТАЛИ ЗІ СЦЕНИ',
  max_combo: 'МАКС. КОМБО', submit: 'НАДІСЛАТИ ОЧКИ', name_ph: 'ВАШЕ ІМ’Я', saving: 'Збереження…',
  saved_rank: '🏆 Ви №{n} на дошці!', saved: 'Збережено на дошці! 🏆', save_fail: 'Не вдалося зберегти — торкніться, щоб повторити.',
  again: 'ГРАТИ ЩЕ', song_select: 'ВИБІР МЕЛОДІЇ', board_empty: 'Очок ще немає — будьте першим! 🏆',
  board_down: 'Дошка зараз недоступна.', paused: 'ПАУЗА', rank: 'РАНГ', notes: 'НОТИ',
  howto: '<b>Торкайтеся доріжок</b> (або клавіш <b>D F J K</b>), коли кожна нота перетинає кільце. <b>ІДЕАЛЬНИЙ</b> ритм наповнює шкалу <b>ПУБЛІКИ</b> — помиляйтеся надто часто, і вас <b>освищуть зі сцени!</b>' },
tr: { tagline: 'GAYDAYI ÇAL · PUB’I SALLA', language: 'DİL', score: 'PUAN', combo: 'KOMBO', crowd: 'SEYİRCİ', tune: 'PARÇA',
  top10: 'İLK 10', top_pipers: 'EN İYİ 10 GAYDACI', play: 'OYNA', best: 'REKOR',
  t1n: 'Pub Açılışı', t1d: 'Yavaş marş · yumuşak başlangıç', t2n: 'Highland Reel', t2d: 'Hızlı reel · parmaklar uçuyor',
  t3n: 'Ceilidh Kaosu', t3d: 'Çılgın jig · sıkı tutun',
  perfect: 'MÜKEMMEL', good: 'İYİ', miss: 'ISKA',
  res_ovation: 'AYAKTA ALKIŞ!', res_done: 'PARÇA BİTTİ', res_fail: 'SAHNEDEN YUHALANDIN',
  max_combo: 'MAKS KOMBO', submit: 'PUANI GÖNDER', name_ph: 'ADIN', saving: 'Kaydediliyor…',
  saved_rank: '🏆 Tabloda {n}. sıradasın!', saved: 'Tabloya kaydedildi! 🏆', save_fail: 'Kaydedilemedi — tekrar denemek için dokun.',
  again: 'TEKRAR OYNA', song_select: 'PARÇA SEÇ', board_empty: 'Henüz puan yok — ilk sen ol! 🏆',
  board_down: 'Tablo şu an kullanılamıyor.', paused: 'DURAKLATILDI', rank: 'DERECE', notes: 'NOTALAR',
  howto: '<b>Şeritlere dokun</b> (veya <b>D F J K</b> tuşları), her nota halkayı geçerken. <b>MÜKEMMEL</b> zamanlama <b>SEYİRCİ</b> ölçeri doldurur — çok ıskalarsan <b>sahneden yuhalanırsın!</b>' },
ar: { tagline: 'اعزف على مزمار القربة · أشعل الحانة', language: 'اللغة', score: 'النقاط', combo: 'التتابع', crowd: 'الجمهور', tune: 'اللحن',
  top10: 'أفضل 10', top_pipers: 'أفضل 10 عازفي قربة', play: 'العب', best: 'الأفضل',
  t1n: 'افتتاح الحانة', t1d: 'مسيرة بطيئة · بداية هادئة', t2n: 'رقصة المرتفعات', t2d: 'رقصة سريعة · الأصابع تطير',
  t3n: 'فوضى الكيلي', t3d: 'جيغ صاخب · تمسّك جيدًا',
  perfect: 'مثالي', good: 'جيد', miss: 'أخطأت',
  res_ovation: 'تصفيق واقفًا!', res_done: 'انتهى اللحن', res_fail: 'طُردت بصيحات الاستهجان',
  max_combo: 'أقصى تتابع', submit: 'إرسال النقاط', name_ph: 'اسمك', saving: 'جارٍ الحفظ…',
  saved_rank: '🏆 أنت رقم {n} على اللوحة!', saved: 'تم الحفظ على اللوحة! 🏆', save_fail: 'تعذّر الحفظ — انقر للمحاولة مجددًا.',
  again: 'العب مجددًا', song_select: 'اختيار اللحن', board_empty: 'لا نقاط بعد — كن الأول! 🏆',
  board_down: 'اللوحة غير متاحة الآن.', paused: 'إيقاف مؤقت', rank: 'الرتبة', notes: 'النغمات',
  howto: '<b>المس المسارات</b> (أو مفاتيح <b>D F J K</b>) عندما تعبر كل نغمة الحلقة. التوقيت <b>المثالي</b> يملأ مقياس <b>الجمهور</b> — أخطئ كثيرًا وستُطرد من المسرح <b>بصيحات الاستهجان!</b>' },
hi: { tagline: 'बैगपाइप बजाओ · पब को झुमाओ', language: 'भाषा', score: 'स्कोर', combo: 'कॉम्बो', crowd: 'भीड़', tune: 'धुन',
  top10: 'टॉप 10', top_pipers: 'टॉप 10 पाइपर्स', play: 'खेलो', best: 'सर्वश्रेष्ठ',
  t1n: 'पब ओपनर', t1d: 'धीमी मार्च · नरम शुरुआत', t2n: 'हाईलैंड रील', t2d: 'तेज़ रील · उंगलियाँ उड़ती हुई',
  t3n: 'केइली कैओस', t3d: 'पागल जिग · कसकर पकड़ो',
  perfect: 'परफेक्ट', good: 'अच्छा', miss: 'चूक',
  res_ovation: 'खड़े होकर तालियाँ!', res_done: 'धुन खत्म', res_fail: 'मंच से हूट करके भगाया',
  max_combo: 'मैक्स कॉम्बो', submit: 'स्कोर भेजें', name_ph: 'आपका नाम', saving: 'सेव हो रहा है…',
  saved_rank: '🏆 आप बोर्ड पर #{n} हैं!', saved: 'बोर्ड पर सेव हो गया! 🏆', save_fail: 'सेव नहीं हुआ — फिर कोशिश के लिए टैप करें।',
  again: 'फिर से खेलो', song_select: 'धुन चुनें', board_empty: 'अभी कोई स्कोर नहीं — पहले बनो! 🏆',
  board_down: 'बोर्ड अभी उपलब्ध नहीं है।', paused: 'रोका गया', rank: 'रैंक', notes: 'नोट्स',
  howto: '<b>लेन पर टैप करें</b> (या <b>D F J K</b> कुंजियाँ) जब हर नोट रिंग को पार करे। <b>परफेक्ट</b> टाइमिंग <b>भीड़</b> मीटर भरती है — ज़्यादा चूके तो <b>मंच से हूट करके भगा दिए जाओगे!</b>' },
id: { tagline: 'MAINKAN BAGPIPE · GOYANGKAN PUB', language: 'BAHASA', score: 'SKOR', combo: 'KOMBO', crowd: 'PENONTON', tune: 'LAGU',
  top10: '10 TERATAS', top_pipers: '10 PENIUP TERBAIK', play: 'MAIN', best: 'TERBAIK',
  t1n: 'Pembuka Pub', t1d: 'Mars lambat · awal lembut', t2n: 'Reel Dataran Tinggi', t2d: 'Reel gesit · jari terbang',
  t3n: 'Kekacauan Ceilidh', t3d: 'Jig panik · pegang erat',
  perfect: 'SEMPURNA', good: 'BAGUS', miss: 'MELESET',
  res_ovation: 'TEPUK TANGAN BERDIRI!', res_done: 'LAGU SELESAI', res_fail: 'DISORAKI TURUN PANGGUNG',
  max_combo: 'KOMBO MAKS', submit: 'KIRIM SKOR', name_ph: 'NAMAMU', saving: 'Menyimpan…',
  saved_rank: '🏆 Kamu #{n} di papan!', saved: 'Tersimpan di papan! 🏆', save_fail: 'Gagal menyimpan — ketuk untuk coba lagi.',
  again: 'MAIN LAGI', song_select: 'PILIH LAGU', board_empty: 'Belum ada skor — jadilah yang pertama! 🏆',
  board_down: 'Papan tidak tersedia saat ini.', paused: 'JEDA', rank: 'PERINGKAT', notes: 'NOT',
  howto: '<b>Ketuk jalur</b> (atau tombol <b>D F J K</b>) saat setiap not melintasi cincin. Waktu <b>SEMPURNA</b> mengisi meteran <b>PENONTON</b> — terlalu sering meleset dan kamu akan <b>disoraki turun panggung!</b>' },
vi: { tagline: 'THỔI KÈN TÚI · KHUẤY ĐỘNG QUÁN', language: 'NGÔN NGỮ', score: 'ĐIỂM', combo: 'COMBO', crowd: 'KHÁN GIẢ', tune: 'ĐIỆU',
  top10: 'TOP 10', top_pipers: '10 NGƯỜI THỔI HAY NHẤT', play: 'CHƠI', best: 'KỶ LỤC',
  t1n: 'Khai Mạc Quán', t1d: 'Hành khúc chậm · khởi đầu nhẹ', t2n: 'Điệu Reel Cao Nguyên', t2d: 'Reel lanh lẹ · ngón tay bay',
  t3n: 'Hỗn Loạn Ceilidh', t3d: 'Jig cuồng nhiệt · bám chặt nhé',
  perfect: 'HOÀN HẢO', good: 'TỐT', miss: 'TRƯỢT',
  res_ovation: 'ĐỨNG DẬY VỖ TAY!', res_done: 'HẾT ĐIỆU', res_fail: 'BỊ LA Ó ĐUỔI KHỎI SÂN KHẤU',
  max_combo: 'COMBO TỐI ĐA', submit: 'GỬI ĐIỂM', name_ph: 'TÊN CỦA BẠN', saving: 'Đang lưu…',
  saved_rank: '🏆 Bạn đứng #{n} trên bảng!', saved: 'Đã lưu lên bảng! 🏆', save_fail: 'Không lưu được — chạm để thử lại.',
  again: 'CHƠI LẠI', song_select: 'CHỌN ĐIỆU', board_empty: 'Chưa có điểm — hãy là người đầu tiên! 🏆',
  board_down: 'Bảng hiện không khả dụng.', paused: 'TẠM DỪNG', rank: 'HẠNG', notes: 'NỐT',
  howto: '<b>Chạm vào làn</b> (hoặc phím <b>D F J K</b>) khi mỗi nốt đi qua vòng. Nhịp <b>HOÀN HẢO</b> làm đầy thước <b>KHÁN GIẢ</b> — trượt quá nhiều và bạn sẽ bị <b>la ó đuổi khỏi sân khấu!</b>' },
th: { tagline: 'เป่าปี่สกอต · เขย่าผับ', language: 'ภาษา', score: 'คะแนน', combo: 'คอมโบ', crowd: 'ผู้ชม', tune: 'ทำนอง',
  top10: '10 อันดับแรก', top_pipers: 'นักเป่า 10 อันดับแรก', play: 'เล่น', best: 'ดีที่สุด',
  t1n: 'เพลงเปิดผับ', t1d: 'มาร์ชช้า · เริ่มแบบนุ่มนวล', t2n: 'รีลไฮแลนด์', t2d: 'รีลคล่องแคล่ว · นิ้วบิน',
  t3n: 'ความโกลาหล Ceilidh', t3d: 'จิ๊กสุดมันส์ · เกาะไว้ให้แน่น',
  perfect: 'สมบูรณ์แบบ', good: 'ดี', miss: 'พลาด',
  res_ovation: 'ยืนปรบมือให้!', res_done: 'จบทำนอง', res_fail: 'โดนโห่ไล่ลงเวที',
  max_combo: 'คอมโบสูงสุด', submit: 'ส่งคะแนน', name_ph: 'ชื่อของคุณ', saving: 'กำลังบันทึก…',
  saved_rank: '🏆 คุณอยู่อันดับ #{n} บนกระดาน!', saved: 'บันทึกลงกระดานแล้ว! 🏆', save_fail: 'บันทึกไม่สำเร็จ — แตะเพื่อลองอีกครั้ง',
  again: 'เล่นอีกครั้ง', song_select: 'เลือกทำนอง', board_empty: 'ยังไม่มีคะแนน — มาเป็นคนแรก! 🏆',
  board_down: 'กระดานไม่พร้อมใช้งานตอนนี้', paused: 'หยุดชั่วคราว', rank: 'อันดับ', notes: 'โน้ต',
  howto: '<b>แตะเลน</b> (หรือปุ่ม <b>D F J K</b>) เมื่อโน้ตแต่ละตัวข้ามวงแหวน จังหวะ<b>สมบูรณ์แบบ</b>จะเติมเกจ<b>ผู้ชม</b> — พลาดบ่อยเกินไปและคุณจะโดน<b>โห่ไล่ลงเวที!</b>' },
ko: { tagline: '백파이프를 불어라 · 펍을 흔들어라', language: '언어', score: '점수', combo: '콤보', crowd: '관객', tune: '곡',
  top10: 'TOP 10', top_pipers: '최고의 파이퍼 10인', play: '플레이', best: '최고 기록',
  t1n: '펍 오프너', t1d: '느린 행진곡 · 부드러운 시작', t2n: '하이랜드 릴', t2d: '경쾌한 릴 · 손가락이 날아다녀',
  t3n: '케일리 카오스', t3d: '광란의 지그 · 꽉 잡아',
  perfect: '퍼펙트', good: '좋음', miss: '미스',
  res_ovation: '기립 박수!', res_done: '곡 종료', res_fail: '야유를 받으며 퇴장',
  max_combo: '최대 콤보', submit: '점수 제출', name_ph: '이름', saving: '저장 중…',
  saved_rank: '🏆 보드에서 {n}위입니다!', saved: '보드에 저장됐어요! 🏆', save_fail: '저장 실패 — 다시 시도하려면 탭하세요.',
  again: '다시 플레이', song_select: '곡 선택', board_empty: '아직 점수가 없어요 — 첫 주인공이 되세요! 🏆',
  board_down: '지금은 보드를 쓸 수 없어요.', paused: '일시정지', rank: '등급', notes: '노트',
  howto: '<b>레인을 탭</b>하세요 (또는 <b>D F J K</b> 키). 각 노트가 링을 지날 때 맞추면 됩니다. <b>퍼펙트</b> 타이밍은 <b>관객</b> 게이지를 채우고 — 너무 많이 놓치면 <b>야유를 받으며 쫓겨나요!</b>' },
ja: { tagline: 'バグパイプを吹け · パブを揺らせ', language: '言語', score: 'スコア', combo: 'コンボ', crowd: '観客', tune: '曲',
  top10: 'トップ10', top_pipers: 'トップ10パイパー', play: 'プレイ', best: 'ベスト',
  t1n: 'パブ・オープナー', t1d: 'ゆったり行進曲 · やさしい幕開け', t2n: 'ハイランド・リール', t2d: '軽快なリール · 指が舞う',
  t3n: 'ケーリー・カオス', t3d: '猛烈なジグ · しっかりつかまって',
  perfect: 'パーフェクト', good: 'グッド', miss: 'ミス',
  res_ovation: 'スタンディングオベーション！', res_done: '曲終了', res_fail: 'ブーイングで退場',
  max_combo: '最大コンボ', submit: 'スコアを送信', name_ph: '名前', saving: '保存中…',
  saved_rank: '🏆 ボードで{n}位！', saved: 'ボードに保存しました！🏆', save_fail: '保存できませんでした — タップして再試行。',
  again: 'もう一度プレイ', song_select: '曲を選ぶ', board_empty: 'まだスコアがありません — 一番乗りしよう！🏆',
  board_down: '現在ボードは利用できません。', paused: '一時停止', rank: 'ランク', notes: 'ノーツ',
  howto: '<b>レーンをタップ</b>（または <b>D F J K</b> キー）して、各ノーツがリングを横切る瞬間に合わせよう。<b>パーフェクト</b>なタイミングで<b>観客</b>メーターが満ちる — 外しすぎると<b>ブーイングで退場</b>だ！' },
zh: { tagline: '吹起风笛 · 摇滚酒馆', language: '语言', score: '分数', combo: '连击', crowd: '观众', tune: '曲目',
  top10: '前十名', top_pipers: '十大风笛手', play: '开始', best: '最佳',
  t1n: '酒馆开场曲', t1d: '慢板进行曲 · 温和开场', t2n: '高地里尔舞曲', t2d: '轻快的里尔 · 手指翻飞',
  t3n: '凯利大混战', t3d: '狂热的吉格 · 抓紧了',
  perfect: '完美', good: '良好', miss: '错过',
  res_ovation: '全场起立鼓掌！', res_done: '曲目结束', res_fail: '被嘘下台',
  max_combo: '最高连击', submit: '提交分数', name_ph: '你的名字', saving: '保存中…',
  saved_rank: '🏆 你在榜上排第{n}名！', saved: '已保存到排行榜！🏆', save_fail: '保存失败 — 点按重试。',
  again: '再来一局', song_select: '选择曲目', board_empty: '暂无分数 — 来做第一名！🏆',
  board_down: '排行榜暂时不可用。', paused: '已暂停', rank: '评级', notes: '音符',
  howto: '<b>点按轨道</b>（或按 <b>D F J K</b> 键），在每个音符穿过圆环时击中它。<b>完美</b>时机能填满<b>观众</b>计量条 — 错得太多，你会被<b>嘘下台！</b>' },
};
let LANG_CUR = (() => { try { const s = localStorage.getItem('pipeHeroLang'); if (s && I18N[s]) return s; } catch (e) {}
  const n = (navigator.language || 'en').slice(0, 2); return I18N[n] ? n : 'en'; })();
function T(k, v) {
  let s = (I18N[LANG_CUR] && I18N[LANG_CUR][k]) || I18N.en[k] || k;
  if (v) for (const key in v) s = s.replace('{' + key + '}', v[key]);
  return s;
}
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
  $('playBtn').firstChild.textContent = '▶ ' + T('play') + ' ';
  $('nameInput').placeholder = T('name_ph');
  $('submitBtn').textContent = T('submit');
  $('howto').innerHTML = T('howto');
  buildTunes();
}
function setLang(code) {
  if (!I18N[code]) return;
  LANG_CUR = code;
  try { localStorage.setItem('pipeHeroLang', code); } catch (e) {}
  $('langSel').value = code;
  applyLang();
}

/* ================= tunes & charts (original, seeded, deterministic) ================= */
const FREQS = [196.00, 220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00]; // chanter G3..A4
const LANE_OF_PITCH = [0, 0, 0, 1, 1, 2, 2, 3, 3];
const TUNES = [
  { nameKey: 't1n', descKey: 't1d', bpm: 96,  bars: 18, seed: 1123, onP: 0.55, offP: 0.16, doubles: 0 },
  { nameKey: 't2n', descKey: 't2d', bpm: 138, bars: 22, seed: 7741, onP: 0.80, offP: 0.48, doubles: 0 },
  { nameKey: 't3n', descKey: 't3d', bpm: 164, bars: 26, seed: 9021, onP: 0.88, offP: 0.62, doubles: 0.10 },
];
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CHART_START = 2.0; // seconds of drone+beat lead-in before the first note
const chartCache = {};
function chartFor(idx) {
  if (chartCache[idx]) return chartCache[idx];
  const tune = TUNES[idx];
  const rng = mulberry32(tune.seed);
  const spb = 60 / tune.bpm, eighth = spb / 2;
  const notes = [];
  const lastLaneT = [-9, -9, -9, -9];
  let pitch = 4, phrase = 0;
  const totalSlots = tune.bars * 8;
  // each 2-bar phrase gets a home register (2..6); the walk leans toward
  // it so melodies roam the whole chanter instead of camping low
  const homes = [];
  for (let i = 0; i < Math.ceil(totalSlots / 16); i++) homes.push(2 + Math.floor(rng() * 6)); // 2..7
  const CADENCE = [4, 1, 6, 4, 7, 4];
  const place = (t, p) => {
    const lane = LANE_OF_PITCH[p];
    if (t - lastLaneT[lane] < 0.17) return false;
    lastLaneT[lane] = t;
    notes.push({ t, lane, pitch: p, freq: FREQS[p], state: 0 });
    return true;
  };
  for (let s = 2; s < totalSlots; s++) {
    const on = s % 2 === 0;
    if (rng() >= (on ? tune.onP : tune.offP)) continue;
    // melodic walk: mostly steps, some repeats, occasional leap; phrases cadence home
    const r = rng();
    let step = 0;
    if (r < 0.34) step = rng() < 0.5 ? -1 : 1;
    else if (r < 0.56) step = rng() < 0.5 ? -2 : 2;
    else if (r < 0.70) step = 0;
    else if (r < 0.88) step = rng() < 0.5 ? -1 : 1;
    else step = (rng() < 0.5 ? -1 : 1) * (3 + Math.floor(rng() * 2));
    pitch = Math.max(0, Math.min(8, pitch + step));
    const home = homes[Math.floor(s / 16)] ?? 4;
    if (pitch < home - 1 && rng() < 0.5) pitch += 1;
    else if (pitch > home + 1 && rng() < 0.5) pitch -= 1;
    if (s % 16 === 14) { pitch = CADENCE[phrase++ % CADENCE.length]; } // cadence
    const t = CHART_START + s * eighth;
    if (place(t, pitch) && tune.doubles && rng() < tune.doubles) {
      place(t + spb / 4, pitch); // grace-note double, same lane
    }
  }
  notes.sort((a, b) => a.t - b.t);
  const out = { notes, dur: CHART_START + tune.bars * 4 * spb + 1.5, spb };
  chartCache[idx] = out;
  return out;
}

/* ================= audio (all synthesized, all original) ================= */
let AC = null, master = null, drone = null, chanterVoice = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('pipeHeroMute') === '1'; } catch (e) {}
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended' && !(S && S.paused)) AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    master = AC.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { /* no audio — game still plays */ }
}
function droneStart() {
  if (!AC || drone) return;
  const g = AC.createGain(); g.gain.value = 0;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 430;
  const mk = (type, freq, vol) => {
    const o = AC.createOscillator(); o.type = type; o.frequency.value = freq;
    const og = AC.createGain(); og.gain.value = vol;
    o.connect(og); og.connect(f); o.start(); return o;
  };
  const oscs = [mk('sawtooth', 98, 0.055), mk('sawtooth', 196, 0.038), mk('square', 147, 0.016)];
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.4;
  const lfoG = AC.createGain(); lfoG.gain.value = 0.012;
  lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
  f.connect(g); g.connect(master);
  g.gain.linearRampToValueAtTime(0.85, AC.currentTime + 0.8);
  drone = { g, oscs: [...oscs, lfo] };
}
function droneStop() {
  if (!AC || !drone) return;
  const dr = drone; drone = null;
  dr.g.gain.cancelScheduledValues(AC.currentTime);
  dr.g.gain.setValueAtTime(dr.g.gain.value, AC.currentTime);
  dr.g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.45);
  setTimeout(() => dr.oscs.forEach(o => { try { o.stop(); } catch (e) {} }), 600);
}
function chanter(freq, wobble) {
  if (!AC) return;
  const now = AC.currentTime;
  if (chanterVoice) { // the chanter is monophonic — cut the previous note like a real pipe
    try {
      chanterVoice.g.gain.cancelScheduledValues(now);
      chanterVoice.g.gain.setValueAtTime(chanterVoice.g.gain.value, now);
      chanterVoice.g.gain.linearRampToValueAtTime(0, now + 0.03);
      const v = chanterVoice; setTimeout(() => v.oscs.forEach(o => { try { o.stop(); } catch (e) {} }), 80);
    } catch (e) {}
    chanterVoice = null;
  }
  const g = AC.createGain(); g.gain.value = 0;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 0.8;
  const o1 = AC.createOscillator(); o1.type = 'sawtooth';
  const o2 = AC.createOscillator(); o2.type = 'square';
  const g2 = AC.createGain(); g2.gain.value = 0.35;
  const startF = wobble ? freq * 0.93 : freq;
  o1.frequency.setValueAtTime(startF, now); o2.frequency.setValueAtTime(startF, now);
  if (wobble) { o1.frequency.exponentialRampToValueAtTime(freq, now + 0.09); o2.frequency.exponentialRampToValueAtTime(freq, now + 0.09); }
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master);
  g.gain.linearRampToValueAtTime(0.13, now + 0.012);
  g.gain.setValueAtTime(0.13, now + 0.26);
  g.gain.linearRampToValueAtTime(0.0, now + 0.34);
  o1.start(now); o2.start(now); o1.stop(now + 0.4); o2.stop(now + 0.4);
  chanterVoice = { g, oscs: [o1, o2] };
}
function squeak() {
  if (!AC) return;
  const now = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(620, now);
  o.frequency.exponentialRampToValueAtTime(1750, now + 0.07);
  o.frequency.exponentialRampToValueAtTime(240, now + 0.24);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.11, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
  o.connect(f); f.connect(g); g.connect(master);
  o.start(now); o.stop(now + 0.3);
}
function tapClick() {
  if (!AC) return;
  const now = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = 170;
  const g = AC.createGain();
  g.gain.setValueAtTime(0.045, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.05);
}
function beatSound(when, accent) {
  if (!AC) return;
  if (accent) { // bodhrán thump
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(135, when);
    o.frequency.exponentialRampToValueAtTime(68, when + 0.11);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.22, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.15);
  } else { // rim tick
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 2;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.05, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(when, Math.random() * 0.4, 0.05);
  }
}
function cheer() {
  if (!AC) return;
  const now = AC.currentTime;
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(500, now);
  f.frequency.linearRampToValueAtTime(1500, now + 0.5);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.16, now + 0.25);
  g.gain.setValueAtTime(0.16, now + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(now); src.stop(now + 1.6);
}
function boo() {
  if (!AC) return;
  const now = AC.currentTime;
  [196, 174.6, 146.8].forEach((fq, i) => {
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = AC.createGain();
    const t0 = now + i * 0.24;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.3);
  });
}
/* percussion scheduler: runs on an interval, schedules beats ahead of the song clock */
setInterval(() => {
  if (!AC || !S || S.screen !== 'play' || S.paused) return;
  const ahead = songPos() + 0.3;
  while (S.nextBeat * S.spb < ahead) {
    const bt = S.nextBeat * S.spb;
    const when = S.startCtx + bt - S.timeShift;
    if (when >= AC.currentTime - 0.03) beatSound(when, S.nextBeat % 2 === 0);
    S.nextBeat++;
  }
}, 90);

/* ================= game state ================= */
const PERFECT_WIN = 0.070, GOOD_WIN = 0.145, APPROACH = 1.55;
const LANE_COLORS = ['#d84a55', '#f0a832', '#4fae5c', '#5d8fe0'];
const S = {
  screen: 'menu', selTune: 0, tuneIdx: 0, chart: [], dur: 0, spb: 0.5,
  startCtx: 0, timeShift: 0, nextBeat: 0, lastBeat: -1, firstPending: 0,
  paused: false, failed: false, score: 0, combo: 0, maxCombo: 0, maxMult: 1, crowd: 55,
  nPerfect: 0, nGood: 0, nMiss: 0, finalSeconds: 0,
  judge: null, squeeze: 0, wince: 0, beatPulse: 0,
  laneFlash: [0, 0, 0, 0], particles: [], qaAuto: false,
};
function songPos() { return AC ? AC.currentTime - S.startCtx + S.timeShift : 0; }
function mult() { return Math.min(8, 1 + Math.floor(S.combo / 10)); }

function showScreen(name) {
  S.screen = name;
  $('menu').style.display = name === 'menu' ? 'flex' : 'none';
  $('results').style.display = name === 'results' ? 'flex' : 'none';
  $('hud').style.display = name === 'play' ? 'block' : 'none';
  $('qaState').textContent = JSON.stringify({ screen: name, errors: window.__errs });
}
function startSong(idx) {
  ensureAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  const ch = chartFor(idx);
  S.tuneIdx = idx;
  S.chart = ch.notes.map(n => ({ ...n, state: 0 }));
  S.dur = ch.dur; S.spb = ch.spb;
  S.score = 0; S.combo = 0; S.maxCombo = 0; S.maxMult = 1; S.crowd = 55;
  S.nPerfect = 0; S.nGood = 0; S.nMiss = 0; S.failed = false; S.paused = false;
  S.firstPending = 0; S.nextBeat = 0; S.lastBeat = -1; S.timeShift = 0;
  S.judge = null; S.particles = [];
  S.startCtx = AC ? AC.currentTime + 0.10 : 0;
  $('songLab').textContent = T(TUNES[idx].nameKey);
  $('tuneVal').textContent = (idx + 1) + '/3';
  droneStop(); droneStart();
  runSubmitted = false; lbBusy = false;
  showScreen('play');
}
function endSong(failed) {
  S.failed = failed;
  S.finalSeconds = Math.max(1, Math.round(songPos()));
  droneStop();
  if (chanterVoice) { try { chanterVoice.g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.05); } catch (e) {} chanterVoice = null; }
  if (failed) boo(); else cheer();
  const judged = S.nPerfect + S.nGood + S.nMiss;
  const acc = judged ? (S.nPerfect + 0.45 * S.nGood) / judged : 0;
  const rank = failed ? '✗' : acc >= 0.93 ? 'S' : acc >= 0.84 ? 'A' : acc >= 0.68 ? 'B' : 'C';
  $('resTitle').textContent = failed ? T('res_fail') : (rank === 'S' || rank === 'A') ? T('res_ovation') : T('res_done');
  const rb = $('rankBig');
  rb.textContent = rank;
  rb.style.color = failed ? '#ff6b76' : rank === 'S' ? '#ffd94d' : rank === 'A' ? '#a8d95e' : '#f5e9d0';
  $('resStats').innerHTML =
    T('tune') + ': <b>' + T(TUNES[S.tuneIdx].nameKey) + '</b><br>' +
    T('score') + ': <b>' + S.score.toLocaleString() + '</b><br>' +
    T('max_combo') + ': <b>×' + S.maxMult + ' (' + S.maxCombo + ')</b><br>' +
    '<span style="color:#ffd94d">' + T('perfect') + ' <b>' + S.nPerfect + '</b></span> · ' +
    '<span style="color:#cfe8ff">' + T('good') + ' <b>' + S.nGood + '</b></span> · ' +
    '<span style="color:#ff9aa4">' + T('miss') + ' <b>' + S.nMiss + '</b></span><br>' +
    T('rank') + ': <b>' + rank + '</b> · ' + Math.round(acc * 100) + '%';
  const bk = 'pipeHeroBest' + S.tuneIdx;
  try {
    const prev = +(localStorage.getItem(bk) || 0);
    if (S.score > prev) localStorage.setItem(bk, S.score);
  } catch (e) {}
  $('nameInput').value = lbStoredName();
  $('submitBtn').disabled = false;
  $('submitStatus').textContent = '';
  buildTunes();
  lbLoad($('overBoardList'), lbStoredName());
  showScreen('results');
}
function judgePopup(txt, color) { S.judge = { txt, color, at: performance.now() }; }
function hitLane(lane) {
  if (S.screen !== 'play' || S.paused) return;
  const now = songPos();
  let best = null, bestDt = 1e9;
  for (let i = S.firstPending; i < S.chart.length; i++) {
    const n = S.chart[i];
    if (n.t > now + GOOD_WIN) break;
    if (n.state !== 0 || n.lane !== lane) continue;
    const dt = Math.abs(now - n.t);
    if (dt < bestDt) { bestDt = dt; best = n; }
  }
  S.laneFlash[lane] = 1;
  if (!best) { tapClick(); return; }
  best.state = 1;
  const m = mult();
  S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.maxMult = Math.max(S.maxMult, m);
  S.squeeze = 1;
  if (bestDt <= PERFECT_WIN) {
    S.nPerfect++;
    S.score += 100 * m;
    S.crowd = Math.min(100, S.crowd + 2.2);
    chanter(best.freq, false);
    judgePopup(T('perfect'), '#ffd94d');
    spawnBurst(best.lane, true);
  } else {
    S.nGood++;
    S.score += 40 * m;
    S.crowd = Math.min(100, S.crowd + 1.1);
    chanter(best.freq, true);
    judgePopup(T('good'), '#cfe8ff');
    spawnBurst(best.lane, false);
  }
  advancePending();
}
function advancePending() {
  while (S.firstPending < S.chart.length && S.chart[S.firstPending].state !== 0) S.firstPending++;
}
function missCheck() {
  const now = songPos();
  for (let i = S.firstPending; i < S.chart.length; i++) {
    const n = S.chart[i];
    if (n.t >= now - GOOD_WIN) break;
    if (n.state !== 0) continue;
    n.state = 2;
    S.nMiss++; S.combo = 0;
    S.crowd = Math.max(0, S.crowd - 7);
    S.wince = 1;
    squeak();
    judgePopup(T('miss'), '#ff6b76');
    if (S.crowd <= 0 && now > 3) { advancePending(); endSong(true); return; }
  }
  advancePending();
}
function togglePause() {
  if (S.screen !== 'play' || !AC) return;
  if (!S.paused) { S.paused = true; AC.suspend(); }
  else { S.paused = false; AC.resume(); }
}
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('pipeHeroMute', muted ? '1' : '0'); } catch (e) {}
  if (master) master.gain.value = muted ? 0 : 0.9;
  $('muteBtn').style.opacity = muted ? 0.35 : 1;
}

/* ================= leaderboard (shared router: /api/luna-games?game=pipe-hero) ================= */
const LB_API = '/api/luna-games?game=pipe-hero';
const LB_NAME_KEY = 'pipeHeroName';
let runSubmitted = false, lbBusy = false;
function lbStoredName() { try { return (localStorage.getItem(LB_NAME_KEY) || '').slice(0, 20); } catch (e) { return ''; } }
function lbRenderRows(listEl, data, myName) {
  const rows = (data && data.all) || [];
  if (!rows.length) { listEl.innerHTML = '<div class="boardMsg">' + T('board_empty') + '</div>'; return; }
  listEl.innerHTML = '';
  rows.slice(0, 10).forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'brow' + (myName && r.name && String(r.name).toLowerCase() === myName.toLowerCase() ? ' me' : '');
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = (i + 1) + '.';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score;
    d.append(rk, nm, sc); listEl.appendChild(d);
  });
}
async function lbLoad(listEl, myName) {
  try {
    const r = await fetch(LB_API);
    if (!r.ok) throw new Error('board ' + r.status);
    lbRenderRows(listEl, await r.json(), myName);
  } catch (e) {
    listEl.innerHTML = '<div class="boardMsg">' + T('board_down') + '</div>';
  }
}
async function lbSubmit() {
  if (runSubmitted || lbBusy) return false;
  lbBusy = true;
  const btn = $('submitBtn'); btn.disabled = true;
  const name = ($('nameInput').value.trim() || 'PLAYER').slice(0, 20);
  try { localStorage.setItem(LB_NAME_KEY, name); } catch (e) {}
  $('submitStatus').textContent = T('saving');
  try {
    const r = await fetch(LB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: Math.floor(S.score), seconds: S.finalSeconds, initData: '' }) });
    const d = await r.json().catch(() => null);
    if (d && d.ok) {
      runSubmitted = true;
      $('submitStatus').textContent = d.rank ? T('saved_rank', { n: d.rank }) : T('saved');
      lbLoad($('overBoardList'), name);
      return true;
    }
    $('submitStatus').textContent = T('save_fail');
    btn.disabled = false;
    return false;
  } catch (e) {
    $('submitStatus').textContent = T('save_fail');
    btn.disabled = false;
    return false;
  } finally { lbBusy = false; }
}

/* ================= menu / tunes ================= */
function buildTunes() {
  const list = $('tuneList');
  if (!list) return;
  list.innerHTML = '';
  TUNES.forEach((tune, i) => {
    const ch = chartFor(i);
    let best = 0;
    try { best = +(localStorage.getItem('pipeHeroBest' + i) || 0); } catch (e) {}
    const b = document.createElement('button');
    b.className = 'tune' + (i === S.selTune ? ' sel' : '');
    b.innerHTML = '<span class="tnum">' + (i + 1) + '</span>' +
      '<span class="tmain"><span class="tname"></span><br><span class="tdesc"></span></span>' +
      '<span class="tmeta"><span class="dots">' + '●'.repeat(i + 1) + '○'.repeat(3 - i) + '</span><br>' +
      tune.bpm + ' BPM · ♪ ' + ch.notes.length + '<br><span class="best">' +
      (best ? T('best') + ' ' + best.toLocaleString() : '') + '</span></span>';
    b.querySelector('.tname').textContent = T(tune.nameKey);
    b.querySelector('.tdesc').textContent = T(tune.descKey);
    b.addEventListener('click', () => { S.selTune = i; ensureAudio(); buildTunes(); });
    list.appendChild(b);
  });
}

/* ================= rendering ================= */
const canvas = document.createElement('canvas');
$('game').appendChild(canvas);
const ctx = canvas.getContext('2d');
let W = 0, H = 0, crowdHeads = [];
const laneTop = () => H * 0.365, hitY = () => H * 0.795, laneBot = () => H * 0.905, wallBot = () => H * 0.345;
function laneEdgeX(y, b) {
  const t = Math.max(0, Math.min(1, (y - laneTop()) / (laneBot() - laneTop())));
  const half = W * (0.315 + (0.487 - 0.315) * t);
  return W / 2 + (b / 4 * 2 - 1) * half;
}
const laneCenterX = (y, i) => laneEdgeX(y, i + 0.5);
const laneW = y => laneEdgeX(y, 1) - laneEdgeX(y, 0);
function buildCrowd() {
  crowdHeads = [];
  const rows = [{ y: 0.952, n: 13, r: 0.030 }, { y: 0.992, n: 17, r: 0.036 }];
  rows.forEach((row, ri) => {
    for (let k = 0; k < row.n; k++) {
      const j = Math.abs(Math.sin(k * 127.1 + ri * 311.7) * 43758.5453) % 1;
      crowdHeads.push({ x: (k + 0.5) / row.n * W + (j - 0.5) * 12, y: row.y * H, r: row.r * H, ph: j * 6.28, arm: (k + ri) % 3 === 0 });
    }
  });
}
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildCrowd();
}
function tartan(x, y, w, h, base, a, b) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = a;
  for (let sx = x; sx < x + w; sx += w / 3.2) ctx.fillRect(sx, y, w / 9, h);
  ctx.fillStyle = b;
  for (let sy = y; sy < y + h; sy += h / 4.2) ctx.fillRect(x, sy, w, h / 10);
}
function spawnBurst(lane, perfect) {
  const x = laneCenterX(hitY(), lane), y = hitY();
  const n = perfect ? 7 : 3;
  for (let i = 0; i < n; i++) {
    S.particles.push({
      x: x + (Math.random() - 0.5) * 22, y,
      vx: (Math.random() - 0.5) * 95, vy: -(55 + Math.random() * 95),
      life: 0.55 + Math.random() * 0.3, glyph: perfect,
      color: perfect ? '#ffd94d' : '#f5e9d0', size: perfect ? 16 + Math.random() * 6 : 3 + Math.random() * 2.5,
    });
  }
}
function drawPiper(now, beatPh, crowdVis) {
  const u = H * 0.235;
  const px = W / 2, py = wallBot() + H * 0.017 - Math.abs(Math.sin(beatPh * Math.PI)) * 3 * (0.35 + crowdVis / 150);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.sin(beatPh * Math.PI) * 0.028);
  const sq = S.squeeze, bagSX = (1 - 0.13 * sq) * (1 + 0.03 * Math.sin(now * 1.6)), bagSY = 1 - 0.08 * sq;
  const lw = (w) => { ctx.lineWidth = w; };
  // drones over the shoulder
  ctx.strokeStyle = '#453322'; lw(0.036 * u); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0.09 * u, -0.82 * u); ctx.lineTo(0.155 * u, -1.29 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.175 * u, -0.84 * u); ctx.lineTo(0.25 * u, -1.245 * u); ctx.stroke();
  ctx.fillStyle = '#e8ddc4';
  ctx.fillRect(0.132 * u, -1.315 * u, 0.048 * u, 0.032 * u); ctx.fillRect(0.227 * u, -1.27 * u, 0.048 * u, 0.032 * u);
  // bag (tucked under the left arm) + blowpipe
  ctx.save(); ctx.translate(-0.25 * u, -0.595 * u); ctx.scale(bagSX, bagSY);
  ctx.beginPath(); ctx.ellipse(0, 0, 0.148 * u, 0.118 * u, -0.15, 0, 6.29);
  ctx.fillStyle = '#6e1f28'; ctx.fill();
  ctx.strokeStyle = 'rgba(245,233,208,.22)'; lw(0.012 * u);
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 0.07 * u, -0.14 * u); ctx.lineTo(i * 0.07 * u, 0.14 * u); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#17120c'; lw(0.034 * u);
  ctx.beginPath(); ctx.moveTo(-0.245 * u, -0.70 * u); ctx.lineTo(-0.02 * u, -0.945 * u); ctx.stroke();
  // legs, socks, shoes
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(-0.088 * u, -0.245 * u, 0.056 * u, 0.225 * u);
  ctx.fillRect(0.032 * u, -0.245 * u, 0.056 * u, 0.225 * u);
  ctx.fillStyle = '#c22e3a';
  ctx.fillRect(-0.088 * u, -0.075 * u, 0.056 * u, 0.02 * u); ctx.fillRect(0.032 * u, -0.075 * u, 0.056 * u, 0.02 * u);
  ctx.fillStyle = '#14100b';
  ctx.beginPath(); ctx.ellipse(-0.058 * u, -0.006 * u, 0.078 * u, 0.027 * u, 0, 0, 6.29); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.062 * u, -0.006 * u, 0.078 * u, 0.027 * u, 0, 0, 6.29); ctx.fill();
  // kilt (tartan) + sporran
  ctx.beginPath();
  ctx.moveTo(-0.15 * u, -0.53 * u); ctx.lineTo(0.15 * u, -0.53 * u);
  ctx.lineTo(0.205 * u, -0.235 * u); ctx.lineTo(-0.205 * u, -0.235 * u); ctx.closePath();
  ctx.save(); ctx.clip();
  tartan(-0.21 * u, -0.54 * u, 0.42 * u, 0.31 * u, '#26532f', 'rgba(178,34,44,.45)', 'rgba(20,30,60,.35)');
  ctx.restore();
  ctx.fillStyle = '#efe6d4';
  ctx.beginPath(); ctx.ellipse(0, -0.40 * u, 0.066 * u, 0.058 * u, 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#241a10';
  [-0.03, 0, 0.03].forEach(dx => { ctx.beginPath(); ctx.arc(dx * u, -0.435 * u, 0.008 * u, 0, 6.29); ctx.fill(); });
  // torso / jacket
  ctx.beginPath();
  ctx.moveTo(-0.17 * u, -0.865 * u); ctx.lineTo(0.17 * u, -0.865 * u);
  ctx.lineTo(0.152 * u, -0.52 * u); ctx.lineTo(-0.152 * u, -0.52 * u); ctx.closePath();
  ctx.fillStyle = '#1f232b'; ctx.fill();
  ctx.fillStyle = '#f5e9d0';
  ctx.beginPath(); ctx.moveTo(-0.042 * u, -0.865 * u); ctx.lineTo(0.042 * u, -0.865 * u); ctx.lineTo(0, -0.755 * u); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f0a832';
  [-0.70, -0.775, -0.85].forEach(yy => { ctx.beginPath(); ctx.arc(0.055 * u, yy * u, 0.009 * u, 0, 6.29); ctx.fill(); });
  // arms
  ctx.strokeStyle = '#1f232b'; lw(0.072 * u);
  ctx.beginPath(); ctx.moveTo(-0.15 * u, -0.79 * u); ctx.lineTo(-0.26 * u, -0.65 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.15 * u, -0.80 * u); ctx.lineTo(0.035 * u, -0.635 * u); ctx.stroke();
  ctx.fillStyle = '#eec39b';
  ctx.beginPath(); ctx.arc(0.03 * u, -0.63 * u, 0.033 * u, 0, 6.29); ctx.fill();
  // chanter hanging from the hands, finger lights per lane
  ctx.beginPath();
  ctx.moveTo(-0.004 * u, -0.645 * u); ctx.lineTo(0.048 * u, -0.645 * u);
  ctx.lineTo(0.062 * u, -0.30 * u); ctx.lineTo(0.016 * u, -0.30 * u); ctx.closePath();
  ctx.fillStyle = '#2a1608'; ctx.fill();
  ctx.fillStyle = '#e8ddc4'; ctx.fillRect(0.014 * u, -0.315 * u, 0.05 * u, 0.016 * u);
  ctx.fillStyle = '#0d0906';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0.030 * u, (-0.60 + i * 0.048) * u, 0.0075 * u, 0, 6.29); ctx.fill(); }
  for (let L = 0; L < 4; L++) {
    if (S.laneFlash[L] > 0.05) {
      ctx.globalAlpha = S.laneFlash[L];
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(0.028 * u, (-0.605 + L * 0.052) * u, 0.021 * u, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // head + glengarry
  ctx.fillStyle = '#eec39b';
  ctx.beginPath(); ctx.arc(0, -0.99 * u, 0.105 * u, 0, 6.29); ctx.fill();
  ctx.fillStyle = 'rgba(230,110,110,.4)';
  ctx.beginPath(); ctx.arc(-0.056 * u, -0.952 * u, 0.02 * u, 0, 6.29); ctx.fill();
  ctx.beginPath(); ctx.arc(0.056 * u, -0.952 * u, 0.02 * u, 0, 6.29); ctx.fill();
  ctx.strokeStyle = '#241407'; lw(0.011 * u);
  if (S.wince > 0.4) { // the dreaded wince — a note just squeaked
    [-0.038, 0.038].forEach(dx => {
      ctx.beginPath();
      ctx.moveTo((dx - 0.014) * u, -1.022 * u); ctx.lineTo((dx + 0.014) * u, -0.994 * u);
      ctx.moveTo((dx + 0.014) * u, -1.022 * u); ctx.lineTo((dx - 0.014) * u, -0.994 * u);
      ctx.stroke();
    });
  } else {
    ctx.fillStyle = '#241407';
    ctx.beginPath(); ctx.arc(-0.038 * u, -1.008 * u, 0.011 * u, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(0.038 * u, -1.008 * u, 0.011 * u, 0, 6.29); ctx.fill();
  }
  ctx.fillStyle = '#1b2436';
  ctx.beginPath();
  ctx.moveTo(-0.108 * u, -1.005 * u); ctx.quadraticCurveTo(-0.02 * u, -1.135 * u, 0.112 * u, -1.035 * u);
  ctx.lineTo(0.10 * u, -0.995 * u); ctx.quadraticCurveTo(0, -1.03 * u, -0.10 * u, -0.995 * u); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c22e3a';
  ctx.beginPath(); ctx.arc(0.052 * u, -1.128 * u, 0.02 * u, 0, 6.29); ctx.fill();
  ctx.restore();
}
function draw(now) {
  const pos = S.screen === 'play' ? songPos() : 0;
  const beatPh = S.screen === 'play' ? pos / S.spb : now * 1.35;
  const crowdVis = S.screen === 'play' ? S.crowd : 55;
  // stone wall
  const wg = ctx.createLinearGradient(0, 0, 0, wallBot());
  wg.addColorStop(0, '#2b1d11'); wg.addColorStop(1, '#1a110a');
  ctx.fillStyle = wg; ctx.fillRect(0, 0, W, wallBot());
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
  const bh = H * 0.046;
  for (let y = bh; y < wallBot(); y += bh) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let r2 = 0; r2 * bh < wallBot(); r2++) {
    for (let x = (r2 % 2) * W * 0.09 + W * 0.05; x < W; x += W * 0.18) {
      ctx.beginPath(); ctx.moveTo(x, r2 * bh); ctx.lineTo(x, r2 * bh + bh); ctx.stroke();
    }
  }
  // tartan banners
  [0.14, 0.86].forEach((fx, bi) => {
    ctx.save();
    ctx.translate(fx * W, 0); ctx.rotate(Math.sin(now * 0.7 + bi * 2.1) * 0.02);
    const bw = W * 0.105, bhh = H * 0.185;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, 0); ctx.lineTo(bw / 2, 0); ctx.lineTo(bw / 2, bhh);
    ctx.lineTo(0, bhh - H * 0.03); ctx.lineTo(-bw / 2, bhh); ctx.closePath();
    ctx.save(); ctx.clip();
    tartan(-bw / 2, 0, bw, bhh, bi ? '#26532f' : '#7a1f28', 'rgba(240,168,50,.28)', 'rgba(245,233,208,.20)');
    ctx.restore();
    ctx.strokeStyle = 'rgba(240,168,50,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  });
  // lanterns
  [0.075, 0.925].forEach((fx, li) => {
    const x = fx * W, y = H * 0.185;
    const fl = 0.15 + 0.03 * Math.sin(now * 11 + li * 39);
    const g = ctx.createRadialGradient(x, y, 2, x, y, W * 0.17);
    g.addColorStop(0, 'rgba(255,176,66,' + fl + ')'); g.addColorStop(1, 'rgba(255,176,66,0)');
    ctx.fillStyle = g; ctx.fillRect(x - W * 0.17, y - W * 0.17, W * 0.34, W * 0.34);
    ctx.fillStyle = '#120b06'; ctx.fillRect(x - 6, y - 9, 12, 18);
    ctx.fillStyle = '#ffca6a'; ctx.fillRect(x - 3.5, y - 5.5, 7, 11);
    ctx.strokeStyle = 'rgba(240,168,50,.7)'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 6, y - 9, 12, 18);
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y - 20); ctx.stroke();
  });
  // wooden stage floor
  const fg = ctx.createLinearGradient(0, wallBot(), 0, H);
  fg.addColorStop(0, '#53351a'); fg.addColorStop(0.25, '#3a2412'); fg.addColorStop(1, '#1d1108');
  ctx.fillStyle = fg; ctx.fillRect(0, wallBot(), W, H - wallBot());
  ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.lineWidth = 1.5;
  for (let y = wallBot() + H * 0.052; y < H; y += H * 0.052) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,190,90,.30)'; ctx.fillRect(0, wallBot(), W, 2.5);
  // lanes
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(laneEdgeX(laneTop(), i), laneTop()); ctx.lineTo(laneEdgeX(laneTop(), i + 1), laneTop());
    ctx.lineTo(laneEdgeX(laneBot(), i + 1), laneBot()); ctx.lineTo(laneEdgeX(laneBot(), i), laneBot());
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(255,240,210,.050)' : 'rgba(255,240,210,.018)';
    ctx.fill();
    if (S.laneFlash[i] > 0.02) {
      ctx.fillStyle = LANE_COLORS[i]; ctx.globalAlpha = S.laneFlash[i] * 0.20; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(245,233,208,.15)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(laneEdgeX(laneTop(), i), laneTop()); ctx.lineTo(laneEdgeX(laneBot(), i), laneBot()); ctx.stroke();
    if (i === 3) { ctx.beginPath(); ctx.moveTo(laneEdgeX(laneTop(), 4), laneTop()); ctx.lineTo(laneEdgeX(laneBot(), 4), laneBot()); ctx.stroke(); }
  }
  // piper on stage
  drawPiper(now, beatPh, crowdVis);
  // hit line + receptors
  ctx.fillStyle = 'rgba(255,207,94,' + (0.30 + 0.22 * S.beatPulse) + ')';
  ctx.fillRect(laneEdgeX(hitY(), 0), hitY() - 1.5, laneEdgeX(hitY(), 4) - laneEdgeX(hitY(), 0), 3);
  for (let i = 0; i < 4; i++) {
    const cx = laneCenterX(hitY(), i), R = laneW(hitY()) * 0.30 * (1 + 0.16 * S.laneFlash[i]);
    ctx.beginPath(); ctx.arc(cx, hitY(), R, 0, 6.29);
    ctx.fillStyle = 'rgba(10,6,3,.6)'; ctx.fill();
    ctx.strokeStyle = LANE_COLORS[i]; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = 'rgba(245,233,208,.6)';
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DFJK'[i], cx, hitY() + R + 15);
  }
  // notes
  if (S.screen === 'play') {
    for (const n of S.chart) {
      if (n.state !== 0) continue;
      const dt = n.t - pos;
      if (dt > APPROACH || dt < -0.05) continue;
      const p = 1 - dt / APPROACH;
      const y = laneTop() + p * (hitY() - laneTop());
      const cx = laneCenterX(y, n.lane);
      const R = laneW(y) * 0.30 * (0.5 + 0.55 * p);
      ctx.beginPath(); ctx.arc(cx, y, R, 0, 6.29);
      ctx.fillStyle = '#f7ecd2'; ctx.fill();
      ctx.strokeStyle = LANE_COLORS[n.lane]; ctx.lineWidth = Math.max(2, R * 0.22); ctx.stroke();
      ctx.fillStyle = '#2a1a0e';
      ctx.font = '700 ' + (R * 1.05) + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', cx, y + R * 0.06);
    }
  }
  // crowd silhouettes — they bounce harder as the meter climbs
  const beatHz = S.screen === 'play' ? 1 / S.spb : 1.35;
  ctx.fillStyle = '#0b0705';
  for (const hd of crowdHeads) {
    const bounce = Math.abs(Math.sin(now * beatHz * Math.PI + hd.ph)) * (1 + crowdVis * 0.05) + S.beatPulse * 2.0 * (crowdVis / 100);
    const y = hd.y - bounce;
    ctx.beginPath(); ctx.arc(hd.x, y, hd.r, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,100,.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hd.x, y, hd.r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    if (crowdVis > 68 && hd.arm) {
      ctx.strokeStyle = '#0b0705'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      const wv = Math.sin(now * 3.1 + hd.ph) * 0.3;
      ctx.beginPath(); ctx.moveTo(hd.x - hd.r * 0.6, y - hd.r * 0.4); ctx.lineTo(hd.x - hd.r * (1.25 + wv * 0.3), y - hd.r * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hd.x + hd.r * 0.6, y - hd.r * 0.4); ctx.lineTo(hd.x + hd.r * (1.25 - wv * 0.3), y - hd.r * 1.5); ctx.stroke();
    }
  }
  // particles
  for (const p of S.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 1.8);
    ctx.fillStyle = p.color;
    if (p.glyph) {
      ctx.font = '700 ' + p.size + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', p.x, p.y);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // judgement popup + combo
  if (S.judge) {
    const age = performance.now() - S.judge.at;
    if (age < 600) {
      const sc = 1 + 0.55 * Math.exp(-age / 90);
      ctx.globalAlpha = 1 - age / 650;
      ctx.font = '700 ' + (30 * sc) + 'px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,5,2,.85)';
      const jy = H * 0.585;
      ctx.strokeText(S.judge.txt, W / 2, jy);
      ctx.fillStyle = S.judge.color;
      ctx.fillText(S.judge.txt, W / 2, jy);
      if (S.combo >= 5) {
        ctx.font = '700 16px Georgia, serif';
        ctx.lineWidth = 4;
        const ct = '×' + mult() + ' · ' + S.combo;
        ctx.strokeText(ct, W / 2, jy + 34);
        ctx.fillStyle = '#f5e9d0'; ctx.fillText(ct, W / 2, jy + 34);
      }
      ctx.globalAlpha = 1;
    }
  }
  // tune title during the lead-in
  if (S.screen === 'play' && pos >= 0 && pos < 1.7) {
    const a = pos < 0.25 ? pos / 0.25 : Math.max(0, 1 - (pos - 0.9) / 0.8);
    ctx.globalAlpha = a;
    ctx.font = '700 ' + Math.min(30, W * 0.075) + 'px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,5,2,.85)';
    const nm = T(TUNES[S.tuneIdx].nameKey);
    ctx.strokeText(nm, W / 2, H * 0.52);
    ctx.fillStyle = '#ffcf5e'; ctx.fillText(nm, W / 2, H * 0.52);
    ctx.globalAlpha = 1;
  }
  // paused overlay
  if (S.paused && S.screen === 'play') {
    ctx.fillStyle = 'rgba(5,3,1,.62)'; ctx.fillRect(0, 0, W, H);
    ctx.font = '700 40px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffcf5e';
    ctx.fillText(T('paused'), W / 2, H * 0.5);
  }
}

/* ================= input & loop ================= */
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (S.screen !== 'play' || S.paused) return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const yy = Math.max(laneTop(), Math.min(laneBot(), y));
  const rel = (x - laneEdgeX(yy, 0)) / (laneEdgeX(yy, 4) - laneEdgeX(yy, 0));
  hitLane(Math.max(0, Math.min(3, Math.floor(rel * 4))));
});
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  ensureAudio();
  const k = (e.key || '').toLowerCase();
  const li = { d: 0, f: 1, j: 2, k: 3 }[k];
  if (li !== undefined) hitLane(li);
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'm') toggleMute();
});
let lastHud = { score: -1, combo: '', crowd: -1 };
function tick(nowMs) {
  requestAnimationFrame(tick);
  const now = nowMs / 1000;
  if (S.screen === 'play' && !S.paused) {
    const pos = songPos();
    const bi = Math.floor(pos / S.spb);
    if (bi > S.lastBeat) { S.lastBeat = bi; S.beatPulse = 1; }
    if (S.qaAuto) {
      for (const n of S.chart) {
        if (n.state === 0 && pos >= n.t - 0.02 && pos <= n.t + GOOD_WIN) hitLane(n.lane);
      }
    }
    missCheck();
    if (S.screen === 'play' && pos >= S.dur) endSong(false);
  }
  const dk = Math.exp(-0.016 * 7);
  S.laneFlash = S.laneFlash.map(v => v * dk);
  S.squeeze *= Math.exp(-0.016 * 5.5);
  S.wince *= Math.exp(-0.016 * 4);
  S.beatPulse *= Math.exp(-0.016 * 6);
  S.particles = S.particles.filter(p => {
    p.life -= 0.016; p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.vy -= 26 * 0.016;
    return p.life > 0;
  });
  if (S.screen === 'play') {
    if (lastHud.score !== S.score) { lastHud.score = S.score; $('scoreVal').textContent = S.score.toLocaleString(); }
    const cv = '×' + mult();
    if (lastHud.combo !== cv) { lastHud.combo = cv; $('comboVal').textContent = cv; }
    const cw = Math.round(S.crowd);
    if (lastHud.crowd !== cw) {
      lastHud.crowd = cw;
      $('crowdFill').style.width = cw + '%';
      $('crowdFill').classList.toggle('low', cw < 25);
    }
  }
  draw(now);
}

/* ================= wiring & init ================= */
$('playBtn').addEventListener('click', () => startSong(S.selTune));
$('againBtn').addEventListener('click', () => startSong(S.tuneIdx));
$('menuBtn').addEventListener('click', () => { buildTunes(); showScreen('menu'); });
$('boardBtn').addEventListener('click', () => {
  const p = $('pickBoard');
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'block';
  if (!open) lbLoad($('pickBoardList'), lbStoredName());
});
$('submitBtn').addEventListener('click', () => lbSubmit());
$('muteBtn').addEventListener('click', toggleMute);
$('pauseBtn').addEventListener('click', togglePause);
window.addEventListener('pointerdown', () => ensureAudio());
(function init() {
  const sel = $('langSel');
  LANGS.forEach(([code, name]) => {
    const o = document.createElement('option');
    o.value = code; o.textContent = name;
    sel.appendChild(o);
  });
  sel.value = LANG_CUR;
  sel.addEventListener('change', () => setLang(sel.value));
  $('muteBtn').style.opacity = muted ? 0.35 : 1;
  applyLang();
  resize();
  window.addEventListener('resize', resize);
  showScreen('menu');
  requestAnimationFrame(tick);
})();

/* ================= QA hooks ================= */
window.__qa = {
  state: () => ({
    screen: S.screen, tune: S.tuneIdx, score: S.score, combo: S.combo, maxCombo: S.maxCombo,
    crowd: Math.round(S.crowd * 10) / 10, perfect: S.nPerfect, good: S.nGood, miss: S.nMiss,
    notes: S.chart.length, pos: Math.round(songPos() * 100) / 100, dur: Math.round(S.dur * 10) / 10,
    failed: S.failed, paused: S.paused, errs: window.__errs,
  }),
  start: i => { startSong(i == null ? S.selTune : i); return true; },
  setAuto: v => { S.qaAuto = !!v; return S.qaAuto; },
  warp: s => { S.timeShift += s; return songPos(); },
  drain: () => { S.crowd = 0.5; return S.crowd; },
  fill: () => { S.crowd = 100; return S.crowd; },
  pause: () => { togglePause(); return S.paused; },
  setLang: c => { setLang(c); return LANG_CUR; },
  lang: () => LANG_CUR,
  chart: i => {
    const c = chartFor(i);
    return { n: c.notes.length, dur: Math.round(c.dur * 10) / 10, first: c.notes.slice(0, 4).map(n => ({ t: Math.round(n.t * 100) / 100, lane: n.lane, pitch: n.pitch })) };
  },
  submit: () => lbSubmit(),
  lb: () => ({ submitted: runSubmitted, storedName: lbStoredName() }),
};
