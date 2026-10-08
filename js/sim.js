/* Simulation: world, plants, frog, pads, fish, bugs, game rules. Exposes the global `Pond`. */

// ======================================================================
// WORLD: terrain, plants, trees, bushes
// ======================================================================
const Pond=(()=>{
'use strict';
/* ============================== utilities ============================== */
const TAU=Math.PI*2;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const madd=(a,b,s)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vlen=a=>Math.hypot(a[0],a[1],a[2]);
const nrm=a=>{const l=vlen(a)||1;return[a[0]/l,a[1]/l,a[2]/l];};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const srgb=c=>[Math.pow(c[0],2.2),Math.pow(c[1],2.2),Math.pow(c[2],2.2)];
function mb(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const rr=(R,a,b)=>a+R()*(b-a);
function rotAxis(v,ax,ang){const c=Math.cos(ang),s=Math.sin(ang),d=dot(ax,v)*(1-c),cr=crs(ax,v);
  return[v[0]*c+cr[0]*s+ax[0]*d,v[1]*c+cr[1]*s+ax[1]*d,v[2]*c+cr[2]*s+ax[2]*d];}
function quatFromAxes(x,y,z){
  const m00=x[0],m10=x[1],m20=x[2],m01=y[0],m11=y[1],m21=y[2],m02=z[0],m12=z[1],m22=z[2];
  const tr=m00+m11+m22;let qw,qx,qy,qz;
  if(tr>0){const s=Math.sqrt(tr+1)*2;qw=s/4;qx=(m21-m12)/s;qy=(m02-m20)/s;qz=(m10-m01)/s;}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;qw=(m21-m12)/s;qx=s/4;qy=(m01+m10)/s;qz=(m02+m20)/s;}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;qw=(m02-m20)/s;qx=(m01+m10)/s;qy=s/4;qz=(m12+m21)/s;}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;qw=(m10-m01)/s;qx=(m02+m20)/s;qy=(m12+m21)/s;qz=s/4;}
  const l=Math.hypot(qx,qy,qz,qw)||1;return[qx/l,qy/l,qz/l,qw/l];
}
const smooth3=(a,b,x)=>sstep(a,b,x);

/* ============================== world (mirrors the shaders) ============================== */
const GS=9,PCx=0,PCz=0,WATER_Y=0,WG=9;
let rand=mb(7);
function pondD(x,z){
  const qx=x-PCx,qz=z-PCz,ang=Math.atan2(qz,qx);
  let r=Math.hypot(qx/2.7,qz/1.95);
  r*=1+0.14*Math.sin(ang*3+1)+0.09*Math.sin(ang*5+2)+0.05*Math.sin(ang*7+0.5);
  return (r-1)*2.1;
}
function baseH(x,z){return 0.30+0.10*Math.sin(x*0.21+1.3)*Math.cos(z*0.17)+0.06*Math.sin(x*0.5+z*0.37)+0.03*Math.sin(x*1.3+z*1.1);}
function terrainH(x,z){
  const d=pondD(x,z),b=baseH(x,z);
  const basin=1-sstep(-0.9,0.9,d);
  const rim=0.06*Math.exp(-Math.pow((d-0.5)/0.6,2));
  const deep=1-sstep(-2.0,-0.2,d);
  const bottom=-0.12-0.5*deep+0.04*Math.sin(x*2.1)*Math.sin(z*1.7);
  return lerp(b+rim,bottom,basin);
}
const PATH=[[300,300],[301,300],[302,300],[303,300],[304,300],[305,300],[306,300],[307,300]];
function pathD(x,z){
  let best=1e9;
  for(let i=0;i<PATH.length-1;i++){
    const a=PATH[i],b=PATH[i+1],abx=b[0]-a[0],abz=b[1]-a[1];
    const t=clamp(((x-a[0])*abx+(z-a[1])*abz)/(abx*abx+abz*abz),0,1);
    best=Math.min(best,Math.hypot(x-(a[0]+abx*t),z-(a[1]+abz*t)));
  }
  return best;
}
const BEDS=[[-4,2.9,2.0,1.4],[3.6,3.4,2.2,1.4],[-4.3,-3.0,1.9,1.6],[4.4,-2.8,1.8,1.5]];
function bedMask(x,z){
  let m=0;
  for(let i=0;i<4;i++){
    const b=BEDS[i],qx=(x-b[0])/b[2],qz=(z-b[1])/b[3];
    const r=Math.hypot(qx,qz)*(1+0.18*Math.sin(Math.atan2(qz,qx)*4+i));
    m=Math.max(m,1-sstep(0.82,1.05,r));
  }
  return m;
}
/* ============================== state ============================== */
const S={wind:0.2,rain:0,tod:9.5,weather:'Sunny',growth:1,gravity:9.81,strength:1,paused:false,auto:true,activity:1,ripple:1,density:1,cloud:0.1,seed:1234};
const W={t:0,wind:0.24,rain:0,wet:0,cover:0.25,storm:0,flash:0,flashT:5,boltAz:0,dx:0.8,dz:0.6,hour:10,cloudOff:[0,0],night:0,
  sunDir:[0,1,0],moonDir:[0,-1,0],camPos:[0,2,8],camFocus:[0,0],cursor:null,player:null,pointerDown:false,ripples:[],pushers:[]};
const wind={dx:0.8,dz:0.6,s:0.24};
function windAt(x,y,z,t){
  const s=wind.s;
  const g1=Math.sin(x*0.31+z*0.22-t*1.1*(0.6+s));
  const g2=Math.sin(-x*0.17+z*0.41-t*1.9*(0.6+s)+1.7);
  const g3=Math.sin(x*0.8+z*0.6-t*3.4*(0.5+s)+y*1.3);
  const gust=0.55+0.30*g1+0.20*g2;
  const m=s*(gust+0.12*g3*(0.3+s));
  return[wind.dx*m-wind.dz*0.25*s*g2,0,wind.dz*m+wind.dx*0.25*s*g2];
}
let plants=[],trees=[],bushes=[],rocks=[],objs=[],debris=[],creatures=[],flies=[],drops=[],pads=[],floaters=[],planks=[],pebbles=[],grab=null;

/* ============================== output buffers ============================== */
const MAXL=8000,MAXP=1400,MAXB=900,MAXTV=40000,MAXTI=120000;
const LF=new Float32Array(MAXL*24),PTL=new Float32Array(MAXP*24),PDL=new Float32Array(64*24);
const BLB=new Float32Array(MAXB*16),TVB=new Float32Array(MAXTV*9),TIB=new Uint32Array(MAXTI),BBB=new Float32Array(600*8);
const cnt={leaf:0,petal:0,pad:0,blob:0,tv:0,ti:0,bb:0};
function pushLeaf(buf,k,px,py,pz,size,F,curl,R,fl,c1,kind,c2,seed,asp,wet,follow){
  const o=k*24;
  buf[o]=px;buf[o+1]=py;buf[o+2]=pz;buf[o+3]=size;buf[o+4]=F[0];buf[o+5]=F[1];buf[o+6]=F[2];buf[o+7]=curl;
  buf[o+8]=R[0];buf[o+9]=R[1];buf[o+10]=R[2];buf[o+11]=fl;buf[o+12]=c1[0];buf[o+13]=c1[1];buf[o+14]=c1[2];buf[o+15]=kind;
  buf[o+16]=c2[0];buf[o+17]=c2[1];buf[o+18]=c2[2];buf[o+19]=seed;buf[o+20]=asp;buf[o+21]=wet;buf[o+22]=follow||0;buf[o+23]=0;
}
const addLeaf=(...a)=>{if(cnt.leaf<MAXL)pushLeaf(LF,cnt.leaf++,...a);};
const addPetal=(...a)=>{if(cnt.petal<MAXP)pushLeaf(PTL,cnt.petal++,...a);};
function addBlob(p,sx,sy,sz,kind,seed,q,col,disp){
  if(cnt.blob>=MAXB)return;const o=cnt.blob++*16;
  BLB[o]=p[0];BLB[o+1]=p[1];BLB[o+2]=p[2];BLB[o+3]=sx;BLB[o+4]=sy;BLB[o+5]=sz;BLB[o+6]=kind;BLB[o+7]=seed;
  BLB[o+8]=q[0];BLB[o+9]=q[1];BLB[o+10]=q[2];BLB[o+11]=q[3];BLB[o+12]=col[0];BLB[o+13]=col[1];BLB[o+14]=col[2];BLB[o+15]=disp;
}
const QI=[0,0,0,1];
function addBB(p,size,c,a){if(cnt.bb>=600)return;const o=cnt.bb++*8;BBB[o]=p[0];BBB[o+1]=p[1];BBB[o+2]=p[2];BBB[o+3]=size;BBB[o+4]=c[0];BBB[o+5]=c[1];BBB[o+6]=c[2];BBB[o+7]=a;}
/* tube builder: points -> smooth tube mesh */
function cr(a,b,c,d,t){const t2=t*t,t3=t2*t;return[0,1,2].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3));}
function addTube(P,r0,r1,mat,sides,vfrom,vto){
  const n=P.length;if(n<2)return;
  const C=[],Rd=[],V=[];
  for(let j=0;j<n-1;j++){
    const a=j>0?P[j-1]:[2*P[0][0]-P[1][0],2*P[0][1]-P[1][1],2*P[0][2]-P[1][2]];
    const b=P[j],c=P[j+1],d=j+2<n?P[j+2]:[2*c[0]-b[0],2*c[1]-b[1],2*c[2]-b[2]];
    for(let s=0;s<2;s++){const t=s/2;C.push(s===0?b:cr(a,b,c,d,t));const f=(j+t)/(n-1);Rd.push(lerp(r0,r1,f));V.push(lerp(vfrom,vto,f));}
  }
  C.push(P[n-1]);Rd.push(r1);V.push(vto);
  const rings=C.length;
  if(cnt.tv+rings*(sides+1)>=MAXTV||cnt.ti+(rings-1)*sides*6>=MAXTI)return;
  let T0=nrm(sub(C[1],C[0]));let ax=Math.abs(T0[1])<0.9?[0,1,0]:[1,0,0];
  let N=nrm(crs(T0,ax));N=nrm(crs(N,T0));
  const base=cnt.tv;
  for(let k=0;k<rings;k++){
    const a=C[Math.max(k-1,0)],b=C[Math.min(k+1,rings-1)];
    const T=nrm(sub(b,a));const dn=dot(N,T);N=nrm([N[0]-T[0]*dn,N[1]-T[1]*dn,N[2]-T[2]*dn]);const B=crs(T,N);
    for(let i=0;i<=sides;i++){
      const th=i/sides*TAU,ct=Math.cos(th),st=Math.sin(th);
      const dir=[N[0]*ct+B[0]*st,N[1]*ct+B[1]*st,N[2]*ct+B[2]*st];
      const o=cnt.tv++*9;
      TVB[o]=C[k][0]+dir[0]*Rd[k];TVB[o+1]=C[k][1]+dir[1]*Rd[k];TVB[o+2]=C[k][2]+dir[2]*Rd[k];
      TVB[o+3]=dir[0];TVB[o+4]=dir[1];TVB[o+5]=dir[2];TVB[o+6]=i/sides;TVB[o+7]=V[k];TVB[o+8]=mat;
    }
  }
  for(let k=0;k<rings-1;k++)for(let i=0;i<sides;i++){
    const a=base+k*(sides+1)+i,b=a+1,c=a+sides+1,d=c+1;
    TIB[cnt.ti++]=a;TIB[cnt.ti++]=c;TIB[cnt.ti++]=b;TIB[cnt.ti++]=b;TIB[cnt.ti++]=c;TIB[cnt.ti++]=d;
  }
}

/* ============================== chains (plants, branches) ============================== */
function makeChain(base,rest,omega,zeta,carry){
  return{base,rest,n:rest.length-1,d:rest.map(()=>[0,0,0]),v:rest.map(()=>[0,0,0]),omega,zeta,carry:carry===undefined?0.85:carry,
    pos:rest.map(r=>add(base,r)),len:rest.map((r,i)=>i?dist(r,rest[i-1]):0)};
}
function pushForce(x,y,z,out,hgtLimit){
  const ps=W.pushers;
  for(let k=0;k<ps.length;k++){
    const p=ps[k];const dx=x-p.x,dz=z-p.z,r=Math.hypot(dx,dz);
    if(r<p.r&&Math.abs(y-p.y)<p.h){
      const f=(1-r/p.r),dirx=dx/(r||1),dirz=dz/(r||1),s=p.s*S.strength*f*f;
      out[0]+=dirx*s*140+p.vx*f*30*Math.min(p.s,1.5);out[2]+=dirz*s*140+p.vz*f*30*Math.min(p.s,1.5);out[1]+=Math.abs(p.vy||0)*f*8;
    }
  }
}
function stepChain(ch,h,windScale,wetLoad,grabNode,grabTarget){
  const n=ch.n,t=W.t;
  for(let i=1;i<=n;i++){
    const fr=i/n;
    const pos=ch.pos[i];
    const w=windAt(pos[0],pos[1],pos[2],t);
    const F=[w[0]*windScale*(0.35+0.65*fr),w[1],w[2]*windScale*(0.35+0.65*fr)];
    pushForce(pos[0],pos[1],pos[2],F,1.4);
    F[1]-=wetLoad*fr*4;
    const k=ch.omega*ch.omega*(1-0.5*fr);
    const dp=ch.d[i-1];
    const ex=ch.d[i][0]-ch.carry*dp[0],ey=ch.d[i][1]-ch.carry*dp[1],ez=ch.d[i][2]-ch.carry*dp[2];
    F[0]-=k*ex;F[1]-=k*ey;F[2]-=k*ez;
    if(i>1){ch.v[i-1][0]+=ch.carry*k*ex*h;ch.v[i-1][1]+=ch.carry*k*ey*h;ch.v[i-1][2]+=ch.carry*k*ez*h;}
    const c=2*ch.zeta*ch.omega;
    F[0]-=c*ch.v[i][0];F[1]-=c*ch.v[i][1];F[2]-=c*ch.v[i][2];
    if(grabNode===i&&grabTarget){const gk=260;F[0]+=gk*(grabTarget[0]-pos[0])-14*ch.v[i][0];F[1]+=gk*(grabTarget[1]-pos[1])-14*ch.v[i][1];F[2]+=gk*(grabTarget[2]-pos[2])-14*ch.v[i][2];}
    ch.v[i][0]+=F[0]*h;ch.v[i][1]+=F[1]*h;ch.v[i][2]+=F[2]*h;
  }
  for(let i=1;i<=n;i++){
    const d=ch.d[i],v=ch.v[i];d[0]+=v[0]*h;d[1]+=v[1]*h;d[2]+=v[2]*h;
    const m=Math.hypot(d[0],d[1],d[2]);if(m>ch.maxD){const s=ch.maxD/m;d[0]*=s;d[1]*=s;d[2]*=s;}
  }
  for(let i=1;i<=n;i++){
    ch.pos[i]=[ch.base[0]+ch.rest[i][0]+ch.d[i][0],ch.base[1]+ch.rest[i][1]+ch.d[i][1],ch.base[2]+ch.rest[i][2]+ch.d[i][2]];
  }
  ch.pos[0]=ch.base.slice();
  for(let i=1;i<=n;i++){
    const par=ch.pos[i-1],p=ch.pos[i];const d=sub(p,par),l=vlen(d)||1e-6;
    const q=madd(par,d,ch.len[i]/l);
    ch.d[i][0]+=q[0]-p[0];ch.d[i][1]+=q[1]-p[1];ch.d[i][2]+=q[2]-p[2];ch.pos[i]=q;
  }
}
function chainPoint(ch,s){
  const f=clamp(s,0,1)*ch.n,i=Math.min(Math.floor(f),ch.n-1),t=f-i;
  const a=ch.pos[i],b=ch.pos[i+1];
  return{p:lerp3(a,b,t),tan:nrm(sub(b,a)),i,t};
}
const lerp3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
function perpFrame(F){
  let R=crs(F,[0,1,0]);if(vlen(R)<0.05)R=crs(F,[1,0,0]);R=nrm(R);return R;
}

/* ============================== plants ============================== */
const SPEC={
  tulip:{n:5,H:[0.36,0.52],r:0.0065,omega:10,leaves:4,leafKind:4,leafLen:[0.2,0.3],asp:0.4,base:true,petals:6,pk:1,psize:0.06,pasp:1.1,cup:true,hd:0.02,
    cols:[[[0.45,0.02,0.05],[0.92,0.12,0.14]],[[0.85,0.35,0.5],[1,0.72,0.82]],[[0.85,0.6,0.05],[1,0.88,0.25]],[[0.9,0.55,0.15],[1,0.4,0.1]],[[0.4,0.1,0.5],[0.7,0.35,0.85]]],lc:[[0.06,0.18,0.07],[0.22,0.42,0.14]]},
  daisy:{n:5,H:[0.28,0.42],r:0.004,omega:11,leaves:6,leafKind:0,leafLen:[0.06,0.1],asp:0.5,petals:15,pk:6,psize:0.046,pasp:0.5,cup:false,hd:0.008,center:[0.9,0.65,0.05],cr:0.02,
    cols:[[[1,0.93,0.55],[1,1,1]],[[0.95,0.85,0.5],[1,0.98,0.9]]],lc:[[0.07,0.2,0.06],[0.2,0.4,0.12]]},
  cosmos:{n:7,H:[0.7,1.0],r:0.0045,omega:8,leaves:9,leafKind:4,leafLen:[0.09,0.14],asp:0.12,petals:8,pk:7,psize:0.07,pasp:0.9,cup:false,hd:0.01,center:[0.9,0.7,0.1],cr:0.015,
    cols:[[[0.7,0.1,0.3],[1,0.5,0.7]],[[0.95,0.8,0.85],[1,0.95,0.97]],[[0.8,0.1,0.5],[1,0.4,0.75]],[[0.9,0.45,0.15],[1,0.7,0.2]]],lc:[[0.08,0.22,0.07],[0.22,0.42,0.12]]},
  lavender:{n:5,H:[0.45,0.65],r:0.003,omega:9,leaves:10,leafKind:4,leafLen:[0.12,0.2],asp:0.1,base:true,spike:true,cols:[[[0.28,0.16,0.55],[0.5,0.35,0.8]]],lc:[[0.2,0.28,0.18],[0.42,0.5,0.34]]},
  sunflower:{n:8,H:[1.1,1.55],r:0.011,omega:6,leaves:8,leafKind:5,leafLen:[0.18,0.28],asp:0.75,petals:20,pk:6,psize:0.1,pasp:0.5,cup:false,hd:0.04,center:[0.2,0.1,0.04],cr:0.06,face:true,
    cols:[[[0.9,0.5,0.03],[1,0.82,0.1]]],lc:[[0.07,0.2,0.05],[0.2,0.4,0.1]]},
  buttercup:{n:4,H:[0.16,0.26],r:0.0028,omega:12,leaves:5,leafKind:0,leafLen:[0.04,0.07],asp:0.6,petals:5,pk:1,psize:0.026,pasp:1.0,cup:true,hd:0.006,center:[0.95,0.8,0.1],cr:0.007,
    cols:[[[0.9,0.65,0.02],[1,0.9,0.15]]],lc:[[0.07,0.2,0.06],[0.22,0.42,0.12]]},
  hosta:{n:1,H:[0.32,0.4],r:0.004,omega:12,leaves:9,leafKind:5,leafLen:[0.2,0.3],asp:0.7,rosette:true,lc:[[0.1,0.25,0.18],[0.4,0.55,0.35]]},
  fern:{n:1,H:[0.45,0.6],r:0.004,omega:12,leaves:11,leafKind:4,leafLen:[0.3,0.45],asp:0.22,rosette:true,lc:[[0.06,0.2,0.05],[0.28,0.5,0.14]]},
  grass:{n:1,H:[0.55,0.8],r:0.004,omega:7,leaves:16,leafKind:4,leafLen:[0.45,0.7],asp:0.05,rosette:true,lc:[[0.15,0.28,0.07],[0.55,0.62,0.28]]}
};
const PLAN=[['daisy',9],['buttercup',9],['cosmos',4],['lavender',5],['hosta',4],['fern',6],['grass',6]];
function randInBed(R,bi){
  for(let k=0;k<60;k++){
    const b=BEDS[bi],a=R()*TAU,r=Math.sqrt(R())*0.82;
    const x=b[0]+Math.cos(a)*r*b[2],z=b[1]+Math.sin(a)*r*b[3];
    if(pathD(x,z)>0.9&&pondD(x,z)>1.2)return[x,z];
  }
  return[BEDS[bi][0],BEDS[bi][1]];
}
function buildPlants(){
  const R=mb(1234);plants=[];
  let idx=0;
  for(const [name,count] of PLAN){
    const sp=SPEC[name];
    for(let c=0;c<count;c++){
      let pos=null;
      for(let tries=0;tries<40;tries++){
        const bi=(sp.rosette||name==='lavender'?(idx%4):((idx*3+c)%4));
        const p=randInBed(R,bi);
        if(plants.every(q=>Math.hypot(q.x-p[0],q.z-p[1])>(sp.rosette?0.55:0.4))){pos=p;break;}
      }
      if(!pos)pos=randInBed(R,idx%4);
      plants.push(makePlant(name,sp,pos[0],pos[1],R));idx++;
    }
  }
}
function makePlant(name,sp,x,z,R){
  const H=rr(R,sp.H[0],sp.H[1])*1.25;
  const base=[x,terrainH(x,z),z];
  const g=0.25+R()*0.75;
  const n=sp.n;
  const lx=(R()-0.5)*0.25,lz=(R()-0.5)*0.25;
  const rest=[];for(let i=0;i<=n;i++){const f=i/n;rest.push([lx*f*f*H,H*f,lz*f*f*H]);}
  const p={name,sp,x,z,base,H,g,gv:0.6+R()*0.8,n,lx,lz,rest,ch:null,leaves:[],flower:null,seed:R()*100,wet:0,area:1.0};
  const lc=sp.lc;
  const vary=()=>[rr(R,-0.04,0.04),rr(R,-0.05,0.05),rr(R,-0.03,0.03)];
  const lv=vary();
  const c1=srgb([lc[0][0]+lv[0],lc[0][1]+lv[1],lc[0][2]+lv[2]]),c2=srgb([lc[1][0]+lv[0],lc[1][1]+lv[1],lc[1][2]+lv[2]]);
  p.lc1=c1;p.lc2=c2;
  const nl=sp.leaves;
  for(let i=0;i<nl;i++){
    const f=i/Math.max(nl-1,1);
    let s,pitch;
    if(sp.rosette||sp.base&&i<nl*0.6){s=0.0+R()*0.06;pitch=rr(R,0.2,1.1);}
    else{s=0.08+f*0.8;pitch=rr(R,0.2,0.9);}
    const gold=sp.rosette?(R()*0.5):0;
    p.leaves.push({s,az:i*2.399963+R()*0.5,pitch,len:rr(R,sp.leafLen[0],sp.leafLen[1])*1.2*(sp.rosette?1:1-0.3*s),asp:sp.asp*rr(R,0.9,1.15),curl:rr(R,0.05,0.3)*(sp.rosette?2:1),
      thr:sp.rosette?R()*0.6:0.1+f*0.6,fl:0,flv:0,fph:R()*TAU,roll:rr(R,-0.5,0.5)});
  }
  if(sp.cols){
    const col=sp.cols[Math.floor(R()*sp.cols.length)];
    p.flower={c1:srgb(col[0]),c2:srgb(col[1]),open:0,life:0,phase:R()*100,openAt:R()*0.5,tilt:[0,0],tv:[0,0],picked:false,regrow:0,
      size:rr(R,0.9,1.15),stage:1,age:20+R()*60,shed:false};
    p.flower.open=0.55+R()*0.45;
  }
  p.ch=makeChain(base,rest.map(r=>r.map(v=>v)),sp.omega*rr(R,0.9,1.1),0.13,0.85);
  p.ch.maxD=Math.max(0.35,H*0.45);
  rebuildChainRest(p);
  return p;
}
function rebuildChainRest(p){
  const g=p.g,Hs=p.H*(0.25+0.75*g);
  for(let i=0;i<=p.n;i++){const f=i/p.n;p.ch.rest[i]=[p.lx*f*f*Hs,Hs*f,p.lz*f*f*Hs];}
  p.ch.len=p.ch.rest.map((r,i)=>i?dist(r,p.ch.rest[i-1]):0);
}
let petalDrop=0;
function updatePlants(dt){
  const t=W.t;
  const h=dt/2;
  for(const p of plants){
    if(p.g<1){p.g=Math.min(1,p.g+dt*0.0035*S.growth*p.gv);if((Math.floor(p.g*200)&3)===0)rebuildChainRest(p);}
    const f=p.flower;
    if(f){
      if(f.picked){f.regrow-=dt*S.growth;if(f.regrow<=0){f.picked=false;f.open=0;f.age=0;f.shed=false;}}
      else{
        f.age+=dt*S.growth;
        const bloomTarget=p.g>0.8?1:0;
        const cyc=f.age;
        if(cyc<8)f.open+=(0-f.open)*dt*0.5; // bud
        if(cyc>=8&&cyc<50&&bloomTarget)f.open=Math.min(1,f.open+dt*0.04);
        if(cyc>=130&&!f.shed){f.shed=true;shedPetals(p);}
        if(cyc>=130)f.open=Math.max(0,f.open-dt*0.1);
        if(cyc>=150){f.age=0;f.shed=false;f.open=0;}
        if(f.stage&&cyc<8){f.age=Math.max(f.age,8.5);}
      }
    }
    p.wet+=(W.wet-p.wet)*dt*0.3;
    const grabNode=grab&&grab.kind==='plant'&&grab.plant===p?grab.node:-1;
    const gt=grabNode>=0?grab.target:null;
    for(let s=0;s<2;s++)stepChain(p.ch,h,p.sp.rosette?6:20,p.wet*0.6,grabNode,gt);
    // flower head independent spring
    if(f&&!f.picked){
      const top=p.ch.pos[p.n];const w=windAt(top[0],top[1],top[2],t+0.7);
      const tv=p.ch.v[p.n];
      const kk=60,cc=4;
      for(let a=0;a<2;a++){
        const wi=a===0?w[0]:w[2],vi=a===0?tv[0]:tv[2];
        f.tv[a]+=(-kk*f.tilt[a]-cc*f.tv[a]+wi*14-vi*3.5)*dt;
        f.tilt[a]+=f.tv[a]*dt;f.tilt[a]=clamp(f.tilt[a],-1,1);
      }
    }
    // leaf springs
    const w0=windAt(p.x,p.ch.pos[Math.min(1,p.n)][1],p.z,t);
    const wm=Math.hypot(w0[0],w0[2]);
    for(const lf of p.leaves){
      const target=Math.sin(t*(2.2+lf.fph*0.3)+lf.fph)*wm*0.45+wm*0.2;
      lf.flv+=(-30*(lf.fl-target)-3.2*lf.flv)*dt;lf.fl+=lf.flv*dt;
      const tv=p.ch.v[p.n];lf.flv+=(tv[1]*0.8)*dt*3;
    }
  }
}
function shedPetals(p){
  const f=p.flower;if(!f)return;
  const top=p.ch.pos[p.n];
  const k=Math.min(p.sp.petals||6,6);
  for(let i=0;i<k;i++)spawnDebris(1,[top[0]+(rand()-0.5)*0.05,top[1]+0.02,top[2]+(rand()-0.5)*0.05],f.c1,f.c2,0.04);
}
function flowerFrame(p){
  const f=p.flower,top=p.ch.pos[p.n];
  const tan=nrm(sub(p.ch.pos[p.n],p.ch.pos[Math.max(p.n-1,0)]));
  let axis=nrm([tan[0]+f.tilt[0]*0.8,tan[1]+ (p.sp.face?0.25:0.9),tan[2]+f.tilt[1]*0.8]);
  if(p.sp.face){const sd=W.sunDir;const sdh=nrm([sd[0],0.25,sd[2]]);axis=nrm(add(mul(axis,0.5),mul(sdh,0.9*clamp(W.sunDir[1]*3,0,1))));}
  else axis=nrm([tan[0]+f.tilt[0]*0.8,tan[1]+0.9,tan[2]+f.tilt[1]*0.8]);
  const e1=perpFrame(axis);const e2=crs(axis,e1);
  return{top,axis,e1:nrm(e1),e2:nrm(e2),tan};
}

