"""Regenerate original geometric test assets; no model calls or external media."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image, ImageDraw
import imageio_ffmpeg
ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'samples/synthetic-product'
folder.mkdir(parents=True, exist_ok=True)
for i, name in enumerate(('front', 'back', 'left', 'right', 'angle')):
    image = Image.new('RGB', (960, 600), '#edf2f7')
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((180+i*5, 220, 775, 420), radius=40, fill='#3563e9')
    d.polygon([(310,220),(385,130),(585,130),(675,220)], fill='#8ea8ef')
    for x in (315, 650): d.ellipse((x-55,360,x+55,470), fill='#253248');d.ellipse((x-22,393,x+22,437), fill='#d5dfef')
    d.text((35,35), 'SYNTHETIC VEHICLE | DIAGRAM ONLY', fill='#253248')
    image.save(folder / (name+'.webp'), format='WEBP', lossless=True)
example = ROOT / 'samples/portfolio-example'
source = example / 'sources/src_273450_angle.webp'
source.write_bytes((folder/'angle.webp').read_bytes())
with Image.open(source) as img:img.save(example/'derived/src_273450_angle_clean.jpg', format='JPEG', quality=90)
p = example/'template.json'; template=json.loads(p.read_text())
for rel in template['assets']:template['assets'][rel]=hashlib.sha256((example/rel).read_bytes()).hexdigest()
for item in template['metadata']['sources']:
    if item['kind']=='image':item['size']=(example/item['path']).stat().st_size
p.write_text(json.dumps(template, indent=2)+'\n')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'lavfi', '-i', 'color=c=0x3563e9:s=1280x720:d=20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-map_metadata', '-1', str(ROOT/'samples/synthetic_clip.mp4')], check=True, capture_output=True)
print('Wrote original geometric fixtures and refreshed the asset allowlist.')
