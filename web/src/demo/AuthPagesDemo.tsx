import { LoginPage as LoginOriginal } from '../features/auth/AuthPages';
import { DemoAccess } from './DemoAccess';

// Sustituto de `features/auth/AuthPages` solo en el build de la demo (alias en vite.config.demo.ts).
export { AuthLayout, RegisterPage } from '../features/auth/AuthPages';

export function LoginPage() {
  return (
    <>
      <DemoAccess />
      <LoginOriginal />
    </>
  );
}