/* ----- emit plant geometry ----- */
function emitPlant(p){
  const sp=p.sp,g=p.g,ch=p.ch;
  if(sp.n>1||!sp.rosette){
    const P=ch.pos.slice();
    addTube(P,sp.r*(0.4+0.7*g),sp.r*0.55*(0.4+0.7*g),sp.spike?3:0,6,0,1);
  }
  const wetc=p.wet;
  for(const lf of p.leaves){
    const sc=sstep(lf.thr,lf.thr+0.25,g)*(0.3+0.7*g);
    if(sc<0.02)continue;
    const pt=chainPoint(ch,lf.s);
    const az=lf.az;
    let pitch=lf.pitch-wetc*0.3+lf.fl;
    if(sp.rosette)pitch=lf.pitch*(0.7+0.3*g)-wetc*0.25+lf.fl+0.0;
    let F=[Math.cos(az)*Math.cos(pitch),Math.sin(pitch),Math.sin(az)*Math.cos(pitch)];
    const dev=sub(pt.tan,[0,1,0]);F=nrm(add(F,mul(dev,0.55)));
    let R=perpFrame(F);
    const N0=crs(R,F);
    const cr=Math.cos(lf.roll),sr=Math.sin(lf.roll);
    R=nrm([R[0]*cr+N0[0]*sr,R[1]*cr+N0[1]*sr,R[2]*cr+N0[2]*sr]);
    const attach=pt.p;
    addLeaf(attach[0],attach[1],attach[2],lf.len*sc,F,lf.curl+wetc*0.12+Math.abs(lf.fl)*0.2,R,0.3+Math.abs(lf.fl)*2,p.lc1,sp.leafKind,p.lc2,p.seed+lf.fph,lf.asp,wetc);
  }
  const f=p.flower;
  if(!f||f.picked)return;
  emitFlower(p,f);
}
function emitFlower(p,f){
  const sp=p.sp;
  const fr=flowerFrame(p);
  const open=f.open*sstep(0.55,0.95,p.g)*(W.dayOpen===undefined?1:W.dayOpen);
  if(open<=0.001&&!sp.spike){
    // bud
    if(p.g>0.5)addBlob(madd(fr.top,fr.axis,0.012),0.012,0.02,0.012,1,p.seed,quatFromAxes(fr.e1,fr.axis,fr.e2),f.c1,0.12);
    return;
  }
  if(sp.spike){
    // lavender buds along the top of the stem
    const ch=p.ch,nb=16;
    for(let i=0;i<nb;i++){
      const s=0.62+0.38*(i/nb),pt=chainPoint(ch,s);
      const a=i*2.4+p.seed;const rad=0.012*(1-0.4*i/nb);
      const pos=add(pt.p,[Math.cos(a)*rad,0,Math.sin(a)*rad]);
      const tone=0.5+0.5*Math.sin(i*1.7+p.seed);
      const col=[lerp(f.c1[0],f.c2[0],tone),lerp(f.c1[1],f.c2[1],tone),lerp(f.c1[2],f.c2[2],tone)];
      const sc=sstep(0.7,1.0,p.g)*(0.011*(1-0.3*i/nb));
      if(sc>0.001)addBlob(pos,sc,sc*1.6,sc,1,p.seed+i,quatFromAxes(nrm(crs(pt.tan,[0,0,1])),pt.tan,[0,0,1]),col,0.15);
    }
    return;
  }
  const c=sp.petals,sz=sp.psize*1.3*f.size*(0.3+0.7*open);
  const oAng=sp.cup?lerp(0.18,0.75,open):lerp(0.12,1.5,open);
  for(let k=0;k<c;k++){
    const phi=k/c*TAU+p.seed+Math.sin(k*3.1+p.seed)*0.08;
    const ring=(sp.pk===6&&c>12&&k%2)?0.85:1;
    const ang=oAng*(1+0.12*Math.sin(k*5.3+p.seed))*(ring===1?1:0.85)+f.tilt[0]*0.0;
    const dir=add(mul(fr.e1,Math.cos(phi)),mul(fr.e2,Math.sin(phi)));
    const F=nrm(add(mul(fr.axis,Math.cos(ang)),mul(dir,Math.sin(ang))));
    let R=nrm(crs(fr.axis,F));if(vlen(R)<0.01)R=fr.e1;
    const root=madd(fr.top,fr.axis,sp.hd*0.3);
    addPetal(root[0],root[1],root[2],sz*ring*(1+0.1*Math.sin(k*7.7)),F,sp.cup?0.02:0.12+0.1*(1-open),R,0.2,f.c1,sp.pk,f.c2,p.seed+k*0.37,sp.pasp,p.wet,0);
  }
  if(sp.center){
    const cc=sp.center,cs=sp.cr*1.3*f.size*(0.5+0.5*open);
    addBlob(madd(fr.top,fr.axis,sp.hd*0.35),cs,cs*0.5,cs,2,p.seed,quatFromAxes(fr.e1,fr.axis,fr.e2),srgb(cc),0.12);
  }else if(sp.cup){
    const cs=0.012*open;
    if(cs>0.002)addBlob(madd(fr.top,fr.axis,0.012),cs,cs*1.4,cs,1,p.seed,quatFromAxes(fr.e1,fr.axis,fr.e2),srgb([0.12,0.1,0.05]),0.1);
  }
}

/* ============================== trees ============================== */
function buildTrees(){
  const R=mb(777);trees=[];
  const defs=[{x:-5.6,z:-4.4,H:3.0,bark:1,l1:srgb([0.18,0.34,0.07]),l2:srgb([0.45,0.56,0.12]),leafN:38,lsize:[0.13,0.19],name:'birch'},
              {x:5.8,z:-4.8,H:2.6,bark:2,l1:srgb([0.12,0.3,0.06]),l2:srgb([0.4,0.5,0.1]),leafN:38,lsize:[0.12,0.17],name:'willow'}];
  for(const d of defs){
    const base=[d.x,terrainH(d.x,d.z),d.z];
    const tr={...d,base,branches:[],leaves:[],seed:R()*50};
    // trunk
    const tn=7,rest=[];for(let i=0;i<=tn;i++){const f=i/tn;rest.push([Math.sin(f*3+d.x)*0.18*f,d.H*0.78*f,Math.cos(f*2.4+d.z)*0.14*f]);}
    const trunk=makeChain(base,rest,13,0.2,0.9);trunk.maxD=0.4;trunk.r0=0.085;trunk.r1=0.04;trunk.radius=0.1;
    tr.trunk=trunk;
    const nb=6;
    for(let b=0;b<nb;b++){
      const f=0.45+0.5*(b/(nb-1));
      const ti=Math.floor(f*tn);
      const origin=add(base,trunk.rest[ti]);
      const az=Math.atan2(-d.z,-d.x)+(b-2.5)*0.55+R()*0.35;
      const len=rr(R,1.1,1.7)*(1-0.35*(b/(nb-1)));
      const bn=5,br=[[0,0,0]];
      for(let i=1;i<=bn;i++){const ff=i/bn;const ang=0.35+0.5*ff;br.push([Math.cos(az)*Math.cos(ang)*len*ff*0.95,Math.sin(ang)*len*ff*0.55+ff*0.1,Math.sin(az)*Math.cos(ang)*len*ff*0.95]);}
      // branch root rests relative to the *trunk node*
      const bc=makeChain(origin,br,rr(R,6,8),0.14,0.9);bc.maxD=0.5;bc.r0=0.03;bc.r1=0.008;bc.ti=ti;bc.isBranch=true;bc.az=az;
      tr.branches.push(bc);
      for(let i=2;i<=bn;i++){
        for(let k=0;k<d.leafN;k++){
          tr.leaves.push({b,i:Math.min(i,bn),off:[rr(R,-0.22,0.22),rr(R,-0.12,0.18),rr(R,-0.22,0.22)],az:R()*TAU,pitch:rr(R,-0.5,0.8),size:rr(R,d.lsize[0],d.lsize[1]),
            ph:R()*TAU,fl:0,flv:0,roll:rr(R,-0.6,0.6),drop:R()});
        }
      }
    }
    tr.perches=tr.branches.map(b=>b);
    trees.push(tr);
  }
}
function updateTrees(dt){
  const h=dt/2;
  for(const tr of trees){
    const gT=grab&&grab.kind==='branch'&&grab.tree===tr;
    for(let s=0;s<2;s++){
      stepChain(tr.trunk,h,3,W.wet*0.3,-1,null);
      for(let b=0;b<tr.branches.length;b++){
        const bc=tr.branches[b];
        const ti=bc.ti;
        bc.base=tr.trunk.pos[ti].slice();
        const gn=gT&&grab.branch===b?grab.node:-1;
        stepChain(bc,h,9,W.wet*0.8,gn,gn>=0?grab.target:null);
      }
    }
  }
}
function emitTrees(){
  const t=W.t;
  for(const tr of trees){
    addTube(tr.trunk.pos,tr.trunk.r0,tr.trunk.r1,tr.bark,10,0,1);
    for(const bc of tr.branches){
      // connect branch to trunk
      const pts=bc.pos.slice();
      addTube(pts,bc.r0,bc.r1,tr.bark,6,0,1);
    }
    for(const lf of tr.leaves){
      const bc=tr.branches[lf.b];
      const node=bc.pos[lf.i];
      const w=windAt(node[0],node[1],node[2],t);
      const wm=Math.hypot(w[0],w[2]);
      const target=Math.sin(t*(3+lf.ph)+lf.ph*5)*wm*0.8;
      lf.flv+=(-40*(lf.fl-target)-3.5*lf.flv)*(1/60);lf.fl+=lf.flv*(1/60);
      const pitch=lf.pitch+lf.fl*0.8-W.wet*0.35;
      let F=[Math.cos(lf.az)*Math.cos(pitch),Math.sin(pitch),Math.sin(lf.az)*Math.cos(pitch)];
      let R=perpFrame(F);
      const N0=crs(R,F);const cr=Math.cos(lf.roll),sr=Math.sin(lf.roll);
      R=nrm([R[0]*cr+N0[0]*sr,R[1]*cr+N0[1]*sr,R[2]*cr+N0[2]*sr]);
      const pos=add(node,lf.off);
      addLeaf(pos[0],pos[1],pos[2],lf.size*sstep(0,0.3,1),F,0.25+W.wet*0.15,R,0.4+Math.abs(lf.fl)*2,tr.l1,0,tr.l2,tr.seed+lf.ph,0.62,W.wet);
    }
  }
}

/* ============================== bushes ============================== */
function buildBushes(){
  const R=mb(4242);bushes=[];
  const defs=[{x:-6.6,z:0.8,r:0.9,kind:'box',l1:srgb([0.04,0.14,0.05]),l2:srgb([0.12,0.30,0.10]),n:900,size:[0.11,0.16]},
              {x:6.4,z:1.2,r:1.0,kind:'hydra',l1:srgb([0.08,0.24,0.07]),l2:srgb([0.22,0.46,0.14]),n:560,size:[0.2,0.28],flower:srgb([0.88,0.5,0.72]),flower2:srgb([0.6,0.55,0.9])},
              {x:0.8,z:-6.4,r:1.0,kind:'berry',l1:srgb([0.06,0.2,0.05]),l2:srgb([0.2,0.4,0.1]),n:800,size:[0.11,0.16],berry:srgb([0.7,0.04,0.06])},
              {x:-2.2,z:6.4,r:0.9,kind:'box',l1:srgb([0.05,0.16,0.06]),l2:srgb([0.15,0.32,0.1]),n:900,size:[0.11,0.16]}];
  for(const d of defs){
    const b={...d,y:terrainH(d.x,d.z),o:[0,0,0],ov:[0,0,0],leaves:[],extras:[],seed:R()*50};
    for(let i=0;i<d.n;i++){
      let v;do{v=[R()*2-1,R()*2-1,R()*2-1];}while(vlen(v)>1||vlen(v)<0.2||v[1]<-0.55);
      const nn=nrm(v);const rad=d.r*(0.5+0.5*Math.cbrt(R()));
      const pos=[nn[0]*rad,Math.max(nn[1]*rad*0.85+d.r*0.4,0.05),nn[2]*rad];
      b.leaves.push({pos,n:nn,size:rr(R,d.size[0],d.size[1]),ph:R()*TAU,roll:rr(R,-0.6,0.6),az:R()*TAU,tilt:rr(R,-0.35,0.35)});
    }
    if(d.flower){for(let i=0;i<46;i++){let v;do{v=[R()*2-1,R()*0.9+0.1,R()*2-1];}while(vlen(v)>1||vlen(v)<0.6);const nn=nrm(v);
      b.extras.push({pos:[nn[0]*d.r*1.02,nn[1]*d.r*0.85+d.r*0.4,nn[2]*d.r*1.02],r:rr(R,0.05,0.08),col:R()<0.6?d.flower:d.flower2,ph:R()*TAU});}}
    if(d.berry){for(let i=0;i<60;i++){let v;do{v=[R()*2-1,R()*0.9+0.1,R()*2-1];}while(vlen(v)>1||vlen(v)<0.5);const nn=nrm(v);
      b.extras.push({pos:[nn[0]*d.r*0.95,nn[1]*d.r*0.85+d.r*0.4,nn[2]*d.r*0.95],r:0.022,col:d.berry,ph:R()*TAU});}}
    bushes.push(b);
  }
}
function updateBushes(dt){
  const t=W.t;
  for(const b of bushes){
    const w=windAt(b.x,1,b.z,t);
    const F=[w[0]*10,0,w[2]*10];
    const f2=[0,0,0];pushForce(b.x,0.6,b.z,f2,1.5);
    // pushers close to the bush surface
    for(const p of W.pushers){const dx=b.x-p.x,dz=b.z-p.z,r=Math.hypot(dx,dz);if(r<b.r+p.r&&r>0.01){const f=(1-r/(b.r+p.r));F[0]+=dx/r*f*f*p.s*S.strength*50;F[2]+=dz/r*f*f*p.s*S.strength*50;}}
    if(grab&&grab.kind==='bush'&&grab.bush===b){F[0]+=150*(grab.target[0]-(b.x+b.o[0]))*0.5;F[2]+=150*(grab.target[2]-(b.z+b.o[2]))*0.5;}
    for(let a=0;a<3;a+=2){b.ov[a]+=(F[a]-45*b.o[a]-3.2*b.ov[a])*dt;b.o[a]+=b.ov[a]*dt;b.o[a]=clamp(b.o[a],-0.35,0.35);}
  }
}
function emitBushes(){
  const t=W.t;
  for(const b of bushes){
    const sh=[b.o[0],0,b.o[2]];
    const wy=windAt(b.x,1,b.z,t);const wm=Math.hypot(wy[0],wy[2]);
    for(const lf of b.leaves){
      const sway=Math.sin(t*(2.6+lf.ph*0.4)+lf.ph*3)*(0.015+wm*0.05);
      const k=lf.pos[1]/(b.r*1.4);
      const pos=[b.x+lf.pos[0]+sh[0]*(0.3+k*0.9)+sway,b.y+lf.pos[1],b.z+lf.pos[2]+sh[2]*(0.3+k*0.9)+sway*0.6];
      const n=lf.n;
      let F=nrm([n[0]+Math.cos(lf.az)*0.35,n[1]*0.6+0.2+lf.tilt,n[2]+Math.sin(lf.az)*0.35]);
      let R=perpFrame(F);const N0=crs(R,F);const cr=Math.cos(lf.roll),sr=Math.sin(lf.roll);
      R=nrm([R[0]*cr+N0[0]*sr,R[1]*cr+N0[1]*sr,R[2]*cr+N0[2]*sr]);
      addLeaf(pos[0],pos[1],pos[2],lf.size,F,0.2+W.wet*0.15,R,0.3+wm*0.8*Math.abs(Math.sin(t*3+lf.ph)),b.l1,0,b.l2,b.seed+lf.ph,b.kind==='box'?0.85:0.7,W.wet);
    }
    for(const e of b.extras){
      const k=e.pos[1]/(b.r*1.4);
      const pos=[b.x+e.pos[0]+sh[0]*(0.3+k*0.9),b.y+e.pos[1],b.z+e.pos[2]+sh[2]*(0.3+k*0.9)];
      addBlob(pos,e.r,e.r*(b.kind==='berry'?1:0.8),e.r,1,e.ph,QI,e.col,b.kind==='berry'?0.05:0.25);
    }
  }
}

// ======================================================================
// FROG: rocks, particles, pads, frog state machine + geometry
// ======================================================================

/* ============================== rocks, pebbles, mushrooms, twigs ============================== */
function qmul(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function qnorm(q){const l=Math.hypot(...q)||1;return q.map(v=>v/l);}
function qyaw(a){return[0,Math.sin(a/2),0,Math.cos(a/2)];}
function makeObj(kind,p,r,col,sc,seed,floats){
  return{kind,p:p.slice(),v:[0,0,0],r,col,sc:sc||[r,r,r],seed,q:qyaw(seed*6),w:[0,0,0],held:false,floats:!!floats,inWater:false,age:0,rest:false,target:null};
}
let mushrooms=[],twigs=[],roots=[];
function landPoint(ang,minD,maxD){
  for(let r=2.2;r<6;r+=0.05){const x=Math.cos(ang)*r*1.1,z=Math.sin(ang)*r*0.85;const d=pondD(x,z);if(d>minD&&d<maxD)return[x,z];}
  return[Math.cos(ang)*4,Math.sin(ang)*3.4];
}
function buildRocks(){
  const R=mb(99);objs=[];
  const spots=[[0.3,0.55,0.42],[2.3,0.5,0.34],[3.6,0.4,0.3],[4.7,0.7,0.4],[5.6,0.45,0.26],[1.3,0.9,0.22]];
  for(const [ang,off,rad] of spots){
    const p=landPoint(ang,off-0.1,off+0.3);
    const sc=[rad*rr(R,0.9,1.3),rad*rr(R,0.55,0.85),rad*rr(R,0.85,1.2)];
    const g=0.3+R()*0.2;
    const o=makeObj('rock',[p[0],terrainH(p[0],p[1])+sc[1]*0.6,p[1]],Math.max(sc[0],sc[2])*0.9,[g*0.9+0.05,g*0.85+0.04,g*0.78+0.03].map(v=>Math.pow(v,2.2)*1.05),sc,R(),false);
    o.rest=true;o.big=rad;objs.push(o);
  }
  pebbles=[];
  for(let i=0;i<110;i++){
    const a=R()*TAU;let x=Math.cos(a)*R()*3.3*1.0,z=Math.sin(a)*R()*2.5;
    const d=pondD(x,z);if(d>1.4){i--;continue;}
    const rad=rr(R,0.02,d<-0.3?0.09:0.06),g=0.28+R()*0.3;
    pebbles.push({p:[x,terrainH(x,z)+rad*0.35,z],sc:[rad*rr(R,1,1.4),rad*0.6,rad],col:[g,g*0.93,g*0.85].map(v=>Math.pow(v,2.2)),seed:R()*10,q:qyaw(R()*6)});
  }
  mushrooms=[];
  for(const t of trees){for(let i=0;i<(t.name==='birch'?5:3);i++){const a=R()*TAU,r=rr(R,0.5,1.2);const x=t.base[0]+Math.cos(a)*r,z=t.base[2]+Math.sin(a)*r;if(pondD(x,z)<0.8)continue;
    mushrooms.push({p:[x,terrainH(x,z),z],h:rr(R,0.03,0.07),r:rr(R,0.025,0.05),col:R()<0.5?srgb([0.75,0.15,0.1]):srgb([0.7,0.55,0.35]),seed:R()*9});}}
  twigs=[];
  for(let i=0;i<14;i++){const a=R()*TAU,r=rr(R,2.6,6.5);const x=Math.cos(a)*r,z=Math.sin(a)*r*0.85;if(pondD(x,z)<0.6)continue;
    const dir=R()*TAU,L=rr(R,0.15,0.4);const p0=[x,terrainH(x,z)+0.01,z];const p1=[x+Math.cos(dir)*L*0.5,terrainH(x,z)+0.02,z+Math.sin(dir)*L*0.5];const p2=[x+Math.cos(dir+0.3)*L,terrainH(x,z)+0.012,z+Math.sin(dir+0.3)*L];
    twigs.push({pts:[p0,p1,p2],r:rr(R,0.004,0.008)});}
  roots=[];
  for(const t of trees){for(let i=0;i<5;i++){const a=i/5*TAU+R()*0.4;const dir=[Math.cos(a),Math.sin(a)];const b=t.base;
    const L=rr(R,0.5,0.9);const pts=[[b[0],b[1]+0.16,b[2]],[b[0]+dir[0]*L*0.4,b[1]+0.05,b[2]+dir[1]*L*0.4],[b[0]+dir[0]*L,terrainH(b[0]+dir[0]*L,b[2]+dir[1]*L)-0.005,b[2]+dir[1]*L]];
    roots.push({pts,r:rr(R,0.035,0.05)});}}
}
function addRipple(x,z,amp,rad,pri){
  const a=(pri?S.ripple:1)*amp;
  if(pri)W.ripHigh.push([x,z,a,rad]);else W.ripLow.push([x,z,a,rad]);
  W.rippleLog.push(W.t);
}
function splash(x,z,power,y,quiet){
  const n=Math.floor((5+power*12)*(0.5+0.5*S.density));
  for(let i=0;i<n&&drops.length<300;i++){
    const a=rand()*TAU,s=0.3+rand()*1.2*power;
    drops.push({p:[x,(y||WATER_Y)+0.02,z],v:[Math.cos(a)*s*0.5,1.2+rand()*2.0*power,Math.sin(a)*s*0.5],life:0.9+rand()*0.5,foam:false});
  }
  for(let i=0;i<Math.floor(3+power*5);i++){const a=rand()*TAU,r=rand()*0.12*power;foams.push({p:[x+Math.cos(a)*r,WATER_Y+0.012,z+Math.sin(a)*r],life:0.6+rand()*0.8,size:0.03+rand()*0.05*power});}
  for(let i=0;i<Math.floor(2+power*5);i++)bubbles.push({p:[x+(rand()-0.5)*0.15,WATER_Y-0.1-rand()*0.1,z+(rand()-0.5)*0.15],v:[0,0.14+rand()*0.12,0],life:1.5+rand()*1.5,size:0.008+rand()*0.014});
  addRipple(x,z,0.014+0.045*power,0.3+0.55*power,1);
  addRipple(x,z,0.008+0.02*power,0.18+0.3*power,1);
  if(!quiet)W.events.push({type:'splash',power});
  nudgePadsFrom(x,z,power);
  W.splashEv={x,z,t:W.t,power};
  W.camEvent={p:[x,0.1,z],t:W.t,k:Math.min(1,0.5+power*0.5)};
}
function nudgePadsFrom(x,z,power){
  for(const p of pads){const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz);if(d<1.4&&d>0.01){const f=(1-d/1.4)*power;p.vx+=dx/d*f*0.35;p.vz+=dz/d*f*0.35;p.vy-=f*0.4;p.av+=(rand()-0.5)*f*2;}}
}
const rnd=(a,b)=>a+rand()*(b-a);
function updateObjs(dt){
  for(const o of objs){
    o.age+=dt;
    if(o.held&&o.target){for(let a=0;a<3;a++){const dv=(o.target[a]-o.p[a])*16;o.v[a]+=(dv-o.v[a])*Math.min(1,dt*14);}o.rest=false;}
    else if(!o.rest)o.v[1]-=S.gravity*dt;
    if(o.rest&&!o.held){o.v=[0,0,0];continue;}
    o.p[0]+=o.v[0]*dt;o.p[1]+=o.v[1]*dt;o.p[2]+=o.v[2]*dt;
    const lim=GS-0.6;o.p[0]=clamp(o.p[0],-lim,lim);o.p[2]=clamp(o.p[2],-lim,lim);
    const gy=terrainH(o.p[0],o.p[2])+o.sc[1]*0.8;
    const inPond=pondD(o.p[0],o.p[2])<-0.1;
    if(o.floats&&inPond&&o.p[1]<WATER_Y+o.r*0.8){
      if(!o.inWater){o.inWater=true;splash(o.p[0],o.p[2],Math.min(1,Math.abs(o.v[1])*0.25));}
      o.v[1]+=((WATER_Y+o.r*0.35-o.p[1])*30-o.v[1]*6)*dt;o.v[0]*=Math.exp(-2*dt);o.v[2]*=Math.exp(-2*dt);
      const w=windAt(o.p[0],0,o.p[2],W.t);o.v[0]+=w[0]*0.15*dt;o.v[2]+=w[2]*0.15*dt;
    }else if(!o.floats&&inPond&&o.p[1]<WATER_Y+o.r&&!o.inWater&&!o.held){
      o.inWater=true;splash(o.p[0],o.p[2],Math.min(1.2,Math.abs(o.v[1])*0.2+0.3));o.v[0]*=0.3;o.v[2]*=0.3;o.v[1]*=0.35;
    }
    if(!inPond)o.inWater=false;
    if(o.inWater&&!o.floats){o.v[0]*=Math.exp(-4*dt);o.v[2]*=Math.exp(-4*dt);}
    if(o.p[1]<gy){
      o.p[1]=gy;
      if(o.v[1]<-0.8&&!o.inWater){o.v[1]*=-0.3;o.v[0]*=0.7;o.v[2]*=0.7;if(o.v[1]>0.3)spawnDust(o.p,0.4);}else o.v[1]=0;
      const fr=Math.exp((o.inWater?-6:-3.5)*dt);o.v[0]*=fr;o.v[2]*=fr;
      o.w=[o.v[2]*6,0,-o.v[0]*6].map(x=>x/(o.r*8+1));
      if(Math.hypot(o.v[0],o.v[2])<0.05&&!o.held){o.rest=true;o.w=[0,0,0];}
    }
    const wl=Math.hypot(...o.w);
    if(wl>1e-4){const dq=qnorm([o.w[0]*dt*0.5,o.w[1]*dt*0.5,o.w[2]*dt*0.5,1]);o.q=qnorm(qmul(dq,o.q));}
    if(o.kind==='rock'){o.rest=true;o.held=false;o.v=[0,0,0];continue;}
    if(Math.hypot(o.v[0],o.v[1],o.v[2])>0.4&&!o.floats)o.rest=false;
  }
  objs=objs.filter(o=>o.kind==='rock'||o.age<240||o.held);
}
function throwAt(from,target,kind){
  const T=0.55+Math.hypot(target[0]-from[0],target[2]-from[2])*0.05;
  const v=[(target[0]-from[0])/T,(target[1]-from[1]+0.5*S.gravity*T*T)/T,(target[2]-from[2])/T];
  const k=kind||['pebble','apple','pebble','ball'][Math.floor(rand()*4)];
  let o;
  if(k==='apple')o=makeObj('apple',from,0.05,srgb([0.7,0.08,0.06]),[0.05,0.048,0.05],rand(),true);
  else if(k==='ball')o=makeObj('ball',from,0.045,srgb([0.9,0.7,0.1]),[0.045,0.045,0.045],rand(),true);
  else{const g=0.35+rand()*0.25;o=makeObj('pebble',from,0.04,[g,g*0.92,g*0.84].map(x=>Math.pow(x,2.2)),[0.045,0.03,0.04],rand(),false);}
  o.v=v;o.rest=false;objs.push(o);return o;
}

