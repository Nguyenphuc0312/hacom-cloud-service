export interface BackupLastBackup {
  timestamp: string | null;
  ageHours: number | null;
  status: 'healthy' | 'stale' | 'missing' | 'failed';
  sizeBytes: number | null;
}

export interface BackupRestoreDrill {
  lastSuccess: string | null;
  ageDays: number | null;
  status: 'ok' | 'overdue' | 'missing';
}

export interface BackupRpo {
  currentHours: number | null;
  targetHours: number;
  status: 'ok' | 'warning' | 'breached';
}

export interface BackupStatusResponse {
  lastBackup: BackupLastBackup;
  restoreDrill: BackupRestoreDrill;
  rpo: BackupRpo;
}
