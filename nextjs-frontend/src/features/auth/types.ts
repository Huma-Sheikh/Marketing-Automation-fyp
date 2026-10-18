export type AuthUser = { id: string; email: string; businessName: string };

/** Body returned by POST /auth/login and POST /auth/register. */
export type AuthResponse = { token: string; user: AuthUser };
