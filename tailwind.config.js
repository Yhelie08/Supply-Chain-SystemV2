// Tailwind for the React app. Every colour is a CSS variable holding "R G B", so one set of tokens serves light mode,
// dark mode and the per-section "line" colour (src/index.css sets --c-line* from the page's data-line attribute).
// The palette is the Rail Network in DESIGN.md.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ground: c('ground'),
        surface: c('surface'),
        mist: c('mist'),
        shade: c('shade'),
        hair: c('hair'),
        'hair-strong': c('hair-strong'),
        ink: c('ink'),
        'ink-2': c('ink-2'),
        'ink-3': c('ink-3'),
        navy: c('navy'),
        'navy-raised': c('navy-raised'),
        'navy-rule': c('navy-rule'),
        // The current section's line: fill, text on that fill, text on a white surface, and a faint tint.
        line: { DEFAULT: c('line'), ink: c('line-ink'), text: c('line-text'), soft: 'rgb(var(--c-line-text) / 0.1)' },
        ok: { DEFAULT: c('ok'), soft: c('ok-soft'), fill: c('ok-fill') },
        warn: { DEFAULT: c('warn'), soft: c('warn-soft') },
        bad: { DEFAULT: c('bad'), soft: c('bad-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },
        violet: { DEFAULT: c('violet'), soft: c('violet-soft') },
      },
      fontFamily: { sans: ['Overpass', 'Segoe UI', 'system-ui', 'sans-serif'] },
      borderRadius: { control: '5px', panel: '8px', menu: '10px', badge: '11px' },
      boxShadow: {
        panel: '0 1px 2px rgba(27,35,48,.06), 0 3px 10px rgba(27,35,48,.05)',
        lift: '0 16px 40px rgba(27,35,48,.18)',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'drawer-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: { sheet: 'sheet-in .18s ease-out', drawer: 'drawer-in .2s ease-out', fade: 'fade-in .15s ease-out' },
    },
  },
  plugins: [],
};
