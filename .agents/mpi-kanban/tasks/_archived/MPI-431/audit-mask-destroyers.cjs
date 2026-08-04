const fs=require('fs'),path=require('path');
const dir='comfy_workflows';
// only the params that actually RESHAPE the user's mask
const DESTROY={
  InpaintCropImproved:['mask_fill_holes','mask_expand_pixels'],
  MaskDetailerPipe:['contour_fill','bbox_fill','drop_size'],
  GrowMaskWithBlur:['fill_holes','expand'],
};
const rows=[];
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort()){
  let g;try{g=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch(e){continue;}
  if(typeof g!=='object')continue;
  const maskIds=Object.entries(g).filter(([,n])=>n&&n._meta&&/^Input_Mask/i.test(n._meta.title||'')).map(([id])=>id);
  if(!maskIds.length)continue;
  const q=[...maskIds],seen=new Set(maskIds);
  while(q.length){const cur=q.shift();
    for(const [id,n] of Object.entries(g)){ if(!n||!n.inputs)continue;
      for(const v of Object.values(n.inputs)) if(Array.isArray(v)&&String(v[0])===String(cur)&&!seen.has(id)){seen.add(id);q.push(id);} } }
  for(const id of seen){
    const n=g[id]; if(!n||!DESTROY[n.class_type])continue;
    const vals=DESTROY[n.class_type].map(k=>k+'='+JSON.stringify(n.inputs[k]));
    const bad=DESTROY[n.class_type].some(k=>n.inputs[k]===true);
    rows.push([f,'#'+id,n.class_type,vals.join(' '),bad?'DESTROYS':'ok']);
  }
}
const w=[0,1,2,3,4].map(i=>Math.max(...rows.map(r=>r[i].length)));
for(const r of rows) console.log(r.map((c,i)=>c.padEnd(w[i])).join('  '));
console.log('\ntotal nodes: '+rows.length+'   destroying: '+rows.filter(r=>r[4]==='DESTROYS').length);
