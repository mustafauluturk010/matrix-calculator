import { ThemeMode } from '@/types';

export interface AppTheme {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  primaryGradient: [string, string];
  accent: string;
  text: string;
  textSecondary: string;
  border: string;
  danger: string;
  success: string;
  cellBackground: string;
  cellBorder: string;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  background: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EDEFF7',
  primary: '#4F5DFF',
  primaryGradient: ['#6C63FF', '#4F5DFF'],
  accent: '#00C2A8',
  text: '#1A1D29',
  textSecondary: '#6B7080',
  border: '#E1E4EE',
  danger: '#FF5468',
  success: '#22C55E',
  cellBackground: '#F8F9FD',
  cellBorder: '#D8DCEA',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#12131A',
  surface: '#1C1E29',
  surfaceAlt: '#252838',
  primary: '#7C82FF',
  primaryGradient: ['#5B63D3', '#7C82FF'],
  accent: '#2DD4BF',
  text: '#F1F2F8',
  textSecondary: '#9195A6',
  border: '#2E3142',
  danger: '#FF6B7D',
  success: '#4ADE80',
  cellBackground: '#20222F',
  cellBorder: '#333649',
};

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
