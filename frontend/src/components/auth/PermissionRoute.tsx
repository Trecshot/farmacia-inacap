import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export const PermissionRoute = ({
  permission,
}: {
  permission: string | string[];
}) => {
  const { hasPermission } = useAuth();

  const allowed = Array.isArray(permission)
    ? permission.some((perm) => hasPermission(perm))
    : hasPermission(permission);

  if (!allowed) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
};
