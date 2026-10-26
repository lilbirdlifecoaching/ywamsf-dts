"""Stitch the slices from screenshot_pages.py side by side: python3 tools/contact_sheet.py <tag> <page>"""
import sys,glob
from PIL import Image
tag,name=sys.argv[1],sys.argv[2]
fs=sorted(glob.glob(f'{tag}_{name}_[0-9].png'))
ims=[Image.open(f) for f in fs]; H=max(i.size[1] for i in ims)
c=Image.new('RGB',(sum(i.size[0]+8 for i in ims),H),'magenta'); x=0
for i in ims: c.paste(i,(x,0)); x+=i.size[0]+8
c.save(f'S_{tag}_{name}.png'); print(c.size)
