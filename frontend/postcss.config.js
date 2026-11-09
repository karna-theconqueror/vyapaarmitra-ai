// Intentionally empty.
// Vite walks up the directory tree looking for a PostCSS config; without a
// local one it picks up an unrelated postcss.config.js in the user's home
// directory and fails to process CSS. This file stops that search here.
export default {}
