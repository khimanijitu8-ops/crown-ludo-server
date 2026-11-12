import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username?: string;
        is_guest?: boolean;
    };
}
export declare function expressAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void;
