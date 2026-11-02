declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        auth_user_id: string | null;
        email: string | null;
        organization_id: string;
        role: string;
        is_platform_admin?: boolean;
      };
      tenant?: {
        organization_id: string;
        user_id: string | null;
        role: string;
      };
    }
  }
}

export {};
