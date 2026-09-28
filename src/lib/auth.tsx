import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  displayName: string | null;
  isAdmin: boolean;
  // true, пока роль из user_roles ещё не прочитана. loading при этом уже false:
  // обычные страницы не ждут роль, а админские ждут, чтобы не выкидывать админа при обновлении.
  roleLoading: boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  displayName: null,
  isAdmin: false,
  roleLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setRoleLoading(!!u);
      setUser(u);
      setLoading(false);
      if (u) {
        setDisplayName(u.displayName);
        try {
          const roleSnap = await getDoc(doc(db, "user_roles", u.uid));
          setIsAdmin(roleSnap.exists() && roleSnap.data()?.role === "admin");
        } catch (err) {
          console.error("[auth] failed to fetch user_roles:", err);
          setIsAdmin(false);
        }
        setRoleLoading(false);
      } else {
        setDisplayName(null);
        setIsAdmin(false);
      }
    });
    return unsub;
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, displayName, isAdmin, roleLoading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
