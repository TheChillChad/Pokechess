// Giorni speciali (tema solo per quella data, secondo l'orologio del dispositivo).
(function () {
  const SPECIAL = { '2026-11-27': { name: 'Matteo', title: 'EleMatteo', word: 'MATTEO', mate: 'Matteo' } };
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const sp = SPECIAL[today];
  if (!sp) return;
  const apply = () => {
    const home = document.getElementById('home'); if (!home) return;
    home.classList.add('bday');
    document.title = sp.title;
    home.querySelectorAll('.h-cnt img, .h-fl').forEach((im) => { im.src = 'sprites/classico/squalo.svg'; });
    const m = home.querySelector('.h-mate'); if (m) m.textContent = sp.word;
    const w = home.querySelector('.h-wordmark'); if (w) w.setAttribute('aria-label', sp.title);
    const lead = home.querySelector('.h-lead');
    if (lead && !home.querySelector('.h-bday')) {
      const b = document.createElement('p'); b.className = 'h-bday'; b.innerHTML = '🦈 Auguri ' + sp.name + '! 🎂';
      lead.parentNode.insertBefore(b, lead.nextSibling);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  window.SPECIAL_DAY = sp;
})();