/* ============================== particles ============================== */
let foams=[],bubbles=[],dust=[],sparks=[];
function spawnDust(p,power){for(let i=0;i<Math.floor(4+power*8);i++)dust.push({p:[p[0]+(rand()-0.5)*0.08,p[1]+0.02,p[2]+(rand()-0.5)*0.08],v:[(rand()-0.5)*0.5*power,0.2+rand()*0.5*power,(rand()-0.5)*0.5*power],life:0.5+rand()*0.5,size:0.02+rand()*0.03});}
function updateParticles(dt){
  for(const s of sparks){s.life-=dt;s.v[1]-=0.8*dt;s.p[0]+=s.v[0]*dt;s.p[1]+=s.v[1]*dt;s.p[2]+=s.v[2]*dt;}sparks=sparks.filter(s=>s.life>0);
  for(const d of drops){d.life-=dt;d.v[1]-=S.gravity*dt;d.p[0]+=d.v[0]*dt;d.p[1]+=d.v[1]*dt;d.p[2]+=d.v[2]*dt;
    if(d.p[1]<(pondD(d.p[0],d.p[2])<0?WATER_Y:terrainH(d.p[0],d.p[2]))){d.life=0;if(pondD(d.p[0],d.p[2])<0&&rand()<0.4)addRipple(d.p[0],d.p[2],0.004,0.1,0);}}
  drops=drops.filter(d=>d.life>0);
  for(const f of foams){f.life-=dt;f.p[0]+=Math.sin(W.t*2+f.size*50)*0.01*dt;}foams=foams.filter(f=>f.life>0);
  for(const b of bubbles){b.life-=dt;b.p[1]+=b.v[1]*dt;b.p[0]+=Math.sin(W.t*3+b.size*90)*0.01*dt;if(b.p[1]>=WATER_Y-0.005){b.life=0;if(rand()<0.5)addRipple(b.p[0],b.p[2],0.003,0.08,0);}}
  bubbles=bubbles.filter(b=>b.life>0);
  for(const d of dust){d.life-=dt;d.v[1]-=1.5*dt;d.p[0]+=d.v[0]*dt;d.p[1]+=d.v[1]*dt;d.p[2]+=d.v[2]*dt;}dust=dust.filter(d=>d.life>0);
}

/* ============================== debris ============================== */
function spawnDebris(kind,p,c1,c2,size){
  if(debris.length>=200)return;
  debris.push({kind,p:p.slice(),v:[(rand()-0.5)*0.3,-0.1,(rand()-0.5)*0.3],c1,c2,size,a:rand()*TAU,b:rand()*TAU,av:(rand()-0.5)*4,bv:(rand()-0.5)*3,ph:rand()*TAU,st:0,tm:0,life:30+rand()*50,seed:rand()*20});
}
function spawnTreeLeaf(){
  if(!trees.length)return;
  const tr=trees[Math.floor(rand()*trees.length)];
  const lf=tr.leaves[Math.floor(rand()*tr.leaves.length)];
  spawnDebris(0,add(tr.branches[lf.b].pos[lf.i],lf.off),tr.l1,tr.l2,lf.size*0.9);
}
function updateDebris(dt){
  const t=W.t;
  const rate=0.2+7*Math.pow(W.wind,2)+W.storm*8;
  if(rand()<rate*dt)spawnTreeLeaf();
  if(rand()<(0.06+W.wind)*dt){const open=plants.filter(p=>p.flower&&!p.flower.picked&&p.flower.open>0.8);if(open.length){const p=open[Math.floor(rand()*open.length)];spawnDebris(1,p.ch.pos[p.n],p.flower.c1,p.flower.c2,0.03);}}
  for(const d of debris){
    d.tm+=dt;
    if(d.st===0){
      const w=windAt(d.p[0],d.p[1],d.p[2],t),sc=2.2+W.storm*2;
      d.v[0]+=(w[0]*sc+Math.sin(t*3+d.ph)*0.3-d.v[0])*Math.min(1,dt*1.6);
      d.v[2]+=(w[2]*sc+Math.cos(t*2.6+d.ph)*0.4-d.v[2])*Math.min(1,dt*1.6);
      d.v[1]+=((-0.45-0.25*Math.sin(t*4+d.ph))-d.v[1])*Math.min(1,dt*2.5);
      d.p[0]+=d.v[0]*dt;d.p[1]+=d.v[1]*dt;d.p[2]+=d.v[2]*dt;d.a+=d.av*dt;d.b+=d.bv*dt;
      const gy=terrainH(d.p[0],d.p[2]);
      if(pondD(d.p[0],d.p[2])<-0.1&&d.p[1]<WATER_Y+0.01){d.st=2;d.p[1]=WATER_Y;addRipple(d.p[0],d.p[2],0.005,0.16,0);}
      else if(d.p[1]<gy+0.01){d.st=1;d.p[1]=gy+0.008;}
      if(Math.abs(d.p[0])>GS||Math.abs(d.p[2])>GS)d.life=0;
    }else if(d.st===2){
      const w=windAt(d.p[0],0,d.p[2],t);d.p[0]+=w[0]*0.12*dt;d.p[2]+=w[2]*0.12*dt;d.a+=0.1*dt;
      if(pondD(d.p[0],d.p[2])>-0.2){d.p[0]-=w[0]*0.12*dt;d.p[2]-=w[2]*0.12*dt;}
    }
    if(d.tm>d.life)d.dead=true;
  }
  debris=debris.filter(d=>!d.dead);
}
function emitDebris(){
  for(const d of debris){
    let fade=1;if(d.tm>d.life-3)fade=Math.max(0,(d.life-d.tm)/3);
    const sz=d.size*fade;if(sz<0.004)continue;
    let F,R,curl=0.15;
    if(d.st===0){F=nrm([Math.cos(d.a)*Math.cos(d.b),Math.sin(d.b)*0.8,Math.sin(d.a)*Math.cos(d.b)]);R=perpFrame(F);curl=0.3;}
    else{F=nrm([Math.cos(d.a),0.02,Math.sin(d.a)]);R=perpFrame(F);}
    const flw=d.st===2?1:0;
    if(d.kind===1)addPetal(d.p[0],d.p[1]+0.003,d.p[2],sz,F,curl,R,0.2,d.c1,1,d.c2,d.seed,0.8,W.wet,flw);
    else addLeaf(d.p[0],d.p[1]+0.003,d.p[2],sz,F,curl,R,0.2,d.c1,0,d.c2,d.seed,0.65,W.wet,flw);
  }
  // fallen leaves resting on the ground (static decoration)
  for(const f of fallen){addLeaf(f.p[0],f.p[1],f.p[2],f.s,f.F,0.1,f.R,0.05,f.c1,0,f.c2,f.seed,0.65,0,0);}
}
let fallen=[];
function buildFallen(){
  const R=mb(321);fallen=[];
  const cols=[[[0.5,0.3,0.06],[0.7,0.45,0.1]],[[0.35,0.1,0.04],[0.6,0.2,0.06]],[[0.3,0.35,0.08],[0.5,0.5,0.12]]];
  for(let i=0;i<70;i++){
    const a=R()*TAU,r=rr(R,2.5,8);const x=Math.cos(a)*r,z=Math.sin(a)*r*0.9;if(pondD(x,z)<0.5||Math.abs(x)>GS-1||Math.abs(z)>GS-1)continue;
    const c=cols[Math.floor(R()*3)];const F=nrm([Math.cos(R()*TAU),0.02,Math.sin(R()*TAU)]);
    fallen.push({p:[x,terrainH(x,z)+0.006,z],s:rr(R,0.05,0.1),F,R:perpFrame(F),c1:srgb(c[0]),c2:srgb(c[1]),seed:R()*9});
  }
}

/* ============================== lily pads (spring physics) ============================== */
function buildPads(){
  const R=mb(55);pads=[];floaters=[];
  for(let i=0;i<9;i++){
    for(let k=0;k<40;k++){
      const a=R()*TAU,r=Math.sqrt(R())*0.82;
      const x=Math.cos(a)*r*2.7*0.85,z=Math.sin(a)*r*1.95*0.85;
      if(pondD(x,z)<-0.6&&pads.every(p=>Math.hypot(p.x-x,p.z-z)>p.r+0.45)){
        pads.push({x,z,hx:x,hz:z,r:rr(R,0.22,0.36),a:R()*TAU,ph:R()*TAU,vx:0,vz:0,dy:0,vy:0,av:0,fl:i<2?1:0,seed:R()*10,held:false,target:null,taps:0,droplets:0});break;
      }
    }
  }
  const cols=[[0.55,0.2,0.04],[0.7,0.3,0.05],[0.45,0.12,0.05],[0.75,0.5,0.1]];
  for(let i=0;i<8;i++){
    for(let k=0;k<30;k++){
      const a=R()*TAU,r=Math.sqrt(R())*0.85;
      const x=Math.cos(a)*r*2.7*0.85,z=Math.sin(a)*r*1.95*0.85;
      if(pondD(x,z)<-0.4){floaters.push({x,z,a:R()*TAU,s:rr(R,0.05,0.09),col:srgb(cols[i%4]),seed:R()*9,vx:0,vz:0});break;}
    }
  }
}
function updatePads(dt){
  const t=W.t;
  for(const p of pads){
    const w=windAt(p.x,0,p.z,t);
    if(p.held&&p.target){
      const dx=p.target[0]-p.x,dz=p.target[2]-p.z;p.vx+=(dx*18-p.vx)*Math.min(1,dt*10);p.vz+=(dz*18-p.vz)*Math.min(1,dt*10);
      const sp=Math.hypot(p.vx,p.vz);if(sp>0.15&&rand()<dt*6)addRipple(p.x,p.z,0.006*Math.min(2,sp),0.25,1);
      p.av+=(p.vx*0.1-p.vz*0.05)*dt*2;
    }else{
      p.vx+=((w[0]*0.04+(p.hx-p.x)*0.02)-p.vx)*dt*0.8;p.vz+=((w[2]*0.04+(p.hz-p.z)*0.02)-p.vz)*dt*0.8;
    }
    // spring physics: vertical bob + spin damping
    p.vy+=(-55*p.dy-5.5*p.vy)*dt;p.dy+=p.vy*dt;p.dy=clamp(p.dy,-0.06,0.03);
    p.av*=Math.exp(-1.6*dt);p.a+=p.av*dt+Math.sin(t*0.3+p.ph)*0.01*dt;
    p.droplets*=Math.exp(-0.3*dt);
  }
  // pad-pad collisions
  for(let i=0;i<pads.length;i++)for(let j=i+1;j<pads.length;j++){
    const a=pads[i],b=pads[j];const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=(a.r+b.r)*0.92;
    if(d<min&&d>1e-4){const push=(min-d)*0.5,nx=dx/d,nz=dz/d;
      if(!a.held){a.x-=nx*push;a.z-=nz*push;a.vx-=nx*0.2;a.vz-=nz*0.2;}else{b.x+=nx*push*2;b.z+=nz*push*2;}
      if(!b.held){b.x+=nx*push;b.z+=nz*push;b.vx+=nx*0.2;b.vz+=nz*0.2;}else{a.x-=nx*push*2;a.z-=nz*push*2;}
      a.av+=(rand()-0.5)*0.2;b.av+=(rand()-0.5)*0.2;}
  }
  for(const p of pads){
    const nx=p.x+p.vx*dt,nz=p.z+p.vz*dt;
    if(pondD(nx,nz)<-0.45){p.x=nx;p.z=nz;}else{p.vx*=-0.4;p.vz*=-0.4;}
  }
  for(const f of floaters){
    const w=windAt(f.x,0,f.z,t);f.vx+=(w[0]*0.12-f.vx)*dt;f.vz+=(w[2]*0.12-f.vz)*dt;
    const nx=f.x+f.vx*dt,nz=f.z+f.vz*dt;if(pondD(nx,nz)<-0.3){f.x=nx;f.z=nz;}else{f.vx*=-0.4;f.vz*=-0.4;}
    f.a+=0.05*dt*Math.sin(t*0.5+f.seed);
  }
  // weather ripples
  const n=W.rain*90*dt+W.wind*W.wind*2*dt;
  let k=n;while(k>0){if(rand()<Math.min(1,k)){
    const a=rand()*TAU,r=Math.sqrt(rand());
    const x=Math.cos(a)*r*2.5,z=Math.sin(a)*r*1.8;
    if(pondD(x,z)<-0.15){addRipple(x,z,0.004+0.006*W.rain*rand(),0.09+rand()*0.06,0);
      for(const p of pads)if(Math.hypot(p.x-x,p.z-z)<p.r){p.droplets=Math.min(1,p.droplets+0.05);p.vy-=0.02;}}
  }k-=1;}
}
function emitPads(){
  cnt.pad=0;
  for(const p of pads){
    const F=[Math.cos(p.a),0,Math.sin(p.a)],R=perpFrame(F);
    const yy=WATER_Y+0.008+p.dy;
    if(cnt.pad<64)pushLeaf(PDL,cnt.pad++,p.x,yy,p.z,p.r,F,0,R,0,srgb([0.08,0.22,0.05]),2,srgb([0.24,0.44,0.1]),p.seed,1.0,Math.max(W.wet,p.droplets),1);
    if(p.fl){
      for(let k=0;k<12;k++){
        const phi=k/12*TAU,ang=1.05+0.2*Math.sin(k*3.3);
        const dir=[Math.cos(phi),0,Math.sin(phi)];
        const Fp=nrm([dir[0]*Math.sin(ang),Math.cos(ang),dir[2]*Math.sin(ang)]);
        const Rp=nrm(crs([0,1,0],Fp));
        addPetal(p.x,yy+0.01,p.z,0.075,Fp,0.05,Rp,0.1,srgb([0.9,0.55,0.7]),7,srgb([1,0.88,0.93]),p.seed+k,0.55,0,1);
      }
      addBlob([p.x,yy+0.03,p.z],0.016,0.012,0.016,2,p.seed,QI,srgb([0.95,0.8,0.1]),0.1);
    }
  }
  for(const f of floaters){
    const F=[Math.cos(f.a),0,Math.sin(f.a)],R=perpFrame(F);
    addLeaf(f.x,WATER_Y+0.004,f.z,f.s,F,0.05,R,0.1,f.col,0,mul(f.col,1.4),f.seed,0.6,0,1);
  }
}

/* ============================== surfaces the frog can stand on ============================== */
function surfAt(x,z){
  for(const p of pads){if(Math.hypot(x-p.x,z-p.z)<p.r*0.8)return{y:WATER_Y+0.012+p.dy,type:'pad',pad:p};}
  for(const o of objs){if(o.kind==='rock'&&Math.hypot(x-o.p[0],z-o.p[2])<o.sc[0]*0.7)return{y:o.p[1]+o.sc[1]*0.85,type:'rock',rock:o};}
  const t=terrainH(x,z);
  if(t<WATER_Y-0.04&&pondD(x,z)<0)return{y:WATER_Y-0.03,type:'water'};
  const tm=Math.max(t,terrainH(x+0.1,z),terrainH(x-0.1,z),terrainH(x,z+0.1),terrainH(x,z-0.1));
  return{y:Math.max(tm,WATER_Y-0.03)+0.012,type:'ground'};
}

