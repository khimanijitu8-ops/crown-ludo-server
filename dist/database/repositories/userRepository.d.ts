export interface UserEntity {
    id: string;
    username: string;
    email?: string;
    password_hash?: string;
    is_guest: boolean;
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    created_at: Date;
    updated_at: Date;
}
export declare class UserRepository {
    findById(id: string): Promise<UserEntity | null>;
    findByUsername(username: string): Promise<UserEntity | null>;
    findByEmail(email: string): Promise<UserEntity | null>;
    create(data: {
        id?: string;
        username: string;
        email?: string;
        password_hash?: string;
        is_guest?: boolean;
    }): Promise<UserEntity>;
    updateStatus(id: string, status: UserEntity['status']): Promise<void>;
}
export declare const userRepository: UserRepository;
