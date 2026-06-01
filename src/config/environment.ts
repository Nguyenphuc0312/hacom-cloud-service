/**
 * Environment detection for admin panel
 * Returns the current environment based on build mode and environment variables
 */

export type Environment = 'development' | 'staging' | 'production';

interface EnvironmentConfig {
  value: Environment;
  label: string;
  color: string;
  bgColor: string;
}

const getEnvironmentFromBuild = (): Environment => {
  if (import.meta.env.PROD) {
    return 'production';
  }
  if (import.meta.env.DEV) {
    return 'development';
  }
  return 'staging';
};

const getEnvironmentConfig = (env: Environment): EnvironmentConfig => {
  const configs: Record<Environment, EnvironmentConfig> = {
    development: {
      value: 'development',
      label: 'Development',
      color: '#6366f1', // indigo
      bgColor: 'rgba(99, 102, 241, 0.12)',
    },
    staging: {
      value: 'staging',
      label: 'Staging',
      color: '#f59e0b', // amber
      bgColor: 'rgba(245, 158, 11, 0.12)',
    },
    production: {
      value: 'production',
      label: 'Production',
      color: '#10b981', // emerald
      bgColor: 'rgba(16, 185, 129, 0.12)',
    },
  };

  return configs[env];
};

export const getCurrentEnvironment = (): Environment => {
  const envOverride = import.meta.env.VITE_APP_ENV;
  if (envOverride === 'production') return 'production';
  if (envOverride === 'staging') return 'staging';
  if (envOverride === 'development') return 'development';

  return getEnvironmentFromBuild();
};

export const getEnvironmentDisplayConfig = (): EnvironmentConfig => {
  return getEnvironmentConfig(getCurrentEnvironment());
};

export const isProduction = (): boolean => getCurrentEnvironment() === 'production';
export const isDevelopment = (): boolean => getCurrentEnvironment() === 'development';
export const isStaging = (): boolean => getCurrentEnvironment() === 'staging';