/* ============================== the frog ============================== */
const FROG_G=srgb([0.21,0.45,0.13]);
const frog={};
function resetFrog(){
  let p=landPoint(0.95,0.3,0.6);
  Object.assign(frog,{p:[p[0],terrainH(p[0],p[1]),p[1]],v:[0,0,0],yaw:Math.atan2(-p[0],-p[1]),st:'idle',t:0,surf:'ground',pad:null,rock:null,plan:null,
    blinkT:rnd(2,6),lookT:rnd(3,8),shiftT:rnd(4,10),hopT:rnd(6,14),idleFor:0,breath:0,
    closure:0,blinkP:-1,gaze:[p[0],0.1,p[1]+1],gazeS:[0,0,0],head:{yaw:0,pitch:0,roll:0,yv:0,pv:0,rv:0},headT:[0,0,0],
    crouch:0,airW:0,legPh:0,mouth:0,throat:0,gulp:0,tongue:0,tonguePh:-1,tongueTgt:null,tongueFrom:null,sq:0,sqv:0,petAmt:0,scared:0,freeze:0,sleepy:0,
    mood:'Calm',moodV:0,hunger:0.3,annoy:0,held:false,grabTarget:null,grabDepth:1,heldV:[0,0,0],swimT:0,swimTgt:null,swimPh:0,sitFor:0,
    toe:0,target:null,crawlTgt:null,lastHop:0,hid:0,dizzy:0,pitch:0,roll:0,weight:0,weightT:0,dive:0,sleepT:0,asleep:false,after:null,aim:null,huntCool:6,
    catches:0,pupil:0.3,hopCount:0});
}
function frogCenter(){return[frog.p[0],frog.p[1]+0.075*(1-0.3*frog.crouch),frog.p[2]];}
function planJump(tx,tz,after,user){
  if(Game.on&&!user)return; // catch mode: the frog only ever jumps because the player asked
  const s=surfAt(tx,tz);let ty=s.y;
  const dx=tx-frog.p[0],dz=tz-frog.p[2],dist=Math.hypot(dx,dz),g=S.gravity;
  const apex=Math.max(frog.p[1],ty)+clamp(0.08+0.12*dist,0.1,0.42);
  const vy=Math.sqrt(2*g*Math.max(apex-frog.p[1],0.02));
  const tUp=vy/g,tDown=Math.sqrt(2*Math.max(apex-ty,0.01)/g),T=tUp+tDown;
  frog.plan={t:[tx,ty,tz],type:s.type,pad:s.pad,rock:s.rock,v:[dx/T,vy,dz/T],T,after:after||null,user:!!user};
  frog.yawT=Math.atan2(dx,dz);
  frog.st='crouch';frog.t=0;frog.crouchDur=(Game.ctrl?(Game.input.sprint?0.04:0.09):0.3+0.1*rand());
}
function launch(){
  const pl=frog.plan;if(!pl||(Game.on&&!pl.user)){frog.st='idle';frog.plan=null;return;}
  frog.v=pl.v.slice();frog.st='air';frog.t=0;frog.tAir=0;frog.surf='air';frog.pad=null;
  frog.sqv=-2;frog.hopCount++;
  if(frog.surfWas==='ground'||true){spawnDust([frog.p[0],frog.p[1],frog.p[2]],0.5);}
  W.camEvent={p:frog.p.slice(),t:W.t,k:0.5};
  W.events.push({type:'hop'});
}
function surfaceAround(minD,maxD){
  for(let k=0;k<30;k++){const a=rand()*TAU,r=rnd(2.2,5);const x=Math.cos(a)*r*1.05,z=Math.sin(a)*r*0.85;const d=pondD(x,z);if(d>minD&&d<maxD&&Math.abs(x)<GS-1&&Math.abs(z)<GS-1)return[x,z];}
  return[2.5,2.2];
}
function nearestInsect(maxD){
  let best=null,bd=maxD;
  for(const c of creatures){
    if((c.kind!==0&&c.kind!==1&&c.kind!==3)||c.activeIdx===false)continue;
    const d=Math.hypot(c.p[0]-frog.p[0],c.p[2]-frog.p[2]);
    if(d<bd&&c.p[1]<0.8&&c.p[1]>frog.p[1]-0.02&&!c.held){bd=d;best=c;}
  }
  return best;
}
function startTongue(c){
  frog.st='tongue';frog.t=0;frog.tongueTgt=c;frog.tonguePh=0;frog.mouth=0;
  const dx=c.p[0]-frog.p[0],dz=c.p[2]-frog.p[2];frog.yawT=Math.atan2(dx,dz);
}
function frogMouthPos(){
  const f=[Math.sin(frog.yaw),0,Math.cos(frog.yaw)];const c=frogCenter();
  return[c[0]+f[0]*0.2,c[1]+0.03,c[2]+f[2]*0.2];
}
function cursorDist(){const c=W.cursorPt;if(!c)return 99;return Math.hypot(c[0]-frog.p[0],c[2]-frog.p[2]);}
function updateFrog(dt){
  const f=frog,t=W.t,act=S.activity;
  f.t+=dt;f.breath+=dt*(f.asleep?1.0:2.1+f.scared*3);
  f.legPh+=dt*6;
  const cdist=cursorDist(),cspeed=W.cursorSpeed||0;
  const night=W.night;
  // timers
  f.blinkT-=dt;f.lookT-=dt;f.shiftT-=dt;f.hopT-=dt*(0.6+0.7*act+(W.rain>0.2?0.8:0));f.huntCool-=dt;
  f.scared=Math.max(0,f.scared-dt);f.freeze=Math.max(0,f.freeze-dt);f.petAmt=Math.max(0,f.petAmt-dt*0.25);f.hunger=Math.min(1,f.hunger+dt*0.01*(0.5+act));
  f.sq+=(f.sqv)*dt;f.sqv+=(-180*f.sq-16*f.sqv)*dt;f.sq=clamp(f.sq,-0.3,0.5);
  f.annoy=Math.max(0,f.annoy-dt*0.15);f.dizzy=Math.max(0,f.dizzy-dt);
  // blinking
  if(f.blinkP<0&&f.blinkT<=0){f.blinkP=0;f.blinkT=rnd(2,6)*(f.asleep?99:1);}
  if(f.blinkP>=0){f.blinkP+=dt/0.22;if(f.blinkP>=1)f.blinkP=-1;}
  let blink=0;if(f.blinkP>=0){const p=f.blinkP;blink=p<0.4?p/0.4:1-(p-0.4)/0.6;}
  // sleepiness
  f.sleepy+=((night>0.65&&W.rain<0.5&&f.scared<=0?1:0)-f.sleepy)*dt*0.3;
  // pad / rock following
  if(f.surf==='pad'&&f.pad){f.p[0]=f.pad.x+f.padOff[0];f.p[2]=f.pad.z+f.padOff[1];f.p[1]=WATER_Y+0.012+f.pad.dy;}
  // predator shadow
  const bsh=W.birdShadow;
  let threat=0,threatD=99;
  if(bsh&&bsh.s>0.1){threatD=Math.hypot(bsh.x-f.p[0],bsh.z-f.p[2]);threat=bsh.s*(1-clamp(threatD/4,0,1));}
  const calmState=(f.st==='idle'||f.st==='sleep'||f.st==='look');
  if(threat>0.12&&calmState&&!f.held&&!Game.ctrl){f.st='idle';f.freeze=Math.max(f.freeze,2.5);f.asleep=false;f.headT=[0,0.9,0];
    if(threatD<2.2&&!f.fled){f.fled=true;f.hide=true;const w=surfaceAround(-2,-0.7);planJump(w[0],w[1],'hide');}}
  if(!bsh||bsh.s<0.05)f.fled=false;
  // held by the user
  if(f.held){
    const tgt=f.grabTarget;
    for(let a=0;a<3;a++){const dv=(tgt[a]-(a===1?f.p[1]+0.06:f.p[a]))*9;f.heldV[a]+=(dv-f.heldV[a])*Math.min(1,dt*7);}
    f.p[0]+=f.heldV[0]*dt;f.p[1]+=f.heldV[1]*dt;f.p[2]+=f.heldV[2]*dt;
    const sp=Math.hypot(...f.heldV);f.hang=clamp(sp*0.15,0,0.4);
    f.v=f.heldV.slice();f.st='held';f.scared=Math.max(f.scared,0.3);f.asleep=false;f.surf='air';f.pad=null;
    const gp=terrainH(f.p[0],f.p[2]);if(f.p[1]<gp)f.p[1]=gp;
    f.yaw+=(Math.atan2(f.heldV[0],f.heldV[2])-f.yaw)*Math.min(1,dt*2)*Math.min(1,sp);
    f.stretch=clamp(sp*0.1,0,0.3);
  }else f.stretch=0;
  const wasHeld=f.st==='held'&&!f.held;
  if(wasHeld){f.st='air';f.tAir=0;f.plan=null;f.freeFall=true;f.t=0;}
  // state machine
  switch(f.st){
  case 'idle':case 'look':case 'sleep':{
    f.surfWas=f.surf;
    if(Game.ctrl){ctrlIdle(dt);break;}
    f.idleFor+=dt;
    const frozen=f.freeze>0;
    // gaze selection
    let gazeT=null,mood='Calm';
    if(f.sleepy>0.8&&!frozen&&f.scared<=0&&f.surf!=='water'){
      if(!f.asleep&&f.idleFor>3){f.asleep=true;f.sleepT=0;f.st='sleep';}
    }
    if(f.asleep){
      f.sleepT+=dt;mood='Sleepy';
      if((cdist<0.9&&W.cursorMove>0)||W.poke>0||night<0.45||W.rain>0.7||threat>0.1){f.asleep=false;f.st='idle';f.blinkP=0;f.lookT=0.4;f.idleFor=0;f.wake=1;
        if(W.poke>0){planJump(...surfaceAround(0.3,1.5),null);W.poke=0;}}
      break;
    }
    if(frozen){mood='Scared';f.crouch+=(0.8-f.crouch)*dt*6;f.pupil=0.9;break;}
    // startle by fast cursor
    if(cdist<1.4&&cspeed>2.6&&W.cursorMove>0&&f.scared<=0){f.scared=1.6;f.freeze=0.35;f.startle=1;}
    if(f.scared>0){mood='Scared';f.crouch+=(0.9-f.crouch)*dt*8;f.pupil=1;
      if(f.freeze<=0&&f.startle){f.startle=0;const ang=Math.atan2(f.p[0]-(W.cursorPt?W.cursorPt[0]:0),f.p[2]-(W.cursorPt?W.cursorPt[2]:0));
        let tx=f.p[0]+Math.sin(ang)*rnd(0.7,1.2),tz=f.p[2]+Math.cos(ang)*rnd(0.7,1.2);
        if(pondD(f.p[0],f.p[2])<1.2&&rand()<0.7){const w=surfaceAround(-2,-0.7);tx=w[0];tz=w[1];}
        planJump(clamp(tx,-GS+1,GS-1),clamp(tz,-GS+1,GS-1),null);break;}
    }
    // hunting insects
    const ins=nearestInsect(0.9);
    if(ins&&f.huntCool<=0&&(f.hunger>0.35||act>1.2)&&f.surf!=='air'){
      const d=Math.hypot(ins.p[0]-f.p[0],ins.p[2]-f.p[2]);mood='Hungry';gazeT=ins.p;
      if(d<0.38){f.aim=ins;f.st='aim';f.t=0;f.huntCool=rnd(8,16);break;}
      else if(d<0.9&&f.hopT<5){const tx=f.p[0]+(ins.p[0]-f.p[0])*0.55,tz=f.p[2]+(ins.p[2]-f.p[2])*0.55;const s=surfAt(tx,tz);if(s.type!=='water'){planJump(tx,tz,'hunt');f.huntCool=3;break;}}
    }else if(ins&&ins.p[1]<1.2){gazeT=ins.p;}
    // cursor interaction
    const cp=W.cursorPt;
    if(cp&&cdist<2.4&&W.cursorMove>0&&cspeed<2.2){
      mood='Curious';gazeT=gazeT||[cp[0],cp[1]+0.05,cp[2]];f.headT[2]=Math.sin(t*0.9)*0.25;
      if(cdist>0.7&&cdist<2.2&&f.hopT<9&&rand()<dt*0.35*(0.6+act)&&f.surf==='ground'){f.crawlTgt=[cp[0]+(f.p[0]-cp[0])*0.3,cp[2]+(f.p[2]-cp[2])*0.3];f.st='crawl';f.t=0;}
    }
    if(W.petting>0&&cdist<0.35){f.petAmt=Math.min(1,f.petAmt+dt*0.6);}
    if(f.petAmt>0.25){mood='Happy';}
    if(W.rain>0.25||act>1.5)mood=mood==='Calm'?'Excited':mood;
    f.mood=mood;
    // eyes / head
    if(gazeT){f.gaze=gazeT;f.lookT=Math.max(f.lookT,0.8);}
    else if(f.lookT<=0){
      f.lookT=rnd(3,8);const a=f.yaw+rnd(-1.2,1.2);f.gaze=[f.p[0]+Math.sin(a)*2,f.p[1]+rnd(0,0.5),f.p[2]+Math.cos(a)*2];
    }
    if(f.shiftT<=0){f.shiftT=rnd(4,10);f.weightT=rnd(-1,1);f.yawT=f.yaw+rnd(-0.35,0.35);}
    f.weight+=(f.weightT-f.weight)*dt*1.2;
    if(f.yawT!==undefined)f.yaw+=wrapA(f.yawT-f.yaw)*Math.min(1,dt*2.5);
    // slowly rotate body toward gaze if far off
    {const dx=f.gaze[0]-f.p[0],dz=f.gaze[2]-f.p[2];const a=Math.atan2(dx,dz);const rel=wrapA(a-f.yaw);if(Math.abs(rel)>0.8)f.yaw+=Math.sign(rel)*dt*1.4;}
    f.crouch+=((f.petAmt>0.3?0.25:0.0)-f.crouch)*dt*3;f.pupil+=((mood==='Scared'?1:mood==='Curious'||mood==='Excited'?0.55:0.3)-f.pupil)*dt*3;
    // random hop
    if(f.hopT<=0&&f.scared<=0){
      f.hopT=rnd(7,16)/(0.6+0.6*act);
      const r=rand();
      if(f.surf==='ground'||f.surf==='rock'){
        if(f.idleFor>26&&rand()<0.5&&!f.rockTried){f.rockTried=true;const rocks=objs.filter(o=>o.kind==='rock'&&o.big>0.3&&Math.hypot(o.p[0]-f.p[0],o.p[2]-f.p[2])<4);if(rocks.length){const o=rocks[Math.floor(rand()*rocks.length)];f.target=o;f.st='crawl';f.crawlTgt=[o.p[0],o.p[2]];f.crawlRock=o;f.t=0;f.idleFor=0;break;}}
        if(r<0.4&&pads.length){const pd=pads[Math.floor(rand()*pads.length)];
          const toward=surfAt(pd.x,pd.z);const nearShore=pondD(f.p[0],f.p[2])<1.3;
          if(nearShore||f.surf==='rock'){const edge=[f.p[0]+(pd.x-f.p[0])*0.6,f.p[2]+(pd.z-f.p[2])*0.6];const e=surfAt(edge[0],edge[1]);
            if(Math.hypot(pd.x-f.p[0],pd.z-f.p[2])<2.4)planJump(pd.x+rnd(-0.05,0.05),pd.z+rnd(-0.05,0.05),null);else planJump(edge[0],edge[1],null);}
          else{const w=surfaceAround(0.4,1.4);planJump(w[0],w[1],null);}
        }else if(r<0.62){const w=surfaceAround(-2,-0.6);planJump(w[0],w[1],null);}
        else{const a=f.yaw+rnd(-1.2,1.2),d=rnd(0.4,0.9);planJump(clamp(f.p[0]+Math.sin(a)*d,-GS+1,GS-1),clamp(f.p[2]+Math.cos(a)*d,-GS+1,GS-1),null);}
      }else if(f.surf==='pad'){
        const pd=pads.filter(p=>p!==f.pad&&Math.hypot(p.x-f.p[0],p.z-f.p[2])<2.2);
        if(pd.length&&r<0.5){const q=pd[Math.floor(rand()*pd.length)];planJump(q.x,q.z,null);}
        else if(r<0.8){const w=surfaceAround(0.3,1.2);planJump(w[0],w[1],null);}
        else{f.st='swim';f.surf='water';f.swimTgt=null;f.pad=null;f.p[1]=WATER_Y-0.03;f.t=0;}
      }
      if(f.rockDone)f.rockDone=false;
    }
    if(f.surf==='rock'&&f.idleFor>14&&f.hopT<10&&rand()<dt*0.1){const w=surfaceAround(0.3,1.4);planJump(w[0],w[1],null);}
    f.crouch+=(0-f.crouch*0)*dt;
    break;
  }
  case 'crawl':{
    const tg=f.crawlTgt;if(!tg){f.st='idle';break;}
    const dx=tg[0]-f.p[0],dz=tg[1]-f.p[1+1-1];const d2=Math.hypot(dx,tg[1]-f.p[2]);
    const dzz=tg[1]-f.p[2];const d=Math.hypot(dx,dzz);
    f.yaw+=wrapA(Math.atan2(dx,dzz)-f.yaw)*Math.min(1,dt*4);
    const sp=0.14*(0.8+0.4*act);
    f.p[0]+=dx/(d||1)*sp*dt;f.p[2]+=dzz/(d||1)*sp*dt;
    const s=surfAt(f.p[0],f.p[2]);f.p[1]+=(s.y-f.p[1])*Math.min(1,dt*10);
    if(s.type==='water'){f.st='swim';f.surf='water';f.swimTgt=null;break;}
    f.gait=1;f.mood='Curious';f.gaze=W.cursorPt?[W.cursorPt[0],0.1,W.cursorPt[2]]:f.gaze;
    if(d<(f.crawlRock?0.25:0.5)||f.t>8){
      if(f.crawlRock){const o=f.crawlRock;f.crawlRock=null;planJump(o.p[0],o.p[2],null);}
      else f.st='idle';
    }
    if(!f.crawlRock&&cdist<0.45){f.st='idle';}
    break;}
  case 'crouch':{
    f.crouch+=(1-f.crouch)*Math.min(1,dt*10);
    f.yaw+=wrapA(f.yawT-f.yaw)*Math.min(1,dt*10);
    if(f.t>=f.crouchDur){launch();}
    break;}
  case 'air':{
    f.tAir+=dt;
    f.v[1]-=S.gravity*dt;
    f.p[0]+=f.v[0]*dt;f.p[1]+=f.v[1]*dt;f.p[2]+=f.v[2]*dt;
    f.crouch+=(0-f.crouch)*dt*8;
    f.pitch=clamp(f.v[1]*0.35,-0.8,0.9);
    if(f.spin>0){f.spin-=dt;f.yaw+=16*dt;}
    const sp=Math.hypot(f.v[0],f.v[2]);if(sp>0.1&&!(f.spin>0))f.yaw+=wrapA(Math.atan2(f.v[0],f.v[2])-f.yaw)*Math.min(1,dt*10);
    const s=surfAt(f.p[0],f.p[2]);
    let landY=s.y;
    if(f.v[1]<0&&f.p[1]<=landY){
      const impact=-f.v[1];f.p[1]=landY;
      land(s,impact);
    }else if(s.type!=='water'&&f.p[1]<landY){f.p[1]=landY;} // never pass through rising ground
    break;}
  case 'land':{
    f.crouch+=(0.35-f.crouch)*dt*8;
    if(f.t>(Game.ctrl?(Game.input.sprint?0.03:0.1):0.28)){
      f.st='idle';f.idleFor=0;f.crouch=0.2;
      if(f.plan&&f.plan.after==='hunt'){const ins=nearestInsect(0.7);if(ins){f.aim=ins;f.st='aim';f.t=0;f.huntCool=rnd(8,14);}f.plan=null;}
      else if(f.plan&&f.plan.after==='hide'){f.st='swim';f.surf='water';f.hid=1;f.swimTgt=null;f.plan=null;}
      else f.plan=null;
    }
    break;}
  case 'swim':{
    if(Game.ctrl){ctrlSwim(dt);break;}
    f.surf='water';f.swimT+=dt;f.swimPh+=dt*(3+2*f.moveSpeed||0);
    f.mood=f.hid?'Scared':'Excited';
    if(!f.swimTgt||Math.hypot(f.swimTgt[0]-f.p[0],f.swimTgt[1]-f.p[2])<0.2||f.t>14){
      if(f.swimT>2||f.hid&&f.swimT>4){
        // decide: pad, shore, or random swim
        const r=rand();
        if(f.hid&&(!W.birdShadow||W.birdShadow.s<0.05)&&f.swimT>5)f.hid=0;
        if(!f.hid&&r<0.4&&pads.length){const pd=pads[Math.floor(rand()*pads.length)];f.swimTgt=[pd.x,pd.z];f.toPad=pd;}
        else if(!f.hid&&r<0.7){const w=surfaceAround(0.3,1.0);f.swimTgt=[w[0],w[1]];f.toShore=true;}
        else{const a=rand()*TAU,rr2=Math.sqrt(rand());f.swimTgt=[Math.cos(a)*rr2*2.0,Math.sin(a)*rr2*1.4];f.toPad=null;f.toShore=false;}
        f.t=0;
      }else if(!f.swimTgt){f.swimTgt=[f.p[0]+rnd(-0.8,0.8),f.p[2]+rnd(-0.8,0.8)];}
    }
    const tg=f.swimTgt;
    if(tg){
      const dx=tg[0]-f.p[0],dz=tg[1]-f.p[2],d=Math.hypot(dx,dz);
      f.yaw+=wrapA(Math.atan2(dx,dz)-f.yaw)*Math.min(1,dt*3);
      const sp=Math.min(0.42,d*1.2+0.1)*(f.hid?1.3:1);f.moveSpeed=sp;
      f.p[0]+=Math.sin(f.yaw)*sp*dt;f.p[2]+=Math.cos(f.yaw)*sp*dt;
      if(pondD(f.p[0],f.p[2])>-0.2&&!f.toShore){f.swimTgt=null;}
      if(f.toPad&&d<0.35&&pads.includes(f.toPad)){const pd=f.toPad;f.toPad=null;planJump(pd.x,pd.z,null);}
      else if(f.toShore&&d<0.5){f.toShore=false;planJump(tg[0],tg[1],null);}
    }
    f.p[1]=WATER_Y-0.035+0.01*Math.sin(t*2.3)+waterBob();
    if(rand()<dt*2.2){addRipple(f.p[0]-Math.sin(f.yaw)*0.12,f.p[2]-Math.cos(f.yaw)*0.12,0.005,0.16,1);}
    if(rand()<dt*0.9)bubbles.push({p:[f.p[0],WATER_Y-0.08,f.p[2]],v:[0,0.16,0],life:1.2,size:0.01});
    f.crouch+=(0.3-f.crouch)*dt*3;f.pitch=0;
    if(cdist<0.5&&cspeed>2&&f.scared<=0){f.scared=1;}
    break;}
  case 'aim':{
    const c=f.aim;if(!c||f.t>1.2){f.st='idle';break;}
    f.crouch+=(0.8-f.crouch)*dt*8;f.mood='Hungry';
    const a=Math.atan2(c.p[0]-f.p[0],c.p[2]-f.p[2]);f.yaw+=wrapA(a-f.yaw)*Math.min(1,dt*8);f.gaze=c.p;f.mouth=Math.min(0.3,f.t*0.8);
    if(f.t>0.55)startTongue(c);
    break;}
  case 'tongue':{
    f.tonguePh+=dt;const T=f.tonguePh;
    const c=f.tongueTgt;
    f.crouch+=(0.7-f.crouch)*dt*8;
    if(T<0.22){f.mouth=Math.min(1,T/0.12);f.tongue=0;f.tongueFrom=frogMouthPos();f.tongueAim=c?c.p.slice():f.tongueFrom;}
    else if(T<0.34){f.tongue=(T-0.22)/0.12;f.mouth=1;}
    else if(T<0.4){f.tongue=1;
      if(!f.tongueResolved){f.tongueResolved=true;const mp=frogMouthPos();const hit=c&&dist(mp,c.p)<0.55&&rand()<0.7&&!c.held;f.tongueHit=hit;
        if(hit){f.catches++;f.hunger=0;f.gulp=1;W.events.push({type:'catch'});W.camEvent={p:c.p.slice(),t:W.t,k:0.7};c.caught=true;}}}
    else if(T<0.62){f.tongue=1-(T-0.4)/0.22;f.mouth=1-(T-0.4)/0.22*0.6;if(f.tongueHit&&c)c.p=lerp3(f.tongueFrom,c.p,Math.max(0,f.tongue));}
    else{f.tongue=0;f.mouth=Math.max(0,f.mouth-dt*5);
      if(T>0.9){f.st='idle';f.tonguePh=-1;f.tongueResolved=false;f.tongueHit=false;f.tongueTgt=null;f.idleFor=0;f.mood=f.catches?'Happy':'Calm';}}
    if(c&&T<0.34){f.yaw+=wrapA(Math.atan2(c.p[0]-f.p[0],c.p[2]-f.p[2])-f.yaw)*Math.min(1,dt*10);}
    break;}
  case 'ptongue':{ptongueStep(dt);break;}
  case 'held':{ // handled above, state kept until released
    f.mood=f.dizzy>0?'Scared':'Curious';
    break;}
  }
  // after-landing 'tongue' leftover cleanup
  if(f.st!=='tongue'&&f.st!=='ptongue'){f.tongue=Math.max(0,f.tongue-dt*6);f.mouth=Math.max(0,f.mouth-dt*3);}
  if(f.st!=='crouch'&&f.st!=='aim'&&f.st!=='tongue'&&f.st!=='idle'&&f.st!=='swim'&&f.st!=='land'&&f.st!=='sleep'&&f.st!=='held')f.crouch*=Math.exp(-dt*6);
  if(f.st==='idle'&&f.freeze<=0&&f.scared<=0&&!f.asleep)f.crouch+=(Math.max(0,f.petAmt>0.3?0.25:0)-f.crouch)*dt*3;
  if(f.st!=='air'&&f.st!=='held')f.pitch+=(0.0-f.pitch)*dt*6;
  f.gulp=Math.max(0,f.gulp-dt*3);
  f.airW+=(((f.st==='air'||f.st==='held'||f.st==='swim')?1:0)-f.airW)*Math.min(1,dt*10);
  f.sleepAmt=f.asleep?Math.min(1,(f.sleepAmt||0)+dt*0.6):Math.max(0,(f.sleepAmt||0)-dt*1.5);
  // eye closure
  let cl=blink;
  if(f.asleep)cl=Math.max(cl,0.95*Math.min(1,f.sleepT/2.5));
  cl=Math.max(cl,f.petAmt>0.25?0.55*f.petAmt:0);
  if(f.sleepy>0.4&&!f.asleep)cl=Math.max(cl,0.35*f.sleepy);
  if(f.scared>0)cl=Math.min(cl,0.15);
  if(f.st==='tongue')cl=Math.max(cl,f.tonguePh>0.3&&f.tonguePh<0.5?0.7:0);
  if(f.gulp>0.3)cl=Math.max(cl,0.6);
  cl=Math.max(cl,Game.eyeBias||0);
  f.closure+=(cl-f.closure)*Math.min(1,dt*(cl>f.closure?30:14));
  f.throat=(Math.sin(f.breath*(f.asleep?0.8:2.3))*0.5+0.5)*(f.asleep?0.4:1)+f.gulp*1.4+(f.mood==='Happy'?0.4*Math.sin(t*12):0);
  // head springs towards gaze
  {
    const c=frogCenter();const dx=f.gaze[0]-c[0],dy=f.gaze[1]-c[1],dz=f.gaze[2]-c[2];
    const a=wrapA(Math.atan2(dx,dz)-f.yaw),hd=Math.hypot(dx,dz)+1e-4;
    let hy=clamp(a,-1.0,1.0),hp=clamp(Math.atan2(dy,hd),-0.35,0.8);
    if(f.asleep){hy=0;hp=-0.25;}
    if(f.freeze>0)hp=0.8;
    const h=f.head;
    h.yv+=((hy-h.yaw)*50-h.yv*9)*dt;h.yaw+=h.yv*dt;
    h.pv+=((hp+f.headT[1]*0-h.pitch)*45-h.pv*9)*dt;h.pitch+=h.pv*dt;
    h.rv+=((f.headT[2]-h.roll)*30-h.rv*7)*dt;h.roll+=h.rv*dt;
    if(f.freeze>0){h.pitch=0.7;}
    f.headT[2]*=Math.exp(-dt*0.5);
  }
  // keep inside world
  f.p[0]=clamp(f.p[0],-GS+0.6,GS-0.6);f.p[2]=clamp(f.p[2],-GS+0.6,GS-0.6);
  // catch mode safety net: the frog is never below the ground it stands on
  if(Game.on&&f.st!=='swim'&&f.st!=='held'){const s0=surfAt(f.p[0],f.p[2]);if(s0.type!=='water'&&f.p[1]<s0.y-0.002)f.p[1]=s0.y;}
  // sit on rock tracking
  if(f.surf==='rock'&&f.rock){f.p[1]=f.rock.p[1]+f.rock.sc[1]*0.85;}
  if(f.st==='idle'&&f.surf==='ground'){const s=surfAt(f.p[0],f.p[2]);if(s.type==='water'&&Game.ctrl){f.st='swim';f.surf='water';f.swimTgt=null;}else f.p[1]+=(s.y-f.p[1])*Math.min(1,dt*10);}
  // pusher through vegetation handled in buildPushers
}
function waterBob(){return 0.004*Math.sin(W.t*1.7+frog.p[0]*3);}
function wrapA(a){while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a;}
function land(s,impact){
  const f=frog;f.surf=s.type==='water'?'water':s.type;f.sqv=Math.min(3.5,impact*1.2);f.st='land';f.t=0;f.freeFall=false;f.pitch=0;
  f.pad=null;f.rock=null;
  if(s.type==='water'){
    splash(f.p[0],f.p[2],clamp(0.35+impact*0.18,0.35,1.2));
    f.p[1]=WATER_Y-0.03;f.surf='water';f.st='swim';f.swimTgt=null;f.swimT=0;f.t=0;
    if(f.plan&&f.plan.after==='hide'){f.hid=1;}
  }else if(s.type==='pad'){
    f.surf='pad';f.pad=s.pad;f.padOff=[f.p[0]-s.pad.x,f.p[2]-s.pad.z];
    s.pad.vy-=impact*0.35;s.pad.av+=(f.padOff[0])*1.2;s.pad.vx+=f.v[0]*0.08;s.pad.vz+=f.v[2]*0.08;
    addRipple(s.pad.x,s.pad.z,0.012+0.01*impact,0.35,1);addRipple(s.pad.x,s.pad.z,0.006,0.2,1);
    nudgePadsFrom(s.pad.x,s.pad.z,0.5);
    W.events.push({type:'plop'});
    f.padOff=[clamp(f.padOff[0],-s.pad.r*0.5,s.pad.r*0.5),clamp(f.padOff[1],-s.pad.r*0.5,s.pad.r*0.5)];
  }else{
    f.surf=s.type;if(s.type==='rock'){f.rock=s.rock;}
    spawnDust(f.p,Math.min(1.2,0.4+impact*0.15));
    if(impact>3.2&&f.freeFall){f.scared=1.2;f.dizzy=1.5;}
  }
  if(f.freeFall&&s.type!=='water'&&impact>2.2){f.scared=Math.max(f.scared,1.0);}
  f.v=[0,0,0];
}

