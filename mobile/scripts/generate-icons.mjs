// Gera os ícones PNG do PWA (192 e 512) sem dependências externas: encoder PNG
// mínimo (zlib do Node + CRC32) desenhando a logo — o "V" de DUAS linhas
// separadas dentro do anel pontilhado. Rode com: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [14, 27, 43];     // #0e1b2b
const DASH = [60, 86, 109];  // #3c566d
const V = [233, 242, 250];   // #e9f2fa

function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return(~c)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tb=Buffer.from(t,"ascii");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tb,d])));return Buffer.concat([l,tb,d,cr]);}
function unit(ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=Math.hypot(dx,dy);return {x:dx/l,y:dy/l};}
function intersect(p1,d1,p2,d2){const cr=d1.x*d2.y-d1.y*d2.x;const px=p2.x-p1.x,py=p2.y-p1.y;const t=(px*d2.y-py*d2.x)/cr;return {x:p1.x+t*d1.x,y:p1.y+t*d1.y};}
function distSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay;const l2=dx*dx+dy*dy;let t=((px-ax)*dx+(py-ay)*dy)/l2;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}

function iconPng(N){
  const s = N / 512;                          // geometria definida no espaço 512
  const TL={x:186*s,y:172*s}, M={x:256*s,y:336*s}, TR={x:326*s,y:172*s};
  const W = 11*s, SH = 3.4*s;
  const dL=unit(TL.x,TL.y,M.x,M.y), dR=unit(M.x,M.y,TR.x,TR.y);
  const nL={x:-dL.y,y:dL.x}, nR={x:-dR.y,y:dR.x};
  const OTL={x:TL.x+W*nL.x,y:TL.y+W*nL.y}, ITL={x:TL.x-W*nL.x,y:TL.y-W*nL.y};
  const OTR={x:TR.x+W*nR.x,y:TR.y+W*nR.y}, ITR={x:TR.x-W*nR.x,y:TR.y-W*nR.y};
  const OB=intersect(OTL,dL,OTR,dR), IB=intersect(ITL,dL,ITR,dR);
  const cx=256*s, cy=256*s, R=170*s, ringHalf=3.5*s, period=28*s, on=15*s;

  function shade(x,y){
    let col=BG;
    const d=Math.hypot(x-cx,y-cy);
    if(Math.abs(d-R)<=ringHalf){const arc=R*Math.atan2(y-cy,x-cx);if(((arc%period)+period)%period<on)col=DASH;}
    const dOut=Math.min(distSeg(x,y,OTL.x,OTL.y,OB.x,OB.y), distSeg(x,y,OB.x,OB.y,OTR.x,OTR.y));
    const dIn =Math.min(distSeg(x,y,ITL.x,ITL.y,IB.x,IB.y), distSeg(x,y,IB.x,IB.y,ITR.x,ITR.y));
    if(dOut<=SH || dIn<=SH)col=V;
    return col;
  }

  const SUB=[0.125,0.375,0.625,0.875];        // 4x4 supersample (anti-serrilhado)
  const raw=Buffer.alloc(N*(N*4+1));let p=0;
  for(let y=0;y<N;y++){raw[p++]=0;for(let x=0;x<N;x++){let r=0,g=0,b=0,n=0;for(const sy of SUB)for(const sx of SUB){const c=shade(x+sx,y+sy);r+=c[0];g+=c[1];b+=c[2];n++;}raw[p++]=Math.round(r/n);raw[p++]=Math.round(g/n);raw[p++]=Math.round(b/n);raw[p++]=255;}}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(N,0);ihdr.writeUInt32BE(N,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}

for(const N of [192,512]){
  writeFileSync(new URL(`../public/icon-${N}.png`, import.meta.url), iconPng(N));
  console.log(`icon-${N}.png gerado`);
}
