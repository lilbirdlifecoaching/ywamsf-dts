"""Builds the painted skyline layers behind the home-page cable car.

Inputs (this folder): painting-car55.png (the creative director's painting), car55-cutout.png
(car #55 cut out of it with rembg), painting-sf-panorama.png (her SF panorama, used for building
detail and the Transamerica), skyline-silhouette.webp (the original grey skyline, used for shape).
Outputs: src/assets/cablecar/city-ta.webp, city-right.webp, city-mid.webp (mist fades to grey #EAEDF0, for YWAM 5).
For YWAM 6's white page run with BG=255,255,255 SUF=-w to write city-right-w.webp and city-mid-w.webp.

Run from anywhere:  python3 design-src/cablecar/build_skyline.py   (needs numpy, opencv-python, pillow)
Intermediate pL/pR/pM/pT.png files are written to the current folder.
"""
import os
HERE=os.path.dirname(os.path.abspath(__file__))
BGC=[int(x) for x in os.environ.get('BG','234,237,240').split(',')]
SUF=os.environ.get('SUF','')
from PIL import Image
import numpy as np, cv2
rng=np.random.default_rng(7)
src=np.array(Image.open(os.path.join(HERE,'painting-car55.png')).convert('RGB')).astype(np.float32)
car=np.array(Image.open(os.path.join(HERE,'car55-cutout.png')))[:,:,3].astype(np.float32)/255
H0=650
notcar=1-cv2.dilate((car>0.15).astype(np.uint8),np.ones((13,13),np.uint8)).astype(np.float32)
notcar=cv2.GaussianBlur(notcar,(0,0),9); notcar=np.clip(notcar*1.7-0.35,0,1)
def piece(x0,x1,y0,y1,fadeL=0,fadeR=0,fadeB=80):
    rgb=src[y0:y1,x0:x1].copy(); a=notcar[y0:y1,x0:x1].copy()
    w=x1-x0; h=y1-y0
    xs=np.arange(w)[None,:].astype(np.float32); ys=np.arange(h)[:,None].astype(np.float32)
    if fadeL: a*=np.clip(xs/fadeL,0,1)
    if fadeR: a*=np.clip((w-1-xs)/fadeR,0,1)
    a*=np.clip((h-1-ys)/fadeB,0,1)
    dev=np.abs(rgb-np.array([245,239,230],np.float32)).max(axis=2)
    low=(dev<16).astype(np.uint8)
    n_,lab=cv2.connectedComponents(low)
    top=set(np.unique(lab[0][low[0]>0]))
    sky=np.isin(lab,list(top)).astype(np.float32)
    sky=cv2.GaussianBlur(cv2.erode(sky,np.ones((3,3),np.uint8)),(0,0),2)
    a=a*(1-sky)
    return np.dstack([rgb,a*255])
# all layers H0 tall, bottom aligned at source row 650 (left) ; right piece shift up 40 so its horizon matches
L=piece(0,470,0,650,fadeR=150)
def over(top,bot):
    at=top[:,:,3:]/255; ab=bot[:,:,3:]/255
    ao=at+ab*(1-at)
    rgb=(top[:,:,:3]*at+bot[:,:,:3]*ab*(1-at))/np.maximum(ao,1e-4)
    return np.dstack([rgb,ao*255])
def shift(arr,dy,dx,k=1.0):
    out=np.zeros_like(arr); h,w=arr.shape[:2]
    src_=np.roll(arr,(dy,dx),axis=(0,1))
    out[:]=src_
    if dy>0: out[:dy]=0
    if dy<0: out[dy:]=0
    if dx>0: out[:,:dx]=0
    if dx<0: out[:,dx:]=0
    out[:,:,3]*=k; return out
top=L.copy(); top[300:,65:]=0; top[:,205:285]=0
R=piece(1500,1774,40,690,fadeL=120,fadeB=90)
R[:,:,3]*=np.clip((np.arange(650)[:,None]-262)/14,0,1)
R[:,:,3]*=np.clip((273-np.arange(274)[None,:])/22,0,1)
dv=np.abs(R[:,:,:3]-np.array([245,239,230],np.float32)).max(axis=2)
ck=np.clip((dv-8)/22,0,1); ck[470:]=1
R[:,:,3]*=cv2.GaussianBlur(ck,(0,0),1.5)
# ---- mid tile from old skyline silhouette, restyled
sk=np.array(Image.open(os.path.join(HERE,'skyline-silhouette.webp')).convert('RGBA')).astype(np.float32)
segs=[(1100,2048,1,.86),(160,545,0,.95),(665,880,1,.8),(665,2048,0,1.0),(160,545,1,.9),(1100,2048,0,.82),(665,880,0,.9),(160,545,0,.84),(1100,2048,1,.92)]
parts=[]
for x0,x1,fl,sc in segs:
    p=sk[:,x0:x1].copy()
    if fl: p=p[:,::-1]
    hh=int(480*sc); p=cv2.resize(p,(p.shape[1],hh),interpolation=cv2.INTER_AREA)
    p=np.concatenate([np.zeros((480-hh,p.shape[1],4),np.float32),p],axis=0)
    parts.append(p)
