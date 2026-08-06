const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',locale:'en-AE',viewport:{width:1366,height:900},geolocation:{latitude:25.2048,longitude:55.2708},permissions:['geolocation']});
  const p=await ctx.newPage();
  await p.goto('https://www.spinneys.com/en-ae/search/?q=parmigiano',{waitUntil:'domcontentloaded',timeout:35000});
  await p.waitForTimeout(6000);
  const out=await p.evaluate(()=>{
    // find elements whose direct text has a price, climb to card, capture link + text
    const priced=[...document.querySelectorAll('a[href]')].filter(a=>/AED|\d+\.\d{2}/.test(a.textContent));
    const res=[]; const seen=new Set();
    for(const a of priced){
      const href=a.getAttribute('href')||''; if(seen.has(href))continue; seen.add(href);
      res.push({href:href.slice(0,70), text:a.innerText.replace(/\s+/g,' ').trim().slice(0,90)});
      if(res.length>=8)break;
    }
    // also sample all hrefs to learn product url pattern
    const allhref=[...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')))].filter(h=>h&&!h.startsWith('#')).slice(0,25);
    return {pricedAnchors:res, hrefSample:allhref};
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})().catch(e=>console.error(e));
