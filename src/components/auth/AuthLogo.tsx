import React from "react";
import { Link } from "react-router-dom";

interface AuthLogoProps {
  subtitle: string;
}

export const AuthLogo: React.FC<AuthLogoProps> = ({ subtitle }) => {
  return (
    <header className="mb-6 text-center">
      <Link to="/" className="mb-3 inline-flex justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25">
        <img
          src="/hacom-logo-horizontal.png"
          alt="Hacom Holdings"
          className="mx-auto h-12 w-auto object-contain"
        />
      </Link>
      <p className="mt-4 text-sm font-medium leading-5 text-slate-500">
        {subtitle}
      </p>
    </header>
  );
};
