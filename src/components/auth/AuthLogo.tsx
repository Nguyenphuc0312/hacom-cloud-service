import React from "react";
import { Link } from "react-router-dom";

interface AuthLogoProps {
  subtitle: string;
}

export const AuthLogo: React.FC<AuthLogoProps> = ({ subtitle }) => {
  return (
    <header className="mb-6 text-center">
      <Link to="/" className="inline-block mb-2">
        <img
          src="/logo.png"
          alt="hacom HOLDINGS"
          className="h-20 mx-auto"
          style={{ width: "auto", objectFit: "contain" }}
        />
      </Link>
      <h1 className="text-2xl font-bold text-[#1a73e8] mb-1">
        hacom PC
      </h1>
      <p className="text-sm font-medium text-slate-500">
        {subtitle}
      </p>
    </header>
  );
};
