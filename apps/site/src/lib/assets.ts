const base = import.meta.env.BASE_URL;

export const assetUrl = (path: string) => `${base}${path}`;
export const LOGO_URL = assetUrl('logo.svg');
export const markerImage = (name: string) => assetUrl(`markers/${name}.png`);