/* ---- frog geometry: blobs ---- */
function Ry(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];}
function Rx(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c];}
function Rz(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]];}
function ik2(A,T,l1,l2,pole){
  const d=sub(T,A),dd0=vlen(d)||1e-6,dir=mul(d,1/dd0);
  const dd=clamp(dd0,Math.abs(l1-l2)+1e-3,l1+l2-1e-4);
  const a=(l1*l1-l2*l2+dd*dd)/(2*dd),h=Math.sqrt(Math.max(l1*l1-a*a,0));
  let P=sub(pole,mul(dir,dot(pole,dir)));if(vlen(P)<1e-5)P=[0,1,0];P=nrm(P);
  return{J:add(add(A,mul(dir,a)),mul(P,h)),end:add(A,mul(dir,dd))};
}
function blobAxis(p0,p1,r0,r1,col,seed,lenScale,kind){
  const c=mul(add(p0,p1),0.5),d=sub(p1,p0),L=vlen(d)||1e-4,z=mul(d,1/L);
  let x=crs([0,1,0],z);if(vlen(x)<0.05)x=[1,0,0];x=nrm(x);const y=crs(z,x);
  addBlob(c,(r0+r1)*0.5,(r0+r1)*0.5,L*0.5*(lenScale||1.12),kind||3,seed,quatFromAxes(x,y,z),col,0.05);
}
function emitFrog(){
  const f=frog;
  const F=[Math.sin(f.yaw),0,Math.cos(f.yaw)],Lf=[Math.cos(f.yaw),0,-Math.sin(f.yaw)];
  const sit=1-f.crouch*0.3;
  const squash=1-clamp(f.sq,-0.3,0.5)*0.55;
  const breath=1+0.028*Math.sin(f.breath*(f.asleep?1.1:2.2))*(f.asleep?0.8:1);
  const bodyH=(0.056+0.01*f.weight)*(1-0.3*f.crouch)*(squash)*(1-0.15*(f.asleep?1:0))*(1+f.stretch*0.5);
  const base=f.p.slice();
  if(f.st==='air'||f.st==='held')base[1]=f.p[1];
  const C=[base[0],base[1]+bodyH,base[2]];
  // body frame
  const pitch=f.pitch+0.28*(1-f.airW)*(1-0.7*f.crouch)*(f.asleep?0.2:1)+(f.st==='held'?-0.2:0);
  const roll=f.weight*0.06+(f.st==='held'?Math.sin(W.t*3)*0.1*f.hang:0);
  const loc=(v)=>{ // local (x left,y up,z fwd) around body centre
    let q=Rz(v,roll);q=Rx(q,-pitch);const w=Ry(q,f.yaw);return add(C,w);
  };
  const dir=(v)=>{let q=Rz(v,roll);q=Rx(q,-pitch);return Ry(q,f.yaw);};
  const col=FROG_G;const sd=f.seedFrog||(f.seedFrog=3.7);
  const sxz=(1+0.12*(1-squash))*(1-f.stretch*0.2),sy=squash*(1+f.stretch*0.4);
  const rotQ=(ax,ay,az)=>quatFromAxes(ax,ay,az);
  const qBody=(()=>{const z=dir([0,0,1]),y=dir([0,1,0]),x=crs(y,z);return quatFromAxes(x,y,z);})();
  // torso + rump + belly
  addBlob(loc([0,0,0.005]),0.088*sxz*breath,0.072*sy*breath,0.125*sxz,3,sd,qBody,col,0.04);
  addBlob(loc([0,-0.008,-0.075]),0.098*sxz,0.075*sy,0.09*sxz,3,sd+1,qBody,col,0.05);
  addBlob(loc([0,-0.043,0.0]),0.078*sxz,0.046*sy,0.108,3,sd+2,qBody,col,0.03);
  // head
  const hh=f.head;
  const headLoc=(v)=>{const piv=[0,0.03,0.085];let q=sub(v,piv);q=Rz(q,hh.roll);q=Rx(q,-hh.pitch*0.9);q=Ry(q,hh.yaw);return loc(add(q,piv));};
  const hdir=(v)=>{let q=Rz(v,hh.roll);q=Rx(q,-hh.pitch*0.9);q=Ry(q,hh.yaw);return dir(q);};
  const qHead=(()=>{const z=hdir([0,0,1]),y=hdir([0,1,0]),x=crs(y,z);return quatFromAxes(x,y,z);})();
  addBlob(headLoc([0,0.046,0.118]),0.083,0.056,0.078,3,sd+3,qHead,col,0.035);
  addBlob(headLoc([0,0.034,0.178]),0.055,0.04,0.046,3,sd+4,qHead,col,0.03);
  // throat sac
  const th=f.throat;
  addBlob(headLoc([0,-0.002,0.15]),0.04+0.012*th,0.026+0.01*th,0.05+0.008*th,3,sd+5,qHead,col,0.02);
  // eyes
  const eyeGaze=nrm(sub(f.gaze,headLoc([0,0.098,0.14])));
  const lidClose=f.closure;
  for(const s of [1,-1]){
    const ec=headLoc([0.052*s,0.1,0.135]);
    // eye socket bulge
    addBlob(headLoc([0.052*s,0.092,0.128]),0.036,0.026,0.034,3,sd+6+s,qHead,col,0.02);
    let z=eyeGaze;const lim=hdir([0.7*s,0.2,0.7]);z=nrm(add(mul(z,0.55),mul(hdir([s*0.35,0.15,1]),0.45)));
    let x=crs([0,1,0],z);if(vlen(x)<0.05)x=[1,0,0];x=nrm(x);const y=crs(z,x);
    addBlob(ec,0.031,0.031,0.031,4,sd+9+s,quatFromAxes(x,y,z),[lidClose,f.pupil,s],0.0);
  }
  // nostrils & mouth
  for(const s of [1,-1])addBlob(headLoc([0.018*s,0.056,0.214]),0.0055,0.0045,0.0055,1,sd,qHead,[0.03,0.07,0.03],0.0);
  const mo=f.mouth;
  addBlob(headLoc([0,0.022-0.012*mo,0.17]),0.058,0.0045+0.014*mo,0.052,1,sd+2,qHead,[0.03,0.09,0.03].map((v,i)=>mo>0.1?[0.35,0.06,0.08][i]:v),0.0);
  if(mo>0.08){addBlob(headLoc([0,0.012-0.03*mo,0.172]),0.05,0.012,0.045,3,sd+7,qHead,col,0.02);}
  // tongue (shared curve with the game's catch detection)
  const Mw=headLoc([0,0.025,0.2]);f.mouthW=Mw;
  if(f.tongue>0.01){
    const M=Mw,tgt=f.tongueAim||add(M,mul(dir([0,0.2,1]),0.4)),e=f.tongue,droop=f.droop||0;
    const N=Math.max(9,Math.round(Math.min(dist(M,tgt),2)*12));
    const pts=[];for(let i=0;i<=N;i++)pts.push(tonguePt(M,tgt,i/N*e,droop,f.tongueMax||0.5));
    for(let i=0;i<N;i++){const r0=0.0105-0.004*i/N,r1=0.0105-0.004*(i+1)/N;blobAxis(pts[i],pts[i+1],r0*(1-0.25*e),r1*(1-0.25*e),srgb([0.9,0.35,0.42]),sd,1.35,1);}
    addBlob(pts[N],0.014,0.011,0.014,1,sd,QI,srgb([0.95,0.45,0.52]),0.05);
  }
  if(Game.crownT>0){const hc=headLoc([0,0.12,0.1]);for(let k=0;k<5;k++){const a=k/5*TAU;addBlob(add(hc,[Math.cos(a)*0.03,0.02*(k%2)+0.01*Math.sin(W.t*8+k),Math.sin(a)*0.03]),0.009,0.017,0.009,1,k,QI,srgb([1,0.8,0.15]),0.05);}addBlob(add(hc,[0,0.006,0]),0.032,0.008,0.032,1,1,QI,srgb([1,0.75,0.12]),0.03);}
  // legs
  const surfY=(p)=>{if(f.surf==='ground')return terrainH(p[0],p[2]);if(f.surf==='pad')return WATER_Y+0.012+(f.pad?f.pad.dy:0);if(f.surf==='rock'&&f.rock)return f.rock.p[1]+f.rock.sc[1]*0.85;return base[1];};
  const lerpP=(a,b,t)=>lerp3(a,b,clamp(t,0,1));
  const tAir=f.airW;
  const prog=f.st==='air'?clamp(f.tAir/Math.max(0.2,(f.plan?f.plan.T:0.5)),0,1):0;
  const crawl=f.st==='crawl'?1:0;
  for(const s of [1,-1]){ // s=+1 left
    // ---- front leg
    const shoulder=loc([0.062*s,-0.012,0.065]);
    let hand;
    { const gw=[0.048*s,0,0.125]; const gwW=add(add(base,mul(Lf,gw[0])),mul(F,gw[2]));gwW[1]=surfY(gwW)+0.008;
      let hg=gwW;
      if(crawl){const ph=Math.sin(f.legPh*1.6+(s>0?0:Math.PI));hg=add(hg,add(mul(F,ph*0.03),[0,Math.max(0,ph)*0.025,0]));}
      const aw=loc([0.055*s,-0.03,0.2+0.1*prog]);const tuck=loc([0.055*s,-0.05,0.1]);
      const sw=loc([0.05*s,-0.14,0.07]);
      let air=f.st==='held'?sw:(f.st==='swim'?lerpP(tuck,loc([0.05*s,-0.03+0.015*Math.sin(f.swimPh*2+s),0.13]),0.5):aw);
      hand=lerpP(hg,air,tAir);
    }
    const ik=ik2(shoulder,add(hand,[0,0.012,0]),0.06,0.06,add(mul(F,-1),mul(Lf,0.3*s)));
    blobAxis(shoulder,ik.J,0.03,0.022,col,sd+10*s,1.1);blobAxis(ik.J,ik.end,0.022,0.015,col,sd+11*s,1.1);
    addBlob(add(hand,[0,0.006,0.004]),0.017,0.011,0.024,3,sd+12,qBody,col,0.04);
    for(let k=0;k<4;k++){const a=(k-1.5)*0.45;const dr=nrm(add(mul(F,Math.cos(a)),mul(Lf,Math.sin(a)*s)));const tp=madd(hand,dr,0.03);blobAxis(add(hand,[0,0.004,0]),add(tp,[0,0.003,0]),0.006,0.0055,col,sd+k,1.05);addBlob(add(tp,[0,0.003,0]),0.0065,0.005,0.0065,3,sd+k,QI,col,0.05);}
    // ---- hind leg
    const hip=loc([0.075*s,-0.005,-0.07]);
    let toe;
    { const gw=[0.12*s+0.01*f.weight,0,-0.015-0.03*f.crouch]; const gwW=add(add(base,mul(Lf,gw[0])),mul(F,gw[2]));gwW[1]=surfY(gwW)+0.006;
      let tg=gwW;
      if(crawl){const ph=Math.sin(f.legPh*1.6+(s>0?Math.PI:0));tg=add(tg,add(mul(F,ph*0.035),[0,Math.max(0,ph)*0.03,0]));}
      const ext=loc([0.05*s,-0.045,-0.27*(0.5+0.5*Math.min(1,prog*3))+0.14*clamp((prog-0.6)*2.5,0,1)]);
      const kick=f.swimPh*2+(s>0?0:Math.PI*0.6);
      const sw=loc([(0.07+0.04*Math.sin(kick))*s,-0.075-0.03*Math.cos(kick),-0.14-0.09*Math.sin(kick)]);
      const hang=loc([0.045*s,-0.15,-0.04-f.hang*0.2*Math.sin(W.t*4+s)]);
      let air=f.st==='held'?hang:(f.st==='swim'?sw:ext);
      toe=lerpP(tg,air,tAir);
    }
    const ankle=add(toe,add(mul(F,-0.045),[0,0.04,0]));
    const ikh=ik2(hip,ankle,0.098,0.098,add(F,mul(Lf,0.55*s)));
    blobAxis(hip,ikh.J,0.062,0.04,col,sd+20*s,1.12);blobAxis(ikh.J,ikh.end,0.038,0.022,col,sd+21*s,1.12);
    // foot + toes + webbing
    const fdir=nrm(sub(toe,ikh.end));
    blobAxis(ikh.end,toe,0.017,0.013,col,sd+22*s,1.0);
    const toeBase=toe;
    const fan=[];
    for(let k=0;k<5;k++){
      const a=(k-2)*0.32+0.1*Math.sin(f.legPh*0.3+k+s)*0.5*(f.st==='idle'?1:0);
      const dr=nrm(add(mul(F,Math.cos(a)),mul(Lf,Math.sin(a)*s)));
      const len=0.058+0.01*(2-Math.abs(k-2))*0.5;
      const tip=add(madd(toeBase,dr,len),[0,tAir>0.5?-0.01*(2-Math.abs(k-2)):0,0]);
      fan.push(tip);
      blobAxis(add(toeBase,[0,0.004,0]),add(tip,[0,0.003,0]),0.0075,0.0062,col,sd+k,1.0);addBlob(add(tip,[0,0.003,0]),0.0072,0.0055,0.0072,3,sd+k,QI,col,0.05);
    }
    for(let k=0;k<4;k++){ // webbing between toes
      const m=mul(add(fan[k],fan[k+1]),0.5);const wc=lerp3(toeBase,m,0.55);
      const wd=sub(m,toeBase);const wl=vlen(wd);const z=mul(wd,1/(wl||1));let x=crs([0,1,0],z);x=nrm(x);const y=crs(z,x);
      addBlob(add(wc,[0,0.003,0]),Math.hypot(fan[k][0]-fan[k+1][0],fan[k][2]-fan[k+1][2])*0.5,0.0016,wl*0.5,3,sd+k,quatFromAxes(x,y,z),srgb([0.4,0.62,0.22]),0.0);
    }
  }
}
function frogStatus(){return{state:frog.st==='idle'&&frog.asleep?'sleeping':frog.st,mood:frog.mood,surf:frog.surf};}

// ======================================================================
// ECOSYSTEM: insects, fish, bird shadow, weather, time of day, interaction
// ======================================================================

/* ============================== insects ============================== */
function makeCreature(kind,p){
  return{kind,p:p.slice(),v:[0,0,0],F:[1,0,0],size:0.03,phase:rand()*TAU,amp:0.9,base:0,cA:[1,1,1],cB:[0,0,0],st:'fly',tm:rnd(0,3),tgt:null,held:false,flee:0,hz:10,seed:rand()*20,turn:0,idx:0,activeIdx:true};
}
function buildCreatures(){
  creatures=[];
  const bfCols=[[[0.95,0.5,0.08],[0.05,0.03,0.02]],[[0.25,0.45,0.95],[0.04,0.06,0.15]],[[0.98,0.88,0.15],[0.1,0.07,0.02]],[[0.95,0.95,0.9],[0.2,0.2,0.2]],[[0.85,0.25,0.15],[0.08,0.04,0.03]],[[0.7,0.4,0.9],[0.1,0.05,0.15]],[[0.95,0.6,0.7],[0.1,0.05,0.07]],[[0.3,0.75,0.6],[0.05,0.1,0.08]]];
  for(let i=0;i<8;i++){const c=makeCreature(0,[rnd(-5,5),rnd(0.5,1.2),rnd(-4,5)]);c.size=rnd(0.035,0.046);c.cA=srgb(bfCols[i][0]);c.cB=srgb(bfCols[i][1]);c.hz=rnd(8,11);c.idx=i;creatures.push(c);}
  for(let i=0;i<10;i++){const c=makeCreature(1,[rnd(-5,5),rnd(0.4,1.0),rnd(-4,5)]);c.size=rnd(0.012,0.014);c.cA=srgb([0.95,0.72,0.08]);c.cB=srgb([0.04,0.03,0.02]);c.hz=34;c.idx=i;creatures.push(c);}
  for(let i=0;i<4;i++){const c=makeCreature(3,[rnd(-1.5,1.5),rnd(0.4,0.9),rnd(-1,1)]);c.size=0.022;c.cA=srgb([[0.1,0.35,0.8],[0.1,0.6,0.35],[0.7,0.15,0.1],[0.4,0.2,0.7]][i]);c.cB=srgb([0.1,0.12,0.15]);c.hz=36;c.idx=i;creatures.push(c);}
  for(let i=0;i<8;i++){
    let x,z;for(let k=0;k<30;k++){const a=rand()*TAU,r=Math.sqrt(rand());x=Math.cos(a)*r*2.2;z=Math.sin(a)*r*1.6;if(pondD(x,z)<-0.4)break;}
    const c=makeCreature(2,[x,WATER_Y+0.004,z]);c.size=0.008;c.cA=srgb([0.18,0.14,0.08]);c.cB=srgb([0.05,0.04,0.03]);c.st='skate';c.idx=i;c.tgt=[x,z];c.tm=rnd(1,4);creatures.push(c);}
}
function flowerHeads(){
  const hs=[];
  for(const p of plants){const f=p.flower;if(f&&!f.picked&&(f.open>0.35||p.sp.spike)&&p.g>0.6&&W.dayOpen>0.5){const fr=flowerFrame(p);hs.push({p:madd(fr.top,fr.axis,0.03),plant:p});}}
  return hs;
}
function rayDist(ro,rd,p){const op=sub(p,ro),t=dot(op,rd);if(t<0)return 1e9;return vlen(sub(op,mul(rd,t)));}
function setHeading(c,dir,dt,rate){
  const l=vlen(dir);if(l<1e-4)return;const d=mul(dir,1/l);
  const a=Math.atan2(c.F[0],c.F[2]),b=Math.atan2(d[0],d[2]);let da=b-a;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
  c.turn=da;const na=a+da*Math.min(1,dt*rate);const pitch=clamp(d[1],-0.7,0.7);
  c.F=nrm([Math.sin(na)*Math.cos(Math.asin(pitch)),pitch,Math.cos(na)*Math.cos(Math.asin(pitch))]);
}
function flyTowards(c,tgt,speed,dt,wob,acc){
  const d=sub(tgt,c.p),l=vlen(d)||1e-6,dir=mul(d,1/l);const t=W.t+c.seed;
  const wv=[Math.sin(t*3.1)*wob,Math.sin(t*4.3)*wob*0.7,Math.cos(t*2.7)*wob];
  const sp=Math.min(speed,l*3+0.1);
  const want=[dir[0]*sp+wv[0],dir[1]*sp+wv[1],dir[2]*sp+wv[2]];
  for(let a=0;a<3;a++)c.v[a]+=(want[a]-c.v[a])*Math.min(1,dt*(acc||3));
  c.p[0]+=c.v[0]*dt;c.p[1]+=c.v[1]*dt;c.p[2]+=c.v[2]*dt;
  setHeading(c,c.v,dt,6);return l;
}
function scaredC(c){
  if(W.ray&&W.cursorMove>0&&rayDist(W.ray.o,W.ray.d,c.p)<0.28)return true;
  const f=frog;if(f.st==='air'||f.st==='crouch'||f.st==='tongue'){if(Math.hypot(c.p[0]-f.p[0],c.p[2]-f.p[2])<0.3&&c.p[1]<0.4&&f.st!=='tongue')return true;}
  return false;
}
function respawnInsect(c){
  const a=rand()*TAU;c.p=[Math.cos(a)*7,rnd(0.8,1.6),Math.sin(a)*6];c.v=[0,0,0];c.st='fly';c.tgt=null;c.caught=false;c.flee=0;
}
function updateCreatures(dt){
  const t=W.t;
  const heads=flowerHeads();
  const shelter=W.rain>0.35||W.night>0.7;
  const counts={0:0,1:0,2:0,3:0};
  for(const c of creatures){
    if(c.game)continue;
    const lim={0:8,1:10,2:8,3:4}[c.kind];
    c.activeIdx=c.idx<Math.round(lim*S.density)&&!(Game.on&&(c.kind===0||c.kind===1));
    if(!c.activeIdx)continue;
    if(c.caught){respawnInsect(c);continue;}
    c.phase+=dt*TAU*c.hz;
    if(c.kind<=1){
      const isB=c.kind===0;
      if(c.flee>0){c.flee-=dt;const away=W.ray?sub(c.p,W.ray.o):[1,0.4,0];flyTowards(c,add(c.p,[away[0],Math.abs(away[1])+1.0,away[2]]),isB?2.2:3.5,dt,0.4,4);c.amp=0.95;c.hz=isB?13:40;if(c.flee<=0){c.st='fly';c.tgt=null;}continue;}
      if(scaredC(c)){c.flee=1.2;c.st='fly';c.tgt=null;continue;}
      if(c.st==='fly'){
        if(shelter&&rand()<dt*0.5){c.st='shelter';c.tgt=null;continue;}
        if(!c.tgt||!c.tgt.plant.flower||c.tgt.plant.flower.picked){c.tgt=heads.length?heads[Math.floor(rand()*heads.length)]:null;}
        const target=c.tgt?c.tgt.p:[Math.sin(t*0.2+c.seed)*3,1.1,Math.cos(t*0.17+c.seed)*3];
        c.amp=isB?0.95:0.8;c.hz=isB?rnd(10,12):38;
        const d=flyTowards(c,target,isB?0.9:1.6,dt,isB?0.55:0.25,isB?2.2:3.2);
        const gy=terrainH(c.p[0],c.p[2])+0.08;if(c.p[1]<gy)c.p[1]=gy;
        if(c.tgt&&d<0.05){c.st='land';c.tm=isB?rnd(3,7):rnd(2.5,4.5);c.v=[0,0,0];}
      }else if(c.st==='land'){
        c.tm-=dt;
        if(c.tgt&&c.tgt.plant.flower&&!c.tgt.plant.flower.picked){
          const fr=flowerFrame(c.tgt.plant);const tp=madd(fr.top,fr.axis,0.05);c.p=lerp3(c.p,tp,Math.min(1,dt*10));
          if(isB){c.amp=0.35+0.25*Math.sin(t*1.3+c.seed);c.hz=1.2+0.4*Math.sin(t+c.seed);}else{c.amp=0.3;c.hz=30;}
        }
        if(c.tm<=0||shelter){c.st=shelter?'shelter':'fly';c.tgt=null;}
      }else if(c.st==='shelter'){
        c.amp=0.1;c.hz=0.5;if(!c.shel)c.shel=plants[Math.floor(rand()*plants.length)];
        const top=c.shel.ch.pos[Math.min(1,c.shel.n)];const d=flyTowards(c,[top[0],top[1]+0.1,top[2]],0.8,dt,0.1,3);if(d<0.05)c.v=[0,0,0];
        if(!shelter){c.st='fly';c.shel=null;}
      }
    }else if(c.kind===3){
      c.amp=0.7;c.hz=36;
      if(c.flee>0){c.flee-=dt;flyTowards(c,add(c.p,[rnd(-2,2),1,rnd(-2,2)]),4,dt,0.3,4);continue;}
      if(scaredC(c)){c.flee=0.8;continue;}
      c.tm-=dt;
      if(!c.tgt||c.tm<=0){
        const a=rand()*TAU,r=Math.sqrt(rand());
        c.tgt={p:[Math.cos(a)*r*2.8,rnd(0.25,0.9),Math.sin(a)*r*2.0]};c.tm=rnd(1.2,3.2);c.st='fly';
        if(rand()<0.25){const pd=pads.length?pads[Math.floor(rand()*pads.length)]:null;if(pd){c.tgt={p:[pd.x,WATER_Y+0.08,pd.z]};c.st='perch';c.tm=2.2;}}
        else if(rand()<0.2){c.st='dip';c.tgt={p:[c.tgt.p[0],WATER_Y+0.05,c.tgt.p[2]]};c.tm=2;}
      }
      const d=flyTowards(c,c.tgt.p,c.st==='dip'?1.4:2.4,dt,0.15,5);
      if(c.st==='dip'&&c.p[1]<WATER_Y+0.09&&!c.dipped){c.dipped=true;addRipple(c.p[0],c.p[2],0.008,0.2,1);}
      if(d<0.1){if(c.st==='dip'){c.st='fly';c.dipped=false;c.tm=0;}else if(c.st==='perch'){c.v=[0,0,0];c.amp=0.2;c.hz=1;}else{c.st='hover';c.v=[c.v[0]*0.2,0,c.v[2]*0.2];}}
    }else if(c.kind===2){
      // water strider
      c.amp=0;c.hz=0;c.tm-=dt;
      if(!c.tgt||c.tm<=0){const a=rand()*TAU,r=Math.sqrt(rand());c.tgt=[Math.cos(a)*r*2.3,Math.sin(a)*r*1.7];c.tm=rnd(1.5,5);}
      let tx=c.tgt[0],tz=c.tgt[1];
      const fd=Math.hypot(c.p[0]-frog.p[0],c.p[2]-frog.p[2]);
      if(fd<0.5&&frog.surf==='water'){tx=c.p[0]+(c.p[0]-frog.p[0])*3;tz=c.p[2]+(c.p[2]-frog.p[2])*3;}
      const dx=tx-c.p[0],dz=tz-c.p[2],d=Math.hypot(dx,dz)||1;
      const sp=d>0.15?0.18:0;c.v=[dx/d*sp,0,dz/d*sp];
      const nx=c.p[0]+c.v[0]*dt,nz=c.p[2]+c.v[2]*dt;if(pondD(nx,nz)<-0.3){c.p[0]=nx;c.p[2]=nz;}else c.tm=0;
      c.p[1]=WATER_Y+0.006;
      if(sp>0)c.F=nrm([c.v[0],0,c.v[2]]);
      if(sp>0&&rand()<dt*1.5)addRipple(c.p[0],c.p[2],0.003,0.07,0);
    }
  }
}
/* fireflies */
function buildFlies(){
  flies=[];
  for(let i=0;i<70;i++){const b=BEDS[i%4];flies.push({p:[b[0]+rnd(-b[2],b[2]),rnd(0.3,1.8),b[1]+rnd(-b[3],b[3])],v:[0,0,0],ph:rand()*TAU,sp:rnd(0.6,1.4),seed:rand()*100,home:[b[0]*0.8,b[1]*0.8],idx:i});}
}
function updateFlies(dt){
  const t=W.t;
  for(const f of flies){
    const a=t*0.3*f.sp+f.seed;
    const tx=f.home[0]+Math.sin(a*1.3+f.seed)*3.5+Math.sin(a*0.5)*2,tz=f.home[1]+Math.cos(a*1.1)*3.0+Math.cos(a*0.37+f.seed)*2,ty=0.6+0.5*Math.sin(a*1.7+f.seed*3)+0.35*Math.sin(a*0.7);
    f.v[0]+=(tx-f.p[0])*0.6*dt+Math.sin(t*2+f.seed)*0.02;f.v[1]+=(ty-f.p[1])*0.9*dt;f.v[2]+=(tz-f.p[2])*0.6*dt+Math.cos(t*1.7+f.seed)*0.02;
    f.v=f.v.map(x=>x*Math.exp(-1.2*dt));f.p[0]+=f.v[0]*dt;f.p[1]+=f.v[1]*dt;f.p[2]+=f.v[2]*dt;
    f.p[1]=Math.max(f.p[1],terrainH(f.p[0],f.p[2])+0.15,WATER_Y+0.15);
  }
}
/* ============================== fish (boids) ============================== */
let fish=[];
function buildFish(){
  fish=[];
  for(let i=0;i<14;i++){
    let x,z;for(let k=0;k<30;k++){const a=rand()*TAU,r=Math.sqrt(rand());x=Math.cos(a)*r*1.9;z=Math.sin(a)*r*1.3;if(pondD(x,z)<-0.8)break;}
    const a=rand()*TAU;
    fish.push({p:[x,-rnd(0.15,0.4),z],v:[Math.cos(a)*0.3,0,Math.sin(a)*0.3],ph:rand()*TAU,seed:rand()*20,size:rnd(0.045,0.065),idx:i,
      col:rand()<0.45?srgb([0.95,0.5,0.12]):(rand()<0.5?srgb([0.55,0.5,0.4]):srgb([0.85,0.8,0.7])),rise:0,rt:rnd(8,25),dy:rnd(0.15,0.4)});
  }
}
function updateFish(dt){
  const n=Math.round(14*S.density);
  for(const f of fish){
    if(f.idx>=n)continue;
    let ax=0,az=0,sx=0,sz=0,cx=0,cz=0,vx=0,vz=0,cnt2=0;
    for(const o of fish){if(o===f||o.idx>=n)continue;const dx=o.p[0]-f.p[0],dz=o.p[2]-f.p[2],d=Math.hypot(dx,dz);
      if(d<0.9){cnt2++;cx+=o.p[0];cz+=o.p[2];vx+=o.v[0];vz+=o.v[2];if(d<0.22){sx-=dx/(d+0.03);sz-=dz/(d+0.03);}}}
    if(cnt2){ax+=(cx/cnt2-f.p[0])*0.35+(vx/cnt2-f.v[0])*0.8;az+=(cz/cnt2-f.p[2])*0.35+(vz/cnt2-f.v[2])*0.8;}
    ax+=sx*0.7;az+=sz*0.7;
    // wander
    ax+=Math.sin(W.t*0.5+f.seed)*0.12;az+=Math.cos(W.t*0.43+f.seed*1.3)*0.12;
    // stay in the deep water
    const d=pondD(f.p[0],f.p[2]);if(d>-1.2){const gx=-f.p[0],gz=-f.p[2],gl=Math.hypot(gx,gz)||1;ax+=gx/gl*(d+1.2)*4;az+=gz/gl*(d+1.2)*4;}
    // avoid frog + cursor disturbances
    const fr=frog;
    const fdx=f.p[0]-fr.p[0],fdz=f.p[2]-fr.p[2],fd=Math.hypot(fdx,fdz);
    let flee=0;
    if(fd<0.9&&(fr.surf==='water'||fr.st==='air')){const k=(1-fd/0.9)*5;ax+=fdx/(fd+0.01)*k;az+=fdz/(fd+0.01)*k;flee=Math.max(flee,k*0.2);}
    if(W.disturb&&W.disturb.t>W.t-2){const dd=Math.hypot(f.p[0]-W.disturb.x,f.p[2]-W.disturb.z);if(dd<1.4){const k=(1-dd/1.4)*6;ax+=(f.p[0]-W.disturb.x)/(dd+0.01)*k;az+=(f.p[2]-W.disturb.z)/(dd+0.01)*k;flee=Math.max(flee,k*0.25);}}
    f.v[0]+=ax*dt;f.v[2]+=az*dt;
    const sp=Math.hypot(f.v[0],f.v[2]),want=0.32+flee*0.6,lim=Math.min(want,0.95);
    if(sp>lim){f.v[0]*=lim/sp;f.v[2]*=lim/sp;}else if(sp<0.12){f.v[0]+=Math.cos(f.seed)*0.05;f.v[2]+=Math.sin(f.seed)*0.05;}
    f.p[0]+=f.v[0]*dt;f.p[2]+=f.v[2]*dt;
    if(pondD(f.p[0],f.p[2])>-0.8){const gl=Math.hypot(f.p[0],f.p[2])||1,nx=-f.p[0]/gl,nz=-f.p[2]/gl;for(let k=0;k<30&&pondD(f.p[0],f.p[2])>-0.8;k++){f.p[0]+=nx*0.04;f.p[2]+=nz*0.04;}const vn=f.v[0]*nx+f.v[2]*nz;if(vn<0){f.v[0]-=1.6*vn*nx;f.v[2]-=1.6*vn*nz;}}
    // depth: occasionally rise to surface
    f.rt-=dt;if(f.rt<=0){f.rise=2;f.rt=rnd(10,30);}
    if(f.rise>0){f.rise-=dt;f.p[1]+=((-0.045)-f.p[1])*dt*1.5;if(f.rise<=0.05&&!f.popped){f.popped=true;addRipple(f.p[0],f.p[2],0.006,0.15,0);}}
    else{f.popped=false;f.p[1]+=((-f.dy)-f.p[1])*dt*0.8;}
    f.p[1]=Math.max(f.p[1],terrainH(f.p[0],f.p[2])+0.04);
    f.ph+=dt*(5+sp*14);
  }
}
function emitFish(){
  const n=Math.round(14*S.density);
  for(const f of fish){
    if(f.idx>=n)continue;
    const sp=Math.hypot(f.v[0],f.v[2]);const F=sp>0.01?nrm([f.v[0],0,f.v[2]]):[1,0,0];
    const R=nrm(crs([0,1,0],F));const U=crs(F,R);
    const q=quatFromAxes(R,U,F);const s=f.size;
    const wag=Math.sin(f.ph)*0.35;
    addBlob(f.p,s*0.38,s*0.34,s*1.1,1,f.seed,q,f.col,0.05);
    const tailC=madd(f.p,F,-s*1.15);const tp=madd(tailC,R,wag*s*0.8);
    const dirT=nrm(sub(tp,f.p));
    let xt=crs([0,1,0],dirT);xt=nrm(xt);const yt=crs(dirT,xt);
    addBlob(tp,s*0.06,s*0.4,s*0.5,1,f.seed,quatFromAxes(xt,yt,dirT),f.col.map(v=>v*0.8),0.0);
    addBlob(madd(f.p,U,s*0.3),s*0.04,s*0.26,s*0.45,1,f.seed,q,f.col.map(v=>v*0.7),0.0);
  }
}

