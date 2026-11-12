export interface JwtPayload {
    sub: string;
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
