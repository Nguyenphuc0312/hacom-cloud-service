import React from "react";
import { Link } from "react-router-dom";

interface AuthLogoProps {
  subtitle: string;
}

export const AuthLogo: React.FC<AuthLogoProps> = ({ subtitle }) => {
  return (
    <header className="mb-[clamp(12px,2dvh,24px)] text-center">
      <Link to="/" className="mb-2 inline-flex justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25">
        <img
          src="/logo-dung.png"
          alt="Hacom Holdings"
          className="mx-auto w-auto object-contain mix-blend-multiply"
          style={{ height: "clamp(48px, 7dvh, 72px)" }}
        />
      </Link>
      <p className="mt-2 text-sm font-medium leading-5 text-slate-500">
        {subtitle}
      </p>
    </header>
  );
};