ov=240; out=parts[0]
def tops(arr):
    m=arr[:,:,3]>110
    return np.where(m.any(0),np.argmax(m,axis=0),arr.shape[0])
for p in parts[1:]:
    ov=min(240,p.shape[1]-40)
    a1=out[:,-ov:]; b1=p[:,:ov]
    score=np.minimum(tops(a1),tops(b1))  # higher row index = lower roofline
    k=int(np.argmax(score[20:-20]))+20
    wgt=np.clip((np.arange(ov)-k+4)/8,0,1)[None,:,None]
    blend=a1*(1-wgt)+b1*wgt
    out=np.concatenate([out[:,:-ov],blend,p[:,ov:]],axis=1)
sk=out
s=500/sk.shape[0]
sk=cv2.resize(sk,(int(sk.shape[1]*s),500),interpolation=cv2.INTER_AREA)
a=np.clip(sk[:,:,3]/255*2.4,0,1); a*=np.clip((499-np.arange(500)[:,None])/170,0,1)**0.8; lum=sk[:,:,:3].mean(axis=2)/255
h,w=a.shape
def noise(sc):
    n=rng.random((h//sc+2,w//sc+2)).astype(np.float32)
    return cv2.resize(n,(w,h),interpolation=cv2.INTER_CUBIC)[:h,:w]
n=0.55*noise(70)+0.35*noise(24)+0.10*noise(9)
PS=np.array(Image.open(os.path.join(HERE,'painting-sf-panorama.png')).convert('RGB')).astype(np.float32)
def tex_fill(h,w):
    # facades of tall towers for the upper rows, dense rooftops for the lower rows
    boxes=[(214,322,262,395),(864,362,930,470),(984,408,1025,470),(444,322,485,385),(864,362,900,470)]
    fac=[PS[y0:y1,x0:x1] for x0,y0,x1,y1 in boxes]
    fac=[cv2.resize(f,(round(f.shape[1]*1.7),round(f.shape[0]*1.7)),interpolation=cv2.INTER_CUBIC) for f in fac]
    fac=[np.clip(f*1.35-cv2.GaussianBlur(f,(0,0),3)*0.35,0,255) for f in fac]
    th=h
    def vt(f):
        out=[];k=0
        while sum(x.shape[0] for x in out)<h:
            out.append(f); k+=1
        return np.concatenate(out,axis=0)[:h]
    fac=[vt(f) for f in fac]
    # one facade per building: split the silhouette where the roofline jumps
    m_=a>0.5; top_=np.where(m_.any(0),np.argmax(m_,axis=0),h)
    cuts=[0]+[x for x in range(1,w) if abs(int(top_[x])-int(top_[x-1]))>5 and x-0>0]+[w]
    segs_=[]
    for c0,c1 in zip(cuts[:-1],cuts[1:]):
        if segs_ and c1-c0<6: segs_[-1]=(segs_[-1][0],c1)
        else: segs_.append((c0,c1))
    row=np.zeros((th,w,3),np.float32)
    for c0,c1 in segs_:
        f=fac[rng.integers(len(fac))]
        if rng.random()<.5: f=f[:,::-1]
        reps=(c1-c0)//f.shape[1]+2
        strip=np.concatenate([f]*reps,axis=1); off=int(rng.integers(f.shape[1]))
        row[:,c0:c1]=strip[:,off:off+(c1-c0)]*(0.92+0.16*rng.random())
    up=row
    dense=PS[452:556,620:1175]; dense=cv2.resize(dense,(round(dense.shape[1]*1.4),round(dense.shape[0]*1.4)),interpolation=cv2.INTER_CUBIC)
    reps=w//dense.shape[1]+3
    rows=[]
    for r in range(h//dense.shape[0]+1):
        strip=np.concatenate([dense]*reps,axis=1)
        off=int(rng.integers(dense.shape[1]))
        rows.append(strip[:,off:off+w])
    dn=np.concatenate(rows,axis=0)[:h]
    split=np.clip((np.arange(h)-h*.70)/(h*.08),0,1)[:,None,None]
    return up*(1-split)+dn*split
col=tex_fill(h,w)
haze=np.array([214,222,230],np.float32)
col=col*0.94+haze*0.06
col=col*0.92
# use old skyline shading for depth
col=col*(0.92+0.2*(lum[...,None]-lum[a>0.5].mean()))
# edge darkening (watercolour pooling)
er=cv2.GaussianBlur(a,(0,0),3); edge=np.clip(a-er,0,1)*2
col=col*(1-0.25*edge[...,None])
ys=np.linspace(0,1,h)[:,None,None]
col=col*(1-0.5*ys**2)+np.array(BGC)*0.5*ys**2
aa=a*0.97
# ragged soft edges
aa=cv2.GaussianBlur(aa,(0,0),1.2)
mid=np.dstack([col,aa*255]).astype(np.float32)
# seamless: crossfade last o px into first
o=300
lead=mid[:,:o].copy(); tail=mid[:,-o:].copy()
sc_=np.minimum(tops(tail),tops(lead)); k_=int(np.argmax(sc_[20:-20]))+20
wgt=np.clip((np.arange(o)-k_+4)/8,0,1)[None,:,None]
mid=mid[:,:-o].copy(); mid[:,:o]=tail*(1-wgt)+lead*wgt
pad=np.zeros((H0-mid.shape[0]-20,mid.shape[1],4),np.float32)
bot=np.zeros((20,mid.shape[1],4),np.float32)
pad[:,:,:3]=BGC; bot[:,:,:3]=mid[-1:,:,:3]
mid=np.concatenate([pad,mid,bot],axis=0)
back=shift(mid[:,3300:3770].copy(),-170,0,1.0)
t_=np.linspace(0,1,230)[:,None,None]
back[420:,:,:3]=back[419:420,:,:3]*(1-.5*t_)+np.array(BGC)*.5*t_
back[:,:,3]=np.maximum.accumulate(back[:,:,3],axis=0)*np.clip((640-np.arange(650)[:,None])/200,0,1)
xs=np.arange(470)[None,:]; back[:,:,3]*=np.clip((469-xs)/150,0,1)
L=over(L,back)
def save(arr,name):
    Image.fromarray(arr.clip(0,255).astype(np.uint8),'RGBA').save(name)
save(L,'pL.png'); save(R,'pR.png'); save(mid,'pM.png')
print(L.shape,R.shape,mid.shape)
# preview composite 2600 wide
W=6000
can=np.zeros((H0,W,3),np.float32)+np.array([245,239,230],np.float32)
def comp(arr,x):
    hh,ww=arr.shape[:2]
    x1=min(W,x+ww); sub=arr[:,:x1-x]
    al=sub[:,:,3:]/255
    can[:hh,x:x1]=can[:hh,x:x1]*(1-al)+sub[:,:,:3]*al
x=0
while x<W: comp(mid,x); x+=mid.shape[1]
comp(L,0); comp(R,W-R.shape[1])
Image.fromarray(can.astype(np.uint8)).save('pano.png')
Image.fromarray(can.astype(np.uint8)).resize((2400,260)).save('pano_s.png')
# ---- Transamerica from the new panorama painting, cut out along its outline, sunk behind the skyline
zp=[(130,32),(140,100),(150,183),(178,186),(176,230),(205,600),(205,650),(45,650),(48,600),(92,230),(90,186),(112,183),(120,100)]
poly=np.array([(510+x/2-510,150+y/2-150) for x,y in zp],np.float32)*4
crop=PS[150:478,510:640]
big=cv2.resize(crop,(crop.shape[1]*4,crop.shape[0]*4),interpolation=cv2.INTER_CUBIC)
m=np.zeros(big.shape[:2],np.uint8); cv2.fillPoly(m,[poly.astype(np.int32)],255)
m=cv2.GaussianBlur(m.astype(np.float32)/255,(0,0),2.5)
T0=np.dstack([big,m*255]); T0=cv2.resize(T0,(crop.shape[1],crop.shape[0]),interpolation=cv2.INTER_AREA)
ys_=np.arange(T0.shape[0])[:,None]; T0[:,:,3]*=np.clip((T0.shape[0]-1-ys_)/60,0,1)
sc=1.05; T0=cv2.resize(T0,(round(T0.shape[1]*sc),round(T0.shape[0]*sc)),interpolation=cv2.INTER_AREA)
T=np.zeros((650,T0.shape[1],4),np.float32); y0=470-T0.shape[0]; T[y0:470]=T0
save(T,'pT.png')
def tograph(arr):
    rgb=arr[:,:,:3]; dev=np.abs(rgb-np.array([245,239,230],np.float32)).max(axis=2)
    w=np.clip(1-dev/34,0,1)[...,None]
    arr[:,:,:3]=rgb+(np.array(BGC,np.float32)-np.array([245,239,230],np.float32))*w
    return arr
for n,f in (('pT','city-ta'),('pR','city-right'),('pM','city-mid')):
    im=Image.fromarray((lambda x:x if n=='pT' else tograph(x))(np.array(Image.open(n+'.png')).astype(np.float32)).clip(0,255).astype(np.uint8),'RGBA'); w,h=im.size; im=im.resize((round(w*600/h),600),Image.LANCZOS); im.save(os.path.join(HERE,'..','..','src','assets','cablecar','')+f+SUF+'.webp',quality=78,method=6); print(f,im.size)
