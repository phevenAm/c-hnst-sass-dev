import { useAuth } from "@context/AuthContext";

type WIPProps = {
  children: React.ReactNode;
};

// True where unfinished work is allowed to show: the Vite dev server, or a
// signed-in superadmin (Stephen's test account) on any deployed build.
// Everyone else in production gets nothing.
export function useWipVisible(): boolean {
  const { isSuperAdmin } = useAuth();
  return import.meta.env.DEV || isSuperAdmin;
}

export default function WIP({ children }: WIPProps) {
  if (!useWipVisible()) return null;
  return <>{children}</>;
}
