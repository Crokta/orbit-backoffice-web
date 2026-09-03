export default {
  plugins: {
    // Tailwind 4 does its own config in CSS. There is no tailwind.config.js on
    // purpose — the theme comes from the design tokens, and having it in two places
    // is how a token and a utility class drift apart.
    '@tailwindcss/postcss': {},
  },
}