/* ============================== bird shadow ============================== */
function updateBird(dt){
  if(Game.on){W.bird=null;W.birdShadow=null;return;}
  if(!W.bird){W.birdT-=dt;if(W.birdT<=0&&W.storm<0.5){const a=rand()*TAU;const r=9;const sx=Math.cos(a)*r,sz=Math.sin(a)*r;const off=rnd(-1.2,1.2);
    W.bird={sx,sz,ex:-sx+(-Math.sin(a))*off,ez:-sz+Math.cos(a)*off,t:0,dur:rnd(7,10)};}}
  if(W.bird){const b=W.bird;b.t+=dt;const k=b.t/b.dur;
    W.birdShadow={x:lerp(b.sx,b.ex,k),z:lerp(b.sz,b.ez,k),r:1.0,s:0.62*Math.min(1,Math.sin(Math.PI*clamp(k,0,1))*3)};
    if(k>=1){W.bird=null;W.birdShadow=null;W.birdT=rnd(50,110);}}
}

/* ============================== time & environment ============================== */
const ENV=new Float32Array(336);
function computeSky(){
  const h=W.hour,a=(h-6)/12*Math.PI;
  const sun=nrm([-Math.cos(a)*0.9,Math.sin(a),0.4]),moon=nrm([Math.cos(a)*0.9,-Math.sin(a),-0.4]);
  W.sunDir=sun;W.moonDir=moon;const e=sun[1];
  const dayF=sstep(-0.08,0.12,e),night=1-sstep(-0.22,0.0,e);
  W.night=night;W.dayOpen=sstep(-0.02,0.22,e);
  const col=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
  const topDay=[0.07,0.21,0.62],horDay=[0.42,0.60,0.86],topNight=[0.003,0.008,0.03],horNight=[0.012,0.02,0.05];
  const topTw=[0.10,0.12,0.30],horTw=[1.05,0.42,0.2];
  const wd=sstep(-0.12,0.35,e);
  let top=col(topNight,topDay,wd),hor=col(horNight,horDay,wd);
  const tw=Math.max(0,1-Math.abs(e-0.02)/0.28);
  top=col(top,topTw,tw*0.45);hor=col(hor,horTw,tw*0.85);
  const cov=W.cover*0.65+W.storm*0.2;
  const gray=v=>{const l=(v[0]+v[1]+v[2])/3;return[l,l*1.02,l*1.08];};
  top=col(top,mul(gray(top),0.55),cov);hor=col(hor,mul(gray(hor),0.7),cov);
  top=mul(top,1-0.35*W.storm);hor=mul(hor,1-0.25*W.storm);
  const sunI=3.4*sstep(0.0,0.3,e)*(1-0.35*W.cover);
  const moonI=0.22*sstep(-0.05,0.25,moon[1])*(1-sstep(0.0,0.2,e));
  const lf=sstep(-0.06,0.06,e);
  const L=nrm([lerp(moon[0],sun[0],lf),lerp(moon[1],sun[1],lf),lerp(moon[2],sun[2],lf)]);
  const sunCol=col([0.55,0.7,1.0],col([1.0,0.45,0.18],[1.0,0.94,0.84],sstep(0.0,0.5,e)),lf);
  const lightI=Math.max(sunI*lf+moonI*(1-lf),0);
  W.light={dir:L,col:sunCol,I:lightI*(1-0.45*W.cover*(1-W.storm*0))};
  const amb=[0.22*(1-night*0.8)+0.01,0.2*(1-night*0.8)+0.012,0.14*(1-night*0.8)+0.02];
  amb[0]+=0.2*tw;amb[1]+=0.11*tw;amb[2]+=0.06*tw;
  W.env={top,hor,amb,fog:[col(hor,[0.04,0.05,0.08],night*0.6)],fogD:0.012+0.03*W.rain+0.01*W.cover};
  W.exposure=lerp(1.0,3.0,night);
}
function lightMat(){
  const L=W.light.dir;const eye=[L[0]*40,L[1]*40,L[2]*40];
  const up=Math.abs(L[1])>0.95?[0,0,1]:[0,1,0];
  const z=nrm(eye),x=nrm(crs(up,z)),y=crs(z,x);
  const V=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  const ext=13,n=1,f=85;
  const P=[1/ext,0,0,0,0,1/ext,0,0,0,0,1/(n-f),0,0,0,n/(n-f),1];
  const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=P[k*4+r]*V[c*4+k];o[c*4+r]=s;}
  return o;
}
function fillEnv(){
  const E=ENV,e=W.env,L=W.light;
  const lm=lightMat();for(let i=0;i<16;i++)E[i]=lm[i];
  const set=(i,a,b,c,d)=>{E[16+i*4]=a;E[17+i*4]=b;E[18+i*4]=c;E[19+i*4]=d;};
  set(0,L.dir[0],L.dir[1],L.dir[2],L.I);set(1,L.col[0],L.col[1],L.col[2],1);
  set(2,e.top[0],e.top[1],e.top[2],1);set(3,e.hor[0],e.hor[1],e.hor[2],1);
  set(4,e.amb[0],e.amb[1],e.amb[2],2.1-1.0*W.night);
  set(5,e.fog[0][0],e.fog[0][1],e.fog[0][2],e.fogD);
  set(6,W.sunDir[0],W.sunDir[1],W.sunDir[2],W.sunDir[1]);set(7,W.moonDir[0],W.moonDir[1],W.moonDir[2],W.moonDir[1]);
  set(8,wind.dx,wind.dz,W.wind,0);set(9,W.rain,W.wet,W.cover,W.storm);
  set(10,W.t,W.dt,W.night,W.flash);set(11,S.growth,S.strength,W.hour,W.boltAz);
  set(12,W.cloudOff[0],W.cloudOff[1],W.grassH===undefined?1:W.grassH,0);
  const gc=Math.max(2,Math.round(8*Math.min(1,0.4+0.6*S.density)*(W.grassDensity||1)));
  set(13,W.camPos[0],W.camPos[2],0.13,gc);
  const ps=W.pushers;
  for(let k=0;k<16;k++){
    const p=ps[k];
    E[72+k*4]=p?p.x:0;E[73+k*4]=p?p.y:0;E[74+k*4]=p?p.z:0;E[75+k*4]=p?p.r:0;
    E[136+k*4]=p?p.vx:0;E[137+k*4]=p?p.vy:0;E[138+k*4]=p?p.vz:0;E[139+k*4]=p?p.s*S.strength:0;
  }
  const rips=W.ripHigh.concat(W.ripLow);
  for(let k=0;k<16;k++){const r=rips[k];E[200+k*4]=r?r[0]:0;E[201+k*4]=r?r[1]:0;E[202+k*4]=r?r[2]:0;E[203+k*4]=r?r[3]:0;}
  let oc=0;const setOcc=(x,z,r)=>{if(oc<16){E[264+oc*4]=x;E[265+oc*4]=0;E[266+oc*4]=z;E[267+oc*4]=r;oc++;}};
  for(const o of objs)if(o.kind==='rock'&&o.big>0.25)setOcc(o.p[0],o.p[2],o.r*1.1);
  for(const tr of trees)setOcc(tr.base[0],tr.base[2],0.5);
  for(const b of bushes)setOcc(b.x,b.z,b.r);
  for(;oc<16;oc++)E[264+oc*4+3]=0;
  const bs=W.birdShadow;
  E[332]=frog.p[0];E[333]=frog.p[2];E[334]=Game.on?1:0;E[335]=0;
  E[328]=bs?bs.x:0;E[329]=bs?bs.z:0;E[330]=bs?bs.r*1.6:1;E[331]=bs?bs.s:0;
}

/* ============================== update ============================== */
function setWeather(name){
  const m={Sunny:[0.2,0,0],Cloudy:[0.3,0,0.75],Rain:[0.38,0.6,0.7],Storm:[0.95,1.0,0.8]}[name];
  if(m){S.wind=m[0];S.rain=m[1];S.cloud=m[2];S.weather=name;}
}
function weatherLabel(){
  if(S.rain>0.8&&S.wind>0.7)return 'Storm';
  if(S.rain>0.12)return 'Rain';
  if(S.cloud>0.5)return 'Cloudy';
  return 'Sunny';
}
const nowS=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
function update(dt){
  dt=Math.min(dt,1/20);W.dt=dt;
  if(S.paused){computeSky();return;}
  W.t+=dt;
  if(S.auto){S.tod+=dt*24/(10*60);if(S.tod>=24)S.tod-=24;}
  W.hour=S.tod;
  W.grassH=(W.grassH===undefined?1:W.grassH);W.grassH+=((Game.on?0.5:1)-W.grassH)*Math.min(1,dt*1.5);
  const kk=1-Math.exp(-dt*0.35);
  W.wind+=(S.wind-W.wind)*kk;W.rain+=(S.rain-W.rain)*kk;wind.s=W.wind;
  const ang=0.6+0.35*Math.sin(W.t*0.02)+0.2*Math.sin(W.t*0.047);wind.dx=Math.cos(ang);wind.dz=Math.sin(ang);
  const coverT=clamp(Math.max(S.cloud,0.28+0.8*S.rain+0.3*S.wind),0,1);
  W.cover+=(coverT-W.cover)*kk;
  const stormT=clamp((S.rain-0.6)*2.5,0,1)*clamp((S.wind-0.55)*3,0,1);W.storm+=(stormT-W.storm)*kk;
  W.wet+=((W.rain>0.05?1:0)*(W.rain*dt*0.12)-(W.rain<0.1?dt*0.012:0));W.wet=clamp(W.wet,0,1);
  W.cloudOff[0]+=wind.dx*dt*(0.004+0.03*W.wind+0.02*W.storm);W.cloudOff[1]+=wind.dz*dt*(0.004+0.03*W.wind+0.02*W.storm);
  S.weather=weatherLabel();
  if(W.storm>0.25){W.flashT-=dt;if(W.flashT<=0){W.flash=1;W.flashT=rnd(3,10)/(0.5+W.storm);W.boltAz=rand()*TAU-Math.PI;W.flick=0.12;W.events.push({type:'thunder'});}}
  W.flash*=Math.exp(-dt*(W.flick>0?5:9));if(W.flick>0){W.flick-=dt;if(W.flick<=0&&rand()<0.6){W.flash=0.8;W.flick=0.08;}}
  computeSky();
  W.cursorMove=Math.max(0,(W.cursorMove||0)-dt);W.petting=Math.max(0,(W.petting||0)-dt);W.poke=Math.max(0,(W.poke||0)-dt);
  W.clickCount=W.clickCount>0?W.clickCount-dt*0.6:0;
  buildPushers(dt);
  W.ripHigh.length=0;W.ripLow.length=0;
  updatePlants(dt);updateTrees(dt);updateBushes(dt);updateObjs(dt);updateDebris(dt);updatePads(dt);
  gameUpdate(dt);updateBugs(dt);updateCreatures(dt);updateFish(dt);updateFlies(dt);updateBird(dt);updateFrog(dt);updateParticles(dt);
  W.rippleLog=W.rippleLog.filter(x=>x>W.t-3);
  // cursor decays when idle
  if(W.cursor&&W.cursorMove<=0){W.cursor.vx*=0.9;W.cursor.vz*=0.9;}
  W.cursorSpeed*=Math.exp(-dt*3);
}
function buildPushers(dt){
  const ps=[];const c=W.cursor;
  if(c&&c.active){const sp=Math.hypot(c.vx,c.vz);ps.push({x:c.x,y:c.y,z:c.z,r:0.6+Math.min(0.5,sp*0.15),h:1.2,vx:c.vx,vy:0,vz:c.vz,s:(c.pressed?0.9:0.3)+Math.min(1.0,sp*0.3)});}
  const f=frog;if(f.surf!=='water'&&f.surf!=='pad')ps.push({x:f.p[0],y:f.p[1],z:f.p[2],r:0.5,h:0.6,vx:f.v[0],vy:0,vz:f.v[2],s:0.9+(f.st==='crawl'?0.2:0)});
  for(const o of objs){const sp=Math.hypot(o.v[0],o.v[2]);if(!o.rest&&(sp>0.25||o.held)&&o.p[1]<1.2&&ps.length<15)ps.push({x:o.p[0],y:o.p[1],z:o.p[2],r:o.r*2.2+0.2,h:0.8,vx:o.v[0],vy:o.v[1],vz:o.v[2],s:Math.min(1.4,0.3+sp*0.25)});}
  W.pushers=ps.slice(0,16);
}

/* ============================== emit ============================== */
const creatureBuf=[0,1,2,3,4,5].map(()=>new Float32Array(32*20));
const creatureCnt=[0,0,0,0,0,0];
function emitCreatures(){
  creatureCnt.fill(0);
  for(const c of creatures){
    if(!c.activeIdx)continue;
    let F=c.F;if(vlen(F)<0.01)F=[1,0,0];F=nrm(F);
    let R=nrm(crs([0,1,0],F));if(vlen(crs([0,1,0],F))<0.05)R=[1,0,0];
    const bank=clamp(c.turn*0.25,-0.6,0.6)*(c.kind===0?1:0.5)*((c.st==='land'||c.st==='perch')?0:1);
    if(bank!==0)R=nrm(rotAxis(R,F,bank));
    const k=c.kind;const buf=creatureBuf[k];const n=creatureCnt[k]++;if(n>=32)continue;const o=n*20;
    buf[o]=c.p[0];buf[o+1]=c.p[1];buf[o+2]=c.p[2];buf[o+3]=c.size;
    buf[o+4]=F[0];buf[o+5]=F[1];buf[o+6]=F[2];buf[o+7]=c.phase;
    buf[o+8]=R[0];buf[o+9]=R[1];buf[o+10]=R[2];buf[o+11]=c.amp;
    buf[o+12]=c.cA[0];buf[o+13]=c.cA[1];buf[o+14]=c.cA[2];buf[o+15]=k;
    buf[o+16]=c.cB[0];buf[o+17]=c.cB[1];buf[o+18]=c.cB[2];buf[o+19]=c.base||0;
  }
}
function emitAll(){
  cnt.leaf=0;cnt.petal=0;cnt.blob=0;cnt.tv=0;cnt.ti=0;cnt.bb=0;
  for(const p of plants)emitPlant(p);
  emitTrees();emitBushes();emitDebris();emitPads();
  for(const o of objs){
    const kind=o.kind==='rock'?0:1;
    addBlob(o.p,o.sc[0],o.sc[1],o.sc[2],kind,o.seed*9,o.q,o.col,o.kind==='rock'?0.32:(o.kind==='pebble'?0.18:0.05));
  }
  for(const pb of pebbles)addBlob(pb.p,pb.sc[0],pb.sc[1],pb.sc[2],0,pb.seed,pb.q,pb.col,0.25);
  for(const m of mushrooms){
    addBlob([m.p[0],m.p[1]+m.h*0.5,m.p[2]],m.r*0.28,m.h*0.55,m.r*0.28,1,m.seed,QI,srgb([0.88,0.84,0.74]),0.08);
    addBlob([m.p[0],m.p[1]+m.h*0.95,m.p[2]],m.r,m.h*0.45,m.r,1,m.seed,QI,m.col,0.1);
  }
  for(const tw of twigs)addTube(tw.pts,tw.r,tw.r*0.6,2,5,0,1);
  for(const rt of roots)addTube(rt.pts,rt.r,rt.r*0.35,2,7,0,1);
  emitFrog();emitFish();
  // billboards
  if(W.night>0.12){
    const n=Math.round(70*S.density);
    for(const f of flies){if(f.idx>=n)continue;
      const bl=Math.max(0,Math.sin(W.t*(1.5+f.sp)+f.ph)*0.5+0.5);const pulse=Math.pow(bl,3);
      const a=W.night*(0.2+0.8*pulse)*(1-0.7*W.rain);
      const far=length3(f.p,W.camPos);const sz=0.04+0.02*clamp(far/6,0,1);
      addBB(f.p,sz,[0.75,1.0,0.25],a*0.9);addBB(f.p,sz*3.2,[0.5,0.9,0.2],a*0.18);}
  }
  for(const d of drops)addBB(d.p,0.012,[0.8,0.9,1.0],Math.min(1,d.life*2)*0.8);
  for(const s of sparks)addBB(s.p,s.size,s.c,Math.min(1,s.life*2.2)*0.95);
  for(const b of creatures){if(b.game&&b.glow&&!b.dead&&b.size>0.001){const gl=b.glow*(0.55+0.45*Math.sin(W.t*6+b.seed));addBB(b.p,b.baseSize*(b.g==='golden'?8:5),b.glowC,gl*(0.25+0.4*W.night)*b.fade);addBB(b.p,b.baseSize*2.2,b.glowC,gl*0.6*b.fade);}}
  for(const f of foams)addBB([f.p[0],f.p[1],f.p[2]],f.size,[0.85,0.9,0.92],Math.min(1,f.life)*0.35);
  for(const b of bubbles)addBB(b.p,b.size,[0.7,0.85,0.9],0.55);
  for(const d of dust)addBB(d.p,d.size,[0.35,0.28,0.2],Math.min(1,d.life)*0.5);
  emitCreatures();
}
const length3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

