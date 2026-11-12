export declare class AuditRepository {
    log(data: {
        user_id?: string;
        action: string;
        ip_address?: string;
        user_agent?: string;
        metadata?: any;
    }): Promise<void>;
}
export declare const auditRepository: AuditRepository;
