export interface JwtPayload {
  sub: string; // User ID / Player ID
  username?: string;
  is_guest?: boolean;
  role?: string;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
