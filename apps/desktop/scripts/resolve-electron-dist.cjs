const path = require('path');
const pkg = require.resolve('electron/package.json');
process.stdout.write(path.join(path.dirname(pkg), 'dist'));
