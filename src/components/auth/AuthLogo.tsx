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
          src="/logo.png"
          alt="hacom HOLDINGS"
          className="mx-auto h-16 sm:h-[72px]"
          style={{ width: "auto", objectFit: "contain" }}
        />
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-[#1d5fd6]">
        hacom PC
      </h1>
      <p className="text-sm font-medium leading-5 text-slate-500">
        {subtitle}
      </p>
    </header>
  );
};
