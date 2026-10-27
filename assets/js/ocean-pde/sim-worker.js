import {OceanSolver} from './solver.js';
let solver;
self.onmessage=({data})=>{
  try{
    if(data.type==='init')solver=new OceanSolver(data.options);
    if(!solver)return;
    if(data.type==='advance')for(let i=0;i<Math.min(12,data.steps||1);i++)solver.step();
    const field=solver.field(data.field||'vorticity');
    const values=new Float64Array(field),u=new Float64Array(solver.u),v=new Float64Array(solver.v);
    self.postMessage({type:'frame',field:data.field||'vorticity',generation:data.generation,metrics:solver.metrics(),n:solver.n,values,u,v},[values.buffer,u.buffer,v.buffer]);
  }catch(error){self.postMessage({type:'error',generation:data.generation,message:error.message});}
};
