"""사용자가 승인한 생성 원화 배경 분리. 원본 색/좌표를 보존한 RGBA와 축소본을 만든다."""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

p=argparse.ArgumentParser()
p.add_argument('source');p.add_argument('output');p.add_argument('--mode',choices=['magenta','dark-checker'],default='magenta');p.add_argument('--width',type=int,default=512)
a=p.parse_args()
im=Image.open(a.source).convert('RGB');rgb=np.array(im);v=rgb.astype(float)
if a.mode=='magenta':
    # 유채색 배경만 제거한다. 무채색 조준기·금속 하이라이트는 보존한다.
    key=(v[:,:,0]>v[:,:,1]+45)&(v[:,:,2]>v[:,:,1]+45)
    mask=~key
else:
    # 어두운 단일 원화와 밝은 체크 배경에만 사용한다. 밝은 피사체에는 적용하지 않는다.
    labels,n=ndimage.label(v.max(axis=2)<155)
    sizes=np.bincount(labels.ravel());sizes[0]=0
    mask=ndimage.binary_fill_holes(labels==sizes.argmax())
labels,n=ndimage.label(mask)
sizes=np.bincount(labels.ravel());sizes[0]=0
mask=labels==sizes.argmax()
if mask[0].any() or mask[-1].any() or mask[:,0].any() or mask[:,-1].any():raise ValueError('피사체가 가장자리에 닿음: 배경/여백 검사 필요')
ratio=float(mask.mean())
if not .015<ratio<.7:raise ValueError('비정상 알파 면적')
rgba=np.dstack([rgb,mask.astype('uint8')*255]);out=Image.fromarray(rgba)
bbox=out.getbbox();x0,y0,x1,y1=bbox
pad=12;box=(max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad))
cut=out.crop(box);scale=a.width/cut.width
cut=cut.resize((a.width,round(cut.height*scale)),Image.Resampling.LANCZOS)
dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);cut.save(dest)
assert cut.mode=='RGBA' and cut.getextrema()[3][0]==0
print(json.dumps({'source':a.source,'output':a.output,'mode':a.mode,'bbox':bbox,'crop':box,'size':cut.size,'alphaCoverage':ratio,'sourceRgbPreserved':True}))
