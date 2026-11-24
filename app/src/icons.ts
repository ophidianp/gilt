// Small stroke icons, drawn inline so they take the text colour.
import { s } from './dom';

const icon = (...kids: SVGElement[]) =>
  s('svg', { class: 'ico', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...kids);

export const plusIcon = () => icon(s('line', { x1: 12, y1: 5, x2: 12, y2: 19 }), s('line', { x1: 5, y1: 12, x2: 19, y2: 12 }));
export const xIcon = () => icon(s('line', { x1: 6, y1: 6, x2: 18, y2: 18 }), s('line', { x1: 18, y1: 6, x2: 6, y2: 18 }));
export const backIcon = () => icon(s('polyline', { points: '15,5 8,12 15,19' }));
export const starIcon = () => icon(s('polygon', { points: '12,3.5 14.6,9 20.5,9.6 16,13.6 17.3,19.5 12,16.5 6.7,19.5 8,13.6 3.5,9.6 9.4,9' }));
