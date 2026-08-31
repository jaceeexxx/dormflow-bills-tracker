export const MEMBER_ROUTES = ['home','balance','payments','more'];
export const ADMIN_ROUTES = ['overview','review','manage'];

export function routeForRole(role, requested) {
  const allowed = role === 'admin' ? [...ADMIN_ROUTES,'home','balance','payments','more','profile'] : [...MEMBER_ROUTES,'profile'];
  return allowed.includes(requested) ? requested : (role === 'admin' ? 'overview' : 'home');
}

export function navigate(route, {replace=false}={}) {
  const hash = `#/${route}`;
  if (replace) history.replaceState({route},'',hash); else history.pushState({route},'',hash);
  window.dispatchEvent(new CustomEvent('dormflow:navigate',{detail:{route}}));
}

export function currentRoute() {
  return location.hash.replace(/^#\/?/,'') || 'home';
}

export function canNavigateBack(){return typeof history!=='undefined'&&history.length>1&&currentRoute()!=='home';}
export function navigateBack(){if(currentRoute()==='home')return;history.back();}
