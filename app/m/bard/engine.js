/* 吟游诗人整数模型（INT-C16）的浏览器引擎，原样取自 jogjohgoeg.github.io/nand-llama-research（CC0）。 */
/* SPDX-License-Identifier: CC0-1.0. Integer-valued JS engine for TC16I001. */
(() => {
  "use strict";
  function r(n, d) {
    const neg=n<0, a=neg?-n:n;
    let q=Math.floor(a/d), rem=a-q*d;
    // Correct division rounding at an integer boundary, before integer RNE.
    if(rem<0){q--;rem+=d;} else if(rem>=d){q++;rem-=d;}
    if(2*rem>d || (2*rem===d && q%2===1))q++;
    return neg?-q:q;
  }
  const sat=n=>Math.max(-524288,Math.min(524287,n));
  function isqrt(n) {
    let z=0,b=70368744177664;
    for(let i=0;i<24;i++,b=Math.floor(b/4)){if(n>=z+b){n-=z+b;z=Math.floor(z/2)+b;}else z=Math.floor(z/2);}
    return z;
  }
  function load(buffer) {
    const view=new DataView(buffer), raw=new Uint8Array(buffer);let offset=8;
    if(buffer.byteLength!==283804 || String.fromCharCode(...raw.slice(0,8))!=="TC16I001")throw Error("Model format");
    const w=new Int8Array(972800);
    for(let i=0;i<w.length;i++){const c=(raw[offset+(i>>2)]>>(2*(i%4)))&3;if(c===3)throw Error("Ternary code");w[i]=c===2?-1:c;}
    offset+=243200;
    function take(n,bytes,signed=false){const a=new Int32Array(n);for(let i=0;i<n;i++,offset+=bytes)a[i]=bytes===1?view.getInt8(offset):bytes===2?view.getInt16(offset,true):signed?view.getInt32(offset,true):view.getUint32(offset,true);return a;}
    const alpha=take(35,4),emb=take(24576,1),es=take(192,4),norms=take(1408,2);
    const co=take(512,4,true),si=take(512,4,true),ex=take(1025,4),sig=take(1025,4);
    const offsets=[0,16384,32768,49152,65536,108544,151552];
    function quant(x){let m=1;for(const a of x)m=Math.max(m,Math.abs(a));const q=Int8Array.from(x,a=>r(a*127,m));return [q,m];}
    function norm(x,n){let sum=0;for(const a of x)sum+=a*a;const root=Math.max(1,isqrt(2*sum+4295));return Int32Array.from(x,(a,i)=>sat(r(4*a*norms[n*128+i],root)));}
    function linear(x,l,m){const [q,scale]=quant(x),n=q.length,rows=(m===4||m===5)?336:128;
      const base=l*194560+offsets[m],a=new Int32Array(rows);
      for(let j=0;j<rows;j++){let dot=0;for(let i=0;i<n;i++)dot+=q[i]*w[base+j*n+i];a[j]=sat(r(dot*scale*alpha[l*7+m],33292288));}return a;}
    function rope(x,p){for(let h=0;h<4;h++)for(let i=0;i<16;i++){const a=x[h*32+i],b=x[h*32+i+16],c=co[p*16+i],s=si[p*16+i];x[h*32+i]=sat(r(a*c-b*s,32768));x[h*32+i+16]=sat(r(b*c+a*s,32768));}return x;}
    function kv(x){const y=new Int32Array(128);for(let h=0;h<4;h++){const [q,m]=quant(x.slice(h*32,h*32+32));for(let i=0;i<32;i++)y[h*32+i]=sat(r(q[i]*m,127));}return y;}
    const exp=delta=>{const j=r(delta,64);return j>1024?0:ex[j];};
    function attention(q,k,v,p){const out=new Int32Array(128);
      for(let h=0;h<4;h++){const scores=new Int32Array(p+1);let maximum=-2147483648;
        for(let s=0;s<=p;s++){let dot=0;for(let i=0;i<32;i++)dot+=q[h*32+i]*k[s][h*32+i];scores[s]=r(r(dot,4096)*46341,262144);maximum=Math.max(maximum,scores[s]);}
        const ws=Int32Array.from(scores,s=>exp(maximum-s));let den=0;for(const a of ws)den+=a;
        for(let i=0;i<32;i++){let a=0;for(let s=0;s<=p;s++)a+=ws[s]*v[s][h*32+i];out[h*32+i]=sat(r(a,den));}
      }return out;}
    function forward(ids,progress=()=>{}) {
      const t=ids.length;if(t<1||t>32||ids.some(x=>!Number.isInteger(x)||x<0||x>=192))throw Error("Token bounds");
      const x=ids.map(id=>Int32Array.from(emb.slice(id*128,id*128+128),v=>sat(r(v*es[id],4096))));
      const trace=[...x.flatMap(v=>Array.from(v))];
      for(let l=0;l<5;l++){
        progress(l,"RMSNorm → 三值 K/V → RoPE → KV8");
        const k=[],v=[];for(let p=0;p<t;p++){const h=norm(x[p],2*l);k.push(kv(rope(linear(h,l,1),p)));v.push(kv(linear(h,l,2)));}
        progress(l,"三值 Q → 注意力 / exp 表 → O → SiLU / FFN → 残差");
        for(let p=0;p<t;p++){
          const q=rope(linear(norm(x[p],2*l),l,0),p),a=linear(attention(q,k,v,p),l,3);
          for(let i=0;i<128;i++)x[p][i]=sat(x[p][i]+a[i]);
          const h=norm(x[p],2*l+1),g=linear(h,l,4),u=linear(h,l,5),ff=new Int32Array(336);
          for(let i=0;i<336;i++){const j=Math.min(1024,r(Math.abs(g[i]),64)),s=g[i]<0?65536-sig[j]:sig[j];ff[i]=sat(r(sat(r(g[i]*s,65536))*u[i],4096));}
          const d=linear(ff,l,6);for(let i=0;i<128;i++)x[p][i]=sat(x[p][i]+d[i]);
        }trace.push(...x.flatMap(v=>Array.from(v)));
      }
      progress(5,"最终 RMSNorm → E8 共享输出头 → 采样");
      const logits=new Int32Array(t*192);
      for(let p=0;p<t;p++){const [q,m]=quant(norm(x[p],10));for(let j=0;j<192;j++){let dot=0;for(let i=0;i<128;i++)dot+=q[i]*emb[j*128+i];logits[p*192+j]=r(r(dot*m,127)*es[j],16777216);}}
      return {logits,trace:Int32Array.from(trace)};
    }
    function pick(logits,random,sample) {
      const order=Array.from({length:192},(_,i)=>i).sort((a,b)=>logits[b]-logits[a]||a-b);
      if(!sample)return order[0];const ws=order.slice(0,40).map(i=>exp(r(5*(logits[order[0]]-logits[i]),4)));
      const total=ws.reduce((a,b)=>a+b,0);
      // Exact product divided by 2^32, using 16-bit limbs (<2^53 each).
      const low=(random%65536)*total, high=Math.floor(random/65536)*total;
      let at=Math.floor((high+Math.floor(low/65536))/65536);
      for(let i=0;i<40;i++){if(at<ws[i])return order[i];at-=ws[i];}return order[39];
    }
    return {forward,pick};
  }
  function encode(text,tokenizer) {
    const clean=text.replace(/ +/g," ").replace(/^ | $/g,"");if(!clean)return [1];
    const s=Array.from("▁"+clean.replace(/ /g,"▁"));
    const best=Array(s.length+1).fill(-Infinity),back=Array(s.length+1);best[0]=0;
    for(let i=0;i<s.length;i++) {
      let single=false;
      for(let id=4;id<192;id++){
        const piece=Array.from(tokenizer.pieces[id]);if(piece.length===1&&piece[0]===s[i])single=true;
        if(piece.every((c,j)=>s[i+j]===c)){
          const end=i+piece.length,score=best[i]+tokenizer.scores[id];
          if(score>best[end]){best[end]=score;back[end]=[i,id];}
        }
      }
      if(!single){const score=best[i]+tokenizer.unknown;if(score>best[i+1]){best[i+1]=score;back[i+1]=[i,3];}}
    }
    const ids=[];for(let i=s.length;i>0;){const [p,id]=back[i];ids.push(id);i=p;}ids.reverse();
    return [1,...ids.filter((id,i)=>id!==3||i===0||ids[i-1]!==3)];
  }
  function decode(ids,tokenizer){return ids.filter(i=>i>2).map(i=>i===3?" ⁇ ":tokenizer.pieces[i]).join("").replace(/▁/g," ").replace(/^ /,"");}
  globalThis.IntC16={load,r,isqrt,encode,decode};
})();
