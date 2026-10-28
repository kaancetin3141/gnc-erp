// ---------------------------------------------------------------- tür meta + SVG ikonlar

const TYPE_META: Record<string, { label: string; icon: string }> = {
  berber: { label: 'Berber', icon: 'scissors' },
  kuafor: { label: 'Kuaför', icon: 'scissors' },
  disci: { label: 'Dişçi', icon: 'tooth' },
  guzellik: { label: 'Güzellik', icon: 'sparkle' },
  spa: { label: 'Spa', icon: 'lotus' },
  dovme: { label: 'Dövme', icon: 'needle' },
};

function typeMeta(type: string) {
  return TYPE_META[type] || { label: 'İşletme', icon: 'store' };
}

/** İnce SVG çizgi ikonlar — Apple estetiğinde emoji yerine geçer (inline, stroke). */
const SVGS: Record<string, string> = {
  search: '<circle cx="7" cy="7" r="4.7"/><path d="m10.5 10.5 3.3 3.3"/>',
  chevR: '<path d="m5.5 3 4.5 5-4.5 5"/>',
  chevL: '<path d="M10.5 3 6 8l4.5 5"/>',
  arrowL: '<path d="M13.5 8H3m0 0 4-4M3 8l4 4"/>',
  scissors: '<circle cx="4.6" cy="4.6" r="1.9"/><circle cx="4.6" cy="11.4" r="1.9"/><path d="M6.1 5.6 14 12.4M6.1 10.4 14 3.6"/>',
  tooth:
    '<path d="M8 2.3c-1.1 0-1.7.6-2.8.6-1.9 0-2.9 1.4-2.9 3.8 0 2.1.8 3.5 1.2 5.5.3 1.4.5 2.5 1.3 2.5.9 0 1-1.5 1.3-3.1.2-1.1.6-1.9 1.9-1.9s1.7.8 1.9 1.9c.3 1.6.4 3.1 1.3 3.1.8 0 1-1.1 1.3-2.5.4-2 1.2-3.4 1.2-5.5 0-2.4-1-3.8-2.9-3.8-1.1 0-1.7-.6-2.8-.6Z"/>',
  sparkle:
    '<path d="M8 1.8 9.5 5.4 13.1 6.9 9.5 8.4 8 12 6.5 8.4 2.9 6.9 6.5 5.4Z"/><path d="m12.3 10.4.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z"/>',
  lotus:
    '<path d="M8 12.3c-2.4 0-4.4-1-5.4-2.5 1.2-.3 2.3-.1 3.2.4C5.1 8.6 4.6 6.9 4.9 5c1.5.8 2.6 2 3.1 3.6C8.5 7 9.6 5.8 11 5c.3 1.9-.2 3.6-1.2 5.2.9-.5 2-.7 3.2-.4-1 1.5-2.6 2.5-5 2.5Z"/><path d="M3 13.4c1.5 1 3.2 1.5 5 1.5s3.5-.5 5-1.5"/>',
  needle:
    '<path d="M13.4 2.6 6.2 9.8"/><path d="m5.2 8.8-1.9 1.1a1 1 0 0 0-.2 1.6l1.4 1.4a1 1 0 0 0 1.6-.2l1.1-1.9"/><path d="m11.9 3.3 1.5-1.5"/>',
  store:
    '<path d="M2.4 6.4 3.4 3h9.2l1 3.4"/><path d="M2.4 6.4c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.7 1.9 1.7 1.9s1.9-.8 1.9-1.9"/><path d="M4 9.4v4.1h8V9.4"/><path d="M7 13.5v-2.6h2v2.6"/>',
  cal: '<rect x="2.4" y="3.4" width="11.2" height="10.2" rx="2"/><path d="M2.4 6.6h11.2M5.6 2v2.8M10.4 2v2.8"/>',
  clock: '<circle cx="8" cy="8" r="5.7"/><path d="M8 4.9V8l2.1 1.4"/>',
  pin: '<path d="M12.9 6.4a4.9 4.9 0 1 0-9.8 0c0 1.5.7 2.8 1.6 3.8L8 13.8l3.3-3.6c.9-1 1.6-2.3 1.6-3.8Z"/><circle cx="8" cy="6.3" r="1.6"/>',
  phone:
    '<path d="M5.4 2.7c.4-.5 1.1-.6 1.5-.1l1.2 1.4c.4.4.3 1-.1 1.4l-.8.8c-.2.2-.3.5-.1.8.4.7 1 1.4 1.7 2 .6.6 1.3 1.1 2 1.4.3.1.6.1.8-.2l.7-.7c.4-.4 1-.4 1.4 0l1.4 1.2c.5.4.5 1.1.1 1.5l-1 1c-.6.6-1.5.9-2.3.6-2.8-1-5.1-3.2-6.7-6.1-.4-.8-.3-1.7.3-2.4Z"/>',
  star: '<path d="m8 2 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2.4.7-4.3-3.1-3 4.3-.6Z"/>',
  user: '<circle cx="8" cy="5.4" r="3.1"/><path d="M2.7 13.6c.8-2.3 2.9-3.6 5.3-3.6s4.5 1.3 5.3 3.6"/>',
  bolt: '<path d="M8.8 1.6 3.4 9.2h3.5l-.9 5.2 5.5-7.7H7.9Z"/>',
  check: '<path d="m3 8.6 3.3 3.1L13 4.6"/>',
  x: '<path d="m4 4 8 8M12 4 4 12"/>',
  bell: '<path d="M8 2.4a4.1 4.1 0 0 0-4.1 4.1v2.6L2.7 11.6h10.6l-1.2-2.5V6.5A4.1 4.1 0 0 0 8 2.4Z"/><path d="M6.6 13.6a1.5 1.5 0 0 0 2.8 0"/>',
  trash:
    '<path d="M2.8 4.4h10.4"/><path d="M6.4 4.4V3.1c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3"/><path d="M4.3 4.4 4.9 13c0 .6.5 1 1 1h4.2c.5 0 1-.4 1-1l.6-8.6"/>',
  calPlus:
    '<rect x="2.4" y="3.4" width="11.2" height="10.2" rx="2"/><path d="M2.4 6.6h11.2M5.6 2v2.8M10.4 2v2.8M8 8.7v2.6M6.7 10h2.6"/>',
  wa: '<path d="M11.7 9.3c-.3-.2-1.6-.8-1.8-.9-.2-.1-.4 0-.6.2l-.5.6c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-2.6-2.5c-.1-.2-.1-.4.1-.5l.5-.6c.1-.2.2-.4.1-.6l-.7-1.8c-.1-.3-.4-.4-.7-.3-.6.2-1.2.6-1.5 1.2-.5 1-.3 2.2.3 3.5a10 10 0 0 0 3.5 3.9c1.2.8 2.5 1 3.5.5.6-.3 1-.8 1.2-1.4.1-.3 0-.6-.3-.7Z"/><path d="M8 1.7a6.3 6.3 0 0 0-5.4 9.5L1.7 14.3l3.2-.9A6.3 6.3 0 1 0 8 1.7Z"/>',
};

function icon(name: string, size = 16): string {
  const p = SVGS[name] || SVGS.store;
  return `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#1d1d1f"/><text x="50" y="69" font-family="-apple-system,Arial,sans-serif" font-size="54" font-weight="700" fill="#ffffff" text-anchor="middle">G</text></svg>'
  );
