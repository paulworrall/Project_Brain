import type { UserRole } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: UserRole;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: UserRole;
  }
}
