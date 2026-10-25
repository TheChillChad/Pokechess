// Impostazioni grafiche. Per usare un altro set di sprite:
//  1) crea public/sprites/<nome>/ con gli stessi file di public/sprites/mostri/
//  2) cambia spriteSet qui sotto, oppure apri il gioco con ?sprites=<nome>
window.GAME_CONFIG = {
  spriteSet: (new URLSearchParams(location.search).get('sprites') || 'mostri').replace(/[^a-zA-Z0-9_-]/g, ''),
};
