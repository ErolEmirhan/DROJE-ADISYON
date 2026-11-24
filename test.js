const fs=require('fs'),os=require('os');
const puppeteer=require('puppeteer-core');
const out=[];const log=(...a)=>{const s=a.join(' ');console.log(s);out.push(s)};
let fail=false;const check=(c,m)=>{log((c?'PASS ':'FAIL ')+m); if(!c) fail=true;};
(async()=>{
  const ifs=os.networkInterfaces();
  const ips=[];for(const n of Object.keys(ifs))for(const i of ifs[n])if((i.family==='IPv4'||i.family===4)&&!i.internal)ips.push(n+'='+i.address);
  log('Adaptorler:',ips.join(', '));
  // Uygulamanin sectigi adres: QR'in gosterdigi URL ile ayni (pickLanIP). Logdan bul.
  let appOut='';try{appOut=fs.readFileSync('app-out.txt','utf8')}catch(e){}
  const m=appOut.match(/API Server başlatıldı: (http:\/\/[^\s]+)/);
  log('Uygulamanin sectigi adres:', m?m[1]:'(logda yok)');
  const ad=appOut.match(/Ağ adaptörleri:[^\n]*/); log(ad?ad[0]:'(adaptor logu yok)');
  const lan=ips.map(s=>s.split('=')[1]).find(ip=>!ip.startsWith('169.254'))||'127.0.0.1';
  const base=m?m[1]:'http://'+lan+':3000';
  for(const url of [base,'http://127.0.0.1:3000']){
    let r=await fetch(url+'/mobile').catch(e=>({ok:false,status:'ERR '+e.message}));
    const html=r.ok?await r.text():'';
    check(r.ok&&html.includes('pinSection'),`${url}/mobile sayfasi geliyor (status ${r.status})`);
    if(html){const api=(html.match(/const API_URL = '([^']+)'/)||[])[1];check(api===url+'/api',`API_URL telefonun girdigi adres: ${api}`);}
  }
  const sio=await fetch(base+'/socket.io/socket.io.min.js').catch(()=>({ok:false,status:'ERR'}));
  check(sio.ok,`socket.io istemcisi kasadan geliyor (status ${sio.status})`);
  for(const [pw,exp] of [['1234',true],['5555',true],[' 1234 ',true],['9999',false],['',false]]){
    const r=await fetch(base+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}).catch(e=>null);
    const j=r?await r.json().catch(()=>({})):{};
    check(!!j.success===exp,`login "${pw}" -> ${JSON.stringify(j).slice(0,80)} (beklenen ${exp})`);
  }
  // Gercek tarayicida telefon gibi: sayfayi ac, sifre gir, giris yap
  const chrome=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(p=>fs.existsSync(p));
  const b=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox']});
  const pg=await b.newPage();await pg.setViewport({width:390,height:844,isMobile:true});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  // internet yokmus gibi: disari giden tum istekleri engelle
  await pg.setRequestInterception(true);
  pg.on('request',r=>{const u=r.url();if(u.startsWith(base)||u.startsWith('data:'))r.continue();else{errs.push('DIS ISTEK ENGELLENDI '+u);r.abort();}});
  const t0=Date.now();
  await pg.goto(base+'/mobile',{waitUntil:'domcontentloaded',timeout:20000}).catch(e=>log('goto hata '+e.message));
  log('Sayfa yuklenme ms:',Date.now()-t0);
  await pg.screenshot({path:'1-giris.png'});
  const pinVis=await pg.evaluate(()=>{const e=document.getElementById('pinSection');return e&&getComputedStyle(e).display!=='none'});
  check(pinVis,'Giris ekrani gorunuyor (internet yokken)');
  const inp=await pg.$('#pinSection input');
  if(inp){await inp.type('1234');}
  await pg.evaluate(()=>{const btn=[...document.querySelectorAll('#pinSection button')].find(b=>/Giriş/.test(b.textContent)); btn&&btn.click();});
  await new Promise(r=>setTimeout(r,4500));
  await pg.screenshot({path:'2-sonra.png'});
  const mainVis=await pg.evaluate(()=>{const e=document.getElementById('mainSection');return e&&getComputedStyle(e).display!=='none'});
  check(mainVis,'Sifre 1234 ile giris yapildi, ana ekran acildi');
  log('Sayfa hatalari:',JSON.stringify(errs.slice(0,10)));
  await b.close();
  log(fail?'SONUC: BASARISIZ':'SONUC: HEPSI GECTI');
  fs.writeFileSync('result.txt',out.join('\n'));
  process.exit(fail?1:0);
})().catch(e=>{log('TEST HATASI '+e.stack);fs.writeFileSync('result.txt',out.join('\n'));process.exit(1)});
