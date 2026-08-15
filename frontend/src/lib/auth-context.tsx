import { createContext, useContext } from "react";

export interface AuthContextValue {
  token: string | null;
  role: "ADMINISTRATOR" | "WORKER" | null;
}

export const AuthContext = createContext<AuthContextValue>({ token: null, role: null });

export function useAuth() {
  return useContext(AuthContext);
}
