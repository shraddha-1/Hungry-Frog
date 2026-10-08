/* App: WebGPU setup, pipelines, render loop, camera, input, UI, audio */
(async function main(){
const $=id=>document.getElementById(id);
const fail=t=>{$('msg').style.display='flex';if(t)$('msgText').textContent=t;};
if(!navigator.gpu){fail();return;}
let adapter=null;try{adapter=await navigator.gpu.requestAdapter();}catch(e){}
if(!adapter){fail('No WebGPU adapter was found on this device.');return;}
let device;try{device=await adapter.requestDevice();}catch(e){fail('Could not create a WebGPU device.');return;}
device.lost.then(i=>fail('The GPU device was lost ('+(i&&i.message||'unknown')+'). Reload the page.'));
device.addEventListener('uncapturederror',e=>console.error(e.error&&e.error.message));
const canvas=$('c');
const ctx=canvas.getContext('webgpu');
const format=navigator.gpu.getPreferredCanvasFormat();
ctx.configure({device,format,alphaMode:'opaque'});
const G=Pond,S=G.S,W=G.W;
globalThis.__G=G;
G.defaults();G.reset();

/* ---------------- math ---------------- */
const nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
const crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
function persp(f,a,n,fa){const t=1/Math.tan(f/2);return[t/a,0,0,0,0,t,0,0,0,0,fa/(n-fa),-1,0,0,n*fa/(n-fa),0];}
function look(e,c){const z=nrm([e[0]-c[0],e[1]-c[1],e[2]-c[2]]);const x=nrm(crs([0,1,0],z));const y=crs(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1];}
function mmul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}

/* ---------------- shaders ---------------- */
const rmod=device.createShaderModule({code:COMMON_WGSL+SCENE_WGSL});
const cmod=device.createShaderModule({code:COMPUTE_WGSL});
[rmod,cmod].forEach(m=>m.getCompilationInfo&&m.getCompilationInfo().then(i=>i.messages.forEach(x=>{if(x.type==='error')console.error('WGSL',x.lineNum,x.message);})));

/* ---------------- buffers & textures ---------------- */
const U=GPUBufferUsage;
const mkBuf=(size,usage)=>device.createBuffer({size:Math.ceil(size/4)*4,usage:usage|U.COPY_DST});
const mkStatic=(arr,usage)=>{const b=mkBuf(arr.byteLength,usage);device.queue.writeBuffer(b,0,arr);return b;};
const viewBuf=[0,1,2].map(()=>mkBuf(192,U.UNIFORM));
const envBuf=mkBuf(1344,U.UNIFORM);
const bendBuf=[0,1].map(()=>mkBuf(96*96*16,U.STORAGE));
const waterBuf=[0,1].map(()=>mkBuf(128*128*16,U.STORAGE));
[bendBuf,waterBuf].forEach(a=>a.forEach(b=>device.queue.writeBuffer(b,0,new Float32Array(b.size/4))));
const postBuf=mkBuf(48,U.UNIFORM);

// static meshes
const terrainN=200;
const terrain=(()=>{const v=new Float32Array((terrainN+1)**2*2),ix=new Uint32Array(terrainN*terrainN*6);let k=0;
  for(let j=0;j<=terrainN;j++)for(let i=0;i<=terrainN;i++){v[k++]=-9+18*i/terrainN;v[k++]=-9+18*j/terrainN;}
  let q=0;for(let j=0;j<terrainN;j++)for(let i=0;i<terrainN;i++){const a=j*(terrainN+1)+i,b=a+1,c=a+terrainN+1,d=c+1;ix[q++]=a;ix[q++]=c;ix[q++]=b;ix[q++]=b;ix[q++]=c;ix[q++]=d;}
  return{vb:mkStatic(v,U.VERTEX),ib:mkStatic(ix,U.INDEX),n:ix.length};})();
const waterN=96;
const waterMesh=(()=>{const v=new Float32Array((waterN+1)**2*2),ix=new Uint32Array(waterN*waterN*6);let k=0;
  for(let j=0;j<=waterN;j++)for(let i=0;i<=waterN;i++){v[k++]=i/waterN;v[k++]=j/waterN;}
  let q=0;for(let j=0;j<waterN;j++)for(let i=0;i<waterN;i++){const a=j*(waterN+1)+i,b=a+1,c=a+waterN+1,d=c+1;ix[q++]=a;ix[q++]=c;ix[q++]=b;ix[q++]=b;ix[q++]=c;ix[q++]=d;}
  return{vb:mkStatic(v,U.VERTEX),ib:mkStatic(ix,U.INDEX),n:ix.length};})();
const grassIdx=mkStatic(new Uint16Array((()=>{const a=[];for(let r=0;r<5;r++){const v0=2*r,v1=v0+1,v2=v0+2,v3=v0+3;a.push(v0,v1,v2,v1,v3,v2);}return a;})()),U.INDEX);
const folMesh=(()=>{const NU=5,NV=8,v=[],ix=[];
  for(let j=0;j<NV;j++)for(let i=0;i<NU;i++){v.push(-1+2*i/(NU-1),j/(NV-1));}
  for(let j=0;j<NV-1;j++)for(let i=0;i<NU-1;i++){const a=j*NU+i,b=a+1,c=a+NU,d=c+1;ix.push(a,c,b,b,c,d);}
  return{vb:mkStatic(new Float32Array(v),U.VERTEX),ib:mkStatic(new Uint16Array(ix.length%2?[...ix,0]:ix),U.INDEX),n:ix.length};})();
const padMesh=(()=>{const NR=5,NS=28,v=[],ix=[];
  for(let r=0;r<NR;r++)for(let s=0;s<=NS;s++){v.push(r/(NR-1),s/NS);}
  for(let r=0;r<NR-1;r++)for(let s=0;s<NS;s++){const a=r*(NS+1)+s,b=a+1,c=a+NS+1,d=c+1;ix.push(a,c,b,b,c,d);}
  return{vb:mkStatic(new Float32Array(v),U.VERTEX),ib:mkStatic(new Uint16Array(ix),U.INDEX),n:ix.length};})();
const sphere=(()=>{const LA=18,LO=26,v=[],ix=[];
  for(let i=0;i<=LA;i++){const th=i/LA*Math.PI;for(let j=0;j<=LO;j++){const ph=j/LO*Math.PI*2;v.push(Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph));}}
  for(let i=0;i<LA;i++)for(let j=0;j<LO;j++){const a=i*(LO+1)+j,b=a+1,c=a+LO+1,d=c+1;ix.push(a,c,b,b,c,d);}
  return{vb:mkStatic(new Float32Array(v),U.VERTEX),ib:mkStatic(new Uint16Array(ix),U.INDEX),n:ix.length};})();
const cube=(()=>{const v=[],ix=[];
  const faces=[[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]],[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]]];
  faces.forEach((f,fi)=>{const n=f[0],u=f[1],w=f[2];const b=v.length/6;
    for(const [su,sw] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=[0,1,2].map(k=>0.5*(n[k]+su*u[k]+sw*w[k]));v.push(p[0],p[1]+0.5,p[2],n[0],n[1],n[2]);}
    ix.push(b,b+1,b+2,b,b+2,b+3);});
  // y range 0..1 (shifted by +0.5)
  return{vb:mkStatic(new Float32Array(v),U.VERTEX),ib:mkStatic(new Uint16Array(ix),U.INDEX),n:ix.length};})();

