import type { AuthContext } from "../middlewares/authenticate.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
