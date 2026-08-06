const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',locale:'en-AE',viewport:{width:1366,height:900},geolocation:{latitude:25.2048,longitude:55.2708},permissions:['geolocation']});
  const p=await ctx.newPage();
  await p.goto('https://www.spinneys.com/en-ae/search/?q=parmigiano',{waitUntil:'domcontentloaded',timeout:35000});
  await p.waitForTimeout(6000);
  const out=await p.evaluate(()=>{
    const res=[]; const seen=new Set();
    for(const a of document.querySelectorAll('a[href*="/catalogue/"]')){
      const href=a.getAttribute('href')||'';
      if(href.includes('/category/')) continue;
      const m=href.match(/_(\d+)\/?$/); if(!m) continue;
      if(seen.has(m[1])) continue;
      let node=a,card=null;
      for(let i=0;i<6&&node;i++){node=node.parentElement; if(node&&/\d+\.\d{2}/.test(node.textContent)){card=node;break;}}
      if(!card) continue;
      const t=card.innerText.replace(/\s+/g,' ').trim();
      const pm=t.match(/([\d,]+\.\d{2})/); if(!pm) continue;
      seen.add(m[1]);
      res.push({id:m[1], text:t.slice(0,80)});
      if(res.length>=10)break;
    }
    return res;
  });
  console.log('found', out.length, 'products'); console.log(JSON.stringify(out,null,1));
  await b.close();
})().catch(e=>console.error(e));
