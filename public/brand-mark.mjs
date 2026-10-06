// The same leaf geometry is used by the website brand and launcher artwork.
export const leafPaths=['M20 4c-8-1-15 3-15 9a6 6 0 0 0 6 6c6 0 9-7 9-15Z','m5 20 10-10'];
export const leafMarkup=leafPaths.map(d=>`<path d="${d}"/>`).join('');
