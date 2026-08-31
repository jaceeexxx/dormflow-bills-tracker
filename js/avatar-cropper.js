const OUTPUT_SIZE=512;
const VIEW_SIZE=280;

function imageFromFile(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({img,url});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not open that image.'));};img.src=url;});}
function clamp(v,min,max){return Math.min(max,Math.max(min,v));}

export async function openAvatarCropper(file,{onUse,onCancel}={}){
  const {img,url}=await imageFromFile(file);
  const overlay=document.createElement('div');overlay.className='avatar-cropper-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Crop profile photo');
  overlay.innerHTML=`<section class="avatar-cropper-card"><header><div><small>Profile photo</small><h2>Crop photo</h2></div><button type="button" data-crop-cancel aria-label="Cancel">×</button></header><div class="avatar-crop-stage" data-crop-stage><img alt="Photo to crop"><span class="avatar-crop-circle" aria-hidden="true"></span></div><label class="avatar-zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value="1"></label><div class="avatar-crop-actions"><button type="button" class="secondary-action" data-crop-cancel>Cancel</button><button type="button" class="primary-action" data-crop-use>Use Photo</button></div><canvas width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" hidden></canvas></section>`;
  document.body.append(overlay);
  const stage=overlay.querySelector('[data-crop-stage]'),photo=stage.querySelector('img'),zoom=overlay.querySelector('input[type=range]'),canvas=overlay.querySelector('canvas');
  photo.src=url;
  const baseScale=Math.max(VIEW_SIZE/img.naturalWidth,VIEW_SIZE/img.naturalHeight);let zoomFactor=1,panX=0,panY=0;const pointers=new Map();let dragStart=null,pinchStart=null;
  const bounds=()=>{const scale=baseScale*zoomFactor,w=img.naturalWidth*scale,h=img.naturalHeight*scale,maxX=Math.max(0,(w-VIEW_SIZE)/2),maxY=Math.max(0,(h-VIEW_SIZE)/2);panX=clamp(panX,-maxX,maxX);panY=clamp(panY,-maxY,maxY);return {scale,w,h};};
  const render=()=>{const {scale,w,h}=bounds();photo.style.width=`${w}px`;photo.style.height=`${h}px`;photo.style.transform=`translate(calc(-50% + ${panX}px),calc(-50% + ${panY}px))`;photo.dataset.scale=String(scale);};
  zoom.addEventListener('input',()=>{zoomFactor=Number(zoom.value);render();});
  stage.addEventListener('pointerdown',e=>{stage.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)dragStart={x:e.clientX,y:e.clientY,panX,panY};if(pointers.size===2){const a=[...pointers.values()];pinchStart={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:zoomFactor};}});
  stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&dragStart){panX=dragStart.panX+e.clientX-dragStart.x;panY=dragStart.panY+e.clientY-dragStart.y;render();}else if(pointers.size===2&&pinchStart){const a=[...pointers.values()],distance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoomFactor=clamp(pinchStart.zoom*(distance/pinchStart.distance),1,3);zoom.value=String(zoomFactor);render();}});
  const release=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinchStart=null;if(pointers.size===0)dragStart=null;};stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('touchmove',()=>{}, {passive:true});
  render();
  return new Promise(resolve=>{
    const finish=value=>{URL.revokeObjectURL(url);overlay.remove();resolve(value);};
    overlay.querySelectorAll('[data-crop-cancel]').forEach(button=>button.addEventListener('click',()=>{onCancel?.();finish(null);}));
    overlay.querySelector('[data-crop-use]').addEventListener('click',()=>{
      const {scale,w,h}=bounds(),left=(VIEW_SIZE-w)/2+panX,top=(VIEW_SIZE-h)/2+panY,srcX=clamp(-left/scale,0,img.naturalWidth),srcY=clamp(-top/scale,0,img.naturalHeight),srcSize=Math.min(VIEW_SIZE/scale,img.naturalWidth-srcX,img.naturalHeight-srcY);const ctx=canvas.getContext('2d');ctx.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);ctx.drawImage(img,srcX,srcY,srcSize,srcSize,0,0,OUTPUT_SIZE,OUTPUT_SIZE);canvas.toBlob(blob=>{if(!blob)return;const cropped=new File([blob],`avatar-${Date.now()}.webp`,{type:'image/webp',lastModified:Date.now()});onUse?.(cropped);finish(cropped);},'image/webp',.9);
    });
  });
}
