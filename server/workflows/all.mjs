// Loads every ported workflow module (each one registers its forms) and exports the registry the server uses.
import './inquiry.mjs';
import './purchase-request.mjs';
export { workflows } from './index.mjs';
