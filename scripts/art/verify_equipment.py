"""개별 원화/알파 재현과 밝고 어두운 배경 검수표. 저장소 루트에서 실행합니다."""
import hashlib, json, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

root=Path('art-source/sidearms-top')
rows=json.loads((root/'inputs.json').read_text())
sheet=Image.new('RGB',(1100,1100),'#e0e6e4'); draw=ImageDraw.Draw(sheet)
results=[]
with tempfile.TemporaryDirectory() as tmp:
    for i,row in enumerate(rows):
        source=Image.open(row['source']).convert('RGB')
        actual=Image.open(row['output'])
        assert actual.mode=='RGBA'
        alpha=np.array(actual)[:,:,3]
        assert alpha.min()==0 and alpha.max()==255 and not alpha[0].any() and not alpha[-1].any()
        rgb=np.array(actual)[:,:,:3].astype(float)
        assert not (((rgb[:,:,0]>rgb[:,:,1]+45)&(rgb[:,:,2]>rgb[:,:,1]+45))&(alpha>240)).any(), row['id']+' 배경 잔색'
        target=Path(tmp)/(row['id']+'.png')
        subprocess.check_output(['python','scripts/art/prepare_sprite.py',row['source'],str(target),'--mode',row['mode'],'--width',str(actual.width)])
        assert target.read_bytes()==Path(row['output']).read_bytes(),row['id']+' 처리 재현'
        x=(i%2)*550;y=(i//2)*220
        draw.rectangle((x,y+110,x+550,y+220),fill='#263237')
        preview=actual.transpose(Image.Transpose.ROTATE_90) if 'shield' in row['id'] else actual.copy()
        preview.thumbnail((480,85))
        for yy in [y+20,y+125]:sheet.paste(preview,(x+30,yy),preview)
        draw.text((x+30,y+4),row['id']+(' (rotated for review)' if 'shield' in row['id'] else ''),fill='black')
        results.append({'id':row['id'],'size':actual.size,'mode':actual.mode,'transparentPixels':int((alpha==0).sum()),'sourceDecodedSha256':hashlib.sha256(source.tobytes()).hexdigest(),'deterministic':True})
sheet.save('validation/sidearms-shields-assets.png')
Path('validation/equipment-alpha.json').write_text(json.dumps(results,indent=2)+'\n')
print('PASS 10 RGBA assets, no opaque chroma background, preserved source decode hashes, deterministic processing')
