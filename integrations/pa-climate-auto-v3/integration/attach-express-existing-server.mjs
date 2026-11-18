/* Full mounting adapter for an existing Express-compatible MSI HTTP server.
 * Import this from the CURRENT MSI host's source and call once during its startup:
 *   attachClimateToExistingExpress(app, { dir, adminKey, publicOrigin });
 * This module NEVER calls listen() or starts a new server/service/database.
 * Mount it before JSON body parsers for /climate, to preserve firmware binary uploads.
 */
import { createClimateRoute } from '../server/app.mjs';
export function attachClimateToExistingExpress(app, options) {
  if (!app || typeof app.use !== 'function') throw Error('Existing Express app is required');
  const {route,store} = createClimateRoute(options);
  app.use('/climate', (req,res,next)=>{
    route(req,res,next).catch(next);
  });
  return {store};
}