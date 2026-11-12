// Loads every module (server/modules/*), which registers each module's workflow hooks, and exports the registry the
// server uses. Nothing here changes when a module grows.
import '../modules/index.mjs';
export { workflows } from './index.mjs';
