import json,sys
def walk(a,b,p,out):
    if len(out)>40: return
    if type(a)!=type(b): out.append(f"{p}: {json.dumps(a)[:150]}  !=  {json.dumps(b)[:150]}"); return
    if isinstance(a,dict):
        if a.get('t')!=b.get('t'): out.append(f"{p}: tag {a.get('t')} != {b.get('t')}"); return
        aa,ba=a.get('a',{}),b.get('a',{})
        for k in sorted(set(aa)|set(ba)):
            if aa.get(k)!=ba.get(k): out.append(f"{p}<{a.get('t')}>@{k}: {aa.get(k)!r} != {ba.get(k)!r}")
        ka,kb=a.get('k',[]),b.get('k',[])
        if len(ka)!=len(kb):
            out.append(f"{p}<{a.get('t')} {aa.get('class','')} {aa.get('id','')}>: {len(ka)} enfants != {len(kb)} : "+json.dumps([x if isinstance(x,str) else x.get('t')+'.'+x.get('a',{}).get('class','') for x in ka])[:300]+" VS "+json.dumps([x if isinstance(x,str) else x.get('t')+'.'+x.get('a',{}).get('class','') for x in kb])[:300])
        for i,(x,y) in enumerate(zip(ka,kb)): walk(x,y,f"{p}/{a.get('t')}[{i}]",out)
    elif a!=b: out.append(f"{p}: {a!r} != {b!r}")
    for k in ['app','notice','html'] if p=='' else []: pass
name=sys.argv[1]
A=json.load(open(f'/tmp/parite-ui/{name}-old.json'));B=json.load(open(f'/tmp/parite-ui/{name}-new.json'))
out=[]
for k in A: walk(A[k],B[k],k,out)
print("\n".join(out[:int(sys.argv[2]) if len(sys.argv)>2 else 25]))
