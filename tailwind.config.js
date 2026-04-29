/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.{html,js}",
    "./views/partials/**/*.html",
    "./public/js/**/*.js",
    "./public/**/*.html",
    "./admin/usuarios**/*.html",
    "./*.{html,js}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}