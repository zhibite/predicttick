export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  emailVerified: boolean;
}

export interface CurrentUser extends SessionUser {
  access: {
    planCode: string | null;
    accessUntil: number | null;
    isPaid: boolean;
  };
}
