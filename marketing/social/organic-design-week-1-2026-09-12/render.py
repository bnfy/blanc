"""Render original typography cards from repository fonts and original Sunrise mark.
No browser, product screenshot, synthetic person, external media or upload.
Requires fontTools, node/sharp and ffmpeg already present on the workstation.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import json, subprocess, re, html, base64
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
def font(path, axes):
 f=TTFont(ROOT/path)
 if 'fvar' in f: f=instantiateVariableFont(f,{k:v for k,v in axes.items() if k in {a.axisTag for a in f['fvar'].axes}},inplace=True)
 return f
REGULAR=font('site/node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2',{'wght':400,'opsz':72})
NEWS=font('site/node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2',{'wght':500,'opsz':72})
INTER=font('src/renderer/pages/inter-latin.woff2',{'wght':400})
MED=font('src/renderer/pages/inter-latin.woff2',{'wght':600})
mark_path=ROOT/'site/public/sunrise-hero-mark.png'
mark_data='data:image/png;base64,'+base64.b64encode(mark_path.read_bytes()).decode('ascii')

def width(f,s,size):
 cmap=f.getBestCmap(); gs=f.getGlyphSet(); scale=size/f['head'].unitsPerEm
 return sum(gs[cmap.get(ord(c),'.notdef')].width*scale for c in s)

def line(s,y,size,f=INTER,color='#111111'):
 w=width(f,s,size)
 if w>840: raise ValueError(f'Text exceeds safe width: {s}: {w}')
 x=(1080-w)/2; gs=f.getGlyphSet(); cmap=f.getBestCmap(); scale=size/f['head'].unitsPerEm; parts=[]
 for c in s:
  glyph=gs[cmap.get(ord(c),'.notdef')]; pen=SVGPathPen(gs)
  glyph.draw(TransformPen(pen,(scale,0,0,-scale,x,y)))
  parts.append(f'<path d="{pen.getCommands()}" fill="{color}"/>')
  x+=glyph.width*scale
 return ''.join(parts)

def wrap(s,f,size,maxw=810):
 words=s.split(); out=[]; current=''
 for word in words:
  proposed=(current+' '+word).strip()
  if current and width(f,proposed,size)>maxw:out.append(current);current=word
  else:current=proposed
 if current:out.append(current)
 return out

pieces={
 'trial':[
  ('Before you switch\nbrowsers.', 'Start with the task you cannot afford to interrupt.'),
  ('Pick one\nreal task.', 'Try a client call, a design review, or your daily admin. Choose your own deal-breaker.'),
  ('Test the\nboring details.', 'Sign in. Open the files you need. Check the controls you rely on. Keep your current browser available.'),
  ('Would you\nuse it again?', 'What worked? What got in the way? Judge the task, then the look.')
 ],
 'simple':[
  ('Clean is a look.\nSimple is a test.', 'A design opinion from Blanc.'),
  ('Find it.\nUse it.\nUndo it.', 'Three questions to ask before calling an interface simple.'),
  ('What became\nharder to find?', 'That is useful design feedback. Tell us which control you would keep visible.')
 ],
 'switch':[
  ('What would stop\nyou switching?', 'A question for people who work in their browser.'),
  ('One site?\nOne shortcut?\nOne extension?', 'Which part of your current setup is non-negotiable?'),
  ('Tell us the\nnon-negotiable.', 'We want to hear the practical answer. Follow Blanc for browsing ideas and design tradeoffs.')
 ]
}
manifest=[]
# Per-scene editorial compositions. Source art never supplies a logo or product UI.
PAPER='#F7F0E5'; INK='#191919'; GOLD='#805D28'; GOLDLIGHT='#D4AD66'; MUTED='#6B6257'; SURFACE='#EFE6D8'

def txt(s,x,y,size,f=NEWS,color=INK,anchor='start'):
 w=width(f,s,size)
 if anchor=='middle':x-=w/2
 if anchor=='end':x-=w
 if x<55 or x+w>1025:raise ValueError(f'Text outside safe area: {s} x={x} width={w}')
 gs=f.getGlyphSet();cmap=f.getBestCmap();scale=size/f['head'].unitsPerEm;out=[]
 for c in s:
  glyph=gs[cmap.get(ord(c),'.notdef')];pen=SVGPathPen(gs);glyph.draw(TransformPen(pen,(scale,0,0,-scale,x,y)))
  out.append(f'<path d="{pen.getCommands()}" fill="{color}"/>');x+=glyph.width*scale
 return ''.join(out)
def textblock(s,x,y,size=35,color=MUTED,maxw=880,center=False):
 return ''.join(txt(t,x,y+i*size*1.4,size,INTER,color,'middle' if center else 'start') for i,t in enumerate(wrap(s,INTER,size,maxw)))
def rect(x,y,w,h,c,rx=0,stroke='none'):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{c}" stroke="{stroke}"/>'
def path(d,color=GOLD,sw=3):return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
def art(name,x,y,w,h):
 raw=base64.b64encode((OUT/name).read_bytes()).decode();return f'<image href="data:image/png;base64,{raw}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice"/>'
def brand(dark=False):
 color=GOLDLIGHT if dark else GOLD
 return f'<image href="{mark_data}" x="84" y="64" width="62" height="62"/>'
def bottom(index,total,dark=False):
 c=GOLDLIGHT if dark else GOLD
 return txt('blancbrowser.com',84,1275,23,INTER,c)+txt(f'{index:02} / {total:02}',996,1275,23,MED,c,'end')

def card(name,title,sub,index,total,vertical=True):
 h=1920 if vertical else 1350;off=230 if vertical else 0
 dark=(name.startswith('simple') and name!='simple-scene-2') or name.endswith('trial-scene-3') or name.endswith('trial-carousel-3')
 bg=INK if dark else PAPER
 s=f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="{h}" viewBox="0 0 1080 {h}"><title>{html.escape(title.replace(chr(10)," "))}</title>'+rect(0,0,1080,h,bg)+f'<g transform="translate(0 {off})">'
 # Four different panel constructions make the trial a progression, not a template set.
 if name.startswith('trial'):
  if index==1:
   s+=art('editorial-paper.png',0,380,1080,730)
   s+=rect(0,0,1080,340,PAPER)+brand()
   s+=txt('Before you switch',84,250,89)+txt('browsers.',84,340,89)
   s+=textblock(sub,84,1170,34,INK,830)
   design='Editorial still life: suspended ivory paper and brass path, with an asymmetric headline.'
  elif index==2:
   s+=brand()+txt('Pick one',540,290,106,anchor='middle')+txt('real task.',540,395,106,anchor='middle')
   # An angled paper sheet behind a ruled checklist.
   s+=f'<g transform="rotate(-5 540 810)">'+rect(158,560,780,555,'#DBC9A8')+'</g>'
   s+=rect(130,520,820,565,'#FFFCF7',4)
   s+=txt('A familiar task is a fair test.',185,595,30,INTER,GOLD)
   for i,label in enumerate(['A client call','A design review','Your daily admin']):
    yy=705+i*118;s+=rect(190,yy-35,35,35,'none',4,'#BCA06A')+txt(label,256,yy,46)
    s+=path(f'M185 {yy+40} H895','#DDD2C2',1.5)
   s+=textblock('Choose your own deal-breaker.',540,1170,33,MUTED,850,True)
   design='A slightly offset paper checklist with three task choices and ruled lines.'
  elif index==3:
   s+=brand(True)+txt('Test the',84,266,106,color=PAPER)+txt('boring details.',84,371,106,color=PAPER)
   labels=['Sign in.','Open the files you need.','Check your controls.']
   for i,label in enumerate(labels):
    y=535+i*153;s+=txt(f'0{i+1}',86,y,31,INTER,GOLDLIGHT)
    s+=txt(label,195,y,52,color=PAPER)+path(f'M84 {y+49} H996','#4A4135',1)
   s+=textblock('Keep your current browser available.',84,1080,37,'#DDD2C2',840)
   design='Dark warm-ink checklist; gold step numbers and large horizontal action rows.'
  else:
   s+=brand()+txt('Would you',540,280,105,anchor='middle')+txt('use it again?',540,385,105,anchor='middle')
   s+=path('M540 440 V530 M300 530 H780 M300 530 V580 M780 530 V580','#BCA06A',2.5)
   s+=rect(84,585,432,350,'#FFFCF7',0)+rect(564,585,432,350,SURFACE,0)
   s+=txt('+',300,710,98,color=GOLD,anchor='middle')+txt('?',780,710,98,color=GOLD,anchor='middle')
   s+=txt('What worked?',300,803,46,anchor='middle')+txt('What got',780,792,45,anchor='middle')+txt('in the way?',780,846,45,anchor='middle')
   s+=textblock('Judge the task, then the look.',540,1070,38,MUTED,880,True)
   design='A branching decision diagram with two contrasting reflection panels.'
 elif name=='simple-scene-1':
  s+=art('editorial-mechanism.png',0,230,1080,1020)+rect(0,0,1080,195,INK)+brand(True)
  s+=txt('Clean is a look.',84,273,92,color=PAPER)+txt('Simple is a test.',84,368,92,color=GOLDLIGHT)
  s+=textblock(sub,84,1170,32,'#DDD2C2',850)
  design='Dramatic dark still life of a folded brass mechanism and ivory sphere.'
 elif name=='simple-scene-2':
  s+=brand()+txt('Three tests.',84,300,114)
  # Large type with an actual return path, not the same centered poster.
  for yy,word in [(515,'Find it.'),(735,'Use it.'),(955,'Undo it.')]:
   s+=txt(word,170,yy,117)+f'<circle cx="930" cy="{yy-40}" r="12" fill="{GOLD}"/>'
  s+=path('M930 487 V843 Q930 915 865 915 H793 M817 891 L793 915 L817 939',GOLD,5)
  s+=textblock(sub,84,1130,31,MUTED,850)
  design='Oversized type arranged as a three-step path with a visible return arrow.'
 elif name=='simple-scene-3':
  s+=brand(True)
  s+=rect(84,200,912,630,'#24211C',14)
  # A deliberately sparse menu diagram, explicitly generic editorial artwork.
  for j in range(3):s+=f'<circle cx="{410+j*130}" cy="365" r="15" fill="{GOLDLIGHT}"/>'
  s+=path('M540 420 V510 M520 490 L540 510 L560 490',GOLDLIGHT,4)
  s+=rect(250,560,580,154,INK,12,'#805D28')+txt('Where did it go?',540,654,54,color=PAPER,anchor='middle')
  s+=txt('What became',84,940,87,color=PAPER)+txt('harder to find?',84,1035,87,color=PAPER)
  s+=textblock(sub,84,1130,29,'#DDD2C2',860)
  design='A generic three-dot menu with a descending arrow into an elusive action; dark diagram.'
 elif name=='simple-tiktok-hook':
  s+=brand(True)
  s+=path('M850 585 C850 350 240 350 240 585 V795 M160 710 L240 795 L320 710',GOLDLIGHT,25)
  s+=txt('Can you find',540,965,93,color=PAPER,anchor='middle')+txt('the undo?',540,1060,93,color=PAPER,anchor='middle')
  s+=textblock(sub,540,1150,30,'#DDD2C2',830,True)
  design='A monumental U-turn arrow above a direct question on warm ink.'
 elif name=='switch-scene-1':
  s+=brand()
  s+=txt('?',780,960,770,f=REGULAR,color='#DDC69B',anchor='middle')
  s+=txt('What would',84,540,112)+txt('stop you',84,653,112)+txt('switching?',84,766,112)
  s+=textblock(sub,84,1120,34,MUTED,760)
  design='Giant gold question-mark typography with an offset three-line headline.'
 elif name=='switch-scene-2':
  s+=brand()
  for i,(word,c,tc) in enumerate([('One site?',SURFACE,INK),('One shortcut?',INK,PAPER),('One extension?','#DDC69B',INK)]):
   yy=255+i*238;s+=rect(0,yy,1080,213,c)+txt(word,540,yy+138,92,color=tc,anchor='middle')
  s+=textblock(sub,84,1140,34,MUTED,850)
  design='Three full-width typographic bands: ivory, warm ink and muted gold.'
 else:
  s+=brand()+txt('Tell us the',84,280,104)+txt('non-negotiable.',84,385,104)
  # Two speech shapes invite a specific reply without fabricated quotations.
  s+=path('M950 510 H305 Q260 510 260 555 V760 Q260 805 305 805 H650 L745 885 V805 H950 Q995 805 995 760 V555 Q995 510 950 510 Z','#C8B389',3)
  s+=rect(84,620,715,322,INK,26)+path('M215 942 L215 1000 L286 942',INK,6)
  s+=txt('Your browser',440,755,62,color=PAPER,anchor='middle')+txt('has to get…',440,830,62,color=PAPER,anchor='middle')
  s+=textblock(sub,84,1100,32,MUTED,850)
  design='Overlapping conversation shapes with an unfinished prompt, inviting a concrete response.'
 s+=bottom(index,total,dark)+'</g></svg>'
 (OUT/(name+'.svg')).write_text(s)
 public=title.replace('\n',' ')+' '+sub
 # Include every new visible label in the exact accessibility transcript.
 extras={'trial-scene-2':'A familiar task is a fair test. A client call. A design review. Your daily admin. Choose your own deal-breaker.','trial-carousel-2':'A familiar task is a fair test. A client call. A design review. Your daily admin. Choose your own deal-breaker.','simple-scene-2':'Three tests.','simple-scene-3':'Where did it go?','switch-scene-3':'Your browser has to get…'}
 transcript=public+' '+extras.get(name,'')
 if name.startswith('trial'):
  transcript={1:public,2:'Pick one real task. A familiar task is a fair test. A client call. A design review. Your daily admin. Choose your own deal-breaker.',3:'Test the boring details. 01 Sign in. 02 Open the files you need. 03 Check your controls. Keep your current browser available.',4:'Would you use it again? What worked? What got in the way? Judge the task, then the look.'}[index]
 transcript=transcript+' blancbrowser.com. '+f'{index:02} / {total:02}.'
 manifest.append({'id':name,'svg':name+'.svg','png':name+'.png','width':1080,'height':h,'title':title.replace('\n',' '),'subtitle':sub,'alt':public+' '+design+' Original gold Sunrise mark.','transcript':transcript.strip(),'design':design,'brandRevision':'sunrise-r6'})

for key,scenes in pieces.items():
 for i,(t,s) in enumerate(scenes,1):card(f'{key}-scene-{i}',t,s,i,len(scenes))
for i,(t,s) in enumerate(pieces['trial'],1):card(f'trial-carousel-{i}',t,s,i,4,False)
card('simple-tiktok-hook','Can you find\nthe undo?', 'A clean-looking interface still has to make recovery clear.',1,3)
(OUT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
js="const fs=require('fs'),sharp=require('sharp'); const p=process.argv[1]; (async()=>{for(const a of JSON.parse(fs.readFileSync(p+'/assets.json'))){await sharp(p+'/'+a.svg).png().toFile(p+'/'+a.png)}})().catch(e=>{console.error(e);process.exit(1)});"
subprocess.run(['node','-e',js,str(OUT)],cwd=ROOT,check=True)
for key,scenes in pieces.items():
 entries=[f"file '{key}-scene-{i}.png'\nduration 6\n" for i in range(1,len(scenes)+1)]
 entries.append(f"file '{key}-scene-{len(scenes)}.png'\n")
 (OUT/(key+'.ffconcat')).write_text('ffconcat version 1.0\n'+''.join(entries))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',str(OUT/(key+'.ffconcat')),'-t',str(len(scenes)*6),'-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','fast','-crf','19','-movflags','+faststart',str(OUT/(key+'-1080x1920.mp4'))],check=True)
(OUT/'simple-tiktok.ffconcat').write_text("ffconcat version 1.0\nfile 'simple-tiktok-hook.png'\nduration 6\nfile 'simple-scene-2.png'\nduration 6\nfile 'simple-scene-3.png'\nduration 6\nfile 'simple-scene-3.png'\n")
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',str(OUT/'simple-tiktok.ffconcat'),'-t','18','-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','fast','-crf','19','-movflags','+faststart',str(OUT/'simple-tiktok-1080x1920.mp4')],check=True)
print('Rendered 15 cards, 3 primary videos and 1 TikTok hook variant.')
