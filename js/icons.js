const paths = {
  home:'<path d="M4.7 11.3 12 5l7.3 6.3v7.3a1.4 1.4 0 0 1-1.4 1.4h-3.7v-5.4H9.8V20H6.1a1.4 1.4 0 0 1-1.4-1.4z"/>',
  balance:'<rect x="3.8" y="5" width="16.4" height="14" rx="3"/><path d="M3.8 9h16.4M8 14h3.2M16.1 12.4v3.2"/>',
  payments:'<path d="M5 8.2h12.7l-2.8-2.8M19 15.8H6.3l2.8 2.8"/><path d="M17.7 8.2 20 10.5M6.3 15.8 4 13.5"/>',
  transfer:'<path d="M5 7.5h11.7M14.2 4.8l2.7 2.7-2.7 2.7M19 16.5H7.3M9.8 13.8l-2.7 2.7 2.7 2.7"/>',
  more:'<circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  review:'<path d="m7 12.2 3 3 7-7"/><path d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2"/>',
  notifications:'<path d="M6.7 9.2a5.3 5.3 0 0 1 10.6 0c0 5 2 5.3 2 6.8H4.7c0-1.5 2-1.8 2-6.8Z"/><path d="M10 19h4"/>',
  receipt:'<path d="M7 4h10v16l-2-1.4-2 1.4-2-1.4L9 20l-2-1.4z"/><path d="M9.5 9h5M9.5 13h5"/>',
  utilities:'<path d="M8.1 3.8h7.8l-1.7 5.3h3.1L10 20.2l1.4-7H7.8z"/><path d="M5 20h14"/>',
  rent:'<path d="M4.5 11.2 12 4.8l7.5 6.4"/><path d="M6.2 10.6v8.7h11.6v-8.7"/><path d="M9.1 19.3v-5.2h5.8v5.2"/><path d="M8.2 8.3V5.6h3"/>',
  grocery:'<path d="M5.2 8.5h13.6l-1 9.1a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M8.3 8.5 10 4.7M15.7 8.5 14 4.7M8.5 12.5v2.8M12 12.5v2.8M15.5 12.5v2.8"/>',
  paylater:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M7.5 9h9M8 14h3M15.5 13.2v3.2M13.9 14.8h3.2"/>',
  announcement:'<path d="M4.5 10.3v3.4h3.2l6.8 3.2V7.1l-6.8 3.2z"/><path d="M7.7 13.7 8.8 19M17 9.2c1.2.8 1.8 1.7 1.8 2.8s-.6 2-1.8 2.8"/>',
  analytics:'<path d="M5 19V9M10 19V5M15 19v-7M20 19V7"/><path d="M4 19h17"/>',
  overdue:'<path d="M12 4.3 21 19H3z"/><path d="M12 9v4M12 16.8h.1"/>',
  dueSoon:'<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  credit:'<path d="M5 7.4h14v9.2a2.2 2.2 0 0 1-2.2 2.2H7.2A2.2 2.2 0 0 1 5 16.6z"/><path d="M8 7.4V5.8a2.4 2.4 0 0 1 2.4-2.4h3.2A2.4 2.4 0 0 1 16 5.8v1.6M9 12h6M12 9v6"/>',
  category:'<path d="M4.5 5.5h6v6h-6zM13.5 5.5h6v6h-6zM4.5 14.5h6v4h-6zM13.5 14.5h6v4h-6z"/>',
  admin:'<path d="M12 3.8 19 6v5.4c0 4.5-2.8 7.4-7 8.8-4.2-1.4-7-4.3-7-8.8V6z"/><path d="M9.3 12.2 11 14l3.8-4"/>',
  users:'<path d="M9.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM4.4 19.2c.4-3.1 2.2-5.1 5.1-5.1s4.7 2 5.1 5.1"/><path d="M15.5 7.1a2.5 2.5 0 0 1 0 4.8M16.4 14.4c2 .5 3.1 2.1 3.3 4.5"/>',
  calendar:'<rect x="4" y="5.5" width="16" height="14" rx="2.6"/><path d="M7.7 3.8v3.5M16.3 3.8v3.5M4 9.3h16M8 13h2M14 13h2M8 16.3h2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3.7v2M12 18.3v2M3.7 12h2M18.3 12h2M6.1 6.1l1.4 1.4M16.5 16.5l1.4 1.4M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4"/>',
  wallet:'<path d="M5.2 6.5h12.2a2.6 2.6 0 0 1 2.6 2.6v7.2a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 16.3V7.8a2.6 2.6 0 0 1 2-2.5l9-2.1"/><path d="M15.2 11.2H20v4h-4.8a2 2 0 0 1 0-4Z"/>',
  qr:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2v4h-2zM14 18h4v2h-4z"/>',
  profile:'<circle cx="12" cy="8.2" r="3.4"/><path d="M5.6 19.3c.6-4 3-6.2 6.4-6.2s5.8 2.2 6.4 6.2"/>',
  camera:'<path d="M5 8.2h3l1.4-2.3h5.2L16 8.2h3a1.8 1.8 0 0 1 1.8 1.8v7.2A1.8 1.8 0 0 1 19 19H5a1.8 1.8 0 0 1-1.8-1.8V10A1.8 1.8 0 0 1 5 8.2Z"/><circle cx="12" cy="13.5" r="3"/>',
  copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  edit:'<path d="m5 17.8.8-3.7L15.6 4.3a1.8 1.8 0 0 1 2.6 0l1.5 1.5a1.8 1.8 0 0 1 0 2.6l-9.8 9.8-3.7.8z"/><path d="m14.3 5.6 4.1 4.1"/>',
  reports:'<path d="M6 4.5h9l3 3V20H6z"/><path d="M15 4.5V8h3M9 12h6M9 15h6"/>',
  members:'<path d="M8.5 11.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.8 19c.4-3.1 2.1-5.1 4.7-5.1s4.3 2 4.7 5.1"/><path d="M15.3 6.4a2.4 2.4 0 0 1 0 4.7M16 14c2.3.5 3.7 2.3 4 5"/>',
  logout:'<path d="M10.5 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19h3.7"/><path d="M13.5 8.2 17.3 12l-3.8 3.8M9.2 12h8.1"/>',
  back:'<path d="m14.5 5-7 7 7 7"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
export function icon(name, className='') {
  return `<svg class="app-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.more}</svg>`;
}
export function hydrateIcons(root=document) {
  root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
}