/* ============================== interaction ============================== */
function waterHit(ray){if(ray.d[1]>=-1e-4)return null;const t=(WATER_Y-ray.o[1])/ray.d[1];if(t<0)return null;const p=madd(ray.o,ray.d,t);return pondD(p[0],p[2])<0?{p,t}:null;}
function sphereHit(ro,rd,c,r){const oc=sub(ro,c),b=dot(oc,rd),cc=dot(oc,oc)-r*r,d=b*b-cc;if(d<0)return null;let t=-b-Math.sqrt(d);if(t<0)t=-b+Math.sqrt(d);return t<0?null:t;}
function frogHit(ray){
  const f=frog,c=frogCenter();const F=[Math.sin(f.yaw),0,Math.cos(f.yaw)];
  let best=null;
  for(const [p,r] of [[c,0.13],[[c[0]+F[0]*0.13,c[1]+0.04,c[2]+F[2]*0.13],0.1],[[c[0]-F[0]*0.07,c[1],c[2]-F[2]*0.07],0.12]]){const t=sphereHit(ray.o,ray.d,p,r);if(t!==null&&(best===null||t<best))best=t;}
  return best;
}
function hover(ray){
  W.ray=ray;
  const w=waterHit(ray),g=groundHit(ray.o,ray.d);
  const pt=w?w.p:(g?g.p:null);
  const tnow=nowS();
  if(pt){
    if(W.cursorPt){const dtm=Math.max(1/240,tnow-W.cursorT);const d=Math.hypot(pt[0]-W.cursorPt[0],pt[2]-W.cursorPt[2]);const sp=d/dtm;W.cursorSpeed=lerp(W.cursorSpeed||0,Math.min(sp,12),0.5);
      const vx=(pt[0]-W.cursorPt[0])/dtm,vz=(pt[2]-W.cursorPt[2])/dtm;W.cursor={x:pt[0],y:pt[1],z:pt[2],vx:clamp(vx,-4,4),vz:clamp(vz,-4,4),active:true,pressed:W.cursor?W.cursor.pressed:false};}
    else W.cursor={x:pt[0],y:pt[1],z:pt[2],vx:0,vz:0,active:true,pressed:false};
    W.cursorPt=pt;W.cursorT=tnow;W.cursorMove=0.7;
    if(w&&W.cursorSpeed>0.4&&rand()<0.3){addRipple(pt[0],pt[2],0.003*Math.min(3,W.cursorSpeed),0.18,1);}
    if(w&&W.cursorSpeed>1.2)W.disturb={x:pt[0],z:pt[2],t:W.t};
  }
  const fh=frogHit(ray);
  if(fh!==null&&W.cursorSpeed>0.05&&W.cursorSpeed<1.2)W.petting=0.3;
  return pt;
}
let drag=null;
function down(ray){
  hover(ray);
  const fh=frogHit(ray);
  if(W.cursor)W.cursor.pressed=true;
  if(fh!==null){
    frog.held=true;frog.grabDepth=fh;frog.grabTarget=madd(ray.o,ray.d,fh);frog.heldV=[0,0,0];frog.asleep=false;
    drag={kind:'frog',t0:nowS(),moved:0,ray};return'frog';
  }
  // lily pads
  const w=waterHit(ray);
  if(w){
    let best=null;for(const p of pads){const d=Math.hypot(w.p[0]-p.x,w.p[2]-p.z);if(d<p.r&&(!best||d<best.d))best={p,d};}
    if(best){best.p.held=true;best.p.target=[w.p[0],0,w.p[2]];drag={kind:'pad',pad:best.p,t0:nowS(),moved:0,ray};return'pad';}
  }
  for(const o of objs){if(o.kind==='rock')continue;const t=sphereHit(ray.o,ray.d,o.p,o.r*1.15+0.02);if(t!==null){o.held=true;o.rest=false;o.target=o.p.slice();o.target[1]+=0.15;drag={kind:'object',obj:o,depth:t,t0:nowS(),moved:0,ray};return'object';}}
  if(w){
    W.clickCount=(W.clickCount||0)+1;const k=Math.min(3.5,1+0.55*(W.clickCount-1));
    addRipple(w.p[0],w.p[2],0.03*k,0.45+0.2*k,1);addRipple(w.p[0],w.p[2],0.015*k,0.25,1);
    if(W.clickCount>3)splash(w.p[0],w.p[2],Math.min(1,0.2*W.clickCount),0,true);
    W.disturb={x:w.p[0],z:w.p[2],t:W.t};W.events.push({type:'plink'});
    nudgePadsFrom(w.p[0],w.p[2],0.5*k);
    drag={kind:'water',t0:nowS(),moved:0};return'water';
  }
  drag={kind:'ground',t0:nowS(),moved:0,pt:groundHit(ray.o,ray.d)};
  return'ground';
}
function dragTo(ray,pixels){
  hover(ray);if(!drag)return;drag.moved+=pixels||0;
  if(drag.kind==='frog'){const o=ray.o,d=ray.d,dp=frog.grabDepth;frog.grabTarget=[o[0]+d[0]*dp,Math.max(o[1]+d[1]*dp,terrainH(o[0]+d[0]*dp,o[2]+d[2]*dp)+0.05),o[2]+d[2]*dp];}
  else if(drag.kind==='pad'){const w=waterHit(ray);if(w)drag.pad.target=[w.p[0],0,w.p[2]];}
  else if(drag.kind==='object'){const o=drag.obj;const p=madd(ray.o,ray.d,drag.depth);o.target=[p[0],Math.max(p[1],terrainH(p[0],p[2])+o.r+0.05),p[2]];}
  else if(drag.kind==='water'){const w=waterHit(ray);if(w){addRipple(w.p[0],w.p[2],0.01,0.3,1);if(rand()<0.2)splash(w.p[0],w.p[2],0.12,0,true);W.disturb={x:w.p[0],z:w.p[2],t:W.t};}}
}
function up(){
  if(!drag){if(W.cursor)W.cursor.pressed=false;return;}
  const tap=drag.moved<9&&nowS()-drag.t0<0.4;
  if(drag.kind==='frog'){
    const f=frog;f.held=false;
    if(tap){f.st='idle';f.scared=1.6;f.freeze=0.2;f.startle=1;f.asleep=false;W.events.push({type:'ribbit'});}
    else{f.hang=0;}
  }else if(drag.kind==='pad'){
    const p=drag.pad;p.held=false;p.target=null;
    if(tap){p.vy-=0.45;p.av+=(rand()-0.5)*1.5;addRipple(p.x,p.z,0.02,0.4,1);p.taps=(p.taps||0)+1;p.tapT=W.t;
      const recent=pads.reduce((a,q)=>a+((q.tapT&&W.t-q.tapT<6)?(q.taps||0):0),0);
      if(p.taps>=4||(frog.pad===p&&p.taps>=3)){p.taps=0;frog.annoy=1;if(frog.st==='idle'||frog.st==='swim'){const w=surfaceAround(0.3,1.4);if(!frog.held){frog.scared=0.8;planJump(w[0],w[1],null);W.events.push({type:'ribbit'});}}}}
  }else if(drag.kind==='object'){const o=drag.obj;o.held=false;o.target=null;o.rest=false;o.inWater=false;}
  else if(drag.kind==='ground'&&tap&&drag.pt){
    const cp=drag.pt.p;const d=Math.hypot(cp[0]-frog.p[0],cp[2]-frog.p[2]);
    if(frog.asleep&&d<1.8){W.poke=1;}
    else if(d<0.8){frog.scared=1.4;frog.freeze=0.2;frog.startle=1;}
    else if(d<2.2){frog.gaze=[cp[0],cp[1]+0.05,cp[2]];frog.lookT=2.5;frog.headT[2]=0.25;}
  }
  if(W.cursor)W.cursor.pressed=false;
  drag=null;
}
function groundHit(ro,rd){
  let t=0.05;
  for(let i=0;i<400;i++){
    const p=madd(ro,rd,t);const h=terrainH(p[0],p[2]);
    if(p[1]<h){let lo=t-0.2,hi=t;for(let k=0;k<12;k++){const m=(lo+hi)/2,q=madd(ro,rd,m);if(q[1]<terrainH(q[0],q[2]))hi=m;else lo=m;}return{t:hi,p:madd(ro,rd,hi)};}
    t+=Math.max(0.04,(p[1]-h)*0.5);if(t>80)break;
  }
  return null;
}
function reset(){
  rand=mb(S.seed||1234);
  W.t=0;W.rain=0;W.wet=0;W.flash=0;W.storm=0;W.cover=0.25;W.wind=S.wind;W.ripHigh=[];W.ripLow=[];W.rippleLog=[];W.events=[];W.birdShadow=null;W.bird=null;W.birdT=rnd(25,45);W.cursorPt=null;W.cursor=null;W.cursorSpeed=0;W.cursorMove=0;W.petting=0;W.dayOpen=1;W.clickCount=0;W.camEvent=null;W.disturb=null;
  buildPlants();buildTrees();buildBushes();buildRocks();buildPads();buildCreatures();buildFlies();buildFish();buildFallen();
  debris=[];drops=[];foams=[];bubbles=[];dust=[];grab=null;drag=null;
  resetFrog();Game.reset();
  for(let i=0;i<14;i++)spawnDebris(rand()<0.5?0:1,[rnd(-6,6),rnd(0.5,3),rnd(-5,5)],srgb([0.4,0.45,0.1]),srgb([0.7,0.6,0.15]),0.07);
  for(let s=0;s<30*60;s++)for(const p of plants)stepChain(p.ch,1/60,6,0,-1,null);
  update(0.0001);
}
function defaults(){
  Object.assign(S,{wind:0.2,rain:0,tod:9.5,weather:'Sunny',growth:1,gravity:9.81,strength:1,paused:false,auto:true,activity:1,ripple:1,density:1,cloud:0.1});
}
function stats(){
  return{plants:plants.length,flowers:plants.filter(p=>p.flower&&p.flower.open>0.3).length,butterflies:creatures.filter(c=>c.kind===0&&c.activeIdx).length,bees:creatures.filter(c=>c.kind===1&&c.activeIdx).length,
    wind:Math.round(W.wind*100),weather:S.weather,frog:frogStatus(),ripples:W.rippleLog.length,
    particles:drops.length+foams.length+bubbles.length+dust.length+debris.length+(W.night>0.12?Math.round(70*S.density):0)+Math.floor(14000*Math.min(1,W.rain)),
    objects:cnt.leaf+cnt.petal+cnt.blob+creatures.length+fish.length,time:W.hour};
}

// ======================================================================
// FROG CATCH: game rules, bug AI, tongue, player control
// ======================================================================

/* ============================== FROG CATCH (arcade layer) ============================== */
const RANGE=1.7;
const Game={diff:'normal',state:'menu',on:false,ctrl:false,round:0,score:0,combo:0,bestCombo:0,comboT:0,time:60,best:0,
  input:{dx:0,dz:0,sprint:false},jumpQ:false,aimPt:null,pendingFire:null,touchTgt:null,readyT:0,rb:0,spawnT:0,goldenT:18,
  tut:false,tutCaught:0,tutDone:false,crownT:0,eyeBias:0,camPulse:0,happyT:0,cfg:null,overT:0,microT:8,rainAt:-1,rainEnd:-1,todTarget:null,catches:0,
  reset(){Object.assign(Game,{state:Game.state==='menu'?'menu':'menu',on:false,ctrl:false,score:0,combo:0,comboT:0,input:{dx:0,dz:0,sprint:false},jumpQ:false,pendingFire:null,touchTgt:null,crownT:0,eyeBias:0,todTarget:null});Game.round=0;}};
const DIFF={
  easy:  {time:75,speed:0.72,max:0.8,gap:1.35,bee:0,   beeFrom:99},
  normal:{time:60,speed:1,   max:1,  gap:1,   bee:1,   beeFrom:5},
  hard:  {time:50,speed:1.3, max:1.3,gap:0.7, bee:1.9, beeFrom:2}};
