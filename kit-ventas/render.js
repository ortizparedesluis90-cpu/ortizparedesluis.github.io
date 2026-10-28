const { chromium } = require(process.env.PW);
const pagina = process.argv[2] || 'tarjetas';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
  const p = await b.newPage({ viewport: { width: 1180, height: 1400 } });
  await p.goto(`http://127.0.0.1:8091/${pagina}.html`); await p.waitForSelector('body[data-listo="1"]'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  if (pagina === 'tarjetas') {
    for (let i = 1; i <= 7; i++) await p.locator('#p' + i).screenshot({ path: `out/venta-${i}.png` });
  } else {
    await p.pdf({ path: `out/${pagina}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const n = await p.locator('.hoja').count();
    for (let i = 0; i < n; i++) await p.locator('.hoja').nth(i).screenshot({ path: `out/${pagina}-${i + 1}.png` });
  }
  await b.close(); console.log('ok', pagina);
})();