/* ---- creature meshes ---- */
function MB(){return{v:[],i:[]};}
function mEll(m,c,r,part,nu,nv,uvf){
  nu=nu||12;nv=nv||8;const b=m.v.length/9;
  for(let i=0;i<=nv;i++){const th=i/nv*Math.PI;for(let j=0;j<=nu;j++){const ph=j/nu*Math.PI*2;
    const p=[Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)];
    // elongated along z: remap so that axis z is the polar axis -> swap
    const q=[p[0],p[2],p[1]];
    const pos=[c[0]+q[0]*r[0],c[1]+q[1]*r[1],c[2]+q[2]*r[2]];
    const n=nrm([q[0]/r[0],q[1]/r[1],q[2]/r[2]]);
    const uv=uvf?uvf(q,pos):[j/nu,i/nv];
    m.v.push(pos[0],pos[1],pos[2],n[0],n[1],n[2],uv[0],uv[1],part);}}
  for(let i=0;i<nv;i++)for(let j=0;j<nu;j++){const a=b+i*(nu+1)+j,bb=a+1,cc=a+nu+1,d=cc+1;m.i.push(a,cc,bb,bb,cc,d);}
}
function mPoly(m,pts,part,side,dihedral){
  // triangle fan around centroid; pts in (x,z); x>=0 for left; mirrored for side -1
  let cx=0,cz=0;pts.forEach(p=>{cx+=p[0];cz+=p[1];});cx/=pts.length;cz/=pts.length;
  const b=m.v.length/9;
  const mk=(x,z)=>{const xx=x*side;const y=(dihedral||0.1)*x*x;m.v.push(xx,y,z,0,1,0,Math.min(1,Math.abs(x)/Math.max(1e-3,m.maxx||1.4)),(z+1)/2,part);};
  mk(cx,cz);for(const p of pts)mk(p[0],p[1]);
  const n=pts.length;for(let k=0;k<n;k++){m.i.push(b,b+1+k,b+1+(k+1)%n);}
}
function smoothClosed(pts,sub){const out=[],n=pts.length;for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],b=pts[i],c=pts[(i+1)%n],d=pts[(i+2)%n];
  for(let s=0;s<sub;s++){const t=s/sub,t2=t*t,t3=t2*t;out.push([0,1].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));}}return out;}
function mTube(m,pts,radii,part,sides){
  const b=m.v.length/9;
  for(let k=0;k<pts.length;k++){const p=pts[k];
    for(let i=0;i<=sides;i++){const th=i/sides*Math.PI*2;const nx=Math.cos(th),ny=Math.sin(th);
      m.v.push(p[0]+nx*radii[k],p[1]+ny*radii[k],p[2],nx,ny,0,i/sides,k/(pts.length-1),part);}}
  for(let k=0;k<pts.length-1;k++)for(let i=0;i<sides;i++){const a=b+k*(sides+1)+i,bb=a+1,c=a+sides+1,d=c+1;m.i.push(a,c,bb,bb,c,d);}
}
function finishMesh(m){return{vb:mkStatic(new Float32Array(m.v),U.VERTEX),ib:mkStatic(new Uint16Array(m.i.length%2?[...m.i,0]:m.i),U.INDEX),n:m.i.length};}
const creMesh=[];
{ // butterfly
  const m=MB();m.maxx=1.4;
  mEll(m,[0,0,0.15],[0.09,0.09,0.32],0,8,6,(q)=>[0,0]);mEll(m,[0,0,-0.4],[0.07,0.07,0.5],0,8,6,(q)=>[0,0]);mEll(m,[0,0,0.55],[0.09,0.09,0.09],0,8,6,(q)=>[0,0]);
  const fw=smoothClosed([[0.08,0.25],[0.5,0.78],[1.0,0.88],[1.4,0.62],[1.38,0.15],[1.1,-0.2],[0.6,-0.3],[0.08,-0.05]],4);
  const hw=smoothClosed([[0.08,-0.02],[0.6,-0.22],[1.0,-0.5],[0.95,-0.95],[0.55,-0.98],[0.15,-0.55]],4);
  for(const [side,part] of [[1,1],[-1,2]]){mPoly(m,fw,part,side,0.12);mPoly(m,hw,part,side,0.12);}
  creMesh[0]=finishMesh(m);
}
{ // bee
  const m=MB();m.maxx=1.0;
  mEll(m,[0,0,0.55],[0.16,0.16,0.16],0,8,6,()=>[0,0]);
  mEll(m,[0,0,0.22],[0.24,0.22,0.26],0,10,6,()=>[0,0]);
  mEll(m,[0,-0.02,-0.34],[0.21,0.19,0.4],0,12,8,(q,p)=>[q[0]*0.5+0.5,(p[2]+0.9)*1.0]);
  const fw=smoothClosed([[0.05,0.2],[0.5,0.42],[1.0,0.3],[1.05,-0.05],[0.6,-0.2],[0.05,-0.05]],4);
  const hw=smoothClosed([[0.05,-0.05],[0.5,-0.2],[0.8,-0.4],[0.6,-0.6],[0.2,-0.4]],4);
  for(const [side,part] of [[1,1],[-1,2]]){mPoly(m,fw,part,side,0.25);mPoly(m,hw,part+2,side,0.25);}
  creMesh[1]=finishMesh(m);
}
{ // ladybug
  const m=MB();
  mEll(m,[0,0.1,0],[0.55,0.42,0.62],0,14,10,()=>[0,0]);mEll(m,[0,0.02,0.62],[0.24,0.2,0.2],0,8,6,()=>[0,0]);
  creMesh[2]=finishMesh(m);
}
{ // dragonfly
  const m=MB();m.maxx=2.0;
  mEll(m,[0,0,1.0],[0.28,0.26,0.26],0,10,8,()=>[0,0]);mEll(m,[0,0.04,0.55],[0.24,0.28,0.4],0,10,8,()=>[0,0]);
  const pts=[],rad=[];for(let i=0;i<=8;i++){pts.push([0,0.0,0.2-i*0.36]);rad.push(0.13-0.045*i/8);}
  mTube(m,pts,rad,0,8);
  const fw=smoothClosed([[0.12,0.45],[0.8,0.52],[1.6,0.42],[2.0,0.22],[1.9,-0.02],[1.2,-0.1],[0.4,-0.06],[0.12,0.05]],4);
  const hw=smoothClosed([[0.12,0.0],[0.7,0.08],[1.5,-0.02],[1.9,-0.2],[1.8,-0.5],[1.1,-0.55],[0.4,-0.4],[0.12,-0.3]],4);
  for(const [side,part] of [[1,1],[-1,2]]){mPoly(m,fw,part,side,0.04);mPoly(m,hw,part+2,side,0.04);}
  creMesh[3]=finishMesh(m);
}
{ // bird
  const m=MB();m.maxx=2.1;
  mEll(m,[0,0,0],[0.36,0.33,0.6],0,12,8,()=>[0,0]);mEll(m,[0,0.14,0.62],[0.22,0.22,0.22],0,10,8,()=>[0,0]);
  mEll(m,[0.16,0.2,0.74],[0.04,0.04,0.04],7,6,4);mEll(m,[-0.16,0.2,0.74],[0.04,0.04,0.04],7,6,4);
  mTube(m,[[0,0.12,0.8],[0,0.11,0.95],[0,0.1,1.04]],[0.07,0.045,0.01],6,6);
  mPoly(m,smoothClosed([[0.0,-0.5],[0.18,-0.8],[0.2,-1.3],[0,-1.4],[-0.2,-1.3],[-0.18,-0.8]].map(p=>[p[0]+0.25,p[1]]),3).map(p=>[p[0]-0.25,p[1]]),0,1,0.0);
  const wing=smoothClosed([[0.25,0.28],[1.0,0.5],[1.8,0.3],[2.1,-0.1],[1.7,-0.4],[1.0,-0.55],[0.25,-0.45]],4);
  for(const [side,part] of [[1,1],[-1,2]])mPoly(m,wing,part,side,0.05);
  creMesh[4]=finishMesh(m);
}
{ // frog
  const m=MB();
  mEll(m,[0,0.0,0],[0.5,0.32,0.66],0,14,10,()=>[0,0]);mEll(m,[0,0.1,0.56],[0.4,0.26,0.32],0,12,8,()=>[0,0]);
  mEll(m,[0.2,0.32,0.62],[0.11,0.11,0.11],6,8,6);mEll(m,[-0.2,0.32,0.62],[0.11,0.11,0.11],6,8,6);
  mEll(m,[0.45,-0.12,-0.3],[0.18,0.16,0.46],0,8,6);mEll(m,[-0.45,-0.12,-0.3],[0.18,0.16,0.46],0,8,6);
  mEll(m,[0.3,-0.22,0.45],[0.1,0.1,0.22],0,6,4);mEll(m,[-0.3,-0.22,0.45],[0.1,0.1,0.22],0,6,4);
  creMesh[5]=finishMesh(m);
}

