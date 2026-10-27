// Rotating shallow-water / NS / QG finite-volume and Arakawa kernels on a periodic [0,2π]² grid. All variables are nondimensional.
export const TAU=2*Math.PI;
function fft(a,b,inverse=false){
  const n=a.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[a[i],a[j]]=[a[j],a[i]];[b[i],b[j]]=[b[j],b[i]];}}
  for(let len=2;len<=n;len*=2){const angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
    for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2,vr=a[l]*ur-b[l]*ui,vi=a[l]*ui+b[l]*ur;a[l]=a[k]-vr;b[l]=b[k]-vi;a[k]+=vr;b[k]+=vi;const t=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=t;}}
  }
  if(inverse)for(let i=0;i<n;i++){a[i]/=n;b[i]/=n;}
}
export function transform2(real,imag,n,inverse=false){
  const a=new Float64Array(n),b=new Float64Array(n);
  for(let y=0;y<n;y++){for(let x=0;x<n;x++){a[x]=real[y*n+x];b[x]=imag[y*n+x];}fft(a,b,inverse);for(let x=0;x<n;x++){real[y*n+x]=a[x];imag[y*n+x]=b[x];}}
  for(let x=0;x<n;x++){for(let y=0;y<n;y++){a[y]=real[y*n+x];b[y]=imag[y*n+x];}fft(a,b,inverse);for(let y=0;y<n;y++){real[y*n+x]=a[y];imag[y*n+x]=b[y];}}
}
export class OceanSolver{
  constructor(options={}){
    this.p={model:'ns',n:64,nu:.002,drag:0,forcing:0,beta:1,ld:1,f:2,c:1,amp:.18,initial:'vortices',...options};
    const p=this.p;if(!['ns','qg','swe'].includes(p.model)||![32,64,128].includes(p.n))throw Error('지원하지 않는 모델 또는 격자');
    this.n=p.n;this.size=p.n*p.n;this.dx=TAU/p.n;this.t=0;this.steps=0;this.lastDt=0;this.swe=p.model==='swe';
    this.a=Array.from({length:this.swe?3:1},()=>new Float64Array(this.size));
    this.psi=new Float64Array(this.size);this.u=new Float64Array(this.size);this.v=new Float64Array(this.size);this.zeta=new Float64Array(this.size);
    this.initialize();this.refresh();this.initialMetrics=this.metrics();
  }
  idx(x,y){return ((y+this.n)%this.n)*this.n+(x+this.n)%this.n;}
  initialize(){
    const {n,dx,p}=this;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const X=(x+.5)*dx,Y=(y+.5)*dx,k=y*n+x;
      const periodic=(d)=>Math.atan2(Math.sin(d),Math.cos(d));
      const gauss=(cx,cy,s)=>Math.exp(-(periodic(X-cx)**2+periodic(Y-cy)**2)/(2*s*s));
      let shape=p.initial==='jet'?Math.cos(2*Y)+.15*Math.cos(3*X)*Math.cos(Y):p.initial==='wave'?Math.cos(X)*Math.cos(Y):gauss(2.3,Math.PI,.45)+gauss(4,Math.PI,.45)-.12;
      if(this.swe){this.a[0][k]=1+p.amp*shape;}
      else this.psi[k]=p.amp*shape;
    }
    if(!this.swe){const a=p.model==='qg'?1/p.ld**2:0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x;this.a[0][k]=this.lap(this.psi,x,y)-a*this.psi[k];}let mean=this.a[0].reduce((a,b)=>a+b,0)/this.size;for(let k=0;k<this.size;k++)this.a[0][k]-=mean;}
    else if(p.initial==='jet'){
      // Initial geostrophic balance for h=1+A cos(2y)+ perturbation.
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x,Y=(y+.5)*dx;this.a[1][k]=this.a[0][k]*(p.f?2*p.c**2*p.amp*Math.sin(2*Y)/p.f:0);}
    }
  }
  lap(a,x,y){return (a[this.idx(x+1,y)]+a[this.idx(x-1,y)]+a[this.idx(x,y+1)]+a[this.idx(x,y-1)]-4*a[this.idx(x,y)])/this.dx**2;}
  invert(q){
    const re=new Float64Array(q),im=new Float64Array(this.size),n=this.n,alpha=this.p.model==='qg'?1/this.p.ld**2:0;
    transform2(re,im,n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x,eigen=-4*(Math.sin(Math.PI*x/n)**2+Math.sin(Math.PI*y/n)**2)/this.dx**2-alpha;if(Math.abs(eigen)<1e-14){re[k]=im[k]=0;}else{re[k]/=eigen;im[k]/=eigen;}}
    transform2(re,im,n,true);return re;
  }
  // Arakawa's three-form Jacobian on the periodic central-difference grid.
  jacobian(a,b,x,y){
    const e=this.idx(x+1,y),w=this.idx(x-1,y),nn=this.idx(x,y+1),s=this.idx(x,y-1),ne=this.idx(x+1,y+1),nw=this.idx(x-1,y+1),se=this.idx(x+1,y-1),sw=this.idx(x-1,y-1);
    const j1=(a[e]-a[w])*(b[nn]-b[s])-(a[nn]-a[s])*(b[e]-b[w]);
    const j2=a[e]*(b[ne]-b[se])-a[w]*(b[nw]-b[sw])-a[nn]*(b[ne]-b[nw])+a[s]*(b[se]-b[sw]);
    const j3=b[nn]*(a[ne]-a[nw])-b[s]*(a[se]-a[sw])-b[e]*(a[ne]-a[se])+b[w]*(a[nw]-a[sw]);
    return (j1+j2+j3)/(12*this.dx**2);
  }
  rhs(a){
    const n=this.n,p=this.p,out=a.map(()=>new Float64Array(this.size));
    if(!this.swe){const q=a[0],psi=this.invert(q);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x,v=(psi[this.idx(x+1,y)]-psi[this.idx(x-1,y)])/(2*this.dx);out[0][k]=-this.jacobian(psi,q,x,y)-(p.model==='qg'?p.beta*v:0)+p.nu*this.lap(q,x,y)-p.drag*q[k]+p.forcing*Math.sin(4*(y+.5)*this.dx);}return out;}
    const [h,mx,my]=a,g=p.c**2;
    const flux=(l,r,axis)=>{
      const hl=h[l],hr=h[r];if(hl<=0||hr<=0)throw Error('음의 수심: 계산을 중단했습니다. 진폭·시간 간격을 확인하세요.');
      const ul=mx[l]/hl,vl=my[l]/hl,ur=mx[r]/hr,vr=my[r]/hr;
      const sl=axis===0?ul:vl,sr=axis===0?ur:vr,speed=Math.max(Math.abs(sl)+Math.sqrt(g*hl),Math.abs(sr)+Math.sqrt(g*hr));
      return [.5*(hl*sl+hr*sr-speed*(hr-hl)),.5*(mx[l]*sl+mx[r]*sr+(axis===0?.5*g*(hl*hl+hr*hr):0)-speed*(mx[r]-mx[l])),.5*(my[l]*sl+my[r]*sr+(axis===1?.5*g*(hl*hl+hr*hr):0)-speed*(my[r]-my[l]))];
    };
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const k=y*n+x;
      for(const [neighbor,axis] of [[this.idx(x+1,y),0],[this.idx(x,y+1),1]]){
        const f=flux(k,neighbor,axis);for(let d=0;d<3;d++){out[d][k]-=f[d]/this.dx;out[d][neighbor]+=f[d]/this.dx;}
      }
      out[1][k]+=p.f*my[k]-p.drag*mx[k]+p.nu*this.lap(mx,x,y)+h[k]*p.forcing*Math.sin(4*(y+.5)*this.dx);
      out[2][k]+=-p.f*mx[k]-p.drag*my[k]+p.nu*this.lap(my,x,y);
    }return out;
  }
  refresh(){
    const n=this.n,dx=this.dx;
    if(this.swe){for(let k=0;k<this.size;k++){this.u[k]=this.a[1][k]/this.a[0][k];this.v[k]=this.a[2][k]/this.a[0][k];}}
    else{this.psi=this.invert(this.a[0]);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x;this.u[k]=-(this.psi[this.idx(x,y+1)]-this.psi[this.idx(x,y-1)])/(2*dx);this.v[k]=(this.psi[this.idx(x+1,y)]-this.psi[this.idx(x-1,y)])/(2*dx);}}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)this.zeta[y*n+x]=this.swe?(this.v[this.idx(x+1,y)]-this.v[this.idx(x-1,y)]-this.u[this.idx(x,y+1)]+this.u[this.idx(x,y-1)])/(2*dx):this.lap(this.psi,x,y);
  }
  timestep(){
    let speed=0;
    for(let k=0;k<this.size;k++){const c=this.swe?this.p.c*Math.sqrt(this.a[0][k]):0;speed=Math.max(speed,Math.abs(this.u[k])+Math.abs(this.v[k])+2*c);}
    const adv=.3*this.dx/Math.max(speed,.05),visc=this.p.nu>0?.18*this.dx**2/this.p.nu:1;
    const frequency=this.swe?Math.abs(this.p.f):(this.p.model==='qg'?this.p.beta*this.p.ld:0);
    return Math.min(.025,adv,visc,frequency>0?.15/frequency:1);
  }
  step(){
    this.refresh();const dt=this.timestep(),old=this.a;
    const f0=this.rhs(old),a1=old.map((v,j)=>Float64Array.from(v,(v,k)=>v+dt*f0[j][k]));
    const f1=this.rhs(a1),a2=old.map((v,j)=>Float64Array.from(v,(v,k)=>.75*v+.25*(a1[j][k]+dt*f1[j][k])));
    const f2=this.rhs(a2),next=old.map((v,j)=>Float64Array.from(v,(v,k)=>v/3+2/3*(a2[j][k]+dt*f2[j][k])));
    for(const a of next)for(const value of a)if(!Number.isFinite(value)||Math.abs(value)>1e7)throw Error('수치 불안정을 감지해 중단했습니다. 설정을 낮추고 초기화하세요.');
    if(this.swe&&next[0].some(h=>h<=.01))throw Error('수심이 양수 조건을 벗어나 중단했습니다.');
    this.a=next;this.t+=dt;this.lastDt=dt;this.steps++;this.refresh();return dt;
  }
  metrics(){
    let energy=0,enstrophy=0,mass=0,maxSpeed=0;const n=this.n,dx=this.dx,p=this.p;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x,speed2=this.u[k]**2+this.v[k]**2;maxSpeed=Math.max(maxSpeed,Math.sqrt(speed2));
      if(this.swe){const h=this.a[0][k];mass+=h;energy+=.5*h*speed2+.5*p.c**2*(h-1)**2;enstrophy+=.5*(this.zeta[k]+p.f)**2/h;}
      else{const e=(this.psi[this.idx(x+1,y)]-this.psi[k])/dx,nn=(this.psi[this.idx(x,y+1)]-this.psi[k])/dx;energy+=.5*(e*e+nn*nn+(p.model==='qg'?this.psi[k]**2/p.ld**2:0));enstrophy+=.5*this.a[0][k]**2;}
    }
    return {t:this.t,energy:energy/this.size,enstrophy:enstrophy/this.size,mass:this.swe?mass/this.size:0,maxSpeed,dt:this.lastDt,steps:this.steps};
  }
  field(name){if(name==='speed')return Float64Array.from(this.u,(u,k)=>Math.hypot(u,this.v[k]));if(name==='vorticity')return this.zeta;if(name==='height')return this.swe?Float64Array.from(this.a[0],h=>h-1):this.psi;return this.swe?Float64Array.from(this.a[0],(h,k)=>(this.zeta[k]+this.p.f)/h):this.a[0];}
}
