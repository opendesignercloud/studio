/* Open Designer Cloud Studio: tool registry.
   One list drives the side navigation on the /studio landing page (a CORE page) and on every
   standalone tool. To add a tool: add an entry here and drop its app in /studio/<id>/.
     status: 'live' | 'soon'      access: 'public' | 'login'  (see /britewire/studio-access.php) */
window.OCX_ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  cutout: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>',
  convert: '<path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  vector: '<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.5 7.5"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 14h3v3h-3zM20 14v1M14 20h3M20 18v3"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  tiles: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',
  templates: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  apps: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  learn: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  external: '<path d="M7 17L17 7M8 7h9v9"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  upscale: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  favicon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M12 12l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-.9.7-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  blur: '<path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  watermark: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16l4-9 4 9M9.5 13h5"/>',
  merge: '<path d="M8 6V4h8l4 4v8h-2"/><path d="M4 8h8l4 4v8H4z"/><path d="M12 8v4h4"/>',
  design: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M12 8v9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  shapes: '<rect x="3" y="3" width="11" height="11" rx="1.5"/><circle cx="15.5" cy="15.5" r="5.5"/>',
  texteffect: '<path d="M4 20l6-15 6 15M6.5 14h7"/><path d="M17 5l.8 1.7 1.7.8-1.7.8L17 10l-.8-1.7-1.7-.8 1.7-.8z"/>',
  grab: '<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4M11 9.5a1.5 1.5 0 0 1 3 0V11M14 10.5a1.5 1.5 0 0 1 3 0V13M8 11a1.5 1.5 0 0 0-3 0v3c0 4 2.5 7 6 7h1c3.5 0 5-2.5 5-6v-2"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  eraser: '<path d="M20 20H9L3.5 14.5a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L13 20"/><path d="M7 9l8 8"/>',
  expand: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>',
  shadow: '<circle cx="10" cy="10" r="5.5"/><path d="M15.4 15.4A5.5 5.5 0 0 0 21 10.5M13 20.5A8.5 8.5 0 0 0 20.5 13"/>',
  recolor: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M12 3v18"/><path d="M12 7.5a4.5 4.5 0 0 1 0 9" fill="currentColor"/>',
  shapecrop: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="5.5"/>',
  blurbg: '<circle cx="12" cy="10" r="3.2"/><path d="M6.5 20c.6-3.6 2.7-5.4 5.5-5.4s4.9 1.8 5.5 5.4"/><path d="M3 5h2M19 5h2M3 9h1.5M19.5 9h1.5" stroke-dasharray="0.1 2.6"/>',
  collage: '<rect x="3" y="3" width="8" height="11" rx="1.2"/><rect x="13" y="3" width="8" height="7" rx="1.2"/><rect x="13" y="12" width="8" height="9" rx="1.2"/><rect x="3" y="16" width="8" height="5" rx="1.2"/>',
  scantext: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  adjust: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
};
window.OCX_TOOLS = [
  { id: 'convert-image',      name: 'Convert image',      url: '/studio/convert-image/', status: 'live', access: 'public', icon: 'convert', group: 'make' },
  { id: 'image-to-pdf',       name: 'Image to PDF',       url: '/studio/image-to-pdf/', status: 'live', access: 'public', icon: 'pdf', group: 'make' },
  { id: 'qr-code',            name: 'QR codes',          url: '/studio/qr-code/', status: 'live', access: 'public', icon: 'qr', group: 'make' },
  { id: 'compress-image', name: 'Compress', url: '/studio/compress-image/', status: 'live', access: 'public', icon: 'compress', group: 'make' },
  { id: 'favicon-generator', name: 'Favicons', url: '/studio/favicon-generator/', status: 'live', access: 'public', icon: 'favicon', group: 'make' },
  { id: 'merge-pdf', name: 'Merge PDF', url: '/studio/merge-pdf/', status: 'live', access: 'public', icon: 'merge', group: 'make' },
];
window.OCX_LINKS = [
  { name: 'Templates',            url: '/templates',  icon: 'templates' },
  { name: 'Open-source software', url: '/solutions',  icon: 'apps' },
  { name: 'Guides and tutorials', url: '/learn',      icon: 'learn' }
];
// Menu entries placed under Home. The website lists Design here; Studio Pro (the desktop app) appends its own window.OCX_NAV after this file, which replaces this one.
window.OCX_NAV = window.OCX_NAV || { sections: [
] };