// planks
const plankBuf=mkStatic(new Float32Array(8),U.VERTEX);const plankN=0;
// dynamic buffers
const tubeVB=mkBuf(40000*36,U.VERTEX),tubeIB=mkBuf(120000*4,U.INDEX);
const leafB=mkBuf(8000*96,U.VERTEX),petB=mkBuf(1400*96,U.VERTEX),padB=mkBuf(64*96,U.VERTEX),blobB=mkBuf(900*64,U.VERTEX),bbB=mkBuf(600*32,U.VERTEX);
const creB=[0,1,2,3,4,5].map(()=>mkBuf(32*80,U.VERTEX));

/* ---------------- layouts & pipelines ---------------- */
const bgl0=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},
  {binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},
  {binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:5,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
const bgl1=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},
  {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}}]});
const plRender=device.createPipelineLayout({bindGroupLayouts:[bgl0,bgl1]});
const HDR='rgba16float',DEPTH='depth32float';
const A=(loc,off,fmt)=>({shaderLocation:loc,offset:off,format:fmt});
const VBL={
  xz:{arrayStride:8,attributes:[A(0,0,'float32x2')]},
  plankM:{arrayStride:24,attributes:[A(0,0,'float32x3'),A(1,12,'float32x3')]},
  plankI:{arrayStride:32,stepMode:'instance',attributes:[A(2,0,'float32x4'),A(3,16,'float32x4')]},
  blobM:{arrayStride:12,attributes:[A(0,0,'float32x3')]},
  blobI:{arrayStride:64,stepMode:'instance',attributes:[A(1,0,'float32x4'),A(2,16,'float32x4'),A(3,32,'float32x4'),A(4,48,'float32x4')]},
  tube:{arrayStride:36,attributes:[A(0,0,'float32x3'),A(1,12,'float32x3'),A(2,24,'float32x2'),A(3,32,'float32')]},
  folM:{arrayStride:8,attributes:[A(0,0,'float32x2')]},
  folI:{arrayStride:96,stepMode:'instance',attributes:[A(1,0,'float32x4'),A(2,16,'float32x4'),A(3,32,'float32x4'),A(4,48,'float32x4'),A(5,64,'float32x4'),A(6,80,'float32x4')]},
  creM:{arrayStride:36,attributes:[A(0,0,'float32x3'),A(1,12,'float32x3'),A(2,24,'float32x2'),A(3,32,'float32')]},
  creI:{arrayStride:80,stepMode:'instance',attributes:[A(4,0,'float32x4'),A(5,16,'float32x4'),A(6,32,'float32x4'),A(7,48,'float32x4'),A(8,64,'float32x4')]},
  bbI:{arrayStride:32,stepMode:'instance',attributes:[A(0,0,'float32x4'),A(1,16,'float32x4')]},
};
const BLEND_ALPHA={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'zero',dstFactor:'one'}};
const BLEND_ADD={color:{srcFactor:'one',dstFactor:'one'},alpha:{srcFactor:'zero',dstFactor:'one'}};
function mkPipe(vs,fs,bufs,opt){
  opt=opt||{};
  const mk=(pass)=>{
    const d={layout:plRender,vertex:{module:rmod,entryPoint:vs,buffers:bufs},primitive:{topology:'triangle-list',cullMode:'none'}};
    const dsWrite=opt.noDepthWrite?false:true;
    if(pass==='shadow'){
      d.depthStencil={format:DEPTH,depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2.5};
    }else{
      d.fragment={module:rmod,entryPoint:fs,targets:[{format:HDR,blend:opt.blend}]};
      d.depthStencil={format:DEPTH,depthWriteEnabled:dsWrite,depthCompare:opt.always?'always':'less'};
      if(pass==='main')d.multisample={count:4};
    }
    return device.createRenderPipeline(d);
  };
  const o={};
  for(const p of (opt.passes||['main','refl','shadow']))o[p]=mk(p);
  return o;
}
const P={
  sky:mkPipe('vs_sky','fs_sky',[],{passes:['main','refl'],noDepthWrite:true,always:true}),
  terrain:mkPipe('vs_terrain','fs_terrain',[VBL.xz],{passes:['main','refl']}),
  grass:mkPipe('vs_grass','fs_grass',[],{passes:['main']}),
  plank:mkPipe('vs_plank','fs_plank',[VBL.plankM,VBL.plankI]),
  blob:mkPipe('vs_blob','fs_blob',[VBL.blobM,VBL.blobI]),
  tube:mkPipe('vs_tube','fs_tube',[VBL.tube]),
  fol:mkPipe('vs_fol','fs_fol',[VBL.folM,VBL.folI]),
  cre:mkPipe('vs_cre','fs_cre',[VBL.creM,VBL.creI],{passes:['main']}),
  water:mkPipe('vs_water','fs_water',[VBL.xz],{passes:['main'],blend:BLEND_ALPHA,noDepthWrite:true}),
  rain:mkPipe('vs_rain','fs_rain',[],{passes:['main'],blend:BLEND_ADD,noDepthWrite:true}),
  splash:mkPipe('vs_splash','fs_splash',[],{passes:['main'],blend:BLEND_ADD,noDepthWrite:true}),
  bb:mkPipe('vs_bb','fs_bb',[VBL.bbI],{passes:['main'],blend:BLEND_ADD,noDepthWrite:true}),
};
// water mesh uses uv attribute directly (xz VBL works for 2 floats)

/* ---- compute ---- */
const cbgl=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
  {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
  {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]});
const cpl=device.createPipelineLayout({bindGroupLayouts:[cbgl]});
const cpBend=device.createComputePipeline({layout:cpl,compute:{module:cmod,entryPoint:'cs_bend'}});
const cpWater=device.createComputePipeline({layout:cpl,compute:{module:cmod,entryPoint:'cs_water'}});
const cbBend=[0,1].map(i=>device.createBindGroup({layout:cbgl,entries:[{binding:0,resource:{buffer:envBuf}},{binding:1,resource:{buffer:bendBuf[i]}},{binding:2,resource:{buffer:bendBuf[1-i]}}]}));
const cbWater=[0,1].map(i=>device.createBindGroup({layout:cbgl,entries:[{binding:0,resource:{buffer:envBuf}},{binding:1,resource:{buffer:waterBuf[i]}},{binding:2,resource:{buffer:waterBuf[1-i]}}]}));
const fieldBG=[0,1].map(i=>device.createBindGroup({layout:bgl1,entries:[{binding:0,resource:{buffer:bendBuf[i]}},{binding:1,resource:{buffer:waterBuf[i]}}]}));
let parity=0;

/* ---- post pipeline ---- */
const pbgl=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
const postPipe=device.createRenderPipeline({layout:device.createPipelineLayout({bindGroupLayouts:[pbgl]}),vertex:{module:rmod,entryPoint:'vs_post'},
  fragment:{module:rmod,entryPoint:'fs_post',targets:[{format}]},primitive:{topology:'triangle-list'}});
const linSmp=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
const cmpSmp=device.createSampler({compare:'less',magFilter:'linear',minFilter:'linear'});

