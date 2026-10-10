// Construye index.html (documento completo, GitHub Pages) y dist/artifact.html (fragmento para claude.ai)
const fs = require('fs');
const read = f => fs.readFileSync(f, 'utf8');
let page = read('src/page.html');
const inline = (marker, file) => { page = page.replace(`<script>/*${marker}*/</script>`, () => `<script>\n${read(file)}\n</script>`); };
inline('SIM', 'src/sim.js'); inline('DRAW3D', 'src/draw3d.js'); inline('AUDIO', 'src/audio.js'); inline('DRAW', 'src/draw.js'); inline('ANIM', 'src/anim.js'); inline('GAME', 'src/game.js');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/artifact.html', page);
const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0b0e18">
<meta name="description" content="TSM · Todos Somos Muslera. Juego de boxeo del grupo KLK: controlas a Muslera e intentas ganar a Oscar.">
${page}
</body>
</html>
`.replace('<meta name="description" content="TSM · Todos Somos Muslera. Juego de boxeo del grupo KLK: controlas a Muslera e intentas ganar a Oscar.">\n<title>', '<meta name="description" content="TSM · Todos Somos Muslera. Juego de boxeo del grupo KLK: controlas a Muslera e intentas ganar a Oscar.">\n<title>');
// mover title/link/style al head: el fragmento empieza por ellos, así que cerramos head tras el </style>
const i = full.indexOf('</style>') + '</style>'.length;
fs.writeFileSync('index.html', full.slice(0, i) + '\n</head>\n<body>' + full.slice(i));
console.log('index.html', fs.statSync('index.html').size, 'bytes · dist/artifact.html', fs.statSync('dist/artifact.html').size, 'bytes');
