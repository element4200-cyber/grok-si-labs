export function allCreationsEntries(cloud=[],local=[]){
 const entries=new Map();
 for(const b of cloud)if(!b.starter&&(b.published||b.owned))entries.set(b.id,b);
 for(const b of local)if(!b.starter&&b.owned!==false&&!entries.has(b.id))entries.set(b.id,b);
 return [...entries.values()].sort((a,b)=>Number(b.created||0)-Number(a.created||0));
}
export function publicCreationsEntries(cloud=[]){return allCreationsEntries(cloud.filter(b=>b.published),[]);}
