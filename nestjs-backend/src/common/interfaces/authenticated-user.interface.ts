/** What JwtStrategy.validate() attaches to `request.user` on authenticated routes. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}
