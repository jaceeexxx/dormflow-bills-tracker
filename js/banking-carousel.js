export function initBankingCarousels(root=document){
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  root.querySelectorAll('.banking-card-carousel').forEach(carousel=>{
    if(carousel.dataset.ready==='true')return;carousel.dataset.ready='true';
    const track=carousel.querySelector('.banking-card-track'),cards=[...carousel.querySelectorAll('.banking-carousel-card')],dots=[...carousel.querySelectorAll('.carousel-dot')],prev=carousel.querySelector('[data-carousel-prev]'),next=carousel.querySelector('[data-carousel-next]');
    if(!track||cards.length<2)return;let index=0,dragging=false,startX=0,startScroll=0;
    const update=()=>{const center=track.scrollLeft+track.clientWidth/2;let best=0,dist=Infinity;cards.forEach((c,i)=>{const d=Math.abs((c.offsetLeft+c.offsetWidth/2)-center);if(d<dist){dist=d;best=i;}});index=best;dots.forEach((d,i)=>{d.classList.toggle('active',i===index);d.setAttribute('aria-current',i===index?'true':'false');});carousel.setAttribute('aria-label',`Banking cards. Card ${index+1} of ${cards.length}: ${cards[index]?.dataset.cardLabel||''}`);};
    const go=i=>{index=Math.max(0,Math.min(cards.length-1,i));cards[index].scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest',inline:'center'});setTimeout(update,reduced?0:180);};
    prev?.addEventListener('click',()=>go(index-1));next?.addEventListener('click',()=>go(index+1));dots.forEach((d,i)=>d.addEventListener('click',()=>go(i)));
    track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});
    track.addEventListener('pointerdown',e=>{dragging=true;startX=e.clientX;startScroll=track.scrollLeft;track.setPointerCapture?.(e.pointerId);});
    track.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-startX;track.scrollLeft=startScroll-dx;if(!reduced){cards.forEach(c=>{const center=track.scrollLeft+track.clientWidth/2,delta=(c.offsetLeft+c.offsetWidth/2)-center,ratio=Math.max(-1,Math.min(1,delta/track.clientWidth));c.style.transform=`perspective(900px) rotateY(${ratio*5}deg) translateZ(${Math.abs(ratio)*-8}px)`;});}});
    const release=e=>{if(!dragging)return;dragging=false;track.releasePointerCapture?.(e.pointerId);cards.forEach(c=>c.style.transform='');update();go(index);};track.addEventListener('pointerup',release);track.addEventListener('pointercancel',release);
    carousel.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();go(index-1);}if(e.key==='ArrowRight'){e.preventDefault();go(index+1);}});
    update();
  });
}
