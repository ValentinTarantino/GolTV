const fs = require('fs');
fetch('https://www.promiedos.com.ar/')
  .then(r => r.text())
  .then(t => {
    fs.writeFileSync('promiedos.html', t);
    const matches = t.match(/href="\/league\/([^"]+)"[^>]*>Paraguay/gi);
    console.log(matches);
  });