/* ---- render targets ---- */
const SH=2048;
const shadowTex=device.createTexture({size:[SH,SH],format:DEPTH,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
const dummyDepth=device.createTexture({size:[1,1],format:DEPTH,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
const dummyCol=device.createTexture({size:[1,1],format:HDR,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
let msaaTex,depthTex,hdrTex,reflTex,reflDepth,bgMain,bgRefl,bgShadow,bgPost,rw=0,rh=0,qw=0,qh=0;
function mkBG0(view,shadowV,reflV){return device.createBindGroup({layout:bgl0,entries:[{binding:0,resource:{buffer:view}},{binding:1,resource:{buffer:envBuf}},{binding:2,resource:shadowV},{binding:3,resource:cmpSmp},{binding:4,resource:reflV},{binding:5,resource:linSmp}]});}
function makeTargets(w,h){
  [msaaTex,depthTex,hdrTex,reflTex,reflDepth].forEach(t=>t&&t.destroy());
  msaaTex=device.createTexture({size:[w,h],format:HDR,sampleCount:4,usage:GPUTextureUsage.RENDER_ATTACHMENT});
  depthTex=device.createTexture({size:[w,h],format:DEPTH,sampleCount:4,usage:GPUTextureUsage.RENDER_ATTACHMENT});
  hdrTex=device.createTexture({size:[w,h],format:HDR,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  qw=Math.max(2,Math.floor(w/2));qh=Math.max(2,Math.floor(h/2));
  reflTex=device.createTexture({size:[qw,qh],format:HDR,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  reflDepth=device.createTexture({size:[qw,qh],format:DEPTH,usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const sv=shadowTex.createView(),dd=dummyDepth.createView(),dc=dummyCol.createView(),rv=reflTex.createView();
  bgMain=mkBG0(viewBuf[0],sv,rv);bgRefl=mkBG0(viewBuf[1],sv,dc);bgShadow=mkBG0(viewBuf[2],dd,dc);
  bgPost=device.createBindGroup({layout:pbgl,entries:[{binding:0,resource:hdrTex.createView()},{binding:1,resource:linSmp},{binding:2,resource:{buffer:postBuf}}]});
}

/* ---------------- camera ---------------- */
const cam={yaw:0.6,pitch:0.5,dist:4.8,t:[0,0.05,0],dyaw:0.6,dpitch:0.5,ddist:4.8,dt:[0,0.05,0],pos:[0,3,5],look:[0,0,0],ev:[0,0,0]};
const FOV=0.8;
function camBasis(eye,tgt){const f=nrm([tgt[0]-eye[0],tgt[1]-eye[1],tgt[2]-eye[2]]);const r=nrm(crs(f,[0,1,0]));const u=crs(r,f);return{f,r,u};}
const gameOn=()=>{const g=G.Game;return g.on&&(g.state==='ready'||g.state==='play'||g.state==='over');};
cam.zoomGame=1.9;cam.userT=9;let prevFrogSt='';
function enterGameCam(){cam.zoomGame=1.9;cam.dpitch=0.52;cam.dyaw=G.frog.yaw+Math.PI;cam.userT=9;}
function updateCamera(dt){
  const k=1-Math.exp(-dt*6);
  const gm=gameOn();
  if(gm){
    const f=G.frog,c=G.frogCenter();
    cam.userT+=dt;
    if(keys.has('q')){cam.dyaw+=2.2*dt;cam.userT=0;}if(keys.has('e')){cam.dyaw-=2.2*dt;cam.userT=0;}
    if(keys.has('r')){cam.dpitch-=1.2*dt;cam.userT=0;}if(keys.has('f')){cam.dpitch+=1.2*dt;cam.userT=0;}
    const moving=(f.st==='crouch'||f.st==='air'||f.st==='swim'&&f.moveSpeed>0.1);
    if(cam.userT>5&&moving){let d=(f.yaw+Math.PI)-cam.dyaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;cam.dyaw+=d*Math.min(1,dt*0.55);}
    if(prevFrogSt==='air'&&f.st!=='air')cam.land=0.09;prevFrogSt=f.st;
    cam.land=(cam.land||0)*Math.exp(-dt*6);
    cam.dt=[c[0],c[1]+0.2,c[2]];
    cam.ddist=clamp(cam.zoomGame+(f.st==='air'?0.4:0)-cam.land,1.3,4.4);
    cam.dpitch=clamp(cam.dpitch,0.15,1.2);
    const kk=1-Math.exp(-dt*7);
    cam.yaw+=((cam.dyaw-cam.yaw))*k;cam.pitch+=(cam.dpitch-cam.pitch)*k;cam.dist+=(cam.ddist-cam.dist)*k;
    for(let i=0;i<3;i++)cam.t[i]+=(cam.dt[i]-cam.t[i])*kk;
    for(let i=0;i<3;i++)cam.ev[i]*=Math.exp(-dt*3);
  }else{
  cam.ddist=clamp(cam.ddist,1.3,11);cam.dpitch=clamp(cam.dpitch,0.1,1.45);
  cam.dt[0]=clamp(cam.dt[0],-3.5,3.5);cam.dt[2]=clamp(cam.dt[2],-3.5,3.5);cam.dt[1]=clamp(cam.dt[1],-0.2,1.2);
  cam.yaw+=(cam.dyaw-cam.yaw)*k;cam.pitch+=(cam.dpitch-cam.pitch)*k;cam.dist+=(cam.ddist-cam.dist)*k;
  for(let i=0;i<3;i++)cam.t[i]+=(cam.dt[i]-cam.t[i])*k;
  const ev=W.camEvent;let tg=[0,0,0];
  if(ev&&W.t-ev.t<3&&!input.down){const f=Math.sin(Math.PI*clamp((W.t-ev.t)/3,0,1))*ev.k*0.28;tg=[(ev.p[0]-cam.dt[0])*f,(ev.p[1]-cam.dt[1])*f*0.3,(ev.p[2]-cam.dt[2])*f];}
  for(let i=0;i<3;i++)cam.ev[i]+=(tg[i]-cam.ev[i])*(1-Math.exp(-dt*1.6));
  }
  const tx=cam.t[0]+cam.ev[0],ty=cam.t[1]+cam.ev[1],tz=cam.t[2]+cam.ev[2];
  const cp=Math.cos(cam.pitch);
  const eye=[tx+cam.dist*Math.sin(cam.yaw)*cp,ty+cam.dist*Math.sin(cam.pitch),tz+cam.dist*Math.cos(cam.yaw)*cp];
  eye[0]=clamp(eye[0],-12,12);eye[2]=clamp(eye[2],-12,12);
  if(gm){ // keep the frog in view: pull the camera in if a hill/bank would sit between it and the frog
    let occ=1;
    for(let i=1;i<=14;i++){const u=i/14,px=tx+(eye[0]-tx)*u,py=ty+(eye[1]-ty)*u,pz=tz+(eye[2]-tz)*u;
      if(py<G.terrainH(px,pz)+0.22){occ=Math.max(0.18,(i-1)/14);break;}}
    cam.occ=cam.occ===undefined?1:cam.occ;
    cam.occ=occ<cam.occ?occ:cam.occ+(occ-cam.occ)*Math.min(1,dt*2.5);
    eye[0]=tx+(eye[0]-tx)*cam.occ;eye[1]=ty+(eye[1]-ty)*cam.occ;eye[2]=tz+(eye[2]-tz)*cam.occ;
  }
  eye[1]=Math.max(eye[1],G.terrainH(eye[0],eye[2])+0.3,0.3);
  cam.pos=eye;cam.look=[tx,ty,tz];
}
function camView(w,h){
  const eye=cam.pos,tgt=cam.look;const b=camBasis(eye,tgt);
  const asp=w/h,ty=Math.tan(FOV/2);
  const vp=mmul(persp(FOV,asp,0.05,300),look(eye,tgt));
  return{eye,vp,r:b.r,u:b.u,f:b.f,tanX:ty*asp,tanY:ty};
}
function rayAt(cx,cy){
  const rc=canvas.getBoundingClientRect();const cv=camView(rc.width,rc.height);
  const nx=(cx-rc.left)/rc.width*2-1,ny=1-(cy-rc.top)/rc.height*2;
  const d=nrm([cv.f[0]+cv.r[0]*nx*cv.tanX+cv.u[0]*ny*cv.tanY,cv.f[1]+cv.r[1]*nx*cv.tanX+cv.u[1]*ny*cv.tanY,cv.f[2]+cv.r[2]*nx*cv.tanX+cv.u[2]*ny*cv.tanY]);
  return{o:cv.eye,d,f:cv.f};
}

/* ---------------- input ---------------- */
const input={ptrs:new Map(),mode:null,down:null,pinch:null};
const keys=new Set();
function resetCamera(){cam.dyaw=0.75;cam.dpitch=0.45;cam.ddist=4.2;cam.dt=[0.5,0.05,0.7];}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);input.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  Snd.resume();
  if(input.ptrs.size===2){if(input.mode==='grab')G.up();G.Game.touchTgt=null;const [a,b]=[...input.ptrs.values()];input.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),dist:gameOn()?cam.zoomGame:cam.ddist,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};input.mode='pinch';return;}
  if(input.ptrs.size>2)return;
  input.down={x:e.clientX,y:e.clientY};
  const ray=rayAt(e.clientX,e.clientY);
  if(gameOn()){
    if(e.pointerType==='touch'){input.mode='gtouch';G.touchDown(ray);return;}
    if(e.button===2||e.button===1){input.mode='gorbit';return;}
    G.setAim(ray);G.fireTongue(ray);input.mode='gfire';return;
  }
  if(e.button===2||e.shiftKey||e.button===1){input.mode='pan';return;}
  const type=G.down(ray);
  if(type==='ground'){input.mode='orbit';}else{input.mode='grab';}
});
canvas.addEventListener('pointermove',e=>{
  if(input.ptrs.has(e.pointerId))input.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(input.mode==='pinch'&&input.ptrs.size>=2&&input.pinch){const [a,b]=[...input.ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(gameOn()){cam.zoomGame=clamp(input.pinch.dist*input.pinch.d/Math.max(d,1),1.3,4.2);const cx2=(a.x+b.x)/2;cam.dyaw-=(cx2-input.pinch.cx)*0.008;input.pinch.cx=cx2;cam.userT=0;}else{cam.ddist=clamp(input.pinch.dist*input.pinch.d/Math.max(d,1),1.3,11);const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;pan(cx-input.pinch.cx,cy-input.pinch.cy);input.pinch.cx=cx;input.pinch.cy=cy;}
    return;}
  const ray=rayAt(e.clientX,e.clientY);
  const dn=input.down;
  if(gameOn()){
    G.setAim(ray);
    if(dn){const dx=e.clientX-dn.x,dy=e.clientY-dn.y;dn.x=e.clientX;dn.y=e.clientY;
      if(input.mode==='gorbit'){cam.dyaw-=dx*0.01;cam.dpitch=clamp(cam.dpitch+dy*0.007,0.15,1.2);cam.userT=0;}
      else if(input.mode==='gtouch')G.touchMove(ray);}
    return;
  }
  if(!dn){G.hover(ray);return;}
  const dx=e.clientX-dn.x,dy=e.clientY-dn.y;dn.x=e.clientX;dn.y=e.clientY;
  if(input.mode==='orbit'){G.hover(ray);cam.dyaw-=dx*0.006;cam.dpitch=clamp(cam.dpitch+dy*0.005,0.1,1.45);}
  else if(input.mode==='pan'){pan(dx,dy);}
  else if(input.mode==='grab'){G.dragTo(ray,Math.hypot(dx,dy));}
});
function pan(dx,dy){const b=camBasis(cam.pos,cam.look);const k=cam.ddist*0.0016;cam.dt[0]-=b.r[0]*dx*k;cam.dt[2]-=b.r[2]*dx*k;const fl=nrm([b.f[0],0,b.f[2]]);cam.dt[0]+=fl[0]*dy*k;cam.dt[2]+=fl[2]*dy*k;}
function endPtr(e){
  input.ptrs.delete(e.pointerId);
  if(input.mode==='pinch'){if(input.ptrs.size<2){input.pinch=null;input.mode=null;input.down=null;}return;}
  if(input.mode==='gtouch')G.Game.touchTgt=null;
  if(input.mode==='grab'||input.mode==='orbit')G.up();
  input.mode=null;input.down=null;
}
canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('pointerleave',()=>{if(W.cursor&&!input.down)W.cursor.active=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(gameOn())cam.zoomGame=clamp(cam.zoomGame*Math.exp(e.deltaY*0.001),1.3,4.2);else cam.ddist=clamp(cam.ddist*Math.exp(e.deltaY*0.0012),1.3,11);},{passive:false});
addEventListener('keydown',e=>{
  if(['INPUT','SELECT'].includes(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(gameOn()||G.Game.state==='results'||G.Game.state==='menu'&&false){
    if(k===' '){e.preventDefault();if(!e.repeat&&G.Game.state==='play')G.Game.jumpQ=true;}
    if((k==='escape'||k==='p')&&!e.repeat)togglePause();
    keys.add(k);
    if(['arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
    return;
  }
  if(k===' '){e.preventDefault();$('pause').click();}
  if(k==='t')$('throw').click();if(k==='r')$('rcam').click();
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());
function applyKeyInput(){
  let vx=0,vy=0;
  if(keys.has('w')||keys.has('arrowup'))vy+=1;if(keys.has('s')||keys.has('arrowdown'))vy-=1;
  if(keys.has('d')||keys.has('arrowright'))vx+=1;if(keys.has('a')||keys.has('arrowleft'))vx-=1;
  const b=camBasis(cam.pos,cam.look);const fl=nrm([b.f[0],0,b.f[2]]);const r=[-fl[2],0,fl[0]];
  let dx=fl[0]*vy+r[0]*vx,dz=fl[2]*vy+r[2]*vx;const l=Math.hypot(dx,dz);if(l>1){dx/=l;dz/=l;}
  G.Game.input={dx,dz,sprint:keys.has('shift')};
}
function throwObj(){
  const tgt=W.cursorPt?[W.cursorPt[0],Math.max(W.cursorPt[1],0)+0.05,W.cursorPt[2]]:[0,0.05,0];
  G.throwAt([cam.pos[0]*0.6,cam.pos[1]+0.6,cam.pos[2]*0.6],tgt);
}

/* ---------------- procedural sound (WebAudio, no files) ---------------- */
const Snd={ctx:null,on:false,rain:null,wind:null,
  init(){
    if(this.ctx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const c=this.ctx=new AC();
    const n=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=n;
    const mk=(type,f,q)=>{const s=c.createBufferSource();s.buffer=n;s.loop=true;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q||0.7;const g=c.createGain();g.gain.value=0;s.connect(fl);fl.connect(g);g.connect(c.destination);s.start();return g;};
    this.rain=mk('bandpass',3200,0.5);this.wind=mk('lowpass',420,0.5);
  },
  resume(){if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();},
  toggle(){this.on=!this.on;if(this.on){this.init();this.resume();}else if(this.rain){this.rain.gain.value=0;this.wind.gain.value=0;}return this.on;},
  tick(){if(!this.on||!this.rain)return;const t=this.ctx.currentTime;this.rain.gain.setTargetAtTime(W.rain*0.12,t,0.3);this.wind.gain.setTargetAtTime(W.wind*0.06+W.storm*0.05,t,0.3);},
  pop(c){if(!this.on||!this.ctx)return;const x=this.ctx,t0=x.currentTime;const o=x.createOscillator();o.type='sine';const f0=520+Math.min(c||1,20)*32;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f0*1.9,t0+0.07);const g=x.createGain();g.gain.setValueAtTime(0.14,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+0.13);o.connect(g);g.connect(x.destination);o.start(t0);o.stop(t0+0.15);},
  whip(){if(!this.on||!this.ctx)return;const x=this.ctx,t0=x.currentTime;const s=x.createBufferSource();s.buffer=this.noise;const f=x.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(900,t0);f.frequency.exponentialRampToValueAtTime(3600,t0+0.12);const g=x.createGain();g.gain.setValueAtTime(0.09,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+0.14);s.connect(f);f.connect(g);g.connect(x.destination);s.start(t0,Math.random(),0.2);},
  hop(big){if(!this.on||!this.ctx)return;const x=this.ctx,t0=x.currentTime;const o=x.createOscillator();o.type='sine';o.frequency.setValueAtTime(big?300:230,t0);o.frequency.exponentialRampToValueAtTime(90,t0+0.1);const g=x.createGain();g.gain.setValueAtTime(0.07,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+0.12);o.connect(g);g.connect(x.destination);o.start(t0);o.stop(t0+0.14);},
  chime(c){if(!this.on||!this.ctx)return;const x=this.ctx,t0=x.currentTime+0.06;[880,1320,1760].forEach((f,i)=>{const o=x.createOscillator();o.type='sine';o.frequency.value=f*(c>=10?1.25:1);const g=x.createGain();g.gain.setValueAtTime(0,t0+i*0.07);g.gain.linearRampToValueAtTime(0.06,t0+i*0.07+0.01);g.gain.exponentialRampToValueAtTime(0.001,t0+i*0.07+0.45);o.connect(g);g.connect(x.destination);o.start(t0+i*0.07);o.stop(t0+i*0.07+0.5);});},
  croak(n){if(!this.on||!this.ctx)return;const c=this.ctx;n=n||2;for(let k=0;k<n;k++){const t0=c.currentTime+k*0.22;
    const o=c.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(150,t0);o.frequency.exponentialRampToValueAtTime(95,t0+0.17);
    const lfo=c.createOscillator();lfo.frequency.value=38;const lg=c.createGain();lg.gain.value=0.5;
    const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.16,t0+0.03);g.gain.exponentialRampToValueAtTime(0.001,t0+0.2);
    const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=700;
    lfo.connect(lg);lg.connect(g.gain);o.connect(f);f.connect(g);g.connect(c.destination);o.start(t0);lfo.start(t0);o.stop(t0+0.22);lfo.stop(t0+0.22);}},
  splash(p){if(!this.on||!this.ctx)return;const c=this.ctx,t0=c.currentTime;const s=c.createBufferSource();s.buffer=this.noise;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(2800,t0);f.frequency.exponentialRampToValueAtTime(300,t0+0.4);
    const g=c.createGain();g.gain.setValueAtTime(0.18*Math.min(1,0.4+p),t0);g.gain.exponentialRampToValueAtTime(0.001,t0+0.45);s.connect(f);f.connect(g);g.connect(c.destination);s.start(t0,Math.random(),0.5);},
  plink(v){if(!this.on||!this.ctx)return;const c=this.ctx,t0=c.currentTime;const o=c.createOscillator();o.type='sine';o.frequency.setValueAtTime(700+Math.random()*200,t0);o.frequency.exponentialRampToValueAtTime(260,t0+0.12);
    const g=c.createGain();g.gain.setValueAtTime(0.1*(v||1),t0);g.gain.exponentialRampToValueAtTime(0.001,t0+0.16);o.connect(g);g.connect(c.destination);o.start(t0);o.stop(t0+0.18);},
  thunder(){if(!this.on||!this.ctx)return;const c=this.ctx,t0=c.currentTime+0.25;const s=c.createBufferSource();s.buffer=this.noise;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=180;
    const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.35,t0+0.08);g.gain.exponentialRampToValueAtTime(0.001,t0+2.2);s.connect(f);f.connect(g);g.connect(c.destination);s.start(t0,0,2.4);}
};
function project(p){
  const rc=canvas.getBoundingClientRect();const cv=camView(rc.width,rc.height);const m=cv.vp;
  const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];
  if(w<=0.01)return null;return[(x/w*0.5+0.5)*rc.width+rc.left,(1-(y/w*0.5+0.5))*rc.height+rc.top];
}
function handleEvents(){
  const ev=G.consumeEvents();
  const inG=document.body.dataset.mode==='game';
  for(const e of ev){
    if(e.type==='splash')Snd.splash(e.power);else if(e.type==='plop')Snd.plink(0.7);else if(e.type==='plink')Snd.plink(1);
    else if(e.type==='ribbit')Snd.croak(2);else if(e.type==='catch')Snd.croak(1);else if(e.type==='thunder')Snd.thunder();
    else if(e.type==='whip')Snd.whip();else if(e.type==='hop'){if(inG)Snd.hop(e.big);}
    else if(e.type==='catch2'){Snd.pop(e.combo);if(e.combo===5||e.combo===10||e.combo===20)Snd.chime(e.combo);}
    else if(e.type==='pop'){const s=project(e.p);if(s)popText(e.text,s[0],s[1],e.big);}
    else if(e.type==='banner')banner(e.text,e.dur);
    else if(e.type==='combo')comboMsg(e.text);
    else if(e.type==='hint')hint(e.text,e.dur);
    else if(e.type==='results')showResults(e);
  }
  Snd.tick();
  if(Snd.on&&G.frog.mood==='Happy'&&!inG&&Math.random()<0.002)Snd.croak(2);
}

/* ---------------- UI ---------------- */
const lab3=(v,a,b,c,d)=>v<0.05?a:v<0.4?b:v<0.75?c:d;
function syncUI(){
  $('tod').value=S.tod;$('wind').value=Math.round(S.wind*100);$('rain').value=Math.round(S.rain*100);$('act').value=S.activity;$('rip').value=S.ripple;$('dens').value=S.density;
  $('weather').value=S.weather;labels();
}
function labels(){
  const w=S.wind;$('vWind').textContent=w<0.08?'Off':w<0.4?'Light':w<0.7?'Medium':'Strong';
  const r=S.rain;$('vRain').textContent=r<0.05?'Off':r<0.5?'Light':'Heavy';
  $('vAct').textContent=S.activity<0.6?'Calm':S.activity<1.5?'Normal':'Playful';
  $('vRip').textContent=S.ripple.toFixed(1)+'×';$('vDens').textContent=Math.round(S.density*100)+'%';
  $('vTod').textContent=todLabel(S.tod);
}
function todLabel(h){const hh=Math.floor(h),mm=Math.floor((h-hh)*60);const ph=h<5?'Night':h<10.5?'Morning':h<16?'Afternoon':h<19.5?'Evening':'Night';return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+' · '+ph;}
$('tod').addEventListener('input',e=>{S.tod=parseFloat(e.target.value);S.auto=false;$('auto').setAttribute('aria-pressed','false');labels();});
$('auto').addEventListener('click',()=>{S.auto=!S.auto;$('auto').setAttribute('aria-pressed',S.auto?'true':'false');});
$('wind').addEventListener('input',e=>{S.wind=parseFloat(e.target.value)/100;$('weather').value='Custom';labels();});
$('rain').addEventListener('input',e=>{S.rain=parseFloat(e.target.value)/100;$('weather').value='Custom';labels();});
$('act').addEventListener('input',e=>{S.activity=parseFloat(e.target.value);labels();});
$('rip').addEventListener('input',e=>{S.ripple=parseFloat(e.target.value);labels();});
$('dens').addEventListener('input',e=>{S.density=parseFloat(e.target.value);labels();});
$('weather').addEventListener('change',e=>{if(e.target.value!=='Custom'){G.setWeather(e.target.value);syncUI();}});
$('reset').addEventListener('click',()=>{G.defaults();if(matchMedia('(max-width:720px)').matches)S.density=0.6;G.reset();resetCamera();syncUI();$('pause').textContent='Pause';$('pause').setAttribute('aria-pressed','false');});
$('pause').addEventListener('click',()=>{S.paused=!S.paused;$('pause').textContent=S.paused?'Play':'Pause';$('pause').setAttribute('aria-pressed',S.paused?'true':'false');});
$('throw').addEventListener('click',throwObj);
$('rcam').addEventListener('click',resetCamera);
$('snd').addEventListener('click',()=>{const on=Snd.toggle();$('snd').setAttribute('aria-pressed',on?'true':'false');$('snd').textContent=on?'Sound on':'Sound';});
$('statsBtn').addEventListener('click',()=>{const b=$('stats');const show=b.style.display!=='block';b.style.display=show?'block':'none';$('statsBtn').setAttribute('aria-pressed',show?'true':'false');});
$('toggle').addEventListener('click',()=>{const pn=$('panel');pn.classList.toggle('closed');$('toggle').setAttribute('aria-expanded',!pn.classList.contains('closed'));});
if(matchMedia('(max-width:720px)').matches){$('panel').classList.add('closed');$('toggle').setAttribute('aria-expanded','false');S.density=0.6;}
let lastStats=0,fpsAcc=0,fpsN=0,fpsVal=60,ftVal=16;
function updateStats(){
  fpsVal=fpsN/Math.max(fpsAcc,1e-3);ftVal=1000*fpsAcc/Math.max(fpsN,1);fpsAcc=0;fpsN=0;
  $('fps').textContent=Math.round(fpsVal)+' fps';
  if(S.auto)$('tod').value=S.tod;$('vTod').textContent=todLabel(S.tod);
  if($('stats').style.display==='block'){
    const s=G.stats();
    $('stFrame').textContent=ftVal.toFixed(1)+' ms (GPU timing n/a)';$('stObj').textContent=s.objects;$('stPart').textContent=s.particles;$('stFrog').textContent=s.frog.state+' · '+s.frog.mood+' · '+s.frog.surf;
    $('stWx').textContent=s.weather+' · wind '+s.wind+'%';$('stTime').textContent=todLabel(s.time);$('stRip').textContent=s.ripples;$('stScale').textContent=Math.round(scale*100)+'%';
  }
}
syncUI();
/* ---------------- HUNGRY FROG UI ---------------- */
const body=document.body;
function setMode(m){body.dataset.mode=m;}
function show(id,on){$(id).style.display=on?'flex':'none';if(id==='menu'&&on&&typeof syncOpts==='function')syncOpts();}
function banner(text,dur){const b=$('banner');b.textContent=text;b.classList.remove('on');void b.offsetWidth;b.style.setProperty('--d',(dur||1)+'s');b.classList.add('on');}
function comboMsg(text){const b=$('comboMsg');b.textContent=text;b.classList.remove('on');void b.offsetWidth;b.classList.add('on');}
let hintT=0;function hint(text,dur){const h=$('hint');h.textContent=text;h.classList.add('on');clearTimeout(hintT);hintT=setTimeout(()=>h.classList.remove('on'),(dur||3)*1000);}
function popText(text,x,y,big){const d=document.createElement('div');d.className='pop'+(big?' big':'');d.textContent=text;d.style.left=x+'px';d.style.top=y+'px';$('pops').appendChild(d);d.addEventListener('animationend',()=>d.remove());}
function startGame(next){
  setMode('game');show('menu',false);show('over',false);show('pauseOv',false);
  if(!Snd.on&&!Snd.userOff){Snd.toggle();$('snd').setAttribute('aria-pressed','true');$('snd').textContent='Sound on';}
  $('hSnd').setAttribute('aria-pressed',Snd.on?'true':'false');
  G.gameStart(next);enterGameCam();hint('Camera:  Q / E turn  •  R / F tilt  •  or right-drag',3.3);
}
function toPond(){G.gameLeave();setMode('pond');show('menu',false);show('over',false);show('pauseOv',false);resetCamera();$('hint').classList.remove('on');}
function togglePause(){
  const st=G.Game.state;if(st!=='play'&&st!=='ready')return;
  S.paused=!S.paused;show('pauseOv',S.paused);
}
function showResults(e){
  $('rScore').textContent=e.score;$('rBest').textContent=e.best;$('rCombo').textContent=e.bestCombo+'×';$('rNew').style.display=e.newBest&&e.score>0?'block':'none';
  show('over',true);
}
const BEE_TXT=['Off','Few','Normal','Many'];
function syncOpts(){const o=G.Game.opts;
  $('oTime').value=o.time;$('oSpeed').value=o.speed;$('oMax').value=o.max;$('oBees').value=o.bees;
  $('vTime').textContent=o.time+'s';$('vSpeed').textContent='×'+o.speed.toFixed(1);$('vMax').textContent='×'+o.max.toFixed(1);$('vBees').textContent=BEE_TXT[o.bees];
  $('hBest').textContent=String(G.Game.best).padStart(4,'0');}
function readOpts(){G.setOptions({time:$('oTime').value,speed:$('oSpeed').value,max:$('oMax').value,bees:$('oBees').value});syncOpts();}
['oTime','oSpeed','oMax','oBees'].forEach(id=>$(id).addEventListener('input',readOpts));
$('oReset').addEventListener('click',()=>{G.setOptions(G.DEF_OPTS);syncOpts();});
syncOpts();
$('playBtn').addEventListener('click',()=>startGame(false));
$('againBtn').addEventListener('click',()=>startGame(true));
$('watchBtn').addEventListener('click',toPond);
$('menuWatch').addEventListener('click',toPond);
$('hPause').addEventListener('click',togglePause);
$('resumeBtn').addEventListener('click',togglePause);
$('restartBtn').addEventListener('click',()=>{S.paused=false;startGame('same');});
$('quitBtn').addEventListener('click',()=>{S.paused=false;toPond();});
$('modeBtn').addEventListener('click',()=>startGame(false));
$('hSnd').addEventListener('click',()=>{const on=Snd.toggle();Snd.userOff=!on;$('hSnd').setAttribute('aria-pressed',on?'true':'false');$('snd').setAttribute('aria-pressed',on?'true':'false');$('snd').textContent=on?'Sound on':'Sound';});
let hc={},keyEls=null;
function hudTick(){
  if(body.dataset.mode!=='game')return;
  const s=G.gameSnap();
  const set=(id,v)=>{if(hc[id]!==v){hc[id]=v;$(id).textContent=v;}};
  set('hScore',String(s.score).padStart(4,'0'));set('hTime',s.time);set('hBest',String(Math.max(s.best,s.score)).padStart(4,'0'));
  set('hCombo',s.combo>0?'COMBO × '+s.combo:'COMBO × 0');
  $('comboBar').firstElementChild.style.transform='scaleX('+s.comboFrac.toFixed(3)+')';
  $('hud').classList.toggle('hot',s.combo>=5);
  if(!keyEls)keyEls=[...document.querySelectorAll('.keys kbd[data-k]')];
  for(const el of keyEls){const k=el.dataset.k,alias={w:'arrowup',a:'arrowleft',s:'arrowdown',d:'arrowright'}[k];el.classList.toggle('down',!!(keys.has(k)||(alias&&keys.has(alias))));}
  $('hTimeBox').classList.toggle('low',s.time<=10&&s.state==='play');
}
document.querySelectorAll('.camctl button').forEach(b=>{const k=b.dataset.k;
  const on=e=>{e.preventDefault();keys.add(k);b.classList.add('down');};const off=()=>{keys.delete(k);b.classList.remove('down');};
  b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);b.addEventListener('pointercancel',off);});
setMode('menu');

/* ---------------- frame ---------------- */
let scale=(matchMedia('(max-width:720px)').matches?0.8:1.0),ema=16,fcount=0,lastT=performance.now();
const envData=G.ENV;
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(8,Math.floor(canvas.clientWidth*dpr*scale)),h=Math.max(8,Math.floor(canvas.clientHeight*dpr*scale));
  if(w!==rw||h!==rh){rw=w;rh=h;canvas.width=w;canvas.height=h;makeTargets(w,h);}
}
function viewData(vp,eye,clip,r,u,f,tx,ty){
  const a=new Float32Array(48);a.set(vp,0);a[16]=eye[0];a[17]=eye[1];a[18]=eye[2];a[19]=G.W.t;a[20]=clip[0];a[21]=clip[1];
  a[24]=r[0];a[25]=r[1];a[26]=r[2];a[27]=tx;a[28]=u[0];a[29]=u[1];a[30]=u[2];a[31]=ty;a[32]=f[0];a[33]=f[1];a[34]=f[2];a[35]=0;return a;
}
function drawScene(pass,kind,bgView){
  pass.setBindGroup(0,bgView);pass.setBindGroup(1,fieldBG[parity]);
  const pk=(n)=>P[n][kind];
  if(kind!=='shadow'){
    if(P.sky[kind]){pass.setPipeline(pk('sky'));pass.draw(3);}
    pass.setPipeline(pk('terrain'));pass.setVertexBuffer(0,terrain.vb);pass.setIndexBuffer(terrain.ib,'uint32');pass.drawIndexed(terrain.n);
  }
  if(G.cnt.blob>0){pass.setPipeline(pk('blob'));pass.setVertexBuffer(0,sphere.vb);pass.setVertexBuffer(1,blobB);pass.setIndexBuffer(sphere.ib,'uint16');pass.drawIndexed(sphere.n,G.cnt.blob);}
  if(G.cnt.ti>0){pass.setPipeline(pk('tube'));pass.setVertexBuffer(0,tubeVB);pass.setIndexBuffer(tubeIB,'uint32');pass.drawIndexed(G.cnt.ti);}
  pass.setPipeline(pk('fol'));pass.setVertexBuffer(0,folMesh.vb);pass.setIndexBuffer(folMesh.ib,'uint16');
  if(G.cnt.leaf>0){pass.setVertexBuffer(1,leafB);pass.drawIndexed(folMesh.n,G.cnt.leaf);}
  if(G.cnt.petal>0){pass.setVertexBuffer(1,petB);pass.drawIndexed(folMesh.n,G.cnt.petal);}
  if(G.cnt.pad>0&&kind!=='shadow'){pass.setVertexBuffer(0,padMesh.vb);pass.setIndexBuffer(padMesh.ib,'uint16');pass.setVertexBuffer(1,padB);pass.drawIndexed(padMesh.n,G.cnt.pad);}
}
function frame(now){
  let dt=(now-lastT)/1000;lastT=now;dt=Math.min(Math.max(dt,0.001),0.05);
  ema+=(dt*1000-ema)*0.05;
  if(++fcount%40===0){if(ema>24&&scale>0.65)scale=Math.max(0.65,scale*0.92);else if(ema<14&&scale<1)scale=Math.min(1,scale*1.04);}
  resize();
  if(gameOn())applyKeyInput();else G.Game.input={dx:0,dz:0,sprint:false};
  updateCamera(dt);
  W.camPos=cam.pos;
  fpsAcc+=dt;fpsN++;
  W.grassDensity=scale<0.55?0.6:1;
  G.update(dt);
  handleEvents();hudTick();
  G.emitAll();
  G.fillEnv();
  const cv=camView(rw,rh);
  // views
  const mirror=[1,0,0,0,0,-1,0,0,0,0,1,0,0,0,0,1];
  const vpR=mmul(cv.vp,mirror);
  const eyeR=[cv.eye[0],-cv.eye[1],cv.eye[2]];
  const mR=v=>[v[0],-v[1],v[2]];
  device.queue.writeBuffer(viewBuf[0],0,viewData(cv.vp,cv.eye,[0,0],cv.r,cv.u,cv.f,cv.tanX,cv.tanY));
  device.queue.writeBuffer(viewBuf[1],0,viewData(vpR,eyeR,[1,0],mR(cv.r),mR(cv.u),mR(cv.f),cv.tanX,cv.tanY));
  device.queue.writeBuffer(viewBuf[2],0,viewData(envData.subarray(0,16),[0,0,0],[0,0],[1,0,0],[0,1,0],[0,0,1],1,1));
  device.queue.writeBuffer(envBuf,0,envData);
  // dynamic geometry
  device.queue.writeBuffer(tubeVB,0,G.TVB,0,Math.max(G.cnt.tv*9,1));
  device.queue.writeBuffer(tubeIB,0,G.TIB,0,Math.max(G.cnt.ti,1));
  device.queue.writeBuffer(leafB,0,G.LF,0,Math.max(G.cnt.leaf*24,1));
  device.queue.writeBuffer(petB,0,G.PTL,0,Math.max(G.cnt.petal*24,1));
  device.queue.writeBuffer(padB,0,G.PDL,0,Math.max(G.cnt.pad*24,1));
  device.queue.writeBuffer(blobB,0,G.BLB,0,Math.max(G.cnt.blob*16,1));
  device.queue.writeBuffer(bbB,0,G.BBB,0,Math.max(G.cnt.bb*8,1));
  for(let k=0;k<6;k++)device.queue.writeBuffer(creB[k],0,G.creatureBuf[k],0,Math.max(G.creatureCnt[k]*20,1));
  // post uniform
  const dYaw=(cam.dyaw-cam.yaw),dPitch=(cam.dpitch-cam.pitch);
  const mbx=0,mby=0;
  const pd=new Float32Array(12);
  pd[0]=cam.dist*0.96;pd[1]=1.3*rh/1080;pd[2]=W.exposure;pd[4]=mbx;pd[5]=mby;pd[6]=W.flash;pd[7]=fcount;
  device.queue.writeBuffer(postBuf,0,pd);

  const enc=device.createCommandEncoder();
  if(!S.paused){
    const cp=enc.beginComputePass();
    cp.setPipeline(cpBend);cp.setBindGroup(0,cbBend[parity]);cp.dispatchWorkgroups(12,12);
    cp.setPipeline(cpWater);cp.setBindGroup(0,cbWater[parity]);cp.dispatchWorkgroups(16,16);
    cp.end();
    parity=1-parity;
  }
  // shadow
  {
    const p=enc.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:shadowTex.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
    drawScene(p,'shadow',bgShadow);p.end();
  }
  // reflection
  {
    const p=enc.beginRenderPass({colorAttachments:[{view:reflTex.createView(),clearValue:{r:0.3,g:0.4,b:0.5,a:1},loadOp:'clear',storeOp:'store'}],
      depthStencilAttachment:{view:reflDepth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
    drawScene(p,'refl',bgRefl);p.end();
  }
  // main
  {
    const p=enc.beginRenderPass({colorAttachments:[{view:msaaTex.createView(),resolveTarget:hdrTex.createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'discard'}],
      depthStencilAttachment:{view:depthTex.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
    drawScene(p,'main',bgMain);
    // grass
    p.setPipeline(P.grass.main);p.setBindGroup(0,bgMain);p.setBindGroup(1,fieldBG[parity]);p.setIndexBuffer(grassIdx,'uint16');
    const B=Math.max(1,Math.round(8*(W.grassDensity||1)));if(!(globalThis.__skip&&globalThis.__skip.has('grass')))p.drawIndexed(30,128*128*B);
    // creatures
    p.setPipeline(P.cre.main);
    for(let k=0;k<6;k++){if(G.creatureCnt[k]>0){p.setVertexBuffer(0,creMesh[k].vb);p.setVertexBuffer(1,creB[k]);p.setIndexBuffer(creMesh[k].ib,'uint16');p.drawIndexed(creMesh[k].n,G.creatureCnt[k]);}}
    // water
    p.setPipeline(P.water.main);p.setVertexBuffer(0,waterMesh.vb);p.setIndexBuffer(waterMesh.ib,'uint32');p.drawIndexed(waterMesh.n);
    // weather
    if(W.rain>0.03){
      p.setPipeline(P.rain.main);p.draw(6,Math.floor(14000*Math.min(1,W.rain)));
      p.setPipeline(P.splash.main);p.draw(6,Math.floor(2600*Math.min(1,W.rain)));
    }
    if(G.cnt.bb>0){p.setPipeline(P.bb.main);p.setVertexBuffer(0,bbB);p.draw(6,G.cnt.bb);}
    p.end();
  }
  // post
  {
    const p=enc.beginRenderPass({colorAttachments:[{view:ctx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
    p.setPipeline(postPipe);p.setBindGroup(0,bgPost);p.draw(3);p.end();
  }
  device.queue.submit([enc.finish()]);
  if(now-lastStats>250){lastStats=now;updateStats();}
  requestAnimationFrame(frame);
}
updateStats();
requestAnimationFrame(frame);
})();