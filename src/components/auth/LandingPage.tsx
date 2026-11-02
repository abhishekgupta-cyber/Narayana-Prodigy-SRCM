import React from 'react';
import { LoginPage } from './LoginPage';
import { User } from '../../types/crm';

interface LandingPageProps {
  onOpenLogin?: () => void;
  onLoginSuccess?: (user: User) => void;
  totalStudents?: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginSuccess }) => {
  return (
    <LoginPage
      onLoginSuccess={(user) => {
        if (onLoginSuccess) onLoginSuccess(user);
      }}
    />
  );
};
