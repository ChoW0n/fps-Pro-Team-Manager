"""원본 ZIP을 보존한 채 런타임 PNG/발 아틀라스를 재현합니다. Pillow 필요."""
import argparse, io, json, hashlib, shutil, zipfile
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser()
parser.add_argument('--spine',type=Path,required=True)
parser.add_argument('--frames',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/draft-order-player-generator/public/operators/survivor'
out.mkdir(parents=True,exist_ok=True)
used={'torso','head','backpack','arm','forearm','leg','foot','hand_holding_gun','hand_steadying_gun','hand_grab_ammo'}
with zipfile.ZipFile(args.spine) as archive:
 for name in used:
  (out/(name+'.png')).write_bytes(archive.read('Survivor Spine/images/'+name+'.png'))
with zipfile.ZipFile(args.frames) as archive:
 for mode in ['idle','walk','run','strafe_left','strafe_right']:
  files=sorted((n for n in archive.namelist() if n.startswith('Top_Down_Survivor/feet/'+mode+'/') and n.endswith('.png')),key=lambda n:int(Path(n).stem.rsplit('_',1)[1]))
  images=[Image.open(io.BytesIO(archive.read(n))).convert('RGBA') for n in files]
  width=max(im.width for im in images);height=max(im.height for im in images)
  atlas=Image.new('RGBA',(width*len(images),height))
  for i,im in enumerate(images):atlas.paste(im,(width*i,0))
  atlas.save(out/('feet-'+mode+'.png'))
source=root/'art-source/survivor';source.mkdir(parents=True,exist_ok=True)
shutil.copyfile(args.spine,source/'source-spine.zip')
(source/'sources.json').write_text(json.dumps({'author':'Riley Gombart','license':'CC BY 3.0','source':'https://opengameart.org/content/animated-top-down-survivor-player','archives':{name:{'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size} for name,file in [('Survivor Spine.zip',args.spine),('Top_Down_Survivor_2.zip',args.frames)]}},indent=2)+'\n')
