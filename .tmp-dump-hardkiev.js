const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://hard.kiev.ua/search/?query=' + encodeURIComponent('xeon e5'), {waitUntil:'domcontentloaded', timeout:20000});
  await new Promise(r => setTimeout(r, 3000));
  fs.writeFileSync('.tmp-hardkiev.html', await page.content(), 'utf8');
  await browser.close();
})();