const bestKey=d=>d==='normal'?'frogCatchBest':'frogCatchBest_'+d;
function loadBest(){try{Game.best=+(localStorage.getItem(bestKey(Game.diff))||0);}catch(e){Game.best=0;}}
function setDifficulty(d){if(!DIFF[d])return;Game.diff=d;try{localStorage.setItem('frogCatchDiff',d);}catch(e){}loadBest();}
try{const d=localStorage.getItem('frogCatchDiff');if(DIFF[d])Game.diff=d;}catch(e){}
loadBest();
function roundCfg(r){
  const D=DIFF[Game.diff]||DIFF.normal;
  const bw=r>=D.beeFrom?Math.min(0.16,0.07+0.02*(r-D.beeFrom))*D.bee:0;
  return{w:{butterfly:1,glow:r>=4?0.2:0,bee:bw},bee:bw>0,time:D.time,
    speed:Math.min(1.5,0.7+0.1*(r-1))*D.speed,max:Math.round(Math.min(12,5+r)*D.max),night:r>=4&&r%2===0,rain:r>=2&&((r*7)%10<3),gap:Math.max(0.35,0.9-0.08*r)*D.gap};
}
const ev=(o)=>W.events.push(o);
function gameStart(next){
  const G=Game;
  G.round=next==='same'?Math.max(1,G.round):(next?G.round+1:1);
  G.jumpQ=false;G.pendingFire=null;G.touchTgt=null;
  G.score=0;G.combo=0;G.bestCombo=0;G.comboT=0;G.cfg=roundCfg(G.round);G.time=G.cfg.time;G.state='ready';G.readyT=0;G.rb=0;G.catches=0;G.cfg=roundCfg(G.round);
  creatures=creatures.filter(c=>!c.game);
  G.on=true;G.ctrl=true;S.paused=false;
  const f=frog;f.asleep=false;f.sleepy=0;f.scared=0;f.freeze=0;f.hid=0;f.plan=null;f.held=false;f.micro=null;f.pt=null;f.tongue=0;f.mouth=0;f.droop=0;f.tongueMax=undefined;
  if(f.st!=='air'&&f.st!=='crouch'&&f.st!=='land')f.st=(f.surf==='water')?'swim':'idle';
  S.auto=false;G.todTarget=G.cfg.night?22.5:10.5;
  if(S.rain>0.1||S.wind>0.5)setWeather('Sunny');
  G.rainAt=G.cfg.rain?rnd(16,34):-1;G.rainEnd=-1;
  G.tut=(G.round===1&&!G.tutDone);G.tutCaught=0;G.spawnT=0;G.goldenT=rnd(14,26);G.idleSince=0;
  ev({type:'banner',text:'READY?',dur:1.0});
}
function gameLeave(){ // back to the peaceful pond
  const G=Game;
  for(const c of creatures)if(c.game)c.leave=true;
  G.on=false;G.ctrl=false;G.state='free';G.touchTgt=null;G.todTarget=null;S.auto=true;S.paused=false;
  frog.pt=null;frog.tongue=0;frog.mouth=0;frog.tongueMax=undefined;frog.micro=null;
  if(W.rain>0.1||S.rain>0.1)setWeather('Sunny');
  ev({type:'hud'});
}
function gameUpdate(dt){
  const G=Game;
  if(G.todTarget!==null)S.tod+=(G.todTarget-S.tod)*Math.min(1,dt*1.0);
  G.eyeBias=Math.max(0,G.eyeBias-dt*1.6);G.crownT=Math.max(0,G.crownT-dt);G.camPulse*=Math.exp(-dt*5);G.happyT=Math.max(0,G.happyT-dt);
  if(!G.on)return;
  if(G.state!=='play'){G.jumpQ=false;G.pendingFire=null;}
  if(G.state==='ready'){
    G.readyT+=dt;
    const marks=[[1.0,'3'],[1.8,'2'],[2.6,'1'],[3.4,'GO!']];
    while(G.rb<marks.length&&G.readyT>=marks[G.rb][0]){ev({type:'banner',text:marks[G.rb][1],dur:0.7});G.rb++;}
    if(G.readyT>=3.4){
      G.state='play';
      if(G.tut){const b=spawnBug('butterfly',{tutorial:true});ev({type:'hint',text:'Catch it.',dur:6});}
      for(let i=0;i<3;i++)spawnBug(pickType());
      if(!G.tut)ev({type:'hint',text:G.cfg.bee?'Catch the butterflies  •  Avoid the bees':'Catch the butterflies',dur:4});
    }
  }else if(G.state==='play'){
    G.time-=dt;
    if(G.comboT>0){G.comboT-=dt;if(G.comboT<=0){G.combo=0;}}
    G.spawnT-=dt;
    const alive=creatures.reduce((n,c)=>n+((c.game&&!c.dead&&!c.fx&&!c.leave)?1:0),0);
    if(alive<G.cfg.max&&G.spawnT<=0){G.spawnT=G.cfg.gap;spawnBug(pickType());}
    G.goldenT-=dt;
    if(G.goldenT<=0&&G.round>=1&&G.time>8&&!creatures.some(c=>c.game&&c.g==='golden'&&!c.dead)&&!G.tut){G.goldenT=rnd(22,40);spawnBug('golden');}
    if(G.rainAt>0){G.rainAt-=dt;if(G.rainAt<=0){S.rain=0.55;S.wind=Math.max(S.wind,0.4);G.rainEnd=14;ev({type:'hint',text:'Rain!',dur:2});}}
    if(G.rainEnd>0){G.rainEnd-=dt;if(G.rainEnd<=0){S.rain=0;S.wind=0.2;}}
    if(G.pendingFire&&canFire()){fireTongue(G.pendingFire);G.pendingFire=null;}
    if(G.time<=0){G.time=0;G.state='over';G.overT=0;ev({type:'banner',text:"TIME!",dur:1.0});S.rain=0;S.wind=0.2;}
  }else if(G.state==='over'){
    if(frog.st!=='ptongue')G.overT+=dt;
    if(G.overT>1.1){
      G.state='results';G.ctrl=true;G.touchTgt=null;
      const newBest=G.score>G.best;if(newBest){G.best=G.score;try{localStorage.setItem(bestKey(G.diff),String(G.best));}catch(e){}}
      for(const c of creatures)if(c.game)c.leave=true;
      ev({type:'results',score:G.score,best:G.best,bestCombo:G.bestCombo,newBest});
    }
  }
}
function canFire(){const f=frog;return f.st==='idle'||f.st==='swim'||f.st==='land'||(f.st==='ptongue'&&f.pt&&f.pt.retract&&(f.pt.t-f.pt.rt0)>0.08);}
function pickType(){
  const w=Object.assign({},Game.cfg.w);
  if(Game.cfg.night){w.glow=Math.max(w.glow,0.35);}
  let tot=0;for(const k in w)tot+=w[k];let r=rand()*tot;
  for(const k in w){r-=w[k];if(r<=0)return k;}
  return 'butterfly';
}
const BUGT={
  fly:{kind:1,size:0.05,cA:srgb([0.16,0.14,0.12]),cB:srgb([0.28,0.25,0.2]),speed:0.5,wob:0.2,acc:3,pts:1,pref:[0.3,0.8],hz:46,flee:0.4,hit:0.2},
  butterfly:{kind:0,size:0.075,speed:0.6,wob:0.45,acc:2,pts:2,pref:[0.4,1.1],hz:10,flee:0.45,hit:0.22},
  glow:{kind:2,size:0.046,cA:srgb([0.7,1.0,0.25]),cB:srgb([0.12,0.25,0.05]),speed:0.95,wob:0.25,acc:4,pts:5,pref:[0.4,1.0],hz:0,flee:0.45,hit:0.2,glow:0.85,glowC:[0.6,1.0,0.3]},
  bee:{kind:1,size:0.046,cA:srgb([0.95,0.72,0.08]),cB:srgb([0.04,0.03,0.02]),speed:0.8,wob:0.15,acc:3,pts:0,pref:[0.4,1.0],hz:36,flee:0,hit:0.17},
  golden:{kind:0,size:0.07,cA:srgb([1,0.8,0.15]),cB:srgb([0.75,0.4,0.06]),speed:1.3,wob:0.7,acc:5,pts:10,pref:[0.5,1.2],hz:12,flee:0.7,hit:0.24,glow:1,glowC:[1,0.8,0.25]}
};
const BFC=[[[0.95,0.5,0.08],[0.05,0.03,0.02]],[[0.25,0.45,0.95],[0.04,0.06,0.15]],[[0.98,0.88,0.15],[0.1,0.07,0.02]],[[0.95,0.95,0.9],[0.2,0.2,0.2]],[[0.85,0.25,0.15],[0.08,0.04,0.03]],[[0.7,0.4,0.9],[0.1,0.05,0.15]]];
function makeBug(type,pos,opt){
  const T=BUGT[type];const c=makeCreature(T.kind,pos);
  c.game=true;c.g=type;c.activeIdx=true;c.idx=0;c.baseSize=T.size*(type==='butterfly'?rnd(0.9,1.15):1);c.size=0.001;c.age=0;c.fade=0;c.dead=false;
  if(type==='butterfly'){const cc=BFC[Math.floor(rand()*BFC.length)];c.cA=srgb(cc[0]);c.cB=srgb(cc[1]);}else{c.cA=T.cA;c.cB=T.cB;}
  c.hz=T.hz||10;c.amp=0.9;c.pts=T.pts;c.hitR=T.hit;c.glow=T.glow||0;c.glowC=T.glowC||[1,1,1];
  c.st='wander';c.tm=rnd(0.3,1.5);c.tgt=null;c.pref=rnd(T.pref[0],T.pref[1]);c.t2=rnd(0.4,1.2);c.kick=[0,0,0];
  c.tut=!!(opt&&opt.tutorial);
  if(c.tut){const f=frog;const side=rand()<0.5?-1:1;const F=[Math.sin(f.yaw),0,Math.cos(f.yaw)],L=[Math.cos(f.yaw),0,-Math.sin(f.yaw)];
    c.p=[f.p[0]+F[0]*1.1+L[0]*side*2.2,0.55,f.p[2]+F[2]*1.1+L[2]*side*2.2];c.tutPts=[[f.p[0]+F[0]*1.0-L[0]*side*0.6,0.5,f.p[2]+F[2]*1.0-L[2]*side*0.6],[f.p[0]+F[0]*1.2-L[0]*side*2.4,0.7,f.p[2]+F[2]*1.2-L[2]*side*2.4]];c.tutI=0;c.tutT=0;}
  return c;
}
function spawnBug(type,opt){
  const f=frog;let pos=null;
  for(let k=0;k<16&&!pos;k++){
    const region=Math.floor(rand()*6);let p=null;
    if(region===0){const hs=flowerHeads();if(hs.length){const h=hs[Math.floor(rand()*hs.length)];p=[h.p[0],h.p[1]+0.2,h.p[2]];}}
    else if(region===1){const a=rand()*TAU,r=rnd(2.6,6.2);p=[Math.cos(a)*r,rnd(0.2,0.5),Math.sin(a)*r*0.85];}
    else if(region===2){const q=landPoint(rand()*TAU,0.1,0.9);p=[q[0],0.3,q[1]];}
    else if(region===3&&trees.length){const t=trees[Math.floor(rand()*trees.length)];const b=t.branches[Math.floor(rand()*t.branches.length)];const n=b.pos[b.pos.length-1];p=[n[0],n[1]+0.1,n[2]];}
    else if(region===4&&pads.length){const pd=pads[Math.floor(rand()*pads.length)];p=[pd.x,0.25,pd.z];}
    else if(region===5){const rk=objs.filter(o=>o.kind==='rock');if(rk.length){const o=rk[Math.floor(rand()*rk.length)];p=[o.p[0],o.p[1]+o.sc[1]+0.2,o.p[2]];}}
    if(!p)continue;
    const dx=p[0]-f.p[0],dz=p[2]-f.p[2],d=Math.hypot(dx,dz);
    if(d<1.8)continue;
    if(Math.abs(wrapA(Math.atan2(dx,dz)-f.yaw))<0.7&&d<3.6)continue;
    if(Math.hypot(p[0],p[2])>7)continue;
    pos=p;
  }
  if(!pos)pos=[f.p[0]-Math.sin(f.yaw)*3,0.5,f.p[2]-Math.cos(f.yaw)*3];
  const b=makeBug(type,pos,opt);creatures.push(b);return b;
}
/* ---- bug AI: wander / flower+water attraction / landing / escape ---- */
function bugSteer(b,tgt,speed,dt,wob,acc){
  const d=sub(tgt,b.p),l=vlen(d)||1e-6,dir=mul(d,1/l),t=W.t+b.seed;
  b.t2-=dt;if(b.t2<=0){b.t2=rnd(0.25,0.9);const k=wob*1.6;b.kick=[rnd(-k,k),rnd(-k,k)*0.6,rnd(-k,k)];}
  const sp=Math.min(speed,l*3+0.12);
  const want=[dir[0]*sp+b.kick[0]+Math.sin(t*3.1)*wob*0.4,dir[1]*sp+b.kick[1]+Math.sin(t*4.3)*wob*0.3,dir[2]*sp+b.kick[2]+Math.cos(t*2.7)*wob*0.4];
  for(let a=0;a<3;a++)b.v[a]+=(want[a]-b.v[a])*Math.min(1,dt*acc);
  b.p[0]+=b.v[0]*dt;b.p[1]+=b.v[1]*dt;b.p[2]+=b.v[2]*dt;
  setHeading(b,b.v,dt,6);return l;
}
function pickBugTarget(b){
  const T=BUGT[b.g],f=frog;b.landTgt=null;
  const r=rand();
  const heads=flowerHeads();
  const wFlower=b.g==='butterfly'?0.5:b.g==='fly'?0.3:b.g==='glow'?0.2:0;
  const wWater=b.g==='fly'?0.2:b.g==='glow'?0.25:0.1;
  const wLand=b.g==='fly'?0.2:0.05;
  if(r<wFlower&&heads.length){const h=heads[Math.floor(rand()*heads.length)];b.tgt=madd(h.p,[0,1,0],0.06);b.landTgt={type:'flower',plant:h.plant};return;}
  if(r<wFlower+wWater){const a=rand()*TAU,q=Math.sqrt(rand());b.tgt=[Math.cos(a)*q*2.4,rnd(0.3,0.8),Math.sin(a)*q*1.7];if(rand()<0.15&&pads.length){const pd=pads[Math.floor(rand()*pads.length)];b.tgt=[pd.x,WATER_Y+0.05,pd.z];b.landTgt={type:'pad',pad:pd};}return;}
  if(r<wFlower+wWater+wLand){const rk=objs.filter(o=>o.kind==='rock');if(rk.length&&rand()<0.6){const o=rk[Math.floor(rand()*rk.length)];b.tgt=[o.p[0],o.p[1]+o.sc[1]*0.9+0.02,o.p[2]];b.landTgt={type:'rock',o};return;}
    if(trees.length){const t=trees[Math.floor(rand()*trees.length)];const br=t.branches[Math.floor(rand()*t.branches.length)];const n=br.pos[br.pos.length-1];b.tgt=[n[0],n[1]+0.03,n[2]];b.landTgt={type:'branch',br,t};return;}}
  // wander, biased to hover around the frog's neighbourhood so there is always something to chase
  let cx=b.p[0],cz=b.p[2],rad=2.6;
  if(rand()<0.75){const a=rand()*TAU;cx=f.p[0]+Math.cos(a)*rnd(0.8,1.9);cz=f.p[2]+Math.sin(a)*rnd(0.8,1.9);rad=0.7;}
  const a=rand()*TAU,q=rnd(0.3,1)*rad;
  let x=cx+Math.cos(a)*q,z=cz+Math.sin(a)*q;
  const hh=Math.hypot(x,z);if(hh>6.5){x*=6.5/hh;z*=6.5/hh;}
  b.tgt=[x,Math.max(terrainH(x,z),WATER_Y)+b.pref+rnd(-0.15,0.2),z];
}
function landPos(b){
  const L=b.landTgt;if(!L)return null;
  if(L.type==='flower'){if(!L.plant.flower||L.plant.flower.picked)return null;const fr=flowerFrame(L.plant);return madd(fr.top,fr.axis,0.04);}
  if(L.type==='pad')return[L.pad.x,WATER_Y+0.03+L.pad.dy,L.pad.z];
  if(L.type==='rock')return[L.o.p[0],L.o.p[1]+L.o.sc[1]*0.9+0.01,L.o.p[2]];
  if(L.type==='branch'){const n=L.br.pos[L.br.pos.length-1];return[n[0],n[1]+0.01,n[2]];}
  return null;
}
function updateBugs(dt){
  const G=Game,f=frog;
  const spd=G.cfg?G.cfg.speed:0.8;
  const head=[f.p[0],f.p[1]+0.1,f.p[2]];
  for(const b of creatures){
    if(!b.game)continue;
    const T=BUGT[b.g];
    b.age+=dt;b.fade=Math.min(1,b.age/0.6);b.size=b.baseSize*b.fade;
    if(b.leave){b.st='leave';}
    b.phase+=dt*TAU*b.hz;
    if(b.g==='glow'){b.amp=0;}
    if(b.st==='leave'){
      b.tm-=dt;const d=[b.p[0]-f.p[0],0,b.p[2]-f.p[2]];const l=vlen(d)||1;
      bugSteer(b,[b.p[0]+d[0]/l*4,b.p[1]+2.5,b.p[2]+d[2]/l*4],1.6,dt,0.2,3);b.leaveT=(b.leaveT||0)+dt;if(b.leaveT>3)b.dead=true;continue;
    }
    if(b.tut&&b.st!=='flee'){
      b.tutT+=dt;const tg=b.tutPts[b.tutI];const d=bugSteer(b,tg,0.55,dt,0.25,2.2);b.amp=0.95;b.hz=10;
      if(d<0.12)b.tutI=Math.min(1,b.tutI+1);
      if(b.tutT>12)b.tut=false;
      continue;
    }
    // splash scares bugs (fish, frog or user)
    const se=W.splashEv;
    if(se&&W.t-se.t<0.5&&b.st!=='flee'&&b.g!=='bee'&&Math.hypot(b.p[0]-se.x,b.p[2]-se.z)<2.2){b.st='flee';b.tm=1.3;b.fleeFrom=[se.x,b.p[1]-0.5,se.z];b.landTgt=null;}
    const df=Math.hypot(b.p[0]-head[0],b.p[1]-head[1]-0.1,b.p[2]-head[2]);
    if(b.st!=='flee'&&b.st!=='chase'&&b.st!=='onHead'&&T.flee>0&&df<T.flee*(b.st==='land'?0.6:1)&&(f.st==='air'||df<T.flee*0.5)){
      b.st='flee';b.tm=0.6+rand()*0.3;b.fleeFrom=head.slice();b.landTgt=null;
    }
    // bees: chase when provoked
    if(b.st==='chase'){
      b.tm-=dt;const hp=[f.p[0]+Math.sin(W.t*5)*0.25,f.p[1]+0.22,f.p[2]+Math.cos(W.t*4)*0.25];
      bugSteer(b,hp,1.9,dt,0.2,5);b.amp=0.9;if(b.tm<=0){b.st='wander';b.tgt=null;}continue;
    }
    if(b.st==='onHead'){
      b.tm-=dt;const hp=[f.p[0]+Math.sin(f.yaw)*0.08,f.p[1]+0.16,f.p[2]+Math.cos(f.yaw)*0.08];b.p=lerp3(b.p,hp,Math.min(1,dt*8));b.amp=0.3;b.hz=1.2;
      if(b.tm<=0){b.st='wander';b.tgt=null;b.fx=false;b.noCatch=false;}continue;
    }
    if(b.st==='flee'){
      b.tm-=dt;const ff=b.fleeFrom;const d=sub(b.p,ff);const l=vlen(d)||1;
      const away=[b.p[0]+d[0]/l*3,b.p[1]+0.6+Math.abs(d[1]/l)*2,b.p[2]+d[2]/l*3];
      bugSteer(b,away,T.speed*spd*1.5,dt,0.3,5);b.amp=0.95;b.hz=(T.hz||10)*1.3;
      if(b.tm<=0){b.st='wander';b.tgt=null;}
    }else if(b.st==='land'){
      b.tm-=dt;const lp=landPos(b);
      if(!lp){b.st='wander';b.tgt=null;}
      else{b.p=lerp3(b.p,lp,Math.min(1,dt*10));b.amp=b.g==='butterfly'?0.35+0.25*Math.sin(W.t*1.3+b.seed):0.25;b.hz=b.g==='butterfly'?1.4:30;
        if(b.tm<=0){b.st='wander';b.tgt=null;b.landTgt=null;b.v=[0,0.4,0];}}
    }else{ // wander
      b.amp=b.g==='butterfly'?0.95:0.8;b.hz=b.g==='butterfly'?rnd(9,12):(T.hz||10);
      if(b.g==='golden'){ // unusual looping path
        const t=W.t*0.55+b.seed;b.tgt=[Math.sin(t*1.3)*3.4+Math.sin(t*3.1)*0.8,0.7+0.5*Math.sin(t*1.9)+0.25*Math.sin(t*4.7),Math.cos(t*1.0)*2.6+Math.cos(t*2.7)*0.7];
      }else{
        b.tm-=dt;
        if(!b.tgt||b.tm<=0){pickBugTarget(b);b.tm=rnd(1.8,4.5);}
      }
      let sp=T.speed*spd*(W.rain>0.3&&b.g!=='golden'?0.85:1);
      if(b.g==='glow'&&G.cfg&&G.cfg.night)sp*=1.05;
      const d=bugSteer(b,b.tgt,sp,dt,T.wob,T.acc);if(b.fade<1)b.fade=Math.min(1,b.fade);
      if(b.landTgt&&d<0.12){b.st='land';b.tm=rnd(1.8,3.8);b.v=[0,0,0];}
      else if(d<0.15&&b.g!=='golden')b.tm=0;
    }
    // keep inside the arena and above the ground / water
    const hr=Math.hypot(b.p[0],b.p[2]);if(hr>7){b.p[0]*=6.9/hr;b.p[2]*=6.9/hr;b.v[0]*=-0.5;b.v[2]*=-0.5;}
    const gy=Math.max(terrainH(b.p[0],b.p[2]),WATER_Y)+0.08;if(b.p[1]<gy&&b.st!=='land'){b.p[1]=gy;b.v[1]=Math.max(b.v[1],0.2);}
    if(b.p[1]>3)b.v[1]-=0.5*dt;
  }
  creatures=creatures.filter(c=>!c.dead);
}
/* ---- tongue ---- */
function tonguePt(M,tgt,u,droop,maxR){
  const dn=nrm(sub(tgt,M)),L=dist(M,tgt),R=Math.min(L*1.02,maxR);
  const tip=madd(M,dn,R),ctrl=add(madd(M,dn,R*0.5),[0,0.05*R+0.03,0]);
  const p=add(add(mul(M,(1-u)*(1-u)),mul(ctrl,2*(1-u)*u)),mul(tip,u*u));
  p[1]-=droop*0.2*R*u*u;return p;
}
function fireTongue(ray){
  const f=frog,G=Game;
  if(G.state!=='play'||!canFire()){G.pendingFire=ray;return false;}
  const M=f.mouthW||frogMouthPos();
  let best=null,bd=1e9;
  for(const b of creatures){if(!b.game||b.dead||b.noCatch||b.fade<0.5||b.leave)continue;
    const rd=rayDist(ray.o,ray.d,b.p);if(rd<0.9&&dist(M,b.p)<RANGE*1.3&&rd<bd){bd=rd;best=b;}}
  let T;
  if(best){T=madd(best.p,best.v,0.1);}
  else{
    let P=null;const h=Math.max(M[1],f.p[1]+0.12);
    if(ray.d[1]<-0.001){const t=(h-ray.o[1])/ray.d[1];if(t>0)P=madd(ray.o,ray.d,t);}
    if(!P){const g=groundHit(ray.o,ray.d);P=g?g.p:madd(ray.o,ray.d,3);}
    T=P;
  }
  const len=dist(M,T);const short=len>RANGE;
  f.st='ptongue';f.pt={t:0,short,retract:false,rt0:0,eFrom:0,cat:null,missDone:false};
  f.tongueAim=T;f.tongueMax=RANGE*1.05;f.droop=0;f.mouth=0;
  f.yawT=Math.atan2(T[0]-f.p[0],T[2]-f.p[2]);f.yaw+=wrapA(f.yawT-f.yaw)*0.8;f.gaze=T;
  f.crouch=Math.max(f.crouch,0.3);f.sqv-=1.2;
  ev({type:'whip'});
  return true;
}
function ptongueStep(dt){
  const f=frog,p=f.pt,G=Game;
  if(!p){f.st=f.surf==='water'?'swim':'idle';return;}
  p.t+=dt;
  const W0=0.04,EX=0.12,HO=0.03,RT=0.15;
  let e=f.tongue;
  if(p.t<W0){f.mouth=p.t/W0;e=0;}
  else if(!p.retract&&p.t<W0+EX){const u=(p.t-W0)/EX;e=1-Math.pow(1-u,3);f.mouth=1;}
  else if(!p.retract&&p.t<W0+EX+HO){e=1;}
  else{
    if(!p.retract){p.retract=true;p.rt0=p.t;p.eFrom=f.tongue;onTongueEnd(p);}
    const u=clamp((p.t-p.rt0)/RT,0,1);const k=u*u*(3-2*u);
    e=p.eFrom*(1-k)+(u>0.82?0.03*Math.sin((u-0.82)/0.18*Math.PI):0); // tiny elastic snap at the end
    f.mouth=Math.max(0,1-u*1.7);f.droop=(p.cat?0:Math.min(1,f.droop+dt*8))*(1-u*0.6);
    if(u>=1){
      f.tongue=0;f.mouth=0;f.droop=0;f.tongueMax=undefined;f.pt=null;f.st=f.surf==='water'?'swim':'idle';f.idleFor=0;
      f.crouch=Math.max(f.crouch,0.2);
      if(G.happyHop&&f.surf!=='water'){G.happyHop=false;microHop();}
      return;
    }
  }
  f.tongue=Math.max(0,e);
  f.yaw+=wrapA(f.yawT-f.yaw)*Math.min(1,dt*20);
  // collision: any bug touching the tongue while it is out
  if(!p.retract&&e>0.04){
    const M=f.mouthW||frogMouthPos(),N=26;
    for(let i=2;i<=N;i++){
      const pt=tonguePt(M,f.tongueAim,i/N*e,0,f.tongueMax);
      for(const b of creatures){
        if(!b.game||b.dead||b.noCatch||b.fade<0.4||b.leave)continue;
        if(dist(pt,b.p)<b.hitR+0.02){p.cat=b;p.retract=true;p.rt0=p.t;p.eFrom=f.tongue;onTongueEnd(p);onCatch(b,pt);return;}
      }
    }
  }
}
function onTongueEnd(p){ // fires once when the tongue starts retracting
  const f=frog;
  if(!p.cat&&!p.missDone){
    p.missDone=true;Game.eyeBias=Math.max(Game.eyeBias,0.55);f.headT[2]=(rand()<0.5?-1:1)*0.35;f.droop=0.2;
    f.sqv-=0.8;ev({type:'miss'});
    if(rand()<0.09){const b=makeBug('butterfly',[f.p[0],f.p[1]+0.3,f.p[2]]);b.st='onHead';b.tm=2.2;b.fx=true;b.noCatch=true;b.fade=1;b.age=1;creatures.push(b);ev({type:'hint',text:'Hey! That\'s not a bug.',dur:2});}
    if(p.short)ev({type:'short'});
  }
}
function sparkBurst(pt,c,n){for(let i=0;i<n;i++){const a=rand()*TAU,s=rnd(0.2,0.9);sparks.push({p:pt.slice(),v:[Math.cos(a)*s,rnd(0.2,0.9),Math.sin(a)*s],life:rnd(0.5,0.9),size:rnd(0.012,0.024),c});}}
function onCatch(b,pt){
  const G=Game,f=frog;
  if(b.g==='bee'){ // ouch
    G.combo=0;G.comboT=0;f.scared=1.5;f.spin=0.8;G.eyeBias=0;f.pupil=1;
    const away=nrm([f.p[0]-b.p[0],0,f.p[2]-b.p[2]]);
    f.pt=null;f.tongue=0;f.mouth=0;f.tongueMax=undefined;
    planJump(clamp(f.p[0]+away[0]*0.8,-GS+1.5,GS-1.5),clamp(f.p[2]+away[2]*0.8,-GS+1.5,GS-1.5),null,true);
    b.st='chase';b.tm=3.2;sparkBurst(pt,[1,0.8,0.2],8);
    ev({type:'banner',text:'BZZZT!',dur:0.9});ev({type:'ribbit'});ev({type:'bee'});
    return;
  }
  b.dead=true;
  G.combo++;G.bestCombo=Math.max(G.bestCombo,G.combo);G.comboT=3.5;G.catches++;
  let base=b.pts;if(G.cfg&&G.cfg.night&&b.g==='glow')base=7;
  const pts=base*G.combo;G.score+=pts;
  if(b.g==='golden'){G.time+=5;ev({type:'banner',text:'+5 SECONDS',dur:1.1});}
  ev({type:'pop',text:'+'+pts,p:b.p.slice(),big:b.g==='golden'||b.g==='glow',combo:G.combo});ev({type:'catch2',combo:G.combo});
  const col=b.g==='golden'?[1,0.8,0.25]:b.g==='glow'?[0.6,1,0.3]:b.g==='butterfly'?[1,0.7,0.8]:[1,1,0.9];
  sparkBurst(b.p,col,b.g==='golden'?18:9);
  const msgs={3:'NICE!',5:'GOOD FROG!',10:'HUNGRY FROG!',20:'FROG LEGEND!'};
  if(msgs[G.combo]){ev({type:'combo',text:msgs[G.combo]});}
  if(G.combo===10)G.crownT=1.3;
  f.sqv+=2.4;f.blinkP=0;f.gulp=0.8;f.mood='Happy';G.happyT=1.0;G.happyHop=false;
  if(G.tut){G.tutCaught++;if(G.tutCaught===1){ev({type:'hint',text:'Catch 9 more!',dur:4});}if(G.catches>=10)G.tutDone=true;}
  if(rand()<0.07&&G.state==='play'){const fl=spawnBug('butterfly');const F=[Math.sin(f.yaw),0,Math.cos(f.yaw)],L=[Math.cos(f.yaw),0,-Math.sin(f.yaw)];fl.p=[f.p[0]+F[0]*0.35+L[0]*0.7,f.p[1]+0.14,f.p[2]+F[2]*0.35+L[2]*0.7];fl.age=1;fl.fade=1;fl.st='wander';fl.tgt=[f.p[0]+F[0]*0.4-L[0]*1.4,f.p[1]+0.2,f.p[2]+F[2]*0.4-L[2]*1.4];fl.tm=1.2;}
}
function microHop(){
  const f=frog;if(f.st!=='idle'||Game.on)return;
  f.st='air';f.tAir=0;f.v=[0,1.5,0];f.plan={T:0.3,t:f.p.slice(),type:f.surf,v:[0,0,0],after:null};f.surf='air';f.pad=null;f.sqv=-1.2;
}
/* ---- player controlled frog ---- */
function ctrlIdle(dt){
  const f=frog,G=Game,inp=G.input;
  f.idleFor+=dt;f.asleep=false;
  const playing=G.state==='play';
  let dx=playing?inp.dx:0,dz=playing?inp.dz:0;
  if(playing&&G.touchTgt){const tx=G.touchTgt[0]-f.p[0],tz=G.touchTgt[2]-f.p[2],td=Math.hypot(tx,tz);if(td>0.3){dx=tx/td;dz=tz/td;}}
  const mv=Math.hypot(dx,dz);
  let gazeSet=false,crT=0;
  if(f.micro){const m=f.micro;m.t+=dt;const u=clamp(m.t/m.dur,0,1);
    if(m.type==='yawn'){f.mouth=Math.sin(Math.PI*u)*0.9;G.eyeBias=Math.max(G.eyeBias,0.7*Math.sin(Math.PI*u));}
    else if(m.type==='shake'){f.yaw+=Math.sin(m.t*38)*0.05*(1-u);f.sqv+=Math.sin(m.t*30)*0.25;}
    else if(m.type==='lookcam'){f.gaze=W.camPos.slice();gazeSet=true;}
    else if(m.type==='stare'||m.type==='bf'){if(m.pt){f.gaze=m.pt;gazeSet=true;}crT=0.15;}
    else if(m.type==='sit'){crT=0.55;}
    if(m.t>=m.dur||mv>0.1||!playing){f.micro=null;f.mouth=0;}
  }else if(playing&&f.idleFor>8&&mv<0.1){
    G.microT-=dt;
    if(G.microT<=0){G.microT=rnd(9,20);
      const bgs=creatures.filter(c=>c.game&&!c.dead&&c.g!=='bee');
      if(!bgs.some(c=>dist(c.p,f.p)<2.2)){
        const types=['yawn','shake','lookcam','stare','sit','bf'];let ty=types[Math.floor(rand()*types.length)];
        const m={type:ty,t:0,dur:ty==='yawn'?2.0:ty==='shake'?0.7:ty==='sit'?3:2.4};
        if(ty==='stare'){const a=Math.atan2(PCx-f.p[0],PCz-f.p[2])+rnd(-0.5,0.5);m.pt=[f.p[0]+Math.sin(a)*0.8,WATER_Y,f.p[2]+Math.cos(a)*0.8];}
        if(ty==='bf'){const b=bgs.find(c=>c.g==='butterfly');if(b)m.pt=b.p;else m.type='lookcam';}
        f.micro=m;}}
  }
  // gaze follows the cursor (eyes + head), body only turns when the target is far to the side
  const aim=G.aimPt;
  if(!gazeSet){
    if(aim&&G.state!=='results'){f.gaze=[aim[0],aim[1]+0.05,aim[2]];f.lookT=1;}
    else if(f.lookT<=0){f.lookT=rnd(3,8);const a=f.yaw+rnd(-1.2,1.2);f.gaze=[f.p[0]+Math.sin(a)*2,f.p[1]+rnd(0,0.5),f.p[2]+Math.cos(a)*2];}
    f.lookT-=dt;
    const rel=wrapA(Math.atan2(f.gaze[0]-f.p[0],f.gaze[2]-f.p[2])-f.yaw);
    if(Math.abs(rel)>0.9)f.yaw+=Math.sign(rel)*(Math.abs(rel)-0.9)*Math.min(1,dt*4);
  }
  f.crouch+=(crT-f.crouch)*Math.min(1,dt*10);
  f.pupil+=((playing?0.5:0.3)-f.pupil)*dt*3;
  f.mood=G.happyT>0?'Happy':playing?'Focused':G.state==='ready'?'Focused':'Calm';
  f.weight*=Math.exp(-dt);f.scared=Math.max(0,f.scared-dt);
  const w=wrapA(0);
  if(!playing)return;
  if(G.pendingFire&&canFire()){fireTongue(G.pendingFire);G.pendingFire=null;return;}
  // jump / hop
  const ang=mv>0.1?Math.atan2(dx,dz):f.yaw;
  if(G.jumpQ){G.jumpQ=false;const d=1.0;planJump(clamp(f.p[0]+Math.sin(ang)*d,-GS+1.2,GS-1.2),clamp(f.p[2]+Math.cos(ang)*d,-GS+1.2,GS-1.2),null,true);ev({type:'hop',big:true});return;}
  if(mv>0.1){
    const d=inp.sprint?0.85:0.3;
    let tx=f.p[0]+dx/mv*d,tz=f.p[2]+dz/mv*d;const hr=Math.hypot(tx,tz);if(hr>7){tx*=7/hr;tz*=7/hr;}
    planJump(tx,tz,null,true);ev({type:'hop'});
  }
}
function ctrlSwim(dt){
  const f=frog,G=Game,inp=G.input;
  f.surf='water';f.swimT+=dt;f.swimPh+=dt*5;f.idleFor+=dt;
  const playing=G.state==='play';
  let dx=playing?inp.dx:0,dz=playing?inp.dz:0;
  if(playing&&G.touchTgt){const tx=G.touchTgt[0]-f.p[0],tz=G.touchTgt[2]-f.p[2],td=Math.hypot(tx,tz);if(td>0.3){dx=tx/td;dz=tz/td;}}
  const mv=Math.hypot(dx,dz);
  if(mv>0.1){
    const sp=(inp.sprint?1.1:0.7);f.moveSpeed=sp;
    f.yaw+=wrapA(Math.atan2(dx,dz)-f.yaw)*Math.min(1,dt*6);
    f.p[0]+=dx/mv*sp*dt;f.p[2]+=dz/mv*sp*dt;
    if(rand()<dt*4)addRipple(f.p[0]-Math.sin(f.yaw)*0.12,f.p[2]-Math.cos(f.yaw)*0.12,0.005,0.16,1);
    if(rand()<dt*1.2)bubbles.push({p:[f.p[0],WATER_Y-0.08,f.p[2]],v:[0,0.16,0],life:1.2,size:0.01});
    // leaving the water: hop onto the shore / pad ahead
    const ax=f.p[0]+dx/mv*0.35,az=f.p[2]+dz/mv*0.35;const s=surfAt(ax,az);
    if(s.type!=='water'&&playing){planJump(ax+dx/mv*0.2,az+dz/mv*0.2,null,true);ev({type:'hop'});return;}
  }else f.moveSpeed=0;
  {const th=terrainH(f.p[0],f.p[2]);if(th>WATER_Y-0.015){f.st='idle';f.surf='ground';f.p[1]=th+0.012;return;}}
  f.p[1]=WATER_Y-0.035+0.01*Math.sin(W.t*2.3)+waterBob();
  if(G.jumpQ&&playing){G.jumpQ=false;const ang=mv>0.1?Math.atan2(dx,dz):f.yaw;planJump(f.p[0]+Math.sin(ang)*1.0,f.p[2]+Math.cos(ang)*1.0,null,true);ev({type:'hop',big:true});return;}
  const aim=G.aimPt;if(aim){f.gaze=[aim[0],aim[1]+0.05,aim[2]];}
  f.crouch+=(0.3-f.crouch)*dt*3;f.pitch=0;f.mood='Focused';
  if(G.pendingFire&&canFire()){fireTongue(G.pendingFire);G.pendingFire=null;}
}
function setAim(ray){
  // aim point: along the cursor ray, at the height of the nearest bug (or ground) so the eyes look at what you look at
  const G=Game;let best=null,bd=1e9;
  for(const b of creatures){if(!b.game||b.dead||b.leave)continue;const rd=rayDist(ray.o,ray.d,b.p);if(rd<0.8&&rd<bd){bd=rd;best=b;}}
  if(best){G.aimPt=best.p.slice();return;}
  const g=groundHit(ray.o,ray.d);const w=waterHit(ray);
  G.aimPt=w?[w.p[0],0.05,w.p[2]]:(g?[g.p[0],g.p[1]+0.1,g.p[2]]:madd(ray.o,ray.d,3));
}
function gameSnap(){
  const G=Game;
  return{state:G.state,on:G.on,score:G.score,combo:G.combo,comboFrac:G.comboT>0?clamp(G.comboT/3.5,0,1):0,time:Math.max(0,Math.ceil(G.time)),best:G.best,round:G.round,bestCombo:G.bestCombo,night:!!(G.cfg&&G.cfg.night),camPulse:G.camPulse};
}
function touchDown(ray){
  const G=Game;if(G.state!=='play')return'none';
  if(frogHit(ray)!==null){G.jumpQ=true;return'jump';}
  let near=false;for(const b of creatures){if(b.game&&!b.dead&&!b.leave&&rayDist(ray.o,ray.d,b.p)<0.45){near=true;break;}}
  if(near){fireTongue(ray);return'fire';}
  const g=groundHit(ray.o,ray.d),w=waterHit(ray);const p=w?w.p:(g?g.p:null);if(p){G.touchTgt=p.slice();}
  return'move';
}
function touchMove(ray){const G=Game;if(!G.touchTgt)return;const g=groundHit(ray.o,ray.d),w=waterHit(ray);const p=w?w.p:(g?g.p:null);if(p)G.touchTgt=p.slice();}

// ======================================================================
// EXPORTS
// ======================================================================
function consumeEvents(){const e=W.events;W.events=[];return e;}
return{setDifficulty,DIFF,spawnBug,Game,gameSnap,gameStart,gameLeave,setAim,fireTongue,touchDown,touchMove,S,W,wind,update,reset,defaults,emitAll,fillEnv,ENV,cnt,LF,PTL,PDL,BLB,TVB,TIB,BBB,creatureBuf,creatureCnt,hover,down,dragTo,up,throwAt,stats,setWeather,terrainH,pondD,groundHit,addRipple,splash,consumeEvents,frog,
  get plants(){return plants;},get creatures(){return creatures;},get pads(){return pads;},get fish(){return fish;},windAt,BEDS,frogCenter};
})();