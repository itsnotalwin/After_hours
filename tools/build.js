// Bundles src/*.js into dist/app.js and writes a deployable folder plus a single-file build for quick previews.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const order = ['rng', 'paper', 'world', 'art', 'dialogue', 'sim', 'main'];
const js = order.map((n) => fs.readFileSync(path.join(root, 'src', n + '.js'), 'utf8')).join('\n');
fs.writeFileSync(path.join(dist, 'app.js'), js);
['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
  .forEach((f) => fs.copyFileSync(path.join(root, f), path.join(dist, f)));
// single-file build (no service worker, everything inline)
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace('<link rel="apple-touch-icon" href="icon-180.png">\n', '')
  .replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', () => '<link rel="icon" href="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '">')
  .replace('<script src="app.js"></script>', () => '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>');
fs.writeFileSync(path.join(dist, 'afterhours.html'), html);
console.log('built', fs.statSync(path.join(dist, 'app.js')).size, 'bytes app.js;', fs.statSync(path.join(dist, 'afterhours.html')).size, 'bytes single file');
