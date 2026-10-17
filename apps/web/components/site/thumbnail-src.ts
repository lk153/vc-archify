/** Public path of an artifact's static WebP thumbnail (public/thumbnails). */
export const thumbnailSrc = (slug: string, theme: 'dark' | 'light') => `/thumbnails/${slug}-${theme}.webp`;
