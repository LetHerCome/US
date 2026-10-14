/* English for US 1.0. Each key is the Italian text exactly as the app shows
   it (spacing does not matter); {name} marks a part that changes, such as a
   person's name or a number, and must appear in the English too. Italian is
   the source: a text missing here simply stays Italian. i18n.js applies it. */
(function () {
  'use strict';
  const EN = {
    Oggi: 'Today',
    Noi: 'Us',
    Ricordi: 'Memories',
    Gioca: 'Play',
    'US — Il vostro spazio': 'US — Your space'
  };
  if (typeof module === 'object' && module.exports) module.exports = EN;
  else window.UsI18n?.register('en', EN);
})();
